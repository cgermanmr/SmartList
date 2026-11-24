import { describe, expect, it } from 'vitest';
import {
  PendingPrice, PriceVote, myVote, ownVotesByPrice, pendingValidations, priceValidation, validationSummary, votesFromJson,
} from './price-validation';

let order = 0;
function vote(voterId: string, verdict: 'ok' | 'no', overrides: Partial<PriceVote> = {}): PriceVote {
  order += 1;
  const names: Record<string, string> = { u1: 'Ana', u2: 'Lucía', u3: 'Pedro', u4: 'Sol', me: 'Germán' };
  return {
    voterId, member: names[voterId] ?? voterId, verdict, amount: 3200,
    at: `2026-11-20T12:${String(order).padStart(2, '0')}:00.000Z`, ...overrides,
  };
}

// ── priceValidation ───────────────────────────────────────

describe('priceValidation', () => {
  it('sin votos, sin validar', () => {
    expect(priceValidation([], 3200)).toEqual({ status: 'sin_validar', votes: [] });
  });

  it('un solo ok no alcanza', () => {
    expect(priceValidation([vote('u1', 'ok')], 3200).status).toBe('sin_validar');
  });

  it('2 ok, validado', () => {
    expect(priceValidation([vote('u1', 'ok'), vote('u2', 'ok')], 3200).status).toBe('validado');
  });

  it('2 ok y 1 no, validado', () => {
    expect(priceValidation([vote('u1', 'ok'), vote('u2', 'ok'), vote('u3', 'no')], 3200).status).toBe('validado');
  });

  it('2 ok y 2 no, dudoso (el empate va a dudoso)', () => {
    const votes = [vote('u1', 'ok'), vote('u2', 'ok'), vote('u3', 'no'), vote('u4', 'no')];
    expect(priceValidation(votes, 3200).status).toBe('dudoso');
  });

  it('2 no y 1 ok, dudoso', () => {
    expect(priceValidation([vote('u1', 'no'), vote('u2', 'no'), vote('u3', 'ok')], 3200).status).toBe('dudoso');
  });

  it('3 no y 3 ok, dudoso', () => {
    const votes = ['a', 'b', 'c'].flatMap(id => [vote(`ok-${id}`, 'ok'), vote(`no-${id}`, 'no')]);
    expect(priceValidation(votes, 3200).status).toBe('dudoso');
  });

  it('un solo no, sin validar', () => {
    expect(priceValidation([vote('u1', 'no')], 3200).status).toBe('sin_validar');
  });

  it('los votos sobre otro monto no cuentan', () => {
    const votes = [vote('u1', 'ok', { amount: 3000 }), vote('u2', 'ok')];
    const validation = priceValidation(votes, 3200);
    expect(validation.status).toBe('sin_validar');
    expect(validation.votes.map(v => v.voterId)).toEqual(['u2']);
  });

  it('compara en centavos', () => {
    const votes = [vote('u1', 'ok', { amount: 3200.001 }), vote('u2', 'ok', { amount: 3199.999 })];
    expect(priceValidation(votes, 3200).status).toBe('validado');
    expect(priceValidation([vote('u1', 'ok', { amount: 3200.01 })], 3200).votes).toEqual([]);
  });

  it('deja los votos en orden de voto', () => {
    const late = vote('u1', 'ok', { at: '2026-11-21T10:00:00.000Z' });
    const early = vote('u2', 'ok', { at: '2026-11-19T10:00:00.000Z' });
    expect(priceValidation([late, early], 3200).votes).toEqual([early, late]);
  });
});

// ── myVote ────────────────────────────────────────────────

describe('myVote', () => {
  it('el voto propio que cuenta', () => {
    const mine = vote('me', 'no');
    expect(myVote(priceValidation([vote('u1', 'ok'), mine], 3200), 'me')).toBe(mine);
  });

  it('sin voto propio, o sobre otro monto, ninguno', () => {
    expect(myVote(priceValidation([vote('u1', 'ok')], 3200), 'me')).toBeUndefined();
    expect(myVote(priceValidation([vote('me', 'ok', { amount: 3000 })], 3200), 'me')).toBeUndefined();
  });
});

// ── validationSummary ─────────────────────────────────────

describe('validationSummary', () => {
  const summary = (votes: PriceVote[], me = 'me') => validationSummary(priceValidation(votes, 3200), me);

  it('sin votos, nada', () => {
    expect(summary([])).toBe('');
  });

  it('validado con 2 y con 3 nombres', () => {
    expect(summary([vote('u1', 'ok'), vote('u2', 'ok')])).toBe('Validado por Ana y Lucía');
    expect(summary([vote('u1', 'ok'), vote('u2', 'ok'), vote('u3', 'ok')])).toBe('Validado por Ana, Lucía y Pedro');
  });

  it('el voto propio dice "vos"', () => {
    expect(summary([vote('me', 'ok'), vote('u1', 'ok')])).toBe('Validado por vos y Ana');
  });

  it('dudoso, con "¿Cuánto viste?"', () => {
    expect(summary([vote('u2', 'no', { seen: 3400 }), vote('u3', 'no')]))
      .toBe('No coincide para Lucía ($3.400,00) y Pedro');
  });

  it('sin validar con votos: los dos grupos', () => {
    expect(summary([vote('u1', 'ok'), vote('u3', 'no', { seen: 3400 })]))
      .toBe('Está bien para Ana · No coincide para Pedro ($3.400,00)');
  });

  it('un solo voto', () => {
    expect(summary([vote('me', 'no', { seen: 3400 })])).toBe('No coincide para vos ($3.400,00)');
    expect(summary([vote('u1', 'ok')])).toBe('Está bien para Ana');
  });

  it('validado o dudoso con votos en contra: también se nombran', () => {
    expect(summary([vote('u1', 'ok'), vote('u2', 'ok'), vote('u3', 'no')]))
      .toBe('Validado por Ana y Lucía · No coincide para Pedro');
    expect(summary([vote('u1', 'no'), vote('u2', 'no'), vote('u3', 'ok')]))
      .toBe('No coincide para Ana y Lucía · Está bien para Pedro');
  });

  it('no nombra los votos sobre otro monto', () => {
    expect(summary([vote('u1', 'ok', { amount: 3000 }), vote('u2', 'ok')])).toBe('Está bien para Lucía');
  });
});

// ── pendingValidations ────────────────────────────────────

function pending(overrides: Partial<PendingPrice> = {}, votes: PriceVote[] = []): PendingPrice {
  const amount = overrides.amount ?? 3200;
  return {
    ean: '7790000000001', amount, date: '2026-11-20T12:00:00.000Z', store: { name: 'Almacén Don Luis' },
    member: 'Ana', memberId: 'u1', priceId: 'p1', fingerprint: 'f1', productName: 'Yerba', ...overrides,
    validation: priceValidation(votes, amount),
  };
}

describe('pendingValidations', () => {
  it('saca los que ya voté sobre el monto actual', () => {
    const voted = pending({ priceId: 'p1' }, [vote('me', 'ok')]);
    const votedOtherAmount = pending({ priceId: 'p2', store: { name: 'Kiosco' } }, [vote('me', 'ok', { amount: 3000 })]);
    expect(pendingValidations([voted, votedOtherAmount], 'me').map(p => p.priceId)).toEqual(['p2']);
  });

  it('saca los validados y deja los dudosos que no voté', () => {
    const validated = pending({ priceId: 'p1' }, [vote('u2', 'ok'), vote('u3', 'ok')]);
    const doubtful = pending({ priceId: 'p2', store: { name: 'Kiosco' } }, [vote('u2', 'no'), vote('u3', 'no')]);
    expect(pendingValidations([validated, doubtful], 'me').map(p => p.priceId)).toEqual(['p2']);
  });

  it('el último de cada integrante en cada comercio para cada producto', () => {
    const old = pending({ priceId: 'old', date: '2026-11-10T12:00:00.000Z' });
    const last = pending({ priceId: 'last', date: '2026-11-18T12:00:00.000Z' });
    const sameStoreOtherWay = pending({ priceId: 'other-way', store: { name: ' almacén  don luis ' },
      date: '2026-11-12T12:00:00.000Z' });
    const otherProduct = pending({ priceId: 'other-ean', ean: '7790000000002', date: '2026-11-11T12:00:00.000Z' });
    const otherMember = pending({ priceId: 'other-member', memberId: 'u2', member: 'Lucía',
      date: '2026-11-09T12:00:00.000Z' });
    expect(pendingValidations([old, last, sameStoreOtherWay, otherProduct, otherMember], 'me').map(p => p.priceId))
      .toEqual(['last', 'other-ean', 'other-member']);
  });

  it('si el último ya lo voté, no vuelve uno anterior', () => {
    const old = pending({ priceId: 'old', date: '2026-11-10T12:00:00.000Z' });
    const last = pending({ priceId: 'last', date: '2026-11-18T12:00:00.000Z' }, [vote('me', 'ok')]);
    expect(pendingValidations([old, last], 'me')).toEqual([]);
  });

  it('nunca los propios', () => {
    expect(pendingValidations([pending({ memberId: 'me' })], 'me')).toEqual([]);
  });
});

// ── votesFromJson ─────────────────────────────────────────

describe('votesFromJson', () => {
  it('solo los votos con todos los datos y los campos conocidos', () => {
    const json = [
      { voterId: 'u1', member: 'Ana', verdict: 'ok', amount: 3200, seen: null, at: '2026-11-20T12:00:00Z', x: 1 },
      { voterId: 'u2', member: 'Lucía', verdict: 'no', amount: 3200, seen: 3400, at: '2026-11-20T13:00:00Z' },
      { voterId: 'u3', member: 'Pedro', verdict: 'tal vez', amount: 3200, at: '2026-11-20T13:00:00Z' },
      { voterId: 'u4', member: 'Sol', verdict: 'ok', amount: '3200', at: '2026-11-20T13:00:00Z' },
      'basura',
    ];
    expect(votesFromJson(json)).toEqual([
      { voterId: 'u1', member: 'Ana', verdict: 'ok', amount: 3200, at: '2026-11-20T12:00:00Z' },
      { voterId: 'u2', member: 'Lucía', verdict: 'no', amount: 3200, seen: 3400, at: '2026-11-20T13:00:00Z' },
    ]);
  });

  it('cualquier otra cosa, ninguno', () => {
    expect(votesFromJson(null)).toEqual([]);
    expect(votesFromJson({})).toEqual([]);
  });
});

describe('ownVotesByPrice', () => {
  it('agrupa por precio, sin "¿Cuánto viste?" vacío y sin veredictos desconocidos', () => {
    const at = '2026-11-21T10:00:00.000Z';
    const result = ownVotesByPrice([
      { price_id: 'p1', voter_id: 'u2', member: 'Lucía', verdict: 'ok', amount: 1500, seen: null, at },
      { price_id: 'p1', voter_id: 'u3', member: 'Pedro', verdict: 'no', amount: 1500, seen: 1600, at },
      { price_id: 'p2', voter_id: 'u2', member: 'Lucía', verdict: 'x', amount: 900, seen: null, at },
    ]);
    expect([...result.keys()]).toEqual(['p1']);
    expect(result.get('p1')).toEqual([
      { voterId: 'u2', member: 'Lucía', verdict: 'ok', amount: 1500, at },
      { voterId: 'u3', member: 'Pedro', verdict: 'no', amount: 1500, seen: 1600, at },
    ]);
  });
});
