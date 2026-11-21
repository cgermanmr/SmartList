'use client';

import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { BasketLine, BasketOption, withoutEanLabel } from '@/lib/basket';
import { ReferenceSummary, sepaEnabled, storeRefFromBranch } from '@/lib/sepa';
import { useStore } from '@/lib/store';
import CartCompareDialog, { distanceLabel, OptionSummary } from './CartCompareDialog';
import { useBasketComparison } from './useBasketComparison';

interface Props {
  /** Ítems del carrito con EAN (basketLines) */
  lines: BasketLine[];
  withoutEan: number;
  /** Referencias por cadena que el carrito ya pidió: sin ubicación, la comparación es por cadena */
  references: Map<string, ReferenceSummary>;
  referencesLoading: boolean;
  /** Avisa cuántos productos pasaron y a qué comercio, para el aviso de la página */
  onMoved: (count: number, storeName: string) => void;
}

/**
 * Tarjeta "¿Dónde conviene?" arriba de los grupos del carrito (spec 25): la mejor opción y el botón que abre la
 * comparación completa. Con menos de 2 productos con EAN, o sin Supabase, no se muestra.
 */
export default function CartCompareCard({ lines, withoutEan, references, referencesLoading, onMoved }: Props) {
  const moveCartItems = useStore(s => s.moveCartItems);
  const comparison = useBasketComparison(lines, references, referencesLoading);
  const [open, setOpen] = useState(false);

  if (!sepaEnabled || lines.length < 2) return null;

  const { mode, loading, options, approx } = comparison;
  const best = options[0];
  const without = withoutEanLabel(withoutEan);
  const unit = mode === 'branches'
    ? (options.length === 1 ? 'comercio' : 'comercios')
    : (options.length === 1 ? 'cadena' : 'cadenas');

  function move(option: BasketOption) {
    if (!option.branch) return;
    const moves = option.found.map(f => ({ itemId: f.line.itemId, price: f.price }));
    moveCartItems(storeRefFromBranch(option.branch), moves);
    setOpen(false);
    onMoved(moves.length, option.name);
  }

  return (
    <section aria-labelledby="donde-conviene" className="card mb-6 p-4">
      <h2 id="donde-conviene" className="font-display text-lg font-semibold">¿Dónde conviene?</h2>

      <div role="status">
        {loading && (
          <p className="mt-1 text-sm text-gray-600">
            {mode === 'branches' ? 'Buscando precios cerca…' : 'Buscando precios…'}
          </p>
        )}
        {!loading && !best && (
          <p className="mt-1 text-sm text-gray-600">
            {mode === 'branches' ? 'Ningún comercio cercano tiene tus productos' : 'Ninguna cadena tiene tus productos'}
          </p>
        )}
      </div>

      {!loading && best && (
        <div className="mt-2">
          <p className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 break-words font-semibold text-gray-900">{best.name}</span>
            {best.branch && (
              <span className="shrink-0 text-sm tabular-nums text-gray-600">
                {distanceLabel(best.branch.distanceKm, approx)}
              </span>
            )}
          </p>
          <OptionSummary option={best} totalLines={lines.length} />
          {mode === 'chains' && (
            <p className="mt-2 text-sm text-gray-600">
              Precio promedio de la cadena en todo el país. Activá tu ubicación para ver comercios cercanos.
            </p>
          )}
        </div>
      )}

      {without && <p className="mt-2 text-sm text-gray-600">{without}</p>}

      {!loading && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-secondary mt-3 flex w-full items-center justify-between gap-2 sm:w-auto sm:min-w-64">
          {best
            ? `Comparar ${options.length} ${unit}`
            : mode === 'branches' ? 'Cambiar ubicación o radio' : 'Elegir ubicación'}
          <ChevronRight aria-hidden="true" className="size-5 shrink-0" />
        </button>
      )}

      <CartCompareDialog
        open={open}
        comparison={comparison}
        totalLines={lines.length}
        withoutEan={withoutEan}
        onClose={() => setOpen(false)}
        onMove={move}
      />
    </section>
  );
}
