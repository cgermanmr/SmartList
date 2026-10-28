'use client';

import { ReactNode, useEffect } from 'react';
import { useStore } from '@/lib/store';

/** Carga los datos de localStorage en el cliente y recién entonces muestra las páginas */
export default function StoreHydrator({ children }: { children: ReactNode }) {
  const hydrated = useStore(s => s.hydrated);
  const hydrate = useStore(s => s.hydrate);

  useEffect(() => hydrate(), [hydrate]);

  if (!hydrated) {
    return <p className="text-center text-gray-500 py-12" role="status">Cargando…</p>;
  }
  return children;
}
