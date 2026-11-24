import { formatMoney } from './format';
import type { GroupPrice } from './group';
import type { Unit } from './models';
import { centsDiff } from './shelf-price';
import { storeKey } from './store';

// ── Validación de precios del grupo (spec 23) ────────────────
// Los integrantes dicen "Está bien" o "No coincide" a los precios de los demás. Cada voto guarda el monto votado: solo
// cuentan los votos sobre el monto actual del precio. El estado se calcula acá, no se guarda en la base.

export const VALIDATION_DAYS = 14;
const MIN_VOTES = 2;

export type Verdict = 'ok' | 'no';
export type ValidationStatus = 'validado' | 'dudoso' | 'sin_validar';

export interface PriceVote {
  voterId: string;
  member: string;      // apodo actual
  verdict: Verdict;
  amount: number;      // monto votado
  seen?: number;       // "¿Cuánto viste?"
  at: string;          // ISO
}

export interface PriceValidation {
  status: ValidationStatus;
  votes: PriceVote[];  // solo los que cuentan (monto votado = monto actual), en orden de voto
}

/** Precio por validar de otro integrante */
export interface PendingPrice extends GroupPrice {
  productName: string;
  brand?: string;
  size?: number;
  sizeUnit?: Unit;
}

// ── Estado ───────────────────────────────────────────────────

/**
 * Estado con los votos sobre el monto actual (en centavos): Validado con 2 o más ok y más ok que no; Dudoso con 2 o
 * más no y al menos tantos no como ok (el empate va a Dudoso); si no, sin validar
 */
export function priceValidation(votes: PriceVote[], amount: number): PriceValidation {
  const counted = votes
    .filter(vote => centsDiff(vote.amount, amount) === 0)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const ok = counted.filter(vote => vote.verdict === 'ok').length;
  const no = counted.length - ok;
  const status: ValidationStatus = ok >= MIN_VOTES && ok > no ? 'validado'
    : no >= MIN_VOTES && no >= ok ? 'dudoso'
      : 'sin_validar';
  return { status, votes: counted };
}

/** El voto propio que cuenta, si hay */
export function myVote(validation: PriceValidation, myUserId: string): PriceVote | undefined {
  return validation.votes.find(vote => vote.voterId === myUserId);
}

// ── Resumen ──────────────────────────────────────────────────

/** "Ana", "Ana y Lucía", "Ana, Lucía y Pedro" */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

function voterName(vote: PriceVote, myUserId: string): string {
  const name = vote.voterId === myUserId ? 'vos' : vote.member;
  return vote.verdict === 'no' && vote.seen !== undefined ? `${name} ($${formatMoney(vote.seen)})` : name;
}

/**
 * "Validado por Ana y Lucía", "No coincide para Lucía ($3.400,00) y Pedro", "Está bien para Ana · No coincide para
 * Pedro"; el voto propio es "vos". Primero el lado que decide el estado y después, si hay, el otro. '' sin votos
 */
export function validationSummary(validation: PriceValidation, myUserId: string): string {
  const names = (verdict: Verdict) =>
    joinNames(validation.votes.filter(vote => vote.verdict === verdict).map(vote => voterName(vote, myUserId)));
  const ok = names('ok');
  const no = names('no');
  const okPart = ok && (validation.status === 'validado' ? `Validado por ${ok}` : `Está bien para ${ok}`);
  const noPart = no && `No coincide para ${no}`;
  const parts = validation.status === 'dudoso' ? [noPart, okPart] : [okPart, noPart];
  return parts.filter(Boolean).join(' · ');
}

// ── Por validar ──────────────────────────────────────────────

/**
 * El último de cada integrante en cada comercio (storeKey) para cada producto, sin los propios, sin los que ya voté
 * sobre el monto actual y sin los validados; del más nuevo al más viejo. Un dudoso que no voté sigue
 */
export function pendingValidations(prices: PendingPrice[], myUserId: string): PendingPrice[] {
  const latest = new Map<string, PendingPrice>();
  for (const price of prices) {
    if (price.memberId === myUserId) continue;
    const key = `${price.ean}|${price.memberId}|${storeKey(price.store)}`;
    const current = latest.get(key);
    if (!current || new Date(price.date) > new Date(current.date)) latest.set(key, price);
  }
  return [...latest.values()]
    .filter(price => price.validation.status !== 'validado' && !myVote(price.validation, myUserId))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ── Votos que llegan de la base ──────────────────────────────

function voteFrom(value: unknown): PriceVote | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const { voterId, member, verdict, amount, seen, at } = v;
  if (typeof voterId !== 'string' || typeof member !== 'string' || typeof at !== 'string') return null;
  if ((verdict !== 'ok' && verdict !== 'no') || typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  return {
    voterId, member, verdict, amount, at,
    ...(verdict === 'no' && typeof seen === 'number' && seen > 0 ? { seen } : {}),
  };
}

/** Los votos de la columna votes (jsonb) de group_prices y pending_validations; solo los campos conocidos */
export function votesFromJson(value: unknown): PriceVote[] {
  if (!Array.isArray(value)) return [];
  return value.map(voteFrom).filter((vote): vote is PriceVote => vote !== null);
}

/** Fila de my_price_votes tal como llega de la base */
export interface OwnPriceVoteRow {
  price_id: string;
  voter_id: string;
  member: string;
  verdict: string;
  amount: number;
  seen: number | null;
  at: string;
}

/** Los votos de my_price_votes agrupados por id de precio */
export function ownVotesByPrice(rows: OwnPriceVoteRow[]): Map<string, PriceVote[]> {
  const byPrice = new Map<string, PriceVote[]>();
  for (const row of rows) {
    const vote = voteFrom({
      voterId: row.voter_id, member: row.member, verdict: row.verdict, amount: row.amount, seen: row.seen, at: row.at,
    });
    if (vote) byPrice.set(row.price_id, [...(byPrice.get(row.price_id) ?? []), vote]);
  }
  return byPrice;
}
