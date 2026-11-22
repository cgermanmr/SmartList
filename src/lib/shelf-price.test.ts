import { describe, expect, it } from 'vitest';
import type { NearbyPrice } from './sepa';
import { shelfComparison } from './shelf-price';

function near(price: number, chain = 'Día', distanceKm = 0.6, id = '1-1-1'): NearbyPrice {
  return {
    ean: '7790387000016',
    price,
    distanceKm,
    branch: {
      id, chain, name: `${chain} — Primera Junta`, address: null, barrio: null, localidad: null, provincia: 'AR-C',
      lat: -34.6, lng: -58.4, updated: '2026-11-20',
    },
  };
}

// ── Contra los comercios cercanos ───────────────────────────
describe('shelfComparison · comercios cercanos', () => {
  const nearby = [near(3890), near(4050, 'Coto', 0.8, '2-1-1')];

  it('menor que el más barato cercano', () => {
    expect(shelfComparison({ price: 3500, nearby })).toEqual([
      { text: 'Más barato que en los comercios cerca', tone: 'good' },
    ]);
  });

  it('igual al más barato cercano', () => {
    expect(shelfComparison({ price: 3890, nearby })).toEqual([
      { text: 'Igual que en Día — 600 m', tone: 'same' },
    ]);
  });

  it('mayor que el más barato cercano', () => {
    expect(shelfComparison({ price: 4300, nearby })).toEqual([
      { text: 'En Día — 600 m sale $410,00 menos', tone: 'bad' },
    ]);
  });

  it('con localidad la distancia lleva "aprox."', () => {
    expect(shelfComparison({ price: 4300, nearby, approx: true })[0].text)
      .toBe('En Día — aprox. 600 m sale $410,00 menos');
    expect(shelfComparison({ price: 3890, nearby, approx: true })[0].text).toBe('Igual que en Día — aprox. 600 m');
  });

  it('con cercanos no compara contra la referencia', () => {
    expect(shelfComparison({ price: 4300, nearby, reference: 5000 })).toHaveLength(1);
  });

  it('compara en centavos: 3890,001 es igual a 3890', () => {
    expect(shelfComparison({ price: 3890.001, nearby })[0].tone).toBe('same');
  });
});

// ── Contra la referencia ────────────────────────────────────
describe('shelfComparison · referencia', () => {
  it('sin cercanos con precio, por debajo de la referencia', () => {
    expect(shelfComparison({ price: 900, nearby: [], reference: 1000 })).toEqual([
      { text: '10 % por debajo de la referencia', tone: 'good' },
    ]);
  });

  it('en línea con la referencia', () => {
    expect(shelfComparison({ price: 1030, reference: 1000 })).toEqual([
      { text: 'En línea con la referencia', tone: 'same' },
    ]);
  });

  it('por encima de la referencia', () => {
    expect(shelfComparison({ price: 1200, reference: 1000 })).toEqual([
      { text: '20 % por encima de la referencia', tone: 'bad' },
    ]);
  });

  it('una referencia de 0 no compara', () => {
    expect(shelfComparison({ price: 1200, reference: 0 })).toEqual([]);
  });
});

// ── Contra el último precio propio ──────────────────────────
describe('shelfComparison · último precio', () => {
  const last = { amount: 4200, date: new Date(2026, 10, 12, 10, 0) };

  it('más que la última vez', () => {
    expect(shelfComparison({ price: 4300, last })).toEqual([
      { text: 'La última vez pagaste $4.200,00 (12/11): $100,00 más', tone: 'bad' },
    ]);
  });

  it('menos que la última vez', () => {
    expect(shelfComparison({ price: 4000, last })).toEqual([
      { text: 'La última vez pagaste $4.200,00 (12/11): $200,00 menos', tone: 'good' },
    ]);
  });

  it('igual que la última vez', () => {
    expect(shelfComparison({ price: 4200, last })).toEqual([
      { text: 'La última vez pagaste lo mismo (12/11)', tone: 'same' },
    ]);
  });

  it('acepta la fecha como string (localStorage)', () => {
    expect(shelfComparison({ price: 4200, last: { amount: 4200, date: last.date.toISOString() } })[0].text)
      .toBe('La última vez pagaste lo mismo (12/11)');
  });

  it('va después de la comparación con los cercanos', () => {
    const lines = shelfComparison({ price: 4300, nearby: [near(3890)], last });
    expect(lines.map(l => l.tone)).toEqual(['bad', 'bad']);
    expect(lines[1].text).toMatch(/^La última vez/);
  });
});

// ── Sin comparación ─────────────────────────────────────────
describe('shelfComparison · sin líneas', () => {
  it('sin nada contra qué comparar', () => {
    expect(shelfComparison({ price: 4300 })).toEqual([]);
    expect(shelfComparison({ price: 4300, nearby: [] })).toEqual([]);
  });

  it('monto 0, negativo o no numérico', () => {
    const input = { nearby: [near(3890)], reference: 1000, last: { amount: 4200, date: new Date() } };
    expect(shelfComparison({ ...input, price: 0 })).toEqual([]);
    expect(shelfComparison({ ...input, price: -5 })).toEqual([]);
    expect(shelfComparison({ ...input, price: NaN })).toEqual([]);
  });
});
