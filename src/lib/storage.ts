import { Product, Price, CalculatorState, Magnitude, PromoType } from './models';
import { UNITS_BY_MAGNITUDE } from './unit-price';

export const PRODUCTS_KEY   = 'preciolocal_products';
export const PRICES_KEY     = 'preciolocal_prices';
export const CART_KEY       = 'preciolocal_cart';
export const PURCHASES_KEY  = 'preciolocal_purchases';
export const CALCULATOR_KEY = 'preciolocal_calculator';

export const DEFAULT_PRODUCTS: Product[] = [
  { id: '1', name: 'Leche 1L',          category: 'Lacteos'   },
  { id: '2', name: 'Pan Frances',        category: 'Almacen'   },
  { id: '3', name: 'Aceite Oliva 500ml', category: 'Aceites'   },
  { id: '4', name: 'Queso 500g',         category: 'Lacteos'   },
  { id: '5', name: 'Huevos Docena',      category: 'Proteina'  },
  { id: '6', name: 'Fideos 500g',        category: 'Almacen'   },
  { id: '7', name: 'Cafe 500g',          category: 'Bebidas'   },
  { id: '8', name: 'Yogur 500ml',        category: 'Lacteos'   },
];

/** Función y no constante: las fechas se calculan al usarlas, nunca durante el prerender */
export function defaultPrices(): Price[] {
  return [
    { id: '1', productId: '1', amount: 185, date: new Date(), barrio: 'Almagro',   store: 'Almacen'   },
    { id: '2', productId: '1', amount: 178, date: new Date(Date.now() - 86400000), barrio: 'Caballito', store: 'Coto' },
    { id: '3', productId: '2', amount: 45,  date: new Date(), barrio: 'Almagro',   store: 'Panaderia' },
  ];
}

const DEFAULT_CALCULATOR: CalculatorState = {
  magnitude: 'peso',
  presentations: [
    { id: '1', label: '', price: null, quantity: null, unit: 'g', promo: { type: 'ninguna', take: null, pay: null, nth: null, percent: null } },
    { id: '2', label: '', price: null, quantity: null, unit: 'g', promo: { type: 'ninguna', take: null, pay: null, nth: null, percent: null } },
  ],
};

export function defaultCalculator(): CalculatorState {
  return structuredClone(DEFAULT_CALCULATOR);
}

const MAGNITUDES: Magnitude[] = ['peso', 'volumen', 'unidades'];
const PROMO_TYPES: PromoType[] = ['ninguna', 'nxm', 'enesima', 'descuento'];

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* cuota excedida u otros errores */ }
}

function isNumberOrNull(value: unknown): boolean {
  return value === null || typeof value === 'number';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- valida datos crudos de localStorage
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
export function loadCalculator(): CalculatorState {
  const state = loadFromStorage<Partial<CalculatorState> | null>(CALCULATOR_KEY, null);
  const valid = !!state
    && MAGNITUDES.includes(state.magnitude as Magnitude)
    && Array.isArray(state.presentations)
    && state.presentations.length >= 2
    && state.presentations.length <= 6
    && state.presentations.every(p => isValidPresentation(p, state.magnitude as Magnitude));
  return valid ? state as CalculatorState : defaultCalculator();
}
