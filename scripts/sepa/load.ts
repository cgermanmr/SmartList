// Carga del SEPA en Supabase con pg, en una sola transacción (spec 08, Reglas → Carga)

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import type { SepaData } from './etl.ts';

export type Estado = 'ok' | 'omitida' | 'error';

export interface CargaResult {
  estado: Estado;
  detalle: string | null;
  preciosEnBase?: number;   // count(*) de sepa_precios después de una carga ok
}

export interface LoadOptions {
  force: boolean;
  inicio: Date;
}

const BATCH = 1000;
const MAX_DAYS_ABSENT = 14;
const MIN_RATIO = 0.5;

// ── Conexión ─────────────────────────────────────────────

/** Autoridad certificante de Supabase: cifra la conexión y verifica que el servidor sea el del proyecto */
const CA_FILE = join(import.meta.dirname, '../../supabase/prod-ca-2021.crt');

export async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url, ssl: { ca: readFileSync(CA_FILE, 'utf8') } });
  await client.connect();
  return client;
}

// ── INSERT multi-fila ─────────────────────────────────────────────

/** `insert into table (cols) values ($1, $2), ($3, $4)…` con sus parámetros */
export function buildInsert(table: string, columns: readonly string[], rows: readonly unknown[][]): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const tuples = rows.map(row => {
    if (row.length !== columns.length) throw new Error(`${table}: la fila tiene ${row.length} valores y hay ${columns.length} columnas`);
    return `(${row.map(value => `$${values.push(value)}`).join(', ')})`;
  });
  return { text: `insert into ${table} (${columns.join(', ')}) values ${tuples.join(', ')}`, values };
}

async function insertBatches(client: pg.Client, table: string, columns: readonly string[], rows: readonly unknown[][]): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { text, values } = buildInsert(table, columns, rows.slice(i, i + BATCH));
    await client.query(text, values);
  }
}

// ── Reglas de fecha y freno ─────────────────────────────────────────────

interface UltimaCarga {
  maxFecha: string | null;          // fecha_archivo más reciente entre las cargas ok
  mismaFecha: boolean;              // ya hay una carga ok con esta fecha_archivo
  filasPrecios: number | null;      // filas_precios de la última carga ok
}

async function ultimaCarga(client: pg.Client, fechaArchivo: string): Promise<UltimaCarga> {
  const { rows } = await client.query<{ max_fecha: string | null; misma_fecha: boolean; filas_precios: number | null }>(`
    select
      (select max(fecha_archivo)::text from public.sepa_cargas where estado = 'ok') as max_fecha,
      exists (select 1 from public.sepa_cargas where estado = 'ok' and fecha_archivo = $1::date) as misma_fecha,
      (select filas_precios from public.sepa_cargas where estado = 'ok' order by id desc limit 1) as filas_precios
  `, [fechaArchivo]);
  return { maxFecha: rows[0].max_fecha, mismaFecha: rows[0].misma_fecha, filasPrecios: rows[0].filas_precios };
}

/** Motivo para no cargar (reglas 1 a 3), o null si se puede cargar */
export function checkRules(data: Pick<SepaData, 'fechaArchivo' | 'precios'>, ultima: UltimaCarga, force: boolean): { estado: Estado; detalle: string } | null {
  if (!force && ultima.maxFecha !== null && data.fechaArchivo < ultima.maxFecha) {
    return { estado: 'omitida', detalle: `archivo anterior a la última carga (${ultima.maxFecha})` };
  }
  if (!force && ultima.mismaFecha) {
    return { estado: 'omitida', detalle: `ya hay una carga ok del ${data.fechaArchivo}` };
  }
  if (ultima.filasPrecios !== null && data.precios.length < ultima.filasPrecios * MIN_RATIO) {
    return {
      estado: 'error',
      detalle: `freno de seguridad: ${data.precios.length} filas de precios, menos del 50 % de las ${ultima.filasPrecios} de la última carga ok`,
    };
  }
  return null;
}

// ── Registro ─────────────────────────────────────────────

async function registrar(client: pg.Client, data: SepaData, options: LoadOptions, estado: Estado, detalle: string | null): Promise<void> {
  await client.query(`
    insert into public.sepa_cargas
      (fecha_archivo, inicio, fin, estado, banderas_ok, omitidos, filas_leidas, filas_precios, detalle)
    values ($1, $2, clock_timestamp(), $3, $4, $5, $6, $7, $8)   -- now() sería el inicio de la transacción
  `, [
    data.fechaArchivo, options.inicio, estado, data.banderas.length, JSON.stringify(data.omitidos),
    data.filasLeidas, data.precios.length, detalle,
  ]);
}

// ── Carga ─────────────────────────────────────────────

async function cargar(client: pg.Client, data: SepaData): Promise<void> {
  const fecha = data.fechaArchivo;

  // 4. Tablas temporales
  await client.query(`
    create temp table tmp_banderas (
      id text primary key, comercio_id integer, bandera_id integer, nombre text, razon_social text, sucursales integer
    ) on commit drop;
    create temp table tmp_productos (
      ean text primary key, descripcion text, marca text, cantidad numeric(12,3), unidad text
    ) on commit drop;
    create temp table tmp_precios (
      ean text, bandera text, minimo numeric(12,2), mediana numeric(12,2), maximo numeric(12,2), sucursales integer,
      primary key (ean, bandera)
    ) on commit drop;
  `);
  await insertBatches(client, 'tmp_banderas', ['id', 'comercio_id', 'bandera_id', 'nombre', 'razon_social', 'sucursales'],
    data.banderas.map(b => [b.id, b.comercioId, b.banderaId, b.nombre, b.razonSocial, b.sucursales]));
  await insertBatches(client, 'tmp_productos', ['ean', 'descripcion', 'marca', 'cantidad', 'unidad'],
    data.productos.map(p => [p.ean, p.descripcion, p.marca, p.cantidad, p.unidad]));
  await insertBatches(client, 'tmp_precios', ['ean', 'bandera', 'minimo', 'mediana', 'maximo', 'sucursales'],
    data.precios.map(p => [p.ean, p.bandera, p.minimo, p.mediana, p.maximo, p.sucursales]));
  await client.query('analyze tmp_banderas; analyze tmp_productos; analyze tmp_precios;');

  // 5. Banderas y productos
  await client.query(`
    insert into public.sepa_banderas (id, comercio_id, bandera_id, nombre, razon_social, sucursales, actualizado)
    select id, comercio_id, bandera_id, nombre, razon_social, sucursales, $1::date from tmp_banderas
    on conflict (id) do update set
      comercio_id = excluded.comercio_id, bandera_id = excluded.bandera_id, nombre = excluded.nombre,
      razon_social = excluded.razon_social, sucursales = excluded.sucursales, actualizado = excluded.actualizado
  `, [fecha]);
  await client.query(`
    insert into public.sepa_productos (ean, descripcion, marca, cantidad, unidad, banderas, actualizado)
    select ean, descripcion, marca, cantidad, unidad, 0, $1::date from tmp_productos
    on conflict (ean) do update set
      descripcion = excluded.descripcion, marca = excluded.marca, cantidad = excluded.cantidad,
      unidad = excluded.unidad, actualizado = excluded.actualizado
  `, [fecha]);

  // 6. Precios de las banderas cargadas: upsert y borrado de los que dejaron de informar
  await client.query(`
    insert into public.sepa_precios (ean, bandera, minimo, mediana, maximo, sucursales, actualizado)
    select ean, bandera, minimo, mediana, maximo, sucursales, $1::date from tmp_precios
    on conflict (ean, bandera) do update set
      minimo = excluded.minimo, mediana = excluded.mediana, maximo = excluded.maximo,
      sucursales = excluded.sucursales, actualizado = excluded.actualizado
  `, [fecha]);
  await client.query(`
    delete from public.sepa_precios p
    using tmp_banderas b
    where p.bandera = b.id
      and not exists (select 1 from tmp_precios t where t.ean = p.ean and t.bandera = p.bandera)
  `);

  // 7. Banderas ausentes hace más de 14 días (la cascada borra sus precios)
  await client.query(`
    delete from public.sepa_banderas
    where id not in (select id from tmp_banderas) and $1::date - actualizado > $2
  `, [fecha, MAX_DAYS_ABSENT]);

  // 8. Productos sin ningún precio
  await client.query(`
    delete from public.sepa_productos p
    where not exists (select 1 from public.sepa_precios x where x.ean = p.ean)
  `);

  // 9. Banderas con precio de cada producto
  await client.query(`
    update public.sepa_productos p set banderas = c.n
    from (select ean, count(*)::integer as n from public.sepa_precios group by ean) c
    where c.ean = p.ean and p.banderas <> c.n
  `);
}

/** Aplica las reglas de carga y registra la ejecución en sepa_cargas */
export async function loadSepa(client: pg.Client, data: SepaData, options: LoadOptions): Promise<CargaResult> {
  // 1–3. Fecha y freno: se deciden antes de tocar las tablas
  const regla = checkRules(data, await ultimaCarga(client, data.fechaArchivo), options.force);
  if (regla) {
    await registrar(client, data, options, regla.estado, regla.detalle);
    return regla;
  }

  try {
    await client.query('begin');
    await client.query(`set local statement_timeout = '10min'`);
    await cargar(client, data);
    // 10. Registro dentro de la transacción: queda solo si la carga se confirma
    await registrar(client, data, options, 'ok', null);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    const detalle = error instanceof Error ? error.message : String(error);
    await registrar(client, data, options, 'error', detalle);
    return { estado: 'error', detalle };
  }

  const { rows } = await client.query<{ n: number }>('select count(*)::integer as n from public.sepa_precios');
  return { estado: 'ok', detalle: null, preciosEnBase: rows[0].n };
}
