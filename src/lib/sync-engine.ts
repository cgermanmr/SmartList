import { create } from 'zustand';
import { clearGroupPrices } from './group';
import { clearLocalPhotos, releaseLocalPhotos, syncPhotos } from './photo-sync';
import { loadFromStorage, OUTBOX_KEY, removeFromStorage, saveToStorage, SYNC_KEY } from './storage';
import { withOrigins } from './product-form';
import { onUserDataChange, syncDataOf, useStore } from './store';
import {
  acknowledge, changesToRecords, dedupeByEan, dedupeCart, enqueue, mergeRemote, pullSince, pushOrder, RemoteRow,
  restoreTime, restoreUsedProducts, snapshotRecords, SyncData, SyncRecord, withoutSamples,
} from './sync';
import { accountGone, pullRows, pushRecords, signOutHere, SyncCallError } from './sync-remote';

// ── Motor de sincronización (spec 21) ────────────────────────
// El store sigue siendo la fuente de la UI y sigue guardando en localStorage. Cada cambio de los datos del usuario
// entra en una cola (preciolocal_outbox) que se sube a user_records; al sincronizar se bajan las filas nuevas y se
// juntan con lo local (gana el último cambio). Sin sesión pero con cuenta en el teléfono, la cola sigue creciendo.

export type SyncStatus =
  | { state: 'off' }                                                  // sin cuenta en este teléfono
  | { state: 'syncing'; lastSync: string | null }
  | { state: 'idle'; lastSync: string | null }
  | { state: 'error'; lastSync: string | null; since: string }        // desde cuándo falla
  | { state: 'expired' };                                             // cuenta en el teléfono, sesión vencida

interface SyncMeta {
  userId: string;
  /** Mayor synced_at bajado; null → bajar todo */
  cursor: string | null;
}

/** Estado para la UI (/cuenta y el ícono del header) */
export const useSyncStatus = create<{ status: SyncStatus; pending: number }>(() => ({
  status: { state: 'off' },
  pending: 0,
}));

const PUSH_DELAY_MS = 2000;

let outbox: SyncRecord[] | null = null;
let sessionUserId: string | null = null;
let running: Promise<void> | null = null;
let again = false;
let applyingRemote = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let lastSync: string | null = null;

// ── Estado guardado ──────────────────────────────────────────

function loadMeta(): SyncMeta | null {
  const meta = loadFromStorage<SyncMeta | null>(SYNC_KEY, null);
  return meta && typeof meta.userId === 'string' ? meta : null;
}

function saveMeta(meta: SyncMeta | null): void {
  if (meta) saveToStorage(SYNC_KEY, meta);
  else removeFromStorage(SYNC_KEY);
}

function getOutbox(): SyncRecord[] {
  if (outbox === null) {
    const saved = loadFromStorage<SyncRecord[]>(OUTBOX_KEY, []);
    outbox = Array.isArray(saved) ? saved : [];
  }
  return outbox;
}

function setOutbox(next: SyncRecord[]): void {
  outbox = next;
  if (next.length > 0) saveToStorage(OUTBOX_KEY, next);
  else removeFromStorage(OUTBOX_KEY);
  useSyncStatus.setState({ pending: next.length });
}

function setStatus(status: SyncStatus): void {
  useSyncStatus.setState({ status });
}

const nowIso = () => new Date().toISOString();

// ── Cambios locales ──────────────────────────────────────────

/** La llama la suscripción del store en cada cambio de los datos del usuario */
export function recordLocalChanges(prev: SyncData, next: SyncData): void {
  if (applyingRemote || !loadMeta()) return;
  const records = changesToRecords(prev, next, nowIso());
  if (records.length === 0) return;
  setOutbox(enqueue(getOutbox(), records));
  schedulePush();
}

onUserDataChange(recordLocalChanges);

/** Aplica datos bajados (o el vaciado del teléfono) sin que vuelvan a la cola */
function applyData(data: SyncData): void {
  applyingRemote = true;
  try {
    useStore.setState(data);
  } finally {
    applyingRemote = false;
  }
}

/** Sube a los 2 s del último cambio (solo con sesión) */
export function schedulePush(): void {
  if (!sessionUserId) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void syncNow(), PUSH_DELAY_MS);
}

export function pendingCount(): number {
  return getOutbox().length;
}

/** Usuario de la sesión que sincroniza; null sin sesión (las fotos de otro teléfono solo se bajan con sesión) */
export function syncUserId(): string | null {
  return sessionUserId;
}

// ── Sesión ───────────────────────────────────────────────────

/**
 * Empieza a sincronizar con la sesión de `userId`. Primera sesión en el teléfono: encola todo (sin los datos de
 * ejemplo sin usar) y baja la cuenta entera. Otro usuario que el guardado: descarta lo local sin subirlo.
 */
export async function startSync(userId: string): Promise<void> {
  sessionUserId = userId;
  const meta = loadMeta();
  if (!meta) {
    setOutbox(enqueue(getOutbox(), snapshotRecords(withoutSamples(syncDataOf(useStore.getState())), nowIso())));
    saveMeta({ userId, cursor: null });
  } else if (meta.userId !== userId) {
    clearUserData();
    await clearLocalPhotos().catch(() => undefined);
    setOutbox([]);
    saveMeta({ userId, cursor: null });
  } else if (await accountGoneSafe()) {
    // Cuenta borrada desde otro dispositivo, con el token todavía vigente: los datos quedan sin cuenta
    await forgetAccountAndSignOut();
    return;
  }
  setStatus({ state: 'idle', lastSync });
  await syncNow();
}

/** La sesión terminó sin cerrar sesión (token vencido): los cambios se siguen guardando para después */
export function stopSync(): void {
  sessionUserId = null;
  clearTimeout(pushTimer);
  setStatus(loadMeta() ? { state: 'expired' } : { state: 'off' });
}

/** Vacía los datos del usuario en el teléfono sin encolar los borrados (la ubicación queda) */
function clearUserData(): void {
  applyingRemote = true;
  try {
    useStore.getState().resetUserData();
  } finally {
    applyingRemote = false;
  }
}

// ── Subir y bajar ────────────────────────────────────────────

/** Sube la cola y baja lo nuevo; nunca dos a la vez (un pedido durante una vuelta hace otra al terminar) */
export function syncNow(): Promise<void> {
  if (!sessionUserId) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await round();
      } while (again && sessionUserId);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function round(): Promise<void> {
  const userId = sessionUserId;
  const meta = loadMeta();
  if (!userId || !meta || meta.userId !== userId) return;
  const previous = useSyncStatus.getState().status;
  setStatus({ state: 'syncing', lastSync });

  try {
    const sent = pushOrder(getOutbox());
    if (sent.length > 0) {
      await pushRecords(userId, sent);
      setOutbox(acknowledge(getOutbox(), sent));
    }

    const rows = await pullRows(pullSince(meta.cursor));
    if (sessionUserId !== userId) return;
    if (rows.length > 0) {
      applyRows(rows);
      saveMeta({ userId, cursor: maxSyncedAt(rows, meta.cursor) });
    }
    await syncPhotosSafe(userId);
    lastSync = nowIso();
    setStatus({ state: 'idle', lastSync });
  } catch (error) {
    if (await isAccountGone(error)) {
      await forgetAccountAndSignOut();
      return;
    }
    const since = previous.state === 'error' ? previous.since : nowIso();
    setStatus({ state: 'error', lastSync, since });
  }
}

/**
 * Junta las filas bajadas con lo local, restaura los productos que otro dispositivo eliminó y todavía se usan (spec 33),
 * resuelve duplicados y encola lo que eso cambió
 */
function applyRows(rows: RemoteRow[]): void {
  const local = syncDataOf(useStore.getState());
  const pending = getOutbox();
  const merged = mergeRemote(local, rows, pending);

  // Fecha de modificación de los ítems del carrito: la de la cola (cambios locales) o la de la fila bajada
  const cartTimes = new Map<string, string>();
  for (const r of rows) if (r.collection === 'cart') cartTimes.set(r.id, r.modified_at);
  for (const r of pending) if (r.collection === 'cart') cartTimes.set(r.id, r.modifiedAt);

  const { data: restored, restoredIds } = restoreUsedProducts(local, merged, rows);
  const unique = dedupeByEan(restored);
  // Spec 36: un producto bajado sin origen (otro dispositivo con la versión anterior) lo recibe acá y vuelve a subir
  const products = withOrigins(unique.products);
  const deduped = products === unique.products ? unique : { ...unique, products };
  const cart = dedupeCart(deduped.cart, cartTimes);
  const final = cart === deduped.cart ? deduped : { ...deduped, cart };

  applyData(final);
  const now = nowIso();
  const restoredAt = restoreTime(restoredIds, rows, now);
  const extra = changesToRecords(merged, final, now).map(r => (
    r.collection === 'products' && !r.deleted && restoredIds.includes(r.id) ? { ...r, modifiedAt: restoredAt } : r
  ));
  if (extra.length > 0) {
    setOutbox(enqueue(getOutbox(), extra));
    again = true;
  }
}

/** Fotos de la spec 27: un error de Storage no frena los registros; se reintenta en la vuelta siguiente */
async function syncPhotosSafe(userId: string): Promise<void> {
  if (sessionUserId !== userId) return;
  try {
    await syncPhotos(userId, useStore.getState().products);
  } catch { /* se reintenta en la próxima vuelta */ }
}

function maxSyncedAt(rows: RemoteRow[], cursor: string | null): string | null {
  let best = cursor;
  for (const r of rows) {
    if (best === null || Date.parse(r.synced_at) > Date.parse(best)) best = r.synced_at;
  }
  return best;
}

/** Error de una cuenta que ya no existe: FK de user_id (23503) o un token de un usuario borrado */
async function isAccountGone(error: unknown): Promise<boolean> {
  const code = error instanceof SyncCallError ? error.code : undefined;
  if (code !== '23503' && code !== 'PGRST301' && code !== '42501') return false;
  return accountGoneSafe();
}

async function accountGoneSafe(): Promise<boolean> {
  try {
    return await accountGone();
  } catch {
    return false; // sin conexión: no se puede saber, se sigue como siempre
  }
}

// ── Cerrar sesión ────────────────────────────────────────────

/** Olvida la cuenta en este teléfono sin tocar los datos: quedan como si nunca hubiera habido cuenta */
export function forgetAccount(): void {
  sessionUserId = null;
  clearTimeout(pushTimer);
  setOutbox([]);
  saveMeta(null);
  lastSync = null;
  setStatus({ state: 'off' });
  clearGroupPrices(); // los precios del grupo son de la cuenta (spec 22)
}

async function forgetAccountAndSignOut(): Promise<void> {
  forgetAccount();
  // Las fotos quedan en el teléfono sin subir, para subirse si se entra con otra cuenta
  await releaseLocalPhotos().catch(() => undefined);
  try {
    await signOutHere();
  } catch { /* la sesión ya no sirve */ }
}

/** Cerrar sesión: sale en este teléfono y lo deja vacío (los datos siguen en la cuenta); la ubicación queda */
export async function signOutEverywhere(): Promise<void> {
  sessionUserId = null;
  clearTimeout(pushTimer);
  try {
    await signOutHere();
  } finally {
    clearUserData();
    forgetAccount();
    await clearLocalPhotos().catch(() => undefined);
  }
}
