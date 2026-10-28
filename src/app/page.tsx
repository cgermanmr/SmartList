'use client';

import Link from 'next/link';
import { useState } from 'react';
import NumberInput from '@/components/NumberInput';
import { formatMoney, formatPctChange } from '@/lib/format';
import { newId } from '@/lib/ids';
import { CartItem, Product } from '@/lib/models';
import { getPriceStats, getPricesForProduct, useStore } from '@/lib/store';

export default function SearchPage() {
  const products = useStore(s => s.products);
  const prices = useStore(s => s.prices);
  const cart = useStore(s => s.cart);
  const addToCart = useStore(s => s.addToCart);
  const updateQuantity = useStore(s => s.updateQuantity);
  const removeFromCart = useStore(s => s.removeFromCart);
  const [searchQuery, setSearchQuery] = useState('');

  const query = searchQuery.trim().toLowerCase();
  const filteredProducts = query
    ? products.filter(p => p.name.toLowerCase().includes(query) || p.category.toLowerCase().includes(query))
    : products;

  function changeQuantity(itemId: string, qty: number) {
    if (qty > 0) updateQuantity(itemId, qty);
  }

  function add(product: Product) {
    const price = getPricesForProduct(prices, product.id)[0]?.amount || 100;
    const item: CartItem = {
      id: newId(),
      productId: product.id,
      productName: product.name,
      price,
      quantity: 1,
      subtotal: price,
    };
    addToCart(item);
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Buscar Productos</h1>

      <div className="mb-6">
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          type="text"
          placeholder="Busca un producto..."
          aria-label="Buscar producto por nombre o categoría"
          className="input-field w-full"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts.map(product => {
          const stats = getPriceStats(prices, product.id);
          const cartItem = cart.find(i => i.productId === product.id);
          const priceColor = stats && stats.previous !== null && stats.current > stats.previous
            ? 'text-red-600'
            : stats && stats.previous !== null && stats.current < stats.previous
              ? 'text-green-600'
              : 'text-primary-700';

          return (
            <div key={product.id} className="card p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-lg">{product.name}</h3>
                  <p className="text-sm text-gray-600">{product.category}</p>
                </div>
              </div>

              {stats && (
                <div className="mb-4">
                  <div className="flex items-baseline gap-2 mb-1">
                    <p className={`text-2xl font-bold ${priceColor}`}>${formatMoney(stats.current)}</p>
                    {stats.previous !== null && stats.current !== stats.previous && (
                      <span className={`text-sm font-semibold ${stats.current > stats.previous ? 'text-red-500' : 'text-green-500'}`}>
                        ({formatPctChange(stats.current, stats.previous)})
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 text-xs text-gray-500">
                    {stats.previous !== null && <span>Anterior: ${formatMoney(stats.previous)}</span>}
                    <span>Promedio: ${formatMoney(stats.avg)}</span>
                  </div>
                </div>
              )}

              {cartItem ? (
                <>
                  {/* Producto ya en carrito: controles de cantidad y borrado */}
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => removeFromCart(cartItem.id)}
                      className="text-red-400 hover:text-red-600 transition-colors p-1"
                      title="Quitar del carrito"
                      aria-label={`Quitar ${product.name} del carrito`}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none"
                           stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                    <div className="flex items-center border border-primary-300 rounded-lg overflow-hidden flex-1">
                      <button
                        onClick={() => changeQuantity(cartItem.id, cartItem.quantity - 1)}
                        aria-label="Restar uno"
                        className="px-3 py-1.5 text-primary-700 hover:bg-primary-50 font-bold text-lg leading-none">−</button>
                      <NumberInput
                        value={cartItem.quantity}
                        onValueChange={qty => changeQuantity(cartItem.id, qty)}
                        min="1"
                        aria-label={`Cantidad de ${product.name}`}
                        className="w-12 text-center text-sm font-semibold border-x border-primary-300 py-1.5 focus:outline-none"
                      />
                      <button
                        onClick={() => changeQuantity(cartItem.id, cartItem.quantity + 1)}
                        aria-label="Sumar uno"
                        className="px-3 py-1.5 text-primary-700 hover:bg-primary-50 font-bold text-lg leading-none">+</button>
                    </div>
                    <span className="text-sm font-bold text-primary-700 whitespace-nowrap">
                      ${formatMoney(cartItem.subtotal)}
                    </span>
                  </div>
                  <Link href={`/product/${product.id}`} className="btn-secondary w-full block text-center">
                    Ver Detalles
                  </Link>
                </>
              ) : (
                <div className="flex gap-2">
                  <Link href={`/product/${product.id}`} className="btn-secondary flex-1 text-center">
                    Ver Detalles
                  </Link>
                  <button onClick={() => add(product)} className="btn-primary flex-1">
                    Añadir Carrito
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No se encontraron productos</p>
        </div>
      )}
    </div>
  );
}
