import { CalculatorState, CartItem, Price, Product, Purchase } from './models';

// ── Sincronización: funciones puras (spec 21) ────────────────
// Cada registro de la app (producto, precio, ítem del carrito, compra) es una fila de user_records; la calculadora es
// el registro settings/calculator. La ubicación nunca se sincroniza.

export type Collection = 'products' | 'prices' | 'cart' | 'purchases' | 'settings';

export const CALCULATOR_RECORD_ID = 'calculator';

/** Cambio local pendiente de subir; `data` es null si es un borrado */
export interface SyncRecord {
  collection: Collection;
  id: string;
  data: unknown;
  deleted: boolean;
  modifiedAt: string;
}

/** Fila de user_records tal como la devuelve Supabase (sin user_id) */
export interface RemoteRow {
  collection: Collection;
  id: string;
  data: unknown;
  deleted: boolean;
  modified_at: string;
  synced_at: string;
}

/** Lo que se sincroniza del store */
export interface SyncData {
  products: Product[];
  prices: Price[];
  cart: CartItem[];
  purchases: Purchase[];
  calculator: CalculatorState;
}

type ListKey = 'products' | 'prices' | 'cart' | 'purchases';
const LISTS: ListKey[] = ['products', 'prices', 'cart', 'purchases'];

/** Ids fijos de los datos de ejemplo que traía la app (ya no se crean; spec 21) */
const SAMPLE_PRODUCT_IDS = new Set(['1', '2', '3', '4', '5', '6', '7', '8']);
const SAMPLE_PRICE_IDS = new Set(['1', '2', '3']);

/** Margen del cursor al bajar: cubre transacciones que confirman fuera de orden */
const PULL_OVERLAP_MS = 5 * 60_000;

// ── Detección de cambios ─────────────────────────────────────

/**
 * Elementos nuevos o cambiados y `id` quitados entre dos versiones de una colección. Como las acciones del store
 * nunca mutan, un elemento cambiado es un objeto nuevo: alcanza con comparar referencias.
 */
export function diffCollection<T extends { id: string }>(prev: T[], next: T[]): { changed: T[]; removedIds: string[] } {
  if (prev === next) return { changed: [], removedIds: [] };
  const before = new Map(prev.map(item => [item.id, item]));
  const nextIds = new Set(next.map(item => item.id));
  return {
    changed: next.filter(item => before.get(item.id) !== item),
    removedIds: prev.filter(item => !nextIds.has(item.id)).map(item => item.id),
  };
}

/** Registros a subir por los cambios entre dos estados */
export function changesToRecords(prev: SyncData, next: SyncData, modifiedAt: string): SyncRecord[] {
  const records: SyncRecord[] = [];
  for (const collection of LISTS) {
    const { changed, removedIds } = diffCollection<{ id: string }>(prev[collection], next[collection]);
    for (const item of changed) records.push({ collection, id: item.id, data: item, deleted: false, modifiedAt });
    for (const id of removedIds) records.push({ collection, id, data: null, deleted: true, modifiedAt });
  }
  if (prev.calculator !== next.calculator) records.push(calculatorRecord(next.calculator, modifiedAt));
  return records;
}

/** Todos los registros de un estado: lo que sube un teléfono en su primera sesión */
export function snapshotRecords(data: SyncData, modifiedAt: string): SyncRecord[] {
  const records: SyncRecord[] = [];
  for (const collection of LISTS) {
    for (const item of data[collection]) {
      records.push({ collection, id: item.id, data: item, deleted: false, modifiedAt });
    }
  }
  records.push(calculatorRecord(data.calculator, modifiedAt));
  return records;
}

function calculatorRecord(calculator: CalculatorState, modifiedAt: string): SyncRecord {
  return { collection: 'settings', id: CALCULATOR_RECORD_ID, data: calculator, deleted: false, modifiedAt };
}

// ── Cola ─────────────────────────────────────────────────────

/** Milisegundos de una fecha ISO en cualquier formato (`…Z` del teléfono, `…+00:00` de Postgres); sin fecha, -∞ */
function timeOf(iso: string | undefined): number {
  const ms = iso === undefined ? NaN : Date.parse(iso);
  return Number.isNaN(ms) ? -Infinity : ms;
}

function recordKey(record: { collection: Collection; id: string }): string {
  return `${record.collection}/${record.id}`;
}

/** Agrega a la cola; un registro que ya estaba pendiente se reemplaza por el nuevo (queda al final) */
export function enqueue(outbox: SyncRecord[], records: SyncRecord[]): SyncRecord[] {
  if (records.length === 0) return outbox;
  const incoming = new Map(records.map(r => [recordKey(r), r]));
  return [...outbox.filter(r => !incoming.has(recordKey(r))), ...incoming.values()];
}

/**
 * Saca de la cola lo que el servidor confirmó. Un pendiente del mismo registro con otro `modifiedAt` se encoló
 * mientras se enviaba: queda para la próxima vuelta.
 */
export function acknowledge(outbox: SyncRecord[], sent: SyncRecord[]): SyncRecord[] {
  const confirmed = new Map(sent.map(r => [recordKey(r), r.modifiedAt]));
  return outbox.filter(r => confirmed.get(recordKey(r)) !== r.modifiedAt);
}

/**
 * Orden para subir: los borrados de productos al final, el resto como estaba. Si la subida se corta entre tandas, nadie
 * ve un producto borrado con sus precios todavía vivos (spec 33).
 */
export function pushOrder(records: SyncRecord[]): SyncRecord[] {
  const last = (r: SyncRecord) => r.collection === 'products' && r.deleted;
  return [...records.filter(r => !last(r)), ...records.filter(last)];
}

// ── Merge ────────────────────────────────────────────────────

function isRecordData(value: unknown, id: string): value is { id: string } {
  return typeof value === 'object' && value !== null && (value as { id?: unknown }).id === id;
}

function isCalculator(value: unknown): value is CalculatorState {
  return typeof value === 'object' && value !== null
    && typeof (value as CalculatorState).magnitude === 'string'
    && Array.isArray((value as CalculatorState).presentations);
}

/**
 * Junta filas bajadas con el estado local: gana la fila salvo que haya un pendiente local más nuevo del mismo
 * registro. Aplicar dos veces las mismas filas da lo mismo. Las colecciones sin cambios conservan su referencia.
 * No resuelve duplicados: después van `dedupeByEan` y `dedupeCart`.
 */
export function mergeRemote(data: SyncData, rows: RemoteRow[], outbox: SyncRecord[]): SyncData {
  if (rows.length === 0) return data;
  const pending = new Map(outbox.map(r => [recordKey(r), r.modifiedAt]));
  const lists: Record<ListKey, Map<string, { id: string }> | null> = { products: null, prices: null, cart: null, purchases: null };
  let calculator = data.calculator;

  for (const row of rows) {
    const local = pending.get(recordKey(row));
    if (local !== undefined && timeOf(local) > timeOf(row.modified_at)) continue;

    if (row.collection === 'settings') {
      if (row.id === CALCULATOR_RECORD_ID && !row.deleted && isCalculator(row.data)) calculator = row.data;
      continue;
    }
    if (!row.deleted && !isRecordData(row.data, row.id)) continue;

    const list = lists[row.collection] ??= new Map(data[row.collection].map(item => [item.id, item as { id: string }]));
    if (row.deleted) list.delete(row.id);
    else list.set(row.id, row.data as { id: string }); // Map.set conserva el lugar de un id existente
  }

  const merged: SyncData = { ...data, calculator };
  for (const collection of LISTS) {
    const list = lists[collection];
    if (list) (merged as unknown as Record<ListKey, unknown[]>)[collection] = [...list.values()];
  }
  if (lists.purchases) merged.purchases = [...merged.purchases].sort((a, b) => b.date.localeCompare(a.date));
  return merged;
}

// ── Productos eliminados que todavía se usan (spec 33) ───────

/** Borrados de productos de una bajada */
function deletedProductRows(rows: RemoteRow[]): RemoteRow[] {
  return rows.filter(r => r.collection === 'products' && r.deleted);
}

/** Productos que usa un precio propio (los de ejemplo no cuentan), el carrito o una compra */
function usedProductIds(data: SyncData): Set<string> {
  return new Set([
    ...data.prices.filter(p => !SAMPLE_PRICE_IDS.has(p.id)).map(p => p.productId),
    ...data.cart.map(i => i.productId),
    ...data.purchases.flatMap(purchase => purchase.items.map(i => i.productId)),
  ]);
}

/**
 * Restaura los productos que `rows` borró y que `merged` todavía usa: otro dispositivo eliminó uno sin saber que este
 * lo había usado. Vuelven como estaban en este dispositivo, sin la foto (ya se mandó a borrar del bucket). Va antes de
 * `dedupeByEan`. Sin ninguno devuelve el mismo estado.
 */
export function restoreUsedProducts(local: SyncData, merged: SyncData, rows: RemoteRow[]):
  { data: SyncData; restoredIds: string[] } {
  const deleted = new Set(deletedProductRows(rows).map(r => r.id));
  for (const p of merged.products) deleted.delete(p.id);
  if (deleted.size === 0) return { data: merged, restoredIds: [] };
  const used = usedProductIds(merged);
  const restored = local.products
    .filter(p => deleted.has(p.id) && used.has(p.id))
    .map(p => {
      const back = { ...p };
      delete back.photo;
      return back;
    });
  if (restored.length === 0) return { data: merged, restoredIds: [] };
  return { data: { ...merged, products: [...merged.products, ...restored] }, restoredIds: restored.map(p => p.id) };
}

/**
 * Fecha para encolar los restaurados: `now` o 1 ms después del borrado más nuevo, lo que sea mayor. Con una anterior al
 * borrado (un reloj atrasado), la base conservaría el borrado y se restaurarían en cada vuelta.
 */
export function restoreTime(restoredIds: string[], rows: RemoteRow[], now: string): string {
  const deletions = deletedProductRows(rows).filter(r => restoredIds.includes(r.id)).map(r => timeOf(r.modified_at));
  return new Date(Math.max(timeOf(now), ...deletions.map(t => t + 1))).toISOString();
}

// ── Duplicados ───────────────────────────────────────────────

/**
 * Dos productos propios con el mismo EAN (agregados en dos teléfonos sin señal): queda el de `id` menor, así todos
 * los dispositivos eligen el mismo, y lo que apuntaba al otro pasa a él. Sin duplicados devuelve el mismo estado.
 */
export function dedupeByEan(data: SyncData): SyncData {
  const keepByEan = new Map<string, string>();
  for (const p of data.products) {
    if (!p.ean) continue;
    const kept = keepByEan.get(p.ean);
    if (kept === undefined || p.id < kept) keepByEan.set(p.ean, p.id);
  }
  const replace = new Map<string, string>();
  for (const p of data.products) {
    const kept = p.ean ? keepByEan.get(p.ean) : undefined;
    if (kept !== undefined && kept !== p.id) replace.set(p.id, kept);
  }
  if (replace.size === 0) return data;

  const remap = <T extends { productId: string }>(item: T): T => {
    const to = replace.get(item.productId);
    return to === undefined ? item : { ...item, productId: to };
  };
  return {
    ...data,
    products: data.products.filter(p => !replace.has(p.id)),
    prices: data.prices.map(remap),
    cart: data.cart.map(remap),
    purchases: data.purchases.map(purchase => (
      purchase.items.some(i => replace.has(i.productId)) ? { ...purchase, items: purchase.items.map(remap) } : purchase
    )),
  };
}

/**
 * Un producto, un ítem en el carrito: entre ítems del mismo producto queda el modificado más tarde (`modifiedAt`
 * por id del ítem; sin fecha cuenta como el más viejo), con su cantidad, precio y comercio.
 */
export function dedupeCart(cart: CartItem[], modifiedAt: ReadonlyMap<string, string>): CartItem[] {
  const winner = new Map<string, CartItem>();
  for (const item of cart) {
    const current = winner.get(item.productId);
    if (!current || timeOf(modifiedAt.get(item.id)) > timeOf(modifiedAt.get(current.id))) winner.set(item.productId, item);
  }
  if (winner.size === cart.length) return cart;
  const kept = new Set(winner.values());
  return cart.filter(item => kept.has(item));
}

// ── Datos de ejemplo ─────────────────────────────────────────

/**
 * Sin los datos de ejemplo que nadie usó: los precios de ejemplo no suben, y un producto de ejemplo sube solo si lo
 * usa un precio propio, el carrito o una compra
 */
export function withoutSamples(data: SyncData): SyncData {
  const prices = data.prices.filter(p => !SAMPLE_PRICE_IDS.has(p.id));
  const used = usedProductIds(data);
  return { ...data, prices, products: data.products.filter(p => !SAMPLE_PRODUCT_IDS.has(p.id) || used.has(p.id)) };
}

/** Desde dónde bajar: el cursor menos el margen; sin cursor, todo */
export function pullSince(cursor: string | null): string | null {
  return cursor === null ? null : new Date(Date.parse(cursor) - PULL_OVERLAP_MS).toISOString();
}
