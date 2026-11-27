import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CartItem, Price, Product, Purchase, StoreRef } from './models';
import type { SepaProduct } from './sepa';
import type { SharedLoad } from './shared-cart';
import { CALCULATOR_KEY, CART_KEY, LOCATION_KEY, PRICES_KEY, PRODUCTS_KEY, PURCHASES_KEY, defaultCalculator } from './storage';
import {
  filterProducts, getCartStores, getCartTotal, getLastPurchasedPrice, getPriceStats, getRecentStorePrices,
  NO_BARRIO, groupCartByStore, initialCartPrice, priceStoreRef, purchasesWithProduct, purchaseStoreRef,
  storeKey, useStore,
} from './store';

// localStorage en memoria para el entorno de Node
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

const initialState = useStore.getState();

function item(productId: string, price: number, quantity = 1, store?: StoreRef): CartItem {
  return {
    id: `item-${productId}`, productId, productName: `Producto ${productId}`, price, quantity, subtotal: price * quantity,
    ...(store && { store }),
  };
}

function saved<T>(key: string): T {
  return JSON.parse(storage.getItem(key)!);
}

beforeEach(() => {
  storage.clear();
  useStore.setState(initialState, true);
});

describe('hydrate', () => {
  it('sin datos guardados arranca vacío, sin datos de ejemplo', () => {
    useStore.getState().hydrate();
    const s = useStore.getState();
    expect(s.hydrated).toBe(true);
    expect(s.products).toEqual([]);
    expect(s.prices).toEqual([]);
    expect(s.cart).toEqual([]);
    expect(s.calculator).toEqual(defaultCalculator());
  });

  it('lee los datos guardados por la versión anterior (fechas como string)', () => {
    storage.setItem(PRODUCTS_KEY, JSON.stringify([{ id: 'p1', name: 'Arroz', category: 'Almacen' }]));
    storage.setItem(PRICES_KEY, JSON.stringify([
      { id: 'a', productId: 'p1', amount: 100, date: '2026-01-01T10:00:00.000Z', barrio: 'Almagro' },
      { id: 'b', productId: 'p1', amount: 120, date: '2026-03-01T10:00:00.000Z', barrio: 'Almagro' },
    ]));
    useStore.getState().hydrate();
    const s = useStore.getState();
    expect(s.products.map(p => p.name)).toEqual(['Arroz']);
    expect(getPriceStats(s.prices, 'p1')).toEqual({ current: 120, previous: 100, min: 100, max: 120, avg: 110 });
  });

  it('un carrito guardado sin comercios queda entero en "Sin comercio"', () => {
    storage.setItem(CART_KEY, JSON.stringify([
      { id: 'a', productId: '1', productName: 'Leche', price: 100, quantity: 2, subtotal: 200 },
      { id: 'b', productId: '2', productName: 'Pan', price: 50, quantity: 1, subtotal: 50 },
    ]));
    useStore.getState().hydrate();
    const groups = groupCartByStore(useStore.getState().cart);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: '', total: 250 });
  });

  it('descarta una calculadora guardada inválida', () => {
    storage.setItem(CALCULATOR_KEY, JSON.stringify({ magnitude: 'peso', presentations: [] }));
    useStore.getState().hydrate();
    expect(useStore.getState().calculator).toEqual(defaultCalculator());
  });

  it('escribe el origen de los productos guardados sin él y lo guarda (spec 36)', () => {
    storage.setItem(PRODUCTS_KEY, JSON.stringify([
      { id: 'p1', name: 'Yerba', ean: '7793704000508' },
      { id: 'p2', name: 'Café', ean: '7790000000017', category: 'Almacen' },
      { id: 'p3', name: 'Pan' },
      { id: 'p4', name: 'Leche', ean: '7790000000024', origin: 'manual' },
    ]));
    useStore.getState().hydrate();
    const origins = (products: Product[]) => products.map(p => `${p.id}/${p.origin}`);
    const expected = ['p1/sepa', 'p2/manual', 'p3/manual', 'p4/manual'];
    expect(origins(useStore.getState().products)).toEqual(expected);
    expect(origins(saved<Product[]>(PRODUCTS_KEY))).toEqual(expected);
  });

  it('con todos los productos con origen no los vuelve a guardar', () => {
    const raw = JSON.stringify([{ id: 'p1', name: 'Pan', origin: 'manual' }]);
    storage.setItem(PRODUCTS_KEY, raw);
    const setItem = vi.spyOn(storage, 'setItem');
    useStore.getState().hydrate();
    expect(setItem).not.toHaveBeenCalledWith(PRODUCTS_KEY, expect.anything());
    setItem.mockRestore();
  });

  it('no guarda nada antes de hidratar', () => {
    useStore.getState().addProduct({ id: 'x', name: 'X', category: 'Y' });
    expect(storage.getItem(PRODUCTS_KEY)).toBeNull();
  });
});

describe('updateProduct', () => {
  const linked: Product = {
    id: 'p1', name: 'Yerba', category: 'Almacen',
    ean: '7793704000508', brand: 'Playadito', size: 500, sizeUnit: 'g', origin: 'manual',
  };

  beforeEach(() => {
    storage.setItem(PRODUCTS_KEY, JSON.stringify([linked, { id: 'p2', name: 'Arroz', category: 'Almacen', origin: 'manual' }]));
    useStore.getState().hydrate();
  });

  it('cambia solo los campos indicados sin mutar el producto anterior', () => {
    const before = useStore.getState().products[0];
    useStore.getState().updateProduct('p1', { brand: 'Otra marca' });
    expect(useStore.getState().products[0]).toEqual({ ...linked, brand: 'Otra marca' });
    expect(before.brand).toBe('Playadito');
  });

  it('no toca los demás productos', () => {
    const other = useStore.getState().products[1];
    useStore.getState().updateProduct('p1', { brand: 'Otra marca' });
    expect(useStore.getState().products[1]).toBe(other);
  });

  it('con ean undefined quita el vínculo del JSON guardado y conserva marca y presentación', () => {
    useStore.getState().updateProduct('p1', { ean: undefined });
    expect(saved<Product[]>(PRODUCTS_KEY)[0]).toEqual({
      id: 'p1', name: 'Yerba', category: 'Almacen', brand: 'Playadito', size: 500, sizeUnit: 'g', origin: 'manual',
    });
  });
});

describe('carrito', () => {
  beforeEach(() => useStore.getState().hydrate());

  it('agregar un producto existente suma cantidad sin mutar el ítem anterior', () => {
    const { addToCart } = useStore.getState();
    addToCart(item('1', 100));
    const before = useStore.getState().cart[0];
    addToCart(item('1', 100));
    const after = useStore.getState().cart[0];
    expect(after).toMatchObject({ quantity: 2, subtotal: 200 });
    expect(before).toMatchObject({ quantity: 1, subtotal: 100 });
    expect(saved<CartItem[]>(CART_KEY)[0].quantity).toBe(2);
  });

  it('actualiza cantidad y precio recalculando el subtotal', () => {
    const s = useStore.getState();
    s.addToCart(item('1', 100));
    s.updateQuantity('item-1', 3);
    s.updateCartItemPrice('item-1', 50);
    expect(useStore.getState().cart[0]).toMatchObject({ price: 50, quantity: 3, subtotal: 150 });
  });

  it('ignora precios no positivos', () => {
    const s = useStore.getState();
    s.addToCart(item('1', 100));
    s.updateCartItemPrice('item-1', 0);
    expect(useStore.getState().cart[0].price).toBe(100);
  });

  it('calcula el total', () => {
    expect(getCartTotal([item('1', 100, 2), item('2', 50)])).toBe(250);
  });

  it('agregar un producto que ya está sin comercio conserva el comercio y el precio del ítem', () => {
    const { addToCart } = useStore.getState();
    addToCart(item('1', 100, 1, { name: 'Coto' }));
    addToCart(item('1', 80));
    const cart = useStore.getState().cart;
    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({ quantity: 2, price: 100, subtotal: 200, store: { name: 'Coto' } });
  });

  it('agregar un producto que ya está con comercio lo pasa a ese comercio y precio', () => {
    const { addToCart } = useStore.getState();
    addToCart(item('1', 100, 2));
    addToCart(item('1', 80, 1, { name: 'Día', barrio: 'Almagro' }));
    const cart = useStore.getState().cart;
    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({ quantity: 3, price: 80, subtotal: 240, store: { name: 'Día', barrio: 'Almagro' } });
  });

  it('saca solo los ítems indicados', () => {
    const s = useStore.getState();
    s.addToCart(item('1', 100));
    s.addToCart(item('2', 50));
    s.addToCart(item('3', 10));
    s.removeCartItems(['item-1', 'item-3']);
    expect(useStore.getState().cart.map(i => i.productId)).toEqual(['2']);
  });
});

describe('setCartItemStore', () => {
  beforeEach(() => {
    useStore.getState().hydrate();
    const s = useStore.getState();
    s.addToCart(item('1', 100, 2));
    s.addToCart(item('2', 50));
  });

  it('cambia el comercio sin tocar cantidad ni precio y sin mutar el ítem anterior', () => {
    const before = useStore.getState().cart[0];
    useStore.getState().setCartItemStore('item-1', { name: 'Coto' });
    const after = useStore.getState().cart[0];
    expect(after).toMatchObject({ store: { name: 'Coto' }, quantity: 2, price: 100, subtotal: 200 });
    expect(before.store).toBeUndefined();
    expect(useStore.getState().cart[1].store).toBeUndefined();
    expect(saved<CartItem[]>(CART_KEY)[0].store).toEqual({ name: 'Coto' });
  });

  it('con precio cambia también el precio y recalcula el subtotal', () => {
    useStore.getState().setCartItemStore('item-1', { name: 'Coto', sepaId: '10-1-123' }, 90);
    expect(useStore.getState().cart[0]).toMatchObject({ price: 90, quantity: 2, subtotal: 180 });
  });

  it('ignora un precio no positivo', () => {
    useStore.getState().setCartItemStore('item-1', { name: 'Coto' }, 0);
    expect(useStore.getState().cart[0]).toMatchObject({ price: 100, store: { name: 'Coto' } });
  });

  it('sin comercio lo vuelve a "Sin comercio" y lo saca del JSON guardado', () => {
    const s = useStore.getState();
    s.setCartItemStore('item-1', { name: 'Coto' });
    s.setCartItemStore('item-1');
    expect(useStore.getState().cart[0].store).toBeUndefined();
    expect('store' in saved<CartItem[]>(CART_KEY)[0]).toBe(false);
  });

  // ── Completar los demás ítems del mismo comercio (spec 35) ──
  const luna: StoreRef = { name: 'Super Luna' };
  const lunaFull: StoreRef = { name: 'Super luna', address: 'Av. Caseros 2500', lat: -34.6356, lng: -58.3974 };

  it('los demás ítems del mismo comercio toman la dirección y el punto, en un solo cambio', () => {
    const s = useStore.getState();
    s.setCartItemStore('item-1', luna);
    let changes = 0;
    const unsubscribe = useStore.subscribe(() => { changes++; });
    s.setCartItemStore('item-2', lunaFull);
    unsubscribe();
    expect(changes).toBe(1);
    expect(useStore.getState().cart.map(i => i.store)).toEqual([lunaFull, lunaFull]);
    expect(useStore.getState().cart[0]).toMatchObject({ price: 100, quantity: 2, subtotal: 200 });
  });

  it('también con el ítem que ya estaba en ese comercio', () => {
    const s = useStore.getState();
    s.setCartItemStore('item-1', luna);
    s.setCartItemStore('item-2', luna);
    s.setCartItemStore('item-1', lunaFull);
    expect(useStore.getState().cart.map(i => i.store)).toEqual([lunaFull, lunaFull]);
  });

  it('no toca los ítems de otro comercio, ni los que no tienen', () => {
    const s = useStore.getState();
    s.addToCart(item('3', 10));
    s.setCartItemStore('item-1', { name: 'Super Luna', barrio: 'Caballito' });
    const [otherBarrio, , none] = useStore.getState().cart;
    s.setCartItemStore('item-2', lunaFull);
    expect(useStore.getState().cart[0]).toBe(otherBarrio);
    expect(useStore.getState().cart[2]).toBe(none);
    s.setCartItemStore('item-2');
    expect(useStore.getState().cart[2]).toBe(none);
  });

  it('un comercio escrito sin dirección ni punto no borra los que ya había: el ítem toma esos', () => {
    const s = useStore.getState();
    s.setCartItemStore('item-1', lunaFull);
    const first = useStore.getState().cart[0];
    s.setCartItemStore('item-2', luna);
    expect(useStore.getState().cart[0]).toBe(first);
    expect(useStore.getState().cart[1].store).toEqual(lunaFull);
  });

  it('un ítem que ya tiene esos datos no cambia', () => {
    const s = useStore.getState();
    s.setCartItemStore('item-1', lunaFull);
    const first = useStore.getState().cart[0];
    s.setCartItemStore('item-2', { ...lunaFull });
    expect(useStore.getState().cart[0]).toBe(first);
  });
});

describe('moveCartItems', () => {
  const coto: StoreRef = { name: 'Coto — Caballito', sepaId: '10-1-123', chain: 'Coto', lat: -34.61, lng: -58.44 };

  beforeEach(() => {
    useStore.getState().hydrate();
    const s = useStore.getState();
    s.addToCart(item('1', 100, 2));
    s.addToCart(item('2', 0, 3));
    s.addToCart(item('3', 50, 1, { name: 'Almacén Juan' }));
  });

  it('pasa los ítems pedidos al comercio con su precio, misma cantidad y subtotal recalculado', () => {
    useStore.getState().moveCartItems(coto, [{ itemId: 'item-1', price: 90 }, { itemId: 'item-2', price: 40 }]);
    const [first, second, third] = useStore.getState().cart;
    expect(first).toMatchObject({ store: coto, price: 90, quantity: 2, subtotal: 180 });
    // El ítem en $0 queda con precio
    expect(second).toMatchObject({ store: coto, price: 40, quantity: 3, subtotal: 120 });
    // Los demás no cambian
    expect(third).toMatchObject({ store: { name: 'Almacén Juan' }, price: 50, subtotal: 50 });
    expect(saved<CartItem[]>(CART_KEY)[0].store).toEqual(coto);
  });

  it('es un solo cambio del carrito y no muta los ítems anteriores', () => {
    const before = useStore.getState().cart;
    let changes = 0;
    const unsubscribe = useStore.subscribe((state, prev) => { if (state.cart !== prev.cart) changes++; });
    useStore.getState().moveCartItems(coto, [{ itemId: 'item-1', price: 90 }, { itemId: 'item-3', price: 45 }]);
    unsubscribe();
    expect(changes).toBe(1);
    expect(before[0]).toMatchObject({ price: 100 });
    expect(before[0].store).toBeUndefined();
    expect(useStore.getState().cart[1]).toBe(before[1]);
  });

  it('ignora los precios ≤ 0: ese ítem no cambia', () => {
    useStore.getState().moveCartItems(coto, [{ itemId: 'item-1', price: 0 }, { itemId: 'item-3', price: -5 }]);
    const [first, , third] = useStore.getState().cart;
    expect(first.store).toBeUndefined();
    expect(first.price).toBe(100);
    expect(third).toMatchObject({ store: { name: 'Almacén Juan' }, price: 50 });
  });

  it('sin movimientos válidos no cambia el carrito', () => {
    const before = useStore.getState().cart;
    useStore.getState().moveCartItems(coto, [{ itemId: 'item-1', price: 0 }]);
    useStore.getState().moveCartItems(coto, []);
    expect(useStore.getState().cart).toBe(before);
  });
});

describe('loadPurchaseToCart', () => {
  const purchase: Purchase = {
    id: 'c1', date: '2026-01-01T10:00:00.000Z', total: 330,
    items: [item('1', 150, 2), item('2', 30)],
  };

  beforeEach(() => useStore.getState().hydrate());

  it('reemplaza el carrito usando el precio actual registrado', () => {
    useStore.setState({ prices: [
      { id: 'r1', productId: '1', amount: 185, date: new Date('2026-11-10T10:00:00.000Z'), barrio: 'Almagro' },
      { id: 'r2', productId: '2', amount: 45, date: new Date('2026-11-10T10:00:00.000Z'), barrio: 'Almagro' },
    ] });
    const s = useStore.getState();
    s.addToCart(item('9', 10));
    s.loadPurchaseToCart(purchase);
    const cart = useStore.getState().cart;
    expect(cart.map(i => i.productId)).toEqual(['1', '2']);
    // Producto 1 tiene precio registrado (185); el 2 también (45)
    expect(cart[0]).toMatchObject({ price: 185, quantity: 2, subtotal: 370 });
    expect(cart[1]).toMatchObject({ price: 45, quantity: 1 });
  });

  it('combina con el carrito sumando cantidades', () => {
    const s = useStore.getState();
    s.addToCart(item('1', 185));
    s.loadPurchaseToCart(purchase, true);
    const cart = useStore.getState().cart;
    expect(cart).toHaveLength(2);
    expect(cart[0]).toMatchObject({ productId: '1', quantity: 3, subtotal: 555 });
  });

  it('una compra sin comercio carga los ítems en "Sin comercio"', () => {
    useStore.getState().loadPurchaseToCart(purchase);
    expect(useStore.getState().cart.every(i => i.store === undefined)).toBe(true);
  });

  it('una compra en un comercio carga los ítems en ese comercio', () => {
    useStore.getState().loadPurchaseToCart({ ...purchase, store: 'Coto', barrio: 'Caballito' });
    const cart = useStore.getState().cart;
    expect(cart.map(i => i.store)).toEqual([{ name: 'Coto', barrio: 'Caballito' }, { name: 'Coto', barrio: 'Caballito' }]);
    expect(groupCartByStore(cart)).toHaveLength(1);
  });

  it('el barrio "Sin especificar" no se copia al comercio', () => {
    useStore.getState().loadPurchaseToCart({ ...purchase, store: 'Coto', barrio: 'Sin especificar' });
    expect(useStore.getState().cart[0].store).toEqual({ name: 'Coto' });
  });

  it('un ítem guardado con su comercio lo conserva', () => {
    const withRef: Purchase = {
      ...purchase, store: 'Coto',
      items: [item('1', 150, 2, { name: 'Coto', sepaId: '10-1-123' })],
    };
    useStore.getState().loadPurchaseToCart(withRef);
    expect(useStore.getState().cart[0].store).toEqual({ name: 'Coto', sepaId: '10-1-123' });
  });

  it('al combinar, un ítem que ya estaba conserva su comercio', () => {
    const s = useStore.getState();
    s.addToCart(item('1', 185, 1, { name: 'Día' }));
    s.loadPurchaseToCart({ ...purchase, store: 'Coto' }, true);
    const cart = useStore.getState().cart;
    expect(cart[0]).toMatchObject({ productId: '1', quantity: 3, store: { name: 'Día' } });
    expect(cart[1]).toMatchObject({ productId: '2', store: { name: 'Coto' } });
  });

  // ── Productos que ya no existen (spec 33) ──────────────────

  it.each([false, true])('vuelve a crear los productos que faltan, con su id y su nombre (combinar: %s)', merge => {
    useStore.setState({ products: [{ id: '2', name: 'Pan propio', category: 'Panadería' }] });
    useStore.getState().loadPurchaseToCart(purchase, merge);
    expect(useStore.getState().products).toEqual([
      { id: '2', name: 'Pan propio', category: 'Panadería' },
      { id: '1', name: 'Producto 1', origin: 'manual' },
    ]);
    expect(saved<Product[]>(PRODUCTS_KEY)).toHaveLength(2);
    expect(useStore.getState().cart.map(i => i.productId)).toEqual(['1', '2']);
  });

  it('al combinar, también si el ítem ya estaba en el carrito', () => {
    useStore.setState({ products: [{ id: '2', name: 'Pan' }], cart: [item('1', 185)] });
    useStore.getState().loadPurchaseToCart(purchase, true);
    expect(useStore.getState().products.map(p => p.id)).toEqual(['2', '1']);
  });

  it('el mismo producto dos veces en la compra se crea una sola vez', () => {
    useStore.getState().loadPurchaseToCart({ ...purchase, items: [item('1', 10), { ...item('1', 10), id: 'otro' }] });
    expect(useStore.getState().products.map(p => p.id)).toEqual(['1']);
  });

  it('crea los productos y el carrito en un solo cambio', () => {
    const listener = vi.fn();
    const stop = useStore.subscribe(listener);
    useStore.getState().loadPurchaseToCart(purchase);
    stop();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('sin productos que falten, la colección conserva su referencia', () => {
    const products = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }];
    useStore.setState({ products });
    useStore.getState().loadPurchaseToCart(purchase);
    expect(useStore.getState().products).toBe(products);
  });
});

describe('compras y precios', () => {
  beforeEach(() => useStore.getState().hydrate());

  it('guarda la compra más reciente primero y la usa como último precio pagado', () => {
    const s = useStore.getState();
    s.savePurchase({ id: 'old', date: '2026-01-01', total: 100, items: [item('1', 100)] });
    s.savePurchase({ id: 'new', date: '2026-02-01', total: 120, items: [item('1', 120)] });
    const purchases = useStore.getState().purchases;
    expect(purchases.map(p => p.id)).toEqual(['new', 'old']);
    expect(getLastPurchasedPrice(purchases, '1')).toBe(120);
    expect(getLastPurchasedPrice(purchases, '2')).toBeNull();
    expect(saved<Purchase[]>(PURCHASES_KEY)).toHaveLength(2);
  });

  it('edita el monto de un precio sin mutar el original', () => {
    useStore.setState({ prices: [
      { id: '1', productId: '1', amount: 185, date: new Date('2026-11-10T10:00:00.000Z'), barrio: 'Almagro' },
    ] });
    const before = useStore.getState().prices.find(p => p.id === '1')!;
    useStore.getState().updatePrice('1', 999);
    expect(useStore.getState().prices.find(p => p.id === '1')!.amount).toBe(999);
    expect(before.amount).toBe(185);
  });
});

describe('storeKey', () => {
  it('sin comercio o sin nombre devuelve vacío', () => {
    expect(storeKey()).toBe('');
    expect(storeKey({ name: '   ' })).toBe('');
  });

  it('ignora mayúsculas y espacios de más en nombre y barrio', () => {
    expect(storeKey({ name: ' coto' })).toBe(storeKey({ name: 'Coto' }));
    expect(storeKey({ name: 'Carrefour  Market', barrio: 'caballito ' }))
      .toBe(storeKey({ name: 'carrefour market', barrio: 'Caballito' }));
  });

  it('el barrio distingue comercios del mismo nombre', () => {
    expect(storeKey({ name: 'Coto', barrio: 'Caballito' })).not.toBe(storeKey({ name: 'Coto' }));
  });

  it('con sepaId usa solo el id de la sucursal', () => {
    expect(storeKey({ name: 'Coto', sepaId: '10-1-123' })).toBe(storeKey({ name: 'COTO 123', sepaId: '10-1-123' }));
    expect(storeKey({ name: 'Coto', sepaId: '10-1-123' })).not.toBe(storeKey({ name: 'Coto' }));
  });
});

describe('groupCartByStore', () => {
  const coto: StoreRef = { name: 'Coto' };
  const dia: StoreRef = { name: 'Día', barrio: 'Almagro' };

  it('un carrito sin comercios es un solo grupo "Sin comercio"', () => {
    const groups = groupCartByStore([item('1', 100), item('2', 50, 2)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: '', store: undefined, total: 200 });
    expect(groups[0].items.map(i => i.productId)).toEqual(['1', '2']);
  });

  it('agrupa en el orden del primer ítem de cada comercio, con "Sin comercio" al final', () => {
    const groups = groupCartByStore([
      item('1', 100),
      item('2', 50, 1, dia),
      item('3', 10, 3, coto),
      item('4', 20, 1, dia),
    ]);
    expect(groups.map(g => g.store?.name)).toEqual(['Día', 'Coto', undefined]);
    expect(groups.map(g => g.total)).toEqual([70, 30, 100]);
    expect(groups[0].items.map(i => i.productId)).toEqual(['2', '4']);
  });

  it('"Coto" y " coto" quedan en el mismo grupo con el nombre del primer ítem', () => {
    const groups = groupCartByStore([item('1', 100, 1, { name: 'Coto' }), item('2', 50, 1, { name: ' coto' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].store?.name).toBe('Coto');
    expect(groups[0].total).toBe(150);
  });

  it('la suma de los grupos coincide con el total del carrito', () => {
    const cart = [item('1', 100, 2, coto), item('2', 50, 1, dia), item('3', 33.5, 3)];
    expect(groupCartByStore(cart).reduce((sum, g) => sum + g.total, 0)).toBe(getCartTotal(cart));
  });

  it('no muta los ítems', () => {
    const cart = [item('1', 100, 1, coto), item('2', 50, 1, coto)];
    const copy = structuredClone(cart);
    groupCartByStore(cart);
    expect(cart).toEqual(copy);
  });
});

describe('getCartStores', () => {
  it('devuelve los comercios distintos sin "Sin comercio"', () => {
    const stores = getCartStores([
      item('1', 100, 1, { name: 'Coto' }),
      item('2', 50),
      item('3', 10, 1, { name: 'COTO ' }),
      item('4', 20, 1, { name: 'Día' }),
    ]);
    expect(stores.map(s => s.name)).toEqual(['Coto', 'Día']);
  });

  it('carrito vacío o sin comercios: lista vacía', () => {
    expect(getCartStores([])).toEqual([]);
    expect(getCartStores([item('1', 100)])).toEqual([]);
  });
});

describe('filterProducts', () => {
  const products: Product[] = [
    { id: '1', name: 'Yerba Playadito', category: 'Almacen', ean: '7793704000508' },
    { id: '2', name: 'Galletitas', category: 'Almacen', ean: '0000096385074' },
    { id: '3', name: 'Leche 1L', category: 'Lacteos' },
    { id: '4', name: 'Agua 7793', category: 'Bebidas' },
    { id: '5', name: 'Yerba Mate Rosamonte', ean: '7790411000013' },
    { id: '6', name: 'Yerba', brand: 'PLAYADITO' },
    { id: '7', name: 'Mate Cocido 25 Saquitos', brand: 'PLAYADITO' },
    { id: '8', name: 'Té en hebras', brand: 'Taragüí', category: 'Infusiones' },
  ];
  const ids = (query: string) => filterProducts(products, query).map(p => p.id);

  it('sin texto devuelve todos', () => {
    expect(ids('')).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(ids('   ')).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  });

  it('filtra por nombre o categoría sin distinguir mayúsculas', () => {
    expect(ids('YERBA')).toEqual(['1', '5', '6']);
    expect(ids('lacteos')).toEqual(['3']);
  });

  it('busca también por marca', () => {
    expect(ids('playadito')).toEqual(['1', '6', '7']);
  });

  it('cada palabra puede estar en el nombre, la marca o la categoría', () => {
    expect(ids('yerba playadito')).toEqual(['1', '6']);
    expect(ids('mate playadito')).toEqual(['7']);
    expect(ids('playadito cocido')).toEqual(['7']);
    expect(ids('hebras infusiones')).toEqual(['8']);
    expect(ids('yerba taragui')).toEqual([]);
  });

  it('no distingue acentos ni diéresis', () => {
    expect(ids('taragui')).toEqual(['8']);
    expect(ids('TÉ EN HEBRAS')).toEqual(['8']);
    expect(ids('te taragüi')).toEqual(['8']);
  });

  it('ignora los espacios de más entre palabras', () => {
    expect(ids('  yerba   playadito ')).toEqual(['1', '6']);
  });

  it('un producto sin categoría no falla y se encuentra por nombre', () => {
    expect(ids('rosamonte')).toEqual(['5']);
    expect(ids('almacen')).toEqual(['1', '2']);
  });

  it('con solo dígitos encuentra los EAN que los contienen', () => {
    expect(ids('7793704')).toEqual(['1']);
    expect(ids('7793704000508')).toEqual(['1']);
    expect(ids('000508')).toEqual(['1']);
  });

  it('ignora los espacios al buscar por EAN', () => {
    expect(ids('7793704 000508')).toEqual(['1']);
  });

  it('suma los EAN al filtro de nombre de siempre', () => {
    expect(ids('7793')).toEqual(['1', '4']);
  });

  it('un GTIN válido en otro formato encuentra el GTIN-13 guardado', () => {
    expect(ids('96385074')).toEqual(['2']);
    expect(ids('07793704000508')).toEqual(['1']);
  });

  it('un texto con letras no busca por EAN', () => {
    expect(ids('7793704a')).toEqual([]);
  });
});

describe('initialCartPrice', () => {
  const prices = [
    { id: 'a', productId: 'p1', amount: 100, date: new Date('2026-01-01T10:00:00Z'), barrio: 'Almagro' },
    { id: 'b', productId: 'p1', amount: 120, date: new Date('2026-03-01T10:00:00Z'), barrio: 'Almagro' },
  ];

  it('usa el último precio propio aunque haya referencia', () => {
    expect(initialCartPrice(prices, 'p1', 90)).toBe(120);
    expect(initialCartPrice(prices, 'p1')).toBe(120);
  });

  it('sin precio propio usa la referencia, redondeada a centavos', () => {
    expect(initialCartPrice(prices, 'p2', 1500)).toBe(1500);
    expect(initialCartPrice(prices, 'p2', 1234.5678)).toBe(1234.57);
  });

  it('sin precio propio ni referencia es 0 (nunca el 100 de antes)', () => {
    expect(initialCartPrice(prices, 'p2')).toBe(0);
    expect(initialCartPrice([], 'p2', 0)).toBe(0);
  });
});

describe('addSepaToCart', () => {
  const sepa: SepaProduct = {
    ean: '7793704000911', description: 'YERBA MATE PLAYADITO', brand: 'PLAYADITO', size: 500, sizeUnit: 'g', banderas: 16,
  };

  beforeEach(() => {
    storage.setItem(PRODUCTS_KEY, JSON.stringify([{ id: 'p1', name: 'Arroz', category: 'Almacen' }]));
    storage.setItem(PRICES_KEY, JSON.stringify([]));
    useStore.getState().hydrate();
  });

  it('crea el producto vinculado sin categoría y lo agrega sin comercio con la referencia', () => {
    const product = useStore.getState().addSepaToCart(sepa, 1500);
    const s = useStore.getState();
    expect(product).toMatchObject({
      name: 'Yerba Mate', ean: '7793704000911', brand: 'PLAYADITO', size: 500, sizeUnit: 'g', origin: 'sepa',
    });
    expect(product.category).toBeUndefined();
    expect(s.products).toHaveLength(2);
    expect(s.cart).toHaveLength(1);
    expect(s.cart[0]).toMatchObject({ productId: product.id, productName: 'Yerba Mate', price: 1500, quantity: 1, subtotal: 1500 });
    expect(s.cart[0].store).toBeUndefined();
    expect(saved<Product[]>(PRODUCTS_KEY)).toHaveLength(2);
  });

  it('no registra ningún precio', () => {
    useStore.getState().addSepaToCart(sepa, 1500);
    expect(useStore.getState().prices).toEqual([]);
  });

  it('sin precio conocido entra con 0', () => {
    useStore.getState().addSepaToCart(sepa);
    expect(useStore.getState().cart[0]).toMatchObject({ price: 0, subtotal: 0 });
  });

  it('agregarlo dos veces deja un solo producto y una sola línea con cantidad 2', () => {
    const { addSepaToCart } = useStore.getState();
    const first = addSepaToCart(sepa, 1500);
    const second = useStore.getState().addSepaToCart(sepa, 1500);
    const s = useStore.getState();
    expect(second.id).toBe(first.id);
    expect(s.products.filter(p => p.ean === sepa.ean)).toHaveLength(1);
    expect(s.cart).toHaveLength(1);
    expect(s.cart[0]).toMatchObject({ quantity: 2, subtotal: 3000 });
  });

  it('usa el producto propio con ese EAN y su último precio', () => {
    useStore.setState({
      products: [{ id: 'own', name: 'Yerba de casa', category: 'Almacen', ean: '7793704000911' }],
      prices: [{ id: 'a', productId: 'own', amount: 2000, date: new Date('2026-03-01'), barrio: 'Almagro' }],
    });
    const product = useStore.getState().addSepaToCart(sepa, 1500);
    const s = useStore.getState();
    expect(product.id).toBe('own');
    expect(s.products).toHaveLength(1);
    expect(s.cart[0]).toMatchObject({ productId: 'own', productName: 'Yerba de casa', price: 2000 });
  });

  it('si ya estaba en el carrito con comercio, suma 1 y conserva el comercio', () => {
    const product = useStore.getState().addSepaToCart(sepa, 1500);
    const itemId = useStore.getState().cart[0].id;
    useStore.getState().setCartItemStore(itemId, { name: 'Coto' }, 1400);
    useStore.getState().addSepaToCart(sepa, 1500);
    const cart = useStore.getState().cart;
    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({ productId: product.id, quantity: 2, price: 1400, store: { name: 'Coto' } });
  });

  it('desde una fila de comercio entra con ese comercio y ese precio, aunque tenga precio propio', () => {
    const store: StoreRef = { name: 'Coto — Caballito', sepaId: '12-1-45', barrio: 'Caballito' };
    useStore.setState({
      products: [{ id: 'own', name: 'Yerba de casa', ean: '7793704000911' }],
      prices: [{ id: 'a', productId: 'own', amount: 2000, date: new Date('2026-03-01'), barrio: 'Almagro' }],
    });
    useStore.getState().addSepaToCart(sepa, 1500, { store, price: 1320.5 });
    const s = useStore.getState();
    expect(s.cart[0]).toMatchObject({ productId: 'own', price: 1320.5, quantity: 1, subtotal: 1320.5, store });
    expect(s.prices).toHaveLength(1);
  });

  it('agregado después desde otro comercio queda en una sola línea, con el comercio y el precio nuevos', () => {
    const coto: StoreRef = { name: 'Coto — Caballito', sepaId: '12-1-45' };
    const dia: StoreRef = { name: 'Supermercados DIA — 82 - Lanus', sepaId: '15-1-82' };
    useStore.getState().addSepaToCart(sepa, undefined, { store: coto, price: 1400 });
    useStore.getState().addSepaToCart(sepa, undefined, { store: dia, price: 1250 });
    const s = useStore.getState();
    expect(s.products.filter(p => p.ean === sepa.ean)).toHaveLength(1);
    expect(s.cart).toHaveLength(1);
    expect(s.cart[0]).toMatchObject({ price: 1250, quantity: 2, subtotal: 2500, store: dia });
  });

  it('con un precio sin comercio entra en "Sin comercio" a ese precio, aunque tenga precio propio (spec 24)', () => {
    useStore.setState({
      products: [{ id: 'own', name: 'Yerba de casa', ean: '7793704000911' }],
      prices: [{ id: 'a', productId: 'own', amount: 2000, date: new Date('2026-03-01'), barrio: 'Almagro' }],
    });
    useStore.getState().addSepaToCart(sepa, 1500, { price: 2350 });
    const s = useStore.getState();
    expect(s.cart).toHaveLength(1);
    expect(s.cart[0]).toMatchObject({ productId: 'own', price: 2350, quantity: 1, subtotal: 2350 });
    expect(s.cart[0]).not.toHaveProperty('store');
    expect(s.prices).toHaveLength(1);
  });

  it('con un precio sin comercio, si ya estaba en el carrito suma 1 y conserva comercio y precio', () => {
    const coto: StoreRef = { name: 'Coto — Caballito', sepaId: '12-1-45' };
    useStore.getState().addSepaToCart(sepa, undefined, { store: coto, price: 1400 });
    useStore.getState().addSepaToCart(sepa, undefined, { price: 2350 });
    const cart = useStore.getState().cart;
    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({ price: 1400, quantity: 2, subtotal: 2800, store: coto });
  });
});

describe('ubicación', () => {
  const location = { lat: -34.6037, lng: -58.3816, source: 'gps' as const, label: 'Mi ubicación' };

  it('sin nada guardado arranca sin ubicación y con 3 km', () => {
    useStore.getState().hydrate();
    expect(useStore.getState()).toMatchObject({ location: null, radiusKm: 3 });
  });

  it('guarda la ubicación y el radio, y los recupera al hidratar', () => {
    useStore.getState().hydrate();
    useStore.getState().setLocation(location);
    useStore.getState().setRadius(10);
    expect(saved(LOCATION_KEY)).toEqual({ location, radiusKm: 10 });

    useStore.setState(initialState, true);
    useStore.getState().hydrate();
    expect(useStore.getState()).toMatchObject({ location, radiusKm: 10 });
  });

  it('quitar la ubicación borra también el radio', () => {
    useStore.getState().hydrate();
    useStore.getState().setLocation(location);
    useStore.getState().setRadius(5);
    useStore.getState().setLocation(null);
    expect(useStore.getState()).toMatchObject({ location: null, radiusKm: 3 });
    expect(saved(LOCATION_KEY)).toEqual({ location: null, radiusKm: 3 });
  });

  it('con datos guardados que no son válidos arranca sin ubicación', () => {
    storage.setItem(LOCATION_KEY, JSON.stringify({ location: { lat: 'x', lng: 1 }, radiusKm: 7 }));
    useStore.getState().hydrate();
    expect(useStore.getState()).toMatchObject({ location: null, radiusKm: 3 });
  });
});

describe('getRecentStorePrices', () => {
  const now = new Date('2026-11-16T12:00:00');

  function price(id: string, daysAgo: number, patch: Partial<Price> = {}): Price {
    return {
      id, productId: 'p1', amount: 100, date: new Date(now.getTime() - daysAgo * 86_400_000), barrio: 'Almagro',
      store: 'Almacen', ...patch,
    };
  }

  it('devuelve el último de cada par barrio + comercio, del más reciente al más viejo', () => {
    const prices = [
      price('a', 10, { amount: 90 }),
      price('b', 2, { amount: 110 }),
      price('c', 5, { store: 'Coto', barrio: 'Caballito' }),
      price('d', 1, { store: ' almacen ', barrio: 'ALMAGRO', amount: 120 }),
    ];
    expect(getRecentStorePrices(prices, 'p1', now).map(p => p.id)).toEqual(['d', 'c']);
  });

  it('deja afuera los de más de 60 días, los que no tienen comercio y los de otros productos', () => {
    const prices = [
      price('a', 61),
      price('b', 59, { store: 'Coto' }),
      price('c', 1, { store: undefined }),
      price('d', 1, { store: ' ' }),
      price('e', 1, { productId: 'p2', store: 'Dia' }),
    ];
    expect(getRecentStorePrices(prices, 'p1', now).map(p => p.id)).toEqual(['b']);
  });

  it('acepta fechas como texto, como vienen de localStorage', () => {
    const stored = JSON.parse(JSON.stringify([price('a', 3)])) as Price[];
    expect(getRecentStorePrices(stored, 'p1', now)).toHaveLength(1);
  });
});

describe('priceStoreRef', () => {
  it('arma el comercio con nombre y barrio', () => {
    expect(priceStoreRef({ store: ' Coto ', barrio: 'Caballito' })).toEqual({ name: 'Coto', barrio: 'Caballito' });
  });

  it('el barrio "Sin especificar" no se guarda', () => {
    expect(priceStoreRef({ store: 'Coto', barrio: 'Sin especificar' })).toEqual({ name: 'Coto' });
  });

  it('con storeRef (spec 26) devuelve ese comercio completo', () => {
    const storeRef: StoreRef = {
      name: 'Coto — Cabildo', sepaId: '10-1-123', chain: 'Coto', address: 'Av. Cabildo 2280', barrio: 'Belgrano',
      lat: -34.56, lng: -58.45,
    };
    expect(priceStoreRef({ store: 'Coto — Cabildo', barrio: 'Belgrano', storeRef })).toBe(storeRef);
  });

  it('un precio con storeRef de una sucursal tiene el storeKey de su sepaId', () => {
    const ref = priceStoreRef({ store: 'Coto', barrio: NO_BARRIO, storeRef: { name: 'Coto', sepaId: '10-1-123' } });
    expect(storeKey(ref)).toBe('sepa:10-1-123');
  });
});

describe('loadSharedCart', () => {
  const load = (items: CartItem[], products: Product[] = []): SharedLoad => ({ products, items });
  const coto: StoreRef = { name: 'Coto' };
  const dia: StoreRef = { name: 'Día' };

  it('combinar suma la cantidad y conserva el comercio y el precio que ya tenía', () => {
    useStore.setState({ cart: [item('1', 100, 2, coto)] });
    useStore.getState().loadSharedCart(load([item('1', 50, 3, dia), item('2', 10, 1, dia)]), true);
    const { cart } = useStore.getState();
    expect(cart).toHaveLength(2);
    expect(cart[0]).toMatchObject({ productId: '1', price: 100, quantity: 5, subtotal: 500, store: coto });
    expect(cart[1]).toMatchObject({ productId: '2', price: 10, store: dia });
  });

  it('reemplazar deja solo lo compartido', () => {
    useStore.setState({ cart: [item('1', 100), item('3', 1)] });
    useStore.getState().loadSharedCart(load([item('1', 50, 3, dia)]), false);
    expect(useStore.getState().cart).toEqual([item('1', 50, 3, dia)]);
  });

  it('agrega los productos nuevos y no registra precios', () => {
    const own: Product = { id: '1', name: 'Pan' };
    useStore.setState({ products: [own], prices: [], cart: [] });
    useStore.getState().loadSharedCart(load([item('2', 50)], [{ id: '2', name: 'Leche' }]), false);
    expect(useStore.getState().products).toEqual([own, { id: '2', name: 'Leche' }]);
    expect(useStore.getState().prices).toEqual([]);
  });

  it('es un solo cambio del store', () => {
    let changes = 0;
    const stop = useStore.subscribe(() => { changes++; });
    useStore.getState().loadSharedCart(load([item('2', 50), item('4', 5)], [{ id: '2', name: 'Leche' }]), true);
    stop();
    expect(changes).toBe(1);
  });

  it('sin productos nuevos no toca la colección de productos', () => {
    const { products } = useStore.getState();
    useStore.getState().loadSharedCart(load([item('2', 50)]), true);
    expect(useStore.getState().products).toBe(products);
  });
});

describe('purchaseStoreRef', () => {
  const purchase = { id: 'c', date: '2026-11-12T12:00:00Z', items: [], total: 0 };

  it('arma el comercio de una compra; "Sin especificar" no es un barrio', () => {
    expect(purchaseStoreRef({ ...purchase, store: 'Coto', barrio: 'Once' })).toEqual({ name: 'Coto', barrio: 'Once' });
    expect(purchaseStoreRef({ ...purchase, store: 'Coto', barrio: NO_BARRIO })).toEqual({ name: 'Coto' });
    expect(purchaseStoreRef(purchase)).toBeUndefined();
  });
});

// ── Eliminar producto (spec 33) ──────────────────────────────

describe('purchasesWithProduct', () => {
  it('cuenta compras, no ítems', () => {
    const purchases: Purchase[] = [
      { id: 'c1', date: '2026-01-01', total: 30, items: [item('a', 10), { ...item('a', 10), id: 'otro' }, item('b', 10)] },
      { id: 'c2', date: '2026-01-02', total: 10, items: [item('a', 10)] },
      { id: 'c3', date: '2026-01-03', total: 10, items: [item('b', 10)] },
    ];
    expect(purchasesWithProduct(purchases, 'a')).toBe(2);
    expect(purchasesWithProduct(purchases, 'z')).toBe(0);
  });
});

describe('deleteProduct', () => {
  const EAN = '7793704000911';
  const price = (id: string, productId: string): Price =>
    ({ id, productId, amount: 100, date: new Date('2026-11-10T10:00:00.000Z'), barrio: 'Almagro' });

  beforeEach(() => {
    useStore.getState().hydrate();
    useStore.setState({
      products: [{ id: 'a', name: 'Leche 1L' }, { id: 'b', name: 'Pan' }, { id: 'c', name: 'Yerba', ean: EAN }],
      prices: [price('p1', 'a'), price('p2', 'b'), price('p3', 'a')],
      cart: [item('b', 10), item('a', 20)],
    });
  });

  it('saca el producto, sus precios y su ítem; lo demás queda igual', () => {
    const before = useStore.getState();
    expect(before.deleteProduct('a')).toBe(true);
    const s = useStore.getState();
    expect(s.products).toEqual([before.products[1], before.products[2]]);
    expect(s.prices).toEqual([before.prices[1]]);
    expect(s.cart).toEqual([before.cart[0]]);
    expect(s.purchases).toBe(before.purchases);
    expect(s.calculator).toBe(before.calculator);
  });

  it('en un solo cambio del store', () => {
    const listener = vi.fn();
    const stop = useStore.subscribe(listener);
    useStore.getState().deleteProduct('a');
    stop();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('queda guardado: no vuelve al recargar', () => {
    useStore.getState().deleteProduct('a');
    expect(saved<Product[]>(PRODUCTS_KEY).map(p => p.id)).toEqual(['b', 'c']);
    expect(saved<Price[]>(PRICES_KEY).map(p => p.id)).toEqual(['p2']);
    expect(saved<CartItem[]>(CART_KEY).map(i => i.productId)).toEqual(['b']);
  });

  it('sin precios ni lugar en el carrito, esas colecciones conservan su referencia', () => {
    useStore.setState({ prices: [price('p2', 'b')], cart: [] });
    const before = useStore.getState();
    before.deleteProduct('a');
    expect(useStore.getState().prices).toBe(before.prices);
    expect(useStore.getState().cart).toBe(before.cart);
  });

  it.each([
    ['con código', 'c', []],
    ['en una compra', 'a', [{ id: 'c1', date: '2026-01-01', total: 10, items: [item('a', 10)] }]],
    ['inexistente', 'z', []],
  ])('%s no cambia nada y devuelve false', (_name, id, purchases) => {
    useStore.setState({ purchases });
    const before = useStore.getState();
    expect(before.deleteProduct(id)).toBe(false);
    expect(useStore.getState()).toBe(before);
  });
});

describe('flash', () => {
  it('se deja y se borra, sin guardarse', () => {
    useStore.getState().hydrate();
    expect(useStore.getState().flash).toBeNull();
    useStore.getState().setFlash('Leche 1L eliminado');
    expect(useStore.getState().flash).toBe('Leche 1L eliminado');
    expect(storage.getItem(PRODUCTS_KEY)).toBeNull();
    useStore.getState().setFlash(null);
    expect(useStore.getState().flash).toBeNull();
  });
});
