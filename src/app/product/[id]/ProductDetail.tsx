'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import PriceChart from '@/components/PriceChart';
import { formatMoney, formatShortDateTime } from '@/lib/format';
import { newId } from '@/lib/ids';
import { CartItem, Price } from '@/lib/models';
import { getPriceStats, getPricesForProduct, useStore } from '@/lib/store';

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const product = useStore(s => s.products.find(p => p.id === id));
  const allPrices = useStore(s => s.prices);
  const addToCart = useStore(s => s.addToCart);
  const updatePrice = useStore(s => s.updatePrice);

  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingAmount, setEditingAmount] = useState('');

  if (!product) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Producto no encontrado</p>
      </div>
    );
  }

  const prices = getPricesForProduct(allPrices, product.id);
  const stats = getPriceStats(allPrices, product.id);

  function add() {
    if (!product || !stats) return;
    const item: CartItem = {
      id: newId(),
      productId: product.id,
      productName: product.name,
      price: stats.current,
      quantity: 1,
      subtotal: stats.current,
    };
    addToCart(item);
    alert('Producto añadido al carrito!');
  }

  function startEdit(price: Price) {
    setEditingPriceId(price.id);
    setEditingAmount(String(price.amount));
  }

  function saveEdit(price: Price) {
    const amount = Number(editingAmount);
    if (amount > 0) updatePrice(price.id, amount);
    setEditingPriceId(null);
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/" className="text-primary-700 hover:text-primary-800 font-semibold">
          ← Volver
        </Link>
      </div>

      <div className="card p-6 mb-6">
        <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
        <p className="text-gray-600 mb-4">Categoría: {product.category}</p>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded">
              <p className="text-xs text-gray-600">Precio Actual</p>
              <p className="text-2xl font-bold text-blue-700">${formatMoney(stats.current)}</p>
            </div>
            <div className="bg-green-50 p-4 rounded">
              <p className="text-xs text-gray-600">Mínimo</p>
              <p className="text-2xl font-bold text-green-700">${formatMoney(stats.min)}</p>
            </div>
            <div className="bg-red-50 p-4 rounded">
              <p className="text-xs text-gray-600">Máximo</p>
              <p className="text-2xl font-bold text-red-700">${formatMoney(stats.max)}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded">
              <p className="text-xs text-gray-600">Promedio</p>
              <p className="text-2xl font-bold text-purple-700">${formatMoney(stats.avg)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Gráfico de evolución de precios (solo si hay más de 3 registros) */}
      {prices.length > 3 && (
        <div className="card p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Evolución del Precio</h2>
          <PriceChart prices={prices} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="text-xl font-bold mb-4">Historial de Precios</h2>
          <div className="space-y-2">
            {prices.map(price => (
              <div key={price.id} className="card p-4">
                {editingPriceId !== price.id ? (
                  // Modo visualización
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold">${formatMoney(price.amount)}</p>
                      <p className="text-sm text-gray-600">{price.barrio} - {price.store}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-gray-500">{formatShortDateTime(price.date)}</p>
                      <button
                        onClick={() => startEdit(price)}
                        className="text-gray-400 hover:text-primary-700 text-sm transition-colors"
                        title="Editar precio"
                        aria-label={`Editar precio de $${formatMoney(price.amount)}`}>
                        ✏️
                      </button>
                    </div>
                  </div>
                ) : (
                  // Modo edición inline
                  <div>
                    <p className="text-sm text-gray-500 mb-2">
                      {price.barrio} - {price.store} · {formatShortDateTime(price.date)}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-600 font-semibold">$</span>
                      <input
                        type="number"
                        value={editingAmount}
                        onChange={e => setEditingAmount(e.target.value)}
                        step="0.01"
                        min="0"
                        aria-label="Nuevo monto"
                        className="input-field w-32"
                        onKeyUp={e => {
                          if (e.key === 'Enter') saveEdit(price);
                          if (e.key === 'Escape') setEditingPriceId(null);
                        }}
                      />
                      <button onClick={() => saveEdit(price)} className="btn-primary py-1 px-3 text-sm">Guardar</button>
                      <button onClick={() => setEditingPriceId(null)} className="btn-secondary py-1 px-3 text-sm">Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-xl font-bold mb-4">Agregar al Carrito</h2>
          <p className="text-2xl font-bold text-primary-700 mb-4">${formatMoney(stats?.current || 0)}</p>
          <button onClick={add} className="btn-primary w-full">
            Añadir al Carrito
          </button>
        </div>
      </div>
    </div>
  );
}
