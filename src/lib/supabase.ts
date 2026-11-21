import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Cliente único de Supabase: el catálogo SEPA (lectura pública por RLS, con o sin sesión) y, desde la spec 21, la
// cuenta y la sincronización de los datos del usuario (user_records, solo las filas propias por RLS).
// NEXT_PUBLIC_SUPABASE_ANON_KEY lleva la clave publishable (sb_publishable_…). La sesión la guarda supabase-js en
// localStorage; flujo PKCE para la vuelta de Google y del link del mail (detectSessionInUrl la toma de la URL).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** null si faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY */
export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } })
  : null;
