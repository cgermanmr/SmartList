import { describe, expect, it } from 'vitest';
import type { Product } from './models';
import { fitWithin, pendingUploads, photoPath, productImageSrc, unreferencedPhotos } from './photo';

const PRODUCT: Product = { id: 'p1', name: 'Yerba' };
const withPhoto = (id: string, extra: Partial<Product> = {}): Product => ({
  ...PRODUCT,
  ...extra,
  photo: { id, takenAt: '2026-11-22T10:00:00.000Z' },
});

describe('fitWithin', () => {
  it('achica una foto horizontal hasta el lado mayor', () => {
    expect(fitWithin(4000, 3000, 800)).toEqual({ width: 800, height: 600 });
  });

  it('achica una foto vertical hasta el lado mayor', () => {
    expect(fitWithin(3000, 4000, 800)).toEqual({ width: 600, height: 800 });
  });

  it('no agranda una foto más chica que el máximo', () => {
    expect(fitWithin(500, 300, 800)).toEqual({ width: 500, height: 300 });
  });

  it('deja igual una foto que ya mide el máximo', () => {
    expect(fitWithin(800, 800, 800)).toEqual({ width: 800, height: 800 });
  });

  it('redondea a píxeles enteros y nunca da 0', () => {
    expect(fitWithin(4001, 3, 800)).toEqual({ width: 800, height: 1 });
  });
});

describe('photoPath', () => {
  it('arma <userId>/<photoId>.jpg', () => {
    expect(photoPath('u-123', '1763800000000abc')).toBe('u-123/1763800000000abc.jpg');
  });
});

describe('unreferencedPhotos', () => {
  it('devuelve las fotos guardadas que ningún producto usa', () => {
    const products = [withPhoto('a'), PRODUCT, withPhoto('c', { id: 'p3' })];
    expect(unreferencedPhotos(products, ['a', 'b', 'c', 'd'])).toEqual(['b', 'd']);
  });

  it('sin fotos guardadas no devuelve nada', () => {
    expect(unreferencedPhotos([withPhoto('a')], [])).toEqual([]);
  });

  it('sin productos con foto, todas sobran', () => {
    expect(unreferencedPhotos([PRODUCT], ['a'])).toEqual(['a']);
  });
});

describe('productImageSrc', () => {
  it('la foto propia va primero', () => {
    expect(productImageSrc(withPhoto('a', { image: 'img.jpg' }), 'blob:foto', 'catalogo.jpg')).toBe('blob:foto');
  });

  it('sin la foto cargada todavía, usa image', () => {
    expect(productImageSrc(withPhoto('a', { image: 'img.jpg' }), undefined, 'catalogo.jpg')).toBe('img.jpg');
  });

  it('sin foto ni image, la del catálogo', () => {
    expect(productImageSrc(PRODUCT, undefined, 'catalogo.jpg')).toBe('catalogo.jpg');
  });

  it('sin nada, undefined (queda la inicial)', () => {
    expect(productImageSrc(PRODUCT)).toBeUndefined();
  });

  it('ignora una URL de foto si el producto ya no tiene foto', () => {
    expect(productImageSrc(PRODUCT, 'blob:vieja', 'catalogo.jpg')).toBe('catalogo.jpg');
  });
});

describe('pendingUploads', () => {
  const stored = (id: string, uploaded: boolean) => ({ id, uploaded });

  it('devuelve las fotos sin subir que usa algún producto', () => {
    const products = [withPhoto('a'), withPhoto('b', { id: 'p2' }), PRODUCT];
    expect(pendingUploads(products, [stored('a', false), stored('b', true), stored('c', false)])).toEqual(['a']);
  });

  it('sin productos con foto no sube nada', () => {
    expect(pendingUploads([PRODUCT], [stored('a', false)])).toEqual([]);
  });
});
