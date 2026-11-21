import { supabase } from './supabase';
import { RemoteRow, SyncRecord } from './sync';

// ── Sincronización: llamadas a Supabase (spec 21) ────────────
// Lo único del sync que habla con la base; el motor (sync-engine.ts) lo usa y los tests lo reemplazan.

const PUSH_BATCH = 500;
const PULL_PAGE = 1000;
const COLUMNS = 'collection, id, data, deleted, modified_at, synced_at';

/** Error de una llamada, con el código de PostgREST o de auth para reconocer una cuenta borrada */
export class SyncCallError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

function client() {
  if (!supabase) throw new SyncCallError('Supabase no está configurado');
  return supabase;
}

/** Sube los registros en tandas; un cambio más viejo que el guardado no lo pisa (trigger de la base) */
export async function pushRecords(userId: string, records: SyncRecord[]): Promise<void> {
  for (let start = 0; start < records.length; start += PUSH_BATCH) {
    const rows = records.slice(start, start + PUSH_BATCH).map(r => ({
      user_id: userId,
      collection: r.collection,
      id: r.id,
      data: r.deleted ? null : r.data,
      deleted: r.deleted,
      modified_at: r.modifiedAt,
    }));
    const { error } = await client().from('user_records').upsert(rows, { onConflict: 'user_id,collection,id' }).retry(false);
    if (error) throw new SyncCallError(error.message, error.code);
  }
}

/** Filas propias con synced_at posterior a `since` (todas sin `since`), de la más vieja a la más nueva */
export async function pullRows(since: string | null): Promise<RemoteRow[]> {
  const rows: RemoteRow[] = [];
  for (let from = 0; ; from += PULL_PAGE) {
    let query = client().from('user_records').select(COLUMNS);
    if (since !== null) query = query.gt('synced_at', since);
    const { data, error } = await query
      .order('synced_at').order('collection').order('id')
      .range(from, from + PULL_PAGE - 1)
      .retry(false);
    if (error) throw new SyncCallError(error.message, error.code);
    rows.push(...(data as RemoteRow[]));
    if (data.length < PULL_PAGE) return rows;
  }
}

/** La cuenta ya no existe (borrada desde otro dispositivo): el token es de un usuario que no está */
export async function accountGone(): Promise<boolean> {
  const { error } = await client().auth.getUser();
  return error?.code === 'user_not_found';
}

/** Cierra la sesión solo en este dispositivo */
export async function signOutHere(): Promise<void> {
  await client().auth.signOut({ scope: 'local' });
}
