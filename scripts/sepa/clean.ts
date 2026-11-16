// Limpieza de los CSV del SEPA: funciones puras, sin dependencias (specs 08 y 13)

export type SepaUnit = 'g' | 'ml' | 'u';

export interface UnitFactor {
  factor: number;
  unit: SepaUnit;
}

export interface PresentationFields {
  cantidadPresentacion: string;
  unidadPresentacion: string;
  cantidadReferencia: string;
  unidadReferencia: string;
}

export interface Presentation {
  cantidad: number;
  unidad: SepaUnit;
}

// ── Líneas ─────────────────────────────────────────────

/** Pie de los CSV: "Última actualización", con o sin tildes, o con los caracteres rotos (�) */
const FOOTER = /^[﻿]?[uú�]ltima actualizaci[oó�]n/i;

/** true si la línea es el pie "Última actualización" */
export function isFooter(line: string): boolean {
  return FOOTER.test(line.startsWith('﻿') ? line.slice(1) : line);
}

/** Campos de la línea recortados; null si es el pie o tiene menos de `columns` campos */
export function parseLine(line: string, columns: number): string[] | null {
  const text = line.startsWith('﻿') ? line.slice(1) : line;
  if (FOOTER.test(text)) return null;
  const fields = text.split('|').map(field => field.trim());
  return fields.length < columns ? null : fields;
}

/** Fecha (YYYY-MM-DD) del pie "Última actualización: 2026-10-30T09:19:16-03:00"; null si no tiene */
export function parseFooterDate(text: string): string | null {
  if (!FOOTER.test(text)) return null;
  const match = /(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:?\d{2}|Z)?/.exec(text);
  return match ? match[1] : null;
}

/** Recorta y colapsa los espacios repetidos: "SAL  FINA   CELUSAL " → "SAL FINA CELUSAL" */
export function normalizeSpaces(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

// ── Números ─────────────────────────────────────────────

/** Número del CSV ("00250", "0.02"); null si está vacío o no es número */
function parseNumber(text: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

/** "04210.00" → 4210; null si no es número o es <= 0 */
export function parsePrice(text: string): number | null {
  const value = parseNumber(text);
  return value !== null && value > 0 ? value : null;
}

// ── Unidades ─────────────────────────────────────────────

const UNITS: Record<string, UnitFactor> = {};

function addUnits(names: string[], factor: number, unit: SepaUnit): void {
  for (const name of names) UNITS[name] = { factor, unit };
}

addUnits(['G', 'GR', 'GRS', 'GRM', 'GRAMOS'], 1, 'g');
addUnits(['KG', 'KGM', 'KGR', 'KILO'], 1000, 'g');
addUnits(['ML', 'CC', 'CM3', 'CMQ'], 1, 'ml');
addUnits(['L', 'LT', 'LTR', 'LITRO'], 1000, 'ml');
addUnits(['U', 'UN', 'UNI', 'UD', 'UNIDA', 'UNIDAD', 'EA', 'CU', 'PC'], 1, 'u');

/** Unidad del SEPA → g / ml / u con su factor; null si no se reconoce */
export function normalizeUnit(text: string): UnitFactor | null {
  const key = text.trim().toUpperCase().replace(/\.$/, '');
  return Object.hasOwn(UNITS, key) ? { ...UNITS[key] } : null;
}

// ── Presentación ─────────────────────────────────────────────

function scaled(quantity: string, unit: UnitFactor): Presentation | null {
  const value = parseNumber(quantity);
  if (value === null || value === 0) return null;
  // Redondeo a 3 decimales, como numeric(12,3): 0.02 × 1000 = 20.000000000000004
  return { cantidad: Math.round(value * unit.factor * 1000) / 1000, unidad: unit.unit };
}

/**
 * Presentación que propone una fila:
 * 1. presentación de peso o volumen; 2. si no, referencia de peso o volumen;
 * 3. si no, ambas en unidades → cantidad de presentación en u; 4. si no, null.
 * La regla se elige por las unidades: si su cantidad es 0 o no numérica, la fila no propone nada.
 */
export function presentation(row: PresentationFields): Presentation | null {
  const pres = normalizeUnit(row.unidadPresentacion);
  const ref = normalizeUnit(row.unidadReferencia);
  if (pres && pres.unit !== 'u') return scaled(row.cantidadPresentacion, pres);
  if (ref && ref.unit !== 'u') return scaled(row.cantidadReferencia, ref);
  if (pres && ref) return scaled(row.cantidadPresentacion, pres);
  return null;
}

// ── Estadística ─────────────────────────────────────────────

/** Mediana; con cantidad par, promedio de los dos centrales. No modifica el array */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError('median: array vacío');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// ── Sucursales (spec 13) ─────────────────────────────────────────────

/** Rango de Argentina: latitud y longitud válidas de una sucursal */
const LAT_RANGE = [-56, -21] as const;
const LNG_RANGE = [-74, -53] as const;

/**
 * Texto de sucursales.csv en formato título, sin espacios de más: "AV  RIVADAVIA 5000 " → "Av Rivadavia 5000".
 * Vacío → null. Los caracteres rotos en origen (`Aut�noma`) quedan como vienen
 */
export function cleanBranchText(text: string | null | undefined): string | null {
  const clean = normalizeSpaces(text ?? '');
  if (clean === '') return null;
  return clean
    .toLocaleLowerCase('es-AR')
    .replace(/(^|[\s(/-])(\p{L})/gu, (_match, before: string, letter: string) => before + letter.toLocaleUpperCase('es-AR'));
}

/** Dirección = calle + número, ya limpios; sin calle, null */
export function branchAddress(calle: string | null | undefined, numero: string | null | undefined): string | null {
  const street = cleanBranchText(calle);
  if (street === null) return null;
  const number = normalizeSpaces(numero ?? '');
  return number === '' ? street : `${street} ${number}`;
}

/**
 * Coordenada del CSV ("-34.603722", "-34,603722"); null si no es un número. Se ignoran los espacios: Comodín parte
 * la latitud y la longitud con saltos de línea, que la lectura junta con un espacio
 */
export function parseCoordinate(text: string | null | undefined): number | null {
  const clean = (text ?? '').replace(/\s+/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return null;
  return Number(clean);
}

/** Coordenadas dentro de Argentina y distintas de 0 */
export function validCoordinates(lat: number | null, lng: number | null): boolean {
  if (lat === null || lng === null || lat === 0 || lng === 0) return false;
  return lat >= LAT_RANGE[0] && lat <= LAT_RANGE[1] && lng >= LNG_RANGE[0] && lng <= LNG_RANGE[1];
}
