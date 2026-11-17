import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NearbyPrice, SepaBranch, SepaBranchRow } from './sepa';

// Sucursales y precios cercanos con un cliente de Supabase falso: cuenta los pedidos de sucursales (por rango) y las
// llamadas a sepa_precios_en_sucursales con sus EAN y sucursales
const branchRanges: [number, number][] = [];
const rpcCalls: { p_eans: string[]; p_sucursales: string[] }[] = [];
let branchRows: SepaBranchRow[] = [];
let fail = false;

function row(id: string, patch: Partial<SepaBranchRow> = {}): SepaBranchRow {
  return {
    id, nombre: `Sucursal ${id}`, direccion: 'Av Rivadavia 5000', barrio: 'Caballito', localidad: 'Capital Federal',
    provincia: 'AR-C', lat: -34.61, lng: -58.44, actualizado: '2026-11-15', sepa_banderas: { nombre: 'Coto' }, ...patch,
  };
}

vi.mock('./supabase', () => {
  const from = () => {
    let rows: [number, number] = [0, 0];
    const builder = {
      select: () => builder,
      order: () => builder,
      range(start: number, end: number) { rows = [start, end]; return builder; },
      retry() {
        branchRanges.push(rows);
        if (fail) return Promise.resolve({ data: null, error: new Error('sin conexión') });
        return Promise.resolve({ data: branchRows.slice(rows[0], rows[1] + 1), error: null });
      },
    };
    return builder;
  };
  const rpc = (_name: string, args: { p_eans: string[]; p_sucursales: string[] }) => ({
    retry() {
      rpcCalls.push(args);
      if (fail) return Promise.resolve({ data: null, error: new Error('sin conexión') });
      // Cada sucursal informa todos los EAN salvo los que terminan en 0; el precio sale del número de la sucursal
      const data = args.p_eans.filter(ean => !ean.endsWith('0')).flatMap(ean =>
        args.p_sucursales.map(sucursal => ({ ean, sucursal, precio: String(100 + Number(sucursal.split('-')[2])) })));
      return Promise.resolve({ data, error: null });
    },
  });
  return { supabase: { from, rpc } };
});

const {
  branchLabel, branchLocalities, getNearbyPrices, getSepaBranches, isStaleDate, latestBranchDate, nearestBranches,
  sortNearbyPrices, storeRefFromBranch, toSepaBranch,
} = await import('./sepa');

function branch(id: string, patch: Partial<SepaBranch> = {}): SepaBranch {
  return {
    id, chain: 'Coto', name: `Sucursal ${id}`, address: 'Av Rivadavia 5000', barrio: 'Caballito',
    localidad: 'Capital Federal', provincia: 'AR-C', lat: -34.61, lng: -58.44, updated: '2026-11-15', ...patch,
  };
}

const ORIGIN = { lat: -34.61, lng: -58.44 };

beforeEach(() => {
  branchRanges.length = 0;
  rpcCalls.length = 0;
  fail = false;
});

describe('toSepaBranch', () => {
  it('pasa la fila a los nombres de la app', () => {
    expect(toSepaBranch(row('10-1-5'))).toEqual(branch('10-1-5'));
  });

  it('sin el nombre de la bandera descarta la fila', () => {
    expect(toSepaBranch(row('10-1-5', { sepa_banderas: null }))).toBeNull();
  });
});

describe('getSepaBranches', () => {
  it('si la descarga falla rechaza y la próxima vez vuelve a intentar', async () => {
    fail = true;
    await expect(getSepaBranches()).rejects.toThrow('sin conexión');
    expect(branchRanges).toHaveLength(1);
  });

  it('pagina de a 1.000 filas y baja las sucursales una sola vez por sesión', async () => {
    branchRows = Array.from({ length: 2300 }, (_, i) => row(`10-1-${i}`));
    const [first, second] = await Promise.all([getSepaBranches(), getSepaBranches()]);
    expect(branchRanges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(first).toHaveLength(2300);
    expect(second).toBe(first);
    await getSepaBranches();
    expect(branchRanges).toHaveLength(3);
  });
});

describe('nearestBranches', () => {
  // 0,01° de latitud ≈ 1,1 km
  const branches = [
    branch('10-1-3', { lat: -34.64 }),
    branch('10-1-1', { lat: -34.62 }),
    branch('10-1-2', { lat: -34.63 }),
    branch('10-1-4', { lat: null, lng: null }),
    branch('10-1-5', { lat: -34.90 }),
  ];

  it('devuelve las del radio, de la más cercana a la más lejana, con su distancia', () => {
    const near = nearestBranches(branches, ORIGIN, 5);
    expect(near.map(b => b.id)).toEqual(['10-1-1', '10-1-2', '10-1-3']);
    expect(near[0].distanceKm).toBeCloseTo(1.11, 1);
  });

  it('deja afuera las que no tienen coordenadas y las que pasan el radio', () => {
    expect(nearestBranches(branches, ORIGIN, 2).map(b => b.id)).toEqual(['10-1-1']);
    expect(nearestBranches(branches, ORIGIN, 0.5)).toEqual([]);
  });

  it('corta en el límite: 40 si no se pasa', () => {
    expect(nearestBranches(branches, ORIGIN, 5, 2).map(b => b.id)).toEqual(['10-1-1', '10-1-2']);
    const many = Array.from({ length: 60 }, (_, i) => branch(`10-1-${i}`));
    expect(nearestBranches(many, ORIGIN, 1)).toHaveLength(40);
  });
});

describe('sortNearbyPrices', () => {
  function price(id: string, amount: number, distance: number): NearbyPrice {
    return { ean: '7790000000017', branch: branch(id), price: amount, distanceKm: distance };
  }

  it('ordena por precio y, a igual precio, por distancia', () => {
    const prices = [price('a', 200, 0.5), price('b', 100, 2), price('c', 100, 1), price('d', 150, 0.1)];
    expect(sortNearbyPrices(prices).map(p => p.branch.id)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('no modifica la lista original', () => {
    const prices = [price('a', 200, 0.5), price('b', 100, 2)];
    sortNearbyPrices(prices);
    expect(prices[0].branch.id).toBe('a');
  });
});

describe('getNearbyPrices', () => {
  const near = nearestBranches([branch('10-1-7', { lat: -34.62 }), branch('10-1-3', { lat: -34.63 })], ORIGIN, 5);

  it('pide todos los EAN en una sola llamada, solo con los id de las sucursales', async () => {
    const byEan = await getNearbyPrices(['1000000000001', '1000000000002', '1000000000001'], near);
    expect(rpcCalls).toEqual([{ p_eans: ['1000000000001', '1000000000002'], p_sucursales: ['10-1-7', '10-1-3'] }]);
    // Ordenados por precio: la sucursal 3 ($103) antes que la 7 ($107)
    expect(byEan.get('1000000000001')?.map(p => [p.branch.id, p.price])).toEqual([['10-1-3', 103], ['10-1-7', 107]]);
    expect(byEan.get('1000000000001')?.[0]).toMatchObject({ ean: '1000000000001', branch: { chain: 'Coto' } });
    expect(byEan.get('1000000000001')?.[0].distanceKm).toBeCloseTo(2.22, 1);
    expect(byEan.get('1000000000001')?.[0].branch).not.toHaveProperty('distanceKm');
  });

  it('un producto que ninguna sucursal informa queda con la lista vacía, y también va a la caché', async () => {
    const byEan = await getNearbyPrices(['2000000000000'], near);
    expect(byEan.get('2000000000000')).toEqual([]);
    await getNearbyPrices(['2000000000000'], near);
    expect(rpcCalls).toHaveLength(1);
  });

  it('con sucursales nuevas (otro radio) solo vuelve a pedir los EAN, y usa la caché para las que ya tenía', async () => {
    await getNearbyPrices(['3000000000001'], near.slice(0, 1));
    await getNearbyPrices(['3000000000001'], near.slice(0, 1));
    expect(rpcCalls).toHaveLength(1);
    const byEan = await getNearbyPrices(['3000000000001'], near);
    expect(rpcCalls).toHaveLength(2);
    expect(byEan.get('3000000000001')).toHaveLength(2);
  });

  it('con más de 20 EAN parte la consulta de a 20', async () => {
    const eans = Array.from({ length: 25 }, (_, i) => `40000000000${String(i + 11)}`);
    await getNearbyPrices(eans, near);
    expect(rpcCalls.map(call => call.p_eans.length)).toEqual([20, 5]);
  });

  it('sin sucursales cercanas no consulta nada', async () => {
    const byEan = await getNearbyPrices(['5000000000001'], []);
    expect(rpcCalls).toHaveLength(0);
    expect(byEan.get('5000000000001')).toEqual([]);
  });

  it('si la consulta falla, rechaza y no guarda nada en la caché', async () => {
    fail = true;
    await expect(getNearbyPrices(['6000000000001'], near)).rejects.toThrow('sin conexión');
    fail = false;
    await getNearbyPrices(['6000000000001'], near);
    expect(rpcCalls).toHaveLength(2);
  });
});

describe('latestBranchDate / isStaleDate', () => {
  it('toma la fecha más reciente', () => {
    expect(latestBranchDate([{ updated: '2026-11-10' }, { updated: '2026-11-15' }, { updated: '2026-11-01' }])).toBe('2026-11-15');
    expect(latestBranchDate([])).toBeNull();
  });

  it('los datos son viejos con más de 7 días', () => {
    const today = new Date(2026, 10, 16);
    expect(isStaleDate('2026-11-09', today)).toBe(false);
    expect(isStaleDate('2026-11-08', today)).toBe(true);
  });
});

describe('branchLocalities', () => {
  it('usa el barrio si la sucursal lo tiene y, si no, la localidad', () => {
    const places = branchLocalities([
      branch('1', { barrio: 'Caballito' }),
      branch('2', { barrio: null, localidad: 'Merlo', provincia: 'AR-B', lat: -34.66, lng: -58.73 }),
    ]);
    expect(places.map(p => p.label)).toEqual(['Caballito, CABA', 'Merlo, Buenos Aires']);
  });

  it('junta las formas de escribir un mismo lugar y muestra la más usada', () => {
    const places = branchLocalities([
      branch('1', { barrio: 'Nuñez' }),
      branch('2', { barrio: 'NUÑEZ' }),
      branch('3', { barrio: 'Nuñez' }),
      branch('4', { barrio: 'Nunez  (901)' }),
    ]);
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ label: 'Nuñez, CABA', branches: 4 });
  });

  it('las formas de nombrar a la ciudad de Buenos Aires quedan como un solo lugar', () => {
    const places = branchLocalities([
      branch('1', { barrio: null, localidad: 'Capital Federal' }),
      branch('2', { barrio: null, localidad: 'Ciudad Autónoma De Buenos Aires' }),
      branch('3', { barrio: null, localidad: 'Ciudad Autonoma Buenos Aires' }),
      branch('4', { barrio: null, localidad: 'Ciudad Autonoma De Buenos Aires (901)' }),
    ]);
    expect(places).toEqual([expect.objectContaining({ label: 'Ciudad de Buenos Aires', branches: 4 })]);
  });

  it('el mismo nombre en dos provincias son dos lugares', () => {
    const places = branchLocalities([
      branch('1', { barrio: 'San Martin', provincia: 'AR-B' }),
      branch('2', { barrio: 'San Martin', provincia: 'AR-M' }),
    ]);
    expect(places.map(p => p.label)).toEqual(['San Martin, Buenos Aires', 'San Martin, Mendoza']);
  });

  it('no repite la provincia si el lugar se llama igual, ni la inventa si no se conoce', () => {
    const places = branchLocalities([
      branch('1', { barrio: null, localidad: 'Córdoba', provincia: 'AR-X' }),
      branch('2', { barrio: null, localidad: 'Mendoza', provincia: null }),
    ]);
    expect(places.map(p => p.label)).toEqual(['Córdoba', 'Mendoza']);
  });

  it('el punto es la mediana: una sucursal mal cargada no lo corre', () => {
    const [place] = branchLocalities([
      branch('1', { lat: -34.60, lng: -58.44 }),
      branch('2', { lat: -34.61, lng: -58.45 }),
      branch('3', { lat: -31.40, lng: -64.18 }),
    ]);
    expect(place).toMatchObject({ lat: -34.60, lng: -58.45 });
  });

  it('ignora las sucursales sin coordenadas o sin lugar', () => {
    expect(branchLocalities([
      branch('1', { lat: null, lng: null }),
      branch('2', { barrio: null, localidad: null }),
      branch('3', { barrio: ' ', localidad: 'x' }),
    ])).toEqual([]);
  });
});

describe('branchLabel', () => {
  it('une la cadena y la sucursal', () => {
    expect(branchLabel({ chain: 'Hipermercado Carrefour', name: 'Caballito' })).toBe('Hipermercado Carrefour — Caballito');
  });

  it('no repite la cadena si la sucursal ya empieza con ella', () => {
    expect(branchLabel({ chain: 'Jumbo', name: 'Jumbo Morón' })).toBe('Jumbo Morón');
  });

  it('sin nombre de sucursal queda la cadena', () => {
    expect(branchLabel({ chain: 'Coto', name: ' ' })).toBe('Coto');
  });
});

describe('storeRefFromBranch', () => {
  it('arma el comercio del carrito con el id del SEPA y las coordenadas', () => {
    expect(storeRefFromBranch(branch('10-1-219', { chain: 'Hipermercado Carrefour', name: 'Caballito' }))).toEqual({
      name: 'Hipermercado Carrefour — Caballito', sepaId: '10-1-219', barrio: 'Caballito', address: 'Av Rivadavia 5000',
      lat: -34.61, lng: -58.44,
    });
  });

  it('sin barrio usa la localidad; lo que falta no se guarda', () => {
    const store = storeRefFromBranch(branch('2-1-109', { barrio: null, localidad: 'General Pico', address: null, lat: null, lng: null }));
    expect(store).toEqual({ name: 'Coto — Sucursal 2-1-109', sepaId: '2-1-109', barrio: 'General Pico' });
  });
});
