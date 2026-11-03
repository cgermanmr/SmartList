import { describe, expect, it } from 'vitest';
import { isFooter, median, normalizeSpaces, normalizeUnit, parseFooterDate, parseLine, parsePrice, presentation } from './clean.ts';

// Líneas reales de productos.csv del archivo SEPA del 30/10/2026 (17 columnas)
const CARREFOUR = '10|1|1|7791720048313|1|MIX CROCANTE CARREFOUR CLASSIC X 40 GRS|1|UNI|CARREFOUR CLASSIC|2090.00|52250.00|40|GRM||||';
const UNICOOP = '47|1|1|0000077956262|1|SAL FINA CELUSAL X250G.SALERO           |00250|gr||04210.00|16840.00|00250|gr||||';
const CHANGOMAS_HUEVOS = '11|2|1007|0000000065252|1|HUEVOS C SEL X 6UN|6|EA|SIN MARCA|1099.00|1099.00|6|EA||||';
const DIA_PROMO = '15|1|1|7506339332643|1|SUAVIZ P/ROPA BRISA|1.00|LT|DOWNY|17190.00|17190.00|1.00|LT|||11173.50|35% de descuento. 35% DOWNY - Vigencia: Desde el 28/10/2026 hasta el 02/11/2026';
const COLUMNS = 17;

describe('parseLine', () => {
  it('separa por | y recorta el relleno de espacios', () => {
    const fields = parseLine(UNICOOP, COLUMNS);
    expect(fields).toHaveLength(17);
    expect(fields![3]).toBe('0000077956262');
    expect(fields![5]).toBe('SAL FINA CELUSAL X250G.SALERO');
    expect(fields![8]).toBe('');
    expect(fields![9]).toBe('04210.00');
  });

  it('conserva los campos vacíos del final', () => {
    const fields = parseLine(CARREFOUR, COLUMNS);
    expect(fields).toHaveLength(17);
    expect(fields!.slice(13)).toEqual(['', '', '', '']);
  });

  it('lee una línea con leyenda de promoción', () => {
    expect(parseLine(DIA_PROMO, COLUMNS)![16]).toBe('35% de descuento. 35% DOWNY - Vigencia: Desde el 28/10/2026 hasta el 02/11/2026');
  });

  it('recorta un encabezado con BOM y relleno de espacios', () => {
    expect(parseLine('﻿id_comercio|id_bandera  |comercio_version_sepa      ', 3)).toEqual([
      'id_comercio', 'id_bandera', 'comercio_version_sepa',
    ]);
  });

  it('devuelve null si faltan columnas', () => {
    expect(parseLine('10|1|1|7791720048313', COLUMNS)).toBeNull();
    expect(parseLine('', COLUMNS)).toBeNull();
  });

  it('devuelve null en el pie, con o sin tilde o con caracteres rotos', () => {
    expect(parseLine('Última actualización: 2026-10-30T04:00:59-03:00', 1)).toBeNull();
    expect(parseLine('Ultima actualización: 2026-10-30T08:30:03-03:00', 1)).toBeNull();
    expect(parseLine('Ultima actualizacion: 2025-06-11T21:00:01-03:00', 1)).toBeNull();
    expect(parseLine('�ltima actualizaci�n: 2026-10-30T05:20:23-03:00', 1)).toBeNull();
    expect(parseLine('Ultima actualizaci�n: 2026-10-30T09:19:16-03:00', 1)).toBeNull();
  });
});

describe('isFooter', () => {
  it('reconoce el pie con o sin tildes y no una fila de datos', () => {
    expect(isFooter('Última actualización: 2026-10-30T04:00:59-03:00')).toBe(true);
    expect(isFooter('�ltima actualizaci�n: 2026-10-30T05:20:23-03:00')).toBe(true);
    expect(isFooter('Ultima actualizacion:')).toBe(true);
    expect(isFooter(CARREFOUR)).toBe(false);
  });
});

describe('normalizeSpaces', () => {
  it('recorta y colapsa espacios repetidos', () => {
    expect(normalizeSpaces('  SAL  FINA   CELUSAL ')).toBe('SAL FINA CELUSAL');
    expect(normalizeSpaces('Sup. Unicoop        ')).toBe('Sup. Unicoop');
    expect(normalizeSpaces('   ')).toBe('');
  });
});

describe('parseFooterDate', () => {
  it('saca la fecha del pie con zona -03:00 o -0300', () => {
    expect(parseFooterDate('Ultima actualizaci�n: 2026-10-30T09:19:16-03:00')).toBe('2026-10-30');
    expect(parseFooterDate('Última actualización: 2026-10-30T04:00:59-0300')).toBe('2026-10-30');
    expect(parseFooterDate('Ultima actualizacion: 2025-06-11T21:00:01-03:00')).toBe('2025-06-11');
  });

  it('devuelve null si no hay fecha', () => {
    expect(parseFooterDate('Última actualización:')).toBeNull();
    expect(parseFooterDate(CARREFOUR)).toBeNull();
  });
});

describe('parsePrice', () => {
  it('lee precios con ceros adelante', () => {
    expect(parsePrice('04210.00')).toBe(4210);
    expect(parsePrice('2090.00')).toBe(2090);
    expect(parsePrice('4693.33')).toBe(4693.33);
  });

  it('devuelve null si es 0, negativo, vacío o no es número', () => {
    expect(parsePrice('0')).toBeNull();
    expect(parsePrice('0.00')).toBeNull();
    expect(parsePrice('-10.00')).toBeNull();
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('S/D')).toBeNull();
  });
});

describe('normalizeUnit', () => {
  const casos: [string[], { factor: number; unit: string }][] = [
    [['G', 'GR', 'GRS', 'GRM', 'GRAMOS'], { factor: 1, unit: 'g' }],
    [['KG', 'KGM', 'KGR', 'KILO'], { factor: 1000, unit: 'g' }],
    [['ML', 'CC', 'CM3', 'CMQ'], { factor: 1, unit: 'ml' }],
    [['L', 'LT', 'LTR', 'LITRO'], { factor: 1000, unit: 'ml' }],
    [['U', 'UN', 'UNI', 'UD', 'UNIDA', 'UNIDAD', 'EA', 'CU', 'PC'], { factor: 1, unit: 'u' }],
  ];

  for (const [entradas, salida] of casos) {
    it(`${entradas.join(', ')} → ${salida.unit} × ${salida.factor}`, () => {
      for (const entrada of entradas) expect(normalizeUnit(entrada)).toEqual(salida);
    });
  }

  it('no distingue mayúsculas y saca el punto final', () => {
    expect(normalizeUnit('gr')).toEqual({ factor: 1, unit: 'g' });
    expect(normalizeUnit('kgr')).toEqual({ factor: 1000, unit: 'g' });
    expect(normalizeUnit('KG.')).toEqual({ factor: 1000, unit: 'g' });
    expect(normalizeUnit('GR.')).toEqual({ factor: 1, unit: 'g' });
    expect(normalizeUnit('LT.')).toEqual({ factor: 1000, unit: 'ml' });
    expect(normalizeUnit('ML.')).toEqual({ factor: 1, unit: 'ml' });
    expect(normalizeUnit('cm3')).toEqual({ factor: 1, unit: 'ml' });
  });

  it('devuelve null para unidades que no son peso, volumen ni unidades', () => {
    for (const entrada of ['CM', 'MT', 'M2', 'CL', 'CJ', 'PAN', '']) expect(normalizeUnit(entrada)).toBeNull();
  });
});

describe('presentation', () => {
  it('1. presentación de peso o volumen: DIA 500 GR → 500 g', () => {
    expect(presentation({ cantidadPresentacion: '500.00', unidadPresentacion: 'GR', cantidadReferencia: '1.00', unidadReferencia: 'KG' }))
      .toEqual({ cantidad: 500, unidad: 'g' });
  });

  it('1. aplica el factor: Changomás 0.02 KG → 20 g y 0.1 L → 100 ml', () => {
    expect(presentation({ cantidadPresentacion: '0.02', unidadPresentacion: 'KG', cantidadReferencia: '0.02', unidadReferencia: 'EA' }))
      .toEqual({ cantidad: 20, unidad: 'g' });
    expect(presentation({ cantidadPresentacion: '0.1', unidadPresentacion: 'L', cantidadReferencia: '0.1', unidadReferencia: 'EA' }))
      .toEqual({ cantidad: 100, unidad: 'ml' });
  });

  it('2. presentación en unidades y referencia de peso: Carrefour 1 UNI / 40 GRM → 40 g', () => {
    expect(presentation({ cantidadPresentacion: '1', unidadPresentacion: 'UNI', cantidadReferencia: '40', unidadReferencia: 'GRM' }))
      .toEqual({ cantidad: 40, unidad: 'g' });
  });

  it('3. ambas en unidades: huevos 6 EA → 6 u', () => {
    expect(presentation({ cantidadPresentacion: '6', unidadPresentacion: 'EA', cantidadReferencia: '6', unidadReferencia: 'EA' }))
      .toEqual({ cantidad: 6, unidad: 'u' });
  });

  it('4. unidades no reconocidas no proponen presentación', () => {
    expect(presentation({ cantidadPresentacion: '5.00', unidadPresentacion: 'MT', cantidadReferencia: '1.00', unidadReferencia: 'MT' })).toBeNull();
    expect(presentation({ cantidadPresentacion: '33.00', unidadPresentacion: 'CL', cantidadReferencia: '1.00', unidadReferencia: 'UD' })).toBeNull();
    expect(presentation({ cantidadPresentacion: '1', unidadPresentacion: 'CJ', cantidadReferencia: '144', unidadReferencia: 'UNI' })).toBeNull();
  });

  it('4. cantidad 0 o no numérica no propone presentación', () => {
    expect(presentation({ cantidadPresentacion: '00000', unidadPresentacion: 'un', cantidadReferencia: '00000', unidadReferencia: 'un' })).toBeNull();
    expect(presentation({ cantidadPresentacion: '', unidadPresentacion: 'GR', cantidadReferencia: '100', unidadReferencia: 'GR' })).toBeNull();
    expect(presentation({ cantidadPresentacion: '1', unidadPresentacion: 'UNI', cantidadReferencia: 'x', unidadReferencia: 'GRM' })).toBeNull();
  });

  it('de una línea real a la presentación: Carrefour → 40 g, huevos de Changomás → 6 u', () => {
    const fromLine = (line: string) => {
      const f = parseLine(line, COLUMNS)!;
      return presentation({ cantidadPresentacion: f[6], unidadPresentacion: f[7], cantidadReferencia: f[11], unidadReferencia: f[12] });
    };
    expect(fromLine(CARREFOUR)).toEqual({ cantidad: 40, unidad: 'g' });
    expect(fromLine(CHANGOMAS_HUEVOS)).toEqual({ cantidad: 6, unidad: 'u' });
    expect(fromLine(UNICOOP)).toEqual({ cantidad: 250, unidad: 'g' });
  });

  it('lee cantidades con ceros adelante: Unicoop 00250 gr → 250 g', () => {
    expect(presentation({ cantidadPresentacion: '00250', unidadPresentacion: 'gr', cantidadReferencia: '00250', unidadReferencia: 'gr' }))
      .toEqual({ cantidad: 250, unidad: 'g' });
  });
});

describe('median', () => {
  it('con cantidad impar, el valor central', () => {
    expect(median([3])).toBe(3);
    expect(median([5, 1, 3])).toBe(3);
  });

  it('con cantidad par, el promedio de los dos centrales', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([2090, 2190])).toBe(2140);
  });

  it('no se deja llevar por un valor absurdo', () => {
    expect(median([1000, 1010, 1020, 990000])).toBe(1015);
  });

  it('no modifica el array recibido', () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });

  it('falla con un array vacío', () => {
    expect(() => median([])).toThrow();
  });
});
