import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/search/search.component').then(m => m.SearchComponent)
  },
  {
    path: 'cart',
    loadComponent: () => import('./pages/cart/cart.component').then(m => m.CartComponent)
  },
  {
    path: 'upload',
    loadComponent: () => import('./pages/upload/upload.component').then(m => m.UploadComponent)
  },
  {
    path: 'product/:id',
    loadComponent: () => import('./pages/product/product.component').then(m => m.ProductComponent)
  },
  {
    path: 'purchases',
    loadComponent: () => import('./pages/purchases/purchases.component').then(m => m.PurchasesComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
