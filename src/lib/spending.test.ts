import { describe, expect, it } from 'vitest';
import { CartItem, Purchase, StoreRef } from './models';
import {
  availableMonths, byPayment, byStore, lastMonthsTotals, monthKey, monthSummary, monthVariation, previousMonth,
} from './spending';

// Fechas en hora local: el caso de las 22:00 del último día pasa igual en Argentina y en el CI en UTC
function at(year: number, monthIndex: number, day: number, hour = 12): string {
  return new Date(year, monthIndex, day, hour, 0).toISOString();
}

function purchase(id: string, date: string, total: number, patch: Partial<Purchase> = {}, store?: StoreRef): Purchase {
  const item: CartItem = { id, productId: id, productName: `Producto ${id}`, price: total, quantity: 1, subtotal: total };
  if (store) item.store = store;
  return { id, date, total, items: [item], ...patch };
}

// Los datos de prueba de la spec, con las fechas en hora local
const PURCHASES: Purchase[] = [
  purchase('6', at(2026, 10, 10, 15), 5000, { store: 'Coto — Sucursal Palermo', paymentMethod: 'Débito' },
    { name: 'Coto — Sucursal Palermo', sepaId: '10-1-123', chain: 'Coto' }),
  purchase('5', at(2026, 9, 31, 22), 2400, { store: 'Coto — Sucursal Belgrano', paymentMethod: 'efectivo' },
    { name: 'Coto — Sucursal Belgrano', sepaId: '10-1-45' }),
  purchase('4', at(2026, 9, 20), 1000, { paymentMethod: 'Efectivo' }),
  purchase('3', at(2026, 9, 12), 2600, { store: 'Verdulería Juan', barrio: 'Palermo', paymentMethod: 'Transferencia / QR' }),
  purchase('2', at(2026, 9, 5), 5000, { store: '  verdulería   juan ', paymentMethod: 'transferencia' }),
  purchase('1', at(2026, 8, 15), 6000, { store: 'Verdulería Juan' }),
];

function rows(list: { label: string; amount: number; percent: number }[]) {
  return list.map(({ label, amount, percent }) => [label, amount, Math.round(percent * 10) / 10]);
}

describe('meses', () => {
  it('monthKey usa la hora local: las 22:00 del último día cuentan en ese mes', () => {
    expect(monthKey(at(2026, 9, 31, 22))).toBe('2026-10');
    expect(monthKey(new Date(2026, 10, 1, 0, 30))).toBe('2026-11');
  });

  it('previousMonth cruza el año', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-11')).toBe('2026-10');
  });

  it('availableMonths: meses con compras más el actual, ordenados y sin repetidos', () => {
    expect(availableMonths(PURCHASES, '2026-11')).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(availableMonths(PURCHASES, '2026-12')).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
    expect(availableMonths([], '2026-11')).toEqual(['2026-11']);
  });
});

describe('monthSummary', () => {
  it('total, cantidad y ticket promedio', () => {
    expect(monthSummary(PURCHASES, '2026-11')).toEqual({ month: '2026-11', total: 5000, count: 1, average: 5000 });
    expect(monthSummary(PURCHASES, '2026-10')).toEqual({ month: '2026-10', total: 11000, count: 4, average: 2750 });
    expect(monthSummary(PURCHASES, '2026-09')).toEqual({ month: '2026-09', total: 6000, count: 1, average: 6000 });
  });

  it('mes sin compras: 0 y sin promedio', () => {
    expect(monthSummary(PURCHASES, '2026-12')).toEqual({ month: '2026-12', total: 0, count: 0, average: null });
  });
});

describe('lastMonthsTotals', () => {
  it('6 meses terminando en el elegido, con los que dan 0', () => {
    expect(lastMonthsTotals(PURCHASES, '2026-11', 6)).toEqual([
      { month: '2026-06', total: 0, count: 0 },
      { month: '2026-07', total: 0, count: 0 },
      { month: '2026-08', total: 0, count: 0 },
      { month: '2026-09', total: 6000, count: 1 },
      { month: '2026-10', total: 11000, count: 4 },
      { month: '2026-11', total: 5000, count: 1 },
    ]);
  });

  it('cruza el año', () => {
    expect(lastMonthsTotals([], '2026-02', 3).map(m => m.month)).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});

describe('monthVariation', () => {
  it('contra el mes calendario anterior', () => {
    expect(monthVariation(PURCHASES, '2026-11')).toBeCloseTo(-54.545, 2);
    expect(monthVariation(PURCHASES, '2026-10')).toBeCloseTo(83.333, 2);
  });

  it('null si alguno de los dos meses no tiene compras', () => {
    expect(monthVariation(PURCHASES, '2026-09')).toBeNull();
    expect(monthVariation(PURCHASES, '2026-12')).toBeNull();
  });
});

describe('byStore', () => {
  it('suma por cadena o comercio, de mayor a menor', () => {
    expect(rows(byStore(PURCHASES, '2026-10'))).toEqual([
      ['Verdulería Juan', 7600, 69.1],
      ['Coto', 2400, 21.8],
      ['Sin comercio', 1000, 9.1],
    ]);
    expect(rows(byStore(PURCHASES, '2026-11'))).toEqual([['Coto', 5000, 100]]);
    expect(rows(byStore(PURCHASES, '2026-09'))).toEqual([['Verdulería Juan', 6000, 100]]);
  });

  it('sucursales de una misma cadena en una fila, con el nombre de `chain`', () => {
    const list = [
      purchase('a', at(2026, 10, 2), 100, { store: 'Coto — Palermo' }, { name: 'Coto — Palermo', sepaId: '10-1-1' }),
      purchase('b', at(2026, 10, 3), 200, { store: 'Coto Belgrano' }, { name: 'Coto Belgrano', sepaId: '10-1-2', chain: 'Coto' }),
      purchase('c', at(2026, 10, 4), 50, { store: 'Coto — Otra bandera' }, { name: 'Coto — Otra bandera', sepaId: '10-2-1' }),
    ];
    expect(byStore(list, '2026-11').map(r => [r.key, r.label, r.amount])).toEqual([
      ['sepa:10-1', 'Coto', 300],
      ['sepa:10-2', 'Coto', 50],
    ]);
  });

  it('cadena sin `chain`: el texto antes de " — ", o el nombre entero', () => {
    const list = [
      purchase('a', at(2026, 10, 2), 100, { store: 'Día — Sucursal 5' }, { name: 'Día — Sucursal 5', sepaId: '15-1-5' }),
      purchase('b', at(2026, 10, 3), 50, { store: 'Jumbo Palermo' }, { name: 'Jumbo Palermo', sepaId: '11-2-7' }),
    ];
    expect(byStore(list, '2026-11').map(r => r.label)).toEqual(['Día', 'Jumbo Palermo']);
  });

  it('comercio propio: mayúsculas y espacios no cuentan; el nombre es el de la compra más reciente', () => {
    const list = [
      purchase('a', at(2026, 10, 2), 100, { store: 'almacén  pepe' }),
      purchase('b', at(2026, 10, 9), 100, { store: ' Almacén Pepe ' }),
      purchase('c', at(2026, 10, 5), 100, { store: 'ALMACÉN PEPE' }),
    ];
    expect(rows(byStore(list, '2026-11'))).toEqual([['Almacén Pepe', 300, 100]]);
  });

  it('compra sin comercio → "Sin comercio"', () => {
    const list = [purchase('a', at(2026, 10, 2), 100), purchase('b', at(2026, 10, 3), 50, { store: '   ' })];
    expect(rows(byStore(list, '2026-11'))).toEqual([['Sin comercio', 150, 100]]);
  });

  it('a igual monto, por nombre', () => {
    const list = [
      purchase('a', at(2026, 10, 2), 100, { store: 'Zeta' }),
      purchase('b', at(2026, 10, 3), 100, { store: 'Ámbar' }),
    ];
    expect(byStore(list, '2026-11').map(r => r.label)).toEqual(['Ámbar', 'Zeta']);
  });
});

describe('byPayment', () => {
  it('el id de la versión Angular y el label son la misma fila', () => {
    expect(rows(byPayment(PURCHASES, '2026-10'))).toEqual([
      ['Transferencia / QR', 7600, 69.1],
      ['Efectivo', 3400, 30.9],
    ]);
    expect(rows(byPayment(PURCHASES, '2026-11'))).toEqual([['Débito', 5000, 100]]);
  });

  it('compra sin medio de pago → "Sin especificar"', () => {
    expect(rows(byPayment(PURCHASES, '2026-09'))).toEqual([['Sin especificar', 6000, 100]]);
  });

  it('mes sin compras: sin filas', () => {
    expect(byPayment(PURCHASES, '2026-12')).toEqual([]);
    expect(byStore(PURCHASES, '2026-12')).toEqual([]);
  });
});

describe('desgloses', () => {
  it('la suma de cada desglose es igual al total del mes', () => {
    for (const month of ['2026-09', '2026-10', '2026-11']) {
      const { total } = monthSummary(PURCHASES, month);
      const sum = (list: { amount: number }[]) => list.reduce((s, r) => s + r.amount, 0);
      expect(sum(byStore(PURCHASES, month))).toBe(total);
      expect(sum(byPayment(PURCHASES, month))).toBe(total);
    }
  });
});
