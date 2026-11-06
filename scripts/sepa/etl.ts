// ETL de Precios Claros (SEPA) → Supabase (spec 08).
// Uso: npm run sepa:etl [-- --file ruta.zip] [--dry-run] [--force]

import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import type pg from 'pg';
import {
  type OmissionReason,
  type SepaBandera,
  type SepaPrecio,
  type SepaProducto,
  createProductAccumulator,
} from './aggregate.ts';
import { connect, lastOkFecha, lastOkInicio, loadSepa } from './load.ts';
import { readSepaZip } from './read-zip.ts';
import { type RunSummary, buildSummary, emptySummary } from './summary.ts';

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

// ISO 8601 con hora; la fracción y la zona son opcionales (CKAN manda `2026-11-04T16:19:50.656844`, sin zona)
const CKAN_DATE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i;

/** Fecha de CKAN (`last_modified`): si no trae zona horaria es UTC, no hora local. null si no se puede leer */
export function parseCkanDate(text: string | null | undefined): Date | null {
  const match = text ? CKAN_DATE.exec(text.trim()) : null;
  if (!match) return null;
  const [, base, fraction, zone] = match;
  // Date solo acepta milisegundos: los microsegundos de CKAN se truncan
  const ms = fraction ? fraction.slice(0, 4).padEnd(4, '0') : '';
  const tz = !zone ? 'Z' : zone.length === 5 ? `${zone.slice(0, 3)}:${zone.slice(3)}` : zone.toUpperCase();
  const date = new Date(`${base}${ms}${tz}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** El ZIP diario de `last_modified` más reciente; null si no hay ninguno */
export function pickLatestZip(resources: CkanResource[]): CkanResource | null {
  let latest: CkanResource | null = null;
  let latestTime = -Infinity;
  for (const resource of resources) {
    if (resource.format?.toUpperCase() !== 'ZIP' || !resource.url) continue;
    const time = parseCkanDate(resource.last_modified)?.getTime();
    if (time === undefined || time <= latestTime) continue;
    latest = resource;
    latestTime = time;
  }
  return latest;
}

/** Esperas entre intentos: 1, 2 y 4 minutos (1 intento + 3 reintentos) */
export const RETRY_DELAYS_MS = [60_000, 120_000, 240_000];

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Pide `url` y procesa la respuesta con `consume`; si algo falla (red, estado HTTP o un corte mientras se lee el
 * cuerpo), espera `delays[i]` ms y vuelve a empezar. Hace `delays.length + 1` intentos y propaga el último error.
 */
export async function fetchWithRetry<T = Response>(
  url: string,
  delays: readonly number[],
  consume: (response: Response) => Promise<T> = async response => response as T,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok || !response.body) throw new Error(`${url} respondió ${response.status} ${response.statusText}`);
      return await consume(response);
    } catch (error) {
      if (attempt >= delays.length) throw error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  Intento ${attempt + 1} de ${delays.length + 1} falló (${message}); ` +
        `reintento en ${fmt(Math.round(delays[attempt] / 1000))} s`);
      await sleep(delays[attempt]);
    }
  }
}

/** El recurso ZIP más reciente del dataset, según `package_show` */
async function fetchLatestResource(): Promise<CkanResource> {
  const pkg = await fetchWithRetry(CKAN_PACKAGE, RETRY_DELAYS_MS,
    response => response.json() as Promise<{ result?: { resources?: CkanResource[] } }>);
  const resource = pickLatestZip(pkg.result?.resources ?? []);
  if (!resource) throw new Error('El dataset sepa-precios no tiene ningún recurso ZIP');
  return resource;
}

/** Baja el ZIP del recurso a `dir` y devuelve la ruta del archivo */
async function download(resource: CkanResource, dir: string): Promise<string> {
  console.log(`Descargando ${resource.name ?? 'ZIP'} de ${resource.url}`);
  const file = join(dir, 'sepa.zip');
  // Cada intento baja el archivo entero y sobrescribe el temporal (createWriteStream lo trunca)
  await fetchWithRetry(resource.url!, RETRY_DELAYS_MS, response =>
    pipeline(Readable.fromWeb(response.body as WebReadableStream<Uint8Array>), createWriteStream(file)));
  return file;
}

// ── Chequeo previo ─────────────────────────────────────────────

/**
 * ¿Hay un archivo que todavía no se cargó? Sí si el recurso se modificó después del inicio de la última carga ok
 * (la de mayor fecha_archivo), o si nunca hubo una carga ok.
 */
export function hasNewFile(lastModified: Date, inicio: Date | null): boolean {
  return inicio === null || lastModified.getTime() > inicio.getTime();
}

// ── Más de 3 días ─────────────────────────────────────────────

/** Días sin precios nuevos a partir de los cuales la ejecución falla para que llegue el aviso */
export const MAX_STALE_DAYS = 3;

/** Fecha de hoy en hora argentina, como `YYYY-MM-DD` */
export function todayInArgentina(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(now);
}

/** Días entre dos fechas `YYYY-MM-DD` (hoy − fecha) */
export function daysSince(fecha: string, hoy: string): number {
  return Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${fecha}T00:00:00Z`)) / 86_400_000);
}

/** ¿Los precios están viejos? Sí si la última carga ok es de hace más de 3 días, o si no hay ninguna */
export function isStale(fechaArchivo: string | null, hoy: string): boolean {
  return fechaArchivo === null || daysSince(fechaArchivo, hoy) > MAX_STALE_DAYS;
}

/** Regla de "más de 3 días": el aviso si los precios están viejos, null si están al día */
async function staleWarning(client: pg.Client): Promise<string | null> {
  const fecha = await lastOkFecha(client);
  const hoy = todayInArgentina();
  if (!isStale(fecha, hoy)) return null;
  return fecha === null
    ? 'No hay ninguna carga ok en sepa_cargas.'
    : `Más de ${MAX_STALE_DAYS} días sin precios nuevos: la última carga ok es del ${fecha} (${daysSince(fecha, hoy)} días).`;
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

const seconds = (since: number) => (performance.now() - since) / 1000;

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      file: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    },
  });
  const dryRun = values['dry-run'];
  const inicio = new Date();
  const start = performance.now();
  const run: RunSummary = emptySummary('error');
  let downloading = false;   // para distinguir "descarga fallida" de cualquier otro error
  let tempDir: string | null = null;
  let client: pg.Client | null = null;

  /** Regla de "más de 3 días" al terminar sin error: 1 si avisa */
  const finish = async (db: pg.Client): Promise<number> => {
    run.aviso = await staleWarning(db);
    if (!run.aviso) return 0;
    console.error(`\nAviso: ${run.aviso}`);
    return 1;
  };

  try {
    // Se conecta antes de descargar para el chequeo previo; --dry-run no toca la base
    if (!dryRun) {
      const url = process.env.SUPABASE_DB_URL;
      if (!url) throw new Error('Falta SUPABASE_DB_URL (Session pooler de Supabase) en .env.local o en el entorno');
      client = await connect(url);
    }

    let file = values.file;
    if (!file) {
      downloading = true;
      const resource = await fetchLatestResource();
      const lastModified = parseCkanDate(resource.last_modified)!;   // pickLatestZip solo elige fechas válidas
      run.lastModified = lastModified;
      console.log(`Último ZIP: ${resource.name ?? '—'} (last_modified ${lastModified.toISOString()})`);

      // Chequeo previo: es solo un atajo, las reglas 1 a 3 se vuelven a evaluar al cargar
      if (client && !values.force) {
        const ultimoInicio = await lastOkInicio(client);
        if (!hasNewFile(lastModified, ultimoInicio)) {
          console.log(`Sin archivo nuevo: el recurso no cambió desde la última carga ok (${ultimoInicio!.toISOString()}).`);
          run.resultado = 'sin archivo nuevo';
          run.detalle = `el recurso no cambió desde la última carga ok (${ultimoInicio!.toISOString()})`;
          downloading = false;
          return await finish(client);
        }
      }

      tempDir = await mkdtemp(join(tmpdir(), 'sepa-'));
      const downloadStart = performance.now();
      file = await download(resource, tempDir);
      run.segundos.descarga = seconds(downloadStart);
      downloading = false;
    }

    console.log(`Leyendo ${file}`);
    const readStart = performance.now();
    const data = await readFile(file);
    run.segundos.lectura = seconds(readStart);
    run.fechaArchivo = data.fechaArchivo;
    run.banderas = data.banderas.length;
    run.omitidos = data.omitidos;
    run.filasLeidas = data.filasLeidas;
    run.filasPrecios = data.precios.length;
    printStats(data, seconds(start));

    if (!client) {
      console.log('\n--dry-run: no se conecta a la base.');
      run.resultado = 'dry-run';
      run.detalle = 'sin conexión a la base';
      return 0;
    }

    console.log(`\nCargando en la base${values.force ? ' (--force)' : ''}…`);
    const loadStart = performance.now();
    const result = await loadSepa(client, data, { force: values.force, inicio });
    run.segundos.carga = seconds(loadStart);
    run.resultado = result.estado;
    run.detalle = result.detalle;
    console.log(`Estado:             ${result.estado}${result.detalle ? ` — ${result.detalle}` : ''}`);
    if (result.preciosEnBase !== undefined) console.log(`sepa_precios:       ${fmt(result.preciosEnBase)} filas en la base`);
    console.log(`Carga:              ${fmt(Math.round(run.segundos.carga))} s`);
    if (result.estado === 'error') return 1;
    return await finish(client);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nError: ${message}`);
    run.resultado = downloading ? 'descarga fallida' : 'error';
    run.detalle = message;
    return 1;
  } finally {
    // Ni el cierre de la conexión ni el borrado del temporal impiden escribir el resumen
    await client?.end().catch(() => {});
    if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    run.segundos.total = seconds(start);
    await writeSummary(run);
  }
}

/** Agrega el resumen al job summary de GitHub si corre en Actions (o si se define GITHUB_STEP_SUMMARY a mano) */
async function writeSummary(run: RunSummary): Promise<void> {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  try {
    await appendFile(path, buildSummary(run), 'utf8');
  } catch (error) {
    console.error(`No se pudo escribir el resumen en ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (import.meta.main) process.exitCode = await main();
