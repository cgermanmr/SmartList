'use client';

import { Map as MapIcon, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { BasketOption, SavingsLine, savingsLine, withoutEanLabel } from '@/lib/basket';
import { formatIsoDate, formatMoney } from '@/lib/format';
import { formatDistance } from '@/lib/geo';
import { nearbyListSummary } from '@/lib/location';
import { mapStops, MapStop } from '@/lib/route';
import { freshnessLabel, isStaleDate, storeRefFromBranch } from '@/lib/sepa';
import { useStore } from '@/lib/store';
import BranchMap from './BranchMap';
import LocationBar from './LocationBar';
import { Chevron } from './SepaPriceTable';
import { BasketComparison } from './useBasketComparison';

/** Opciones que se ven antes de tocar "Ver más" (como NearbyStores) */
const VISIBLE_OPTIONS = 10;
/** Hasta esta cantidad de productos el medidor muestra un segmento por producto; más, una barra continua */
const MAX_SEGMENTS = 12;

export const SAVINGS_CLASS: Record<SavingsLine['tone'], string> = {
  cheaper: 'text-green-700',
  pricier: 'text-red-700',
  here:    'text-primary-700',
};

export function distanceLabel(km: number, approx: boolean): string {
  return `${approx ? 'aprox. ' : ''}${formatDistance(km)}`;
}

// ── Piezas compartidas con la tarjeta ────────────────────────

/** Cobertura a simple vista: un segmento por producto del carrito, lleno si el comercio lo tiene. Decorativo */
function CoverageMeter({ have, total }: { have: number; total: number }) {
  if (total > MAX_SEGMENTS) {
    return (
      <span aria-hidden="true" className="block h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-primary-100">
        <span className="block h-full rounded-full bg-primary-700" style={{ width: `${(have / total) * 100}%` }} />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="flex w-full max-w-48 gap-0.5">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-1.5 flex-1 rounded-full ${i < have ? 'bg-primary-700' : 'bg-primary-100'}`} />
      ))}
    </span>
  );
}

/** Medidor, "Tiene N de M · $total" y la línea de ahorro */
export function OptionSummary({ option, totalLines }: { option: BasketOption; totalLines: number }) {
  const savings = savingsLine(option, totalLines);
  return (
    <span className="mt-1.5 block">
      <CoverageMeter have={option.found.length} total={totalLines} />
      <span className="mt-1.5 block text-sm text-gray-700">
        Tiene {option.found.length} de {totalLines} ·{' '}
        <strong className="font-display text-base font-semibold tabular-nums text-gray-900">
          ${formatMoney(option.total)}
        </strong>
      </span>
      {savings && (
        <span className={`block text-sm font-semibold ${SAVINGS_CLASS[savings.tone]}`}>{savings.text}</span>
      )}
    </span>
  );
}

// ── Modal ──────────────────────────────────────────────────

interface Props {
  open: boolean;
  comparison: BasketComparison;
  /** Productos del carrito que entran en la comparación (con EAN) */
  totalLines: number;
  withoutEan: number;
  onClose: () => void;
  /** Pasar a esa sucursal los productos que tiene (cierra el modal) */
  onMove: (option: BasketOption) => void;
}

/**
 * "¿Dónde conviene?" (spec 25): las sucursales cercanas (o las cadenas, sin ubicación) ordenadas por cuántos
 * productos del carrito tienen y por total. `<dialog>` nativo: cierra con Escape y devuelve el foco al botón que lo
 * abrió. El cierre va en la limpieza del efecto: también corre al ocultarse la página con <Activity>.
 */
export default function CartCompareDialog({ open, comparison, totalLines, withoutEan, onClose, onMove }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // El evento close llega en una tarea aparte: si el modal ya se volvió a abrir, es el del cierre anterior
      onClose={e => { if (!e.currentTarget.open) onClose(); }}
      // El contenido ocupa todo el dialog: un click con el dialog como destino cae en el fondo oscuro
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none flex-col overflow-hidden border-0 bg-white p-0 text-gray-900 backdrop:bg-black/50 open:flex sm:m-auto sm:h-auto sm:max-h-[min(46rem,calc(100dvh-4rem))] sm:max-w-lg sm:rounded-2xl sm:shadow-xl">
      {open && (
        <CompareList
          titleId={titleId}
          comparison={comparison}
          totalLines={totalLines}
          withoutEan={withoutEan}
          onClose={onClose}
          onMove={onMove}
        />
      )}
    </dialog>
  );
}

// ── Contenido del modal ──────────────────────────────────────

interface ListProps extends Omit<Props, 'open'> {
  titleId: string;
}

function CompareList({ titleId, comparison, totalLines, withoutEan, onClose, onMove }: ListProps) {
  const location = useStore(s => s.location);
  const { mode, loading, options, emptyBranches, branchCount, limited, approx, radiusKm, date } = comparison;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [mapStop, setMapStop] = useState<MapStop[] | null>(null);
  const [today] = useState(() => new Date());
  const summaryId = useId();

  const place = location?.source === 'localidad' ? location.label : undefined;
  const summary = mode === 'branches'
    // "Los 40 más cercanos" solo si las 40 tienen productos; si no, la cantidad de opciones
    ? nearbyListSummary({ count: options.length, radiusKm, place, limited: limited && options.length === branchCount })
    : options.length === 1 ? '1 cadena' : `${options.length} cadenas`;
  const visible = showAll ? options : options.slice(0, VISIBLE_OPTIONS);
  const hidden = options.length - visible.length;
  const without = withoutEanLabel(withoutEan);
  const stale = date !== null && isStaleDate(date, today);

  return (
    <>
      {/* Encabezado fijo: la lista hace scroll debajo */}
      <div className="flex shrink-0 items-start gap-3 border-b border-gray-200 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-3">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg font-semibold leading-snug">¿Dónde conviene?</h2>
          {!loading && options.length > 0 && (
            <p id={summaryId} className="break-words text-sm text-gray-600">{summary}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar comparación"
          className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
          <X aria-hidden="true" className="size-6" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="border-b border-gray-200 px-4 pb-3">
          <LocationBar />
        </div>

        {/* La región queda montada para que se anuncie el resultado al cambiar el radio */}
        <div role="status">
          {loading && (
            <p className="px-4 py-6 text-sm text-gray-600">
              {mode === 'branches' ? 'Buscando precios cerca…' : 'Buscando precios…'}
            </p>
          )}
          {!loading && options.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-600">
              {mode === 'branches' ? 'Ningún comercio cercano tiene tus productos' : 'Ninguna cadena tiene tus productos'}
            </p>
          )}
        </div>

        {mode === 'chains' && !loading && options.length > 0 && (
          <p className="px-4 pt-3 text-sm text-gray-600">
            Precio promedio de la cadena en todo el país. Activá tu ubicación para ver comercios cercanos.
          </p>
        )}

        {!loading && visible.length > 0 && (
          <ul aria-describedby={summaryId} className="divide-y divide-gray-200">
            {visible.map((option, i) => (
              <OptionRow
                key={option.key}
                option={option}
                best={i === 0}
                totalLines={totalLines}
                approx={approx}
                expanded={openKey === option.key}
                onToggle={() => setOpenKey(key => (key === option.key ? null : option.key))}
                onMove={() => onMove(option)}
                onMap={option.branch ? () => setMapStop(mapStops([storeRefFromBranch(option.branch!)])) : undefined}
              />
            ))}
          </ul>
        )}

        <div className="space-y-2 px-4 pt-3">
          {hidden > 0 && (
            <button type="button" onClick={() => setShowAll(true)} className="btn-secondary w-full text-sm">
              Ver {hidden} más
            </button>
          )}
          {without && <p className="text-sm text-gray-600">{without}</p>}
          {mode === 'branches' && !loading && emptyBranches > 0 && (
            <p className="text-sm text-gray-600">
              {emptyBranches === 1
                ? '1 comercio cercano no tiene ninguno de tus productos'
                : `${emptyBranches} comercios cercanos no tienen ninguno de tus productos`}
            </p>
          )}
          {date && !loading && options.length > 0 && (
            <p className={`text-xs ${stale ? 'font-semibold text-amber-800' : 'text-gray-600'}`}>
              {mode === 'branches'
                ? `Precios de lista informados a Precios Claros el ${formatIsoDate(date)} — SEPA (CC-BY-4.0)`
                : `${freshnessLabel({ date, stale }, today)} — SEPA (CC-BY-4.0)`}
            </p>
          )}
        </div>
      </div>

      <BranchMap stops={mapStop} onClose={() => setMapStop(null)} />
    </>
  );
}

// ── Fila de una opción ───────────────────────────────────────

interface RowProps {
  option: BasketOption;
  /** La primera de la lista: lleva el badge "Conviene" */
  best: boolean;
  totalLines: number;
  approx: boolean;
  expanded: boolean;
  onToggle: () => void;
  onMove: () => void;
  /** Solo sucursales */
  onMap?: () => void;
}

function OptionRow({ option, best, totalLines, approx, expanded, onToggle, onMove, onMap }: RowProps) {
  const panelId = useId();
  const { branch } = option;
  const detail = branch ? [branch.address, branch.barrio ?? branch.localidad].filter(Boolean).join(', ') : '';
  const located = branch && branch.lat !== null && branch.lng !== null;
  const count = option.found.length;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="list-row items-start px-4">
        <span className="min-w-0 flex-1">
          {best && (
            <span className="mb-1 inline-block rounded-full bg-primary-100 px-2 text-xs font-semibold text-primary-700">
              Conviene
            </span>
          )}
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 break-words font-semibold text-gray-900">{option.name}</span>
            {branch && (
              <span className="shrink-0 text-sm tabular-nums text-gray-600">{distanceLabel(branch.distanceKm, approx)}</span>
            )}
          </span>
          {detail && <span className="block break-words text-sm text-gray-600">{detail}</span>}
          <OptionSummary option={option} totalLines={totalLines} />
        </span>
        <span className="mt-0.5"><Chevron open={expanded} /></span>
      </button>

      <div id={panelId} hidden={!expanded} className="px-4 pb-4">
        <p className="break-words text-sm text-gray-700">
          {option.missing.length > 0
            ? <>No tiene: {option.missing.map(line => line.productName).join(', ')}</>
            : 'Tiene todos los productos del carrito'}
        </p>
        {branch && (
          <div className="mt-3 flex flex-wrap gap-2">
            {!option.alreadyThere && (
              <button
                type="button"
                onClick={onMove}
                aria-label={`Pasar ${count === 1 ? '1 producto' : `${count} productos`} a ${option.name}`}
                className="btn-primary flex-1 text-sm sm:flex-none">
                Pasar todo a este comercio
              </button>
            )}
            {located && onMap && (
              <button
                type="button"
                onClick={onMap}
                aria-label={`Ver ${option.name} en el mapa`}
                className="btn-secondary inline-flex items-center justify-center gap-1.5 text-sm">
                <MapIcon aria-hidden="true" className="size-5" />
                Mapa
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
