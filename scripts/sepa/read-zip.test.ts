import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { ComercioOutcome } from './read-zip.ts';
import { readSepaZip } from './read-zip.ts';

// ── ZIP anidado de prueba, con la misma forma que el archivo del SEPA ─────────────────────────────

const PIE = 'Ultima actualizaci�n: 2026-10-30T09:19:16-03:00';
const PRODUCTOS_HEADER = 'id_comercio|id_bandera|id_sucursal|id_producto|productos_ean|productos_descripcion|productos_cantidad_presentacion|productos_unidad_medida_presentacion|productos_marca|productos_precio_lista|productos_precio_referencia|productos_cantidad_referencia|productos_unidad_medida_referencia|productos_precio_unitario_promo1|productos_leyenda_promo1|productos_precio_unitario_promo2|productos_leyenda_promo2';

function comercioCsv(id: string, pie = PIE): string {
  return [
    '﻿id_comercio|id_bandera|comercio_cuit|comercio_razon_social|comercio_bandera_nombre|comercio_bandera_url|comercio_ultima_actualizacion|comercio_version_sepa',
    `${id}|1|30687310434|INC S.A.|Hipermercado Carrefour|www.carrefour.com.ar|2026-10-30T08:30:02-03:00|1.0`,
    pie,
  ].join('\r\n');
}

function sucursalesCsv(id: string): string {
  return [
    'id_comercio|id_bandera|id_sucursal|sucursales_nombre',
    `${id}|1|1|Centro`,
    `${id}|1|2|Norte`,
    PIE,
  ].join('\r\n');
}

function productosCsv(id: string, rows: number, pie = PIE): string {
  const lines = ['﻿' + PRODUCTOS_HEADER];
  for (let i = 0; i < rows; i++) {
    const sucursal = (i % 2) + 1;
    lines.push(`${id}|1|${sucursal}|7791720048313|1|MIX CROCANTE CARREFOUR CLASSIC X 40 GRS|1|UNI|CARREFOUR CLASSIC|${2000 + i}.00|52250.00|40|GRM||||`);
  }
  lines.push(pie);
  return lines.join('\r\n');
}

/** ZIP interno de un comercio; `productos.csv` primero, como en el ZIP de Carrefour */
function innerZip(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));
}

function outerZip(inner: Record<string, Uint8Array>, folder = '2026-10-30'): Uint8Array {
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const [name, data] of Object.entries(inner)) entries[`${folder}/${name}`] = [data, { level: 0 }];
  return zipSync(entries);
}

/** Entrega el ZIP en pedazos chicos, como un stream de archivo */
function* chunks(data: Uint8Array, size: number): Generator<Uint8Array> {
  for (let i = 0; i < data.length; i += size) yield data.subarray(i, i + size);
}

async function read(data: Uint8Array, chunkSize = 4096) {
  const outcomes: ComercioOutcome[] = [];
  const { fechaArchivo } = await readSepaZip(chunks(data, chunkSize), outcome => outcomes.push(outcome));
  return { fechaArchivo, outcomes };
}

const OK = 'sepa_2_comercio-sepa-10_2026-10-30_01-05-08.zip';

describe('readSepaZip', () => {
  it('lee la fecha del archivo de la carpeta YYYY-MM-DD', async () => {
    const zip = outerZip({ [OK]: innerZip({ 'productos.csv': productosCsv('10', 2), 'comercio.csv': comercioCsv('10'), 'sucursales.csv': sucursalesCsv('10') }) });
    expect((await read(zip)).fechaArchivo).toBe('2026-10-30');
  });

  it('agrega un comercio aunque productos.csv venga antes que sucursales.csv', async () => {
    const zip = outerZip({ [OK]: innerZip({ 'productos.csv': productosCsv('10', 4), 'comercio.csv': comercioCsv('10'), 'sucursales.csv': sucursalesCsv('10') }) });
    const [outcome] = (await read(zip)).outcomes;
    expect(outcome.archivo).toBe(OK);
    expect(outcome.motivo).toBeUndefined();
    expect(outcome.result!.banderas).toEqual([
      { id: '10-1', comercioId: 10, banderaId: 1, nombre: 'Hipermercado Carrefour', razonSocial: 'INC S.A.', sucursales: 2 },
    ]);
    expect(outcome.result!.precios).toEqual([
      { ean: '7791720048313', bandera: '10-1', minimo: 2000, mediana: 2001.5, maximo: 2003, sucursales: 4 },
    ]);
  });

  it('recorre en streaming un productos.csv más grande que un pedazo, sin perder líneas', async () => {
    const rows = 20000;
    const zip = outerZip({ [OK]: innerZip({ 'comercio.csv': comercioCsv('10'), 'sucursales.csv': sucursalesCsv('10'), 'productos.csv': productosCsv('10', rows) }) });
    const [outcome] = (await read(zip, 1000)).outcomes;
    expect(outcome.result!.filasLeidas).toBe(rows);
    expect(outcome.result!.filasValidas).toBe(rows);
    expect(outcome.result!.precios[0]).toMatchObject({ minimo: 2000, maximo: 2000 + rows - 1, sucursales: rows });
  });

  it('un ZIP interno vacío queda omitido como zip roto y no corta la lectura', async () => {
    const zip = outerZip({
      'sepa_2_comercio-sepa-36_2026-10-30_01-05-08.zip': new Uint8Array(0),
      [OK]: innerZip({ 'comercio.csv': comercioCsv('10'), 'sucursales.csv': sucursalesCsv('10'), 'productos.csv': productosCsv('10', 2) }),
    });
    const { outcomes } = await read(zip);
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]).toEqual({ archivo: 'sepa_2_comercio-sepa-36_2026-10-30_01-05-08.zip', motivo: 'zip roto' });
    expect(outcomes[1].result).toBeDefined();
  });

  it('un ZIP interno con basura queda omitido como zip roto', async () => {
    const zip = outerZip({ 'sepa_1_comercio-sepa-99.zip': strToU8('esto no es un zip') });
    expect((await read(zip)).outcomes[0]).toEqual({ archivo: 'sepa_1_comercio-sepa-99.zip', motivo: 'zip roto' });
  });

  it('una columna faltante en productos.csv omite el comercio por encabezados inválidos', async () => {
    const sinPrecio = productosCsv('10', 2).replace('|productos_precio_lista', '');
    const zip = outerZip({
      'sepa_1_comercio-sepa-98.zip': innerZip({ 'comercio.csv': comercioCsv('10'), 'sucursales.csv': sucursalesCsv('10'), 'productos.csv': sinPrecio }),
      [OK]: innerZip({ 'comercio.csv': comercioCsv('10'), 'sucursales.csv': sucursalesCsv('10'), 'productos.csv': productosCsv('10', 2) }),
    });
    const { outcomes } = await read(zip);
    expect(outcomes[0]).toEqual({ archivo: 'sepa_1_comercio-sepa-98.zip', motivo: 'encabezados inválidos' });
    expect(outcomes[1].result).toBeDefined();
  });

  it('un CSV faltante omite el comercio por encabezados inválidos', async () => {
    const zip = outerZip({ 'sepa_1_comercio-sepa-97.zip': innerZip({ 'comercio.csv': comercioCsv('10'), 'productos.csv': productosCsv('10', 2) }) });
    expect((await read(zip)).outcomes[0]).toEqual({ archivo: 'sepa_1_comercio-sepa-97.zip', motivo: 'encabezados inválidos' });
  });

  it('omite un comercio con el pie de productos.csv de más de 7 días (Unicoop)', async () => {
    const viejo = 'Ultima actualizacion: 2025-06-11T21:00:01-03:00';
    const zip = outerZip({
      'sepa_1_comercio-sepa-47.zip': innerZip({ 'comercio.csv': comercioCsv('47', viejo), 'sucursales.csv': sucursalesCsv('47'), 'productos.csv': productosCsv('47', 2, viejo) }),
    });
    expect((await read(zip)).outcomes[0]).toEqual({ archivo: 'sepa_1_comercio-sepa-47.zip', motivo: 'desactualizado' });
  });

  it('usa el pie de productos.csv y no el de comercio.csv (Changomás)', async () => {
    const viejo = 'Ultima actualizacion: 2021-04-03T12:53:43-03:00';
    const zip = outerZip({ [OK]: innerZip({ 'comercio.csv': comercioCsv('10', viejo), 'sucursales.csv': sucursalesCsv('10'), 'productos.csv': productosCsv('10', 2) }) });
    expect((await read(zip)).outcomes[0].result).toBeDefined();
  });

  it('omite un productos.csv sin pie con fecha', async () => {
    const sinPie = productosCsv('10', 2).split('\r\n').slice(0, -1).join('\r\n');
    const zip = outerZip({ [OK]: innerZip({ 'comercio.csv': comercioCsv('10'), 'sucursales.csv': sucursalesCsv('10'), 'productos.csv': sinPie }) });
    expect((await read(zip)).outcomes[0]).toEqual({ archivo: OK, motivo: 'sin fecha de actualización' });
  });

  it('junta un registro partido por saltos de línea dentro de los campos (Comodín)', async () => {
    const sucursales = [
      'id_comercio|id_bandera|id_sucursal|sucursales_nombre|sucursales_latitud|sucursales_longitud|sucursales_barrio',
      '10|1|1|Centro|-24.183838',
      '|-65.304235',
      '|Centro',
      '10|1|2|Norte|-24.17|-65.30|Norte',
      PIE,
    ].join('\r\n');
    const zip = outerZip({ [OK]: innerZip({ 'comercio.csv': comercioCsv('10'), 'sucursales.csv': sucursales, 'productos.csv': productosCsv('10', 4) }) });
    const [outcome] = (await read(zip)).outcomes;
    expect(outcome.result!.banderas[0].sucursales).toBe(2);
    expect(outcome.result!.filasValidas).toBe(4);
  });

  it('descarta un pedazo de registro que no se completa y lee la línea siguiente sola', async () => {
    const sucursales = [
      'id_comercio|id_bandera|id_sucursal|sucursales_nombre',
      '10|1|1',
      '10|1|2|Norte',
      PIE,
    ].join('\r\n');
    const zip = outerZip({ [OK]: innerZip({ 'comercio.csv': comercioCsv('10'), 'sucursales.csv': sucursales, 'productos.csv': productosCsv('10', 4) }) });
    const [outcome] = (await read(zip)).outcomes;
    expect(outcome.result!.banderas[0].sucursales).toBe(1);
    expect(outcome.result!.filasValidas).toBe(2);   // solo las filas de la sucursal 2
  });

  it('falla si el ZIP no tiene la carpeta YYYY-MM-DD', async () => {
    const zip = zipSync({ 'otro.zip': [new Uint8Array(0), { level: 0 }] });
    await expect(read(zip)).rejects.toThrow(/YYYY-MM-DD/);
  });
});
