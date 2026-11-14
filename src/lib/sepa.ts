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

const COLUMNS = 'ean, descripcion, marca, cantidad, unidad, banderas';
const MAX_RESULTS = 20;
const MIN_SEARCH_CHARS = 3;
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

/** Nombre sugerido: descripción en formato título, sin la marca repetida al final */
export function suggestedName(p: SepaProduct): string {
  const text = normalizeText(p.description);
  const brand = p.brand ? normalizeText(p.brand) : '';
  const name = brand && text.endsWith(` ${brand}`) ? text.slice(0, -brand.length - 1) : text;
  return name.replace(/(^|\s)(\p{L})/gu, (_match, space: string, letter: string) => space + letter.toLocaleUpperCase('es-AR'));
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
