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
  date: Date;
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
