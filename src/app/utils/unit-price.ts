import { Magnitude, Presentation, Promo, Unit } from '../models/product';

export interface PresentationResult {
  id: string;
  unitPrice: number | null;   // null si la presentación tiene datos incompletos o inválidos
  lotUnits: number;           // unidades que exige la promo (1 si no hay lote)
  isBest: boolean;            // true para todas las empatadas en el mínimo
  diffPercent: number | null; // % por encima de la más barata; null si es la mejor o es inválida
}

export interface Lot {
  units: number;
  total: number;
}

export const UNITS_BY_MAGNITUDE: Record<Magnitude, Unit[]> = {
  peso:     ['g', 'kg'],
  volumen:  ['ml', 'l'],
  unidades: ['u'],
};

export const DEFAULT_UNIT: Record<Magnitude, Unit> = {
  peso:     'g',
  volumen:  'ml',
  unidades: 'u',
};

// Tolerancia relativa para considerar empatados dos precios unitarios
const TIE_TOLERANCE = 1e-9;

function isPositive(n: number | null): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

// ── Conversión ────────────────────────────────────────────
/** Pasa la cantidad a kg, l o u */
export function toBaseQuantity(quantity: number, unit: Unit): number {
  return unit === 'g' || unit === 'ml' ? quantity / 1000 : quantity;
}

// ── Promociones ───────────────────────────────────────────
/** Unidades y total del lote que exige la promo; null si la promo es inválida */
export function lotOf(price: number, promo: Promo): Lot | null {
  const { take, pay, nth, percent } = promo;
  switch (promo.type) {
    case 'ninguna':
      return { units: 1, total: price };
    case 'nxm':
      if (!Number.isInteger(take) || !Number.isInteger(pay)) return null;
      if (!(take! > pay! && pay! >= 1)) return null;
      return { units: take!, total: price * pay! };
    case 'enesima':
      if (!Number.isInteger(nth) || nth! < 2) return null;
      if (!isPositive(percent) || percent > 100) return null;
      return { units: nth!, total: price * (nth! - 1) + price * (1 - percent / 100) };
    case 'descuento':
      if (!isPositive(percent) || percent >= 100) return null;
      return { units: 1, total: price * (1 - percent / 100) };
  }
}

// ── Precio unitario ───────────────────────────────────────
/** Precio por kg, l o u; null si faltan datos o son inválidos */
export function unitPrice(p: Presentation): number | null {
  if (!isPositive(p.price) || !isPositive(p.quantity)) return null;
  const lot = lotOf(p.price, p.promo);
  if (!lot) return null;
  return lot.total / (lot.units * toBaseQuantity(p.quantity, p.unit));
}

// ── Comparación ───────────────────────────────────────────
export function compare(presentations: Presentation[]): PresentationResult[] {
  const evaluated = presentations.map(p => {
    const value = unitPrice(p);
    const lot = value !== null ? lotOf(p.price as number, p.promo) : null;
    return { id: p.id, value, lotUnits: lot?.units ?? 1 };
  });

  // Hay ganador solo si compiten al menos 2 presentaciones válidas
  const valid = evaluated.map(e => e.value).filter((v): v is number => v !== null);
  const min = valid.length >= 2 ? Math.min(...valid) : null;

  return evaluated.map(({ id, value, lotUnits }) => {
    const isBest = min !== null && value !== null && value - min <= min * TIE_TOLERANCE;
    const diffPercent = min !== null && value !== null && !isBest
      ? (value - min) / min * 100
      : null;
    return { id, unitPrice: value, lotUnits, isBest, diffPercent };
  });
}
