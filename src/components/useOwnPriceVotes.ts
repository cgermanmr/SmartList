import { useEffect, useState } from 'react';
import { fetchOwnPriceVotes } from '@/lib/group';
import type { PriceVote } from '@/lib/price-validation';
import { useAuth } from './useAuth';

const EMPTY = new Map<string, PriceVote[]>();

interface Answered {
  /** Sesión e id pedidos: con otros, la respuesta no sirve */
  key: string;
  votes: Map<string, PriceVote[]>;
}

/**
 * Votos del grupo sobre los precios propios (spec 23), con una llamada a `my_price_votes(ids)` (hasta 100). Solo con
 * sesión; sin grupo no hay votos. Sin sesión, mientras carga o con error, el mapa está vacío y el historial queda
 * como antes. Se vuelve a pedir cada vez que la pantalla vuelve a mostrarse.
 */
export function useOwnPriceVotes(priceIds: readonly string[]): Map<string, PriceVote[]> {
  const auth = useAuth();
  const userId = auth.status === 'in' ? auth.user.id : null;
  const ids = [...new Set(priceIds)].sort().join(',');
  const key = userId && ids ? `${userId}|${ids}` : '';
  const [answered, setAnswered] = useState<Answered | null>(null);

  useEffect(() => {
    if (!key) return undefined;
    let stale = false;
    fetchOwnPriceVotes(key.split('|')[1].split(',')).then(
      votes => { if (!stale) setAnswered({ key, votes }); },
      () => { /* sin conexión: queda lo anterior o nada */ },
    );
    return () => { stale = true; };
  }, [key]);

  return key && answered?.key === key ? answered.votes : EMPTY;
}
