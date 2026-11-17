import { describe, expect, it } from 'vitest';
import { distanceKm, formatDistance } from './geo';

const OBELISCO = { lat: -34.6037, lng: -58.3816 };
const CABILDO_CORDOBA = { lat: -31.4167, lng: -64.1833 };
const PLAZA_DE_MAYO = { lat: -34.6083, lng: -58.3712 };

describe('distanceKm', () => {
  it('da 0 entre un punto y sí mismo', () => {
    expect(distanceKm(OBELISCO, OBELISCO)).toBe(0);
  });

  it('coincide con distancias conocidas', () => {
    // Buenos Aires – Córdoba: ~646 km en línea recta
    expect(distanceKm(OBELISCO, CABILDO_CORDOBA)).toBeGreaterThan(640);
    expect(distanceKm(OBELISCO, CABILDO_CORDOBA)).toBeLessThan(652);
    // Obelisco – Plaza de Mayo: ~1,1 km
    expect(distanceKm(OBELISCO, PLAZA_DE_MAYO)).toBeCloseTo(1.08, 1);
  });

  it('un grado de latitud son ~111 km', () => {
    expect(distanceKm({ lat: -34, lng: -58 }, { lat: -35, lng: -58 })).toBeCloseTo(111.2, 0);
  });

  it('es simétrica', () => {
    expect(distanceKm(OBELISCO, PLAZA_DE_MAYO)).toBeCloseTo(distanceKm(PLAZA_DE_MAYO, OBELISCO), 10);
  });
});

describe('formatDistance', () => {
  it('muestra metros de a 50 hasta 950 m', () => {
    expect(formatDistance(0.35)).toBe('350 m');
    expect(formatDistance(0.36)).toBe('350 m');
    expect(formatDistance(0.38)).toBe('400 m');
    expect(formatDistance(0.95)).toBe('950 m');
    expect(formatDistance(0.97)).toBe('950 m');
  });

  it('nunca muestra menos de 50 m', () => {
    expect(formatDistance(0)).toBe('50 m');
    expect(formatDistance(0.01)).toBe('50 m');
  });

  it('desde 1 km muestra km con hasta un decimal', () => {
    expect(formatDistance(0.98)).toBe('1 km');
    expect(formatDistance(1.24)).toBe('1,2 km');
    expect(formatDistance(9.94)).toBe('9,9 km');
  });

  it('desde 10 km no lleva decimales', () => {
    expect(formatDistance(9.96)).toBe('10 km');
    expect(formatDistance(12.4)).toBe('12 km');
  });
});
