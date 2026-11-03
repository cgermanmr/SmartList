// ETL de Precios Claros (SEPA) → Supabase (spec 08).
// Uso: npm run sepa:etl [-- --file ruta.zip] [--dry-run] [--force]

import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import {
  type OmissionReason,
  type SepaBandera,
  type SepaPrecio,
  type SepaProducto,
  createProductAccumulator,
} from './aggregate.ts';
import { connect, loadSepa } from './load.ts';
import { readSepaZip } from './read-zip.ts';

// ── Tipos ─────────────────────────────────────────────

export interface Omitido {
  archivo: string;
  motivo: OmissionReason;
}

/** Todo lo que sale de leer el archivo: lo que se carga en la base y lo que se registra en sepa_cargas */
export interface SepaData {
  fechaArchivo: string;
  banderas: SepaBandera[];
  precios: SepaPrecio[];
  productos: SepaProducto[];
  omitidos: Omitido[];
  filasLeidas: number;
  filasValidas: number;
}

export interface CkanResource {
  name?: string;
  format?: string;
  url?: string;
  last_modified?: string | null;
}

// ── Descarga ─────────────────────────────────────────────

const CKAN_PACKAGE = 'https://datos.produccion.gob.ar/api/3/action/package_show?id=sepa-precios';

/** El ZIP diario de `last_modified` más reciente; null si no hay ninguno */
export function pickLatestZip(resources: CkanResource[]): CkanResource | null {
  let latest: CkanResource | null = null;
  let latestTime = -Infinity;
  for (const resource of resources) {
    if (resource.format?.toUpperCase() !== 'ZIP' || !resource.url || !resource.last_modified) continue;
    const time = Date.parse(resource.last_modified);
    if (Number.isNaN(time) || time <= latestTime) continue;
    latest = resource;
    latestTime = time;
  }
  return latest;
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`${url} respondió ${response.status} ${response.statusText}`);
  return response;
}

/** Baja el ZIP del día a `dir` y devuelve la ruta del archivo */
async function downloadLatest(dir: string): Promise<string> {
  const pkg = (await (await fetchOk(CKAN_PACKAGE)).json()) as { result?: { resources?: CkanResource[] } };
  const resource = pickLatestZip(pkg.result?.resources ?? []);
  if (!resource) throw new Error('El dataset sepa-precios no tiene ningún recurso ZIP');

  console.log(`Descargando ${resource.name ?? 'ZIP'} (${resource.last_modified}) de ${resource.url}`);
  const file = join(dir, 'sepa.zip');
  const response = await fetchOk(resource.url!);
  await pipeline(Readable.fromWeb(response.body as WebReadableStream<Uint8Array>), createWriteStream(file));
  return file;
}

// ── Lectura ─────────────────────────────────────────────

const READ_CHUNK = 1 << 20;   // 1 MB

async function readFile(file: string): Promise<SepaData> {
  const banderas: SepaBandera[] = [];
  const precios: SepaPrecio[] = [];
  const omitidos: Omitido[] = [];
  const productos = createProductAccumulator();
  let filasLeidas = 0;
  let filasValidas = 0;

  const { fechaArchivo } = await readSepaZip(createReadStream(file, { highWaterMark: READ_CHUNK }), outcome => {
    if (outcome.motivo) {
      omitidos.push({ archivo: outcome.archivo, motivo: outcome.motivo });
      console.log(`  ✗ ${outcome.archivo}: ${outcome.motivo}`);
      return;
    }
    const result = outcome.result!;
    banderas.push(...result.banderas);
    for (const precio of result.precios) precios.push(precio);
    productos.merge(result);
    filasLeidas += result.filasLeidas;
    filasValidas += result.filasValidas;
    console.log(`  ✓ ${outcome.archivo}: ${fmt(result.filasLeidas)} filas, ${fmt(result.filasValidas)} válidas, ` +
      `${fmt(result.precios.length)} precios (${result.banderas.map(b => b.nombre).join(', ')})`);
  });

  return { fechaArchivo, banderas, precios, productos: productos.products(), omitidos, filasLeidas, filasValidas };
}

// ── Estadísticas ─────────────────────────────────────────────

const NUMBER = new Intl.NumberFormat('es-AR');

function fmt(value: number): string {
  return NUMBER.format(value);
}

function pct(part: number, total: number): string {
  return total === 0 ? '—' : `${NUMBER.format(Math.round((part / total) * 1000) / 10)} %`;
}

function printStats(data: SepaData, seconds: number): void {
  const conPresentacion = data.productos.filter(p => p.cantidad !== null).length;
  const conMarca = data.productos.filter(p => p.marca !== null).length;
  const peakMb = Math.round(process.resourceUsage().maxRSS / 1024);

  console.log('');
  console.log(`Fecha del archivo:  ${data.fechaArchivo}`);
  console.log(`Banderas cargadas:  ${fmt(data.banderas.length)}`);
  for (const b of [...data.banderas].sort((x, y) => x.id.localeCompare(y.id, 'es', { numeric: true }))) {
    const precios = data.precios.filter(p => p.bandera === b.id).length;
    console.log(`  ${b.id.padEnd(7)} ${b.nombre} — ${fmt(b.sucursales)} sucursales, ${fmt(precios)} precios`);
  }
  console.log(`Omitidos:           ${fmt(data.omitidos.length)}`);
  for (const o of data.omitidos) console.log(`  ${o.archivo}: ${o.motivo}`);
  console.log(`Filas leídas:       ${fmt(data.filasLeidas)} (válidas: ${fmt(data.filasValidas)})`);
  console.log(`Filas de precios:   ${fmt(data.precios.length)} (EAN × bandera)`);
  console.log(`Productos:          ${fmt(data.productos.length)} ` +
    `(con presentación: ${pct(conPresentacion, data.productos.length)}, con marca: ${pct(conMarca, data.productos.length)})`);
  console.log(`Duración:           ${fmt(Math.round(seconds))} s · pico de memoria: ${fmt(peakMb)} MB`);
}

// ── Punto de entrada ─────────────────────────────────────────────

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      file: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    },
  });
  const inicio = new Date();
  const start = performance.now();
  let tempDir: string | null = null;

  try {
    let file = values.file;
    if (!file) {
      tempDir = await mkdtemp(join(tmpdir(), 'sepa-'));
      file = await downloadLatest(tempDir);
    }
    console.log(`Leyendo ${file}`);
    const data = await readFile(file);
    printStats(data, (performance.now() - start) / 1000);

    if (values['dry-run']) {
      console.log('\n--dry-run: no se conecta a la base.');
      return 0;
    }

    const url = process.env.SUPABASE_DB_URL;
    if (!url) throw new Error('Falta SUPABASE_DB_URL (Session pooler de Supabase) en .env.local o en el entorno');
    console.log(`\nCargando en la base${values.force ? ' (--force)' : ''}…`);
    const client = await connect(url);
    try {
      const loadStart = performance.now();
      const result = await loadSepa(client, data, { force: values.force, inicio });
      console.log(`Estado:             ${result.estado}${result.detalle ? ` — ${result.detalle}` : ''}`);
      if (result.preciosEnBase !== undefined) console.log(`sepa_precios:       ${fmt(result.preciosEnBase)} filas en la base`);
      console.log(`Carga:              ${fmt(Math.round((performance.now() - loadStart) / 1000))} s`);
      return result.estado === 'error' ? 1 : 0;
    } finally {
      await client.end();
    }
  } catch (error) {
    console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  }
}

if (import.meta.main) process.exitCode = await main();
