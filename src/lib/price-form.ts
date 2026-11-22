import { distanceKm, LatLng } from './geo';
import { toGtin13 } from './gtin';
import { Price, Product, Purchase, StoreRef } from './models';
import { productFromSepa } from './product-form';
import { NearBranch, nearestBranches, SepaBranch, SepaProduct } from './sepa';
import { NO_BARRIO, priceStoreRef, storeKey } from './store';

// Funciones puras de la pestaña "Cargar precio" (spec 26): comercio, producto y el precio a registrar.

/** Producto elegido en Cargar precio, antes de guardar */
export type PriceProductChoice =
  | { kind: 'own'; product: Product }
  | { kind: 'sepa'; sepa: SepaProduct }                         // caso A
  | { kind: 'new'; ean?: string; name: string; brand: string }; // casos B (con ean) y C

/** Radio para ofrecer "¿Estás en…?" con la posición del GPS */
const AT_POINT_KM = 0.2;
const AT_POINT_LIMIT = 3;
const RECENT_STORES_LIMIT = 5;

/** Sucursales a menos de 200 m de un punto, de la más cercana, hasta 3 */
export function storesAtPoint(branches: SepaBranch[], point: LatLng): NearBranch[] {
  return nearestBranches(branches, point, AT_POINT_KM, AT_POINT_LIMIT);
}

/** Comercio de una compra guardada como texto; el barrio "Sin especificar" no es un barrio */
function purchaseStores(purchase: Purchase): StoreRef[] {
  const fromItems = purchase.items.flatMap(i => (i.store ? [i.store] : []));
  if (fromItems.length > 0) return fromItems;
  return purchase.store ? [priceStoreRef({ store: purchase.store, barrio: purchase.barrio ?? NO_BARRIO })] : [];
}

/** Comercios de los precios y las compras, del más reciente, distintos por storeKey, hasta 5 */
export function recentStores(prices: Price[], purchases: Purchase[]): StoreRef[] {
  const candidates = [
    ...prices.map(p => ({ time: new Date(p.date).getTime(), stores: p.store?.trim() || p.storeRef ? [priceStoreRef(p)] : [] })),
    ...purchases.map(p => ({ time: new Date(p.date).getTime(), stores: purchaseStores(p) })),
  ].sort((a, b) => b.time - a.time);

  const seen = new Set<string>();
  const result: StoreRef[] = [];
  for (const { stores } of candidates) {
    for (const store of stores) {
      const key = storeKey(store);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(store);
      if (result.length === RECENT_STORES_LIMIT) return result;
    }
  }
  return result;
}

function clean(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** "Otro comercio": nombre, dirección y barrio sin espacios de más; coordenadas redondeadas a 4 decimales */
export function otherStore(input: { name: string; address: string; barrio: string; point?: LatLng }): StoreRef {
  const store: StoreRef = { name: clean(input.name) };
  const address = clean(input.address);
  const barrio = clean(input.barrio);
  if (address) store.address = address;
  if (barrio) store.barrio = barrio;
  if (input.point) {
    store.lat = round4(input.point.lat);
    store.lng = round4(input.point.lng);
  }
  return store;
}

/**
 * El producto a usar: el existente o uno nuevo (isNew). Un EAN que ya tiene un propio (apareció mientras tanto por la
 * sincronización) usa ese propio: el EAN es único entre los productos propios
 */
export function resolvePriceProduct(choice: PriceProductChoice, products: Product[], newId: string):
  { product: Product; isNew: boolean } {
  if (choice.kind === 'own') return { product: choice.product, isNew: false };

  const rawEan = choice.kind === 'sepa' ? choice.sepa.ean : choice.ean;
  const ean = rawEan ? toGtin13(rawEan) ?? rawEan : undefined;
  const existing = ean ? products.find(p => p.ean === ean) : undefined;
  if (existing) return { product: existing, isNew: false };

  if (choice.kind === 'sepa') return { product: productFromSepa({ ...choice.sepa, ean: ean! }, newId), isNew: true };

  const product: Product = { id: newId, name: clean(choice.name) };
  const brand = clean(choice.brand);
  if (brand) product.brand = brand;
  if (ean) product.ean = ean;
  return { product, isNew: true };
}

// ── Precios propios en "Comercios cercanos" ────────────────

export interface OwnNearPrice {
  price: Price;
  distanceKm: number;
}

/**
 * Separa los precios propios (getRecentStorePrices) para la lista de comercios cercanos: los de un comercio con
 * coordenadas dentro del radio van mezclados con los de Precios Claros, con su distancia; el resto (sin coordenadas,
 * fuera del radio o sin ubicación) queda al final, en el mismo orden
 */
export function ownPricesNear(prices: Price[], origin: LatLng | undefined, radiusKm: number | undefined):
  { near: OwnNearPrice[]; rest: Price[] } {
  const near: OwnNearPrice[] = [];
  const rest: Price[] = [];
  for (const price of prices) {
    const { lat, lng } = priceStoreRef(price);
    const distance = origin && radiusKm !== undefined && lat !== undefined && lng !== undefined
      ? distanceKm(origin, { lat, lng })
      : null;
    if (distance !== null && distance <= radiusKm!) near.push({ price, distanceKm: distance });
    else rest.push(price);
  }
  return { near, rest };
}

/** El Price a registrar, con store y barrio a partir del storeRef */
export function priceAt(input: { id: string; productId: string; amount: number; store: StoreRef; date: Date }): Price {
  const { id, productId, amount, store, date } = input;
  return { id, productId, amount, date, barrio: store.barrio || NO_BARRIO, store: store.name, storeRef: store };
}
