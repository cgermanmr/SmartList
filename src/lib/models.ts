export interface Product {
  id: string;
  name: string;
  category?: string;  // opcional: los productos creados desde el catálogo no tienen
  image?: string;
  ean?: string;       // GTIN-13 (toGtin13); único entre los productos propios
  brand?: string;
  size?: number;      // presentación: 500
  sizeUnit?: Unit;    // va junto con size: los dos o ninguno
}

/** Comercio de un ítem del carrito: viaja dentro del ítem, sin catálogo de comercios */
export interface StoreRef {
  name: string;        // "Coto", "Carrefour Market"
  barrio?: string;     // barrio o localidad
  address?: string;    // "Av Rivadavia 5000"
  sepaId?: string;     // id de sepa_sucursales ('10-1-123') si viene del SEPA (spec 15)
  chain?: string;      // nombre de la cadena (bandera) si viene del SEPA, p. ej. "Coto" (spec 03)
  lat?: number;
  lng?: number;
}

export interface CartItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  subtotal: number;
  store?: StoreRef;    // sin store → grupo "Sin comercio"
}

export interface Price {
  id: string;
  productId: string;
  amount: number;
  date: Date;        // string ISO cuando viene de localStorage
  barrio: string;
  store?: string;
}

export interface Purchase {
  id: string;
  date: string;
  items: CartItem[];
  total: number;
  barrio?: string;
  store?: string;
  paymentMethod?: string;
}

export type Magnitude = 'peso' | 'volumen' | 'unidades';
export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'u';
export type PromoType = 'ninguna' | 'nxm' | 'enesima' | 'descuento';

export interface Promo {
  type: PromoType;
  take: number | null;     // NxM: unidades que se llevan (3 en 3x2)
  pay: number | null;      // NxM: unidades que se pagan (2 en 3x2)
  nth: number | null;      // N-ésima: unidad con descuento (2 en "70% en la 2da")
  percent: number | null;  // N-ésima y descuento directo: % de DESCUENTO
}

export interface Presentation {
  id: string;              // uniqueId(): Date.now().toString() + sufijo aleatorio
  label: string;           // opcional; vacío → "Presentación N"
  price: number | null;
  quantity: number | null;
  unit: Unit;
  promo: Promo;
}

export interface CalculatorState {
  magnitude: Magnitude;
  presentations: Presentation[];  // largo entre 2 y 6
}
