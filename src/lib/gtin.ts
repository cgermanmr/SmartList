// Códigos de barras GTIN (EAN-8, UPC-A, EAN-13, GTIN-14): validación y normalización a 13 dígitos.
// Sin dependencias: lo usan la app y los scripts del ETL SEPA (que lo importan con extensión .ts).

const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

// ── Validación ─────────────────────────────────────────────

/** true si tiene 8, 12, 13 o 14 dígitos y el dígito verificador GS1 es correcto */
export function isValidGtin(code: string): boolean {
  if (!/^[0-9]+$/.test(code) || !GTIN_LENGTHS.has(code.length)) return false;
  return checkDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/** Dígito verificador GS1: desde la derecha, pesos 3 y 1 alternados */
function checkDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

// ── Normalización ─────────────────────────────────────────────

/**
 * GTIN-13 (13 dígitos), el formato en que el SEPA guarda los EAN.
 * EAN-8 y UPC-A se completan con ceros a la izquierda; un GTIN-14 que empieza con 0 pierde ese cero.
 * Un código inválido o un GTIN-14 de otro nivel de empaque → null.
 */
export function toGtin13(code: string): string | null {
  if (!isValidGtin(code)) return null;
  if (code.length === 14) return code.startsWith('0') ? code.slice(1) : null;
  return code.padStart(13, '0');
}
