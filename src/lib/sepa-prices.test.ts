import { beforeEach, describe, expect, it, vi } from 'vitest';

// getSepaPrices con un cliente de Supabase falso: cuenta las consultas y los EAN de cada una
const queries: string[][] = [];
let fail = false;

vi.mock('./supabase', () => {
  const builder = {
    eans: [] as string[],
    select() { return builder; },
    in(_column: string, eans: string[]) { builder.eans = eans; return builder; },
    retry() {
      queries.push(builder.eans);
      if (fail) return Promise.resolve({ data: null, error: new Error('sin conexión') });
      const data = builder.eans
        .filter(ean => ean !== '0000000000000')
        .map(ean => ({
          ean, minimo: 90, mediana: 100, maximo: 110, sucursales: 5, actualizado: '2026-11-16',
          sepa_banderas: { nombre: 'Coto' },
        }));
      return Promise.resolve({ data, error: null });
    },
  };
  return { supabase: { from: () => builder } };
});

const { getSepaPrices } = await import('./sepa');

beforeEach(() => {
  queries.length = 0;
  fail = false;
});

describe('getSepaPrices', () => {
  it('pide todos los EAN en una sola consulta, sin repetidos', async () => {
    const byEan = await getSepaPrices(['1000000000001', '1000000000002', '1000000000001']);
    expect(queries).toEqual([['1000000000001', '1000000000002']]);
    expect(byEan.get('1000000000002')?.[0]).toMatchObject({ bandera: 'Coto', mediana: 100 });
  });

  it('repetir la consulta usa la caché, también para los EAN sin precios', async () => {
    await getSepaPrices(['2000000000001', '0000000000000']);
    const byEan = await getSepaPrices(['0000000000000', '2000000000001']);
    expect(queries).toHaveLength(1);
    expect(byEan.get('0000000000000')).toEqual([]);
  });

  it('solo consulta los EAN que faltan en la caché', async () => {
    await getSepaPrices(['3000000000001']);
    await getSepaPrices(['3000000000001', '3000000000002']);
    expect(queries).toEqual([['3000000000001'], ['3000000000002']]);
  });

  it('dos pedidos a la vez del mismo EAN comparten la consulta', async () => {
    await Promise.all([getSepaPrices(['4000000000001']), getSepaPrices(['4000000000001'])]);
    expect(queries).toHaveLength(1);
  });

  it('si la consulta falla, rechaza y no guarda nada en la caché', async () => {
    fail = true;
    await expect(getSepaPrices(['5000000000001'])).rejects.toThrow('sin conexión');
    fail = false;
    await getSepaPrices(['5000000000001']);
    expect(queries).toHaveLength(2);
  });
});
