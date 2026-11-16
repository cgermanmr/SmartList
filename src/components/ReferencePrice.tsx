import { useState } from 'react';
import { formatMoney } from '@/lib/format';
import { freshnessLabel, referenceLabel, referenceStatus, ReferenceStatus, vsReference } from '@/lib/sepa';
import SepaPriceTable from './SepaPriceTable';
import { useSepaReferences } from './useSepaReferences';

interface Props {
  ean: string | undefined;
  /** Último precio propio registrado; null si no hay */
  ownPrice: number | null;
}

/** Colores de la comparación contra la referencia (badge del detalle y línea del carrito) */
export const REFERENCE_BADGE_CLASS: Record<ReferenceStatus, string> = {
  below:  'bg-green-100 text-green-800',
  inline: 'bg-blue-100 text-blue-800',
  above:  'bg-red-100 text-red-800',
};

export const REFERENCE_TEXT_CLASS: Record<ReferenceStatus, string> = {
  below:  'text-green-700',
  inline: 'text-blue-700',
  above:  'text-red-700',
};

function chainCount(count: number): string {
  return count === 1 ? '1 cadena' : `${count} cadenas`;
}

/**
 * Tarjeta "Precio de referencia" del detalle: promedio entre cadenas, comparación con el último precio propio y la
 * lista por cadena. Sin EAN, sin Supabase, sin precios o con error no se muestra (ni consulta, si no hay EAN)
 */
export default function ReferencePrice({ ean, ownPrice }: Props) {
  const references = useSepaReferences([ean]);
  const [today] = useState(() => new Date());
  const summary = ean ? references.get(ean) : undefined;
  if (!summary) return null;

  const pct = ownPrice !== null ? vsReference(ownPrice, summary.reference) : null;
  const status = pct !== null ? referenceStatus(pct) : null;

  return (
    <section aria-labelledby="reference-title" className="card p-6 mb-6">
      <h2 id="reference-title" className="text-xl font-bold">
        Precio de referencia <span className="font-normal text-gray-600">· Precios Claros</span>
      </h2>
      <p className="mt-1 text-xs text-gray-600">{freshnessLabel(summary, today)}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-2xl font-bold text-gray-900">
          Promedio <span className="tabular-nums">${formatMoney(summary.reference)}</span>
        </p>
        {pct !== null && status && (
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${REFERENCE_BADGE_CLASS[status]}`}>
            {referenceLabel(pct)}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-gray-700">
        Más barato en {summary.cheapest.bandera}:{' '}
        <strong className="font-semibold text-gray-900 tabular-nums">${formatMoney(summary.cheapest.mediana)}</strong>
      </p>
      <p className="text-sm text-gray-700">
        Rango <span className="tabular-nums">${formatMoney(summary.range[0])} – ${formatMoney(summary.range[1])}</span>
        {' '}en {chainCount(summary.chains)}
      </p>

      <div className="mt-4">
        <SepaPriceTable summary={summary} />
      </div>
    </section>
  );
}
