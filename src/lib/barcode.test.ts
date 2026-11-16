import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cameraAvailable, createConfirmer } from './barcode';

// ── Cámara ─────────────────────────────────────────────

describe('cameraAvailable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('true si existe navigator.mediaDevices.getUserMedia', () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => Promise.resolve() } });
    expect(cameraAvailable()).toBe(true);
  });

  it('false sin mediaDevices (por ejemplo, sin HTTPS)', () => {
    vi.stubGlobal('navigator', {});
    expect(cameraAvailable()).toBe(false);
  });
});

// ── Detector ─────────────────────────────────────────────

const ponyfill = vi.hoisted(() => ({
  BarcodeDetector: class {
    options: { formats: string[] };
    constructor(options: { formats: string[] }) {
      this.options = options;
    }
    detect() {
      return Promise.resolve([]);
    }
  },
  prepareZXingModule: vi.fn(() => Promise.resolve({})),
  purgeZXingModule: vi.fn(),
  ZXING_WASM_VERSION: '9.9.9',
}));

vi.mock('barcode-detector/ponyfill', () => ponyfill);

/** BarcodeDetector nativo de mentira que soporta los formatos pedidos */
function stubNative(formats: string[]) {
  const Native = class {
    options: { formats: string[] };
    constructor(options: { formats: string[] }) {
      this.options = options;
    }
    static getSupportedFormats() {
      return Promise.resolve(formats);
    }
    detect() {
      return Promise.resolve([]);
    }
  };
  vi.stubGlobal('BarcodeDetector', Native);
  return Native;
}

/** barcode.ts guarda el ponyfill cargado: cada test lo importa de nuevo */
async function freshCreateDetector() {
  vi.resetModules();
  return (await import('./barcode')).createDetector;
}

describe('createDetector', () => {
  beforeEach(() => {
    ponyfill.prepareZXingModule.mockReset().mockImplementation(() => Promise.resolve({}));
    ponyfill.purgeZXingModule.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('usa la API nativa si soporta los formatos de producto', async () => {
    const Native = stubNative(['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e']);
    const detector = await (await freshCreateDetector())();
    expect(detector).toBeInstanceOf(Native);
    expect(ponyfill.prepareZXingModule).not.toHaveBeenCalled();
  });

  it('pide solo los formatos de producto', async () => {
    stubNative(['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e']);
    const detector = (await (await freshCreateDetector())()) as unknown as { options: { formats: string[] } };
    expect(detector.options.formats).toEqual(['ean_13', 'ean_8', 'upc_a', 'upc_e']);
  });

  it('usa el ponyfill si la API nativa no soporta todos los formatos', async () => {
    stubNative(['qr_code', 'ean_13']);
    const detector = await (await freshCreateDetector())();
    expect(detector).toBeInstanceOf(ponyfill.BarcodeDetector);
  });

  it('usa el ponyfill si no hay API nativa', async () => {
    const detector = await (await freshCreateDetector())();
    expect(detector).toBeInstanceOf(ponyfill.BarcodeDetector);
  });

  it('sirve el .wasm desde el propio dominio y lo descarga al crear el detector', async () => {
    await (await freshCreateDetector())();
    const [options] = ponyfill.prepareZXingModule.mock.calls[0] as unknown as [
      { overrides: { locateFile: (path: string, prefix: string) => string }; fireImmediately: boolean },
    ];
    expect(options.fireImmediately).toBe(true);
    expect(options.overrides.locateFile('zxing_reader.wasm', 'https://cdn/')).toBe('/zxing_reader.wasm?v=9.9.9');
  });

  it('carga el ponyfill una sola vez', async () => {
    const createDetector = await freshCreateDetector();
    await createDetector();
    await createDetector();
    expect(ponyfill.prepareZXingModule).toHaveBeenCalledTimes(1);
  });

  it('si falla la carga, rechaza y el próximo intento vuelve a empezar', async () => {
    ponyfill.prepareZXingModule.mockImplementationOnce(() => Promise.reject(new Error('sin red')));
    const createDetector = await freshCreateDetector();
    await expect(createDetector()).rejects.toThrow('sin red');
    expect(ponyfill.purgeZXingModule).toHaveBeenCalled();
    await expect(createDetector()).resolves.toBeInstanceOf(ponyfill.BarcodeDetector);
    expect(ponyfill.prepareZXingModule).toHaveBeenCalledTimes(2);
  });
});

// ── Confirmación de lecturas ─────────────────────────────────────────────

describe('createConfirmer', () => {
  it('con una sola lectura no acepta nada', () => {
    const confirm = createConfirmer();
    expect(confirm('7793704000911')).toBeNull();
  });

  it('con 2 lecturas iguales seguidas devuelve el código', () => {
    const confirm = createConfirmer();
    confirm('7793704000911');
    expect(confirm('7793704000911')).toBe('7793704000911');
  });

  it('con 2 lecturas distintas no acepta nada', () => {
    const confirm = createConfirmer();
    confirm('7793704000911');
    expect(confirm('77956262')).toBeNull();
  });

  it('acepta la segunda de dos lecturas iguales después de una distinta', () => {
    const confirm = createConfirmer();
    confirm('77956262');
    confirm('7793704000911');
    expect(confirm('7793704000911')).toBe('7793704000911');
  });

  it('devuelve el código normalizado a GTIN-13', () => {
    const confirm = createConfirmer();
    confirm('77956262');
    expect(confirm('77956262')).toBe('0000077956262');
  });

  it('compara las lecturas ya normalizadas', () => {
    const confirm = createConfirmer();
    confirm('012345678905');
    expect(confirm('0012345678905')).toBe('0012345678905');
  });

  it('nunca acepta un código con dígito verificador inválido', () => {
    const confirm = createConfirmer();
    expect(confirm('7793704000912')).toBeNull();
    expect(confirm('7793704000912')).toBeNull();
    expect(confirm('7793704000912')).toBeNull();
  });

  it('una lectura inválida corta la racha', () => {
    const confirm = createConfirmer();
    confirm('7793704000911');
    confirm('7793704000912');
    expect(confirm('7793704000911')).toBeNull();
  });

  it('después de aceptar, vuelve a pedir 2 lecturas', () => {
    const confirm = createConfirmer();
    confirm('7793704000911');
    confirm('7793704000911');
    expect(confirm('7793704000911')).toBeNull();
    expect(confirm('7793704000911')).toBe('7793704000911');
  });
});
