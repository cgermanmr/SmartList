import { create } from 'zustand';
import { toGtin13 } from './gtin';
import { uniqueId } from './ids';
import { DEFAULT_RADIUS, RadiusKm, UserLocation } from './location';
import { Product, Price, CartItem, Purchase, CalculatorState, StoreRef } from './models';
import { productFromSepa, withOrigins } from './product-form';
import type { SepaProduct } from './sepa';
import type { SharedLoad } from './shared-cart';
import type { SyncData } from './sync';
import {
  PRODUCTS_KEY, PRICES_KEY, CART_KEY, PURCHASES_KEY, CALCULATOR_KEY, LOCATION_KEY,
  defaultCalculator,
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
  /** Aviso para mostrar en la próxima página (spec 33); no se guarda */
  flash: string | null;

  hydrate: () => void;
  addProduct: (product: Product) => void;
  /** Copia el producto con los cambios; `ean: undefined` quita el vínculo (JSON.stringify omite la clave) */
  updateProduct: (id: string, changes: Partial<Omit<Product, 'id'>>) => void;
  /**
   * Saca el producto, sus precios y su ítem del carrito en un solo cambio (spec 33). Con código de barras o con compras
   * no hace nada y devuelve false. La foto la borra quien lo llama
   */
  deleteProduct: (id: string) => boolean;
  addPrice: (price: Price) => void;
  updatePrice: (priceId: string, newAmount: number) => void;
  /** Un producto, un comercio: si ya está suma 1; si el ítem nuevo trae comercio, pasa a ese comercio y precio */
  addToCart: (item: CartItem) => void;
  /**
   * Agrega al carrito un producto del catálogo SEPA: usa el propio con ese EAN o lo crea con productFromSepa (sin
   * categoría). Entra sin comercio con initialCartPrice; si ya estaba, suma 1 y conserva su comercio. Con `at` (una
   * fila de comercio) entra en ese comercio y a ese precio y, si ya estaba, pasa a ellos; con `at` sin comercio (el
   * precio de la góndola, spec 24) entra en "Sin comercio" a ese precio y, si ya estaba, conserva comercio y precio.
   * Devuelve el producto propio
   */
  addSepaToCart: (sepa: SepaProduct, reference?: number, at?: { store?: StoreRef; price: number }) => Product;
  removeFromCart: (itemId: string) => void;
  /** El checkout de un grupo saca solo sus ítems */
  removeCartItems: (itemIds: string[]) => void;
  /**
   * Cambia el comercio (undefined → "Sin comercio"); el precio solo cambia si se pasa `price`. Los demás ítems del mismo
   * comercio (storeKey) toman su dirección y su punto (spec 35); si no trae ninguno de los dos, quedan los que había
   */
  setCartItemStore: (itemId: string, store?: StoreRef, price?: number) => void;
  /**
   * Pasa esos ítems a ese comercio con su precio (cantidad igual, subtotal recalculado), en un solo cambio (spec 25).
   * Un movimiento con precio ≤ 0 se ignora: ese ítem no cambia
   */
  moveCartItems: (store: StoreRef, moves: { itemId: string; price: number }[]) => void;
  updateQuantity: (itemId: string, qty: number) => void;
  updateCartItemPrice: (itemId: string, price: number) => void;
  clearCart: () => void;
  /** Repetir compra: carga sus ítems y vuelve a crear los productos que ya no existen (spec 33), en un solo cambio */
  loadPurchaseToCart: (purchase: Purchase, merge?: boolean) => void;
  /**
   * Carga un carrito compartido (spec 31) en un solo cambio: suma los productos nuevos y, con `merge`, los ítems al
   * carrito (un producto que ya estaba suma la cantidad y conserva comercio y precio); sin `merge` lo reemplaza
   */
  loadSharedCart: (load: SharedLoad, merge: boolean) => void;
  savePurchase: (purchase: Purchase) => void;
  saveCalculator: (state: CalculatorState) => void;
  resetCalculator: () => void;
  /** null quita la ubicación y vuelve el radio a 3 km */
  setLocation: (location: UserLocation | null) => void;
  setRadius: (radiusKm: RadiusKm) => void;
  setFlash: (text: string | null) => void;
  /** Vacía los datos del usuario (cerrar sesión, spec 21): productos, precios, carrito, compras y calculadora; la ubicación queda */
  resetUserData: () => void;
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
  flash: null,

  hydrate: () => {
    if (get().hydrated) return;
    set({
      hydrated: true,
      // Sin datos de ejemplo (spec 21): una instalación nueva arranca vacía
      products:   loadFromStorage<Product[]>(PRODUCTS_KEY, []),
      prices:     loadFromStorage<Price[]>(PRICES_KEY,     []),
      cart:       loadFromStorage(CART_KEY,      []),
      purchases:  loadFromStorage(PURCHASES_KEY, []),
      calculator: loadCalculator(),
      ...loadLocation(),
    });
    // Spec 36: los productos guardados sin origen lo reciben en un cambio aparte, que se guarda y, con cuenta, sube
    const products = get().products;
    const migrated = withOrigins(products);
    if (migrated !== products) set({ products: migrated });
  },

  // ── Productos ─────────────────────────────────────────────
  addProduct: product => set(s => ({ products: [...s.products, product] })),

  updateProduct: (id, changes) => set(s => ({
    products: s.products.map(p => p.id === id ? { ...p, ...changes } : p),
  })),

  deleteProduct: id => {
    const s = get();
    const product = s.products.find(p => p.id === id);
    if (!product || product.ean || purchasesWithProduct(s.purchases, id) > 0) return false;
    // Una colección sin nada que sacar conserva su referencia: no se guarda de nuevo
    const without = <T extends { productId: string }>(list: T[]): T[] =>
      list.some(i => i.productId === id) ? list.filter(i => i.productId !== id) : list;
    set({ products: s.products.filter(p => p.id !== id), prices: without(s.prices), cart: without(s.cart) });
    return true;
  },

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
      ...(at?.store && { store: at.store }),
    });
    return product;
  },

  removeFromCart: itemId => set(s => ({ cart: s.cart.filter(i => i.id !== itemId) })),

  removeCartItems: itemIds => set(s => ({ cart: s.cart.filter(i => !itemIds.includes(i.id)) })),

  setCartItemStore: (itemId, store, price) => set(s => {
    const key = storeKey(store);
    const group = key === '' ? [] : s.cart.filter(i => storeKey(i.store) === key);
    // Un comercio escrito sin dirección ni punto no borra los que ya había
    const known = hasPlace(store) ? undefined : group.find(i => hasPlace(i.store))?.store;
    const target = known ?? store;
    return {
      cart: s.cart.map(i => {
        if (i.id !== itemId) return group.includes(i) && !sameStore(i.store, target) ? { ...i, store: target } : i;
        // store: undefined lo saca del JSON guardado (JSON.stringify omite la clave)
        const moved: CartItem = { ...i, store: target };
        return price !== undefined && price > 0 ? { ...moved, price, subtotal: price * i.quantity } : moved;
      }),
    };
  }),

  moveCartItems: (store, moves) => {
    const prices = new Map(moves.filter(m => m.price > 0).map(m => [m.itemId, m.price]));
    if (prices.size === 0) return;
    set(s => ({
      cart: s.cart.map(i => {
        const price = prices.get(i.id);
        return price === undefined ? i : { ...i, store, price, subtotal: price * i.quantity };
      }),
    }));
  },

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
    // Un producto que ya no existe se vuelve a crear con el mismo id, para que la compra lo siga encontrando (spec 33)
    const known = new Set(s.products.map(p => p.id));
    const missing: Product[] = [];
    for (const { productId, productName } of purchase.items) {
      if (known.has(productId)) continue;
      known.add(productId);
      missing.push({ id: productId, name: productName, origin: 'manual' });
    }
    return missing.length > 0 ? { products: [...s.products, ...missing], cart: base } : { cart: base };
  }),

  loadSharedCart: (load, merge) => set(s => {
    const cart: CartItem[] = merge ? [...s.cart] : [];
    for (const item of load.items) {
      const index = cart.findIndex(i => i.productId === item.productId);
      if (index >= 0) cart[index] = withQuantity(cart[index], cart[index].quantity + item.quantity);
      else cart.push(item);
    }
    return load.products.length > 0 ? { products: [...s.products, ...load.products], cart } : { cart };
  }),

  // ── Compras ───────────────────────────────────────────────
  savePurchase: purchase => set(s => ({ purchases: [purchase, ...s.purchases] })), // más reciente primero

  // ── Calculadora ───────────────────────────────────────────
  saveCalculator: state => set({ calculator: state }),

  resetCalculator: () => set({ calculator: defaultCalculator() }),

  // ── Ubicación ─────────────────────────────────────────────
  setLocation: location => set(location ? { location } : { location: null, radiusKm: DEFAULT_RADIUS }),

  setRadius: radiusKm => set({ radiusKm }),

  setFlash: text => set({ flash: text }),

  resetUserData: () => set({ products: [], prices: [], cart: [], purchases: [], calculator: defaultCalculator() }),
}));

function withQuantity(item: CartItem, quantity: number): CartItem {
  return { ...item, quantity, subtotal: item.price * quantity };
}

/** Comercio de una compra guardada como texto; el barrio "Sin especificar" no es un barrio */
export function purchaseStoreRef(purchase: Purchase): StoreRef | undefined {
  const name = purchase.store?.trim();
  if (!name) return undefined;
  const barrio = purchase.barrio?.trim();
  return barrio && barrio !== NO_BARRIO ? { name, barrio } : { name };
}

// ── Persistencia ──────────────────────────────────────────

/** Lo que se sincroniza con la cuenta (spec 21); la ubicación no */
export function syncDataOf(state: AppState): SyncData {
  const { products, prices, cart, purchases, calculator } = state;
  return { products, prices, cart, purchases, calculator };
}

type UserDataListener = (prev: SyncData, next: SyncData) => void;
let userDataListener: UserDataListener | null = null;

/** El motor de sincronización se anota acá para enterarse de cada cambio de los datos del usuario */
export function onUserDataChange(listener: UserDataListener | null): void {
  userDataListener = listener;
}

// Cada colección se guarda en su clave cuando cambia, con el mismo formato JSON de siempre
useStore.subscribe((state, prev) => {
  if (!state.hydrated || !prev.hydrated) return;
  if (userDataListener && (state.products !== prev.products || state.prices !== prev.prices || state.cart !== prev.cart
    || state.purchases !== prev.purchases || state.calculator !== prev.calculator)) {
    userDataListener(syncDataOf(prev), syncDataOf(state));
  }
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

/**
 * Comercio de un precio: su storeRef si lo tiene (spec 26); si no, { name: store, barrio }, como se guardaban antes.
 * El barrio "Sin especificar" no es un barrio
 */
export function priceStoreRef(price: Pick<Price, 'store' | 'barrio' | 'storeRef'>): StoreRef {
  if (price.storeRef) return price.storeRef;
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

/** Tiene dirección o punto */
function hasPlace(store: StoreRef | undefined): boolean {
  return !!store && (!!store.address || (store.lat !== undefined && store.lng !== undefined));
}

function sameStore(a: StoreRef | undefined, b: StoreRef | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys: (keyof StoreRef)[] = ['name', 'barrio', 'address', 'sepaId', 'chain', 'lat', 'lng'];
  return keys.every(key => a[key] === b[key]);
}

export interface CartGroup<T = CartItem> {
  key: string;
  store?: StoreRef;    // el del primer ítem del grupo; undefined en "Sin comercio"
  items: T[];
  total: number;
}

/** Grupos en el orden en que se agregó el primer ítem de cada comercio; "Sin comercio" al final */
export function groupCartByStore<T extends Pick<CartItem, 'store' | 'subtotal'>>(cart: T[]): CartGroup<T>[] {
  const groups = new Map<string, CartGroup<T>>();
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

/** Cantidad de compras (no de ítems) que tienen el producto */
export function purchasesWithProduct(purchases: Purchase[], productId: string): number {
  return purchases.filter(purchase => purchase.items.some(i => i.productId === productId)).length;
}

/** Devuelve el precio de la última compra completada para un producto */
export function getLastPurchasedPrice(purchases: Purchase[], productId: string): number | null {
  for (const purchase of purchases) {
    const item = purchase.items.find(i => i.productId === productId);
    if (item) return item.price;
  }
  return null;
}
