export interface Product {
  id: string;
  name: string;
  category: string;
  image?: string;
}

export interface CartItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  subtotal: number;
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
