'use client';

import { useEffect } from 'react';
import { startSync, stopSync, syncNow } from '@/lib/sync-engine';
import { useAuth } from './useAuth';

/**
 * Sincronización con la cuenta (spec 21): arranca al haber sesión y vuelve a sincronizar al recuperar la conexión
 * y al volver a la app. Va dentro de StoreHydrator: nunca corre antes de cargar los datos del teléfono.
 */
export default function SyncManager() {
  const auth = useAuth();
  const userId = auth.status === 'in' ? auth.user.id : null;
  const signedOut = auth.status === 'out';

  useEffect(() => {
    if (userId) {
      void startSync(userId);
      return () => stopSync();
    }
    if (signedOut) stopSync();
    return undefined;
  }, [userId, signedOut]);

  useEffect(() => {
    const onOnline = () => void syncNow();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncNow();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
