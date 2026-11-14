import { describe, expect, it } from 'vitest';
import { formatDateTime, formatMoney, formatNumber, formatPctChange, formatSize } from './format';

describe('format', () => {
  it('usa separadores es-AR', () => {
    expect(formatMoney(1234.5)).toBe('1.234,50');
    expect(formatNumber(12.345, 0, 2)).toBe('12,35');
    expect(formatNumber(1500, 0)).toBe('1.500');
  });

  it('variación porcentual con signo', () => {
    expect(formatPctChange(110, 100)).toBe('+10,0%');
    expect(formatPctChange(90, 100)).toBe('-10,0%');
  });

  it('presentación con separadores es-AR y sin decimales de más', () => {
    expect(formatSize(500, 'g')).toBe('500 g');
    expect(formatSize(1000, 'ml')).toBe('1.000 ml');
    expect(formatSize(1.5, 'l')).toBe('1,5 l');
  });

  it('fecha y hora dd/MM/yyyy HH:mm', () => {
    expect(formatDateTime(new Date(2026, 9, 28, 9, 5))).toBe('28/10/2026 09:05');
  });
});
