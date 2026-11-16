'use client';

import Link from 'next/link';
import { formatMoney } from '@/lib/format';
import { getCartTotal, useStore } from '@/lib/store';

/** Total del carrito en el header, como link al carrito. La cantidad va en la pestaña (CartBadge) */
export default function CartSummary() {
  const hydrated = useStore(s => s.hydrated);
  const cart = useStore(s => s.cart);
  if (!hydrated) return null;

  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (count <= 0) return null;

  const total = `$${formatMoney(getCartTotal(cart))}`;
  return (
    <Link
      href="/cart"
      aria-label={`Carrito: ${count === 1 ? '1 producto' : `${count} productos`}, total ${total}`}
      className="flex min-h-11 shrink-0 items-center rounded-xl px-2 font-display text-lg font-semibold hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
      {total}
    </Link>
  );
}
