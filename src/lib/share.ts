// ── Compartir la app (spec 30) ─────

/** Dirección de producción: es la que se comparte siempre, también desde la preview o localhost */
export const APP_URL = 'https://elchanguito.vercel.app';

export const APP_DESCRIPTION = 'Compará precios de los comercios cerca tuyo y armá tu compra.';

export const SHARE_TEXT =
  'Mirá El Changuito: leés el código de un producto y te dice dónde está más barato cerca tuyo. Gratis y sin instalar nada.';

/** Link de WhatsApp con el texto y la dirección en otro renglón */
export function whatsappUrl(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
}
