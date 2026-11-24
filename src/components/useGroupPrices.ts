import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  getGroupPrices, GroupPrice, groupPricesEpoch, groupPricesVersion, latestGroupPrices, subscribeGroupPrices,
} from '@/lib/group';
import { useAuth } from './useAuth';

const EMPTY = new Map<string, GroupPrice[]>();

interface Answered {
  /** Sesión y época de la caché de las respuestas: con otra, no sirven */
  owner: string;
  prices: Map<string, GroupPrice[]>;
}

const NONE: Answered = { owner: '', prices: EMPTY };

/**
 * Precios del grupo (spec 22) de varios EAN, en una sola consulta (`getGroupPrices`, caché de 5 minutos): por EAN, el
 * último de cada integrante en cada comercio (`latestGroupPrices`), por precio. Solo con sesión; sin grupo, sin
 * precios, mientras carga o con error, el EAN no está y la pantalla queda como antes. Las respuestas se acumulan
 * como en `useSepaReferences`; `clearGroupPrices` (salir, pausar, cerrar sesión…) las descarta y vuelve a pedir;
 * `refreshGroupPrices` (votar) vuelve a pedir y deja las anteriores hasta que llega la respuesta.
 */
export function useGroupPrices(eans: readonly (string | undefined)[]): Map<string, GroupPrice[]> {
  const auth = useAuth();
  const version = useSyncExternalStore(subscribeGroupPrices, groupPricesVersion, () => 0);
  const epoch = useSyncExternalStore(subscribeGroupPrices, groupPricesEpoch, () => 0);
  const key = [...new Set(eans.filter((ean): ean is string => Boolean(ean)))].sort().join(',');
  const userId = auth.status === 'in' ? auth.user.id : null;
  const owner = userId ? `${userId}|${epoch}` : '';
  const active = owner !== '' && key !== '';
  const [answered, setAnswered] = useState<Answered>(NONE);

  useEffect(() => {
    if (!active || !userId) return undefined;
    let stale = false;
    const requested = key.split(',');
    getGroupPrices(userId, requested).then(
      byEan => {
        if (stale) return;
        setAnswered(prev => {
          const prices = new Map(prev.owner === owner ? prev.prices : EMPTY);
          for (const ean of requested) {
            const latest = latestGroupPrices(byEan.get(ean) ?? []);
            if (latest.length > 0) prices.set(ean, latest);
            else prices.delete(ean);
          }
          return { owner, prices };
        });
      },
      () => { /* sin conexión o sin Supabase: la pantalla queda sin precios del grupo */ },
    );
    return () => { stale = true; };
  }, [active, key, owner, userId, version]);

  return active && answered.owner === owner ? answered.prices : EMPTY;
}
