import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import type { SepaData } from './etl.ts';
import { LOCK_KEY, LOCK_TAKEN, buildInsert, checkRules, loadSepa } from './load.ts';

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
    fechaArchivo: '2026-11-04', banderas: [], precios: [], productos: [], omitidos: [], filasLeidas: 0, filasValidas: 0,
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
