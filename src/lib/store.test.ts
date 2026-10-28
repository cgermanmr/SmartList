import { beforeEach, describe, expect, it } from 'vitest';
import { CartItem, Purchase } from './models';
import { CALCULATOR_KEY, CART_KEY, PRICES_KEY, PRODUCTS_KEY, PURCHASES_KEY, defaultCalculator } from './storage';
import { getCartTotal, getLastPurchasedPrice, getPriceStats, useStore } from './store';

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

function item(productId: string, price: number, quantity = 1): CartItem {
  return { id: `item-${productId}`, productId, productName: `Producto ${productId}`, price, quantity, subtotal: price * quantity };
}

function saved<T>(key: string): T {
  return JSON.parse(storage.getItem(key)!);
}

beforeEach(() => {
  storage.clear();
  useStore.setState(initialState, true);
});

describe('hydrate', () => {
  it('sin datos guardados usa los productos y precios de ejemplo', () => {
    useStore.getState().hydrate();
    const s = useStore.getState();
    expect(s.hydrated).toBe(true);
    expect(s.products).toHaveLength(8);
    expect(s.prices).toHaveLength(3);
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

  it('descarta una calculadora guardada inválida', () => {
    storage.setItem(CALCULATOR_KEY, JSON.stringify({ magnitude: 'peso', presentations: [] }));
    useStore.getState().hydrate();
    expect(useStore.getState().calculator).toEqual(defaultCalculator());
  });

  it('no guarda nada antes de hidratar', () => {
    useStore.getState().addProduct({ id: 'x', name: 'X', category: 'Y' });
    expect(storage.getItem(PRODUCTS_KEY)).toBeNull();
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
});

describe('loadPurchaseToCart', () => {
  const purchase: Purchase = {
    id: 'c1', date: '2026-01-01T10:00:00.000Z', total: 330,
    items: [item('1', 150, 2), item('2', 30)],
  };

  beforeEach(() => useStore.getState().hydrate());

  it('reemplaza el carrito usando el precio actual registrado', () => {
    const s = useStore.getState();
    s.addToCart(item('9', 10));
    s.loadPurchaseToCart(purchase);
    const cart = useStore.getState().cart;
    expect(cart.map(i => i.productId)).toEqual(['1', '2']);
    // Producto 1 tiene precio registrado de ejemplo (185); el 2 también (45)
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
    const before = useStore.getState().prices.find(p => p.id === '1')!;
    useStore.getState().updatePrice('1', 999);
    expect(useStore.getState().prices.find(p => p.id === '1')!.amount).toBe(999);
    expect(before.amount).toBe(185);
  });
});
