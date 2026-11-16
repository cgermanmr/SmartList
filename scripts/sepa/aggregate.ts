// Agregación de los precios del SEPA por EAN × bandera (spec 08) y por sucursal (spec 13).
// Se procesa un comercio por vez: la memoria queda acotada por el comercio más grande.

import { isValidGtin } from '../../src/lib/gtin.ts';
import {
  type SepaUnit,
  branchAddress,
  cleanBranchText,
  median,
  normalizeSpaces,
  parseCoordinate,
  parsePrice,
  presentation,
  validCoordinates,
} from './clean.ts';

// ── Tipos ─────────────────────────────────────────────

/** Fila de comercio.csv (una por bandera) */
export interface ComercioRow {
  idComercio: string;
  idBandera: string;
  razonSocial: string;
  banderaNombre: string;
}

/** Fila de sucursales.csv; los datos de la sucursal son opcionales (un comercio que no los trae se carga igual) */
export interface SucursalRow {
  idComercio: string;
  idBandera: string;
  idSucursal: string;
  nombre?: string;
  tipo?: string;
  calle?: string;
  numero?: string;
  barrio?: string;
  localidad?: string;
  provincia?: string;
  latitud?: string;
  longitud?: string;
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

/** Sucursal de una bandera (spec 13) */
export interface SepaSucursal {
  id: string;            // '10-1-123' = comercio-bandera-sucursal
  bandera: string;
  pos: number;           // posición en SepaPrecioSucursal.indices (desde 1), por id_sucursal
  nombre: string;
  tipo: string | null;
  direccion: string | null;
  barrio: string | null;
  localidad: string | null;
  provincia: string | null;
  lat: number | null;    // null si la coordenada no es válida
  lng: number | null;
}

/** Precios de un EAN × bandera por sucursal (spec 13) */
export interface SepaPrecioSucursal {
  ean: string;
  bandera: string;
  precios: number[];     // precios de lista distintos, de menor a mayor
  indices: Int16Array;   // uno por sucursal de la bandera, en el orden de pos: posición (desde 1) en precios; 0 = no informa
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
  sucursales: SepaSucursal[];
  preciosSucursal: SepaPrecioSucursal[];
  sinCoordenadas: number;   // sucursales cargadas sin coordenadas válidas
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

/** '0123' → '123'; un id que no es número queda como viene (recortado) */
function sucursalKey(idSucursal: string): string {
  const id = idSucursal.trim();
  return /^\d+$/.test(id) ? String(Number(id)) : id;
}

/** Orden de las sucursales para asignar pos: numérico si los dos ids son números */
function compareSucursales(a: string, b: string): number {
  const numeric = /^\d+$/;
  if (numeric.test(a) && numeric.test(b)) return Number(a) - Number(b);
  return a.localeCompare(b, 'es', { numeric: true });
}

function toSucursal(row: SucursalRow, bandera: string, id: string, pos: number): SepaSucursal {
  const lat = parseCoordinate(row.latitud);
  const lng = parseCoordinate(row.longitud);
  const valid = validCoordinates(lat, lng);
  const tipo = normalizeSpaces(row.tipo ?? '');
  const provincia = normalizeSpaces(row.provincia ?? '');
  return {
    id: `${bandera}-${id}`,
    bandera,
    pos,
    nombre: cleanBranchText(row.nombre) ?? `Sucursal ${id}`,
    tipo: tipo || null,
    direccion: branchAddress(row.calle, row.numero),
    barrio: cleanBranchText(row.barrio),
    localidad: cleanBranchText(row.localidad),
    provincia: provincia || null,
    lat: valid ? lat : null,
    lng: valid ? lng : null,
  };
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

  // Sucursales únicas de cada bandera, ordenadas por id_sucursal: su orden es pos (spec 13)
  const rowsByBandera = new Map<string, Map<string, SucursalRow>>();
  for (const s of sucursales) {
    const id = banderaId(s.idComercio, s.idBandera);
    if (!banderas.has(id)) continue;
    let rows = rowsByBandera.get(id);
    if (!rows) rowsByBandera.set(id, (rows = new Map()));
    const key = sucursalKey(s.idSucursal);
    if (!rows.has(key)) rows.set(key, s);
  }
  const posBySucursal = new Map<string, number>();   // "bandera|id_sucursal" → pos
  const sucursalesOut: SepaSucursal[] = [];
  for (const [id, rows] of rowsByBandera) {
    const keys = [...rows.keys()].sort(compareSucursales);
    keys.forEach((key, i) => {
      posBySucursal.set(`${id}|${key}`, i + 1);
      sucursalesOut.push(toSucursal(rows.get(key)!, id, key, i + 1));
    });
    banderas.get(id)!.sucursales = keys.length;
  }

  // "ean|bandera" → precio de lista de cada sucursal, en el orden de pos (NaN = no informa). Si una sucursal informa
  // dos veces el mismo EAN, vale la primera fila
  const prices = new Map<string, Float64Array>();
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
      const pos = posBySucursal.get(`${bandera}|${sucursalKey(row.idSucursal)}`);
      if (pos === undefined) return;

      filasValidas++;
      const key = `${ean}|${bandera}`;
      let list = prices.get(key);
      if (!list) {
        list = new Float64Array(banderas.get(bandera)!.sucursales).fill(Number.NaN);
        prices.set(key, list);
      }
      if (Number.isNaN(list[pos - 1])) list[pos - 1] = price;

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
      const preciosSucursal: SepaPrecioSucursal[] = [];
      const conPrecios = new Set<string>();
      for (const [key, bySucursal] of prices) {
        const [ean, bandera] = key.split('|');
        const values = Array.from(bySucursal).filter(value => !Number.isNaN(value));
        const distinct = [...new Set(values)].sort((a, b) => a - b);
        const minimo = distinct[0];
        const maximo = distinct[distinct.length - 1];
        precios.push({ ean, bandera, minimo, mediana: roundCents(median(values)), maximo, sucursales: values.length });

        const position = new Map(distinct.map((value, i) => [value, i + 1]));
        const indices = new Int16Array(bySucursal.length);
        bySucursal.forEach((value, i) => { indices[i] = Number.isNaN(value) ? 0 : position.get(value)!; });
        preciosSucursal.push({ ean, bandera, precios: distinct, indices });
        conPrecios.add(bandera);
      }
      // Las banderas sin ningún precio (Topsy, Bomba: sin sucursales) no se cargan, ni sus sucursales
      const conDatos = [...banderas.values()].filter(b => conPrecios.has(b.id));
      const sucursalesConDatos = sucursalesOut.filter(s => conPrecios.has(s.bandera));
      return {
        banderas: conDatos,
        precios,
        sucursales: sucursalesConDatos,
        preciosSucursal,
        sinCoordenadas: sucursalesConDatos.filter(s => s.lat === null).length,
        productos,
        filasLeidas,
        filasValidas,
      };
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
