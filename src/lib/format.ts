// Formato de números y fechas en es-AR (1.234,56 · 28/10/2026 16:05)

const numberFormats = new Map<string, Intl.NumberFormat>();

/** Número con entre `minDecimals` y `maxDecimals` decimales */
export function formatNumber(value: number, minDecimals = 2, maxDecimals = minDecimals): string {
  const key = `${minDecimals}-${maxDecimals}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat('es-AR', { minimumFractionDigits: minDecimals, maximumFractionDigits: maxDecimals });
    numberFormats.set(key, format);
  }
  return format.format(value);
}

/** Importe con 2 decimales, sin el signo $ */
export function formatMoney(value: number): string {
  return formatNumber(value, 2);
}

/** Variación porcentual con signo y 1 decimal: "+5,3%" */
export function formatPctChange(current: number, previous: number): string {
  const pct = ((current - previous) / previous) * 100;
  return `${pct > 0 ? '+' : ''}${formatNumber(pct, 1)}%`;
}

const dateTimeFormat = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});

const shortDateTimeFormat = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});

const dayMonthFormat = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' });

/** dd/MM/yyyy HH:mm */
export function formatDateTime(date: Date | string): string {
  return dateTimeFormat.format(new Date(date)).replace(',', '');
}

/** dd/MM/yy HH:mm */
export function formatShortDateTime(date: Date | string): string {
  return shortDateTimeFormat.format(new Date(date)).replace(',', '');
}

/** dd/MM */
export function formatDayMonth(date: Date | string): string {
  return dayMonthFormat.format(new Date(date));
}
