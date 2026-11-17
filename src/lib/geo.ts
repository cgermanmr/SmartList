import { formatNumber } from './format';

// Distancias entre coordenadas. Se calculan en el navegador: la ubicación del usuario no sale del dispositivo.

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Distancia en línea recta (haversine), en km */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "350 m" hasta 950 m (de a 50 m, nunca menos de 50); después "1,2 km"; desde 10 km sin decimales */
export function formatDistance(km: number): string {
  const meters = Math.round((km * 1000) / 50) * 50;
  if (meters < 1000) return `${Math.max(meters, 50)} m`;
  return `${formatNumber(km, 0, km < 9.95 ? 1 : 0)} km`;
}
