import { describe, expect, it } from 'vitest';
import { BasketLine, basketLines, compareChains, compareNearby, savingsLine, withoutEanLabel } from './basket';
import { CartItem, Product } from './models';
import { referenceSummary, type NearBranch, type NearbyPrice, type ReferenceSummary, type SepaPrice } from './sepa';

function item(id: string, productId: string, patch: Partial<CartItem> = {}): CartItem {
  return { id, productId, productName: `Producto ${productId}`, price: 100, quantity: 1, subtotal: 100, ...patch };
}

const products: Product[] = [
  { id: 'p1', name: 'Yerba', ean: '7790387000016' },
  { id: 'p2', name: 'Leche', ean: '7790742334503' },
  { id: 'p3', name: 'Pan casero' },
];

// ── basketLines ─────────────────────────────────────────────
describe('basketLines', () => {
  it('toma los ítems con EAN y cuenta aparte los que no tienen', () => {
    const cart = [item('a', 'p1'), item('b', 'p3'), item('c', 'p2', { quantity: 3, price: 50, subtotal: 150 })];
    const { lines, withoutEan } = basketLines(cart, products);
    expect(withoutEan).toBe(1);
    expect(lines).toEqual([
      { itemId: 'a', productName: 'Producto p1', ean: '7790387000016', quantity: 1, price: 100 },
      { itemId: 'c', productName: 'Producto p2', ean: '7790742334503', quantity: 3, price: 50 },
    ]);
  });

  it('un producto que ya no existe cuenta como sin EAN', () => {
    expect(basketLines([item('a', 'borrado')], products)).toEqual({ lines: [], withoutEan: 1 });
  });

  it('lleva el sepaId del comercio actual solo si viene del SEPA', () => {
    const cart = [
      item('a', 'p1', { store: { name: 'Coto — Caballito', sepaId: '10-1-123' } }),
      item('b', 'p2', { store: { name: 'Almacén Juan', barrio: 'Flores' } }),
    ];
    const { lines } = basketLines(cart, products);
    expect(lines[0].sepaId).toBe('10-1-123');
    expect(lines[1]).not.toHaveProperty('sepaId');
  });

  it('conserva el ítem en $0 con su precio en 0', () => {
    const { lines } = basketLines([item('a', 'p1', { price: 0, subtotal: 0 })], products);
    expect(lines[0].price).toBe(0);
  });

  it('carrito vacío', () => {
    expect(basketLines([], products)).toEqual({ lines: [], withoutEan: 0 });
  });
});

// ── compareNearby ───────────────────────────────────────────

function line(itemId: string, ean: string, price: number, quantity = 1, sepaId?: string): BasketLine {
  return { itemId, productName: `Producto ${itemId}`, ean, quantity, price, ...(sepaId && { sepaId }) };
}

function branch(id: string, distanceKm: number, patch: Partial<NearBranch> = {}): NearBranch {
  return {
    id, chain: 'Coto', name: `Sucursal ${id}`, address: 'Av Rivadavia 5000', barrio: 'Caballito', localidad: null,
    provincia: 'AR-C', lat: -34.61, lng: -58.44, updated: '2026-11-20', distanceKm, ...patch,
  };
}

/** Precios por EAN a partir de [ean, sucursal, precio] */
function nearby(rows: [string, NearBranch, number][]): Map<string, NearbyPrice[]> {
  const map = new Map<string, NearbyPrice[]>();
  for (const [ean, b, price] of rows) {
    const { distanceKm, ...rest } = b;
    map.set(ean, [...(map.get(ean) ?? []), { ean, branch: rest, price, distanceKm }]);
  }
  return map;
}

describe('compareNearby', () => {
  const a = branch('10-1-1', 0.8);
  const b = branch('10-1-2', 1.2, { chain: 'Dia', name: 'Primera Junta' });
  const c = branch('10-1-3', 2.5);

  it('cuenta los productos que tiene cada sucursal y suma precio × cantidad', () => {
    const lines = [line('x', 'e1', 100, 2), line('y', 'e2', 50, 3)];
    const prices = nearby([['e1', a, 90], ['e2', a, 40], ['e1', b, 80]]);
    const [first, second] = compareNearby(lines, prices, [a, b]);
    expect(first.key).toBe(a.id);
    expect(first.name).toBe('Coto — Sucursal 10-1-1');
    expect(first.found.map(f => [f.line.itemId, f.price])).toEqual([['x', 90], ['y', 40]]);
    expect(first.missing).toEqual([]);
    expect(first.total).toBe(90 * 2 + 40 * 3);
    expect(second.key).toBe(b.id);
    expect(second.missing.map(l => l.itemId)).toEqual(['y']);
    expect(second.total).toBe(160);
  });

  it('el ahorro compara contra el precio actual, solo de los productos que tiene', () => {
    const lines = [line('x', 'e1', 100, 2), line('y', 'e2', 50, 1)];
    const [option] = compareNearby(lines, nearby([['e1', a, 90]]), [a]);
    expect(option.savings).toBe(20);
  });

  it('el ahorro es negativo si la sucursal es más cara', () => {
    const [option] = compareNearby([line('x', 'e1', 100, 3)], nearby([['e1', a, 110]]), [a]);
    expect(option.savings).toBe(-30);
  });

  it('los ítems en $0 cuentan en la cobertura y el total pero no en el ahorro', () => {
    const lines = [line('x', 'e1', 100), line('y', 'e2', 0, 2)];
    const [option] = compareNearby(lines, nearby([['e1', a, 90], ['e2', a, 30]]), [a]);
    expect(option.found).toHaveLength(2);
    expect(option.total).toBe(90 + 60);
    expect(option.savings).toBe(10);
  });

  it('sin ningún producto con precio actual, el ahorro es null', () => {
    const [option] = compareNearby([line('y', 'e2', 0)], nearby([['e2', a, 30]]), [a]);
    expect(option.savings).toBeNull();
  });

  it('alreadyThere si todos los que tiene ya están en esa sucursal', () => {
    const lines = [line('x', 'e1', 100, 1, a.id), line('y', 'e2', 50, 1, b.id)];
    const prices = nearby([['e1', a, 100], ['e2', b, 50], ['e1', b, 95]]);
    const options = compareNearby(lines, prices, [a, b]);
    expect(options.find(o => o.key === a.id)?.alreadyThere).toBe(true);
    expect(options.find(o => o.key === b.id)?.alreadyThere).toBe(false);
  });

  it('las sucursales sin ningún producto no aparecen', () => {
    const options = compareNearby([line('x', 'e1', 100)], nearby([['e1', a, 90]]), [a, b, c]);
    expect(options.map(o => o.key)).toEqual([a.id]);
  });

  it('ordena por cobertura, después total, distancia y nombre', () => {
    const d = branch('10-1-4', 0.5, { chain: 'Carrefour', name: 'Flores' });
    const e = branch('10-1-5', 0.5, { chain: 'Atomo', name: 'Flores' });
    const lines = [line('x', 'e1', 100), line('y', 'e2', 100)];
    const prices = nearby([
      ['e1', c, 50], ['e2', c, 50],      // 2 productos, $100, 2,5 km
      ['e1', b, 60], ['e2', b, 60],      // 2 productos, $120
      ['e1', a, 50], ['e2', a, 50],      // 2 productos, $100, 0,8 km
      ['e1', d, 10],                     // 1 producto, $10, 0,5 km
      ['e1', e, 10],                     // 1 producto, $10, 0,5 km: por nombre antes que Carrefour
    ]);
    expect(compareNearby(lines, prices, [a, b, c, d, e]).map(o => o.key)).toEqual([a.id, c.id, b.id, e.id, d.id]);
  });
});

// ── compareChains ───────────────────────────────────────────

function chainPrice(ean: string, bandera: string, mediana: number): SepaPrice {
  return { ean, bandera, minimo: mediana, mediana, maximo: mediana, sucursales: 10, actualizado: '2026-11-20' };
}

/** Resúmenes de referencia por EAN a partir de [ean, cadena, mediana] */
function references(rows: [string, string, number][]): Map<string, ReferenceSummary> {
  const byEan = new Map<string, SepaPrice[]>();
  for (const [ean, bandera, mediana] of rows) byEan.set(ean, [...(byEan.get(ean) ?? []), chainPrice(ean, bandera, mediana)]);
  const today = new Date(2026, 10, 21);
  return new Map([...byEan].map(([ean, prices]) => [ean, referenceSummary(prices, today)!]));
}

describe('compareChains', () => {
  it('una opción por cadena con la mediana de cada producto', () => {
    const lines = [line('x', 'e1', 100, 2), line('y', 'e2', 50)];
    const refs = references([['e1', 'Coto', 90], ['e2', 'Coto', 45], ['e1', 'Dia', 80]]);
    const [coto, dia] = compareChains(lines, refs);
    expect(coto).toMatchObject({ key: 'Coto', name: 'Coto', total: 90 * 2 + 45, savings: 20 + 5, alreadyThere: false });
    expect(coto).not.toHaveProperty('branch');
    expect(dia).toMatchObject({ key: 'Dia', total: 160, savings: 40 });
    expect(dia.missing.map(l => l.itemId)).toEqual(['y']);
  });

  it('sin referencias no hay opciones', () => {
    expect(compareChains([line('x', 'e1', 100)], new Map())).toEqual([]);
  });

  it('los ítems en $0 no cuentan en el ahorro', () => {
    const [option] = compareChains([line('x', 'e1', 0)], references([['e1', 'Coto', 90]]));
    expect(option.total).toBe(90);
    expect(option.savings).toBeNull();
  });

  it('ordena por cobertura, después total y nombre', () => {
    const lines = [line('x', 'e1', 100), line('y', 'e2', 100)];
    const refs = references([
      ['e1', 'Jumbo', 50], ['e2', 'Jumbo', 50],
      ['e1', 'Coto', 50], ['e2', 'Coto', 50],
      ['e1', 'Dia', 40], ['e2', 'Dia', 70],
      ['e1', 'Atomo', 1],
    ]);
    expect(compareChains(lines, refs).map(o => o.key)).toEqual(['Coto', 'Jumbo', 'Dia', 'Atomo']);
  });
});

// ── Textos ──────────────────────────────────────────────────

describe('savingsLine', () => {
  const a = branch('10-1-1', 0.8);

  it('más barato que ahora, en verde', () => {
    const [option] = compareNearby([line('x', 'e1', 1300)], nearby([['e1', a, 100]]), [a]);
    expect(savingsLine(option, 1)).toEqual({ text: '$1.200,00 menos que ahora', tone: 'cheaper' });
  });

  it('más caro que ahora, en rojo, y aclara cuántos tiene', () => {
    const lines = [line('x', 'e1', 100), line('y', 'e2', 50), line('z', 'e3', 50)];
    const [one] = compareNearby(lines, nearby([['e1', a, 104.5]]), [a]);
    expect(savingsLine(one, 3)).toEqual({ text: '$4,50 más que ahora, en el 1 que tiene', tone: 'pricier' });
    const [two] = compareNearby(lines, nearby([['e1', a, 90], ['e2', a, 50]]), [a]);
    expect(savingsLine(two, 3)?.text).toBe('$10,00 menos que ahora, en los 2 que tiene');
  });

  it('sin diferencia o sin precios actuales, sin línea', () => {
    const [same] = compareNearby([line('x', 'e1', 0.1, 3)], nearby([['e1', a, 0.1]]), [a]);
    expect(savingsLine({ ...same, savings: 0.1 * 3 - 0.3 }, 1)).toBeNull();
    const [none] = compareNearby([line('x', 'e1', 0)], nearby([['e1', a, 90]]), [a]);
    expect(savingsLine(none, 1)).toBeNull();
  });

  it('si ya está todo en esa sucursal, lo dice en lugar del ahorro', () => {
    const [option] = compareNearby([line('x', 'e1', 100, 1, a.id)], nearby([['e1', a, 90]]), [a]);
    expect(savingsLine(option, 1)).toEqual({ text: 'Tu carrito ya está en este comercio', tone: 'here' });
  });
});

describe('withoutEanLabel', () => {
  it('singular, plural y nada con 0', () => {
    expect(withoutEanLabel(0)).toBeNull();
    expect(withoutEanLabel(1)).toBe('1 producto sin código no se puede comparar');
    expect(withoutEanLabel(3)).toBe('3 productos sin código no se pueden comparar');
  });
});
