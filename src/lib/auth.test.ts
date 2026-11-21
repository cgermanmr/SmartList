import { describe, expect, it } from 'vitest';
import { displayName, isIosStandalone, validCode, validEmail } from './auth';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';

describe('displayName', () => {
  it('usa el nombre completo de Google', () => {
    expect(displayName({ email: 'ana@x.com', user_metadata: { full_name: 'Ana Pérez', name: 'Ana' } })).toBe('Ana Pérez');
  });

  it('si no, el nombre', () => {
    expect(displayName({ email: 'ana@x.com', user_metadata: { name: 'Ana' } })).toBe('Ana');
  });

  it('con solo el mail, la parte antes de la arroba', () => {
    expect(displayName({ email: 'ana.perez@x.com', user_metadata: {} })).toBe('ana.perez');
  });
});

describe('validEmail', () => {
  it('acepta un mail con dominio', () => {
    expect(validEmail('a@b.co')).toBe(true);
    expect(validEmail(' a@b.co ')).toBe(true);
  });

  it('rechaza un mail sin dominio o sin arroba', () => {
    expect(validEmail('a@b')).toBe(false);
    expect(validEmail('ab.co')).toBe(false);
    expect(validEmail('')).toBe(false);
  });
});

describe('validCode', () => {
  it('acepta 6 dígitos, con o sin espacios', () => {
    expect(validCode('123456')).toBe(true);
    expect(validCode('123 456')).toBe(true);
  });

  it('rechaza otras longitudes y letras', () => {
    expect(validCode('12345')).toBe(false);
    expect(validCode('1234567')).toBe(false);
    expect(validCode('abcdef')).toBe(false);
  });
});

describe('isIosStandalone', () => {
  it('solo en el iPhone con la app instalada', () => {
    expect(isIosStandalone(IPHONE, true)).toBe(true);
    expect(isIosStandalone(IPHONE, false)).toBe(false);
    expect(isIosStandalone(ANDROID, true)).toBe(false);
  });
});
