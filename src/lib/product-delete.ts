// ── Eliminar un producto: textos (spec 33) ───────────────────

/** "No se puede eliminar: está en 2 compras de tu historial."; null si se puede */
export function deleteBlockedReason(info: { purchases: number; ean: boolean; canUnlink: boolean }): string | null {
  // Con los dos motivos va el de las compras: quitar el vínculo no alcanzaría
  if (info.purchases > 0) {
    return `No se puede eliminar: está en ${info.purchases} ${info.purchases === 1 ? 'compra' : 'compras'} de tu historial.`;
  }
  if (!info.ean) return null;
  return info.canUnlink
    ? 'No se puede eliminar: está vinculado con Precios Claros o tiene código de barras. Quitá el vínculo primero.'
    : 'No se puede eliminar: tiene código de barras.';
}

/** Mensaje de la confirmación: solo lo que se pierde en este caso */
export function deleteMessage(info: { prices: number; photo: boolean; inCart: boolean; signedIn: boolean }): string {
  return [
    lossLine(info.prices, info.photo),
    info.inCart && 'Se quita del carrito.',
    info.signedIn && 'Se elimina en todos tus dispositivos.',
    'No se puede deshacer.',
  ].filter(Boolean).join(' ');
}

function lossLine(prices: number, photo: boolean): string | null {
  const own = prices === 1 ? 'su precio' : `sus ${prices} precios`;
  if (prices > 0 && photo) return `Se borran también ${own} y tu foto.`;
  if (prices > 0) return `${prices === 1 ? 'Se borra' : 'Se borran'} también ${own}.`;
  return photo ? 'Se borra también tu foto.' : null;
}
