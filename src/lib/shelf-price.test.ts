import { describe, expect, it } from 'vitest';
import type { GroupNearPrice } from './group';
import type { ValidationStatus } from './price-validation';
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
// ── Con precios del grupo (spec 22) ─────────────────────────
function mate(amount: number, distanceKm = 0.25, store = 'Almacén Don Luis', status: ValidationStatus = 'sin_validar'):
  GroupNearPrice {
  return {
    price: {
      ean: '7790387000016', amount, date: '2026-11-12T15:00:00.000Z', store: { name: store, lat: -34.6, lng: -58.4 },
      member: 'Ana', memberId: 'u2', priceId: 'p1', fingerprint: 'f1', validation: { status, votes: [] },
    },
    distanceKm,
  };
}

describe('shelfComparison · precios del grupo', () => {
  const nearby = [near(3890), near(4050, 'Coto', 0.8, '2-1-1')];

  it('el del grupo es el más barato: la línea suma quién y cuándo', () => {
    expect(shelfComparison({ price: 4300, nearby, group: [mate(3200)] })).toEqual([
      { text: 'En Almacén Don Luis — 250 m sale $1.100,00 menos (Ana · 12/11)', tone: 'bad' },
    ]);
  });

  it('igual al del grupo', () => {
    expect(shelfComparison({ price: 3200, nearby, group: [mate(3200)] })).toEqual([
      { text: 'Igual que en Almacén Don Luis — 250 m (Ana · 12/11)', tone: 'same' },
    ]);
  });

  it('más barato que todos, sin cambios', () => {
    expect(shelfComparison({ price: 3000, nearby, group: [mate(3200)] })).toEqual([
      { text: 'Más barato que en los comercios cerca', tone: 'good' },
    ]);
  });

  it('del grupo, el más barato y, a igual precio, el más cerca', () => {
    const group = [mate(3500, 1.2, 'Lejos'), mate(3300, 0.9, 'Kiosco'), mate(3300, 0.4, 'Cerca')];
    expect(shelfComparison({ price: 3400, group })[0].text).toBe('En Cerca — 400 m sale $100,00 menos (Ana · 12/11)');
  });

  it('a igual precio entre Precios Claros y el grupo, el más cerca', () => {
    expect(shelfComparison({ price: 4000, nearby, group: [mate(3890, 0.2)] })[0].text)
      .toBe('En Almacén Don Luis — 200 m sale $110,00 menos (Ana · 12/11)');
    expect(shelfComparison({ price: 4000, nearby, group: [mate(3890, 0.9)] })[0].text)
      .toBe('En Día — 600 m sale $110,00 menos');
  });

  it('solo del grupo, sin Precios Claros cerca, no compara contra la referencia', () => {
    expect(shelfComparison({ price: 3000, group: [mate(3200)], reference: 3500 })).toEqual([
      { text: 'Más barato que en los comercios cerca', tone: 'good' },
    ]);
  });

  it('un precio del grupo Dudoso no cuenta como el más barato (spec 23)', () => {
    expect(shelfComparison({ price: 4300, nearby, group: [mate(3200, 0.25, 'Almacén Don Luis', 'dudoso')] }))
      .toEqual([{ text: 'En Día — 600 m sale $410,00 menos', tone: 'bad' }]);
  });

  it('solo Dudosos del grupo: como sin cercanos, contra la referencia', () => {
    expect(shelfComparison({ price: 3000, group: [mate(3200, 0.25, 'Almacén Don Luis', 'dudoso')], reference: 3500 })[0])
      .toEqual({ text: '14,3 % por debajo de la referencia', tone: 'good' });
  });

  it('el más barato del grupo Validado suma ", validado"', () => {
    expect(shelfComparison({ price: 4300, nearby, group: [mate(3200, 0.25, 'Almacén Don Luis', 'validado')] }))
      .toEqual([{ text: 'En Almacén Don Luis — 250 m sale $1.100,00 menos (Ana · 12/11, validado)', tone: 'bad' }]);
    expect(shelfComparison({ price: 3200, group: [mate(3200, 0.25, 'Almacén Don Luis', 'validado')] })[0].text)
      .toBe('Igual que en Almacén Don Luis — 250 m (Ana · 12/11, validado)');
  });

  it('sin cercanos de ninguno, la referencia como antes', () => {
    expect(shelfComparison({ price: 3000, nearby: [], group: [], reference: 3500 })[0].tone).toBe('good');
  });
});

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
