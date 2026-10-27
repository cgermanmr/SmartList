import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { CartItem, Price, Purchase } from '../../models/product';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cart.component.html'
})
export class CartComponent implements OnInit {
  cart: CartItem[] = [];

  // ── Comercio único ─────────────────────────────────────────
  isSingleStore = false;
  storeBarrio   = '';
  storeName     = '';

  // ── Medios de pago ─────────────────────────────────────────
  showPaymentStep = false;
  selectedPayment = '';
  paymentMethods = [
    { id: 'efectivo',    label: 'Efectivo',            icon: '💵' },
    { id: 'debito',      label: 'Débito',               icon: '💳' },
    { id: 'credito1',    label: 'Crédito (1 cuota)',    icon: '💳' },
    { id: 'creditoN',    label: 'Crédito en cuotas',    icon: '📆' },
    { id: 'transferencia', label: 'Transferencia / QR', icon: '📲' },
    { id: 'cheque',      label: 'Cheque',               icon: '📝' },
  ];

  constructor(private data: DataService) {}

  ngOnInit() {
    this.data.cart$.subscribe(cart => this.cart = cart);
  }

  removeItem(itemId: string) {
    this.data.removeFromCart(itemId);
  }

  updateQuantity(itemId: string, qty: number) {
    if (qty > 0) this.data.updateQuantity(itemId, qty);
  }

  updateItemPrice(itemId: string, price: number) {
    this.data.updateCartItemPrice(itemId, price);
  }

  getTotal() {
    return this.data.getCartTotal();
  }

  clearCart() {
    if (confirm('¿Estás seguro de que quieres vaciar el carrito?')) {
      this.showPaymentStep = false;
      this.data.clearCart();
    }
  }

  checkout() {
    this.showPaymentStep = true;
    this.selectedPayment = '';
  }

  cancelPayment() {
    this.showPaymentStep = false;
    this.selectedPayment = '';
  }

  confirmCheckout() {
    const purchase: Purchase = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      items: this.cart.map(i => ({ ...i })),
      total: this.getTotal(),
      ...(this.isSingleStore && this.storeBarrio && { barrio: this.storeBarrio }),
      ...(this.isSingleStore && this.storeName    && { store: this.storeName }),
      paymentMethod: this.selectedPayment
    };
    // Registrar precios pagados en el historial de precios
    const now = new Date();
    const barrio = this.isSingleStore && this.storeBarrio ? this.storeBarrio : 'Sin especificar';
    const store  = this.isSingleStore && this.storeName  ? this.storeName   : undefined;
    this.cart.forEach((item, idx) => {
      const price: Price = {
        id: `${Date.now()}-${idx}`,
        productId: item.productId,
        amount: item.price,
        date: now,
        barrio,
        store
      };
      this.data.addPrice(price);
    });

    this.data.savePurchase(purchase);
    const total = this.getTotal().toFixed(2);
    alert(`Compra finalizada!\nTotal: $${total}\nPago: ${this.selectedPayment}`);
    this.showPaymentStep = false;
    this.isSingleStore   = false;
    this.storeBarrio     = '';
    this.storeName       = '';
    this.data.clearCart();
  }

  // ── Comparación de precios ─────────────────────────────────
  getPriceStatus(item: CartItem): 'cheaper' | 'expensive' | 'same' | 'new' {
    const last = this.data.getLastPurchasedPrice(item.productId);
    if (last === null) return 'new';
    if (item.price < last) return 'cheaper';
    if (item.price > last) return 'expensive';
    return 'same';
  }

  getPriceBadge(item: CartItem): string {
    const last = this.data.getLastPurchasedPrice(item.productId);
    if (last === null) return '';
    const diff = item.price - last;
    if (diff === 0) return '= igual';
    return `${diff > 0 ? '▲' : '▼'} ${diff > 0 ? '+' : ''}$${Math.abs(diff).toFixed(2)}`;
  }

  getPriceClass(item: CartItem): object {
    const s = this.getPriceStatus(item);
    return {
      'text-green-600': s === 'cheaper',
      'text-red-600':   s === 'expensive',
      'text-blue-600':  s === 'same'
    };
  }
}
