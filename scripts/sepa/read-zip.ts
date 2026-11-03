// Lectura en streaming del ZIP del SEPA (spec 08):
// ZIP externo (sin comprimir) → carpeta YYYY-MM-DD/ → un ZIP por comercio → comercio.csv, sucursales.csv, productos.csv.
// El ZIP externo se lee de a pedazos. Cada ZIP interno se junta comprimido (el más grande, ~130 MB) para poder
// leer sucursales.csv antes que productos.csv, y cada CSV se descomprime de a pedazos: ninguno queda entero en memoria.

import { Inflate, Unzip, UnzipInflate } from 'fflate';
import {
  type ComercioResult,
  type OmissionReason,
  checkFreshness,
  createComercioAggregator,
} from './aggregate.ts';
import { isFooter, parseFooterDate, parseLine } from './clean.ts';

export interface ComercioOutcome {
  archivo: string;              // nombre del ZIP interno
  result?: ComercioResult;      // si se pudo agregar
  motivo?: OmissionReason;      // si se omitió
}

// ── Columnas esperadas ─────────────────────────────────────────────

const COMERCIO_COLUMNS = {
  idComercio: 'id_comercio',
  idBandera: 'id_bandera',
  razonSocial: 'comercio_razon_social',
  banderaNombre: 'comercio_bandera_nombre',
} as const;

const SUCURSAL_COLUMNS = {
  idComercio: 'id_comercio',
  idBandera: 'id_bandera',
  idSucursal: 'id_sucursal',
} as const;

const PRODUCTO_COLUMNS = {
  idComercio: 'id_comercio',
  idBandera: 'id_bandera',
  idSucursal: 'id_sucursal',
  idProducto: 'id_producto',
  productosEan: 'productos_ean',
  descripcion: 'productos_descripcion',
  cantidadPresentacion: 'productos_cantidad_presentacion',
  unidadPresentacion: 'productos_unidad_medida_presentacion',
  marca: 'productos_marca',
  precioLista: 'productos_precio_lista',
  cantidadReferencia: 'productos_cantidad_referencia',
  unidadReferencia: 'productos_unidad_medida_referencia',
} as const;

/** Error esperable de un comercio: se anota en omitidos y se sigue con el siguiente */
class OmitError extends Error {
  readonly motivo: OmissionReason;

  constructor(motivo: OmissionReason) {
    super(motivo);
    this.motivo = motivo;
  }
}

// ── ZIP externo ─────────────────────────────────────────────

const FOLDER = /^(\d{4}-\d{2}-\d{2})\//;

/**
 * Recorre el ZIP del SEPA y llama a `onComercio` con el resultado de cada ZIP interno, de a uno.
 * Devuelve la fecha del archivo (nombre de la carpeta). Falla si el ZIP externo no tiene la forma esperada.
 */
export async function readSepaZip(
  source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  onComercio: (outcome: ComercioOutcome) => void,
): Promise<{ fechaArchivo: string }> {
  let fechaArchivo: string | null = null;
  let failure: unknown = null;

  const unzip = new Unzip(file => {
    if (!file.name.endsWith('.zip')) return;
    const folder = FOLDER.exec(file.name);
    if (!folder) {
      failure ??= new Error(`El ZIP no tiene la carpeta YYYY-MM-DD/ (encontré "${file.name}")`);
      return;
    }
    fechaArchivo ??= folder[1];
    const fecha = folder[1];
    const archivo = file.name.slice(file.name.lastIndexOf('/') + 1);
    const parts: Uint8Array[] = [];
    file.ondata = (err, data, final) => {
      if (err) {
        failure ??= err;
        return;
      }
      parts.push(data);
      if (final) onComercio(readComercio(archivo, concat(parts), fecha));
    };
    file.start();
  });
  unzip.register(UnzipInflate);

  for await (const chunk of source) {
    unzip.push(chunk);
    if (failure) throw failure;
  }
  unzip.push(new Uint8Array(0), true);
  if (failure) throw failure;
  if (fechaArchivo === null) throw new Error('El ZIP no tiene la carpeta YYYY-MM-DD/ con los ZIP de los comercios');
  return { fechaArchivo };
}

function concat(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// ── Un comercio ─────────────────────────────────────────────

function readComercio(archivo: string, zip: Uint8Array, fechaArchivo: string): ComercioOutcome {
  try {
    let entries: Map<string, ZipEntry>;
    try {
      entries = readDirectory(zip);
    } catch {
      return { archivo, motivo: 'zip roto' };
    }
    const comercio = readTable(zip, entries, 'comercio.csv', COMERCIO_COLUMNS);
    const sucursales = readTable(zip, entries, 'sucursales.csv', SUCURSAL_COLUMNS);
    const aggregator = createComercioAggregator(comercio, sucursales);

    let footerDate: string | null = null;
    readCsv(zip, entries, 'productos.csv', PRODUCTO_COLUMNS, row => aggregator.add(row), date => (footerDate = date));

    const motivo = checkFreshness(footerDate, fechaArchivo);
    return motivo ? { archivo, motivo } : { archivo, result: aggregator.finish() };
  } catch (error) {
    return { archivo, motivo: error instanceof OmitError ? error.motivo : 'zip roto' };
  }
}

function readTable<K extends string>(zip: Uint8Array, entries: Map<string, ZipEntry>, name: string, columns: Record<K, string>): Record<K, string>[] {
  const rows: Record<K, string>[] = [];
  readCsv(zip, entries, name, columns, row => rows.push(row), () => {});
  return rows;
}

/**
 * Lee un CSV del ZIP interno línea por línea: valida el encabezado y entrega cada fila con las columnas pedidas.
 * `onFooter` recibe la fecha del pie "Última actualización".
 */
function readCsv<K extends string>(
  zip: Uint8Array,
  entries: Map<string, ZipEntry>,
  name: string,
  columns: Record<K, string>,
  onRow: (row: Record<K, string>) => void,
  onFooter: (date: string | null) => void,
): void {
  const entry = entries.get(name);
  if (!entry) throw new OmitError('encabezados inválidos');

  const keys = Object.keys(columns) as K[];
  let indexes: number[] | null = null;
  let width = 0;
  let partial: string | null = null;   // registro partido por saltos de línea dentro de un campo

  const emit = (text: string) => {
    const fields = parseLine(text, width)!;
    const row = {} as Record<K, string>;
    for (let i = 0; i < keys.length; i++) row[keys[i]] = fields[indexes![i]];
    onRow(row);
  };

  readLines(zip, entry, line => {
    if (indexes === null) {
      const header = parseLine(line, 1) ?? [];
      indexes = keys.map(key => header.indexOf(columns[key]));
      if (indexes.includes(-1)) throw new OmitError('encabezados inválidos');
      width = header.length;
      return;
    }
    if (isFooter(line)) {
      partial = null;
      const date = parseFooterDate(line);
      if (date !== null) onFooter(date);
      return;
    }
    // Una línea con menos columnas que el encabezado se junta con las siguientes hasta completarlas
    // (Comodín: latitud y longitud con salto de línea adentro). Si al juntarlas se pasan, el pedazo
    // anterior se descarta y la línea se lee sola.
    if (partial !== null) {
      const joined: string = `${partial} ${line}`;
      const count = countFields(joined);
      partial = null;
      if (count < width) {
        partial = joined;
        return;
      }
      if (count === width) {
        emit(joined);
        return;
      }
    }
    if (countFields(line) < width) partial = line;
    else emit(line);
  });
  if (indexes === null) throw new OmitError('encabezados inválidos');
}

function countFields(line: string): number {
  let count = 1;
  for (let i = line.indexOf('|'); i !== -1; i = line.indexOf('|', i + 1)) count++;
  return count;
}

// ── ZIP interno: índice y descompresión ─────────────────────────────────────────────

interface ZipEntry {
  method: number;            // 0 = sin comprimir, 8 = deflate
  dataStart: number;
  compressedSize: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** Lee el directorio central del ZIP: nombre del archivo (sin carpeta) → dónde están sus datos */
function readDirectory(zip: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP sin directorio central');

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder();

  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) throw new Error('Directorio central inválido');
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(zip.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith('/')) continue;
    if (compressedSize === 0xffffffff || localOffset === 0xffffffff) throw new Error('ZIP64 no soportado');
    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) throw new Error('Cabecera local inválida');
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    if (dataStart + compressedSize > zip.length) throw new Error('ZIP truncado');
    entries.set(name.slice(name.lastIndexOf('/') + 1), { method, dataStart, compressedSize });
  }
  return entries;
}

const INFLATE_CHUNK = 1 << 20;   // 1 MB comprimido por vez

/** Descomprime una entrada de a pedazos y entrega cada línea (sin \r\n) */
function readLines(zip: Uint8Array, entry: ZipEntry, onLine: (line: string) => void): void {
  const decoder = new TextDecoder('utf-8');   // decodifica en modo stream; los bytes inválidos quedan como �
  let pending = '';

  const onBytes = (bytes: Uint8Array, final: boolean) => {
    const text = pending + decoder.decode(bytes, { stream: !final });
    const lines = text.split('\n');
    pending = final ? '' : lines.pop()!;
    for (const line of lines) {
      const clean = line.endsWith('\r') ? line.slice(0, -1) : line;
      if (clean !== '') onLine(clean);
    }
  };

  const data = zip.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
  if (entry.method === 0) {
    for (let i = 0; i < data.length; i += INFLATE_CHUNK) onBytes(data.subarray(i, i + INFLATE_CHUNK), false);
    onBytes(new Uint8Array(0), true);
    return;
  }
  if (entry.method !== 8) throw new Error(`Método de compresión ${entry.method} no soportado`);

  const inflate = new Inflate((chunk, final) => onBytes(chunk, final));
  if (data.length === 0) {
    inflate.push(new Uint8Array(0), true);
    return;
  }
  for (let i = 0; i < data.length; i += INFLATE_CHUNK) {
    const end = Math.min(i + INFLATE_CHUNK, data.length);
    inflate.push(data.subarray(i, end), end === data.length);
  }
}
