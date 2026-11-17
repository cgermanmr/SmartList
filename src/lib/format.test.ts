import { describe, expect, it } from 'vitest';
import {
  formatDateTime, formatIsoDate, formatMoney, formatMonth, formatNumber, formatPct, formatPctChange, formatSize, initialOf,
  monthName, shortMonth,
} from './format';

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

  it('porcentaje sin signo con hasta 1 decimal', () => {
    expect(formatPct(9.909)).toBe('9,9 %');
    expect(formatPct(8)).toBe('8 %');
  });

  it('fecha YYYY-MM-DD como dd/MM/yyyy sin correrse de día', () => {
    expect(formatIsoDate('2026-11-05')).toBe('05/11/2026');
  });

  it('presentación con separadores es-AR y sin decimales de más', () => {
    expect(formatSize(500, 'g')).toBe('500 g');
    expect(formatSize(1000, 'ml')).toBe('1.000 ml');
    expect(formatSize(1.5, 'l')).toBe('1,5 l');
  });

  it('inicial: la primera letra o número, en mayúscula', () => {
    expect(initialOf('yerba Playadito')).toBe('Y');
    expect(initialOf('  ¡ñoquis!')).toBe('Ñ');
    expect(initialOf('árbol')).toBe('Á');
    expect(initialOf('7 Up 500 ml')).toBe('7');
    expect(initialOf('— ·')).toBe('');
    expect(initialOf('')).toBe('');
  });

  it('fecha y hora dd/MM/yyyy HH:mm', () => {
    expect(formatDateTime(new Date(2026, 9, 28, 9, 5))).toBe('28/10/2026 09:05');
  });

  it('meses: nombre, mes y año, nombre corto', () => {
    expect(formatMonth('2026-11')).toBe('Noviembre 2026');
    expect(formatMonth('2025-01')).toBe('Enero 2025');
    expect(monthName('2026-10')).toBe('octubre');
    expect(monthName('2026-12')).toBe('diciembre');
    expect(shortMonth('2026-09')).toBe('sep');
    expect(shortMonth('2026-06')).toBe('jun');
  });
});
