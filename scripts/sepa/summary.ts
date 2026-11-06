// Resumen de una ejecución del ETL en Markdown, para el job summary de GitHub Actions (spec 09)

import type { Omitido } from './etl.ts';

// ── Tipos ─────────────────────────────────────────────

/** Cómo terminó la ejecución: los estados de sepa_cargas más los casos que no dejan fila */
export type Resultado = 'ok' | 'omitida' | 'error' | 'sin archivo nuevo' | 'descarga fallida' | 'dry-run';

/** Lo que se sabe de la ejecución; lo que no llegó a calcularse queda en null */
export interface RunSummary {
  resultado: Resultado;
  detalle: string | null;           // detalle de sepa_cargas o mensaje de error
  fechaArchivo: string | null;
  lastModified: Date | null;        // del recurso ZIP en CKAN
  banderas: number | null;
  omitidos: Omitido[] | null;
  filasLeidas: number | null;
  filasPrecios: number | null;
  segundos: {
    descarga: number | null;
    lectura: number | null;
    carga: number | null;
    total: number | null;
  };
  aviso: string | null;             // regla de "más de 3 días"
}

/** Un resumen vacío: todo en null salvo el resultado */
export function emptySummary(resultado: Resultado): RunSummary {
  return {
    resultado, detalle: null, fechaArchivo: null, lastModified: null, banderas: null, omitidos: null,
    filasLeidas: null, filasPrecios: null, segundos: { descarga: null, lectura: null, carga: null, total: null },
    aviso: null,
  };
}

// ── Formato ─────────────────────────────────────────────

const NUMBER = new Intl.NumberFormat('es-AR');
const NONE = '—';

const ICONS: Record<Resultado, string> = {
  ok: '✅',
  omitida: '⏭️',
  error: '❌',
  'sin archivo nuevo': '💤',
  'descarga fallida': '❌',
  'dry-run': '🧪',
};

/** Texto seguro dentro de una celda: sin `|` ni saltos de línea que rompan la tabla */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function number(value: number | null): string {
  return value === null ? NONE : NUMBER.format(value);
}

/** `45 s`, `3 min 23 s` */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return NONE;
  const total = Math.round(seconds);
  const min = Math.floor(total / 60);
  const s = total % 60;
  return min === 0 ? `${s} s` : `${min} min ${s} s`;
}

/** `2026-11-04 16:19:50 UTC` */
function utc(date: Date | null): string {
  return date === null ? NONE : `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

function omitidos(list: Omitido[] | null): string {
  if (list === null) return NONE;
  if (list.length === 0) return '0';
  return `${list.length}: ${list.map(o => `\`${cell(o.archivo)}\` (${cell(o.motivo)})`).join('<br>')}`;
}

// ── Resumen ─────────────────────────────────────────────

/** Tabla Markdown con el resultado, los números de la carga y la duración de cada etapa */
export function buildSummary(run: RunSummary): string {
  const rows: [string, string][] = [
    ['Resultado', `${ICONS[run.resultado]} **${run.resultado}**`],
    ['Detalle', run.detalle ? cell(run.detalle) : NONE],
    ['Fecha del archivo', run.fechaArchivo ?? NONE],
    ['`last_modified` del recurso', utc(run.lastModified)],
    ['Banderas cargadas', number(run.banderas)],
    ['Omitidos', omitidos(run.omitidos)],
    ['Filas leídas', number(run.filasLeidas)],
    ['Filas de precios', number(run.filasPrecios)],
    ['Descarga', formatDuration(run.segundos.descarga)],
    ['Lectura', formatDuration(run.segundos.lectura)],
    ['Carga', formatDuration(run.segundos.carga)],
    ['**Total**', `**${formatDuration(run.segundos.total)}**`],
  ];
  if (run.aviso) rows.push(['⚠️ Aviso', `**${cell(run.aviso)}**`]);

  return [
    '## SEPA — carga en Supabase',
    '',
    '| | |',
    '|---|---|',
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
    '',
    '',   // línea en blanco final: separa la tabla de lo que otro paso agregue después
  ].join('\n');
}
