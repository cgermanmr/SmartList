import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Product, Price, CartItem, Purchase, CalculatorState, Magnitude, PromoType } from '../models/product';
import { UNITS_BY_MAGNITUDE } from '../utils/unit-price';

const PRODUCTS_KEY   = 'preciolocal_products';
const PRICES_KEY     = 'preciolocal_prices';
const CART_KEY       = 'preciolocal_cart';
const PURCHASES_KEY  = 'preciolocal_purchases';
const CALCULATOR_KEY = 'preciolocal_calculator';

const DEFAULT_PRODUCTS: Product[] = [
  { id: '1', name: 'Leche 1L',          category: 'Lacteos'   },
  { id: '2', name: 'Pan Frances',        category: 'Almacen'   },
  { id: '3', name: 'Aceite Oliva 500ml', category: 'Aceites'   },
  { id: '4', name: 'Queso 500g',         category: 'Lacteos'   },
  { id: '5', name: 'Huevos Docena',      category: 'Proteina'  },
  { id: '6', name: 'Fideos 500g',        category: 'Almacen'   },
  { id: '7', name: 'Cafe 500g',          category: 'Bebidas'   },
  { id: '8', name: 'Yogur 500ml',        category: 'Lacteos'   },
];

const DEFAULT_PRICES: Price[] = [
  { id: '1', productId: '1', amount: 185, date: new Date(), barrio: 'Almagro',   store: 'Almacen'   },
  { id: '2', productId: '1', amount: 178, date: new Date(Date.now() - 86400000), barrio: 'Caballito', store: 'Coto' },
  { id: '3', productId: '2', amount: 45,  date: new Date(), barrio: 'Almagro',   store: 'Panaderia' },
];

const DEFAULT_CALCULATOR: CalculatorState = {
  magnitude: 'peso',
  presentations: [
    { id: '1', label: '', price: null, quantity: null, unit: 'g', promo: { type: 'ninguna', take: null, pay: null, nth: null, percent: null } },
    { id: '2', label: '', price: null, quantity: null, unit: 'g', promo: { type: 'ninguna', take: null, pay: null, nth: null, percent: null } },
  ],
};

const MAGNITUDES: Magnitude[] = ['peso', 'volumen', 'unidades'];
const PROMO_TYPES: PromoType[] = ['ninguna', 'nxm', 'enesima', 'descuento'];

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* cuota excedida u otros errores */ }
}

function isNumberOrNull(value: unknown): boolean {
  return value === null || typeof value === 'number';
}

function isValidPresentation(p: any, magnitude: Magnitude): boolean {
  return !!p && typeof p === 'object'
    && typeof p.id === 'string'
    && typeof p.label === 'string'
    && isNumberOrNull(p.price)
    && isNumberOrNull(p.quantity)
    && UNITS_BY_MAGNITUDE[magnitude].includes(p.unit)
    && !!p.promo && typeof p.promo === 'object'
    && PROMO_TYPES.includes(p.promo.type)
    && isNumberOrNull(p.promo.take)
    && isNumberOrNull(p.promo.pay)
    && isNumberOrNull(p.promo.nth)
    && isNumberOrNull(p.promo.percent);
}

/** Valida la forma del estado guardado; si no es válida devuelve el estado inicial */
function loadCalculator(): CalculatorState {
  const state = loadFromStorage<Partial<CalculatorState> | null>(CALCULATOR_KEY, null);
  const valid = !!state
    && MAGNITUDES.includes(state.magnitude as Magnitude)
    && Array.isArray(state.presentations)
    && state.presentations.length >= 2
    && state.presentations.length <= 6
    && state.presentations.every(p => isValidPresentation(p, state.magnitude as Magnitude));
  return valid ? state as CalculatorState : structuredClone(DEFAULT_CALCULATOR);
}

@Injectable({ providedIn: 'root' })
export class DataService {

  private products  = new BehaviorSubject<Product[]> (loadFromStorage(PRODUCTS_KEY,  DEFAULT_PRODUCTS));
  private prices    = new BehaviorSubject<Price[]>   (loadFromStorage(PRICES_KEY,    DEFAULT_PRICES));
  private cart      = new BehaviorSubject<CartItem[]>(loadFromStorage(CART_KEY,      []));
  private purchases = new BehaviorSubject<Purchase[]>(loadFromStorage(PURCHASES_KEY, []));
  private calculator = new BehaviorSubject<CalculatorState>(loadCalculator());

  products$   = this.products.asObservable();
  prices$     = this.prices.asObservable();
  cart$       = this.cart.asObservable();
  purchases$  = this.purchases.asObservable();
  calculator$ = this.calculator.asObservable();

  getProducts()   { return this.products.value;   }
  getPrices()     { return this.prices.value;     }
  getCart()       { return this.cart.value;       }
  getPurchases()  { return this.purchases.value;  }
  getCalculator() { return this.calculator.value; }

  // ── Productos ─────────────────────────────────────────────
  addProduct(product: Product) {
    const next = [...this.products.value, product];
    this.products.next(next);
    saveToStorage(PRODUCTS_KEY, next);
  }

  // ── Precios ───────────────────────────────────────────────
  addPrice(price: Price) {
    const next = [...this.prices.value, price];
    this.prices.next(next);
    saveToStorage(PRICES_KEY, next);
  }

  updatePrice(priceId: string, newAmount: number) {
    const current = this.prices.value;
    const price = current.find(p => p.id === priceId);
    if (price) {
      price.amount = newAmount;
      const next = [...current];
      this.prices.next(next);
      saveToStorage(PRICES_KEY, next);
    }
  }

  getPricesForProduct(productId: string) {
    return this.prices.value
      .filter(p => p.productId === productId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  getPriceStats(productId: string) {
    const amounts = this.getPricesForProduct(productId).map(p => p.amount);
    if (amounts.length === 0) return null;
    return {
      current: amounts[0],
      previous: amounts[1] ?? null,
      min: Math.min(...amounts),
      max: Math.max(...amounts),
      avg: Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length)
    };
  }

  // ── Carrito ───────────────────────────────────────────────
  addToCart(item: CartItem) {
    const current = this.cart.value;
    const exists = current.find(i => i.productId === item.productId);
    if (exists) {
      exists.quantity++;
      exists.subtotal = exists.price * exists.quantity;
    } else {
      current.push(item);
    }
    const next = [...current];
    this.cart.next(next);
    saveToStorage(CART_KEY, next);
  }

  removeFromCart(itemId: string) {
    const next = this.cart.value.filter(i => i.id !== itemId);
    this.cart.next(next);
    saveToStorage(CART_KEY, next);
  }

  updateQuantity(itemId: string, qty: number) {
    const current = this.cart.value;
    const item = current.find(i => i.id === itemId);
    if (item) {
      item.quantity = qty;
      item.subtotal = item.price * qty;
      const next = [...current];
      this.cart.next(next);
      saveToStorage(CART_KEY, next);
    }
  }

  updateCartItemPrice(itemId: string, price: number) {
    const current = this.cart.value;
    const item = current.find(i => i.id === itemId);
    if (item && price > 0) {
      item.price = price;
      item.subtotal = price * item.quantity;
      const next = [...current];
      this.cart.next(next);
      saveToStorage(CART_KEY, next);
    }
  }

  clearCart() {
    this.cart.next([]);
    saveToStorage(CART_KEY, []);
  }

  loadPurchaseToCart(purchase: Purchase, merge = false) {
    const base: CartItem[] = merge ? [...this.cart.value] : [];
    for (const item of purchase.items) {
      const currentPrice = this.getPriceStats(item.productId)?.current ?? item.price;
      const existing = base.find(i => i.productId === item.productId);
      if (existing) {
        existing.quantity += item.quantity;
        existing.subtotal = existing.price * existing.quantity;
      } else {
        base.push({
          ...item,
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          price: currentPrice,
          subtotal: currentPrice * item.quantity
        });
      }
    }
    this.cart.next(base);
    saveToStorage(CART_KEY, base);
  }

  getCartTotal() {
    return this.cart.value.reduce((sum, item) => sum + item.subtotal, 0);
  }

  // ── Compras ───────────────────────────────────────────────
  savePurchase(purchase: Purchase) {
    const next = [purchase, ...this.purchases.value]; // más reciente primero
    this.purchases.next(next);
    saveToStorage(PURCHASES_KEY, next);
  }

  /** Devuelve el precio de la última compra completada para un producto */
  getLastPurchasedPrice(productId: string): number | null {
    for (const purchase of this.purchases.value) {
      const item = purchase.items.find(i => i.productId === productId);
      if (item) return item.price;
    }
    return null;
  }

  // ── Calculadora ───────────────────────────────────────────
  saveCalculator(state: CalculatorState) {
    const next: CalculatorState = { ...state, presentations: [...state.presentations] };
    this.calculator.next(next);
    saveToStorage(CALCULATOR_KEY, next);
  }

  resetCalculator() {
    const next = structuredClone(DEFAULT_CALCULATOR);
    this.calculator.next(next);
    saveToStorage(CALCULATOR_KEY, next);
  }
}
