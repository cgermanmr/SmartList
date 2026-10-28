'use client';

import Link from 'next/link';
import { useState } from 'react';
import NumberInput from '@/components/NumberInput';
import { formatMoney } from '@/lib/format';
import { newId } from '@/lib/ids';
import { CartItem, Price, Purchase } from '@/lib/models';
import { getCartTotal, getLastPurchasedPrice, useStore } from '@/lib/store';

// ── Medios de pago ─────────────────────────────────────────
const PAYMENT_METHODS = [
  { id: 'efectivo',      label: 'Efectivo',           icon: '💵' },
  { id: 'debito',        label: 'Débito',             icon: '💳' },
  { id: 'credito1',      label: 'Crédito (1 cuota)',  icon: '💳' },
  { id: 'creditoN',      label: 'Crédito en cuotas',  icon: '📆' },
  { id: 'transferencia', label: 'Transferencia / QR', icon: '📲' },
  { id: 'cheque',        label: 'Cheque',             icon: '📝' },
];

type PriceStatus = 'cheaper' | 'expensive' | 'same' | 'new';

const STATUS_CLASS: Record<PriceStatus, string> = {
  cheaper:   'text-green-600',
  expensive: 'text-red-600',
  same:      'text-blue-600',
  new:       '',
};

// ── Comparación de precios ─────────────────────────────────
function priceStatus(item: CartItem, last: number | null): PriceStatus {
  if (last === null) return 'new';
  if (item.price < last) return 'cheaper';
  if (item.price > last) return 'expensive';
  return 'same';
}

function priceBadge(item: CartItem, last: number): string {
  const diff = item.price - last;
  if (diff === 0) return '= igual';
  return `${diff > 0 ? '▲' : '▼'} ${diff > 0 ? '+' : ''}$${formatMoney(Math.abs(diff))}`;
}

export default function CartPage() {
  const cart = useStore(s => s.cart);
  const purchases = useStore(s => s.purchases);
  const removeFromCart = useStore(s => s.removeFromCart);
  const updateQuantity = useStore(s => s.updateQuantity);
  const updateCartItemPrice = useStore(s => s.updateCartItemPrice);
  const clearCart = useStore(s => s.clearCart);
  const addPrice = useStore(s => s.addPrice);
  const savePurchase = useStore(s => s.savePurchase);

  // ── Comercio único ─────────────────────────────────────────
  const [isSingleStore, setIsSingleStore] = useState(false);
  const [storeBarrio, setStoreBarrio] = useState('');
  const [storeName, setStoreName] = useState('');

  const [showPaymentStep, setShowPaymentStep] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState('');

  const total = getCartTotal(cart);

  function clear() {
    if (confirm('¿Estás seguro de que quieres vaciar el carrito?')) {
      setShowPaymentStep(false);
      clearCart();
    }
  }

  function checkout() {
    setShowPaymentStep(true);
    setSelectedPayment('');
  }

  function cancelPayment() {
    setShowPaymentStep(false);
    setSelectedPayment('');
  }

  function confirmCheckout() {
    const purchase: Purchase = {
      id: newId(),
      date: new Date().toISOString(),
      items: cart.map(i => ({ ...i })),
      total,
      ...(isSingleStore && storeBarrio && { barrio: storeBarrio }),
      ...(isSingleStore && storeName && { store: storeName }),
      paymentMethod: selectedPayment,
    };
    // Registrar precios pagados en el historial de precios
    const now = new Date();
    const barrio = isSingleStore && storeBarrio ? storeBarrio : 'Sin especificar';
    const store = isSingleStore && storeName ? storeName : undefined;
    cart.forEach((item, idx) => {
      const price: Price = {
        id: `${newId()}-${idx}`,
        productId: item.productId,
        amount: item.price,
        date: now,
        barrio,
        store,
      };
      addPrice(price);
    });

    savePurchase(purchase);
    alert(`Compra finalizada!\nTotal: $${formatMoney(total)}\nPago: ${selectedPayment}`);
    setShowPaymentStep(false);
    setIsSingleStore(false);
    setStoreBarrio('');
    setStoreName('');
    clearCart();
  }

  if (cart.length === 0) {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-6">Mi Carrito</h1>
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg mb-4">Tu carrito está vacío</p>
          <Link href="/" className="btn-primary inline-block">Volver a Buscar</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Mi Carrito</h1>

      {/* Items del carrito */}
      <div className="grid grid-cols-1 gap-4 mb-6">
        {cart.map(item => {
          const last = getLastPurchasedPrice(purchases, item.productId);
          const status = priceStatus(item, last);
          return (
            <div key={item.id} className="card p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold">{item.productName}</h3>
                  {last !== null && (
                    <span className={`text-xs font-semibold ${STATUS_CLASS[status]}`}>
                      {priceBadge(item, last)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => removeFromCart(item.id)}
                  aria-label={`Quitar ${item.productName}`}
                  className="text-red-500 hover:text-red-700 text-xl ml-2">
                  ✕
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label htmlFor={`price-${item.id}`} className="text-sm text-gray-600">Precio $</label>
                  <NumberInput
                    id={`price-${item.id}`}
                    value={item.price}
                    onValueChange={price => updateCartItemPrice(item.id, price)}
                    min="0"
                    step="0.01"
                    className="input-field w-28"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor={`qty-${item.id}`} className="text-sm text-gray-600">Cantidad</label>
                  <NumberInput
                    id={`qty-${item.id}`}
                    value={item.quantity}
                    onValueChange={qty => { if (qty > 0) updateQuantity(item.id, qty); }}
                    min="1"
                    className="input-field w-20"
                  />
                </div>
                <span className="text-lg font-bold text-primary-700 ml-auto">
                  ${formatMoney(item.subtotal)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Misma compra en un comercio */}
      <div className="card p-4 mb-6">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isSingleStore}
            onChange={e => setIsSingleStore(e.target.checked)}
            className="w-4 h-4 accent-primary-600"
          />
          <span className="font-medium">¿Compra en un mismo comercio?</span>
        </label>

        {isSingleStore && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="store-barrio" className="text-sm text-gray-600 block mb-1">Barrio</label>
              <input
                id="store-barrio"
                type="text"
                value={storeBarrio}
                onChange={e => setStoreBarrio(e.target.value)}
                placeholder="Ej: Caballito"
                className="input-field w-full"
              />
            </div>
            <div>
              <label htmlFor="store-name" className="text-sm text-gray-600 block mb-1">Comercio</label>
              <input
                id="store-name"
                type="text"
                value={storeName}
                onChange={e => setStoreName(e.target.value)}
                placeholder="Ej: Supermercado Norte"
                className="input-field w-full"
              />
            </div>
          </div>
        )}
      </div>

      {/* Total */}
      <div className="bg-green-50 border-2 border-green-500 rounded-lg p-6 mb-6">
        <p className="text-3xl font-bold text-green-700">
          Total: ${formatMoney(total)}
        </p>
      </div>

      {!showPaymentStep ? (
        // Botones principales
        <div className="flex gap-4">
          <button onClick={clear} className="btn-secondary flex-1">
            Limpiar Carrito
          </button>
          <button onClick={checkout} className="btn-primary flex-1">
            Finalizar Compra
          </button>
        </div>
      ) : (
        // Paso: selección de medio de pago
        <div className="card p-5">
          <h2 className="font-bold text-lg mb-4">¿Con qué medio de pago?</h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            {PAYMENT_METHODS.map(m => (
              <button
                key={m.id}
                onClick={() => setSelectedPayment(m.label)}
                aria-pressed={selectedPayment === m.label}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                  selectedPayment === m.label
                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                    : 'border-gray-200 hover:border-primary-300 text-gray-700'
                }`}>
                <span className="text-2xl" aria-hidden="true">{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={cancelPayment} className="btn-secondary flex-1">
              Volver
            </button>
            <button
              onClick={confirmCheckout}
              disabled={!selectedPayment}
              className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed">
              Confirmar Compra
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
