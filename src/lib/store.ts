import { create } from 'zustand';
import { toGtin13 } from './gtin';
import { uniqueId } from './ids';
import { DEFAULT_RADIUS, RadiusKm, UserLocation } from './location';
import { Product, Price, CartItem, Purchase, CalculatorState, StoreRef } from './models';
import { productFromSepa } from './product-form';
import type { SepaProduct } from './sepa';
import {
  PRODUCTS_KEY, PRICES_KEY, CART_KEY, PURCHASES_KEY, CALCULATOR_KEY, LOCATION_KEY,
  DEFAULT_PRODUCTS, defaultPrices, defaultCalculator,
  loadFromStorage, saveToStorage, loadCalculator, loadLocation,
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
  /** Ubicación elegida para ver comercios cercanos; null sin ubicación. No sale del dispositivo */
  location: UserLocation | null;
  /** Radio de búsqueda de comercios, en km */
  radiusKm: RadiusKm;

  hydrate: () => void;
  addProduct: (product: Product) => void;
  /** Copia el producto con los cambios; `ean: undefined` quita el vínculo (JSON.stringify omite la clave) */
  updateProduct: (id: string, changes: Partial<Omit<Product, 'id'>>) => void;
  addPrice: (price: Price) => void;
  updatePrice: (priceId: string, newAmount: number) => void;
  /** Un producto, un comercio: si ya está suma 1; si el ítem nuevo trae comercio, pasa a ese comercio y precio */
  addToCart: (item: CartItem) => void;
  /**
   * Agrega al carrito un producto del catálogo SEPA: usa el propio con ese EAN o lo crea con productFromSepa (sin
   * categoría). Entra sin comercio con initialCartPrice; si ya estaba, suma 1 y conserva su comercio. Con `at` (una
   * fila de comercio) entra en ese comercio y a ese precio y, si ya estaba, pasa a ellos. No registra precios.
   * Devuelve el producto propio
   */
  addSepaToCart: (sepa: SepaProduct, reference?: number, at?: { store: StoreRef; price: number }) => Product;
  removeFromCart: (itemId: string) => void;
  /** El checkout de un grupo saca solo sus ítems */
  removeCartItems: (itemIds: string[]) => void;
  /** Cambia el comercio (undefined → "Sin comercio"); el precio solo cambia si se pasa `price` */
  setCartItemStore: (itemId: string, store?: StoreRef, price?: number) => void;
  updateQuantity: (itemId: string, qty: number) => void;
  updateCartItemPrice: (itemId: string, price: number) => void;
  clearCart: () => void;
  loadPurchaseToCart: (purchase: Purchase, merge?: boolean) => void;
  savePurchase: (purchase: Purchase) => void;
  saveCalculator: (state: CalculatorState) => void;
  resetCalculator: () => void;
  /** null quita la ubicación y vuelve el radio a 3 km */
  setLocation: (location: UserLocation | null) => void;
  setRadius: (radiusKm: RadiusKm) => void;
}

export const useStore = create<AppState>()((set, get) => ({
  hydrated: false,
  products: [],
  prices: [],
  cart: [],
  purchases: [],
  calculator: defaultCalculator(),
  location: null,
  radiusKm: DEFAULT_RADIUS,

  hydrate: () => {
    if (get().hydrated) return;
    set({
      hydrated: true,
      products:   loadFromStorage(PRODUCTS_KEY,  DEFAULT_PRODUCTS),
      prices:     loadFromStorage(PRICES_KEY,    defaultPrices()),
      cart:       loadFromStorage(CART_KEY,      []),
      purchases:  loadFromStorage(PURCHASES_KEY, []),
      calculator: loadCalculator(),
      ...loadLocation(),
    });
  },

  // ── Productos ─────────────────────────────────────────────
  addProduct: product => set(s => ({ products: [...s.products, product] })),

  updateProduct: (id, changes) => set(s => ({
    products: s.products.map(p => p.id === id ? { ...p, ...changes } : p),
  })),

  // ── Precios ───────────────────────────────────────────────
  addPrice: price => set(s => ({ prices: [...s.prices, price] })),

  updatePrice: (priceId, newAmount) => set(s => ({
    prices: s.prices.map(p => p.id === priceId ? { ...p, amount: newAmount } : p),
  })),

  // ── Carrito ───────────────────────────────────────────────
  addToCart: item => set(s => {
    const exists = s.cart.some(i => i.productId === item.productId);
    if (!exists) return { cart: [...s.cart, item] };
    return {
      cart: s.cart.map(i => {
        if (i.productId !== item.productId) return i;
        const moved = item.store ? { ...i, store: item.store, price: item.price } : i;
        return withQuantity(moved, i.quantity + 1);
      }),
    };
  }),

  addSepaToCart: (sepa, reference, at) => {
    const ean = toGtin13(sepa.ean) ?? sepa.ean;
    let product = get().products.find(p => p.ean === ean);
    if (!product) {
      const created = productFromSepa({ ...sepa, ean }, uniqueId());
      set(s => ({ products: [...s.products, created] }));
      product = created;
    }
    const price = at ? at.price : initialCartPrice(get().prices, product.id, reference);
    get().addToCart({
      id: uniqueId(), productId: product.id, productName: product.name, price, quantity: 1, subtotal: price,
      ...(at && { store: at.store }),
    });
    return product;
  },

  removeFromCart: itemId => set(s => ({ cart: s.cart.filter(i => i.id !== itemId) })),

  removeCartItems: itemIds => set(s => ({ cart: s.cart.filter(i => !itemIds.includes(i.id)) })),

  setCartItemStore: (itemId, store, price) => set(s => ({
    cart: s.cart.map(i => {
      if (i.id !== itemId) return i;
      // store: undefined lo saca del JSON guardado (JSON.stringify omite la clave)
      const moved: CartItem = { ...i, store };
      return price !== undefined && price > 0 ? { ...moved, price, subtotal: price * i.quantity } : moved;
    }),
  })),

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
    const purchaseStore = purchaseStoreRef(purchase);
    for (const item of purchase.items) {
      const currentPrice = getPriceStats(s.prices, item.productId)?.current ?? item.price;
      const index = base.findIndex(i => i.productId === item.productId);
      if (index >= 0) {
        // El ítem que ya estaba conserva su comercio
        base[index] = withQuantity(base[index], base[index].quantity + item.quantity);
      } else {
        base.push({
          ...item,
          id: uniqueId(),
          price: currentPrice,
          subtotal: currentPrice * item.quantity,
          store: item.store ?? purchaseStore,
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

  // ── Ubicación ─────────────────────────────────────────────
  setLocation: location => set(location ? { location } : { location: null, radiusKm: DEFAULT_RADIUS }),

  setRadius: radiusKm => set({ radiusKm }),
}));

function withQuantity(item: CartItem, quantity: number): CartItem {
  return { ...item, quantity, subtotal: item.price * quantity };
}

/** Comercio de una compra guardada como texto; el barrio "Sin especificar" no es un barrio */
function purchaseStoreRef(purchase: Purchase): StoreRef | undefined {
  const name = purchase.store?.trim();
  if (!name) return undefined;
  const barrio = purchase.barrio?.trim();
  return barrio && barrio !== NO_BARRIO ? { name, barrio } : { name };
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
  if (state.location !== prev.location || state.radiusKm !== prev.radiusKm) {
    saveToStorage(LOCATION_KEY, { location: state.location, radiusKm: state.radiusKm });
  }
});

// ── Consultas ─────────────────────────────────────────────

/**
 * Búsqueda de productos propios: cada palabra del texto está en el nombre, la marca o la categoría, sin distinguir
 * mayúsculas ni acentos ("playadito" encuentra todo lo de esa marca). Si el texto sin espacios son solo dígitos,
 * también los productos cuyo EAN los contiene o, si es un GTIN válido, coincide con su GTIN-13 (un GTIN-14 que
 * empieza con 0 encuentra el EAN-13 guardado).
 */
export function filterProducts(products: Product[], query: string): Product[] {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return products;
  const digits = words.join('');
  const byEan = /^[0-9]+$/.test(digits);
  const gtin = byEan ? toGtin13(digits) : null;
  return products.filter(p => {
    const haystack = foldText([p.name, p.brand, p.category].filter(Boolean).join(' '));
    return words.every(word => haystack.includes(word)) ||
      (byEan && p.ean !== undefined && (p.ean.includes(digits) || p.ean === gtin));
  });
}

/** Minúsculas y sin acentos ni diéresis (la ñ queda como n), para comparar textos escritos de distintas formas */
function foldText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

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

/**
 * Precio inicial de un ítem del carrito: el último propio; si no hay, la referencia SEPA (spec 12) si se pasa,
 * redondeada a centavos; si no, 0 (el carrito pide completarlo)
 */
export function initialCartPrice(prices: Price[], productId: string, reference?: number): number {
  const own = getPriceStats(prices, productId)?.current;
  if (own !== undefined) return own;
  if (reference !== undefined && reference > 0) return Math.round(reference * 100) / 100;
  return 0;
}

/** Días hacia atrás que se muestran los precios cargados a mano junto a los comercios cercanos */
const OWN_PRICE_DAYS = 60;

/**
 * Precios propios de un producto de los últimos 60 días que tienen comercio: el último de cada par barrio +
 * comercio, del más reciente al más viejo. Van al final de la lista de comercios cercanos
 */
export function getRecentStorePrices(prices: Price[], productId: string, now: Date): Price[] {
  const since = now.getTime() - OWN_PRICE_DAYS * 86_400_000;
  const seen = new Set<string>();
  return getPricesForProduct(prices, productId).filter(price => {
    if (!price.store?.trim() || new Date(price.date).getTime() < since) return false;
    const key = storeKey(priceStoreRef(price));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Comercio de un precio cargado a mano: { name: store, barrio }; el barrio "Sin especificar" no es un barrio */
export function priceStoreRef(price: Pick<Price, 'store' | 'barrio'>): StoreRef {
  const name = (price.store ?? '').trim();
  const barrio = price.barrio?.trim();
  return barrio && barrio !== NO_BARRIO ? { name, barrio } : { name };
}

export function getCartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.subtotal, 0);
}

// ── Carrito por comercio ──────────────────────────────────

/** Barrio que se registra cuando no se conoce */
export const NO_BARRIO = 'Sin especificar';

function normalizeText(text: string | undefined): string {
  return (text ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Clave del comercio: sepaId si existe; si no, nombre + barrio sin mayúsculas ni espacios de más. '' sin comercio */
export function storeKey(store?: StoreRef): string {
  if (!store) return '';
  if (store.sepaId) return `sepa:${store.sepaId}`;
  const name = normalizeText(store.name);
  if (!name) return '';
  return `${name}|${normalizeText(store.barrio)}`;
}

export interface CartGroup {
  key: string;
  store?: StoreRef;    // el del primer ítem del grupo; undefined en "Sin comercio"
  items: CartItem[];
  total: number;
}

/** Grupos en el orden en que se agregó el primer ítem de cada comercio; "Sin comercio" al final */
export function groupCartByStore(cart: CartItem[]): CartGroup[] {
  const groups = new Map<string, CartGroup>();
  for (const item of cart) {
    const key = storeKey(item.store);
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
      group.total += item.subtotal;
    } else {
      groups.set(key, { key, store: key ? item.store : undefined, items: [item], total: item.subtotal });
    }
  }
  const all = [...groups.values()];
  return [...all.filter(g => g.key), ...all.filter(g => !g.key)];
}

/** Comercios distintos ya usados en el carrito (para el selector) */
export function getCartStores(cart: CartItem[]): StoreRef[] {
  return groupCartByStore(cart).flatMap(g => g.store ? [g.store] : []);
}

/** Devuelve el precio de la última compra completada para un producto */
export function getLastPurchasedPrice(purchases: Purchase[], productId: string): number | null {
  for (const purchase of purchases) {
    const item = purchase.items.find(i => i.productId === productId);
    if (item) return item.price;
  }
  return null;
}
