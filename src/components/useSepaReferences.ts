import { useEffect, useState } from 'react';
import { getSepaPrices, ReferenceSummary, referenceSummary, sepaEnabled } from '@/lib/sepa';

const EMPTY = new Map<string, ReferenceSummary>();

interface Answered {
  /** EAN que ya tuvieron respuesta (con precios, sin precios o con error) */
  eans: ReadonlySet<string>;
  /** Los que tienen precios */
  references: Map<string, ReferenceSummary>;
}

const NONE: Answered = { eans: new Set(), references: EMPTY };

export interface SepaReferenceLookup {
  references: Map<string, ReferenceSummary>;
  /** true mientras se buscan los precios de ese EAN (pedido y todavía sin respuesta) */
  isLoading: (ean: string | undefined) => boolean;
}

/**
 * Precio de referencia de varios EAN, en una sola consulta (`getSepaPrices`, con caché). `references` tiene solo los
 * que tienen precios: mientras carga, sin precios o con error, el EAN no está y la pantalla no muestra nada. Las
 * respuestas se acumulan durante la vida del componente (el precio de un EAN no cambia durante la sesión): al cambiar
 * los EAN, los que ya se conocían siguen disponibles y solo los nuevos quedan cargando. Una respuesta que llega
 * después de que cambiaron los EAN se descarta.
 */
export function useSepaReferenceLookup(eans: readonly (string | undefined)[]): SepaReferenceLookup {
  const key = [...new Set(eans.filter((ean): ean is string => Boolean(ean)))].sort().join(',');
  const active = sepaEnabled && key !== '';
  const [answered, setAnswered] = useState<Answered>(NONE);

  useEffect(() => {
    if (!active) return undefined;
    let stale = false;
    const requested = key.split(',');
    getSepaPrices(requested).then(
      byEan => {
        if (stale) return;
        const today = new Date();
        setAnswered(prev => {
          const references = new Map(prev.references);
          for (const ean of requested) {
            const summary = referenceSummary(byEan.get(ean) ?? [], today);
            if (summary) references.set(ean, summary);
            else references.delete(ean);
          }
          return { eans: new Set([...prev.eans, ...requested]), references };
        });
      },
      // Con error se habilita igual: sin referencia, el ítem entra en $0 con "Completar precio"
      () => {
        if (!stale) setAnswered(prev => ({ eans: new Set([...prev.eans, ...requested]), references: prev.references }));
      },
    );
    return () => { stale = true; };
  }, [active, key]);

  const pending = active ? new Set(key.split(',')) : null;
  return {
    references: active ? answered.references : EMPTY,
    isLoading: ean => Boolean(ean && pending?.has(ean) && !answered.eans.has(ean)),
  };
}

/** Solo el mapa de referencias, para las pantallas que no necesitan saber si sigue cargando */
export function useSepaReferences(eans: readonly (string | undefined)[]): Map<string, ReferenceSummary> {
  return useSepaReferenceLookup(eans).references;
}
