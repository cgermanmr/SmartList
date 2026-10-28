import { create } from 'zustand';
import { uniqueId } from './ids';
import { Product, Price, CartItem, Purchase, CalculatorState } from './models';
import {
  PRODUCTS_KEY, PRICES_KEY, CART_KEY, PURCHASES_KEY, CALCULATOR_KEY,
  DEFAULT_PRODUCTS, defaultPrices, defaultCalculator,
  loadFromStorage, saveToStorage, loadCalculator,
} from './storage';

// Estado único de la app. Las acciones son el punto donde se van a enchufar las llamadas al backend.
export interface AppState {
  /** false hasta leer localStorage en el cliente; mientras tanto no se guarda nada */
  hydrated: boolean;
  products: Product[];
  prices: Price[];
  cart: CartItem[];
  purchases: Purchase[];
  calculator: CalculatorState;

  hydrate: () => void;
  addProduct: (product: Product) => void;
  addPrice: (price: Price) => void;
  updatePrice: (priceId: string, newAmount: number) => void;
  addToCart: (item: CartItem) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, qty: number) => void;
  updateCartItemPrice: (itemId: string, price: number) => void;
  clearCart: () => void;
  loadPurchaseToCart: (purchase: Purchase, merge?: boolean) => void;
  savePurchase: (purchase: Purchase) => void;
  saveCalculator: (state: CalculatorState) => void;
  resetCalculator: () => void;
}

export const useStore = create<AppState>()((set, get) => ({
  hydrated: false,
  products: [],
  prices: [],
  cart: [],
  purchases: [],
  calculator: defaultCalculator(),

  hydrate: () => {
    if (get().hydrated) return;
    set({
      hydrated: true,
      products:   loadFromStorage(PRODUCTS_KEY,  DEFAULT_PRODUCTS),
      prices:     loadFromStorage(PRICES_KEY,    defaultPrices()),
      cart:       loadFromStorage(CART_KEY,      []),
      purchases:  loadFromStorage(PURCHASES_KEY, []),
      calculator: loadCalculator(),
    });
  },

  // ── Productos ─────────────────────────────────────────────
  addProduct: product => set(s => ({ products: [...s.products, product] })),

  // ── Precios ───────────────────────────────────────────────
  addPrice: price => set(s => ({ prices: [...s.prices, price] })),

  updatePrice: (priceId, newAmount) => set(s => ({
    prices: s.prices.map(p => p.id === priceId ? { ...p, amount: newAmount } : p),
  })),

  // ── Carrito ───────────────────────────────────────────────
  addToCart: item => set(s => {
    const exists = s.cart.some(i => i.productId === item.productId);
    return {
      cart: exists
        ? s.cart.map(i => i.productId === item.productId ? withQuantity(i, i.quantity + 1) : i)
        : [...s.cart, item],
    };
  }),

  removeFromCart: itemId => set(s => ({ cart: s.cart.filter(i => i.id !== itemId) })),

  updateQuantity: (itemId, qty) => set(s => ({
    cart: s.cart.map(i => i.id === itemId ? withQuantity(i, qty) : i),
  })),

  updateCartItemPrice: (itemId, price) => {
    if (!(price > 0)) return;
    set(s => ({
      cart: s.cart.map(i => i.id === itemId ? { ...i, price, subtotal: price * i.quantity } : i),
    }));
  },

  clearCart: () => set({ cart: [] }),

  loadPurchaseToCart: (purchase, merge = false) => set(s => {
    const base: CartItem[] = merge ? [...s.cart] : [];
    for (const item of purchase.items) {
      const currentPrice = getPriceStats(s.prices, item.productId)?.current ?? item.price;
      const index = base.findIndex(i => i.productId === item.productId);
      if (index >= 0) {
        base[index] = withQuantity(base[index], base[index].quantity + item.quantity);
      } else {
        base.push({
          ...item,
          id: uniqueId(),
          price: currentPrice,
          subtotal: currentPrice * item.quantity,
        });
      }
    }
    return { cart: base };
  }),

  // ── Compras ───────────────────────────────────────────────
  savePurchase: purchase => set(s => ({ purchases: [purchase, ...s.purchases] })), // más reciente primero

  // ── Calculadora ───────────────────────────────────────────
  saveCalculator: state => set({ calculator: state }),

  resetCalculator: () => set({ calculator: defaultCalculator() }),
}));

function withQuantity(item: CartItem, quantity: number): CartItem {
  return { ...item, quantity, subtotal: item.price * quantity };
}

// ── Persistencia ──────────────────────────────────────────
// Cada colección se guarda en su clave cuando cambia, con el mismo formato JSON de siempre
useStore.subscribe((state, prev) => {
  if (!state.hydrated || !prev.hydrated) return;
  if (state.products   !== prev.products)   saveToStorage(PRODUCTS_KEY,   state.products);
  if (state.prices     !== prev.prices)     saveToStorage(PRICES_KEY,     state.prices);
  if (state.cart       !== prev.cart)       saveToStorage(CART_KEY,       state.cart);
  if (state.purchases  !== prev.purchases)  saveToStorage(PURCHASES_KEY,  state.purchases);
  if (state.calculator !== prev.calculator) saveToStorage(CALCULATOR_KEY, state.calculator);
});

// ── Consultas ─────────────────────────────────────────────
export function getPricesForProduct(prices: Price[], productId: string): Price[] {
  return prices
    .filter(p => p.productId === productId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export interface PriceStats {
  current: number;
  previous: number | null;
  min: number;
  max: number;
  avg: number;
}

export function getPriceStats(prices: Price[], productId: string): PriceStats | null {
  const amounts = getPricesForProduct(prices, productId).map(p => p.amount);
  if (amounts.length === 0) return null;
  return {
    current: amounts[0],
    previous: amounts[1] ?? null,
    min: Math.min(...amounts),
    max: Math.max(...amounts),
    avg: Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length),
  };
}

export function getCartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.subtotal, 0);
}

/** Devuelve el precio de la última compra completada para un producto */
export function getLastPurchasedPrice(purchases: Purchase[], productId: string): number | null {
  for (const purchase of purchases) {
    const item = purchase.items.find(i => i.productId === productId);
    if (item) return item.price;
  }
  return null;
}
