import { User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { AccountUser, displayName } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type AuthState =
  | { status: 'off' }       // sin Supabase: no hay cuenta
  | { status: 'loading' }
  | { status: 'out' }
  | { status: 'in'; user: AccountUser };

function toAccount(user: User): AccountUser {
  return { id: user.id, name: displayName(user), email: user.email ?? '' };
}

/** Sesión actual de Supabase; se actualiza al entrar, salir o renovar el token */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(supabase ? { status: 'loading' } : { status: 'off' });

  useEffect(() => {
    if (!supabase) return undefined;
    // onAuthStateChange avisa enseguida con la sesión guardada (INITIAL_SESSION) y después cada cambio
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(session ? { status: 'in', user: toAccount(session.user) } : { status: 'out' });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return state;
}
