// Imágenes de los productos del SEPA → sepa_imagenes (spec 17).
// Uso: npm run sepa:images
// Fuentes: Open Food Facts (export diario de todos sus productos, en streaming) y el portal Precios Claros (un HEAD
// por EAN).

import { appendFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { setTimeout as sleep } from 'node:timers/promises';
import { createGunzip } from 'node:zlib';
import type pg from 'pg';
import { toGtin13 } from '../../src/lib/gtin.ts';
import { connect } from './load.ts';
import { formatDuration } from './summary.ts';

// ── Tipos ─────────────────────────────────────────────

export type Fuente = 'off' | 'preciosclaros';

/** Un producto del catálogo: su EAN y en cuántas banderas tiene precio */
export interface CatalogProduct {
  ean: string;
  banderas: number;
}

/** Una fila de sepa_imagenes; `revisado` como `YYYY-MM-DD` */
export interface ImageRow {
  ean: string;
  url: string | null;      // null = se buscó y no hay
  fuente: Fuente | null;
  revisado: string;
}

/** Totales sobre todo el catálogo después de la ejecución */
export interface ImageTotals {
  productos: number;
  off: number;
  preciosClaros: number;
  sinImagen: number;
  pendientes: number;      // sin revisar todavía
}

/** Lo que se sabe de la ejecución; lo que no llegó a calcularse queda en null */
export interface ImagesSummary {
  error: string | null;
  offProductos: number;        // filas leídas del export de Open Food Facts
  offCompleto: boolean;
  offGuardadas: number;        // imágenes de Open Food Facts guardadas en esta ejecución
  portalRevisados: number;     // pedidos al portal con respuesta
  portalConImagen: number;
  portalSinRespuesta: number;  // fallos de red: quedan pendientes
  totales: ImageTotals | null;
  segundos: number | null;
}

// ── Reglas ─────────────────────────────────────────────

export const USER_AGENT = 'ElChanguito/2.0 (https://elchanguito.vercel.app)';
/** Días que tienen que pasar para volver a revisar un EAN */
export const REVIEW_DAYS = 90;
/** Pedidos al portal por ejecución: es un servidor público */
export const PORTAL_LIMIT = 5000;
const PORTAL_CONCURRENCY = 5;
const PORTAL_TIMEOUT_MS = 10_000;
/** Fallos de red seguidos con los que se da por caído el portal */
const PORTAL_MAX_FAILURES = 25;
/**
 * Export diario de Open Food Facts (~1,5 GB comprimido, separado por tabulaciones). Su documentación pide usarlo en
 * lugar de la API para más de unos cientos de productos: la búsqueda tiene un límite global y devuelve 503
 */
export const OFF_EXPORT_URL = 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz';
const OFF_ATTEMPTS = 3;
/** Espera antes de reintentar la descarga: 1 min, 2 min */
const OFF_RETRY_MS = 60_000;
/** Límite de una descarga entera: el workflow tiene 60 minutos y el portal necesita unos 8 */
const OFF_TIMEOUT_MS = 40 * 60_000;
/** Resultados del portal que se guardan juntos: si la ejecución se corta, lo revisado no se pierde */
const SAVE_EVERY = 500;

// ── URLs ─────────────────────────────────────────────

/** Imagen del producto en el portal Precios Claros (responde 403 si no existe) */
export function portalImageUrl(ean: string): string {
  return `https://imagenes.preciosclaros.gob.ar/productos/${ean}.jpg`;
}

// ── Open Food Facts ─────────────────────────────────────────────

/** Posición de las columnas que se usan del export */
export interface OffColumns {
  code: number;
  image: number;
}

/** Columnas del export a partir de su encabezado: el código y la imagen chica (200 px); null si falta alguna */
export function offColumns(header: string): OffColumns | null {
  const names = header.replace(/\r$/, '').split('\t');
  const code = names.indexOf('code');
  const image = names.indexOf('image_small_url');
  return code === -1 || image === -1 ? null : { code, image };
}

/**
 * EAN (GTIN-13) e imagen de una fila del export; null si el código no es un GTIN válido o la imagen no es https.
 * No se filtra por país: lo que decide es que el EAN esté en el catálogo del SEPA
 */
export function offImage(line: string, columns: OffColumns): [ean: string, url: string] | null {
  const fields = line.split('\t');
  const code = fields[columns.code]?.trim();
  const url = fields[columns.image]?.trim();
  if (!code || !url || !url.startsWith('https://')) return null;
  const ean = toGtin13(code);
  return ean ? [ean, url] : null;
}

// ── Elección de fuente ─────────────────────────────────────────────

/** `YYYY-MM-DD` de `days` días antes de `today` */
function daysBefore(today: string, days: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** true si ya pasaron los 90 días desde la última revisión (o si nunca se revisó) */
export function isDue(revisado: string | undefined, today: string): boolean {
  return revisado === undefined || revisado <= daysBefore(today, REVIEW_DAYS);
}

/**
 * Filas de Open Food Facts a guardar: las imágenes del export cuyos EAN están en el catálogo.
 * Open Food Facts va primero: reemplaza una imagen del portal o un "sin imagen" aunque no hayan pasado los 90 días.
 * Una fila que ya está igual y revisada hoy no se vuelve a escribir.
 */
export function offRows(
  catalog: readonly CatalogProduct[],
  offImages: ReadonlyMap<string, string>,
  existing: ReadonlyMap<string, ImageRow>,
  today: string,
): ImageRow[] {
  const rows: ImageRow[] = [];
  for (const { ean } of catalog) {
    const url = offImages.get(ean);
    if (url === undefined) continue;
    const current = existing.get(ean);
    if (current && current.url === url && current.fuente === 'off' && current.revisado === today) continue;
    rows.push({ ean, url, fuente: 'off', revisado: today });
  }
  return rows;
}

/**
 * EAN que toca pedirle al portal, de mayor a menor cantidad de banderas, hasta `limit`:
 * los que Open Food Facts no trajo en esta ejecución y que nunca se revisaron o se revisaron hace 90 días o más.
 * Si el export de Open Food Facts no se leyó entero (`offComplete` false), las imágenes que ya eran de
 * Open Food Facts se dejan como están: que falten del export no quiere decir que ya no existan.
 */
export function portalQueue(
  catalog: readonly CatalogProduct[],
  offImages: ReadonlyMap<string, string>,
  existing: ReadonlyMap<string, ImageRow>,
  today: string,
  offComplete: boolean,
  limit: number = PORTAL_LIMIT,
): string[] {
  return catalog
    .filter(({ ean }) => {
      if (offImages.has(ean)) return false;
      const current = existing.get(ean);
      if (current?.fuente === 'off' && !offComplete) return false;
      return isDue(current?.revisado, today);
    })
    .sort((a, b) => b.banderas - a.banderas || (a.ean < b.ean ? -1 : 1))
    .slice(0, limit)
    .map(p => p.ean);
}

/** Fila que deja la respuesta del portal: 200 → la URL; otro código → se buscó y no hay */
export function portalRow(ean: string, status: number, today: string): ImageRow {
  return status === 200
    ? { ean, url: portalImageUrl(ean), fuente: 'preciosclaros', revisado: today }
    : { ean, url: null, fuente: null, revisado: today };
}

// ── Resumen ─────────────────────────────────────────────

const NUMBER = new Intl.NumberFormat('es-AR');
const PERCENT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

function share(part: number, total: number): string {
  return total === 0 ? NUMBER.format(part) : `${NUMBER.format(part)} (${PERCENT.format((part / total) * 100)} %)`;
}

/** Filas del resumen: etiqueta y valor, para la consola y para la tabla Markdown */
export function summaryRows(run: ImagesSummary): [string, string][] {
  const rows: [string, string][] = [
    ['Resultado', run.error ? `error — ${run.error}` : 'ok'],
    ['Open Food Facts', `${NUMBER.format(run.offProductos)} productos en el export${run.offCompleto ? '' : ' (incompleto)'} · ` +
      `${NUMBER.format(run.offGuardadas)} imágenes guardadas`],
    ['Portal Precios Claros', `${NUMBER.format(run.portalRevisados)} revisados · ` +
      `${NUMBER.format(run.portalConImagen)} con imagen · ${NUMBER.format(run.portalSinRespuesta)} sin respuesta`],
    ['Revisados en esta ejecución', NUMBER.format(run.offGuardadas + run.portalRevisados)],
  ];
  const t = run.totales;
  if (t) {
    rows.push(
      ['Productos del catálogo', NUMBER.format(t.productos)],
      ['Con imagen', share(t.off + t.preciosClaros, t.productos)],
      ['— de Open Food Facts', share(t.off, t.productos)],
      ['— de Precios Claros', share(t.preciosClaros, t.productos)],
      ['Sin imagen', share(t.sinImagen, t.productos)],
      ['Pendientes de revisar', share(t.pendientes, t.productos)],
    );
  }
  rows.push(['Duración', formatDuration(run.segundos)]);
  return rows;
}

/** Tabla Markdown para el job summary de GitHub */
export function buildImagesSummary(run: ImagesSummary): string {
  return [
    '## SEPA — imágenes de productos',
    '',
    '| | |',
    '|---|---|',
    ...summaryRows(run).map(([label, value]) => `| ${label} | ${value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')} |`),
    '',
    '',
  ].join('\n');
}

// ── Red ─────────────────────────────────────────────

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

interface OffResult {
  /** Imagen de los EAN del catálogo que tienen una en el export */
  images: Map<string, string>;
  /** Filas leídas del export */
  products: number;
  /** false si no se pudo leer entero */
  complete: boolean;
}

/** Lee el export en streaming (sin guardarlo) y se queda con las imágenes de los EAN del catálogo. Hasta 3 intentos */
async function fetchOffImages(catalog: ReadonlySet<string>): Promise<OffResult> {
  let last: OffResult = { images: new Map(), products: 0, complete: false };
  for (let attempt = 1; attempt <= OFF_ATTEMPTS; attempt++) {
    const images = new Map<string, string>();
    let products = 0;
    try {
      const response = await fetch(OFF_EXPORT_URL, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      const lines = createInterface({
        input: Readable.fromWeb(response.body as WebReadableStream).pipe(createGunzip()),
        crlfDelay: Infinity,
      });
      let columns: OffColumns | null = null;
      for await (const line of lines) {
        if (!columns) {
          columns = offColumns(line);
          if (!columns) throw new Error('el export no tiene las columnas code e image_small_url');
          continue;
        }
        products++;
        if (products % 1_000_000 === 0) console.log(`Open Food Facts: ${NUMBER.format(products)} productos leídos`);
        const found = offImage(line, columns);
        if (found && catalog.has(found[0]) && !images.has(found[0])) images.set(found[0], found[1]);
      }
      return { images, products, complete: true };
    } catch (error) {
      console.error(`Open Food Facts, intento ${attempt}: ${message(error)}`);
      // Lo leído de un intento cortado sirve igual; se guarda el mejor por si fallan todos
      if (images.size > last.images.size) last = { images, products, complete: false };
      if (attempt < OFF_ATTEMPTS) await sleep(OFF_RETRY_MS * attempt);
    }
  }
  return last;
}

/** Código de respuesta del portal para la imagen de un EAN; null si no hubo respuesta */
async function headPortal(ean: string): Promise<number | null> {
  try {
    const response = await fetch(portalImageUrl(ean), {
      method: 'HEAD',
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(PORTAL_TIMEOUT_MS),
    });
    return response.status;
  } catch {
    return null;
  }
}

// ── Base ─────────────────────────────────────────────

/** Fecha de hoy en la Argentina, `YYYY-MM-DD` */
function todayAr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}

async function readCatalog(client: pg.Client): Promise<CatalogProduct[]> {
  const { rows } = await client.query<CatalogProduct>('select ean, banderas from public.sepa_productos');
  return rows;
}

async function readImages(client: pg.Client): Promise<Map<string, ImageRow>> {
  const { rows } = await client.query<ImageRow>(
    'select ean, url, fuente, revisado::text as revisado from public.sepa_imagenes');
  return new Map(rows.map(row => [row.ean, row]));
}

async function saveRows(client: pg.Client, rows: readonly ImageRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 1000) {
    const batch = rows.slice(i, i + 1000);
    await client.query(
      `insert into public.sepa_imagenes (ean, url, fuente, revisado)
       select * from unnest($1::text[], $2::text[], $3::text[], $4::date[])
       on conflict (ean) do update set url = excluded.url, fuente = excluded.fuente, revisado = excluded.revisado`,
      [batch.map(r => r.ean), batch.map(r => r.url), batch.map(r => r.fuente), batch.map(r => r.revisado)],
    );
  }
}

async function readTotals(client: pg.Client): Promise<ImageTotals> {
  const { rows } = await client.query<Record<keyof ImageTotals, string>>(`
    select count(*) as productos,
           count(*) filter (where i.fuente = 'off' and i.url is not null) as off,
           count(*) filter (where i.fuente = 'preciosclaros' and i.url is not null) as "preciosClaros",
           count(*) filter (where i.ean is not null and i.url is null) as "sinImagen",
           count(*) filter (where i.ean is null) as pendientes
    from public.sepa_productos p
    left join public.sepa_imagenes i using (ean)
  `);
  const row = rows[0]!;
  return {
    productos: Number(row.productos),
    off: Number(row.off),
    preciosClaros: Number(row.preciosClaros),
    sinImagen: Number(row.sinImagen),
    pendientes: Number(row.pendientes),
  };
}

// ── Punto de entrada ─────────────────────────────────────────────

/** Pide al portal los EAN de la cola, 5 a la vez, y guarda de a tandas */
async function reviewPortal(client: pg.Client, queue: readonly string[], today: string, run: ImagesSummary): Promise<void> {
  let next = 0;
  let failures = 0;      // fallos de red seguidos
  let pending: ImageRow[] = [];
  let saving: Promise<void> = Promise.resolve();

  const flush = () => {
    const rows = pending;
    pending = [];
    saving = saving.then(() => saveRows(client, rows));
    return saving;
  };

  const worker = async () => {
    while (next < queue.length && failures < PORTAL_MAX_FAILURES) {
      const ean = queue[next++]!;
      const status = await headPortal(ean);
      if (status === null) {
        failures++;
        run.portalSinRespuesta++;
        continue;
      }
      failures = 0;
      run.portalRevisados++;
      if (status === 200) run.portalConImagen++;
      pending.push(portalRow(ean, status, today));
      if (pending.length >= SAVE_EVERY) {
        await flush();
        console.log(`Portal: ${NUMBER.format(run.portalRevisados)} de ${NUMBER.format(queue.length)} ` +
          `(${NUMBER.format(run.portalConImagen)} con imagen)`);
      }
    }
  };

  await Promise.all(Array.from({ length: PORTAL_CONCURRENCY }, worker));
  await flush();
  if (failures >= PORTAL_MAX_FAILURES) {
    console.error(`Portal: ${PORTAL_MAX_FAILURES} pedidos seguidos sin respuesta; el resto queda pendiente.`);
  }
}

async function main(): Promise<number> {
  const start = performance.now();
  const run: ImagesSummary = {
    error: null, offProductos: 0, offCompleto: false, offGuardadas: 0,
    portalRevisados: 0, portalConImagen: 0, portalSinRespuesta: 0, totales: null, segundos: null,
  };
  let client: pg.Client | null = null;
  let connected = false;

  try {
    const url = process.env.SUPABASE_DB_URL;
    if (!url) throw new Error('Falta SUPABASE_DB_URL (Session pooler de Supabase) en .env.local o en el entorno');
    client = await connect(url);
    connected = true;

    const today = todayAr();
    const catalog = await readCatalog(client);
    const existing = await readImages(client);
    console.log(`Catálogo: ${NUMBER.format(catalog.length)} productos · ${NUMBER.format(existing.size)} ya revisados`);

    // 1. Open Food Facts, del export
    console.log('Open Food Facts: leyendo el export…');
    const off = await fetchOffImages(new Set(catalog.map(p => p.ean)));
    run.offProductos = off.products;
    run.offCompleto = off.complete;
    const rows = offRows(catalog, off.images, existing, today);
    await saveRows(client, rows);
    run.offGuardadas = rows.length;
    console.log(`Open Food Facts: ${NUMBER.format(off.images.size)} productos del catálogo con imagen, ` +
      `${NUMBER.format(rows.length)} guardadas`);

    // 2. Precios Claros, de a uno
    const queue = portalQueue(catalog, off.images, existing, today, off.complete);
    console.log(`Portal Precios Claros: ${NUMBER.format(queue.length)} EAN por revisar`);
    await reviewPortal(client, queue, today, run);

    run.totales = await readTotals(client);
  } catch (error) {
    run.error = message(error);
    console.error(`Error: ${run.error}`);
  } finally {
    // Si se cortó a mitad de camino, el resumen igual informa cómo quedó la tabla
    if (client && connected && !run.totales) run.totales = await readTotals(client).catch(() => null);
    await client?.end().catch(() => {});
    run.segundos = (performance.now() - start) / 1000;
    console.log('');
    for (const [label, value] of summaryRows(run)) console.log(`${`${label}:`.padEnd(30)}${value}`);
    const path = process.env.GITHUB_STEP_SUMMARY;
    if (path) {
      await appendFile(path, buildImagesSummary(run), 'utf8')
        .catch(error => console.error(`No se pudo escribir el resumen en ${path}: ${message(error)}`));
    }
  }
  // Código 1 solo si no se pudo conectar a la base
  return connected ? 0 : 1;
}

if (import.meta.main) process.exitCode = await main();
