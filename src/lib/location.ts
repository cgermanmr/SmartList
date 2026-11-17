import { LatLng } from './geo';

// Ubicación del usuario: se pide solo cuando toca "Usar mi ubicación" y se guarda en localStorage. Nunca se manda
// a un servidor: las distancias se calculan en el navegador.

export interface UserLocation extends LatLng {
  source: 'gps' | 'localidad';
  label: string;            // "Mi ubicación" o "Caballito, CABA"
}

/** Radios de búsqueda, en km */
export const RADIUS_OPTIONS = [1, 3, 5, 10] as const;
export type RadiusKm = (typeof RADIUS_OPTIONS)[number];
export const DEFAULT_RADIUS: RadiusKm = 3;

export const GPS_LABEL = 'Mi ubicación';

export interface LocationState {
  location: UserLocation | null;
  radiusKm: RadiusKm;
}

export const NO_LOCATION: LocationState = { location: null, radiusKm: DEFAULT_RADIUS };

/** Por qué no se pudo obtener la posición: permiso denegado, o sin señal / tiempo agotado */
export type LocationError = 'denied' | 'unavailable';

export const LOCATION_ERROR_MESSAGE: Record<LocationError, string> = {
  denied: 'Sin permiso para usar tu ubicación. Podés elegir tu localidad.',
  unavailable: 'No se pudo obtener tu ubicación.',
};

// ── Funciones puras ─────────────────────────────────────────

function isRadius(value: unknown): value is RadiusKm {
  return (RADIUS_OPTIONS as readonly unknown[]).includes(value);
}

function isCoordinate(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- valida datos crudos de localStorage
function isUserLocation(value: any): value is UserLocation {
  return !!value && typeof value === 'object'
    && isCoordinate(value.lat, 90)
    && isCoordinate(value.lng, 180)
    && (value.source === 'gps' || value.source === 'localidad')
    && typeof value.label === 'string' && value.label.trim() !== '';
}

/** Valida lo guardado en localStorage: si algo no es válido, sin ubicación y 3 km */
export function parseLocationState(raw: unknown): LocationState {
  if (!raw || typeof raw !== 'object') return NO_LOCATION;
  const { location, radiusKm } = raw as Partial<Record<keyof LocationState, unknown>>;
  if (!isRadius(radiusKm)) return NO_LOCATION;
  if (location === null) return { location: null, radiusKm };
  if (!isUserLocation(location)) return NO_LOCATION;
  return {
    location: { lat: location.lat, lng: location.lng, source: location.source, label: location.label },
    radiusKm,
  };
}

/** El radio que sigue al actual; null si ya es el mayor */
export function nextRadius(radiusKm: RadiusKm): RadiusKm | null {
  return RADIUS_OPTIONS[RADIUS_OPTIONS.indexOf(radiusKm) + 1] ?? null;
}

/** Posición del GPS redondeada a 4 decimales (~11 m): no hace falta guardar más precisión */
export function gpsLocation(position: LatLng): UserLocation {
  return { lat: round4(position.lat), lng: round4(position.lng), source: 'gps', label: GPS_LABEL };
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

// ── Geolocalización del navegador ────────────────────────────

/** false sin navigator.geolocation (o sin HTTPS): solo queda elegir la localidad */
export function geolocationAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator && window.isSecureContext;
}

const PERMISSION_DENIED = 1;

/** Una sola lectura, sin alta precisión; rechaza con un LocationError */
export function requestPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!geolocationAvailable()) {
      reject('unavailable' satisfies LocationError);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      error => reject((error.code === PERMISSION_DENIED ? 'denied' : 'unavailable') satisfies LocationError),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  });
}
