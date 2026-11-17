import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDuration, getRoute, googleMapsUrl, mapStops, osrmUrl, parseOsrmRoute } from './route';

const OBELISCO = { lat: -34.6037, lng: -58.3816 };
const PLAZA_DE_MAYO = { lat: -34.6083, lng: -58.3712 };
const CONGRESO = { lat: -34.6098, lng: -58.3926 };

const GEOMETRY = { type: 'LineString', coordinates: [[-58.3816, -34.6037], [-58.376, -34.606], [-58.3712, -34.6083]] };
const OSRM_OK = { code: 'Ok', routes: [{ distance: 1700, duration: 1380, geometry: GEOMETRY }] };

describe('googleMapsUrl', () => {
  it('arma el link a un destino, a pie', () => {
    expect(googleMapsUrl([OBELISCO], 'foot'))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=-34.6037%2C-58.3816&travelmode=walking');
  });

  it('usa driving en auto', () => {
    expect(googleMapsUrl([OBELISCO], 'car')).toContain('travelmode=driving');
  });

  it('con varias paradas, el destino es la última y las demás van como waypoints', () => {
    const url = new URL(googleMapsUrl([OBELISCO, PLAZA_DE_MAYO, CONGRESO], 'car'));
    expect(url.searchParams.get('destination')).toBe('-34.6098,-58.3926');
    expect(url.searchParams.get('waypoints')).toBe('-34.6037,-58.3816|-34.6083,-58.3712');
  });

  it('nunca lleva origen', () => {
    expect(googleMapsUrl([OBELISCO], 'foot')).not.toContain('origin');
    expect(googleMapsUrl([OBELISCO, PLAZA_DE_MAYO], 'car')).not.toContain('origin');
    expect(new URL(googleMapsUrl([OBELISCO], 'foot')).searchParams.has('waypoints')).toBe(false);
  });
});

describe('formatDuration', () => {
  it('muestra minutos hasta la hora', () => {
    expect(formatDuration(25)).toBe('25 min');
    expect(formatDuration(22.6)).toBe('23 min');
    expect(formatDuration(59.4)).toBe('59 min');
  });

  it('nunca muestra menos de 1 min', () => {
    expect(formatDuration(0)).toBe('1 min');
    expect(formatDuration(0.2)).toBe('1 min');
  });

  it('muestra horas y minutos desde la hora', () => {
    expect(formatDuration(70)).toBe('1 h 10 min');
    expect(formatDuration(59.6)).toBe('1 h');
    expect(formatDuration(120)).toBe('2 h');
  });
});

describe('parseOsrmRoute', () => {
  it('pasa una respuesta válida a km, minutos y [lat, lng]', () => {
    expect(parseOsrmRoute(OSRM_OK)).toEqual({
      line: [[-34.6037, -58.3816], [-34.606, -58.376], [-34.6083, -58.3712]],
      distanceKm: 1.7,
      minutes: 23,
    });
  });

  it('devuelve null si el código no es Ok', () => {
    expect(parseOsrmRoute({ ...OSRM_OK, code: 'NoRoute' })).toBeNull();
  });

  it('devuelve null sin rutas', () => {
    expect(parseOsrmRoute({ code: 'Ok', routes: [] })).toBeNull();
    expect(parseOsrmRoute({ code: 'Ok' })).toBeNull();
  });

  it('devuelve null con una forma inesperada', () => {
    const route = (extra: object) => ({ code: 'Ok', routes: [{ distance: 1700, duration: 1380, ...extra }] });
    expect(parseOsrmRoute(null)).toBeNull();
    expect(parseOsrmRoute('Ok')).toBeNull();
    expect(parseOsrmRoute(route({}))).toBeNull();
    expect(parseOsrmRoute(route({ distance: '1700', geometry: GEOMETRY }))).toBeNull();
    expect(parseOsrmRoute(route({ geometry: { coordinates: [[-58.38, -34.6]] } }))).toBeNull();
    expect(parseOsrmRoute(route({ geometry: { coordinates: [[-58.38, -34.6], ['a', 'b']] } }))).toBeNull();
  });
});

describe('mapStops', () => {
  const coto = { name: 'Coto — Suc. 12', address: 'Av Rivadavia 5000', barrio: 'Caballito', sepaId: '12-1-12', lat: -34.61, lng: -58.44 };
  const dia = { name: 'Día — Suc. 3', sepaId: '15-1-3', lat: -34.62, lng: -58.45 };

  it('arma las paradas con nombre, dirección y coordenadas', () => {
    expect(mapStops([coto, dia])).toEqual([
      { name: 'Coto — Suc. 12', address: 'Av Rivadavia 5000', lat: -34.61, lng: -58.44 },
      { name: 'Día — Suc. 3', lat: -34.62, lng: -58.45 },
    ]);
  });

  it('saltea los comercios sin coordenadas', () => {
    expect(mapStops([{ name: 'Almacén' }, coto, { name: 'Verdulería', lat: -34.6 }])).toHaveLength(1);
  });

  it('corta en el tope (9 por defecto)', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...dia, name: `Día ${i}` }));
    expect(mapStops(many)).toHaveLength(9);
    expect(mapStops(many, 2).map(s => s.name)).toEqual(['Día 0', 'Día 1']);
  });
});

describe('osrmUrl', () => {
  it('pone los puntos como lng,lat en el servidor de cada modo', () => {
    expect(osrmUrl([OBELISCO, PLAZA_DE_MAYO], 'foot'))
      .toBe('https://routing.openstreetmap.de/routed-foot/route/v1/foot/-58.3816,-34.6037;-58.3712,-34.6083?overview=full&geometries=geojson');
    expect(osrmUrl([OBELISCO, PLAZA_DE_MAYO], 'car'))
      .toContain('https://routing.openstreetmap.de/routed-car/route/v1/driving/');
  });
});

describe('getRoute', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(body: unknown, ok = true) {
    const fetchMock = vi.fn(async () => ({ ok, json: async () => body }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('no consulta con menos de dos puntos', async () => {
    const fetchMock = stubFetch(OSRM_OK);
    expect(await getRoute([OBELISCO], 'foot')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('guarda la ruta por puntos + modo: repetir no consulta de nuevo', async () => {
    const fetchMock = stubFetch(OSRM_OK);
    const points = [{ lat: -34.1, lng: -58.1 }, { lat: -34.2, lng: -58.2 }];
    expect((await getRoute(points, 'foot'))?.distanceKm).toBe(1.7);
    await getRoute(points, 'foot');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await getRoute(points, 'car');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('un fallo devuelve null y no se guarda', async () => {
    const points = [{ lat: -34.3, lng: -58.3 }, { lat: -34.4, lng: -58.4 }];
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin conexión'); }));
    expect(await getRoute(points, 'foot')).toBeNull();
    stubFetch({ code: 'NoRoute' });
    expect(await getRoute(points, 'foot')).toBeNull();
    const fetchMock = stubFetch(OSRM_OK);
    expect(await getRoute(points, 'foot')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
