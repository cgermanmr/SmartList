'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { newId } from '@/lib/ids';
import { Price, Product } from '@/lib/models';
import { useStore } from '@/lib/store';

const CATEGORIES = ['Lacteos', 'Almacen', 'Aceites', 'Proteina', 'Bebidas', 'Verduras', 'Frutas', 'Limpieza'];

const EMPTY_PRICE_FORM = { productId: '', amount: '', barrio: '', store: '' };
const EMPTY_PRODUCT_FORM = { name: '', category: '' };

type Message = { text: string; type: 'ok' | 'error' };

function tabClass(active: boolean) {
  return `px-4 py-3 font-semibold text-gray-500 hover:text-primary-700 transition-colors ${active ? 'border-b-2 border-primary-700 text-primary-700' : ''}`;
}

export default function UploadPage() {
  const products = useStore(s => s.products);
  const addPrice = useStore(s => s.addPrice);
  const addProduct = useStore(s => s.addProduct);

  const [activeTab, setActiveTab] = useState<'price' | 'product'>('price');
  const [priceForm, setPriceForm] = useState(EMPTY_PRICE_FORM);
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT_FORM);
  const [message, setMessage] = useState<Message | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function showMessage(text: string, type: Message['type']) {
    setMessage({ text, type });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 3000);
  }

  function submitPrice(e: FormEvent) {
    e.preventDefault();
    const amount = Number(priceForm.amount);
    if (!priceForm.productId || !amount || !priceForm.barrio) {
      showMessage('Por favor completa todos los campos requeridos', 'error');
      return;
    }

    const price: Price = {
      id: newId(),
      productId: priceForm.productId,
      amount,
      date: new Date(),
      barrio: priceForm.barrio,
      store: priceForm.store,
    };

    addPrice(price);
    showMessage('✓ Precio compartido exitosamente!', 'ok');
    setPriceForm(EMPTY_PRICE_FORM);
  }

  function submitProduct(e: FormEvent) {
    e.preventDefault();
    if (!productForm.name.trim() || !productForm.category.trim()) {
      showMessage('Por favor completa nombre y categoría', 'error');
      return;
    }

    const product: Product = {
      id: newId(),
      name: productForm.name.trim(),
      category: productForm.category.trim(),
    };

    addProduct(product);
    showMessage('✓ Producto agregado exitosamente!', 'ok');
    setProductForm(EMPTY_PRODUCT_FORM);
  }

  return (
    <div className="max-w-md mx-auto">

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button onClick={() => setActiveTab('price')} aria-pressed={activeTab === 'price'} className={tabClass(activeTab === 'price')}>
          💲 Cargar Precio
        </button>
        <button onClick={() => setActiveTab('product')} aria-pressed={activeTab === 'product'} className={tabClass(activeTab === 'product')}>
          ➕ Agregar Producto
        </button>
      </div>

      {/* Tab: Cargar Precio */}
      {activeTab === 'price' && (
        <div>
          <h1 className="text-2xl font-bold mb-6">Cargar Precio</h1>

          <form onSubmit={submitPrice} className="space-y-4">
            <div>
              <label htmlFor="price-product" className="block font-semibold mb-2">Producto *</label>
              <select
                id="price-product"
                value={priceForm.productId}
                onChange={e => setPriceForm({ ...priceForm, productId: e.target.value })}
                className="input-field">
                <option value="">Selecciona un producto</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="price-amount" className="block font-semibold mb-2">Precio ($) *</label>
              <input
                id="price-amount"
                value={priceForm.amount}
                onChange={e => setPriceForm({ ...priceForm, amount: e.target.value })}
                type="number"
                step="0.01"
                min="0"
                placeholder="150.50"
                className="input-field"
              />
            </div>

            <div>
              <label htmlFor="price-barrio" className="block font-semibold mb-2">Barrio *</label>
              <input
                id="price-barrio"
                value={priceForm.barrio}
                onChange={e => setPriceForm({ ...priceForm, barrio: e.target.value })}
                type="text"
                placeholder="Ej: Almagro"
                className="input-field"
              />
            </div>

            <div>
              <label htmlFor="price-store" className="block font-semibold mb-2">Tienda (Opcional)</label>
              <input
                id="price-store"
                value={priceForm.store}
                onChange={e => setPriceForm({ ...priceForm, store: e.target.value })}
                type="text"
                placeholder="Ej: Almacen Don Carlos"
                className="input-field"
              />
            </div>

            <button type="submit" className="btn-primary w-full">Compartir Precio</button>
          </form>
        </div>
      )}

      {/* Tab: Agregar Producto */}
      {activeTab === 'product' && (
        <div>
          <h1 className="text-2xl font-bold mb-6">Agregar Producto</h1>

          <form onSubmit={submitProduct} className="space-y-4">
            <div>
              <label htmlFor="product-name" className="block font-semibold mb-2">Nombre del producto *</label>
              <input
                id="product-name"
                value={productForm.name}
                onChange={e => setProductForm({ ...productForm, name: e.target.value })}
                type="text"
                placeholder="Ej: Arroz Largo Fino 1kg"
                className="input-field"
              />
            </div>

            <div>
              <label htmlFor="product-category" className="block font-semibold mb-2">Categoría *</label>
              <input
                id="product-category"
                value={productForm.category}
                onChange={e => setProductForm({ ...productForm, category: e.target.value })}
                type="text"
                placeholder="Ej: Almacen"
                className="input-field"
                list="categories"
              />
              <datalist id="categories">
                {CATEGORIES.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>

            <button type="submit" className="btn-primary w-full">Agregar Producto</button>
          </form>
        </div>
      )}

      {/* Mensaje de feedback */}
      {message && (
        <div role="status" className={`mt-4 p-4 rounded ${message.type === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {message.text}
        </div>
      )}

    </div>
  );
}
