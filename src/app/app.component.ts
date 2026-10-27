import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DataService } from './services/data.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  cartCount = 0;
  cartTotal = 0;

  constructor(private data: DataService) {}

  ngOnInit() {
    this.data.cart$.subscribe(cart => {
      this.cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
      this.cartTotal = this.data.getCartTotal();
    });
  }
}
