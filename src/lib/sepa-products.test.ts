import { beforeEach, describe, expect, it, vi } from 'vitest';

// getSepaProducts con un cliente de Supabase falso: cuenta las consultas y los EAN de cada una
const queries: { table: string; eans: string[] }[] = [];
let fail = false;

vi.mock('./supabase', () => {
  const from = (table: string) => {
    let requested: string[] = [];
    const builder = {
      select() { return builder; },
      in(_column: string, eans: string[]) { requested = eans; return builder; },
      retry() {
        queries.push({ table, eans: requested });
        if (fail) return Promise.resolve({ data: null, error: new Error('sin conexión') });
        // En el cliente falso, los EAN que terminan en 0 no están en el catálogo
        const data = requested.filter(ean => !ean.endsWith('0')).map(ean => (
          { ean, descripcion: `PRODUCTO ${ean}`, marca: null, cantidad: '500.000', unidad: 'g', banderas: 3 }
        ));
        return Promise.resolve({ data, error: null });
      },
    };
    return builder;
  };
  return { supabase: { from } };
});

const { getSepaProducts } = await import('./sepa');

beforeEach(() => {
  queries.length = 0;
  fail = false;
});

describe('getSepaProducts', () => {
  it('trae los que están en el catálogo, por EAN y sin repetir', async () => {
    const products = await getSepaProducts(['1000000000001', '1000000000000', '1000000000001']);
    expect(queries).toEqual([{ table: 'sepa_productos', eans: ['1000000000001', '1000000000000'] }]);
    expect([...products]).toEqual([['1000000000001', {
      ean: '1000000000001', description: 'PRODUCTO 1000000000001', brand: null, size: 500, sizeUnit: 'g', banderas: 3,
    }]]);
  });

  it('consulta de a 100 EAN', async () => {
    const eans = Array.from({ length: 101 }, (_, i) => `2${String(i).padStart(11, '0')}1`);
    expect((await getSepaProducts(eans)).size).toBe(101);
    expect(queries.map(q => q.eans.length)).toEqual([100, 1]);
  });

  it('si la consulta falla, rechaza', async () => {
    fail = true;
    await expect(getSepaProducts(['1000000000001'])).rejects.toThrow('sin conexión');
  });

  it('sin EAN no consulta', async () => {
    expect((await getSepaProducts([])).size).toBe(0);
    expect(queries).toHaveLength(0);
  });
});
