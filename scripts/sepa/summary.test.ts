import { describe, expect, it } from 'vitest';
import { type RunSummary, buildSummary, emptySummary, formatDuration } from './summary.ts';

/** Valor de la fila `label` de la tabla, o undefined si no está */
function row(markdown: string, label: string): string | undefined {
  const line = markdown.split('\n').find(l => l.startsWith(`| ${label} |`));
  return line?.slice(`| ${label} | `.length, -' |'.length);
}

describe('buildSummary', () => {
  it('carga ok: todos los números y la duración de cada etapa', () => {
    const run: RunSummary = {
      resultado: 'ok',
      detalle: null,
      fechaArchivo: '2026-11-04',
      lastModified: new Date('2026-11-04T16:19:50.656Z'),
      banderas: 23,
      omitidos: [
        { archivo: 'sepa_2_comercio-sepa-36.zip', motivo: 'zip roto' },
        { archivo: 'sepa_1_comercio-sepa-47.zip', motivo: 'desactualizado' },
      ],
      filasLeidas: 14_303_828,
      filasPrecios: 236_439,
      segundos: { descarga: 64.4, lectura: 179.2, carga: 590, total: 836.6 },
      aviso: null,
    };
    const md = buildSummary(run);

    expect(md.startsWith('## SEPA — carga en Supabase\n\n| | |\n|---|---|\n')).toBe(true);
    expect(row(md, 'Resultado')).toBe('✅ **ok**');
    expect(row(md, 'Detalle')).toBe('—');
    expect(row(md, 'Fecha del archivo')).toBe('2026-11-04');
    expect(row(md, '`last_modified` del recurso')).toBe('2026-11-04 16:19:50 UTC');
    expect(row(md, 'Banderas cargadas')).toBe('23');
    expect(row(md, 'Omitidos')).toBe(
      '2: `sepa_2_comercio-sepa-36.zip` (zip roto)<br>`sepa_1_comercio-sepa-47.zip` (desactualizado)');
    expect(row(md, 'Filas leídas')).toBe('14.303.828');
    expect(row(md, 'Filas de precios')).toBe('236.439');
    expect(row(md, 'Descarga')).toBe('1 min 4 s');
    expect(row(md, 'Lectura')).toBe('2 min 59 s');
    expect(row(md, 'Carga')).toBe('9 min 50 s');
    expect(row(md, '**Total**')).toBe('**13 min 57 s**');
    expect(row(md, '⚠️ Aviso')).toBeUndefined();
  });

  it('sin archivo nuevo: lo que no se calculó queda como —, y muestra el aviso de más de 3 días', () => {
    const run: RunSummary = {
      ...emptySummary('sin archivo nuevo'),
      detalle: 'el recurso no cambió desde la última carga ok (2026-11-04T18:30:05.000Z)',
      lastModified: new Date('2026-11-04T16:19:50Z'),
      segundos: { descarga: null, lectura: null, carga: null, total: 3.3 },
      aviso: 'Más de 3 días sin precios nuevos: la última carga ok es del 2026-10-31 (4 días).',
    };
    const md = buildSummary(run);

    expect(row(md, 'Resultado')).toBe('💤 **sin archivo nuevo**');
    expect(row(md, 'Detalle')).toBe('el recurso no cambió desde la última carga ok (2026-11-04T18:30:05.000Z)');
    for (const label of ['Fecha del archivo', 'Banderas cargadas', 'Omitidos', 'Filas leídas', 'Filas de precios',
      'Descarga', 'Lectura', 'Carga']) {
      expect(row(md, label), label).toBe('—');
    }
    expect(row(md, '**Total**')).toBe('**3 s**');
    expect(row(md, '⚠️ Aviso')).toBe('**Más de 3 días sin precios nuevos: la última carga ok es del 2026-10-31 (4 días).**');
  });

  it('descarga fallida: muestra el error sin romper la tabla', () => {
    const run: RunSummary = {
      ...emptySummary('descarga fallida'),
      detalle: 'https://x/sepa.zip respondió 503 | Service Unavailable\nreintentos agotados',
      segundos: { descarga: null, lectura: null, carga: null, total: 421 },
    };
    const md = buildSummary(run);

    expect(row(md, 'Resultado')).toBe('❌ **descarga fallida**');
    expect(row(md, 'Detalle')).toBe('https://x/sepa.zip respondió 503 \\| Service Unavailable<br>reintentos agotados');
    expect(row(md, '`last_modified` del recurso')).toBe('—');
    expect(row(md, '**Total**')).toBe('**7 min 1 s**');
    // Cada fila de la tabla tiene exactamente dos celdas
    for (const line of md.split('\n').filter(l => l.startsWith('| ') && l !== '| | |')) {
      expect(line.replace(/\\\|/g, '').split('|')).toHaveLength(4);
    }
  });

  it('sin omitidos muestra 0', () => {
    expect(row(buildSummary({ ...emptySummary('omitida'), omitidos: [] }), 'Omitidos')).toBe('0');
  });
});

describe('formatDuration', () => {
  it('segundos solos o minutos y segundos, redondeando', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(0.4)).toBe('0 s');
    expect(formatDuration(59.6)).toBe('1 min 0 s');
    expect(formatDuration(203)).toBe('3 min 23 s');
  });
});
