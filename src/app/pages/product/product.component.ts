import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { DataService } from '../../services/data.service';
import { Product, Price, CartItem } from '../../models/product';

@Component({
  selector: 'app-product',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './product.component.html'
})
export class ProductComponent implements OnInit {
  product: Product | null = null;
  prices: Price[] = [];
  stats: any = null;
  productId = '';

  editingPriceId: string | null = null;
  editingAmount = 0;

  constructor(
    private data: DataService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.productId = params['id'];
      const products = this.data.getProducts();
      this.product = products.find(p => p.id === this.productId) || null;

      if (this.product) {
        this.data.prices$.subscribe(() => {
          this.prices = this.data.getPricesForProduct(this.productId);
          this.stats  = this.data.getPriceStats(this.productId);
        });
      }
    });
  }

  goBack() {
    this.router.navigate(['/']);
  }

  // ── Gráfico SVG ───────────────────────────────────────────
  getChartData() {
    if (this.prices.length <= 3) return null;

    const sorted = [...this.prices].reverse(); // cronológico
    const amounts = sorted.map(p => p.amount);
    const minVal  = Math.min(...amounts);
    const maxVal  = Math.max(...amounts);
    const range   = maxVal - minVal || 1;

    const W = 480, H = 180;
    const padL = 52, padR = 16, padT = 16, padB = 32;
    const cW = W - padL - padR;
    const cH = H - padT - padB;

    const points = sorted.map((p, i) => ({
      x: padL + (sorted.length === 1 ? cW / 2 : (i / (sorted.length - 1)) * cW),
      y: padT + cH - ((p.amount - minVal) / range) * cH,
      price: p.amount,
      label: new Date(p.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    }));

    const polyline = points.map(p => `${p.x},${p.y}`).join(' ');
    const areaPath = [
      `M${points[0].x},${points[0].y}`,
      ...points.slice(1).map(p => `L${p.x},${p.y}`),
      `L${points[points.length - 1].x},${padT + cH}`,
      `L${points[0].x},${padT + cH}`,
      'Z'
    ].join(' ');

    // etiquetas eje X: primera, media, última
    const xLabels = [
      points[0],
      points[Math.floor((points.length - 1) / 2)],
      points[points.length - 1]
    ].filter((v, i, a) => a.indexOf(v) === i);

    // líneas guía horizontales (3 niveles)
    const gridY = [0, 0.5, 1].map(f => padT + cH - f * cH);
    const gridLabels = [minVal, Math.round((minVal + maxVal) / 2), maxVal];

    return { W, H, padL, padT, padB, cH, points, polyline, areaPath, xLabels, gridY, gridLabels };
  }

  addToCart() {
    if (this.product && this.stats) {
      const item: CartItem = {
        id: Date.now().toString(),
        productId: this.product.id,
        productName: this.product.name,
        price: this.stats.current,
        quantity: 1,
        subtotal: this.stats.current
      };
      this.data.addToCart(item);
      alert('Producto añadido al carrito!');
    }
  }

  startEdit(price: Price) {
    this.editingPriceId = price.id;
    this.editingAmount  = price.amount;
  }

  cancelEdit() {
    this.editingPriceId = null;
  }

  saveEdit(price: Price) {
    if (this.editingAmount > 0) {
      this.data.updatePrice(price.id, this.editingAmount);
    }
    this.editingPriceId = null;
  }
}
