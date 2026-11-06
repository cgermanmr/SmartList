import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { daysSince, fetchWithRetry, hasNewFile, isStale, parseCkanDate, pickLatestZip, todayInArgentina } from './etl.ts';

describe('parseCkanDate', () => {
  it('sin zona horaria la interpreta como UTC (formato real de CKAN, con microsegundos)', () => {
    expect(parseCkanDate('2026-11-04T16:19:50.656844')?.toISOString()).toBe('2026-11-04T16:19:50.656Z');
    expect(parseCkanDate('2026-11-04T16:19:50')?.toISOString()).toBe('2026-11-04T16:19:50.000Z');
    expect(parseCkanDate('2026-11-04T16:19')?.toISOString()).toBe('2026-11-04T16:19:00.000Z');
  });

  it('con zona horaria la respeta', () => {
    expect(parseCkanDate('2026-11-04T16:19:50.5Z')?.toISOString()).toBe('2026-11-04T16:19:50.500Z');
    expect(parseCkanDate('2026-11-04T13:19:50-03:00')?.toISOString()).toBe('2026-11-04T16:19:50.000Z');
    expect(parseCkanDate('2026-11-04T13:19:50.656844-0300')?.toISOString()).toBe('2026-11-04T16:19:50.656Z');
  });

  it('devuelve null si falta o no es una fecha con hora', () => {
    expect(parseCkanDate(null)).toBeNull();
    expect(parseCkanDate(undefined)).toBeNull();
    expect(parseCkanDate('')).toBeNull();
    expect(parseCkanDate('ayer')).toBeNull();
    expect(parseCkanDate('2026-11-04')).toBeNull();
    expect(parseCkanDate('2026-13-45T99:99:99')).toBeNull();
  });
});

describe('pickLatestZip', () => {
  it('elige el ZIP de last_modified más reciente e ignora los que no son ZIP', () => {
    const resources = [
      { name: 'jueves', format: 'ZIP', url: 'https://x/jueves.zip', last_modified: '2026-10-29T09:10:00.000000' },
      { name: 'viernes', format: 'ZIP', url: 'https://x/viernes.zip', last_modified: '2026-10-30T09:20:00.000000' },
      { name: 'diccionario', format: 'PDF', url: 'https://x/dic.pdf', last_modified: '2026-11-01T00:00:00.000000' },
      { name: 'miércoles', format: 'zip', url: 'https://x/miercoles.zip', last_modified: '2026-10-28T09:00:00.000000' },
    ];
    expect(pickLatestZip(resources)?.name).toBe('viernes');
  });

  it('compara mezclando fechas con y sin zona como instantes UTC', () => {
    const resources = [
      // 16:19 UTC sin zona; 13:30-03:00 = 16:30 UTC, posterior
      { name: 'sin zona', format: 'ZIP', url: 'https://x/a.zip', last_modified: '2026-11-04T16:19:50.656844' },
      { name: 'con zona', format: 'ZIP', url: 'https://x/b.zip', last_modified: '2026-11-04T13:30:00-03:00' },
    ];
    expect(pickLatestZip(resources)?.name).toBe('con zona');
  });

  it('ignora los recursos sin url o sin fecha', () => {
    const resources = [
      { name: 'sin url', format: 'ZIP', last_modified: '2026-11-01T00:00:00' },
      { name: 'sin fecha', format: 'ZIP', url: 'https://x/a.zip', last_modified: null },
      { name: 'fecha rota', format: 'ZIP', url: 'https://x/b.zip', last_modified: 'ayer' },
      { name: 'lunes', format: 'ZIP', url: 'https://x/lunes.zip', last_modified: '2026-10-26T09:00:00' },
    ];
    expect(pickLatestZip(resources)?.name).toBe('lunes');
  });

  it('devuelve null si no hay ningún ZIP', () => {
    expect(pickLatestZip([])).toBeNull();
    expect(pickLatestZip([{ format: 'CSV', url: 'https://x/a.csv', last_modified: '2026-10-30T00:00:00' }])).toBeNull();
  });
});

describe('fetchWithRetry', () => {
  const NO_WAIT = [0, 0, 0];
  const ok = () => new Response('{"ok":true}', { status: 200 });

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reintenta: falla dos veces y la tercera responde', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(new Response('caído', { status: 503, statusText: 'Service Unavailable' }))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);

    const body = await fetchWithRetry('https://x/pkg', NO_WAIT, response => response.json());
    expect(body).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('falla cuatro veces y propaga el último error', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('intento 1'))
      .mockRejectedValueOnce(new Error('intento 2'))
      .mockRejectedValueOnce(new Error('intento 3'))
      .mockRejectedValueOnce(new Error('intento 4'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWithRetry('https://x/pkg', NO_WAIT)).rejects.toThrow('intento 4');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('reintenta la descarga entera si se corta mientras se lee el cuerpo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok()));
    const consume = vi.fn()
      .mockRejectedValueOnce(new Error('terminated'))
      .mockResolvedValueOnce('archivo');

    await expect(fetchWithRetry('https://x/sepa.zip', NO_WAIT, consume)).resolves.toBe('archivo');
    expect(consume).toHaveBeenCalledTimes(2);
  });
});

describe('hasNewFile', () => {
  const inicio = new Date('2026-11-04T18:30:05Z');   // la carga ok arrancó a las 15:30 hora argentina

  it('hay archivo nuevo si last_modified es posterior al inicio de la última carga ok', () => {
    expect(hasNewFile(new Date('2026-11-05T16:19:50Z'), inicio)).toBe(true);
  });

  it('no hay archivo nuevo si last_modified es igual al inicio', () => {
    expect(hasNewFile(new Date('2026-11-04T18:30:05Z'), inicio)).toBe(false);
  });

  it('no hay archivo nuevo si last_modified es anterior al inicio', () => {
    expect(hasNewFile(new Date('2026-11-04T16:19:50Z'), inicio)).toBe(false);
  });

  it('sin cargas ok previas siempre hay archivo nuevo', () => {
    expect(hasNewFile(new Date('2026-11-04T16:19:50Z'), null)).toBe(true);
  });
});

describe('isStale', () => {
  it('3 días desde la última carga ok no falla', () => {
    expect(isStale('2026-11-01', '2026-11-04')).toBe(false);
  });

  it('4 días desde la última carga ok falla', () => {
    expect(isStale('2026-10-31', '2026-11-04')).toBe(true);
  });

  it('sin cargas ok falla', () => {
    expect(isStale(null, '2026-11-04')).toBe(true);
  });

  it('una carga del mismo día no falla', () => {
    expect(isStale('2026-11-04', '2026-11-04')).toBe(false);
  });
});

describe('daysSince', () => {
  it('cuenta días de calendario, también cruzando de mes', () => {
    expect(daysSince('2026-10-30', '2026-11-04')).toBe(5);
    expect(daysSince('2026-11-04', '2026-11-04')).toBe(0);
  });
});

describe('todayInArgentina', () => {
  it('usa la hora argentina (UTC−3), no la UTC', () => {
    expect(todayInArgentina(new Date('2026-11-05T02:59:00Z'))).toBe('2026-11-04');
    expect(todayInArgentina(new Date('2026-11-05T03:00:00Z'))).toBe('2026-11-05');
  });
});
