import { LatLng } from './geo';
import { StoreRef } from './models';

// Ruta por calles para el mapa de un comercio (spec 16). Con lib/address.ts (la dirección de un punto, spec 35), son los
// únicos módulos que mandan coordenadas a un servicio externo: este solo se llama al abrir un mapa, y el link a Google
// Maps nunca lleva el origen.

export type TravelMode = 'foot' | 'car';

/** Parada del mapa: un comercio con coordenadas */
export interface MapStop extends LatLng {
  name: string;
  address?: string;
}

export interface Route {
  line: [number, number][];              // [lat, lng] para dibujar
  distanceKm: number;
  minutes: number;
}

/** Tope de paradas de un link de Google Maps */
export const MAX_STOPS = 9;

/** Tiempo límite de la consulta de la ruta, en ms */
const ROUTE_TIMEOUT = 8_000;

/** Servicio OSRM público de OpenStreetMap Alemania (sin clave): un servidor y un perfil por modo */
const OSRM: Record<TravelMode, string> = {
  foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
  car: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
};

const GOOGLE_MODE: Record<TravelMode, string> = { foot: 'walking', car: 'driving' };

// ── Funciones puras ─────────────────────────────────────────

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Pasa la respuesta de OSRM a Route; null si no trae una ruta válida */
export function parseOsrmRoute(raw: unknown): Route | null {
  if (!raw || typeof raw !== 'object') return null;
  const { code, routes } = raw as { code?: unknown; routes?: unknown };
  if (code !== 'Ok' || !Array.isArray(routes)) return null;
  const route: unknown = routes[0];
  if (!route || typeof route !== 'object') return null;
  const { distance, duration, geometry } = route as { distance?: unknown; duration?: unknown; geometry?: unknown };
  if (!isFiniteNumber(distance) || !isFiniteNumber(duration) || distance < 0 || duration < 0) return null;
  const coordinates: unknown = (geometry as { coordinates?: unknown } | null | undefined)?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const line: [number, number][] = [];
  for (const point of coordinates as unknown[]) {
    if (!Array.isArray(point) || !isFiniteNumber(point[0]) || !isFiniteNumber(point[1])) return null;
    // OSRM devuelve [lng, lat]; el mapa dibuja con [lat, lng]
    line.push([point[1], point[0]]);
  }
  return { line, distanceKm: distance / 1000, minutes: duration / 60 };
}

function coordinate({ lat, lng }: LatLng): string {
  return `${lat},${lng}`;
}

/** Link a Google Maps con destino (la última parada) y paradas intermedias, sin el origen: Google usa la posición del dispositivo */
export function googleMapsUrl(stops: LatLng[], mode: TravelMode): string {
  const destination = stops[stops.length - 1];
  const waypoints = stops.slice(0, -1);
  const params = [
    'api=1',
    `destination=${encodeURIComponent(coordinate(destination))}`,
    ...(waypoints.length > 0 ? [`waypoints=${encodeURIComponent(waypoints.map(coordinate).join('|'))}`] : []),
    `travelmode=${GOOGLE_MODE[mode]}`,
  ];
  return `https://www.google.com/maps/dir/?${params.join('&')}`;
}

/** "25 min", "1 h 10 min", "2 h"; nunca menos de 1 min */
export function formatDuration(minutes: number): string {
  const total = Math.max(1, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Paradas del mapa a partir de comercios: solo los que tienen lat y lng, hasta `max` */
export function mapStops(stores: StoreRef[], max: number = MAX_STOPS): MapStop[] {
  const stops: MapStop[] = [];
  for (const store of stores) {
    if (stops.length >= max) break;
    if (!isFiniteNumber(store.lat) || !isFiniteNumber(store.lng)) continue;
    stops.push({
      name: store.name,
      ...(store.address && { address: store.address }),
      lat: store.lat,
      lng: store.lng,
    });
  }
  return stops;
}

// ── Consulta de la ruta ──────────────────────────────────────

/** URL de la consulta: puntos en el orden del recorrido, como <lng>,<lat> */
export function osrmUrl(points: LatLng[], mode: TravelMode): string {
  const path = points.map(p => `${p.lng},${p.lat}`).join(';');
  return `${OSRM[mode]}/${path}?overview=full&geometries=geojson`;
}

// Caché de módulo por puntos + modo durante la sesión: guarda la promesa; un fallo se borra
const cache = new Map<string, Promise<Route | null>>();

async function fetchRoute(url: string): Promise<Route | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return parseOsrmRoute(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Ruta por calles entre los puntos, en orden. null si el servicio falla o tarda más de 8 s */
export function getRoute(points: LatLng[], mode: TravelMode): Promise<Route | null> {
  if (points.length < 2) return Promise.resolve(null);
  const url = osrmUrl(points, mode);
  const cached = cache.get(url);
  if (cached) return cached;
  const request = fetchRoute(url).then(route => {
    if (!route) cache.delete(url);
    return route;
  });
  cache.set(url, request);
  return request;
}
