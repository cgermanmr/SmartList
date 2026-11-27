import { describe, expect, it } from 'vitest';
import { deleteBlockedReason, deleteMessage } from './product-delete';

describe('deleteBlockedReason', () => {
  it('sin código y sin compras se puede', () => {
    expect(deleteBlockedReason({ purchases: 0, ean: false, canUnlink: true, fromSepa: false })).toBeNull();
    expect(deleteBlockedReason({ purchases: 0, ean: false, canUnlink: false, fromSepa: false })).toBeNull();
  });

  it('en una compra, en singular', () => {
    expect(deleteBlockedReason({ purchases: 1, ean: false, canUnlink: true, fromSepa: false }))
      .toBe('No se puede eliminar: está en 1 compra de tu historial.');
  });

  it('en varias compras, en plural', () => {
    expect(deleteBlockedReason({ purchases: 3, ean: false, canUnlink: true, fromSepa: false }))
      .toBe('No se puede eliminar: está en 3 compras de tu historial.');
  });

  it('con código y con Quitar vínculo disponible, dice cómo', () => {
    expect(deleteBlockedReason({ purchases: 0, ean: true, canUnlink: true, fromSepa: false }))
      .toBe('No se puede eliminar: está vinculado con Precios Claros o tiene código de barras. Quitá el vínculo primero.');
  });

  it('con código y sin Quitar vínculo, solo el motivo', () => {
    expect(deleteBlockedReason({ purchases: 0, ean: true, canUnlink: false, fromSepa: false }))
      .toBe('No se puede eliminar: tiene código de barras.');
  });

  it('de Precios Claros: su motivo, con Supabase o sin él (spec 36)', () => {
    for (const canUnlink of [true, false]) {
      expect(deleteBlockedReason({ purchases: 0, ean: true, canUnlink, fromSepa: true }))
        .toBe('No se puede eliminar: es un producto de Precios Claros.');
    }
  });

  it('de Precios Claros y en una compra, gana la compra', () => {
    expect(deleteBlockedReason({ purchases: 1, ean: true, canUnlink: true, fromSepa: true }))
      .toBe('No se puede eliminar: está en 1 compra de tu historial.');
  });

  it('con código y en una compra, gana la compra', () => {
    expect(deleteBlockedReason({ purchases: 2, ean: true, canUnlink: true, fromSepa: false }))
      .toBe('No se puede eliminar: está en 2 compras de tu historial.');
  });
});

describe('deleteMessage', () => {
  const nothing = { prices: 0, photo: false, inCart: false, signedIn: false };

  it.each([
    [3, true, 'Se borran también sus 3 precios y tu foto. No se puede deshacer.'],
    [1, true, 'Se borran también su precio y tu foto. No se puede deshacer.'],
    [3, false, 'Se borran también sus 3 precios. No se puede deshacer.'],
    [1, false, 'Se borra también su precio. No se puede deshacer.'],
    [0, true, 'Se borra también tu foto. No se puede deshacer.'],
    [0, false, 'No se puede deshacer.'],
  ])('%i precios y foto %s', (prices, photo, text) => {
    expect(deleteMessage({ ...nothing, prices, photo })).toBe(text);
  });

  it('en el carrito', () => {
    expect(deleteMessage({ ...nothing, inCart: true })).toBe('Se quita del carrito. No se puede deshacer.');
  });

  it('con sesión', () => {
    expect(deleteMessage({ ...nothing, signedIn: true }))
      .toBe('Se elimina en todos tus dispositivos. No se puede deshacer.');
  });

  it('todo junto, en orden', () => {
    expect(deleteMessage({ prices: 3, photo: true, inCart: true, signedIn: true })).toBe(
      'Se borran también sus 3 precios y tu foto. Se quita del carrito. Se elimina en todos tus dispositivos. No se puede deshacer.');
  });
});
