'use client';

import { useStore } from '@/lib/store';

/** Contador del carrito sobre el ícono de su pestaña. Nada antes de hidratar ni con el carrito vacío */
export default function CartBadge() {
  const hydrated = useStore(s => s.hydrated);
  const cart = useStore(s => s.cart);
  if (!hydrated) return null;

  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (count <= 0) return null;

  return (
    <>
      <span
        aria-hidden="true"
        className="absolute -top-1.5 left-1/2 ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-400 px-1 text-[11px] font-bold leading-none text-gray-900">
        {count > 99 ? '99+' : count}
      </span>
      <span className="sr-only">, {count === 1 ? '1 producto' : `${count} productos`}</span>
    </>
  );
}
