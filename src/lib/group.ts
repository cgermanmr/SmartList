import { displayName } from './auth';
import { formatDayMonth } from './format';
import { distanceKm, LatLng } from './geo';
import type { StoreRef } from './models';
import {
  OwnPriceVoteRow, ownVotesByPrice, PendingPrice, PriceValidation, priceValidation, PriceVote, Verdict, votesFromJson,
} from './price-validation';
import { SIZE_UNITS } from './product-form';
import { NO_BARRIO, storeKey } from './store';
import { supabase } from './supabase';

// ── Grupos y precios compartidos (spec 22) ───────────────────
// Un grupo a la vez por usuario. Los precios de los demás integrantes se consultan a la base a pedido
// (group_prices sobre user_records): no se copian ni se guardan en el teléfono.

export const GROUP_MAX_MEMBERS = 20;
export const GROUP_PRICE_DAYS = 60;
const GROUP_NAME_MAX = 40;
const NICKNAME_MAX = 30;

export type GroupRole = 'admin' | 'member';

export interface GroupMember {
  userId: string;
  nickname: string;
  role: GroupRole;
  joinedAt: string;
}

export interface Group {
  id: string;
  name: string;
  inviteCode: string;
  role: GroupRole;         // el del que consulta
  sharePrices: boolean;
  nickname: string;
  members: GroupMember[];
}

/** Precio de otro integrante del grupo */
export interface GroupPrice {
  ean: string;
  amount: number;
  date: string;       // ISO
  store: StoreRef;    // storeRef, o { name: store, barrio } si el precio es de antes de la spec 26
  member: string;     // apodo actual
  memberId: string;   // user_id: distingue a dos integrantes con el mismo apodo
  priceId: string;    // id del precio en user_records (spec 23)
  fingerprint: string;  // huella de lo que se vota (EAN, monto, fecha y comercio): vuelve a la base con el voto
  validation: PriceValidation;  // votos que cuentan y estado (spec 23)
}

export interface GroupNearPrice {
  price: GroupPrice;
  distanceKm: number;
}

// ── Funciones puras ──────────────────────────────────────────

/** Apodo sugerido: la primera palabra del nombre de Google o, si no hay, lo que está antes de la arroba */
export function defaultNickname(user: { email?: string; user_metadata?: Record<string, unknown> }): string {
  const first = displayName(user).split(/\s+/)[0] ?? '';
  return first.slice(0, NICKNAME_MAX);
}

function lengthBetween(text: string, max: number): boolean {
  const length = text.trim().length;
  return length >= 1 && length <= max;
}

export function validGroupName(text: string): boolean {
  return lengthBetween(text, GROUP_NAME_MAX);
}

export function validNickname(text: string): boolean {
  return lengthBetween(text, NICKNAME_MAX);
}

export function inviteUrl(origin: string, code: string): string {
  return `${origin}/grupo/unirse?c=${encodeURIComponent(code)}`;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_code: 'El link de invitación no es válido o cambió. Pedile uno nuevo a alguien del grupo.',
  group_full: `El grupo está completo (${GROUP_MAX_MEMBERS} integrantes).`,
  already_in_group: 'Ya estás en un grupo.',
  not_in_group: 'Ya no estás en el grupo.',
  not_admin: 'Solo quien administra el grupo puede hacer esto.',
  invalid_name: 'Revisá el nombre.',
  price_not_found: 'Ese precio ya no está en el grupo.',
  own_price: 'No podés validar tus propios precios.',
  invalid_amount: 'Revisá el monto.',
  price_changed: 'El precio cambió mientras lo mirabas. Revisalo y votá de nuevo.',
};

/** Mensaje para el código que levanta la base; cualquier otro error se toma como de conexión */
export function groupErrorMessage(code: string | undefined): string {
  return (code && ERROR_MESSAGES[code]) || 'No se pudo guardar. Revisá la conexión.';
}

/** El último de cada integrante en cada comercio (storeKey), por precio y, a igual precio, el más nuevo primero */
export function latestGroupPrices(prices: GroupPrice[]): GroupPrice[] {
  const latest = new Map<string, GroupPrice>();
  for (const price of prices) {
    const key = `${price.memberId}|${storeKey(price.store)}`;
    const current = latest.get(key);
    if (!current || new Date(price.date) > new Date(current.date)) latest.set(key, price);
  }
  return [...latest.values()].sort((a, b) =>
    a.amount - b.amount || new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** Los de un comercio con coordenadas dentro del radio, con su distancia; sin ubicación, ninguno */
export function groupPricesNear(prices: GroupPrice[], origin: LatLng | undefined, radiusKm: number | undefined):
  GroupNearPrice[] {
  if (!origin || radiusKm === undefined) return [];
  const near: GroupNearPrice[] = [];
  for (const price of prices) {
    const { lat, lng } = price.store;
    if (lat === undefined || lng === undefined) continue;
    const distance = distanceKm(origin, { lat, lng });
    if (distance <= radiusKm) near.push({ price, distanceKm: distance });
  }
  return near;
}

/** "Cargado por Ana · 12/11" */
export function groupPriceNote(price: GroupPrice): string {
  return `Cargado por ${price.member} · ${formatDayMonth(price.date)}`;
}

/** Fila de group_prices tal como llega de la base */
export interface GroupPriceRow {
  ean: string;
  amount: number;
  date: string;
  store: string | null;
  barrio: string | null;
  store_ref: unknown;
  member: string;
  member_id: string;
  price_id: string;
  product_name?: string | null;
  votes: unknown;     // jsonb: [{ voterId, member, verdict, amount, seen, at }] (spec 23)
  fingerprint: string;
}

/** Fila de pending_validations: la de group_prices con los datos del producto del autor */
export interface PendingPriceRow extends GroupPriceRow {
  brand: string | null;
  size: number | null;
  size_unit: string | null;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function coordinate(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * El precio de la app a partir de una fila: el comercio sale de storeRef o, en un precio de antes de la spec 26, de
 * store y barrio. Sin comercio no se puede mostrar en ninguna lista y queda afuera, igual que un monto que no es
 * positivo o una fecha que no se puede leer. Los datos son de otro integrante: solo se copian los campos conocidos
 */
export function groupPriceFromRow(row: GroupPriceRow): GroupPrice | null {
  if (!(row.amount > 0) || Number.isNaN(new Date(row.date).getTime())) return null;
  const ref = row.store_ref && typeof row.store_ref === 'object' ? row.store_ref as Record<string, unknown> : {};
  const fromRef = text(ref.name);
  const name = fromRef ?? text(row.store);
  if (!name) return null;
  const barrio = fromRef ? text(ref.barrio) : text(row.barrio);
  const address = fromRef ? text(ref.address) : undefined;
  const sepaId = fromRef ? text(ref.sepaId) : undefined;
  const chain = fromRef ? text(ref.chain) : undefined;
  const lat = fromRef ? coordinate(ref.lat) : undefined;
  const lng = fromRef ? coordinate(ref.lng) : undefined;
  const store: StoreRef = {
    name,
    ...(barrio && barrio !== NO_BARRIO ? { barrio } : {}),
    ...(address ? { address } : {}),
    ...(sepaId ? { sepaId } : {}),
    ...(chain ? { chain } : {}),
    ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
  };
  return {
    ean: row.ean, amount: row.amount, date: row.date, store, member: row.member, memberId: row.member_id,
    priceId: row.price_id, fingerprint: row.fingerprint, validation: priceValidation(votesFromJson(row.votes), row.amount),
  };
}

/** El precio por validar a partir de una fila: el de groupPriceFromRow con nombre, marca y presentación */
export function pendingPriceFromRow(row: PendingPriceRow): PendingPrice | null {
  const price = groupPriceFromRow(row);
  if (!price) return null;
  const brand = text(row.brand);
  const unit = SIZE_UNITS.find(u => u === row.size_unit);
  const size = typeof row.size === 'number' && row.size > 0 && unit ? row.size : undefined;
  return {
    ...price,
    productName: text(row.product_name) ?? '',
    ...(brand ? { brand } : {}),
    ...(size !== undefined && unit ? { size, sizeUnit: unit } : {}),
  };
}

// ── Llamadas a la base ───────────────────────────────────────
// Todas con .retry(false): sin conexión el error sale enseguida. Un error de la base llega con el código de la
// excepción como mensaje (invalid_code, group_full…): se muestra con groupErrorMessage(error.message).

function client() {
  if (!supabase) throw new Error('Supabase no está configurado');
  return supabase;
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(fn, args).retry(false);
  if (error) throw new Error(error.message);
  return data as T;
}

/** El grupo propio con sus integrantes, o null sin grupo */
export function fetchMyGroup(): Promise<Group | null> {
  return call<Group | null>('my_group');
}

export async function createGroup(name: string, nickname: string): Promise<void> {
  await call('create_group', { p_name: name.trim(), p_nickname: nickname.trim() });
  clearGroupPrices();
}

/** Nombre y cantidad de integrantes de una invitación, o null si el código no existe; también sin sesión */
export async function previewGroup(code: string): Promise<{ name: string; members: number } | null> {
  const rows = await call<{ name: string; members: number }[]>('group_preview', { p_code: code });
  return rows?.[0] ?? null;
}

/** Se une con el código; con leave, sale antes del grupo actual (en la misma transacción) */
export async function joinGroup(code: string, nickname: string, leave = false): Promise<void> {
  await call('join_group', { p_code: code, p_nickname: nickname.trim(), p_leave: leave });
  clearGroupPrices();
}

export async function renameGroup(name: string): Promise<void> {
  await call('rename_group', { p_name: name.trim() });
}

/** Código nuevo: el link anterior deja de servir */
export function regenerateInvite(): Promise<string> {
  return call<string>('regenerate_invite');
}

export async function removeMember(userId: string): Promise<void> {
  await call('remove_member', { p_user_id: userId });
  clearGroupPrices();
}

export async function setNickname(nickname: string): Promise<void> {
  await call('set_nickname', { p_nickname: nickname.trim() });
}

export async function setSharePrices(share: boolean): Promise<void> {
  await call('set_share_prices', { p_share: share });
  clearGroupPrices();
}

export async function leaveGroup(): Promise<void> {
  await call('leave_group');
  clearGroupPrices();
}

// ── Validación (spec 23) ─────────────────────────────────────
// Cada voto vuelve a pedir los precios del grupo (refreshGroupPrices): las pantallas abiertas muestran el estado nuevo.

/**
 * Vota un precio de otro integrante; con seen, "¿Cuánto viste?" (solo con 'no'). El monto lo toma la base, que rechaza
 * el voto (price_changed) si el precio ya no es el que se mostró: se vuelven a pedir los precios para verlo
 */
export async function votePrice(
  price: Pick<GroupPrice, 'memberId' | 'priceId' | 'fingerprint'>, verdict: Verdict, seen?: number,
): Promise<void> {
  try {
    await call('vote_price', {
      p_owner: price.memberId, p_price_id: price.priceId, p_fingerprint: price.fingerprint, p_verdict: verdict,
      p_seen: seen ?? null,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'price_changed') refreshGroupPrices();
    throw e;
  }
  refreshGroupPrices();
}

export async function unvotePrice(ownerId: string, priceId: string): Promise<void> {
  await call('unvote_price', { p_owner: ownerId, p_price_id: priceId });
  refreshGroupPrices();
}

/** Los precios de los demás de los últimos 14 días con sus votos (sin filtrar: lo hace pendingValidations) */
export async function fetchPendingValidations(): Promise<PendingPrice[]> {
  const rows = await call<PendingPriceRow[] | null>('pending_validations');
  return (rows ?? []).map(pendingPriceFromRow).filter((price): price is PendingPrice => price !== null);
}

const OWN_VOTES_MAX = 100;

/** Los votos sobre los precios propios de esos id (hasta 100), por id de precio */
export async function fetchOwnPriceVotes(priceIds: string[]): Promise<Map<string, PriceVote[]>> {
  const rows = await call<OwnPriceVoteRow[] | null>('my_price_votes',
    { p_price_ids: priceIds.slice(0, OWN_VOTES_MAX) });
  return ownVotesByPrice(rows ?? []);
}

// ── Precios del grupo: caché de 5 minutos ────────────────────
// Por EAN, como getSepaPrices: guarda la promesa (dos pantallas que piden el mismo EAN a la vez comparten la
// consulta) y también los "sin precios" ([]); un fallo no se guarda. Vence a los 5 minutos porque los precios del
// grupo cambian durante el día. clearGroupPrices la vacía y sube la versión, para que los hooks vuelvan a pedir.

const GROUP_PRICE_BATCH = 20;
const GROUP_PRICE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  at: number;
  prices: Promise<GroupPrice[]>;
}

const groupPriceCache = new Map<string, CacheEntry>();
let version = 0;
let epoch = 0;
const listeners = new Set<() => void>();

/** Vacía la caché: al crear, unirse, salir, sacar a alguien, pausar o reanudar, cerrar sesión y borrar la cuenta */
export function clearGroupPrices(): void {
  epoch += 1;
  refreshGroupPrices();
}

/**
 * Vuelve a pedir los precios después de votar: lo que ya se ve sirve hasta que llega la respuesta. Si la pantalla lo
 * descartara, se perderían "¿Cuánto viste?" y el aviso de un precio que cambió
 */
export function refreshGroupPrices(): void {
  groupPriceCache.clear();
  version += 1;
  for (const listener of listeners) listener();
}

/** Cambia cada vez que hay que volver a pedir los precios (para useSyncExternalStore) */
export function groupPricesVersion(): number {
  return version;
}

/** Cambia solo con clearGroupPrices: lo que se respondió antes ya no se puede mostrar */
export function groupPricesEpoch(): number {
  return epoch;
}

export function subscribeGroupPrices(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Precios del grupo de varios EAN (todos, sin filtrar por comercio): una consulta de a 20 con los que faltan. La caché
 * va por cuenta + EAN: si la sesión vence y entra otra cuenta sin cerrar sesión, no ve lo que se le respondió a la otra
 */
export async function getGroupPrices(userId: string, eans: string[]): Promise<Map<string, GroupPrice[]>> {
  if (!supabase) return new Map();
  const now = Date.now();
  const unique = [...new Set(eans)];
  const keyOf = (ean: string) => `${userId}|${ean}`;
  const missing = unique.filter(ean => {
    const entry = groupPriceCache.get(keyOf(ean));
    return !entry || now - entry.at > GROUP_PRICE_TTL_MS;
  });

  for (let i = 0; i < missing.length; i += GROUP_PRICE_BATCH) {
    const batch = missing.slice(i, i + GROUP_PRICE_BATCH);
    const request = fetchGroupPrices(batch);
    for (const ean of batch) {
      const key = keyOf(ean);
      const entry: CacheEntry = { at: now, prices: request.then(byEan => byEan.get(ean) ?? []) };
      groupPriceCache.set(key, entry);
      entry.prices.catch(() => {
        if (groupPriceCache.get(key) === entry) groupPriceCache.delete(key);
      });
    }
  }

  const entries = await Promise.all(
    unique.map(async ean => [ean, await groupPriceCache.get(keyOf(ean))!.prices] as const));
  return new Map(entries);
}

async function fetchGroupPrices(eans: string[]): Promise<Map<string, GroupPrice[]>> {
  const rows = await call<GroupPriceRow[] | null>('group_prices', { p_eans: eans });
  const byEan = new Map<string, GroupPrice[]>();
  for (const row of rows ?? []) {
    const price = groupPriceFromRow(row);
    if (price) byEan.set(price.ean, [...(byEan.get(price.ean) ?? []), price]);
  }
  return byEan;
}
