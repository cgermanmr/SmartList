// Lector de códigos de barras con la cámara: lógica sin React.

import { toGtin13 } from './gtin';

// ── Cámara ─────────────────────────────────────────────

/** true si el navegador puede pedir la cámara (sin HTTPS, getUserMedia no existe) */
export function cameraAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

// ── Detector ─────────────────────────────────────────────

/** Solo formatos de producto: menos falsos positivos y detección más rápida */
export const PRODUCT_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;
type ProductFormat = (typeof PRODUCT_FORMATS)[number];

/** .wasm de ZXing en el propio origen (lo copia `scripts/copy-zxing-wasm.ts` en el postinstall) */
export const ZXING_WASM_PATH = '/zxing_reader.wasm';

/** Lo que usa el lector de la API BarcodeDetector (la nativa y el ponyfill tienen la misma forma) */
export interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

interface BarcodeDetectorClass {
  new (options: { formats: ProductFormat[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<readonly string[]>;
}

/** Detector nativo si soporta los formatos; si no, el ponyfill (import dinámico) */
export async function createDetector(): Promise<BarcodeDetectorLike> {
  const native = (globalThis as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
  if (native && (await supportsProductFormats(native))) {
    return new native({ formats: [...PRODUCT_FORMATS] });
  }
  return createPonyfillDetector();
}

async function supportsProductFormats(detector: BarcodeDetectorClass): Promise<boolean> {
  try {
    const supported = await detector.getSupportedFormats();
    return PRODUCT_FORMATS.every((format) => supported.includes(format));
  } catch {
    return false;
  }
}

// El ponyfill y su .wasm se cargan una sola vez; si fallan, el próximo intento vuelve a empezar
let ponyfill: Promise<BarcodeDetectorClass> | null = null;

async function createPonyfillDetector(): Promise<BarcodeDetectorLike> {
  ponyfill ??= loadPonyfill().catch((error: unknown) => {
    ponyfill = null;
    throw error;
  });
  const Detector = await ponyfill;
  return new Detector({ formats: [...PRODUCT_FORMATS] });
}

async function loadPonyfill(): Promise<BarcodeDetectorClass> {
  const { BarcodeDetector, prepareZXingModule, purgeZXingModule, ZXING_WASM_VERSION } =
    await import('barcode-detector/ponyfill');
  try {
    // Por defecto el paquete baja el .wasm de jsDelivr: se sirve desde el propio dominio.
    // fireImmediately lo descarga ya, así el lector muestra "Preparando…" y detecta la falla al abrir.
    await prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith('.wasm') ? `${ZXING_WASM_PATH}?v=${ZXING_WASM_VERSION}` : prefix + path,
      },
      fireImmediately: true,
    });
  } catch (error) {
    purgeZXingModule();
    throw error;
  }
  return BarcodeDetector;
}

// ── Confirmación de lecturas ─────────────────────────────────────────────

/**
 * Acepta un código recién cuando se leyó igual 2 veces seguidas (descarta lecturas parciales).
 * Cada lectura se normaliza con toGtin13: una inválida devuelve null y corta la racha.
 * Las lecturas se comparan ya normalizadas (un UPC-A y su EAN-13 cuentan como iguales).
 * Devuelve el GTIN-13 aceptado y vuelve a empezar; si no, null.
 */
export function createConfirmer(): (raw: string) => string | null {
  let last: string | null = null;
  return (raw) => {
    const gtin = toGtin13(raw.trim());
    if (gtin === null || gtin !== last) {
      last = gtin;
      return null;
    }
    last = null;
    return gtin;
  };
}
