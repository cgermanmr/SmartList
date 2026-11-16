import { describe, expect, it } from 'vitest';
import {
  accentPattern, daysSince, freshnessLabel, groupSepaPrices, isSearchableQuery, referenceLabel, referenceShortLabel, referenceStatus, referenceSummary, SepaPrice, SepaProduct, SepaProductRow,
  SepaPriceRow, suggestedName, toSepaProduct, vsReference, wordFilter,
} from './sepa';

function product(description: string, brand: string | null): SepaProduct {
  return { ean: '7793704000508', description, brand, size: null, sizeUnit: null, banderas: 1 };
}

describe('isSearchableQuery', () => {
  it('pide al menos 3 caracteres', () => {
    expect(isSearchableQuery('ye')).toBe(false);
    expect(isSearchableQuery('yer')).toBe(true);
  });

  it('no cuenta los espacios', () => {
    expect(isSearchableQuery('   ')).toBe(false);
    expect(isSearchableQuery(' a b ')).toBe(false);
    expect(isSearchableQuery('a b c')).toBe(true);
  });
});

describe('toSepaProduct', () => {
  const row: SepaProductRow = {
    ean: '7793704000911', descripcion: 'YERBA', marca: 'PLAYADITO', cantidad: 500, unidad: 'g', banderas: 16,
  };

  it('pasa la fila a los nombres de la app', () => {
    expect(toSepaProduct(row)).toEqual({
      ean: '7793704000911', description: 'YERBA', brand: 'PLAYADITO', size: 500, sizeUnit: 'g', banderas: 16,
    });
  });

  it('convierte la cantidad si la base la devuelve como texto', () => {
    expect(toSepaProduct({ ...row, cantidad: '500.000' }).size).toBe(500);
  });

  it('sin cantidad ni unidad deja la presentación vacía', () => {
    expect(toSepaProduct({ ...row, cantidad: null, unidad: null })).toMatchObject({ size: null, sizeUnit: null });
  });

  it('sin marca deja brand en null', () => {
    expect(toSepaProduct({ ...row, marca: null }).brand).toBeNull();
  });

  it.each(['S/D', 'SIN MARCA', 'GENERICO', '.', 'sin marca', ' S/D '])('%s no es una marca', marca => {
    expect(toSepaProduct({ ...row, marca }).brand).toBeNull();
  });
});

describe('suggestedName', () => {
  it.each([
    ['saca la marca del final',         'SPAGHETTI RINA',            'RINA',          'Spaghetti'],
    ['saca una marca de varias palabras', 'SAL FIN SALERO DOS ANCLAS', 'DOS ANCLAS',    'Sal Fin Salero'],
    ['compara la marca sin mayúsculas', 'manteca milkaut',           'MILKAUT',       'Manteca'],
    ['deja la marca que no va al final', 'YERBA MATE PLAYADITO PAQ 2 KG', 'PLAYADITO', 'Yerba Mate Playadito Paq 2 Kg'],
    ['no corta una palabra que termina igual', 'GALLETITAS SUPERBLOCK', 'BLOCK',      'Galletitas Superblock'],
    ['no deja el nombre vacío',         'PLAYADITO',                 'PLAYADITO',     'Playadito'],
    ['toma la marca como texto',        'JABON A.B.C',               'A.B.C',         'Jabon'],
    ['compacta los espacios',           'QUESO  RALLADO   LA SERENISIMA', 'LA SERENISIMA', 'Queso Rallado'],
    ['sin marca solo da formato',       'DULCE D LECHE REPOST',      null,            'Dulce D Leche Repost'],
    ['conserva acentos y eñes',         'AZÚCAR ÑANDÚ',              null,            'Azúcar Ñandú'],
    ['formato título sobre texto mixto', 'yerba mate PLAYADITO Compuesta c/hierbas', null,
      'Yerba Mate Playadito Compuesta C/hierbas'],
  ])('%s', (_case, description, brand, expected) => {
    expect(suggestedName(product(description, brand))).toBe(expected);
  });
});

describe('wordFilter', () => {
  it('busca la palabra en la descripción o en la marca, ignorando acentos', () => {
    expect(wordFilter('Té')).toBe('descripcion.imatch."t[eé]",marca.imatch."t[eé]"');
  });

  it.each([
    ['a,b',   '"[aá],b"'],
    ['(x)',   '"\\\\(x\\\\)"'],
    ['\\',    '"\\\\\\\\"'],
    ['a"b',   '"[aá]\\"b"'],
  ])('protege %s dentro del filtro', (word, quoted) => {
    expect(wordFilter(word)).toBe(`descripcion.imatch.${quoted},marca.imatch.${quoted}`);
  });
});

describe('accentPattern', () => {
  it.each([
    ['Azúcar',  '[aá]z[uúü]c[aá]r'],
    ['azucar',  '[aá]z[uúü]c[aá]r'],
    ['AZÚCAR',  '[aá]z[uúü]c[aá]r'],
    ['café',    'c[aá]f[eé]'],
    ['aceite',  '[aá]c[eé][ií]t[eé]'],
    ['pingüino', 'p[ií][nñ]g[uúü][ií][nñ][oó]'],
    ['ñandú',   '[nñ][aá][nñ]d[uúü]'],
    ['2x1',     '2x1'],
  ])('%s → %s', (word, expected) => {
    expect(accentPattern(word)).toBe(expected);
  });

  it.each([
    ['\\', '\\\\'],
    ['.',  '\\.'],
    ['*',  '\\*'],
    ['+',  '\\+'],
    ['?',  '\\?'],
    ['^',  '\\^'],
    ['$',  '\\$'],
    ['(',  '\\('],
    [')',  '\\)'],
    ['[',  '\\['],
    [']',  '\\]'],
    ['{',  '\\{'],
    ['}',  '\\}'],
    ['|',  '\\|'],
  ])('escapa %s', (char, expected) => {
    expect(accentPattern(char)).toBe(expected);
  });

  it.each(['(', '[', '*', '\\', 'c/(hierbas)', 'a.b*c', '[x]{2}|y'])(
    'el patrón de %s es una expresión válida que encuentra ese texto',
    text => {
      expect(new RegExp(accentPattern(text)).test(text)).toBe(true);
    },
  );

  it('un punto escapado no coincide con cualquier carácter', () => {
    expect(new RegExp(accentPattern('a.b')).test('axb')).toBe(false);
  });
});

// ── Precio de referencia ─────────────────────────────────────

function price(bandera: string, mediana: number, extra: Partial<SepaPrice> = {}): SepaPrice {
  return {
    ean: '7793704000911', bandera, minimo: mediana, mediana, maximo: mediana, sucursales: 10,
    actualizado: '2026-11-16', ...extra,
  };
}

const TODAY = new Date(2026, 10, 16, 10, 0);

describe('referenceSummary', () => {
  it('sin precios devuelve null', () => {
    expect(referenceSummary([], TODAY)).toBeNull();
  });

  it('el promedio de 4.000 / 4.200 / 5.000 / 9.000 es 5.550 y la más barata la de 4.000', () => {
    const summary = referenceSummary(
      [price('Coto', 5000), price('DIA', 9000), price('Jumbo', 4000), price('Disco', 4200)], TODAY,
    );
    expect(summary?.reference).toBe(5550);
    expect(summary?.cheapest.bandera).toBe('Jumbo');
    expect(summary?.chains).toBe(4);
  });

  it('cada cadena cuenta una vez, sin importar cuántas sucursales tenga', () => {
    const summary = referenceSummary(
      [price('DIA', 1000, { sucursales: 971 }), price('Coto', 2000, { sucursales: 122 })], TODAY,
    );
    expect(summary?.reference).toBe(1500);
  });

  it('ordena por precio de menor a mayor y, a igual precio, por nombre', () => {
    const summary = referenceSummary(
      [price('Coto', 300), price('Vea', 100), price('Átomo', 200), price('Disco', 100)], TODAY,
    );
    expect(summary?.byChain.map(p => p.bandera)).toEqual(['Disco', 'Vea', 'Átomo', 'Coto']);
    expect(summary?.cheapest.bandera).toBe('Disco');
  });

  it('no modifica la lista recibida', () => {
    const prices = [price('Coto', 300), price('Vea', 100)];
    referenceSummary(prices, TODAY);
    expect(prices.map(p => p.bandera)).toEqual(['Coto', 'Vea']);
  });

  it('con una sola cadena, la referencia es su precio', () => {
    const summary = referenceSummary([price('Coto', 4321.5, { minimo: 4000, maximo: 4500 })], TODAY);
    expect(summary).toMatchObject({ reference: 4321.5, chains: 1, range: [4000, 4500] });
    expect(summary?.cheapest.bandera).toBe('Coto');
  });

  it('el rango va del menor mínimo al mayor máximo', () => {
    const summary = referenceSummary(
      [price('Coto', 500, { minimo: 450, maximo: 700 }), price('DIA', 400, { minimo: 380, maximo: 520 })], TODAY,
    );
    expect(summary?.range).toEqual([380, 700]);
  });

  it('la fecha es la más reciente de las cadenas', () => {
    const summary = referenceSummary(
      [price('Coto', 1, { actualizado: '2026-11-10' }), price('DIA', 1, { actualizado: '2026-11-15' })], TODAY,
    );
    expect(summary?.date).toBe('2026-11-15');
  });

  it('marca stale con más de 7 días', () => {
    expect(referenceSummary([price('Coto', 1, { actualizado: '2026-11-09' })], TODAY)?.stale).toBe(false);
    expect(referenceSummary([price('Coto', 1, { actualizado: '2026-11-08' })], TODAY)?.stale).toBe(true);
  });
});

describe('vsReference y referenceStatus', () => {
  it('$5.000 contra $5.550 está 9,9 % por debajo', () => {
    expect(vsReference(5000, 5550)).toBeCloseTo(-9.91, 2);
    expect(referenceStatus(vsReference(5000, 5550))).toBe('below');
  });

  it('entre −5 % y +5 % está en línea, bordes incluidos', () => {
    expect(referenceStatus(-5)).toBe('inline');
    expect(referenceStatus(0)).toBe('inline');
    expect(referenceStatus(5)).toBe('inline');
  });

  it('más de 5 % de diferencia está por debajo o por encima', () => {
    expect(referenceStatus(-5.1)).toBe('below');
    expect(referenceStatus(5.1)).toBe('above');
    expect(referenceStatus(vsReference(108, 100))).toBe('above');
  });
});

describe('daysSince', () => {
  it('cuenta días de calendario respecto del día local', () => {
    expect(daysSince('2026-11-16', new Date(2026, 10, 16, 23, 59))).toBe(0);
    expect(daysSince('2026-11-15', new Date(2026, 10, 16, 0, 1))).toBe(1);
    expect(daysSince('2026-10-31', TODAY)).toBe(16);
  });
});

describe('groupSepaPrices', () => {
  const row: SepaPriceRow = {
    ean: '7793704000911', minimo: '4100.00', mediana: '4250.50', maximo: 4400, sucursales: 122,
    actualizado: '2026-11-16', sepa_banderas: { nombre: 'Coto' },
  };

  it('agrupa por EAN con el nombre de la bandera y los montos como números', () => {
    const byEan = groupSepaPrices([row, { ...row, sepa_banderas: { nombre: 'DIA' } }, { ...row, ean: '7790070012345' }]);
    expect(byEan.get('7793704000911')).toEqual([
      { ean: '7793704000911', bandera: 'Coto', minimo: 4100, mediana: 4250.5, maximo: 4400, sucursales: 122, actualizado: '2026-11-16' },
      { ean: '7793704000911', bandera: 'DIA', minimo: 4100, mediana: 4250.5, maximo: 4400, sucursales: 122, actualizado: '2026-11-16' },
    ]);
    expect(byEan.get('7790070012345')).toHaveLength(1);
  });

  it('descarta una fila sin bandera', () => {
    expect(groupSepaPrices([{ ...row, sepa_banderas: null }]).size).toBe(0);
  });
});

describe('referenceLabel y referenceShortLabel', () => {
  it('$5.000 contra un promedio de $5.550 dice "9,9 % por debajo de la referencia"', () => {
    expect(referenceLabel(vsReference(5000, 5550))).toBe('9,9 % por debajo de la referencia');
    expect(referenceShortLabel(vsReference(5000, 5550))).toBe('9,9 % abajo');
  });

  it('en línea y por encima', () => {
    expect(referenceLabel(3)).toBe('En línea con la referencia');
    expect(referenceShortLabel(-3)).toBe('en línea');
    expect(referenceLabel(8)).toBe('8 % por encima de la referencia');
    expect(referenceShortLabel(8)).toBe('8 % arriba');
  });
});

describe('freshnessLabel', () => {
  it('hoy, ayer o hace N días mientras no son viejos', () => {
    expect(freshnessLabel({ date: '2026-11-16', stale: false }, TODAY)).toBe('Actualizado hoy');
    expect(freshnessLabel({ date: '2026-11-15', stale: false }, TODAY)).toBe('Actualizado ayer');
    expect(freshnessLabel({ date: '2026-11-12', stale: false }, TODAY)).toBe('Actualizado hace 4 días');
  });

  it('con más de 7 días muestra la fecha', () => {
    expect(freshnessLabel({ date: '2026-11-02', stale: true }, TODAY)).toBe('Datos del 02/11/2026');
  });
});
