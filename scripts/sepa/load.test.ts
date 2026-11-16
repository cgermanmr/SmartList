import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import type { SepaData } from './etl.ts';
import { LOCK_KEY, LOCK_TAKEN, buildInsert, checkRules, loadSepa, preciosSucursalRow } from './load.ts';

describe('buildInsert', () => {
  it('arma un INSERT multi-fila con un parámetro por valor', () => {
    const { text, values } = buildInsert('tmp_precios', ['ean', 'minimo'], [['7791720048313', 2090], ['0000077956262', 4210]]);
    expect(text).toBe('insert into tmp_precios (ean, minimo) values ($1, $2), ($3, $4)');
    expect(values).toEqual(['7791720048313', 2090, '0000077956262', 4210]);
  });

  it('falla si una fila no tiene un valor por columna', () => {
    expect(() => buildInsert('tmp_precios', ['ean', 'minimo'], [['7791720048313']])).toThrow(/columnas/);
  });
});

describe('checkRules', () => {
  const precios = (n: number) => Array.from({ length: n }, () => ({ ean: '', bandera: '', minimo: 1, mediana: 1, maximo: 1, sucursales: 1 }));
  const sinCargas = { maxFecha: null, mismaFecha: false, filasPrecios: null };
  const viernes = { fechaArchivo: '2026-10-30', precios: precios(100) };

  it('sin carga ok previa se carga, sin freno', () => {
    expect(checkRules({ fechaArchivo: '2026-10-30', precios: precios(1) }, sinCargas, false)).toBeNull();
  });

  it('1. un archivo anterior a la última carga ok se omite, salvo --force', () => {
    const ultima = { maxFecha: '2026-11-02', mismaFecha: false, filasPrecios: 100 };
    expect(checkRules(viernes, ultima, false)).toEqual({ estado: 'omitida', detalle: 'archivo anterior a la última carga (2026-11-02)' });
    expect(checkRules(viernes, ultima, true)).toBeNull();
  });

  it('2. un archivo con la misma fecha que una carga ok se omite, salvo --force', () => {
    const ultima = { maxFecha: '2026-10-30', mismaFecha: true, filasPrecios: 100 };
    expect(checkRules(viernes, ultima, false)?.estado).toBe('omitida');
    expect(checkRules(viernes, ultima, true)).toBeNull();
  });

  it('3. el freno del 50 % frena también con --force', () => {
    const ultima = { maxFecha: '2026-10-29', mismaFecha: false, filasPrecios: 201 };
    expect(checkRules(viernes, ultima, false)?.estado).toBe('error');
    expect(checkRules(viernes, ultima, true)?.detalle).toMatch(/freno de seguridad/);
  });

  it('3. justo el 50 % pasa el freno', () => {
    expect(checkRules(viernes, { maxFecha: '2026-10-29', mismaFecha: false, filasPrecios: 200 }, false)).toBeNull();
  });
});

describe('loadSepa: bloqueo', () => {
  const data: SepaData = {
    fechaArchivo: '2026-11-04', banderas: [], precios: [], productos: [], sucursales: [], preciosSucursal: [],
    sinCoordenadas: 0, omitidos: [], filasLeidas: 0, filasValidas: 0,
  };
  const options = { force: true, inicio: new Date('2026-11-04T18:30:00Z') };

  /** Cliente falso que registra cada consulta; `pg_try_advisory_lock` devuelve `locked` */
  function fakeClient(locked: boolean, failOn?: RegExp) {
    const queries: { text: string; values?: unknown[] }[] = [];
    const client = {
      query: async (text: string, values?: unknown[]) => {
        queries.push({ text, values });
        if (failOn?.test(text)) throw new Error('falla simulada');
        if (text.includes('pg_try_advisory_lock')) return { rows: [{ locked }] };
        if (text.includes('max_fecha')) return { rows: [{ max_fecha: null, misma_fecha: false, filas_precios: null }] };
        if (text.includes('count(*)')) return { rows: [{ n: 0 }] };
        return { rows: [] };
      },
    };
    return { client: client as unknown as pg.Client, queries };
  }

  it('con el bloqueo tomado registra omitida "otra carga en curso" sin tocar las tablas ni soltarlo', async () => {
    const { client, queries } = fakeClient(false);
    await expect(loadSepa(client, data, options)).resolves.toEqual({ estado: 'omitida', detalle: LOCK_TAKEN });

    expect(queries).toHaveLength(2);
    expect(queries[0]).toEqual({ text: 'select pg_try_advisory_lock(hashtext($1)) as locked', values: [LOCK_KEY] });
    expect(queries[1].text).toContain('insert into public.sepa_cargas');
    expect(queries[1].values).toContain('omitida');
    expect(queries[1].values).toContain(LOCK_TAKEN);
  });

  it('toma el bloqueo antes de las reglas y lo suelta al terminar', async () => {
    const { client, queries } = fakeClient(true);
    await expect(loadSepa(client, data, options)).resolves.toMatchObject({ estado: 'ok' });

    expect(queries[0].text).toContain('pg_try_advisory_lock');
    expect(queries[1].text).toContain('max_fecha');
    expect(queries.at(-1)).toEqual({ text: 'select pg_advisory_unlock(hashtext($1))', values: [LOCK_KEY] });
  });

  it('suelta el bloqueo también si la carga falla', async () => {
    const { client, queries } = fakeClient(true, /^select\s+count/);
    await expect(loadSepa(client, data, options)).rejects.toThrow('falla simulada');
    expect(queries.at(-1)?.text).toContain('pg_advisory_unlock');
  });
});

describe('loadSepa: sucursales y precios por sucursal (spec 13)', () => {
  const data: SepaData = {
    fechaArchivo: '2026-11-04',
    banderas: [{ id: '10-1', comercioId: 10, banderaId: 1, nombre: 'Carrefour', razonSocial: 'INC S.A.', sucursales: 4 }],
    precios: [{ ean: '7791720048313', bandera: '10-1', minimo: 1000, mediana: 1000, maximo: 1200, sucursales: 3 }],
    productos: [],
    sucursales: [1, 2, 3, 4].map(pos => ({
      id: `10-1-${pos}`, bandera: '10-1', pos, nombre: `Sucursal ${pos}`, tipo: null, direccion: null, barrio: null,
      localidad: null, provincia: 'AR-C', lat: -34.6, lng: -58.4,
    })),
    preciosSucursal: [{ ean: '7791720048313', bandera: '10-1', precios: [1000, 1200], indices: Int16Array.from([1, 0, 1, 2]) }],
    sinCoordenadas: 0,
    omitidos: [],
    filasLeidas: 3,
    filasValidas: 3,
  };

  function recordingClient() {
    const queries: { text: string; values?: unknown[] }[] = [];
    const client = {
      query: async (text: string, values?: unknown[]) => {
        queries.push({ text, values });
        if (text.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
        if (text.includes('max_fecha')) return { rows: [{ max_fecha: null, misma_fecha: false, filas_precios: null }] };
        if (text.includes('pg_database_size')) return { rows: [{ base: String(150 * 1024 * 1024), sucursales: '1048576', precios_sucursal: String(60 * 1024 * 1024) }] };
        if (text.includes('count(*)')) return { rows: [{ n: 1 }] };
        return { rows: [] };
      },
    };
    return { client: client as unknown as pg.Client, queries };
  }

  it('el arreglo de índices viaja como array común (pg no convierte Int16Array)', () => {
    expect(preciosSucursalRow(data.preciosSucursal[0])).toEqual(['7791720048313', '10-1', [1000, 1200], [1, 0, 1, 2]]);
  });

  it('reemplaza sucursales y escribe los arreglos que cambiaron, dentro de la transacción y después de los precios', async () => {
    const { client, queries } = recordingClient();
    const result = await loadSepa(client, data, { force: true, inicio: new Date('2026-11-04T18:30:00Z') });
    expect(result).toMatchObject({ estado: 'ok', tamanos: { base: 150, sucursales: 1, preciosSucursal: 60 } });

    const index = (pattern: RegExp) => queries.findIndex(q => pattern.test(q.text));
    const begin = index(/^begin$/);
    const commit = index(/^commit$/);
    const upsertPrecios = index(/insert into public\.sepa_precios \(/);
    const borraSucursales = index(/delete from public\.sepa_sucursales where bandera in/);
    const insertaSucursales = index(/insert into public\.sepa_sucursales/);
    const borraArreglos = index(/delete from public\.sepa_precios_sucursal x/);
    const upsertArreglos = index(/insert into public\.sepa_precios_sucursal/);

    expect(begin).toBeGreaterThan(-1);
    expect(upsertPrecios).toBeGreaterThan(begin);
    expect(borraSucursales).toBeGreaterThan(upsertPrecios);
    expect(insertaSucursales).toBeGreaterThan(borraSucursales);
    expect(borraArreglos).toBeGreaterThan(insertaSucursales);
    expect(upsertArreglos).toBeGreaterThan(borraArreglos);
    expect(commit).toBeGreaterThan(upsertArreglos);
    // Solo los que no vienen se borran, y solo los que cambiaron se reescriben
    expect(queries[borraArreglos].text).toMatch(/not exists/);
    expect(queries[upsertArreglos].text).toMatch(/on conflict \(ean, bandera\) do update[\s\S]*is distinct from/);

    const tmp = queries.find(q => q.text.startsWith('insert into tmp_precios_sucursal'))!;
    expect(tmp.values).toEqual(['7791720048313', '10-1', [1000, 1200], [1, 0, 1, 2]]);
    const tmpSucursales = queries.find(q => q.text.startsWith('insert into tmp_sucursales'))!;
    expect(tmpSucursales.values).toHaveLength(4 * 11);
  });
});
