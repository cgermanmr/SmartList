import { describe, expect, it } from 'vitest';
import { CartItem, Price, Product, Purchase } from './models';
import { defaultCalculator } from './storage';
import { getPriceStats } from './store';
import {
  acknowledge, changesToRecords, dedupeByEan, dedupeCart, diffCollection, enqueue, mergeRemote, pullSince, pushOrder,
  RemoteRow, restoreTime, restoreUsedProducts, snapshotRecords, SyncData, SyncRecord, withoutSamples,
} from './sync';

// ── Fixtures ─────────────────────────────────────────────────

const AT = '2026-11-17T12:00:00.000Z';
const LATER = '2026-11-17T13:00:00.000Z';
const EARLIER = '2026-11-17T11:00:00.000Z';

function product(id: string, ean?: string): Product {
  return { id, name: `Producto ${id}`, ...(ean && { ean }) };
}

function price(id: string, productId: string, amount = 100, date = '2026-11-10T10:00:00.000Z'): Price {
  return { id, productId, amount, date: date as unknown as Date, barrio: 'Almagro' };
}

function item(id: string, productId: string, quantity = 1, price = 100): CartItem {
  return { id, productId, productName: `Producto ${productId}`, price, quantity, subtotal: price * quantity };
}

function purchase(id: string, date: string, items: CartItem[] = []): Purchase {
  return { id, date, items, total: items.reduce((sum, i) => sum + i.subtotal, 0) };
}

function data(partial: Partial<SyncData> = {}): SyncData {
  return { products: [], prices: [], cart: [], purchases: [], calculator: defaultCalculator(), ...partial };
}

function row(collection: RemoteRow['collection'], id: string, value: unknown, modified = AT, deleted = false): RemoteRow {
  return { collection, id, data: deleted ? null : value, deleted, modified_at: modified, synced_at: '2026-11-17T14:00:00.000Z' };
}

function record(collection: SyncRecord['collection'], id: string, modifiedAt = AT, value: unknown = { id }): SyncRecord {
  return { collection, id, data: value, deleted: false, modifiedAt };
}

// ── Detección de cambios ─────────────────────────────────────

describe('diffCollection', () => {
  it('devuelve los nuevos y los que cambiaron de referencia', () => {
    const a = product('a');
    const b = product('b');
    const b2 = { ...b, name: 'Otro' };
    const c = product('c');
    expect(diffCollection([a, b], [a, b2, c])).toEqual({ changed: [b2, c], removedIds: [] });
  });

  it('con las mismas referencias no hay cambios', () => {
    const list = [product('a'), product('b')];
    expect(diffCollection(list, [...list])).toEqual({ changed: [], removedIds: [] });
  });

  it('informa los quitados', () => {
    const a = product('a');
    expect(diffCollection([a, product('b')], [a])).toEqual({ changed: [], removedIds: ['b'] });
  });
});

describe('changesToRecords', () => {
  it('un precio agregado es un registro de prices', () => {
    const before = data();
    const p = price('p1', 'a');
    expect(changesToRecords(before, { ...before, prices: [p] }, AT)).toEqual([
      { collection: 'prices', id: 'p1', data: p, deleted: false, modifiedAt: AT },
    ]);
  });

  it('un ítem quitado del carrito es un borrado', () => {
    const before = data({ cart: [item('i1', 'a')] });
    expect(changesToRecords(before, { ...before, cart: [] }, AT)).toEqual([
      { collection: 'cart', id: 'i1', data: null, deleted: true, modifiedAt: AT },
    ]);
  });

  it('la calculadora nueva es el registro settings/calculator', () => {
    const before = data();
    const calculator = { ...before.calculator, magnitude: 'volumen' as const };
    expect(changesToRecords(before, { ...before, calculator }, AT)).toEqual([
      { collection: 'settings', id: 'calculator', data: calculator, deleted: false, modifiedAt: AT },
    ]);
  });

  it('sin cambios de referencia no hay registros', () => {
    const before = data({ products: [product('a')] });
    expect(changesToRecords(before, { ...before }, AT)).toEqual([]);
  });
});

describe('snapshotRecords', () => {
  it('incluye todos los registros y la calculadora', () => {
    const snapshot = snapshotRecords(data({ products: [product('a')], prices: [price('p1', 'a')] }), AT);
    expect(snapshot.map(r => `${r.collection}/${r.id}`)).toEqual(['products/a', 'prices/p1', 'settings/calculator']);
  });
});

// ── Cola ─────────────────────────────────────────────────────

describe('enqueue', () => {
  it('deja un solo pendiente por registro: el último', () => {
    const first = record('prices', 'p1', AT, { amount: 1 });
    const second = record('prices', 'p1', LATER, { amount: 2 });
    const other = record('products', 'p1');
    expect(enqueue([first, other], [second])).toEqual([other, second]);
  });
});

describe('acknowledge', () => {
  it('saca lo enviado', () => {
    const a = record('prices', 'p1');
    const b = record('prices', 'p2');
    expect(acknowledge([a, b], [a])).toEqual([b]);
  });

  it('conserva un cambio del mismo registro encolado mientras se enviaba', () => {
    const sent = record('prices', 'p1', AT, { amount: 1 });
    const newer = record('prices', 'p1', LATER, { amount: 2 });
    expect(acknowledge(enqueue([sent], [newer]), [sent])).toEqual([newer]);
  });
});

// ── Merge ────────────────────────────────────────────────────

describe('mergeRemote', () => {
  it('agrega una fila nueva', () => {
    const p = price('p1', 'a');
    expect(mergeRemote(data(), [row('prices', 'p1', p)], []).prices).toEqual([p]);
  });

  it('reemplaza un registro existente en su lugar', () => {
    const local = data({ cart: [item('i1', 'a'), item('i2', 'b')] });
    const remote = item('i1', 'a', 3);
    expect(mergeRemote(local, [row('cart', 'i1', remote)], []).cart).toEqual([remote, item('i2', 'b')]);
  });

  it('una fila borrada quita el registro', () => {
    const local = data({ cart: [item('i1', 'a')] });
    expect(mergeRemote(local, [row('cart', 'i1', null, AT, true)], []).cart).toEqual([]);
  });

  it('un pendiente local más nuevo gana, aunque la fila sea un borrado', () => {
    const local = data({ cart: [item('i1', 'a', 2)] });
    const pending = [record('cart', 'i1', LATER, item('i1', 'a', 2))];
    expect(mergeRemote(local, [row('cart', 'i1', null, AT, true)], pending).cart).toEqual([item('i1', 'a', 2)]);
  });

  it('un pendiente local más viejo pierde', () => {
    const local = data({ cart: [item('i1', 'a', 2)] });
    const pending = [record('cart', 'i1', EARLIER, item('i1', 'a', 2))];
    const remote = item('i1', 'a', 5);
    expect(mergeRemote(local, [row('cart', 'i1', remote)], pending).cart).toEqual([remote]);
  });

  it('compara las fechas como fechas, no como texto', () => {
    const local = data({ cart: [item('i1', 'a', 2)] });
    // 09:30-03:00 es 12:30Z: la fila es más nueva que el pendiente de las 12:00Z, aunque como texto "09" < "12"
    const pending = [record('cart', 'i1', '2026-11-17T12:00:00.000Z', item('i1', 'a', 2))];
    const remote = row('cart', 'i1', item('i1', 'a', 9), '2026-11-17T09:30:00-03:00');
    expect(mergeRemote(local, [remote], pending).cart).toEqual([item('i1', 'a', 9)]);
  });

  it('aplicar dos veces las mismas filas da lo mismo', () => {
    const rows = [row('prices', 'p1', price('p1', 'a')), row('products', 'a', product('a'))];
    const once = mergeRemote(data(), rows, []);
    expect(mergeRemote(once, rows, [])).toEqual(once);
  });

  it('los precios bajados conservan la fecha como texto y sirven para las estadísticas', () => {
    const rows = [
      row('prices', 'p1', price('p1', 'a', 100, '2026-11-01T10:00:00.000Z')),
      row('prices', 'p2', price('p2', 'a', 120, '2026-11-05T10:00:00.000Z')),
    ];
    const merged = mergeRemote(data(), rows, []);
    expect(typeof merged.prices[0].date).toBe('string');
    expect(getPriceStats(merged.prices, 'a')).toMatchObject({ current: 120, previous: 100 });
  });

  it('settings/calculator reemplaza la calculadora', () => {
    const calculator = { ...defaultCalculator(), magnitude: 'unidades' as const };
    expect(mergeRemote(data(), [row('settings', 'calculator', calculator)], []).calculator).toEqual(calculator);
  });

  it('las compras quedan de la más reciente a la más vieja', () => {
    const local = data({ purchases: [purchase('c2', '2026-11-10T10:00:00.000Z')] });
    const merged = mergeRemote(local, [
      row('purchases', 'c3', purchase('c3', '2026-11-12T10:00:00.000Z')),
      row('purchases', 'c1', purchase('c1', '2026-11-01T10:00:00.000Z')),
    ], []);
    expect(merged.purchases.map(p => p.id)).toEqual(['c3', 'c2', 'c1']);
  });

  it('sin filas devuelve el mismo estado', () => {
    const local = data({ products: [product('a')] });
    expect(mergeRemote(local, [], [])).toBe(local);
  });

  it('ignora filas sin datos válidos', () => {
    expect(mergeRemote(data(), [row('prices', 'p1', 'basura')], []).prices).toEqual([]);
  });
});

// ── Duplicados ───────────────────────────────────────────────

describe('dedupeByEan', () => {
  const EAN = '7790000000017';

  it('deja el producto de id menor y pasa a él precios, carrito y compras', () => {
    const merged = dedupeByEan(data({
      products: [product('b', EAN), product('a', EAN), product('c')],
      prices: [price('p1', 'b'), price('p2', 'a')],
      cart: [item('i1', 'b')],
      purchases: [purchase('c1', AT, [item('x', 'b')])],
    }));
    expect(merged.products.map(p => p.id)).toEqual(['a', 'c']);
    expect(merged.prices.map(p => p.productId)).toEqual(['a', 'a']);
    expect(merged.cart[0].productId).toBe('a');
    expect(merged.purchases[0].items[0].productId).toBe('a');
  });

  it('no toca los productos sin EAN ni devuelve un estado nuevo si no hay duplicados', () => {
    const local = data({ products: [product('a'), product('b'), product('c', EAN)] });
    expect(dedupeByEan(local)).toBe(local);
  });
});

describe('dedupeCart', () => {
  it('deja el ítem modificado más tarde, con su cantidad, precio y comercio', () => {
    const old = item('i1', 'a', 1, 100);
    const recent = { ...item('i2', 'a', 4, 90), store: { name: 'Coto' } };
    const other = item('i3', 'b');
    const modified = new Map([['i1', AT], ['i2', LATER]]);
    expect(dedupeCart([old, other, recent], modified)).toEqual([other, recent]);
  });

  it('sin fecha conocida, el ítem cuenta como más viejo', () => {
    const local = item('i1', 'a');
    const remote = item('i2', 'a', 2);
    expect(dedupeCart([local, remote], new Map([['i2', AT]]))).toEqual([remote]);
  });

  it('compara fechas en distintos formatos', () => {
    const a = item('i1', 'a');
    const b = item('i2', 'a', 2);
    const modified = new Map([['i1', '2026-11-17T12:00:00.000Z'], ['i2', '2026-11-17T09:30:00-03:00']]);
    expect(dedupeCart([a, b], modified)).toEqual([b]);
  });

  it('sin duplicados devuelve el mismo carrito', () => {
    const cart = [item('i1', 'a'), item('i2', 'b')];
    expect(dedupeCart(cart, new Map())).toBe(cart);
  });
});

// ── Datos de ejemplo ─────────────────────────────────────────

describe('withoutSamples', () => {
  const samples = ['1', '2', '3', '4', '5', '6', '7', '8'].map(id => product(id));
  const samplePrices = [price('1', '1'), price('2', '1'), price('3', '2')];

  it('saca los productos y precios de ejemplo sin usar', () => {
    const clean = withoutSamples(data({ products: [...samples, product('mio')], prices: samplePrices }));
    expect(clean.products.map(p => p.id)).toEqual(['mio']);
    expect(clean.prices).toEqual([]);
  });

  it('conserva un producto de ejemplo usado por un precio propio, el carrito o una compra', () => {
    const clean = withoutSamples(data({
      products: samples,
      prices: [...samplePrices, price('p-propio', '2')],
      cart: [item('i1', '3')],
      purchases: [purchase('c1', AT, [item('x', '4')])],
    }));
    expect(clean.products.map(p => p.id)).toEqual(['2', '3', '4']);
    expect(clean.prices.map(p => p.id)).toEqual(['p-propio']);
  });
});

describe('pullSince', () => {
  it('baja desde 5 minutos antes del cursor', () => {
    expect(pullSince('2026-11-17T12:00:00.000Z')).toBe('2026-11-17T11:55:00.000Z');
  });

  it('sin cursor baja todo', () => {
    expect(pullSince(null)).toBeNull();
  });
});

// ── Eliminar producto con dos dispositivos (spec 33) ─────────

describe('restoreUsedProducts', () => {
  const gone = row('products', 'a', null, AT, true);
  /** Lo local y lo que queda al juntar el borrado de `a` */
  function merge(local: SyncData, rows: RemoteRow[] = [gone]) {
    return { local, merged: mergeRemote(local, rows, []), rows };
  }

  it.each<[string, Partial<SyncData>]>([
    ['un precio', { prices: [price('p', 'a')] }],
    ['el carrito', { cart: [item('i', 'a')] }],
    ['una compra', { purchases: [purchase('c', '2026-11-10', [item('i', 'a')])] }],
  ])('vuelve si lo usa %s', (_name, partial) => {
    const { local, merged, rows } = merge(data({ products: [product('a'), product('b')], ...partial }));
    const { data: result, restoredIds } = restoreUsedProducts(local, merged, rows);
    expect(restoredIds).toEqual(['a']);
    expect(result.products.map(p => p.id).sort()).toEqual(['a', 'b']);
  });

  it('también si lo usa algo que bajó en la misma vuelta', () => {
    const { local, merged, rows } = merge(data({ products: [product('a')] }), [gone, row('prices', 'p', price('p', 'a'))]);
    expect(restoreUsedProducts(local, merged, rows).restoredIds).toEqual(['a']);
  });

  it('vuelve con sus datos y sin la foto', () => {
    const full: Product = {
      id: 'a', name: 'Leche', brand: 'X', size: 1, sizeUnit: 'l', category: 'Lácteos', ean: '7793704000911',
      photo: { id: 'f', takenAt: AT },
    };
    const { local, merged, rows } = merge(data({ products: [full], prices: [price('p', 'a')] }));
    const [restored] = restoreUsedProducts(local, merged, rows).data.products;
    expect(restored).toEqual({
      id: 'a', name: 'Leche', brand: 'X', size: 1, sizeUnit: 'l', category: 'Lácteos', ean: '7793704000911',
    });
    expect('photo' in restored).toBe(false);
  });

  it('los precios y el ítem borrados con él no vuelven', () => {
    const { local, merged, rows } = merge(
      data({ products: [product('a')], prices: [price('p1', 'a'), price('p2', 'a')], cart: [item('i', 'a')] }),
      [row('prices', 'p1', null, AT, true), row('cart', 'i', null, AT, true), gone],
    );
    const result = restoreUsedProducts(local, merged, rows).data;
    expect(result.products.map(p => p.id)).toEqual(['a']);
    expect(result.prices.map(p => p.id)).toEqual(['p2']);
    expect(result.cart).toEqual([]);
  });

  it('sin uso queda borrado, con el mismo estado', () => {
    const { local, merged, rows } = merge(data({ products: [product('a')], prices: [price('p', 'b')] }));
    const result = restoreUsedProducts(local, merged, rows);
    expect(result.data).toBe(merged);
    expect(result.restoredIds).toEqual([]);
  });

  it('los precios de ejemplo no cuentan como uso', () => {
    const { local, merged, rows } = merge(data({ products: [product('a')], prices: [price('1', 'a'), price('3', 'a')] }));
    expect(restoreUsedProducts(local, merged, rows).data).toBe(merged);
  });

  it('un producto que este dispositivo no tenía no se inventa', () => {
    const { local, merged, rows } = merge(data({ prices: [price('p', 'a')] }));
    expect(restoreUsedProducts(local, merged, rows).data).toBe(merged);
  });

  it('un borrado que pierde contra un cambio local pendiente no necesita restaurarse', () => {
    const local = data({ products: [product('a')], prices: [price('p', 'a')] });
    const merged = mergeRemote(local, [gone], [record('products', 'a', LATER)]);
    expect(restoreUsedProducts(local, merged, [gone]).data).toBe(merged);
  });

  it('con el código tomado por otro producto, después se unen', () => {
    const EAN = '7793704000911';
    const { local, merged, rows } = merge(
      data({ products: [product('z', EAN)], prices: [price('p', 'z')] }),
      [row('products', 'z', null, AT, true), row('products', 'b', product('b', EAN))],
    );
    const deduped = dedupeByEan(restoreUsedProducts(local, merged, rows).data);
    expect(deduped.products.map(p => p.id)).toEqual(['b']);
    expect(deduped.prices[0].productId).toBe('b');
  });

  it('aplicar dos veces las mismas filas no restaura de nuevo', () => {
    const { local, merged, rows } = merge(data({ products: [product('a')], prices: [price('p', 'a')] }));
    const first = restoreUsedProducts(local, merged, rows);
    const queued = record('products', 'a', restoreTime(first.restoredIds, rows, EARLIER), first.data.products[0]);
    const again = mergeRemote(first.data, rows, [queued]);
    const second = restoreUsedProducts(first.data, again, rows);
    expect(second.restoredIds).toEqual([]);
    expect(second.data.products.map(p => p.id)).toEqual(['a']);
  });
});

describe('restoreTime', () => {
  const rows = [
    row('products', 'a', null, AT, true),
    row('products', 'b', null, LATER, true),
    row('prices', 'a', null, '2027-01-01T00:00:00Z', true),
  ];

  it('con el reloj bien, es la hora de ahora', () => {
    expect(restoreTime(['a'], rows, LATER)).toBe(LATER);
  });

  it('con el reloj atrasado, 1 ms después del borrado más nuevo de los restaurados', () => {
    expect(restoreTime(['a'], rows, EARLIER)).toBe('2026-11-17T12:00:00.001Z');
    expect(restoreTime(['a', 'b'], rows, EARLIER)).toBe('2026-11-17T13:00:00.001Z');
  });

  it('con la misma hora del borrado, también es posterior', () => {
    expect(restoreTime(['a'], rows, AT)).toBe('2026-11-17T12:00:00.001Z');
  });

  it('entiende las fechas de Postgres', () => {
    const deleted = row('products', 'a', null, '2026-11-17T12:00:00.5+00:00', true);
    expect(restoreTime(['a'], [deleted], EARLIER)).toBe('2026-11-17T12:00:00.501Z');
  });
});

describe('pushOrder', () => {
  it('los borrados de productos, al final; el resto conserva su orden', () => {
    const del = (collection: SyncRecord['collection'], id: string): SyncRecord =>
      ({ collection, id, data: null, deleted: true, modifiedAt: AT });
    const records = [
      del('products', 'a'), record('products', 'b'), del('prices', 'p'), del('products', 'c'), del('cart', 'i'),
      record('prices', 'q'),
    ];
    expect(pushOrder(records).map(r => `${r.collection}/${r.id}`)).toEqual(
      ['products/b', 'prices/p', 'cart/i', 'prices/q', 'products/a', 'products/c']);
  });

  it('sin borrados de productos, el mismo orden', () => {
    const records = [record('products', 'b'), record('prices', 'p')];
    expect(pushOrder(records)).toEqual(records);
  });
});
