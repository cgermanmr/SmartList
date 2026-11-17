import { describe, expect, it } from 'vitest';
import { gpsLocation, nextRadius, NO_LOCATION, parseLocationState } from './location';

describe('parseLocationState', () => {
  const location = { lat: -34.6037, lng: -58.3816, source: 'gps', label: 'Mi ubicación' };

  it('acepta una ubicación y un radio válidos', () => {
    expect(parseLocationState({ location, radiusKm: 5 })).toEqual({ location, radiusKm: 5 });
  });

  it('acepta el radio sin ubicación', () => {
    expect(parseLocationState({ location: null, radiusKm: 10 })).toEqual({ location: null, radiusKm: 10 });
  });

  it('descarta los campos de más', () => {
    const parsed = parseLocationState({ location: { ...location, accuracy: 20 }, radiusKm: 3 });
    expect(parsed.location).toEqual(location);
  });

  it.each([
    ['nada guardado', null],
    ['un texto', 'hola'],
    ['un radio que no existe', { location, radiusKm: 4 }],
    ['sin radio', { location }],
    ['latitud fuera de rango', { location: { ...location, lat: 120 }, radiusKm: 3 }],
    ['longitud como texto', { location: { ...location, lng: '-58' }, radiusKm: 3 }],
    ['coordenada NaN', { location: { ...location, lat: Number.NaN }, radiusKm: 3 }],
    ['origen desconocido', { location: { ...location, source: 'ip' }, radiusKm: 3 }],
    ['etiqueta vacía', { location: { ...location, label: ' ' }, radiusKm: 3 }],
    ['ubicación ausente', { radiusKm: 3 }],
  ])('con %s vuelve a sin ubicación y 3 km', (_name, raw) => {
    expect(parseLocationState(raw)).toEqual(NO_LOCATION);
  });
});

describe('nextRadius', () => {
  it('pasa al radio siguiente', () => {
    expect(nextRadius(1)).toBe(3);
    expect(nextRadius(3)).toBe(5);
    expect(nextRadius(5)).toBe(10);
  });

  it('no hay siguiente después del mayor', () => {
    expect(nextRadius(10)).toBeNull();
  });
});

describe('gpsLocation', () => {
  it('redondea la posición a 4 decimales', () => {
    expect(gpsLocation({ lat: -34.603722123, lng: -58.381592987 })).toEqual({
      lat: -34.6037, lng: -58.3816, source: 'gps', label: 'Mi ubicación',
    });
  });
});
