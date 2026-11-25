import { useEffect, useState } from 'react';
import { AddressSearch, AddressSuggestion, searchAddresses } from '@/lib/address';
import { LatLng } from '@/lib/geo';

const DEBOUNCE_MS = 400;

export interface AddressSearchState {
  status: 'idle' | 'loading' | 'done' | 'failed';
  suggestions: AddressSuggestion[];
  /** La altura escrita no existe: las sugerencias son las calles */
  unknownNumber: boolean;
}

const NONE: AddressSuggestion[] = [];
const IDLE: AddressSearchState = { status: 'idle', suggestions: NONE, unknownNumber: false };
const LOADING: AddressSearchState = { status: 'loading', suggestions: NONE, unknownNumber: false };
const FAILED: AddressSearchState = { status: 'failed', suggestions: NONE, unknownNumber: false };

/**
 * Direcciones para lo escrito, 400 ms después de la última tecla. Como en useSepaSearch, mientras lo buscado no es lo
 * de la última respuesta se está buscando, y una respuesta vieja que llega tarde se descarta
 */
export function useAddressSearch(
  search: { query: string; street?: AddressSuggestion } | null, origin: LatLng | null,
): AddressSearchState {
  const query = search?.query;
  const street = search?.street;
  const lat = origin?.lat;
  const lng = origin?.lng;
  const key = query === undefined ? null : [query, street?.street, street?.place, lat, lng].join('|');
  const [answer, setAnswer] = useState<{ key: string; result: AddressSearch } | null>(null);

  useEffect(() => {
    if (query === undefined || key === null) return undefined;
    let stale = false;
    const timer = setTimeout(() => {
      const from = lat === undefined || lng === undefined ? null : { lat, lng };
      searchAddresses(query, from, street).then(result => { if (!stale) setAnswer({ key, result }); });
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [key, query, street, lat, lng]);

  if (key === null) return IDLE;
  if (answer?.key !== key) return LOADING;
  if (answer.result.status === 'failed') return FAILED;
  return { status: 'done', suggestions: answer.result.suggestions, unknownNumber: answer.result.unknownNumber };
}
