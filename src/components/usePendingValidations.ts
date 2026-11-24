import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { fetchPendingValidations, groupPricesVersion, subscribeGroupPrices } from '@/lib/group';
import { PendingPrice, pendingValidations } from '@/lib/price-validation';

type Result =
  | { key: string; visit: number; ok: true; prices: PendingPrice[] }
  | { key: string; visit: number; ok: false };

export interface PendingValidations {
  status: 'loading' | 'error' | 'ready';
  /** Todos los que devolvió pending_validations, sin filtrar (para seguir mostrando lo que se votó) */
  prices: PendingPrice[];
  /** Los que faltan validar (pendingValidations): la lista de la página y el contador "Por validar (N)" */
  pending: PendingPrice[];
  /** Cambia cada vez que la pantalla vuelve a mostrarse; no cambia al volver a pedir después de un voto */
  visit: number;
  retry: () => void;
}

const NO_PRICES: PendingPrice[] = [];

/**
 * Precios por validar (spec 23) con una sola llamada a `pending_validations()`. Solo con sesión (`userId`). Se pide al
 * montar, cada vez que la pantalla vuelve a mostrarse (con `<Activity>` los efectos se desmontan al ocultarla) y con
 * cada `clearGroupPrices` (cada voto): mientras tanto queda lo anterior, sin "Cargando…".
 */
export function usePendingValidations(userId: string | null): PendingValidations {
  const version = useSyncExternalStore(subscribeGroupPrices, groupPricesVersion, () => 0);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const visits = useRef(0);
  const owner = userId ? `${userId}|${attempt}` : '';

  // Antes que el de la consulta: al volver a mostrarse la pantalla, la consulta sale con la visita nueva
  useEffect(() => { visits.current += 1; }, []);

  useEffect(() => {
    if (!owner) return undefined;
    let stale = false;
    const visit = visits.current;
    fetchPendingValidations().then(
      prices => { if (!stale) setResult({ key: owner, visit, ok: true, prices }); },
      // Si falla después de un voto o al volver, queda lo que ya se veía
      () => { if (!stale) setResult(prev => (prev?.key === owner && prev.ok ? prev : { key: owner, visit, ok: false })); },
    );
    return () => { stale = true; };
  }, [owner, version]);

  const retry = useCallback(() => setAttempt(a => a + 1), []);
  const current = result?.key === owner ? result : null;
  const prices = current?.ok ? current.prices : NO_PRICES;
  return {
    status: !current ? 'loading' : current.ok ? 'ready' : 'error',
    prices,
    pending: userId && current?.ok ? pendingValidations(prices, userId) : NO_PRICES,
    visit: current?.visit ?? 0,
    retry,
  };
}
