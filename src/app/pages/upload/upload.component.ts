import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { Product, Price } from '../../models/product';

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './upload.component.html'
})
export class UploadComponent implements OnInit {
  activeTab: 'price' | 'product' = 'price';
  products: Product[] = [];
  message = '';
  messageClass = '';

  priceForm = {
    productId: '',
    amount: 0,
    barrio: '',
    store: ''
  };

  productForm = {
    name: '',
    category: ''
  };

  constructor(private data: DataService) {}

  ngOnInit() {
    this.data.products$.subscribe(products => this.products = products);
  }

  submitPrice() {
    if (!this.priceForm.productId || !this.priceForm.amount || !this.priceForm.barrio) {
      this.showMessage('Por favor completa todos los campos requeridos', 'error');
      return;
    }

    const price: Price = {
      id: Date.now().toString(),
      productId: this.priceForm.productId,
      amount: this.priceForm.amount,
      date: new Date(),
      barrio: this.priceForm.barrio,
      store: this.priceForm.store
    };

    this.data.addPrice(price);
    this.showMessage('✓ Precio compartido exitosamente!', 'ok');
    this.priceForm = { productId: '', amount: 0, barrio: '', store: '' };
  }

  submitProduct() {
    if (!this.productForm.name.trim() || !this.productForm.category.trim()) {
      this.showMessage('Por favor completa nombre y categoría', 'error');
      return;
    }

    const product: Product = {
      id: Date.now().toString(),
      name: this.productForm.name.trim(),
      category: this.productForm.category.trim()
    };

    this.data.addProduct(product);
    this.showMessage('✓ Producto agregado exitosamente!', 'ok');
    this.productForm = { name: '', category: '' };
  }

  private showMessage(text: string, type: 'ok' | 'error') {
    this.message = text;
    this.messageClass = type === 'ok'
      ? 'bg-green-100 text-green-700'
      : 'bg-red-100 text-red-700';
    setTimeout(() => this.message = '', 3000);
  }
}
