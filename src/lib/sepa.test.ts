import { describe, expect, it } from 'vitest';
import { accentPattern, isSearchableQuery, SepaProduct, SepaProductRow, suggestedName, toSepaProduct, wordFilter } from './sepa';

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
