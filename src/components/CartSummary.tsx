'use client';

import { formatMoney } from '@/lib/format';
import { getCartTotal, useStore } from '@/lib/store';

export default function CartSummary() {
  const hydrated = useStore(s => s.hydrated);
  const cart = useStore(s => s.cart);
  if (!hydrated) return null;

  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <div className="text-sm">Carrito: {count} | Total: ${formatMoney(getCartTotal(cart))}</div>
  );
}
