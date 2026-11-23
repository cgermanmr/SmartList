import { formatDayMonth, formatMoney } from './format';
import { formatDistance } from './geo';
import type { GroupNearPrice } from './group';
import { NearbyPrice, referenceLabel, referenceStatus, ReferenceStatus, vsReference } from './sepa';

// ── ¿Cuánto sale acá? (spec 24) ──────────────────────────────
// Compara el precio de la góndola contra el más barato de los comercios cercanos (o, si no hay, contra la
// referencia de Precios Claros) y contra lo que se pagó la última vez. No guarda nada.

export type ShelfTone = 'good' | 'same' | 'bad';

export interface ShelfLine {
  text: string;
  tone: ShelfTone;
}

export interface ShelfInput {
  /** Precio de la góndola */
  price: number;
  /** Precios en los comercios cercanos, ya ordenados (sortNearbyPrices); vacío o sin dato → la referencia */
  nearby?: NearbyPrice[];
  /** Precios del grupo dentro del radio, con su distancia (spec 22, groupPricesNear); en cualquier orden */
  group?: GroupNearPrice[];
  /** La ubicación es una localidad elegida a mano: la distancia lleva "aprox." */
  approx?: boolean;
  /** Promedio de referencia de Precios Claros (spec 12) */
  reference?: number;
  /** Último precio propio del producto */
  last?: { amount: number; date: Date | string };
}

const REFERENCE_TONE: Record<ReferenceStatus, ShelfTone> = { below: 'good', inline: 'same', above: 'bad' };

/** Diferencia en centavos, para que 3890,001 y 3890 cuenten como iguales */
function centsDiff(a: number, b: number): number {
  return Math.round(a * 100) - Math.round(b * 100);
}

interface Cheapest {
  price: number;
  distanceKm: number;
  /** La cadena o, si es del grupo, el nombre del comercio */
  name: string;
  /** " (Ana · 12/11)" si es del grupo */
  who: string;
}

/** El más barato cercano entre Precios Claros (ya ordenados) y el grupo; a igual precio, el más cerca */
function cheapestNear(nearby: NearbyPrice[] | undefined, group: GroupNearPrice[] | undefined): Cheapest | undefined {
  const options: Cheapest[] = [];
  const branch = nearby?.[0];
  if (branch) options.push({ price: branch.price, distanceKm: branch.distanceKm, name: branch.branch.chain, who: '' });
  for (const { price, distanceKm } of group ?? []) {
    options.push({
      price: price.amount, distanceKm, name: price.store.name, who: ` (${price.member} · ${formatDayMonth(price.date)})`,
    });
  }
  return options.reduce<Cheapest | undefined>((best, option) => {
    if (!best) return option;
    const diff = centsDiff(option.price, best.price);
    return diff < 0 || (diff === 0 && option.distanceKm < best.distanceKm) ? option : best;
  }, undefined);
}

/**
 * Líneas de "¿Cuánto sale acá?": primero contra el más barato cercano, de Precios Claros o del grupo (o la
 * referencia, si no hay cercanos con precio) y después contra el último precio propio. Sin monto válido o sin nada
 * contra qué comparar, [].
 */
export function shelfComparison({ price, nearby, group, approx = false, reference, last }: ShelfInput): ShelfLine[] {
  if (!Number.isFinite(price) || price <= 0) return [];
  const lines: ShelfLine[] = [];

  const best = cheapestNear(nearby, group);
  if (best) {
    const diff = centsDiff(price, best.price);
    const where = `${best.name} — ${approx ? 'aprox. ' : ''}${formatDistance(best.distanceKm)}`;
    if (diff < 0) lines.push({ text: 'Más barato que en los comercios cerca', tone: 'good' });
    else if (diff === 0) lines.push({ text: `Igual que en ${where}${best.who}`, tone: 'same' });
    else lines.push({ text: `En ${where} sale $${formatMoney(diff / 100)} menos${best.who}`, tone: 'bad' });
  } else if (reference !== undefined && reference > 0) {
    const pct = vsReference(price, reference);
    lines.push({ text: referenceLabel(pct), tone: REFERENCE_TONE[referenceStatus(pct)] });
  }

  if (last) {
    const diff = centsDiff(price, last.amount);
    const day = formatDayMonth(last.date);
    if (diff === 0) {
      lines.push({ text: `La última vez pagaste lo mismo (${day})`, tone: 'same' });
    } else {
      const paid = `La última vez pagaste $${formatMoney(last.amount)} (${day})`;
      lines.push(diff > 0
        ? { text: `${paid}: $${formatMoney(diff / 100)} más`, tone: 'bad' }
        : { text: `${paid}: $${formatMoney(-diff / 100)} menos`, tone: 'good' });
    }
  }

  return lines;
}
