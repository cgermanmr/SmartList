// Agregación de los precios del SEPA por EAN × bandera (spec 08).
// Se procesa un comercio por vez: la memoria queda acotada por el comercio más grande.

import { isValidGtin } from '../../src/lib/gtin.ts';
import { type SepaUnit, median, normalizeSpaces, parsePrice, presentation } from './clean.ts';

// ── Tipos ─────────────────────────────────────────────

/** Fila de comercio.csv (una por bandera) */
export interface ComercioRow {
  idComercio: string;
  idBandera: string;
  razonSocial: string;
  banderaNombre: string;
}

/** Fila de sucursales.csv */
export interface SucursalRow {
  idComercio: string;
  idBandera: string;
  idSucursal: string;
}

/** Fila de productos.csv (solo las columnas que se usan) */
export interface ProductoRow {
  idComercio: string;
  idBandera: string;
  idSucursal: string;
  idProducto: string;
  productosEan: string;
  descripcion: string;
  cantidadPresentacion: string;
  unidadPresentacion: string;
  marca: string;
  precioLista: string;
  cantidadReferencia: string;
  unidadReferencia: string;
}

export type OmissionReason = 'zip roto' | 'encabezados inválidos' | 'sin fecha de actualización' | 'desactualizado';

export interface SepaBandera {
  id: string;            // '10-1' = id_comercio-id_bandera
  comercioId: number;
  banderaId: number;
  nombre: string;
  razonSocial: string;
  sucursales: number;
}

export interface SepaPrecio {
  ean: string;
  bandera: string;
  minimo: number;
  mediana: number;
  maximo: number;
  sucursales: number;
}

export interface SepaProducto {
  ean: string;
  descripcion: string;
  marca: string | null;
  cantidad: number | null;
  unidad: SepaUnit | null;
}

/** Cuántas filas proponen cada descripción, marca y presentación de un EAN */
interface ProductCounts {
  descripciones: Map<string, number>;
  marcas: Map<string, number>;
  presentaciones: Map<string, number>;   // clave "cantidad|unidad"
}

export interface ComercioResult {
  banderas: SepaBandera[];
  precios: SepaPrecio[];
  productos: Map<string, ProductCounts>;
  filasLeidas: number;
  filasValidas: number;
}

export interface ComercioAggregator {
  add(row: ProductoRow): void;
  finish(): ComercioResult;
}

// ── Comercio ─────────────────────────────────────────────

const MAX_DAYS_OLD = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** '10', '01' → '10-1' */
function banderaId(idComercio: string, idBandera: string): string {
  return `${Number(idComercio)}-${Number(idBandera)}`;
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Agrega las filas de productos.csv de un comercio, validadas contra su comercio.csv y sucursales.csv */
export function createComercioAggregator(comercio: ComercioRow[], sucursales: SucursalRow[]): ComercioAggregator {
  const banderas = new Map<string, SepaBandera>();
  for (const c of comercio) {
    const id = banderaId(c.idComercio, c.idBandera);
    if (banderas.has(id)) continue;
    banderas.set(id, {
      id,
      comercioId: Number(c.idComercio),
      banderaId: Number(c.idBandera),
      nombre: normalizeSpaces(c.banderaNombre),
      razonSocial: normalizeSpaces(c.razonSocial),
      sucursales: 0,
    });
  }

  const knownSucursales = new Set<string>();
  for (const s of sucursales) {
    const id = banderaId(s.idComercio, s.idBandera);
    knownSucursales.add(`${id}|${s.idSucursal}`);
    const bandera = banderas.get(id);
    if (bandera) bandera.sucursales++;
  }

  const prices = new Map<string, number[]>();   // "ean|bandera" → precios de lista por sucursal
  const productos = new Map<string, ProductCounts>();
  let filasLeidas = 0;
  let filasValidas = 0;

  return {
    add(row) {
      filasLeidas++;
      if (row.productosEan !== '1') return;
      const ean = row.idProducto;
      if (ean.length !== 13 || !isValidGtin(ean)) return;
      const price = parsePrice(row.precioLista);
      if (price === null) return;
      const bandera = banderaId(row.idComercio, row.idBandera);
      if (!banderas.has(bandera) || !knownSucursales.has(`${bandera}|${row.idSucursal}`)) return;

      filasValidas++;
      const key = `${ean}|${bandera}`;
      const list = prices.get(key);
      if (list) list.push(price);
      else prices.set(key, [price]);

      let counts = productos.get(ean);
      if (!counts) {
        counts = { descripciones: new Map(), marcas: new Map(), presentaciones: new Map() };
        productos.set(ean, counts);
      }
      const descripcion = normalizeSpaces(row.descripcion);
      if (descripcion) increment(counts.descripciones, descripcion);
      const marca = normalizeSpaces(row.marca);
      if (marca) increment(counts.marcas, marca);
      const pres = presentation(row);
      if (pres) increment(counts.presentaciones, `${pres.cantidad}|${pres.unidad}`);
    },

    finish() {
      const precios: SepaPrecio[] = [];
      const conPrecios = new Set<string>();
      for (const [key, values] of prices) {
        const [ean, bandera] = key.split('|');
        let minimo = values[0];
        let maximo = values[0];
        for (const value of values) {
          if (value < minimo) minimo = value;
          if (value > maximo) maximo = value;
        }
        precios.push({ ean, bandera, minimo, mediana: roundCents(median(values)), maximo, sucursales: values.length });
        conPrecios.add(bandera);
      }
      // Las banderas sin ningún precio (Topsy, Bomba: sin sucursales) no se cargan
      const conDatos = [...banderas.values()].filter(b => conPrecios.has(b.id));
      return { banderas: conDatos, precios, productos, filasLeidas, filasValidas };
    },
  };
}

/** Motivo para omitir el comercio según el pie de productos.csv; null si está al día (hasta 7 días) */
export function checkFreshness(footerDate: string | null, fechaArchivo: string): OmissionReason | null {
  if (footerDate === null) return 'sin fecha de actualización';
  const days = (Date.parse(fechaArchivo) - Date.parse(footerDate)) / DAY_MS;
  return days > MAX_DAYS_OLD ? 'desactualizado' : null;
}

// ── Productos (todos los comercios) ─────────────────────────────────────────────

/** El valor con más filas; a igual cantidad, el primero en orden alfabético */
function mostFrequent(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && value < best)) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function mergeCounts(into: Map<string, number>, from: Map<string, number>): void {
  for (const [key, count] of from) into.set(key, (into.get(key) ?? 0) + count);
}

/** Junta los productos de los comercios aceptados y elige descripción, marca y presentación de cada EAN */
export function createProductAccumulator() {
  const all = new Map<string, ProductCounts>();

  return {
    merge(result: ComercioResult): void {
      for (const [ean, counts] of result.productos) {
        const current = all.get(ean);
        if (!current) {
          all.set(ean, counts);
          continue;
        }
        mergeCounts(current.descripciones, counts.descripciones);
        mergeCounts(current.marcas, counts.marcas);
        mergeCounts(current.presentaciones, counts.presentaciones);
      }
    },

    products(): SepaProducto[] {
      const list: SepaProducto[] = [];
      for (const [ean, counts] of all) {
        const pres = mostFrequent(counts.presentaciones);
        const [cantidad, unidad] = pres ? pres.split('|') : [null, null];
        list.push({
          ean,
          descripcion: mostFrequent(counts.descripciones) ?? '',
          marca: mostFrequent(counts.marcas),
          cantidad: cantidad === null ? null : Number(cantidad),
          unidad: unidad as SepaUnit | null,
        });
      }
      return list;
    },
  };
}
