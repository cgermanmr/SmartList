import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  gpsLocation, nearbyListSummary, nextRadius, NO_LOCATION, parseLocationState, requestPosition,
} from './location';

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

describe('nearbyListSummary', () => {
  it('cuenta los comercios dentro del radio', () => {
    expect(nearbyListSummary({ count: 12, radiusKm: 3 })).toBe('12 comercios a menos de 3 km');
  });

  it('usa el singular con un comercio', () => {
    expect(nearbyListSummary({ count: 1, radiusKm: 1 })).toBe('1 comercio a menos de 1 km');
  });

  it('nombra la localidad elegida a mano', () => {
    expect(nearbyListSummary({ count: 12, radiusKm: 3, place: 'Caballito, CABA' }))
      .toBe('12 comercios a menos de 3 km de Caballito, CABA');
  });

  it('aclara cuando la lista se corta en el máximo', () => {
    expect(nearbyListSummary({ count: 40, radiusKm: 10, limited: true })).toBe('Los 40 más cercanos, a menos de 10 km');
  });
});

describe('requestPosition', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubGeolocation() {
    const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>(ok =>
      ok({ coords: { latitude: -34.6, longitude: -58.4 } } as GeolocationPosition));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    vi.stubGlobal('window', { isSecureContext: true });
    return getCurrentPosition;
  }

  it('por defecto, sin alta precisión y con una posición de hasta 5 min', async () => {
    const getCurrentPosition = stubGeolocation();
    await expect(requestPosition()).resolves.toEqual({ lat: -34.6, lng: -58.4 });
    expect(getCurrentPosition.mock.calls[0][2])
      .toEqual({ enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
  });

  it('con highAccuracy pide el GPS y una posición de hasta 1 min', async () => {
    const getCurrentPosition = stubGeolocation();
    await requestPosition({ highAccuracy: true });
    expect(getCurrentPosition.mock.calls[0][2])
      .toEqual({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 });
  });
});
