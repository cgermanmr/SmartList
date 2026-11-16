import { useEffect, useState } from 'react';
import { getSepaPrices, ReferenceSummary, referenceSummary, sepaEnabled } from '@/lib/sepa';

const EMPTY = new Map<string, ReferenceSummary>();

/**
 * Precio de referencia de varios EAN, en una sola consulta (`getSepaPrices`, con caché). Devuelve solo los que tienen
 * precios: mientras carga, sin precios o con error, el EAN no está en el mapa y la pantalla no muestra nada. Una
 * respuesta que llega después de que cambiaron los EAN se descarta; la anterior se sigue mostrando mientras tanto,
 * porque el precio de un EAN no cambia durante la sesión.
 */
export function useSepaReferences(eans: readonly (string | undefined)[]): Map<string, ReferenceSummary> {
  const key = [...new Set(eans.filter((ean): ean is string => Boolean(ean)))].sort().join(',');
  const active = sepaEnabled && key !== '';
  const [references, setReferences] = useState<Map<string, ReferenceSummary> | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    let stale = false;
    getSepaPrices(key.split(',')).then(
      byEan => {
        if (stale) return;
        const today = new Date();
        const summaries = new Map<string, ReferenceSummary>();
        for (const [ean, prices] of byEan) {
          const summary = referenceSummary(prices, today);
          if (summary) summaries.set(ean, summary);
        }
        setReferences(summaries);
      },
      () => { if (!stale) setReferences(EMPTY); },
    );
    return () => { stale = true; };
  }, [active, key]);

  return active && references ? references : EMPTY;
}
