import { describe, expect, it } from 'vitest';
import { isValidGtin, toGtin13 } from './gtin';

describe('isValidGtin', () => {
  it('acepta EAN-13, EAN-8 y UPC-A con dígito verificador correcto', () => {
    expect(isValidGtin('7793704000911')).toBe(true);
    expect(isValidGtin('77956262')).toBe(true);
    expect(isValidGtin('012345678905')).toBe(true);
  });

  it('acepta GTIN-14', () => {
    expect(isValidGtin('07793704000911')).toBe(true);
    expect(isValidGtin('17793704000918')).toBe(true);
  });

  it('rechaza un dígito verificador incorrecto', () => {
    expect(isValidGtin('7793704000912')).toBe(false);
    expect(isValidGtin('77956263')).toBe(false);
    expect(isValidGtin('012345678906')).toBe(false);
  });

  it('rechaza largos que no son GTIN', () => {
    expect(isValidGtin('')).toBe(false);
    expect(isValidGtin('1234567')).toBe(false);
    expect(isValidGtin('7793704000')).toBe(false);
    expect(isValidGtin('779370400091100')).toBe(false);
  });

  it('rechaza caracteres que no son dígitos', () => {
    expect(isValidGtin('779370400091A')).toBe(false);
    expect(isValidGtin(' 7793704000911')).toBe(false);
    expect(isValidGtin('7793704-000911')).toBe(false);
  });
});

describe('toGtin13', () => {
  it('deja igual un EAN-13', () => {
    expect(toGtin13('7793704000911')).toBe('7793704000911');
  });

  it('completa EAN-8 y UPC-A con ceros a la izquierda', () => {
    expect(toGtin13('77956262')).toBe('0000077956262');
    expect(toGtin13('012345678905')).toBe('0012345678905');
  });

  it('a un GTIN-14 que empieza con 0 le quita ese cero', () => {
    expect(toGtin13('07793704000911')).toBe('7793704000911');
  });

  it('un GTIN-14 de otro nivel de empaque devuelve null', () => {
    expect(toGtin13('17793704000918')).toBeNull();
  });

  it('un código inválido devuelve null', () => {
    expect(toGtin13('7793704000912')).toBeNull();
    expect(toGtin13('1234567')).toBeNull();
    expect(toGtin13('abc')).toBeNull();
  });

  it('el resultado siempre es un GTIN válido de 13 dígitos', () => {
    for (const code of ['7793704000911', '77956262', '012345678905', '07793704000911']) {
      const gtin = toGtin13(code);
      expect(gtin).toHaveLength(13);
      expect(isValidGtin(gtin!)).toBe(true);
    }
  });
});
