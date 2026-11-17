import { beforeEach, describe, expect, it, vi } from 'vitest';

// getSepaImages con un cliente de Supabase falso: cuenta las consultas y los EAN de cada una
const queries: string[][] = [];
const filters: unknown[][] = [];
let fail = false;

/** En el cliente falso, los EAN que terminan en 0 no tienen imagen */
const urlOf = (ean: string) => `https://imagenes.preciosclaros.gob.ar/productos/${ean}.jpg`;

vi.mock('./supabase', () => {
  const from = (table: string) => {
    const state = { eans: [] as string[] };
    const builder = {
      select(columns: string) { filters.push([table, columns]); return builder; },
      in(_column: string, eans: string[]) { state.eans = eans; return builder; },
      not(...args: unknown[]) { filters.push(args); return builder; },
      retry() {
        queries.push(state.eans);
        if (fail) return Promise.resolve({ data: null, error: new Error('sin conexión') });
        const data = state.eans.filter(ean => !ean.endsWith('0')).map(ean => ({ ean, url: urlOf(ean) }));
        return Promise.resolve({ data, error: null });
      },
    };
    return builder;
  };
  return { supabase: { from } };
});

const { getSepaImages, imageSource } = await import('./sepa');

beforeEach(() => {
  queries.length = 0;
  filters.length = 0;
  fail = false;
});

describe('getSepaImages', () => {
  it('pide todos los EAN en una sola consulta, sin repetidos, solo las filas con imagen', async () => {
    const images = await getSepaImages(['1000000000001', '1000000000002', '1000000000001']);
    expect(queries).toEqual([['1000000000001', '1000000000002']]);
    expect(filters).toEqual([['sepa_imagenes', 'ean, url'], ['url', 'is', null]]);
    expect(images.get('1000000000002')).toBe(urlOf('1000000000002'));
  });

  it('los EAN sin imagen no están en el mapa', async () => {
    const images = await getSepaImages(['1100000000001', '1100000000000']);
    expect([...images.keys()]).toEqual(['1100000000001']);
  });

  it('repetir la consulta usa la caché, también para los EAN sin imagen', async () => {
    await getSepaImages(['2000000000001', '2000000000000']);
    const images = await getSepaImages(['2000000000000', '2000000000001']);
    expect(queries).toHaveLength(1);
    expect(images.has('2000000000000')).toBe(false);
    expect(images.get('2000000000001')).toBe(urlOf('2000000000001'));
  });

  it('solo consulta los EAN que faltan en la caché', async () => {
    await getSepaImages(['3000000000001']);
    await getSepaImages(['3000000000001', '3000000000002']);
    expect(queries).toEqual([['3000000000001'], ['3000000000002']]);
  });

  it('dos pedidos a la vez del mismo EAN comparten la consulta', async () => {
    await Promise.all([getSepaImages(['4000000000001']), getSepaImages(['4000000000001'])]);
    expect(queries).toHaveLength(1);
  });

  it('si la consulta falla, rechaza y no guarda nada en la caché', async () => {
    fail = true;
    await expect(getSepaImages(['5000000000001'])).rejects.toThrow('sin conexión');
    fail = false;
    const images = await getSepaImages(['5000000000001']);
    expect(queries).toHaveLength(2);
    expect(images.size).toBe(1);
  });

  it('consulta de a 100 EAN', async () => {
    const eans = Array.from({ length: 250 }, (_, i) => `6${String(i + 1).padStart(12, '0')}`);
    const images = await getSepaImages(eans);
    expect(queries.map(q => q.length)).toEqual([100, 100, 50]);
    expect(images.size).toBe(225);   // 25 terminan en 0
  });

  it('sin EAN no consulta', async () => {
    expect((await getSepaImages([])).size).toBe(0);
    expect(queries).toHaveLength(0);
  });
});

describe('imageSource', () => {
  it('Open Food Facts', () => {
    expect(imageSource('https://images.openfoodfacts.org/images/products/779/089/500/0997/front_es.12.200.jpg')).toBe('off');
    expect(imageSource('https://openfoodfacts.org/x.jpg')).toBe('off');
  });

  it('el portal Precios Claros y cualquier otra', () => {
    expect(imageSource('https://imagenes.preciosclaros.gob.ar/productos/7790895000997.jpg')).toBe('preciosclaros');
    expect(imageSource('https://openfoodfacts.org.ejemplo.com/x.jpg')).toBe('preciosclaros');
    expect(imageSource('no es una url')).toBe('preciosclaros');
  });
});
