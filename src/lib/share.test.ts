import { describe, expect, it } from 'vitest';
import { APP_URL, SHARE_TEXT, whatsappUrl } from './share';

describe('whatsappUrl', () => {
  it('apunta a wa.me sin destinatario', () => {
    const url = new URL(whatsappUrl('Hola', APP_URL));
    expect(url.origin + url.pathname).toBe('https://wa.me/');
    expect([...url.searchParams.keys()]).toEqual(['text']);
  });

  it('devuelve el texto y la dirección en otro renglón al decodificar', () => {
    const url = new URL(whatsappUrl(SHARE_TEXT, APP_URL));
    expect(url.searchParams.get('text')).toBe(
      'Mirá El Changuito: leés el código de un producto y te dice dónde está más barato cerca tuyo. ' +
        'Gratis y sin instalar nada.\nhttps://elchanguito.vercel.app',
    );
  });

  it('conserva los caracteres que separan partes de una URL', () => {
    const url = new URL(whatsappUrl('Pan & leche + 100 % #1?', 'https://ejemplo.com/a?b=1&c=2#d'));
    expect(url.searchParams.get('text')).toBe('Pan & leche + 100 % #1?\nhttps://ejemplo.com/a?b=1&c=2#d');
    expect(url.hash).toBe('');
  });

  it('codifica los espacios como %20 y no como +', () => {
    expect(whatsappUrl('a b', APP_URL)).toContain('a%20b%0A');
  });
});
