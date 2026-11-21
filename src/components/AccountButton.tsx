'use client';

import { CircleUser } from 'lucide-react';
import Link from 'next/link';
import { initialOf } from '@/lib/format';
import { useSyncStatus } from '@/lib/sync-engine';
import { useNow } from './useNow';
import { useAuth } from './useAuth';

/**
 * Cuenta en el header (spec 21): sin sesión, el ícono; con sesión, la inicial del nombre, con un punto ámbar si no
 * se pudo sincronizar en la última hora. Lleva a /cuenta. Sin Supabase no se muestra.
 */
export default function AccountButton() {
  const auth = useAuth();
  const status = useSyncStatus(s => s.status);
  const now = useNow();
  // Punto ámbar si la sincronización falla hace más de 1 h
  const warning = status.state === 'error' && now.getTime() > 0 && now.getTime() - Date.parse(status.since) > 60 * 60_000;
  if (auth.status === 'off' || auth.status === 'loading') return null;

  const signedIn = auth.status === 'in';
  const label = signedIn ? `Cuenta de ${auth.user.name}` : 'Cuenta';

  return (
    <Link
      href="/cuenta"
      aria-label={warning ? `${label}: no se pudo sincronizar` : label}
      className="relative flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
      {signedIn ? (
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-primary-100 font-display text-base font-semibold text-primary-800">
          {initialOf(auth.user.name) || initialOf(auth.user.email)}
        </span>
      ) : (
        <CircleUser aria-hidden="true" className="size-7" />
      )}
      {warning && (
        <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-amber-400 ring-2 ring-primary-700" />
      )}
    </Link>
  );
}
