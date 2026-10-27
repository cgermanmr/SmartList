import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { Product, CartItem } from '../../models/product';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './search.component.html'
})
export class SearchComponent implements OnInit {
  searchQuery = '';
  products: Product[] = [];
  filteredProducts: Product[] = [];
  cart: CartItem[] = [];

  constructor(private data: DataService, private router: Router) {}

  ngOnInit() {
    this.data.products$.subscribe(products => {
      this.products = products;
      this.filterProducts();
    });
    this.data.cart$.subscribe(cart => this.cart = cart);
  }

  getCartItem(productId: string): CartItem | undefined {
    return this.cart.find(i => i.productId === productId);
  }

  updateQuantity(itemId: string, qty: number) {
    if (qty > 0) this.data.updateQuantity(itemId, qty);
  }

  removeFromCart(itemId: string) {
    this.data.removeFromCart(itemId);
  }

  filterProducts() {
    if (!this.searchQuery.trim()) {
      this.filteredProducts = this.products;
    } else {
      const query = this.searchQuery.toLowerCase();
      this.filteredProducts = this.products.filter(p =>
        p.name.toLowerCase().includes(query) || p.category.toLowerCase().includes(query)
      );
    }
  }

  getPriceForProduct(productId: string) {
    const prices = this.data.getPricesForProduct(productId);
    return prices[0] || null;
  }

  getProductStats(productId: string) {
    return this.data.getPriceStats(productId);
  }

  getPctChange(current: number, previous: number): string {
    const pct = ((current - previous) / previous) * 100;
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
  }

  viewDetails(productId: string) {
    this.router.navigate(['/product', productId]);
  }

  addToCart(product: Product) {
    const price = this.getPriceForProduct(product.id)?.amount || 100;
    const item: CartItem = {
      id: Date.now().toString(),
      productId: product.id,
      productName: product.name,
      price,
      quantity: 1,
      subtotal: price
    };
    this.data.addToCart(item);
  }
}
