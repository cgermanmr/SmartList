import { formatIsoDate, formatPct } from './format';
import { toGtin13 } from './gtin';
import { supabase } from './supabase';

// Consultas al catálogo SEPA (tabla pública sepa_productos). Errores de red o de Supabase → la promesa rechaza,
// sin los reintentos de supabase-js: sin conexión el error se muestra enseguida y no a los 7 s.

export interface SepaProduct {
  ean: string;
  description: string;
  brand: string | null;
  size: number | null;
  sizeUnit: 'g' | 'ml' | 'u' | null;
  banderas: number;
}

export interface SepaProductRow {
  ean: string;
  descripcion: string;
  marca: string | null;
  cantidad: number | string | null;  // numeric de Postgres
  unidad: 'g' | 'ml' | 'u' | null;
  banderas: number;
}

/** Precio de un producto en una cadena (sepa_precios con el nombre de sepa_banderas) */
export interface SepaPrice {
  ean: string;
  bandera: string;          // nombre de sepa_banderas ("Coto", "Hipermercado Carrefour")
  minimo: number;
  mediana: number;          // precio de la cadena: mediana entre sus sucursales
  maximo: number;
  sucursales: number;
  actualizado: string;      // 'YYYY-MM-DD'
}

/** Resumen de los precios de un producto en todas las cadenas */
export interface ReferenceSummary {
  reference: number;        // promedio de las medianas por cadena
  cheapest: SepaPrice;      // cadena con la menor mediana (la primera de byChain)
  byChain: SepaPrice[];     // ordenadas por mediana, de menor a mayor; a igual mediana, por nombre
  range: [number, number];  // menor mínimo y mayor máximo
  chains: number;
  date: string;             // actualizado más reciente
  stale: boolean;           // date con más de 7 días
}

/** Fila de sepa_precios con el nombre de la bandera (join many-to-one: un objeto) */
export interface SepaPriceRow {
  ean: string;
  minimo: number | string;   // numeric de Postgres
  mediana: number | string;
  maximo: number | string;
  sucursales: number;
  actualizado: string;
  sepa_banderas: { nombre: string } | null;
}

/** Precio propio frente a la referencia: por debajo (< −5 %), en línea (±5 %) o por encima (> +5 %) */
export type ReferenceStatus = 'below' | 'inline' | 'above';

const COLUMNS = 'ean, descripcion, marca, cantidad, unidad, banderas';
const PRICE_COLUMNS = 'ean, minimo, mediana, maximo, sucursales, actualizado, sepa_banderas(nombre)';
const MAX_RESULTS = 20;
const MIN_SEARCH_CHARS = 3;
/** Días a partir de los cuales los datos de la referencia se consideran viejos */
const STALE_DAYS = 7;
/** Margen, en %, dentro del cual el precio propio está "en línea" con la referencia */
const INLINE_MARGIN = 5;
/** Valores de relleno del SEPA en el campo marca: no identifican ninguna marca */
const NOT_A_BRAND = new Set(['S/D', 'SIN MARCA', 'GENERICO', '.']);

/** false si faltan las variables de Supabase: la UI no muestra nada del catálogo */
export const sepaEnabled = supabase !== null;

// ── Consultas ─────────────────────────────────────────────

/** Texto de búsqueda (mín. 3 caracteres sin espacios) o EAN; hasta 20 resultados, primero los que están en más cadenas */
export async function searchSepaProducts(query: string): Promise<SepaProduct[]> {
  if (!supabase || !isSearchableQuery(query)) return [];
  const text = query.trim();
  const ean = /^[0-9]+$/.test(text) ? toGtin13(text) : null;

  let request = supabase.from('sepa_productos').select(COLUMNS);
  if (ean) {
    request = request.eq('ean', ean);
  } else {
    for (const word of text.split(/\s+/)) request = request.or(wordFilter(word));
  }

  const { data, error } = await request
    .order('banderas', { ascending: false })
    .order('descripcion')
    .limit(MAX_RESULTS)
    .retry(false);
  if (error) throw error;
  return data.map(toSepaProduct);
}

export async function getSepaProduct(ean: string): Promise<SepaProduct | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('sepa_productos').select(COLUMNS).eq('ean', ean).maybeSingle().retry(false);
  if (error) throw error;
  return data ? toSepaProduct(data) : null;
}

// ── Precios por cadena ─────────────────────────────────────
// Caché de módulo por EAN, válida durante la sesión: guarda la promesa, así dos pantallas que piden el mismo EAN a la
// vez comparten la consulta, y también los "sin precios" ([]). Si la consulta falla, sus EAN salen de la caché.

const priceCache = new Map<string, Promise<SepaPrice[]>>();

/** Precios por cadena de varios EAN: una sola consulta con los que no están en la caché; sin precios → [] */
export async function getSepaPrices(eans: string[]): Promise<Map<string, SepaPrice[]>> {
  if (!supabase) return new Map();
  const unique = [...new Set(eans)];
  const missing = unique.filter(ean => !priceCache.has(ean));

  if (missing.length > 0) {
    const request = fetchSepaPrices(missing);
    for (const ean of missing) {
      const entry = request.then(byEan => byEan.get(ean) ?? []);
      priceCache.set(ean, entry);
      entry.catch(() => {
        if (priceCache.get(ean) === entry) priceCache.delete(ean);
      });
    }
  }

  const entries = await Promise.all(unique.map(async ean => [ean, await priceCache.get(ean)!] as const));
  return new Map(entries);
}

async function fetchSepaPrices(eans: string[]): Promise<Map<string, SepaPrice[]>> {
  if (!supabase) return new Map();
  const { data, error } = await supabase.from('sepa_precios').select(PRICE_COLUMNS).in('ean', eans).retry(false);
  if (error) throw error;
  return groupSepaPrices(data as unknown as SepaPriceRow[]);
}

// ── Funciones puras ─────────────────────────────────────────

/** true si el texto alcanza para consultar el catálogo: al menos 3 caracteres sin contar espacios */
export function isSearchableQuery(query: string): boolean {
  return query.replace(/\s/g, '').length >= MIN_SEARCH_CHARS;
}

/** Fila de sepa_productos → SepaProduct */
export function toSepaProduct(row: SepaProductRow): SepaProduct {
  const hasSize = row.cantidad !== null && row.unidad !== null;
  return {
    ean: row.ean,
    description: row.descripcion,
    brand: row.marca && !NOT_A_BRAND.has(row.marca.trim().toUpperCase()) ? row.marca : null,
    size: hasSize ? Number(row.cantidad) : null,
    sizeUnit: hasSize ? row.unidad : null,
    banderas: row.banderas,
  };
}

/** Filas de sepa_precios → precios agrupados por EAN; sin el nombre de la bandera, la fila se descarta */
export function groupSepaPrices(rows: SepaPriceRow[]): Map<string, SepaPrice[]> {
  const byEan = new Map<string, SepaPrice[]>();
  for (const row of rows) {
    if (!row.sepa_banderas) continue;
    const price: SepaPrice = {
      ean: row.ean,
      bandera: row.sepa_banderas.nombre,
      minimo: Number(row.minimo),
      mediana: Number(row.mediana),
      maximo: Number(row.maximo),
      sucursales: row.sucursales,
      actualizado: row.actualizado,
    };
    byEan.set(row.ean, [...(byEan.get(row.ean) ?? []), price]);
  }
  return byEan;
}

/** Nombre sugerido: descripción en formato título, sin la marca repetida al final */
export function suggestedName(p: SepaProduct): string {
  const text = normalizeText(p.description);
  const brand = p.brand ? normalizeText(p.brand) : '';
  const name = brand && text.endsWith(` ${brand}`) ? text.slice(0, -brand.length - 1) : text;
  return name.replace(/(^|\s)(\p{L})/gu, (_match, space: string, letter: string) => space + letter.toLocaleUpperCase('es-AR'));
}

// ── Precio de referencia ─────────────────────────────────────

/**
 * Promedio de los precios de las cadenas (cada cadena cuenta una vez, con su mediana), la lista ordenada por precio
 * y la fecha más reciente; null si no hay precios
 */
export function referenceSummary(prices: SepaPrice[], today: Date): ReferenceSummary | null {
  if (prices.length === 0) return null;
  const byChain = [...prices].sort((a, b) => a.mediana - b.mediana || a.bandera.localeCompare(b.bandera, 'es-AR'));
  const date = prices.reduce((latest, p) => (p.actualizado > latest ? p.actualizado : latest), prices[0].actualizado);
  return {
    reference: prices.reduce((sum, p) => sum + p.mediana, 0) / prices.length,
    cheapest: byChain[0],
    byChain,
    range: [Math.min(...prices.map(p => p.minimo)), Math.max(...prices.map(p => p.maximo))],
    chains: prices.length,
    date,
    stale: daysSince(date, today) > STALE_DAYS,
  };
}

/** (precio − referencia) / referencia × 100 */
export function vsReference(price: number, reference: number): number {
  return ((price - reference) / reference) * 100;
}

/** Ubica la diferencia de vsReference respecto del margen de ±5 % */
export function referenceStatus(pct: number): ReferenceStatus {
  if (pct < -INLINE_MARGIN) return 'below';
  if (pct > INLINE_MARGIN) return 'above';
  return 'inline';
}

/** "9,9 % por debajo de la referencia", "En línea con la referencia" o "8 % por encima de la referencia" */
export function referenceLabel(pct: number): string {
  const status = referenceStatus(pct);
  if (status === 'inline') return 'En línea con la referencia';
  return `${formatPct(Math.abs(pct))} por ${status === 'below' ? 'debajo' : 'encima'} de la referencia`;
}

/** Versión corta para el carrito: "8 % abajo", "en línea" o "8 % arriba" */
export function referenceShortLabel(pct: number): string {
  const status = referenceStatus(pct);
  if (status === 'inline') return 'en línea';
  return `${formatPct(Math.abs(pct))} ${status === 'below' ? 'abajo' : 'arriba'}`;
}

/** "Actualizado hoy", "Actualizado ayer", "Actualizado hace N días" o, con stale, "Datos del dd/mm/aaaa" */
export function freshnessLabel(summary: Pick<ReferenceSummary, 'date' | 'stale'>, today: Date): string {
  if (summary.stale) return `Datos del ${formatIsoDate(summary.date)}`;
  const days = daysSince(summary.date, today);
  if (days <= 0) return 'Actualizado hoy';
  if (days === 1) return 'Actualizado ayer';
  return `Actualizado hace ${days} días`;
}

/** Días entre una fecha 'YYYY-MM-DD' y el día local de `today` (0 = hoy) */
export function daysSince(date: string, today: Date): number {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((todayUtc - Date.UTC(year, month - 1, day)) / 86_400_000);
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-AR');
}

/** Filtro `or` de PostgREST: la palabra está en la descripción o en la marca; las comillas protegen `,` `(` `)` */
export function wordFilter(word: string): string {
  const pattern = accentPattern(word).replace(/[\\"]/g, '\\$&');
  return `descripcion.imatch."${pattern}",marca.imatch."${pattern}"`;
}

/** Patrón de una palabra que ignora acentos y escapa los caracteres especiales de regex */
export function accentPattern(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\\.*+?^$()[\]{}|]/g, '\\$&')
    .replace(/[aeioun]/g, letter => ACCENT_CLASSES[letter]);
}

const ACCENT_CLASSES: Record<string, string> = {
  a: '[aá]', e: '[eé]', i: '[ií]', o: '[oó]', u: '[uúü]', n: '[nñ]',
};
