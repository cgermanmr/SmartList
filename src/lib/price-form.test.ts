import { describe, expect, it } from 'vitest';
import { Price, Product, Purchase } from './models';
import {
  manualOffer, manualProductForm, otherStore, ownPricesNear, priceAt, recentStores, resolvePriceProduct, storesAtPoint,
} from './price-form';
import { EMPTY_PRODUCT_FORM, ProductForm } from './product-form';
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

  it('nuevo con todos los datos → sin espacios de más, con código, presentación y categoría', () => {
    const form: ProductForm = {
      name: ' Alfajor  Luna ', category: ' Cosas  dulces ', ean: ' 7791234567898 ', brand: ' La  Luna ', size: '50', sizeUnit: 'g',
    };
    expect(resolvePriceProduct({ kind: 'new', form }, [own], 'n')).toEqual({
      product: {
        id: 'n', name: 'Alfajor Luna', category: 'Cosas dulces', ean: '7791234567898', brand: 'La Luna', size: 50, sizeUnit: 'g',
        origin: 'manual',
      },
      isNew: true,
    });
  });

  it('nuevo con un código en otro formato → normalizado a GTIN-13', () => {
    const form = { ...EMPTY_PRODUCT_FORM, name: 'Alfajor', ean: '96385074' };
    expect(resolvePriceProduct({ kind: 'new', form }, [own], 'n').product.ean).toBe('0000096385074');
  });

  it('nuevo con un código de un propio que apareció mientras tanto → el propio', () => {
    const synced: Product = { id: 'p2', name: 'Alfajor', ean: '7791234567898' };
    const form = { ...EMPTY_PRODUCT_FORM, name: 'Otro', ean: '7791234567898' };
    expect(resolvePriceProduct({ kind: 'new', form }, [own, synced], 'n')).toEqual({ product: synced, isNew: false });
  });

  it('nuevo solo con el nombre → sin claves vacías en el JSON guardado', () => {
    const { product, isNew } = resolvePriceProduct({ kind: 'new', form: { ...EMPTY_PRODUCT_FORM, name: 'Pan casero', brand: ' ', category: ' ' } }, [own], 'n');
    expect(isNew).toBe(true);
    expect(JSON.parse(JSON.stringify(product))).toEqual({ id: 'n', name: 'Pan casero', origin: 'manual' });
  });

  it('nuevo con la presentación en 0 → sin número ni unidad', () => {
    const { product } = resolvePriceProduct({ kind: 'new', form: { ...EMPTY_PRODUCT_FORM, name: 'Pan', size: '0', sizeUnit: 'kg' } }, [own], 'n');
    expect(JSON.parse(JSON.stringify(product))).toEqual({ id: 'n', name: 'Pan', origin: 'manual' });
  });
});

// ── manualProductForm ─────────────────────────────────────

describe('manualProductForm', () => {
  it('lo escrito va al nombre, tal como se escribió', () => {
    expect(manualProductForm('alfajor LUNA')).toEqual({ ...EMPTY_PRODUCT_FORM, name: 'alfajor LUNA' });
  });

  it('un código válido va al código, normalizado, y el nombre queda vacío', () => {
    expect(manualProductForm(' 7790001000019 ')).toEqual({ ...EMPTY_PRODUCT_FORM, ean: '7790001000019' });
    expect(manualProductForm('96385074').ean).toBe('0000096385074');
    expect(manualProductForm('036000291452').ean).toBe('0036000291452');
  });

  it('un número que no es un código válido va al nombre', () => {
    expect(manualProductForm('7790001000018')).toEqual({ ...EMPTY_PRODUCT_FORM, name: '7790001000018' });
  });

  it('en blanco, el formulario vacío', () => {
    expect(manualProductForm('   ')).toEqual(EMPTY_PRODUCT_FORM);
  });
});

// ── manualOffer ───────────────────────────────────────────

describe('manualOffer', () => {
  type Input = Parameters<typeof manualOffer>[0];

  function offer(patch: Partial<Input> = {}) {
    return manualOffer({
      query: 'alfajor luna', ownCount: 0, catalog: { status: 'done', count: 0 }, catalogEnabled: true, ...patch,
    });
  }

  const DISCREET = { prominent: false, message: null, label: '¿No está? Cargar "alfajor luna" a mano' };

  it('sin texto, nada', () => {
    expect(offer({ query: '', catalog: { status: 'idle', count: 0 } })).toBeNull();
    expect(offer({ query: '   ', catalog: { status: 'idle', count: 0 }, catalogEnabled: false })).toBeNull();
  });

  it('buscando, nada, aunque haya propios', () => {
    expect(offer({ catalog: { status: 'loading', count: 0 } })).toBeNull();
    expect(offer({ catalog: { status: 'loading', count: 0 }, ownCount: 2 })).toBeNull();
  });

  it('sin propios ni resultados del catálogo, destacada', () => {
    expect(offer()).toEqual({
      prominent: true,
      message: 'No encontramos "alfajor luna" en tus productos ni en Precios Claros.',
      label: 'Cargar "alfajor luna" a mano',
    });
  });

  it('sin propios y si falla la consulta, destacada', () => {
    expect(offer({ catalog: { status: 'error', count: 0 } })).toEqual({
      prominent: true, message: 'No se pudo consultar Precios Claros', label: 'Cargar "alfajor luna" a mano',
    });
  });

  it('sin propios y sin Supabase, destacada', () => {
    expect(offer({ catalog: { status: 'idle', count: 0 }, catalogEnabled: false })).toEqual({
      prominent: true, message: 'No encontramos "alfajor luna" en tus productos.', label: 'Cargar "alfajor luna" a mano',
    });
  });

  it('con menos de 3 caracteres y sin propios, discreta', () => {
    const short = { prominent: false, message: null, label: '¿No está? Cargar "al" a mano' };
    expect(offer({ query: 'al', catalog: { status: 'idle', count: 0 } })).toEqual(short);
    expect(offer({ query: 'al', catalog: { status: 'idle', count: 0 }, catalogEnabled: false })).toEqual(short);
  });

  it('con algún resultado, propio o del catálogo, discreta', () => {
    expect(offer({ ownCount: 1 })).toEqual(DISCREET);
    expect(offer({ catalog: { status: 'done', count: 3 } })).toEqual(DISCREET);
    expect(offer({ ownCount: 1, catalog: { status: 'error', count: 0 } })).toEqual(DISCREET);
    expect(offer({ ownCount: 1, catalog: { status: 'idle', count: 0 }, catalogEnabled: false })).toEqual(DISCREET);
  });

  it('muestra el texto sin los espacios de los bordes', () => {
    expect(offer({ query: ' alfajor luna ' })?.label).toBe('Cargar "alfajor luna" a mano');
  });

  it('con un código válido, dice el código normalizado', () => {
    expect(offer({ query: '7790001000019' })).toEqual({
      prominent: true,
      message: 'El código 7790001000019 no está en tus productos ni en Precios Claros.',
      label: 'Cargar el código 7790001000019 a mano',
    });
    expect(offer({ query: '96385074' })?.label).toBe('Cargar el código 0000096385074 a mano');
    expect(offer({ query: '036000291452' })?.label).toBe('Cargar el código 0036000291452 a mano');
    expect(offer({ query: '7790001000019', catalog: { status: 'idle', count: 0 }, catalogEnabled: false })?.message)
      .toBe('El código 7790001000019 no está en tus productos.');
    expect(offer({ query: '7790001000019', ownCount: 1 })?.label).toBe('¿No está? Cargar el código 7790001000019 a mano');
  });

  it('un número que no es un código válido va entre comillas', () => {
    expect(offer({ query: '7790001000018' })?.label).toBe('Cargar "7790001000018" a mano');
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
