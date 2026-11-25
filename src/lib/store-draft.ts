import { AddressSuggestion, numberAfterStreet, parseAddressQuery, ReverseAddress } from './address';
import { LatLng } from './geo';
import { UserLocation } from './location';
import { StoreRef } from './models';
import { otherStore } from './price-form';

// Estado del formulario "Otro comercio" (spec 35): qué pasa con la dirección, el barrio y el punto al escribir, elegir
// una sugerencia, marcar en el mapa o completar la dirección. Funciones puras: cada una devuelve un borrador nuevo.

export type PointSource = 'gps' | 'suggestion' | 'marked';

export interface StorePoint extends LatLng {
  source: PointSource;
}

export interface StoreDraft {
  name: string;
  address: string;
  /** La dirección la escribió el usuario (se buscan sugerencias); no la completó la app */
  addressTyped: boolean;
  barrio: string;
  /** El barrio lo completó la app: se puede reemplazar */
  barrioAuto: boolean;
  point: StorePoint | null;
  /** Lectura del GPS de "Otro comercio acá", hasta que se quita el punto */
  gps: LatLng | null;
  /** Calle elegida sin altura: acota la búsqueda de la altura y centra el mapa */
  street: AddressSuggestion | null;
}

/** Caracteres desde los que se buscan direcciones */
const MIN_QUERY = 3;

/** Zoom inicial del mapa: con punto o calle, con la ubicación de la app, o todo el país */
const POINT_ZOOM = 17;
const LOCATION_ZOOM = 15;
const COUNTRY = { lat: -38.4, lng: -63.6, zoom: 4 };

// ── Cambios del borrador ─────────────────────────────────────

/** Con la lectura del GPS ("Otro comercio acá"), el punto empieza siendo ese */
export function emptyDraft(gps?: LatLng): StoreDraft {
  const point = gps ? { lat: gps.lat, lng: gps.lng } : null;
  return {
    name: '', address: '', addressTyped: false, barrio: '', barrioAuto: false, street: null,
    gps: point, point: point && { ...point, source: 'gps' },
  };
}

/** El punto de una sugerencia deja de valer al cambiar la dirección: vuelve el del GPS, si había */
function withoutSuggestionPoint(draft: StoreDraft): StorePoint | null {
  if (draft.point?.source !== 'suggestion') return draft.point;
  return draft.gps && { ...draft.gps, source: 'gps' };
}

export function typeAddress(draft: StoreDraft, address: string): StoreDraft {
  const keepsStreet = draft.street !== null && numberAfterStreet(address, draft.street.street) !== null;
  return {
    ...draft, address, addressTyped: true, point: withoutSuggestionPoint(draft), street: keepsStreet ? draft.street : null,
  };
}

export function typeBarrio(draft: StoreDraft, barrio: string): StoreDraft {
  return { ...draft, barrio, barrioAuto: false };
}

/** `typedNumber`: la altura escrita que no existe, al elegir una de las calles que se ofrecen en su lugar */
export function chooseSuggestion(draft: StoreDraft, suggestion: AddressSuggestion, typedNumber?: string): StoreDraft {
  const barrio = draft.barrioAuto ? { barrio: '', barrioAuto: false } : {};
  const previous = withoutSuggestionPoint(draft);
  if (suggestion.number) {
    return {
      ...draft, ...barrio, address: `${suggestion.street} ${suggestion.number}`, addressTyped: false, street: null,
      point: suggestion.point ? { ...suggestion.point, source: 'suggestion' } : previous,
    };
  }
  return {
    ...draft, ...barrio, address: `${suggestion.street} ${typedNumber ?? ''}`, addressTyped: false, street: suggestion,
    point: previous,
  };
}

/** Cambiar el punto no vuelve a buscar lo que ya se había escrito */
export function markPoint(draft: StoreDraft, point: LatLng): StoreDraft {
  return { ...draft, addressTyped: false, point: { lat: point.lat, lng: point.lng, source: 'marked' } };
}

/** Quitado a mano, el punto del GPS tampoco vuelve al escribir */
export function removePoint(draft: StoreDraft): StoreDraft {
  return { ...draft, addressTyped: false, point: null, gps: null };
}

/** La dirección del punto reemplaza la escrita; el barrio escrito a mano no se toca */
export function applyReverse(draft: StoreDraft, reverse: ReverseAddress): StoreDraft {
  const keepsBarrio = draft.barrio.trim() !== '' && !draft.barrioAuto;
  return {
    ...draft, address: reverse.address, addressTyped: false, street: null,
    ...(!keepsBarrio && { barrio: reverse.barrio ?? '', barrioAuto: reverse.barrio !== undefined }),
  };
}

// ── Consultas sobre el borrador ──────────────────────────────

/** Referencia para ordenar por cercanía; `approx` si es una localidad elegida a mano. Nunca se pide el permiso */
export function draftOrigin(draft: StoreDraft, location: UserLocation | null): { point: LatLng | null; approx: boolean } {
  if (draft.point && draft.point.source !== 'suggestion') {
    return { point: { lat: draft.point.lat, lng: draft.point.lng }, approx: false };
  }
  if (!location) return { point: null, approx: false };
  return { point: { lat: location.lat, lng: location.lng }, approx: location.source === 'localidad' };
}

/** Centro y zoom con los que se abre el mapa */
export function mapCenter(draft: StoreDraft, location: UserLocation | null): LatLng & { zoom: number } {
  const exact = draft.point ?? draft.street?.point;
  if (exact) return { lat: exact.lat, lng: exact.lng, zoom: POINT_ZOOM };
  if (location) return { lat: location.lat, lng: location.lng, zoom: LOCATION_ZOOM };
  return COUNTRY;
}

/** Qué buscar; null si no hay que buscar. Con una calle elegida, solo su altura */
export function addressSearch(draft: StoreDraft): { query: string; street?: AddressSuggestion } | null {
  const query = draft.address.trim();
  if (!draft.addressTyped || query.length < MIN_QUERY) return null;
  if (!draft.street) return { query };
  return numberAfterStreet(query, draft.street.street) ? { query, street: draft.street } : null;
}

/** Con una calle elegida y sin altura escrita, se pide la altura */
export function missingNumber(draft: StoreDraft): boolean {
  return draft.street !== null && numberAfterStreet(draft.address, draft.street.street) === '';
}

/** La altura escrita, si hay */
export function typedNumber(draft: StoreDraft): string | undefined {
  if (!draft.street) return parseAddressQuery(draft.address).number;
  return numberAfterStreet(draft.address, draft.street.street) || undefined;
}

export function draftStore(draft: StoreDraft): StoreRef {
  return otherStore({ name: draft.name, address: draft.address, barrio: draft.barrio, point: draft.point ?? undefined });
}
