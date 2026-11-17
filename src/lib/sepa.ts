import { formatIsoDate, formatPct } from './format';
import { distanceKm, LatLng } from './geo';
import { toGtin13 } from './gtin';
import { StoreRef } from './models';
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

// ── Sucursales y precios cercanos ────────────────────────────
// La app baja todas las sucursales una vez y calcula las distancias en el navegador: a Supabase solo le llegan los
// id de las sucursales elegidas, nunca las coordenadas del usuario.

export interface SepaBranch {
  id: string;               // '10-1-123'
  chain: string;            // nombre de la bandera
  name: string;
  address: string | null;
  barrio: string | null;
  localidad: string | null;
  provincia: string | null; // código ISO del archivo: 'AR-C', 'AR-B'…
  lat: number | null;
  lng: number | null;
  updated: string;          // 'YYYY-MM-DD': fecha del archivo con el que se cargó
}

export type NearBranch = SepaBranch & { distanceKm: number };

export interface NearbyPrice {
  ean: string;
  branch: SepaBranch;
  price: number;
  distanceKm: number;
}

/** Lugar para elegir la ubicación a mano: un barrio o una localidad con sucursales */
export interface SepaLocality {
  label: string;            // "Caballito, CABA"
  lat: number;
  lng: number;
  branches: number;
}

/** Fila de sepa_sucursales con el nombre de la bandera */
export interface SepaBranchRow {
  id: string;
  nombre: string;
  direccion: string | null;
  barrio: string | null;
  localidad: string | null;
  provincia: string | null;
  lat: number | null;
  lng: number | null;
  actualizado: string;
  sepa_banderas: { nombre: string } | null;
}

const BRANCH_COLUMNS = 'id, nombre, direccion, barrio, localidad, provincia, lat, lng, actualizado, sepa_banderas(nombre)';
/** Tope de filas por pedido de la API de Supabase */
const BRANCH_PAGE = 1000;
/** Topes de sepa_precios_en_sucursales: lo que se pase de más, la función lo ignora */
export const MAX_NEAR_BRANCHES = 40;
const MAX_NEARBY_EANS = 20;

let branchCache: Promise<SepaBranch[]> | null = null;

/** Todas las sucursales, una vez por sesión (caché de módulo; si la descarga falla, se vuelve a intentar) */
export function getSepaBranches(): Promise<SepaBranch[]> {
  if (!supabase) return Promise.resolve([]);
  if (!branchCache) {
    const request = fetchSepaBranches();
    branchCache = request;
    request.catch(() => {
      if (branchCache === request) branchCache = null;
    });
  }
  return branchCache;
}

async function fetchSepaBranches(): Promise<SepaBranch[]> {
  if (!supabase) return [];
  const rows: SepaBranchRow[] = [];
  for (let from = 0; ; from += BRANCH_PAGE) {
    const { data, error } = await supabase
      .from('sepa_sucursales')
      .select(BRANCH_COLUMNS)
      .order('id')
      .range(from, from + BRANCH_PAGE - 1)
      .retry(false);
    if (error) throw error;
    rows.push(...(data as unknown as SepaBranchRow[]));
    if (data.length < BRANCH_PAGE) break;
  }
  return rows.flatMap(row => toSepaBranch(row) ?? []);
}

// Caché por EAN + sucursal, válida durante la sesión: guarda la promesa y también los "no lo informa" (null). Cambiar
// de ubicación o de radio solo pide lo que falta. Si la consulta falla, sus pares salen de la caché.
const nearbyCache = new Map<string, Promise<number | null>>();

function nearbyKey(ean: string, branchId: string): string {
  return `${ean}|${branchId}`;
}

/**
 * Precios de esos EAN en esas sucursales (hasta 40), ordenados con sortNearbyPrices; sin precios → []. Una sola
 * llamada con los EAN que tienen algún par sin consultar (de a 20, el tope de la función de la base)
 */
export async function getNearbyPrices(eans: string[], branches: NearBranch[]): Promise<Map<string, NearbyPrice[]>> {
  if (!supabase) return new Map();
  const unique = [...new Set(eans)];
  const near = branches.slice(0, MAX_NEAR_BRANCHES);
  const ids = near.map(b => b.id);
  const missing = near.length === 0
    ? []
    : unique.filter(ean => ids.some(id => !nearbyCache.has(nearbyKey(ean, id))));

  for (let from = 0; from < missing.length; from += MAX_NEARBY_EANS) {
    const chunk = missing.slice(from, from + MAX_NEARBY_EANS);
    const request = fetchNearbyPrices(chunk, ids);
    for (const ean of chunk) {
      for (const id of ids) {
        const key = nearbyKey(ean, id);
        if (nearbyCache.has(key)) continue;
        const entry = request.then(byPair => byPair.get(key) ?? null);
        nearbyCache.set(key, entry);
        entry.catch(() => {
          if (nearbyCache.get(key) === entry) nearbyCache.delete(key);
        });
      }
    }
  }

  const entries = await Promise.all(unique.map(async ean => {
    const prices = await Promise.all(near.map(async branch => {
      const price = await nearbyCache.get(nearbyKey(ean, branch.id))!;
      return price === null ? null : toNearbyPrice(ean, branch, price);
    }));
    return [ean, sortNearbyPrices(prices.filter(p => p !== null))] as const;
  }));
  return new Map(entries);
}

async function fetchNearbyPrices(eans: string[], branchIds: string[]): Promise<Map<string, number>> {
  if (!supabase) return new Map();
  const { data, error } = await supabase
    .rpc('sepa_precios_en_sucursales', { p_eans: eans, p_sucursales: branchIds })
    .retry(false);
  if (error) throw error;
  const rows = data as { ean: string; sucursal: string; precio: number | string }[];
  return new Map(rows.map(row => [nearbyKey(row.ean, row.sucursal), Number(row.precio)]));
}

function toNearbyPrice(ean: string, near: NearBranch, price: number): NearbyPrice {
  const { distanceKm: distance, ...branch } = near;
  return { ean, branch, price, distanceKm: distance };
}

/** Fila de sepa_sucursales → SepaBranch; sin el nombre de la bandera, null */
export function toSepaBranch(row: SepaBranchRow): SepaBranch | null {
  if (!row.sepa_banderas) return null;
  return {
    id: row.id,
    chain: row.sepa_banderas.nombre,
    name: row.nombre,
    address: row.direccion,
    barrio: row.barrio,
    localidad: row.localidad,
    provincia: row.provincia,
    lat: row.lat,
    lng: row.lng,
    updated: row.actualizado,
  };
}

/** Las `limit` sucursales con coordenadas dentro del radio, de la más cercana a la más lejana */
export function nearestBranches(
  branches: SepaBranch[], origin: LatLng, radiusKm: number, limit = MAX_NEAR_BRANCHES,
): NearBranch[] {
  return branches
    .flatMap(branch => {
      if (branch.lat === null || branch.lng === null) return [];
      const distance = distanceKm(origin, { lat: branch.lat, lng: branch.lng });
      return distance <= radiusKm ? [{ ...branch, distanceKm: distance }] : [];
    })
    .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/** Ordena por precio y, a igual precio, por distancia */
export function sortNearbyPrices(prices: NearbyPrice[]): NearbyPrice[] {
  return [...prices].sort((a, b) =>
    a.price - b.price || a.distanceKm - b.distanceKm || a.branch.id.localeCompare(b.branch.id));
}

/** Fecha más reciente de los datos de esas sucursales ('YYYY-MM-DD'); null sin sucursales */
export function latestBranchDate(branches: Pick<SepaBranch, 'updated'>[]): string | null {
  return branches.reduce<string | null>((latest, b) => (latest === null || b.updated > latest ? b.updated : latest), null);
}

/** true si la fecha de los datos tiene más de 7 días */
export function isStaleDate(date: string, today: Date): boolean {
  return daysSince(date, today) > STALE_DAYS;
}

// ── Lugares para elegir la ubicación a mano ──────────────────
// La columna localidad del SEPA no alcanza: en CABA casi todo dice "Capital Federal" y hay cadenas que cargan la
// provincia como localidad y el lugar real en barrio. Por eso el lugar es el barrio si la sucursal lo tiene y, si
// no, la localidad.

/** Nombre corto de cada provincia para la etiqueta del lugar */
const PROVINCES: Record<string, string> = {
  'AR-A': 'Salta', 'AR-B': 'Buenos Aires', 'AR-C': 'CABA', 'AR-D': 'San Luis', 'AR-E': 'Entre Ríos',
  'AR-F': 'La Rioja', 'AR-G': 'Santiago del Estero', 'AR-H': 'Chaco', 'AR-J': 'San Juan', 'AR-K': 'Catamarca',
  'AR-L': 'La Pampa', 'AR-M': 'Mendoza', 'AR-N': 'Misiones', 'AR-P': 'Formosa', 'AR-Q': 'Neuquén',
  'AR-R': 'Río Negro', 'AR-S': 'Santa Fe', 'AR-T': 'Tucumán', 'AR-U': 'Chubut', 'AR-V': 'Tierra del Fuego',
  'AR-W': 'Corrientes', 'AR-X': 'Córdoba', 'AR-Y': 'Jujuy', 'AR-Z': 'Santa Cruz',
};

/** Formas en que el SEPA nombra a la ciudad de Buenos Aires entera (ya en minúsculas y sin acentos) */
const CABA_NAMES = /^(capital federal|caba|ciudad autonoma( de)? buenos aires|ciudad de buenos aires)$/;
const CABA_LABEL = 'Ciudad de Buenos Aires';

/** Minúsculas, sin acentos, sin aclaraciones entre paréntesis ("(901)") ni espacios de más */
function placeKey(name: string): string {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Lugares con sucursales, para elegir la ubicación a mano, ordenados por nombre. El lugar es el barrio (o la
 * localidad si no tiene) dentro de su provincia, sin distinguir mayúsculas ni acentos; se muestra con la forma más
 * usada. El punto es la mediana de las coordenadas: una sucursal mal cargada no lo corre
 */
export function branchLocalities(branches: SepaBranch[]): SepaLocality[] {
  interface Place { province: string; names: Map<string, number>; lats: number[]; lngs: number[] }
  const places = new Map<string, Place>();
  for (const branch of branches) {
    if (branch.lat === null || branch.lng === null) continue;
    const name = (branch.barrio ?? branch.localidad ?? '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    const key = placeKey(name);
    if (!key) continue;
    const province = branch.provincia ? PROVINCES[branch.provincia] ?? '' : '';
    const caba = province === 'CABA' && CABA_NAMES.test(key);
    const id = `${province}|${caba ? 'caba' : key}`;
    const place: Place = places.get(id) ?? { province, names: new Map(), lats: [], lngs: [] };
    const shown = caba ? CABA_LABEL : name;
    place.names.set(shown, (place.names.get(shown) ?? 0) + 1);
    place.lats.push(branch.lat);
    place.lngs.push(branch.lng);
    places.set(id, place);
  }

  return [...places.values()]
    .map(place => {
      const name = [...place.names].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es-AR'))[0][0];
      const repeated = placeKey(name) === placeKey(place.province) || name === CABA_LABEL;
      return {
        label: place.province && !repeated ? `${name}, ${place.province}` : name,
        lat: median(place.lats),
        lng: median(place.lngs),
        branches: place.lats.length,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'es-AR'));
}

// ── Comercio del carrito ─────────────────────────────────────

/** "<cadena> — <sucursal>"; solo la sucursal si su nombre ya empieza con el de la cadena ("Jumbo Morón") */
export function branchLabel(branch: Pick<SepaBranch, 'chain' | 'name'>): string {
  const name = branch.name.trim();
  if (!name) return branch.chain;
  return placeKey(name).startsWith(placeKey(branch.chain)) ? name : `${branch.chain} — ${name}`;
}

/** StoreRef del carrito a partir de una sucursal; el barrio es el de la sucursal o, si no tiene, su localidad */
export function storeRefFromBranch(branch: SepaBranch): StoreRef {
  const store: StoreRef = { name: branchLabel(branch), sepaId: branch.id };
  const barrio = branch.barrio ?? branch.localidad;
  if (barrio) store.barrio = barrio;
  if (branch.address) store.address = branch.address;
  if (branch.lat !== null && branch.lng !== null) {
    store.lat = branch.lat;
    store.lng = branch.lng;
  }
  return store;
}
