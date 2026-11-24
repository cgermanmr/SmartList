import { describe, expect, it } from 'vitest';
import {
  GroupPrice, GroupPriceRow, clearGroupPrices, defaultNickname, groupErrorMessage, groupPriceFromRow, groupPriceNote,
  groupPricesEpoch, groupPricesNear, groupPricesVersion, inviteUrl, latestGroupPrices, pendingPriceFromRow,
  refreshGroupPrices, subscribeGroupPrices, validGroupName, validNickname,
} from './group';

// ── defaultNickname ───────────────────────────────────────

describe('defaultNickname', () => {
  it('la primera palabra del nombre de Google', () => {
    expect(defaultNickname({ email: 'ana@example.com', user_metadata: { full_name: '  Ana María Pérez ' } })).toBe('Ana');
  });

  it('sin nombre, lo que está antes de la arroba', () => {
    expect(defaultNickname({ email: 'lucia.gomez@example.com' })).toBe('lucia.gomez');
  });

  it('no pasa de 30 caracteres', () => {
    expect(defaultNickname({ email: `${'a'.repeat(40)}@example.com` })).toHaveLength(30);
  });
});

// ── Validaciones ──────────────────────────────────────────

describe('validGroupName / validNickname', () => {
  it('nombre del grupo: de 1 a 40 sin contar los espacios de los costados', () => {
    expect(validGroupName('  Familia  ')).toBe(true);
    expect(validGroupName('   ')).toBe(false);
    expect(validGroupName('a'.repeat(40))).toBe(true);
    expect(validGroupName('a'.repeat(41))).toBe(false);
  });

  it('apodo: de 1 a 30', () => {
    expect(validNickname('Ana')).toBe(true);
    expect(validNickname('')).toBe(false);
    expect(validNickname(` ${'a'.repeat(30)} `)).toBe(true);
    expect(validNickname('a'.repeat(31))).toBe(false);
  });
});

// ── inviteUrl y errores ───────────────────────────────────

describe('inviteUrl', () => {
  it('arma el link de unirse con el código', () => {
    expect(inviteUrl('https://elchanguito.vercel.app', 'Ab3_x-9QzP1k'))
      .toBe('https://elchanguito.vercel.app/grupo/unirse?c=Ab3_x-9QzP1k');
  });
});

describe('groupErrorMessage', () => {
  it('traduce los códigos de la base', () => {
    expect(groupErrorMessage('group_full')).toBe('El grupo está completo (20 integrantes).');
    expect(groupErrorMessage('invalid_code')).toContain('no es válido o cambió');
  });

  it('traduce los códigos de la validación (spec 23)', () => {
    expect(groupErrorMessage('price_not_found')).toBe('Ese precio ya no está en el grupo.');
    expect(groupErrorMessage('own_price')).toBe('No podés validar tus propios precios.');
    expect(groupErrorMessage('invalid_amount')).toBe('Revisá el monto.');
    expect(groupErrorMessage('price_changed')).toBe('El precio cambió mientras lo mirabas. Revisalo y votá de nuevo.');
  });

  it('cualquier otro error es de conexión', () => {
    expect(groupErrorMessage('Failed to fetch')).toBe('No se pudo guardar. Revisá la conexión.');
    expect(groupErrorMessage(undefined)).toBe('No se pudo guardar. Revisá la conexión.');
  });
});

// ── Precios del grupo ─────────────────────────────────────

function price(overrides: Partial<GroupPrice>): GroupPrice {
  return {
    ean: '7790000000001', amount: 100, date: '2026-11-20T12:00:00.000Z', store: { name: 'Super Luna' },
    member: 'Ana', memberId: 'u1', priceId: 'p1', fingerprint: 'f1', validation: { status: 'sin_validar', votes: [] },
    ...overrides,
  };
}

describe('latestGroupPrices', () => {
  it('deja el último de cada integrante en cada comercio', () => {
    const old = price({ amount: 90, date: '2026-11-10T12:00:00.000Z' });
    const last = price({ amount: 120, date: '2026-11-18T12:00:00.000Z' });
    const otherStore = price({ amount: 110, store: { name: 'Kiosco' } });
    const otherMember = price({ amount: 95, memberId: 'u2', member: 'Lucía' });
    const result = latestGroupPrices([old, last, otherStore, otherMember]);
    expect(result).toHaveLength(3);
    expect(result).not.toContain(old);
    expect(result).toContain(last);
  });

  it('el mismo comercio con otra forma de escribirlo cuenta como uno (storeKey)', () => {
    const a = price({ store: { name: 'Super Luna' }, date: '2026-11-10T12:00:00.000Z' });
    const b = price({ store: { name: ' super  luna ' }, date: '2026-11-12T12:00:00.000Z' });
    expect(latestGroupPrices([a, b])).toEqual([b]);
  });

  it('ordena por precio y, a igual precio, el más nuevo primero', () => {
    const a = price({ amount: 200, store: { name: 'A' } });
    const b = price({ amount: 100, store: { name: 'B' }, date: '2026-11-01T12:00:00.000Z' });
    const c = price({ amount: 100, store: { name: 'C' }, date: '2026-11-15T12:00:00.000Z' });
    expect(latestGroupPrices([a, b, c]).map(p => p.store.name)).toEqual(['C', 'B', 'A']);
  });
});

describe('groupPricesNear', () => {
  const origin = { lat: -34.6, lng: -58.4 };
  const kmNorth = (km: number) => origin.lat + km / 111.195;
  const inside = price({ store: { name: 'Cerca', lat: kmNorth(1), lng: origin.lng } });
  const outside = price({ store: { name: 'Lejos', lat: kmNorth(4), lng: origin.lng } });
  const noCoords = price({ store: { name: 'Sin coordenadas' } });

  it('solo los que tienen coordenadas dentro del radio, con su distancia', () => {
    const near = groupPricesNear([inside, outside, noCoords], origin, 3);
    expect(near.map(n => n.price.store.name)).toEqual(['Cerca']);
    expect(near[0].distanceKm).toBeCloseTo(1, 2);
  });

  it('sin ubicación, ninguno', () => {
    expect(groupPricesNear([inside], undefined, undefined)).toEqual([]);
  });
});

describe('groupPriceFromRow', () => {
  const row: GroupPriceRow = {
    ean: '7790000000001', amount: 1500, date: '2026-11-20T12:00:00.000Z', store: 'Almacén Don Luis',
    barrio: 'Caballito', store_ref: null, member: 'Ana', member_id: 'u1', price_id: 'p1', votes: [], fingerprint: 'f1',
  };

  it('con storeRef, el comercio completo (solo los campos conocidos)', () => {
    const storeRef = {
      name: 'Almacén Don Luis', address: 'Av. Rivadavia 5100', barrio: 'Caballito', lat: -34.6, lng: -58.43,
      sepaId: '10-1-123', chain: 'Don Luis', extra: '<script>',
    };
    expect(groupPriceFromRow({ ...row, store_ref: storeRef })).toEqual({
      ean: '7790000000001', amount: 1500, date: '2026-11-20T12:00:00.000Z', member: 'Ana', memberId: 'u1',
      priceId: 'p1', fingerprint: 'f1', validation: { status: 'sin_validar', votes: [] },
      store: {
        name: 'Almacén Don Luis', address: 'Av. Rivadavia 5100', barrio: 'Caballito', lat: -34.6, lng: -58.43,
        sepaId: '10-1-123', chain: 'Don Luis',
      },
    });
  });

  it('sin storeRef (precio de antes de la spec 26), store y barrio; "Sin especificar" no es un barrio', () => {
    expect(groupPriceFromRow(row)?.store).toEqual({ name: 'Almacén Don Luis', barrio: 'Caballito' });
    expect(groupPriceFromRow({ ...row, barrio: 'Sin especificar' })?.store).toEqual({ name: 'Almacén Don Luis' });
  });

  it('coordenadas solo si vienen las dos como números', () => {
    const store = groupPriceFromRow({ ...row, store_ref: { name: 'Kiosco', lat: '-34.6', lng: -58.4 } })?.store;
    expect(store).toEqual({ name: 'Kiosco' });
  });

  it('el estado sale de los votos sobre el monto actual (spec 23)', () => {
    const votes = [
      { voterId: 'u2', member: 'Lucía', verdict: 'ok', amount: 1500, at: '2026-11-21T10:00:00.000Z' },
      { voterId: 'u3', member: 'Pedro', verdict: 'ok', amount: 1500, at: '2026-11-21T11:00:00.000Z' },
      { voterId: 'u4', member: 'Sol', verdict: 'no', amount: 1400, at: '2026-11-21T12:00:00.000Z' },
    ];
    const validation = groupPriceFromRow({ ...row, votes })?.validation;
    expect(validation?.status).toBe('validado');
    expect(validation?.votes.map(v => v.voterId)).toEqual(['u2', 'u3']);
    expect(groupPriceFromRow({ ...row, votes: null })?.validation).toEqual({ status: 'sin_validar', votes: [] });
  });

  it('sin comercio, sin monto positivo o con fecha ilegible queda afuera', () => {
    expect(groupPriceFromRow({ ...row, store: null })).toBeNull();
    expect(groupPriceFromRow({ ...row, store: '  ', store_ref: { name: '' } })).toBeNull();
    expect(groupPriceFromRow({ ...row, amount: 0 })).toBeNull();
    expect(groupPriceFromRow({ ...row, date: 'ayer' })).toBeNull();
  });
});

describe('refreshGroupPrices y clearGroupPrices', () => {
  it('votar vuelve a pedir sin descartar lo que se ve; salir del grupo también lo descarta', () => {
    let calls = 0;
    const unsubscribe = subscribeGroupPrices(() => { calls += 1; });
    const [version, epoch] = [groupPricesVersion(), groupPricesEpoch()];

    refreshGroupPrices();
    expect([groupPricesVersion(), groupPricesEpoch()]).toEqual([version + 1, epoch]);
    clearGroupPrices();
    expect([groupPricesVersion(), groupPricesEpoch()]).toEqual([version + 2, epoch + 1]);
    expect(calls).toBe(2);
    unsubscribe();
  });
});

describe('groupPriceNote', () => {
  it('quién lo cargó y el día', () => {
    expect(groupPriceNote(price({ member: 'Ana', date: '2026-11-12T15:00:00.000Z' }))).toBe('Cargado por Ana · 12/11');
  });
});

describe('pendingPriceFromRow', () => {
  const row = {
    ean: '7790000000001', amount: 3200, date: '2026-11-20T12:00:00.000Z', store: 'Almacén Don Luis', barrio: null,
    store_ref: null, member: 'Ana', member_id: 'u1', price_id: 'p1', votes: [], fingerprint: 'f1',
    product_name: ' Yerba Playadito ', brand: 'Playadito', size: 1, size_unit: 'kg',
  };

  it('el precio con nombre, marca y presentación del autor', () => {
    expect(pendingPriceFromRow(row)).toMatchObject({
      priceId: 'p1', productName: 'Yerba Playadito', brand: 'Playadito', size: 1, sizeUnit: 'kg',
      store: { name: 'Almacén Don Luis' },
    });
  });

  it('presentación solo con un número positivo y una unidad conocida', () => {
    expect(pendingPriceFromRow({ ...row, size_unit: 'litros' })).not.toHaveProperty('size');
    expect(pendingPriceFromRow({ ...row, size: 0 })).not.toHaveProperty('sizeUnit');
    expect(pendingPriceFromRow({ ...row, brand: ' ', product_name: null })).toMatchObject({ productName: '' });
    expect(pendingPriceFromRow({ ...row, brand: ' ' })).not.toHaveProperty('brand');
  });

  it('sin comercio queda afuera', () => {
    expect(pendingPriceFromRow({ ...row, store: null })).toBeNull();
  });
});
