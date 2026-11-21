import { supabase } from './supabase';

// ── Cuenta (spec 21) ─────────────────────────────────────────
// Login optativo con Google o con un mail que trae un código de 6 dígitos y un link. Todo corre en el cliente.

export interface AccountUser {
  id: string;
  name: string;
  email: string;
}

/** Nombre para mostrar: el de Google; si no hay, la parte del mail antes de la arroba */
export function displayName(user: { email?: string; user_metadata?: Record<string, unknown> }): string {
  const meta = user.user_metadata ?? {};
  for (const key of ['full_name', 'name']) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return (user.email ?? '').split('@')[0];
}

export function validEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}

export function validCode(text: string): boolean {
  return /^\d{6}$/.test(text.replace(/\s/g, ''));
}

/**
 * App instalada en el iPhone: no comparte datos con Safari, así que el link del mail (y a veces Google) deja la
 * sesión en Safari y no en la app; ahí se entra con el código
 */
export function isIosStandalone(userAgent: string, standalone: boolean): boolean {
  return standalone && /iPhone|iPad|iPod/.test(userAgent);
}

/** Vuelta del login: la página de la cuenta, en el mismo origen (local, preview o producción) */
function returnUrl(): string {
  return `${window.location.origin}/cuenta`;
}

function client() {
  if (!supabase) throw new Error('Supabase no está configurado');
  return supabase;
}

export async function signInWithGoogle(): Promise<void> {
  const { error } = await client().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnUrl() } });
  if (error) throw error;
}

/** Manda el mail con el código y el link */
export async function sendEmailCode(email: string): Promise<void> {
  const { error } = await client().auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: returnUrl(), shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, code: string): Promise<void> {
  const { error } = await client().auth.verifyOtp({ email: email.trim(), token: code.replace(/\s/g, ''), type: 'email' });
  if (error) throw error;
}

/** Borra la cuenta y, en cascada, todas sus filas de user_records */
export async function deleteAccountData(): Promise<void> {
  const { error } = await client().rpc('delete_my_account');
  if (error) throw error;
}
