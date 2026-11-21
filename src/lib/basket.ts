import { formatMoney } from './format';
import { CartItem, Product } from './models';
import { branchLabel, NearBranch, NearbyPrice, ReferenceSummary } from './sepa';

// ¿Dónde conviene el carrito? (spec 25): compara el carrito entero contra las sucursales cercanas o, sin ubicación,
// contra las cadenas. Funciones puras: los precios los traen los hooks.

// ── Líneas del carrito ─────────────────────────────────────

/** Ítem del carrito que entra en la comparación (tiene EAN) */
export interface BasketLine {
  itemId: string;
  productName: string;
  ean: string;
  quantity: number;
  price: number;              // precio actual en el carrito (0 = sin precio)
  sepaId?: string;            // sucursal en la que está hoy, si tiene
}

/** Ítems del carrito con EAN, en el orden del carrito, y cuántos quedan afuera por no tenerlo */
export function basketLines(cart: CartItem[], products: Product[]): { lines: BasketLine[]; withoutEan: number } {
  const eans = new Map(products.flatMap(p => (p.ean ? [[p.id, p.ean] as const] : [])));
  const lines: BasketLine[] = [];
  let withoutEan = 0;
  for (const item of cart) {
    const ean = eans.get(item.productId);
    if (!ean) {
      withoutEan++;
      continue;
    }
    lines.push({
      itemId: item.id,
      productName: item.productName,
      ean,
      quantity: item.quantity,
      price: item.price,
      ...(item.store?.sepaId && { sepaId: item.store.sepaId }),
    });
  }
  return { lines, withoutEan };
}

// ── Opciones ───────────────────────────────────────────────

/** Una opción de la comparación: una sucursal cercana o una cadena */
export interface BasketOption {
  key: string;                // id de la sucursal o nombre de la cadena
  name: string;
  branch?: NearBranch;        // solo en modo sucursales
  found: { line: BasketLine; price: number }[];
  missing: BasketLine[];
  total: number;
  savings: number | null;     // null si ningún producto que tiene tiene precio actual
  alreadyThere: boolean;      // todos los que tiene ya están en esta sucursal
}

/** Arma la opción con los productos que tiene (precio por EAN); null si no tiene ninguno */
function buildOption(
  key: string, name: string, lines: BasketLine[], priceOf: (ean: string) => number | undefined, branch?: NearBranch,
): BasketOption | null {
  const found: BasketOption['found'] = [];
  const missing: BasketLine[] = [];
  for (const line of lines) {
    const price = priceOf(line.ean);
    if (price === undefined) missing.push(line);
    else found.push({ line, price });
  }
  if (found.length === 0) return null;

  // El ahorro compara los mismos productos: solo los que tienen precio en el carrito (los de $0 no cuentan)
  const priced = found.filter(f => f.line.price > 0);
  const savings = priced.length === 0
    ? null
    : priced.reduce((sum, f) => sum + (f.line.price - f.price) * f.line.quantity, 0);

  return {
    key,
    name,
    ...(branch && { branch }),
    found,
    missing,
    total: found.reduce((sum, f) => sum + f.price * f.line.quantity, 0),
    savings,
    alreadyThere: branch !== undefined && found.every(f => f.line.sepaId === branch.id),
  };
}

/** Más productos primero; a igual cantidad, menor total; después menor distancia (sucursales) y nombre */
function compareOptions(a: BasketOption, b: BasketOption): number {
  return b.found.length - a.found.length
    || a.total - b.total
    || (a.branch && b.branch ? a.branch.distanceKm - b.branch.distanceKm : 0)
    || a.name.localeCompare(b.name, 'es-AR');
}

/**
 * Una opción por sucursal cercana, con el precio de cada producto en esa sucursal (`prices`: por EAN, de
 * getNearbyPrices). Las sucursales sin ninguno de los productos no aparecen
 */
export function compareNearby(
  lines: BasketLine[], prices: Map<string, NearbyPrice[]>, branches: NearBranch[],
): BasketOption[] {
  const byPair = new Map<string, number>();
  for (const [ean, list] of prices) {
    for (const p of list) byPair.set(`${ean}|${p.branch.id}`, p.price);
  }
  return branches
    .flatMap(branch => {
      const priceOf = (ean: string) => byPair.get(`${ean}|${branch.id}`);
      return buildOption(branch.id, branchLabel(branch), lines, priceOf, branch) ?? [];
    })
    .sort(compareOptions);
}

/**
 * Sin ubicación: una opción por cadena, con la mediana nacional de cada producto (`byChain` del resumen de
 * referencia). Una cadena "tiene" un producto si aparece en su byChain; las que no tienen ninguno no aparecen
 */
export function compareChains(lines: BasketLine[], references: Map<string, ReferenceSummary>): BasketOption[] {
  const byPair = new Map<string, number>();
  const chains = new Set<string>();
  for (const line of lines) {
    for (const p of references.get(line.ean)?.byChain ?? []) {
      byPair.set(`${line.ean}|${p.bandera}`, p.mediana);
      chains.add(p.bandera);
    }
  }
  return [...chains]
    .flatMap(chain => buildOption(chain, chain, lines, ean => byPair.get(`${ean}|${chain}`)) ?? [])
    .sort(compareOptions);
}

// ── Textos ─────────────────────────────────────────────────

/** Línea de ahorro de una opción: verde si es más barata que ahora, roja si es más cara, neutra si ya está ahí */
export interface SavingsLine {
  text: string;
  tone: 'cheaper' | 'pricier' | 'here';
}

/**
 * "$X menos que ahora" / "$X más que ahora" (con ", en los N que tiene" si no tiene todos los `totalLines`), o "Tu
 * carrito ya está en este comercio"; null sin diferencia o sin precios actuales para comparar
 */
export function savingsLine(option: BasketOption, totalLines: number): SavingsLine | null {
  if (option.alreadyThere) return { text: 'Tu carrito ya está en este comercio', tone: 'here' };
  // Menos de medio centavo es redondeo de las sumas: formatMoney lo mostraría como $0,00
  if (option.savings === null || Math.abs(option.savings) < 0.005) return null;
  const amount = `$${formatMoney(Math.abs(option.savings))}`;
  const count = option.found.length;
  const some = count >= totalLines ? '' : count === 1 ? ', en el 1 que tiene' : `, en los ${count} que tiene`;
  return option.savings > 0
    ? { text: `${amount} menos que ahora${some}`, tone: 'cheaper' }
    : { text: `${amount} más que ahora${some}`, tone: 'pricier' };
}

/** "1 producto sin código no se puede comparar" / "N productos sin código no se pueden comparar"; null con 0 */
export function withoutEanLabel(count: number): string | null {
  if (count === 0) return null;
  return count === 1
    ? '1 producto sin código no se puede comparar'
    : `${count} productos sin código no se pueden comparar`;
}
