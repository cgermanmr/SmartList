import { describe, expect, it } from 'vitest';
import { Presentation, Promo, Unit } from './models';
import { compare, lotOf, toBaseQuantity, unitPrice } from './unit-price';

const NO_PROMO: Promo = { type: 'ninguna', take: null, pay: null, nth: null, percent: null };

function presentation(id: string, price: number | null, quantity: number | null, unit: Unit, promo: Partial<Promo> = {}): Presentation {
  return { id, label: '', price, quantity, unit, promo: { ...NO_PROMO, ...promo } };
}

describe('toBaseQuantity', () => {
  it('pasa gramos y mililitros a kg y litros', () => {
    expect(toBaseQuantity(500, 'g')).toBe(0.5);
    expect(toBaseQuantity(1500, 'ml')).toBe(1.5);
  });

  it('deja igual kg, l y unidades', () => {
    expect(toBaseQuantity(2, 'kg')).toBe(2);
    expect(toBaseQuantity(3, 'l')).toBe(3);
    expect(toBaseQuantity(6, 'u')).toBe(6);
  });
});

describe('lotOf', () => {
  it('sin promoción: una unidad al precio de lista', () => {
    expect(lotOf(100, NO_PROMO)).toEqual({ units: 1, total: 100 });
  });

  it('3x2: se llevan 3 y se pagan 2', () => {
    expect(lotOf(100, { ...NO_PROMO, type: 'nxm', take: 3, pay: 2 })).toEqual({ units: 3, total: 200 });
  });

  it('70% en la 2da: la segunda cuesta el 30%', () => {
    const lot = lotOf(100, { ...NO_PROMO, type: 'enesima', nth: 2, percent: 70 });
    expect(lot?.units).toBe(2);
    expect(lot?.total).toBeCloseTo(130);
  });

  it('descuento directo', () => {
    expect(lotOf(100, { ...NO_PROMO, type: 'descuento', percent: 20 })).toEqual({ units: 1, total: 80 });
  });

  it('promos inválidas devuelven null', () => {
    expect(lotOf(100, { ...NO_PROMO, type: 'nxm', take: 2, pay: 2 })).toBeNull();
    expect(lotOf(100, { ...NO_PROMO, type: 'nxm', take: 2.5, pay: 1 })).toBeNull();
    expect(lotOf(100, { ...NO_PROMO, type: 'enesima', nth: 1, percent: 50 })).toBeNull();
    expect(lotOf(100, { ...NO_PROMO, type: 'enesima', nth: 2, percent: 101 })).toBeNull();
    expect(lotOf(100, { ...NO_PROMO, type: 'descuento', percent: 100 })).toBeNull();
    expect(lotOf(100, { ...NO_PROMO, type: 'descuento', percent: null })).toBeNull();
  });
});

describe('unitPrice', () => {
  it('normaliza a $/kg', () => {
    expect(unitPrice(presentation('a', 500, 500, 'g'))).toBe(1000);
  });

  it('aplica la promo sobre el lote completo', () => {
    expect(unitPrice(presentation('a', 300, 1, 'l', { type: 'nxm', take: 3, pay: 2 }))).toBe(200);
  });

  it('null con datos incompletos o no positivos', () => {
    expect(unitPrice(presentation('a', null, 1, 'kg'))).toBeNull();
    expect(unitPrice(presentation('a', 100, 0, 'kg'))).toBeNull();
    expect(unitPrice(presentation('a', -1, 1, 'kg'))).toBeNull();
  });
});

describe('compare', () => {
  it('marca la más barata y el % de diferencia de las demás', () => {
    const [a, b] = compare([presentation('a', 1000, 1, 'kg'), presentation('b', 600, 500, 'g')]);
    expect(a.isBest).toBe(true);
    expect(a.diffPercent).toBeNull();
    expect(b.isBest).toBe(false);
    expect(b.diffPercent).toBeCloseTo(20);
  });

  it('todas las empatadas son ganadoras', () => {
    const results = compare([presentation('a', 1000, 1, 'kg'), presentation('b', 500, 500, 'g')]);
    expect(results.every(r => r.isBest)).toBe(true);
  });

  it('sin ganador si hay menos de 2 válidas', () => {
    const results = compare([presentation('a', 1000, 1, 'kg'), presentation('b', null, null, 'g')]);
    expect(results.some(r => r.isBest)).toBe(false);
    expect(results[1].unitPrice).toBeNull();
  });

  it('informa las unidades del lote', () => {
    const [r] = compare([presentation('a', 100, 1, 'u', { type: 'nxm', take: 3, pay: 2 }), presentation('b', 100, 1, 'u')]);
    expect(r.lotUnits).toBe(3);
  });
});
