'use client';

import { useStore } from '@/lib/store';

/**
 * Nombre de la app en el header (spec 30). Con productos en el carrito y menos de 430 px cede el lugar al botón de
 * WhatsApp, la cuenta y el total: no se ve, pero el link a / conserva su nombre accesible.
 */
export default function AppName() {
  const hydrated = useStore(s => s.hydrated);
  const cart = useStore(s => s.cart);
  // Antes de hidratar se ve, igual que en el HTML prerenderizado
  const yields = hydrated && cart.some(item => item.quantity > 0);

  return <span className={yields ? 'truncate max-[430px]:sr-only' : 'truncate'}>El Changuito</span>;
}
