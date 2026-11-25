import { distanceKm, formatDistance, LatLng } from './geo';

// Direcciones de un comercio nuevo (spec 35): sugerencias mientras se escribe (Georef, datos.gob.ar) y dirección de un
// punto (Nominatim, OpenStreetMap). A Georef nunca le llegan coordenadas: recibe el texto y los ids de los
// departamentos más cercanos, elegidos en el dispositivo, y la distancia se calcula acá. A Nominatim le llega el punto
// del comercio, solo cuando el usuario lo pide.

/** Partido, departamento o comuna, con su centro */
export interface Department {
  id: string;
  lat: number;
  lng: number;
}

export interface AddressSuggestion {
  street: string;                 // "Av. Caseros"
  number?: string;                // "2500"; sin él es una calle
  place: string;                  // "Comuna 4, CABA"
  locality: string;               // para acotar la búsqueda de la altura
  point: LatLng | null;           // sin altura: la cuadra más cercana, solo para centrar el mapa
  distanceKm: number | null;
}

/** Cantidad de sugerencias que se ofrecen */
export const MAX_SUGGESTIONS = 6;

// ── Texto escrito ────────────────────────────────────────────

export interface AddressQuery {
  text: string;
  locality?: string;
  number?: string;
}

function clean(value: string): string {
  // Georef trae algún guion invisible ("Juní­n")
  return value.replace(/­/g, '').trim().replace(/\s+/g, ' ');
}

/** Con solo esto adelante, el número es el nombre de la calle: "Calle 7", "Av. 7", "Diag. 74" */
const ONLY_STREET_KIND = /^(calle|c|avenida|av|avda|diagonal|diag|pasaje|pje|ruta)\.?$/i;

/** "Caseros 2500, Olivos" → texto, localidad (lo que sigue a la última coma) y altura */
export function parseAddressQuery(text: string): AddressQuery {
  const comma = text.lastIndexOf(',');
  const locality = comma >= 0 ? clean(text.slice(comma + 1)) : '';
  const street = clean(comma >= 0 ? text.slice(0, comma) : text);
  const query: AddressQuery = { text: street, ...(locality && { locality }) };
  const match = /^(.+?)\s+(?:(?:n[°º]|nro\.?|al)\s*)?(\d{1,5})$/i.exec(street);
  if (!match || ONLY_STREET_KIND.test(match[1])) return query;
  return { ...query, text: match[1], number: match[2] };
}

/**
 * Con una calle elegida: la altura escrita después de ella ('' si todavía no hay). null si cambió el nombre de la
 * calle o hay otra cosa además del número
 */
export function numberAfterStreet(text: string, street: string): string | null {
  const written = clean(text);
  if (!written.toLowerCase().startsWith(street.toLowerCase())) return null;
  const match = /^(?: (\d{1,5}))?$/.exec(written.slice(street.length));
  return match ? match[1] ?? '' : null;
}

// ── Departamentos ────────────────────────────────────────────

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function field(value: unknown, key: string): unknown {
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}

function textField(value: unknown, key: string): string {
  const content = field(value, key);
  return typeof content === 'string' ? clean(content) : '';
}

/** Respuesta cruda de /departamentos; null si no trae ninguno válido */
export function parseDepartments(raw: unknown): Department[] | null {
  const rows = field(raw, 'departamentos');
  if (!Array.isArray(rows)) return null;
  const departments: Department[] = [];
  for (const row of rows as unknown[]) {
    const id = textField(row, 'id');
    const lat = field(row, 'centroide_lat');
    const lng = field(row, 'centroide_lon');
    if (id && isFiniteNumber(lat) && isFiniteNumber(lng)) departments.push({ id, lat, lng });
  }
  return departments.length > 0 ? departments : null;
}

/** Ids de los departamentos de centro más cercano: lo único que se envía de la zona */
export function nearestDepartments(departments: Department[], origin: LatLng, max: number = 15): string[] {
  return departments
    .map(d => ({ id: d.id, km: distanceKm(origin, d) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, max)
    .map(d => d.id);
}

// ── Sugerencias ──────────────────────────────────────────────

const ABBREVIATIONS: Record<string, string> = {
  AV: 'Av.', DR: 'Dr.', GRL: 'Gral.', GRAL: 'Gral.', PTE: 'Pte.', CNEL: 'Cnel.', DIAG: 'Diag.',
};

const LOWERCASE = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e']);

const ROMAN = /^X{0,3}(IX|IV|V?I{0,3})$/;

/** "AV CASEROS" → "Av. Caseros" */
export function formatStreet(raw: string): string {
  return clean(raw).split(' ').map((word, i) => {
    const upper = word.toUpperCase();
    if (ABBREVIATIONS[upper]) return ABBREVIATIONS[upper];
    if (upper.length > 1 && ROMAN.test(upper)) return upper;
    const lower = word.toLowerCase();
    if (i > 0 && LOWERCASE.has(lower)) return lower;
    return lower.replace(/(^|['’-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
  }).join(' ');
}

const CABA = 'CABA';

/** Nombres largos de provincias, como se muestran */
const PROVINCES: Record<string, string> = {
  'Ciudad Autónoma de Buenos Aires': CABA,
  'Tierra del Fuego, Antártida e Islas del Atlántico Sur': 'Tierra del Fuego',
};

/** "Vicente López, Buenos Aires": sin partes repetidas ("CABA", no "CABA, CABA") */
function joinPlace(...parts: string[]): string {
  return parts.filter((part, i) => part && !parts.slice(i + 1).includes(part)).join(', ');
}

/**
 * Respuesta cruda de Georef → sugerencias: una por calle, altura y localidad (la cuadra más cercana), de la más cercana
 * a la más lejana o, sin referencia, en el orden de Georef; hasta 6. Con `only`, solo las de esa calle y localidad
 */
export function parseGeoref(raw: unknown, origin: LatLng | null, only?: AddressSuggestion): AddressSuggestion[] {
  const rows = field(raw, 'direcciones');
  if (!Array.isArray(rows)) return [];

  const groups = new Map<string, AddressSuggestion>();
  for (const row of rows as unknown[]) {
    const name = textField(field(row, 'calle'), 'nombre');
    if (!name) continue;
    const street = formatStreet(name);
    const department = textField(field(row, 'departamento'), 'nombre');
    const provinceName = textField(field(row, 'provincia'), 'nombre');
    const province = PROVINCES[provinceName] ?? provinceName;
    // Georef encuentra la ciudad como "CABA" y no por el nombre completo
    const locality = province === CABA ? CABA : textField(field(row, 'localidad_censal'), 'nombre') || department;
    const streetPlace = joinPlace(locality, province);
    if (only && (street !== only.street || streetPlace !== joinPlace(only.locality, provinceOf(only)))) continue;

    const value = field(field(row, 'altura'), 'valor');
    const number = isFiniteNumber(value) ? String(value) : undefined;
    const lat = field(field(row, 'ubicacion'), 'lat');
    const lng = field(field(row, 'ubicacion'), 'lon');
    const point = isFiniteNumber(lat) && isFiniteNumber(lng) ? { lat, lng } : null;
    const suggestion: AddressSuggestion = {
      street,
      ...(number && { number }),
      place: number ? joinPlace(locality === CABA ? '' : locality, department, province) : streetPlace,
      locality,
      point,
      distanceKm: origin && point ? distanceKm(origin, point) : null,
    };

    const localityId = textField(field(row, 'localidad_censal'), 'id') || streetPlace;
    const key = [street, number ?? '', localityId].join('|');
    const current = groups.get(key);
    // Volver a escribir una clave conserva su lugar: sin referencia queda el orden de Georef
    if (!current || order(suggestion) < order(current)) groups.set(key, suggestion);
  }

  const suggestions = [...groups.values()];
  if (origin) suggestions.sort((a, b) => order(a) - order(b));
  return suggestions.slice(0, MAX_SUGGESTIONS);
}

/** Distancia para ordenar; sin ella, al final */
function order(suggestion: AddressSuggestion): number {
  return suggestion.distanceKm ?? Number.MAX_VALUE;
}

function provinceOf(suggestion: AddressSuggestion): string {
  return suggestion.place.slice(suggestion.place.lastIndexOf(',') + 1).trim();
}

/** Renglón secundario: "Comuna 4, CABA · a 250 m"; `approx` si la referencia es una localidad */
export function suggestionDetail(suggestion: AddressSuggestion, approx: boolean): string {
  if (suggestion.distanceKm === null) return suggestion.place;
  return `${suggestion.place} · ${approx ? 'aprox. ' : ''}a ${formatDistance(suggestion.distanceKm)}`;
}

// ── Del punto a la dirección ─────────────────────────────────

export interface ReverseAddress {
  address: string;
  barrio?: string;
}

const BARRIO_KEYS = ['suburb', 'neighbourhood', 'town', 'village', 'city'];

/** Respuesta cruda de Nominatim → calle y altura, y barrio; null sin calle */
export function parseReverse(raw: unknown): ReverseAddress | null {
  const address = field(raw, 'address');
  const road = textField(address, 'road');
  if (!road) return null;
  const number = textField(address, 'house_number');
  const barrio = BARRIO_KEYS.map(key => textField(address, key)).find(Boolean);
  return { address: number ? `${road} ${number}` : road, ...(barrio && { barrio }) };
}

// ── Consultas ────────────────────────────────────────────────

export type AddressSearch =
  | { status: 'ok'; suggestions: AddressSuggestion[]; unknownNumber: boolean }
  | { status: 'failed' };

const GEOREF = 'https://apis.datos.gob.ar/georef/api';
const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';

/** Límites, en ms: la búsqueda entera, la espera de los departamentos dentro de ella y la dirección de un punto */
const SEARCH_TIMEOUT = 5_000;
const DEPARTMENTS_WAIT = 2_000;
const REVERSE_TIMEOUT = 8_000;

const FIELDS = 'calle.nombre,altura.valor,departamento.nombre,localidad_censal.id,localidad_censal.nombre,'
  + 'provincia.nombre,ubicacion.lat,ubicacion.lon';

/** Sin altura Georef devuelve una fila por cuadra y sin orden de cercanía: hay que pedirlas todas */
const MAX_ROWS = '1000';
/** En todo el país y sin referencia alcanza con las primeras: se ofrecen en el orden de Georef */
const MAX_ROWS_NO_ORIGIN = '100';

const CABA_NAMES = new Set(['capital federal', 'ciudad autonoma de buenos aires', 'ciudad de buenos aires', 'c.a.b.a.']);

// Cachés de módulo durante la sesión: guardan la promesa; un fallo se borra
let departmentsCache: Promise<Department[]> | null = null;
const searchCache = new Map<string, Promise<unknown>>();

/** Para los tests */
export function clearAddressCache(): void {
  departmentsCache = null;
  searchCache.clear();
}

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Respuesta con error');
  return response.json();
}

async function fetchWithTimeout(url: string, timeout: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetchJson(url, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function loadDepartments(): Promise<Department[]> {
  if (departmentsCache) return departmentsCache;
  const promise = fetchWithTimeout(
    `${GEOREF}/departamentos?max=1000&aplanar=true&campos=id,centroide`, REVERSE_TIMEOUT,
  ).then(raw => {
    const departments = parseDepartments(raw);
    if (!departments) throw new Error('Departamentos inválidos');
    return departments;
  });
  departmentsCache = promise;
  promise.catch(() => { if (departmentsCache === promise) departmentsCache = null; });
  return promise;
}

/** Ids de los departamentos cercanos; null si no se pudieron traer a tiempo (la búsqueda va a todo el país) */
async function departmentsNear(origin: LatLng): Promise<string[] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), DEPARTMENTS_WAIT); });
  try {
    const departments = await Promise.race([loadDepartments(), late]);
    return departments && nearestDepartments(departments, origin);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function fetchAddresses(params: Record<string, string>, signal: AbortSignal): Promise<unknown> {
  const query = new URLSearchParams({ ...params, campos: FIELDS }).toString();
  const cached = searchCache.get(query);
  if (cached) return cached;
  const promise = fetchJson(`${GEOREF}/direcciones?${query}`, signal).then(raw => {
    if (!Array.isArray(field(raw, 'direcciones'))) throw new Error('Respuesta inválida');
    return raw;
  });
  searchCache.set(query, promise);
  promise.catch(() => { if (searchCache.get(query) === promise) searchCache.delete(query); });
  return promise;
}

/**
 * Sugerencias para lo escrito, en hasta 5 s. Con coma, en esa localidad y, si no hay, en ese departamento; si no, cerca
 * de `origin` y, si no hay, en todo el país. Una altura que no existe ofrece las calles (`unknownNumber`). Con `street`
 * (la calle elegida), solo esa calle y localidad.
 * Caché de sesión por texto y departamentos; un fallo no se guarda
 */
export async function searchAddresses(
  query: string, origin: LatLng | null, street?: AddressSuggestion,
): Promise<AddressSearch> {
  const parsed = parseAddressQuery(query);
  const number = street ? numberAfterStreet(query, street.street) || undefined : parsed.number;
  const name = street ? street.street : parsed.text;
  const locality = street ? street.locality : parsed.locality;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT);
  try {
    const scopes = await searchScopes(locality, origin);
    const run = async (address: string): Promise<AddressSuggestion[]> => {
      for (const scope of scopes) {
        const params = { direccion: address, ...scope, max: origin || locality ? MAX_ROWS : MAX_ROWS_NO_ORIGIN };
        const suggestions = parseGeoref(await fetchAddresses(params, controller.signal), origin, street);
        if (suggestions.length > 0) return suggestions;
      }
      return [];
    };
    if (!number) return { status: 'ok', suggestions: await run(name), unknownNumber: false };
    const exact = await run(`${name} ${number}`);
    if (exact.length > 0) return { status: 'ok', suggestions: exact, unknownNumber: false };
    const streets = await run(name);
    return { status: 'ok', suggestions: streets, unknownNumber: streets.length > 0 };
  } catch {
    return { status: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}

/** Dónde buscar, en orden: se pasa al siguiente si no hay resultados */
async function searchScopes(locality: string | undefined, origin: LatLng | null): Promise<Record<string, string>[]> {
  if (locality) {
    const plain = locality.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    const place = CABA_NAMES.has(plain) ? CABA : locality;
    return [{ localidad: place }, { departamento: place }];
  }
  const departments = origin && await departmentsNear(origin);
  return departments ? [{ departamento: departments.join(',') }, {}] : [{}];
}

let reverseController: AbortController | null = null;

/** Dirección de un punto, en hasta 8 s; null sin calle o si falla. Nunca dos a la vez: la nueva cancela la anterior */
export async function reverseAddress(point: LatLng): Promise<ReverseAddress | null> {
  reverseController?.abort();
  const controller = new AbortController();
  reverseController = controller;
  const timer = setTimeout(() => controller.abort(), REVERSE_TIMEOUT);
  const params = new URLSearchParams({
    format: 'jsonv2', lat: point.lat.toFixed(5), lon: point.lng.toFixed(5), zoom: '18', addressdetails: '1',
    'accept-language': 'es',
  });
  try {
    return parseReverse(await fetchJson(`${NOMINATIM}?${params}`, controller.signal));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    if (reverseController === controller) reverseController = null;
  }
}
