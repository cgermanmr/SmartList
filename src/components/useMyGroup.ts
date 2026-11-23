import { useCallback, useEffect, useState } from 'react';
import { fetchMyGroup, Group } from '@/lib/group';

type Result = { key: string; ok: true; group: Group | null } | { key: string; ok: false };

export interface MyGroup {
  status: 'loading' | 'error' | 'ready';
  /** null sin grupo (o mientras carga) */
  group: Group | null;
  /** Vuelve a pedirlo mostrando "Cargando…" (Reintentar) */
  retry: () => void;
  /** Lo vuelve a pedir sin pasar por "Cargando…" (después de una acción); si falla, queda lo anterior */
  refresh: () => Promise<void>;
}

/**
 * El grupo del usuario (spec 22) con `my_group()`. Se pide al montar y cada vez que la página vuelve a mostrarse
 * (con `<Activity>` los efectos se desmontan al ocultarla): mientras tanto queda lo anterior, sin "Cargando…".
 */
export function useMyGroup(userId: string | null): MyGroup {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const key = userId ? `${userId}|${attempt}` : '';

  useEffect(() => {
    if (!key) return undefined;
    let stale = false;
    fetchMyGroup().then(
      group => { if (!stale) setResult({ key, ok: true, group }); },
      // Al volver a la página sin conexión queda lo que ya se veía
      () => { if (!stale) setResult(prev => (prev?.key === key && prev.ok ? prev : { key, ok: false })); },
    );
    return () => { stale = true; };
  }, [key]);

  const refresh = useCallback(async () => {
    if (!key) return;
    try {
      const group = await fetchMyGroup();
      setResult({ key, ok: true, group });
    } catch { /* queda lo anterior */ }
  }, [key]);

  const current = result?.key === key ? result : null;
  return {
    status: !current ? 'loading' : current.ok ? 'ready' : 'error',
    group: current?.ok ? current.group : null,
    retry: () => setAttempt(a => a + 1),
    refresh,
  };
}
