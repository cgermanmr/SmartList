import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { DataService } from '../../services/data.service';
import { Purchase, CartItem } from '../../models/product';

@Component({
  selector: 'app-purchases',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './purchases.component.html'
})
export class PurchasesComponent implements OnInit {
  purchases: Purchase[] = [];
  expandedId: string | null = null;
  pendingPurchase: Purchase | null = null;

  constructor(private data: DataService, private router: Router) {}

  ngOnInit() {
    this.data.purchases$.subscribe(p => this.purchases = p);
  }

  toggle(id: string) {
    this.expandedId = this.expandedId === id ? null : id;
  }

  loadToCart(purchase: Purchase, event: Event) {
    event.stopPropagation();
    if (this.data.getCart().length > 0) {
      this.pendingPurchase = purchase;
    } else {
      this.doLoadToCart(purchase);
    }
  }

  cancelLoad() {
    this.pendingPurchase = null;
  }

  confirmLoad(merge: boolean) {
    if (this.pendingPurchase) {
      this.data.loadPurchaseToCart(this.pendingPurchase, merge);
      this.pendingPurchase = null;
      this.router.navigate(['/cart']);
    }
  }

  private doLoadToCart(purchase: Purchase) {
    this.data.loadPurchaseToCart(purchase);
    this.router.navigate(['/cart']);
  }

  /** Último precio registrado en el historial de precios para el producto */
  getLastRegisteredPrice(productId: string): number | null {
    return this.data.getPriceStats(productId)?.current ?? null;
  }

  /** Verde si pagó <= último precio registrado, rojo si pagó más */
  isCheaperOrEqual(item: CartItem): boolean {
    const last = this.getLastRegisteredPrice(item.productId);
    return last !== null && item.price <= last;
  }

  isExpensive(item: CartItem): boolean {
    const last = this.getLastRegisteredPrice(item.productId);
    return last !== null && item.price > last;
  }

  /** Porcentaje de variación del precio pagado respecto al último registrado */
  getPctVariation(item: CartItem): string {
    const last = this.getLastRegisteredPrice(item.productId);
    if (last === null || last === 0) return '';
    const pct = ((item.price - last) / last) * 100;
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
  }
}
