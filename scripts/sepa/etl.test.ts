import { describe, expect, it } from 'vitest';
import { pickLatestZip } from './etl.ts';

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
