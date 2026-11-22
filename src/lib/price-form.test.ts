import { describe, expect, it } from 'vitest';
import { Price, Product, Purchase } from './models';
import { otherStore, ownPricesNear, priceAt, recentStores, resolvePriceProduct, storesAtPoint } from './price-form';
import type { SepaBranch, SepaProduct } from './sepa';

// ── storesAtPoint ─────────────────────────────────────────

describe('storesAtPoint', () => {
  const point = { lat: -34.6, lng: -58.4 };
  // 1 m de latitud ≈ 1 / 111.195 grados
  const metersNorth = (m: number) => point.lat + m / 111_195;

  function branch(id: string, meters: number | null): SepaBranch {
    return {
      id, chain: 'Coto', name: `Sucursal ${id}`, address: null, barrio: null, localidad: null, provincia: 'AR-C',
      lat: meters === null ? null : metersNorth(meters), lng: meters === null ? null : point.lng, updated: '2026-11-20',
    };
  }

  it('199 m entra y 201 m no', () => {
    const ids = storesAtPoint([branch('a', 199), branch('b', 201)], point).map(b => b.id);
    expect(ids).toEqual(['a']);
  });

  it('ordena de la más cercana a la más lejana, hasta 3', () => {
    const branches = [branch('a', 150), branch('b', 20), branch('c', 90), branch('d', 60)];
    expect(storesAtPoint(branches, point).map(b => b.id)).toEqual(['b', 'd', 'c']);
  });

  it('ignora las sucursales sin coordenadas', () => {
    expect(storesAtPoint([branch('a', null), branch('b', 10)], point).map(b => b.id)).toEqual(['b']);
  });

  it('devuelve la distancia en km', () => {
    expect(storesAtPoint([branch('a', 100)], point)[0].distanceKm).toBeCloseTo(0.1, 3);
  });
});

// ── recentStores ──────────────────────────────────────────

describe('recentStores', () => {
  function price(id: string, date: string, patch: Partial<Price> = {}): Price {
    return { id, productId: 'p1', amount: 100, date: new Date(date), barrio: 'Almagro', store: 'Almacén', ...patch };
  }

  function purchase(id: string, date: string, patch: Partial<Purchase> = {}): Purchase {
    return { id, date, items: [], total: 0, ...patch };
  }

  it('distintos por storeKey, del más reciente al más viejo', () => {
    const prices = [
      price('a', '2026-11-01'),
      price('b', '2026-11-05', { store: ' almacén ', barrio: 'ALMAGRO' }),
      price('c', '2026-11-03', { store: 'Dia', barrio: 'Caballito' }),
    ];
    expect(recentStores(prices, [])).toEqual([
      { name: 'almacén', barrio: 'ALMAGRO' },
      { name: 'Dia', barrio: 'Caballito' },
    ]);
  });

  it('usa el storeRef del precio y el comercio de las compras', () => {
    const sucursal = { name: 'Coto — Cabildo', sepaId: '10-1-1', chain: 'Coto', barrio: 'Belgrano' };
    const prices = [price('a', '2026-11-02', { store: 'Coto — Cabildo', barrio: 'Belgrano', storeRef: sucursal })];
    const purchases = [
      purchase('x', '2026-11-04T10:00:00.000Z', {
        store: 'Super Luna',
        items: [{ id: 'i', productId: 'p1', productName: 'Yerba', price: 1, quantity: 1, subtotal: 1,
          store: { name: 'Super Luna', address: 'Rivadavia 5000' } }],
      }),
      purchase('y', '2026-11-03T10:00:00.000Z', { store: 'Chino', barrio: 'Sin especificar' }),
    ];
    expect(recentStores(prices, purchases)).toEqual([
      { name: 'Super Luna', address: 'Rivadavia 5000' },
      { name: 'Chino' },
      sucursal,
    ]);
  });

  it('hasta 5 y sin nombres vacíos', () => {
    const prices = ['A', 'B', 'C', ' ', 'D', 'E', 'F'].map((name, i) =>
      price(String(i), `2026-11-${String(20 - i).padStart(2, '0')}`, { store: name }));
    prices.push(price('sin', '2026-11-25', { store: undefined }));
    expect(recentStores(prices, []).map(s => s.name)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('acepta fechas como texto, como vienen de localStorage', () => {
    const stored = JSON.parse(JSON.stringify([price('a', '2026-11-01'), price('b', '2026-11-02', { store: 'Dia' })]));
    expect(recentStores(stored, []).map(s => s.name)).toEqual(['Dia', 'Almacén']);
  });
});

// ── otherStore ────────────────────────────────────────────

describe('otherStore', () => {
  it('recorta espacios y omite lo vacío', () => {
    expect(otherStore({ name: '  Super   Luna ', address: ' ', barrio: '' })).toEqual({ name: 'Super Luna' });
  });

  it('guarda dirección y barrio', () => {
    expect(otherStore({ name: 'Luna', address: ' Rivadavia  5000 ', barrio: ' Caballito ' }))
      .toEqual({ name: 'Luna', address: 'Rivadavia 5000', barrio: 'Caballito' });
  });

  it('redondea las coordenadas a 4 decimales', () => {
    expect(otherStore({ name: 'Luna', address: '', barrio: '', point: { lat: -34.603722, lng: -58.381592 } }))
      .toEqual({ name: 'Luna', lat: -34.6037, lng: -58.3816 });
  });
});

// ── resolvePriceProduct ───────────────────────────────────

describe('resolvePriceProduct', () => {
  const own: Product = { id: 'p1', name: 'Yerba', ean: '7790387000020' };
  const sepa: SepaProduct = {
    ean: '7790387000013', description: 'YERBA MATE PLAYADITO 500 GR', brand: 'PLAYADITO', size: 500, sizeUnit: 'g',
    banderas: 10,
  };

  it('propio → ese producto', () => {
    expect(resolvePriceProduct({ kind: 'own', product: own }, [own], 'n')).toEqual({ product: own, isNew: false });
  });

  it('del catálogo → uno nuevo con productFromSepa', () => {
    const { product, isNew } = resolvePriceProduct({ kind: 'sepa', sepa }, [own], 'n');
    expect(isNew).toBe(true);
    expect(product).toMatchObject({ id: 'n', ean: '7790387000013', brand: 'PLAYADITO', size: 500, sizeUnit: 'g' });
    expect(product.category).toBeUndefined();
  });

  it('del catálogo con un propio de ese EAN que apareció mientras tanto → el propio', () => {
    const synced: Product = { id: 'p2', name: 'Playadito', ean: '7790387000013' };
    expect(resolvePriceProduct({ kind: 'sepa', sepa }, [own, synced], 'n')).toEqual({ product: synced, isNew: false });
  });

  it('con código fuera del catálogo → uno nuevo con nombre, marca y EAN', () => {
    const choice = { kind: 'new' as const, ean: '7791234567896', name: ' Alfajor  Luna ', brand: ' Luna ' };
    expect(resolvePriceProduct(choice, [own], 'n')).toEqual({
      product: { id: 'n', name: 'Alfajor Luna', brand: 'Luna', ean: '7791234567896' }, isNew: true,
    });
  });

  it('sin código → uno nuevo sin EAN y sin marca vacía', () => {
    const { product, isNew } = resolvePriceProduct({ kind: 'new', name: 'Pan casero', brand: ' ' }, [own], 'n');
    expect(isNew).toBe(true);
    expect(product).toEqual({ id: 'n', name: 'Pan casero' });
    expect('ean' in product).toBe(false);
    expect('brand' in product).toBe(false);
  });
});

// ── priceAt ───────────────────────────────────────────────

describe('priceAt', () => {
  const date = new Date('2026-11-22T15:00:00');

  it('barrio de la sucursal y store con su nombre', () => {
    const store = { name: 'Coto — Cabildo', sepaId: '10-1-1', barrio: 'Belgrano', lat: -34.56, lng: -58.45 };
    expect(priceAt({ id: 'x', productId: 'p1', amount: 4300, store, date })).toEqual({
      id: 'x', productId: 'p1', amount: 4300, date, barrio: 'Belgrano', store: 'Coto — Cabildo', storeRef: store,
    });
  });

  it('sin barrio → "Sin especificar"', () => {
    expect(priceAt({ id: 'x', productId: 'p1', amount: 10, store: { name: 'Super Luna' }, date }).barrio)
      .toBe('Sin especificar');
  });
});

// ── ownPricesNear ─────────────────────────────────────────

describe('ownPricesNear', () => {
  const origin = { lat: -34.6, lng: -58.4 };
  const kmNorth = (km: number) => origin.lat + km / 111.195;

  function price(id: string, storeRef?: Price['storeRef']): Price {
    return { id, productId: 'p1', amount: 100, date: new Date('2026-11-20'), barrio: 'Almagro', store: storeRef?.name ?? 'Almacén', storeRef };
  }

  const inside = price('in', { name: 'Super Luna', lat: kmNorth(1), lng: origin.lng });
  const outside = price('out', { name: 'Kiosco', lat: kmNorth(4), lng: origin.lng });
  const old = price('old');

  it('los de un comercio con coordenadas dentro del radio van con su distancia; el resto al final', () => {
    const { near, rest } = ownPricesNear([old, inside, outside], origin, 3);
    expect(near.map(n => n.price.id)).toEqual(['in']);
    expect(near[0].distanceKm).toBeCloseTo(1, 2);
    expect(rest.map(p => p.id)).toEqual(['old', 'out']);
  });

  it('sin ubicación, todos al final', () => {
    expect(ownPricesNear([inside, old], undefined, undefined)).toEqual({ near: [], rest: [inside, old] });
  });
});
