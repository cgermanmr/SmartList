import { useEffect, useState } from 'react';
import { isSearchableQuery, searchSepaProducts, SepaProduct, sepaEnabled } from '@/lib/sepa';

const DEBOUNCE_MS = 300;

export interface SepaSearchState {
  status: 'idle' | 'loading' | 'done' | 'error';
  results: SepaProduct[];
}

interface SepaResponse {
  text: string;
  results: SepaProduct[];
  failed: boolean;
}

const IDLE: SepaSearchState = { status: 'idle', results: [] };
const LOADING: SepaSearchState = { status: 'loading', results: [] };
const ERROR: SepaSearchState = { status: 'error', results: [] };

/**
 * Consulta el catálogo con una espera de 300 ms entre teclas. El estado sale de comparar el texto actual con el de
 * la última respuesta: mientras no coinciden se está buscando, y una respuesta vieja que llega tarde se descarta.
 */
export function useSepaSearch(query: string): SepaSearchState {
  const text = query.trim();
  const active = sepaEnabled && isSearchableQuery(text);
  const [response, setResponse] = useState<SepaResponse | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    let stale = false;
    const timer = setTimeout(() => {
      searchSepaProducts(text).then(
        results => { if (!stale) setResponse({ text, results, failed: false }); },
        () => { if (!stale) setResponse({ text, results: [], failed: true }); },
      );
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [active, text]);

  if (!active) return IDLE;
  if (response?.text !== text) return LOADING;
  return response.failed ? ERROR : { status: 'done', results: response.results };
}
