// Gasto mensual a partir de las compras (spec 03). Funciones puras, sin React

import { Purchase } from './models';
import { paymentLabel } from './payment-methods';

export interface MonthSummary {
  month: string;           // 'YYYY-MM'
  total: number;           // suma de Purchase.total
  count: number;           // cantidad de compras
  average: number | null;  // total / count; null si count = 0
}

export interface MonthTotal {
  month: string;           // 'YYYY-MM'
  total: number;           // 0 si no hubo compras
  count: number;
}

export interface Breakdown {
  key: string;             // clave de agrupación (estable para React)
  label: string;           // cadena, comercio o medio de pago
  amount: number;
  percent: number;         // amount / total del mes × 100
}

export const NO_STORE = 'Sin comercio';

// ── Meses ─────────────────────────────────────────────────

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

/** 'YYYY-MM' de una fecha según la hora local del dispositivo */
export function monthKey(date: Date | string): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Mes calendario anterior: '2026-01' → '2025-12' */
export function previousMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  return index === 1 ? `${year - 1}-12` : `${year}-${String(index - 1).padStart(2, '0')}`;
}

/** Compras del mes, de la más reciente a la más vieja */
function purchasesOf(purchases: Purchase[], month: string): Purchase[] {
  return purchases
    .filter(p => monthKey(p.date) === month)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** Meses con al menos una compra más `current`, del más viejo al más nuevo, sin repetidos */
export function availableMonths(purchases: Purchase[], current: string): string[] {
  const months = new Set([current]);
  for (const p of purchases) {
    const month = monthKey(p.date);
    if (MONTH_PATTERN.test(month)) months.add(month);
  }
  return [...months].sort();
}

export function monthSummary(purchases: Purchase[], month: string): MonthSummary {
  const list = purchasesOf(purchases, month);
  const total = list.reduce((sum, p) => sum + p.total, 0);
  return { month, total, count: list.length, average: list.length > 0 ? total / list.length : null };
}

/** `n` meses calendario terminando en `month`, del más viejo al más nuevo, con los que dan 0 */
export function lastMonthsTotals(purchases: Purchase[], month: string, n: number): MonthTotal[] {
  const months = [month];
  while (months.length < n) months.unshift(previousMonth(months[0]));
  return months.map(m => {
    const { total, count } = monthSummary(purchases, m);
    return { month: m, total, count };
  });
}

/** Variación % contra el mes calendario anterior; null si alguno de los dos meses no tiene compras */
export function monthVariation(purchases: Purchase[], month: string): number | null {
  const current = monthSummary(purchases, month);
  const previous = monthSummary(purchases, previousMonth(month));
  if (current.count === 0 || previous.count === 0 || previous.total === 0) return null;
  return ((current.total - previous.total) / previous.total) * 100;
}

// ── Desgloses ─────────────────────────────────────────────

interface Group {
  key: string;
  label: string;
  amount: number;
}

/** Ordena por monto de mayor a menor y, a igual monto, por nombre; agrega el % del total del mes */
function toBreakdown(groups: Iterable<Group>): Breakdown[] {
  const list = [...groups];
  const total = list.reduce((sum, g) => sum + g.amount, 0);
  return list
    .map(g => ({ ...g, percent: total > 0 ? (g.amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, 'es-AR'));
}

/** Mayúsculas y espacios de más no cuentan (la misma normalización que storeKey) */
function normalizeName(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Cadena de una compra de antes de la spec 03 (sin `chain`): el texto anterior a ' — ', o el nombre entero */
function chainFromName(name: string): string {
  const cut = name.indexOf(' — ');
  return (cut >= 0 ? name.slice(0, cut) : name).trim();
}

/**
 * Gasto del mes por cadena o comercio. Cada compra entra entera en una fila:
 * 1. con `sepaId` en algún ítem, su cadena (bandera: '10-1-123' → 'sepa:10-1'), con el nombre de `chain`
 * 2. si no, `Purchase.store` sin mayúsculas ni espacios de más, con el nombre de la compra más reciente
 * 3. sin comercio, "Sin comercio"
 */
export function byStore(purchases: Purchase[], month: string): Breakdown[] {
  const groups = new Map<string, Group & { chain?: string; fallback?: string }>();
  // De la más reciente a la más vieja: el primer nombre que se encuentra es el de la compra más reciente
  for (const purchase of purchasesOf(purchases, month)) {
    const sepaStore = purchase.items.find(item => item.store?.sepaId)?.store;
    const storeName = purchase.store?.trim() ?? '';

    let key: string;
    let label: string;
    let chain: string | undefined;
    let fallback: string | undefined;
    if (sepaStore?.sepaId) {
      key = `sepa:${sepaStore.sepaId.split('-').slice(0, 2).join('-')}`;
      chain = purchase.items.find(item => item.store?.chain)?.store?.chain?.trim() || undefined;
      fallback = chainFromName(storeName || sepaStore.name);
      label = '';
    } else if (storeName) {
      key = `name:${normalizeName(storeName)}`;
      label = storeName;
    } else {
      key = 'none';
      label = NO_STORE;
    }

    const group = groups.get(key);
    if (group) {
      group.amount += purchase.total;
      group.chain ??= chain;
    } else {
      groups.set(key, { key, label, amount: purchase.total, chain, fallback });
    }
  }

  return toBreakdown([...groups.values()].map(({ key, label, amount, chain, fallback }) => ({
    key,
    label: key.startsWith('sepa:') ? chain || fallback || NO_STORE : label,
    amount,
  })));
}

/** Gasto del mes por medio de pago; el id de la versión Angular y el label actual son la misma fila */
export function byPayment(purchases: Purchase[], month: string): Breakdown[] {
  const groups = new Map<string, Group>();
  for (const purchase of purchasesOf(purchases, month)) {
    const label = paymentLabel(purchase.paymentMethod);
    const group = groups.get(label);
    if (group) group.amount += purchase.total;
    else groups.set(label, { key: label, label, amount: purchase.total });
  }
  return toBreakdown(groups.values());
}
