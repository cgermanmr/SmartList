import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Cliente de solo lectura del catálogo SEPA: sin sesión, solo datos públicos por RLS.
// NEXT_PUBLIC_SUPABASE_ANON_KEY lleva la clave publishable (sb_publishable_…).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** null si faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY */
export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, { auth: { persistSession: false } })
  : null;
