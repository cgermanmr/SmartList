import { useEffect, useState } from 'react';
import { toGtin13 } from '@/lib/gtin';
import { Product } from '@/lib/models';
import { getSepaProduct, sepaEnabled, SepaProduct } from '@/lib/sepa';
import { useStore } from '@/lib/store';

const DEBOUNCE_MS = 300;

/** Respuesta del catálogo para un código: el producto, fuera de Precios Claros o falló la consulta */
export type EanAnswer = { ean: string } & (
  | { status: 'sepa'; sepa: SepaProduct }
  | { status: 'missing' }
  | { status: 'failed' }
);

export type ManualEan =
  | { status: 'idle' }                       // vacío, incompleto, todavía escribiendo o sin Supabase
  | { status: 'own'; product: Product }
  | { status: 'loading' }
  | EanAnswer;

/**
 * El código de barras de un producto cargado a mano (spec 34): si ya es de un propio, si está en Precios Claros o no.
 * Se revisa al abrir el formulario, 300 ms después de escribir un código válido o enseguida con `check` (el lector).
 * `immediate`: no espera (al guardar enseguida de escribir). `known` es lo que el buscador o el lector acaba de
 * averiguar: ese código no se vuelve a consultar.
 */
export function useManualEan(text: string, known: EanAnswer | null, immediate: boolean):
  { state: ManualEan; check: (ean: string) => void } {
  const products = useStore(s => s.products);
  const ean = toGtin13(text.trim());
  // Código que ya se puede revisar: el del campo, salvo mientras se espera a que se termine de escribir
  const [settled, setSettled] = useState<string | null>(ean);
  const [answer, setAnswer] = useState<EanAnswer | null>(known);

  const ready = ean !== null && (immediate || settled === ean);
  const own = ready ? products.find(p => p.ean === ean) : undefined;
  const wanted = ready && !own && sepaEnabled ? ean : null;
  const answered = wanted !== null && answer?.ean === wanted;

  useEffect(() => {
    if (ean === null || ready) return undefined;
    const timer = setTimeout(() => setSettled(ean), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [ean, ready]);

  useEffect(() => {
    if (wanted === null || answered) return undefined;
    let stale = false;
    getSepaProduct(wanted).then(
      sepa => { if (!stale) setAnswer(sepa ? { ean: wanted, status: 'sepa', sepa } : { ean: wanted, status: 'missing' }); },
      () => { if (!stale) setAnswer({ ean: wanted, status: 'failed' }); },
    );
    return () => { stale = true; };
  }, [wanted, answered]);

  /** Código leído: sin esperar; si la consulta anterior había fallado, se repite */
  function check(code: string) {
    setSettled(code);
    setAnswer(prev => (prev?.ean === code && prev.status === 'failed' ? null : prev));
  }

  function currentState(): ManualEan {
    if (own) return { status: 'own', product: own };
    if (wanted === null) return { status: 'idle' };
    return answered && answer ? answer : { status: 'loading' };
  }

  return { state: currentState(), check };
}
