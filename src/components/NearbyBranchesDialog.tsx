'use client';

import { ChevronRight, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { formatDistance } from '@/lib/geo';
import { nearbyListSummary } from '@/lib/location';
import { mapStops, MapStop } from '@/lib/route';
import { MAX_NEAR_BRANCHES, storeRefFromBranch } from '@/lib/sepa';
import { useStore } from '@/lib/store';
import BranchMap from './BranchMap';
import { useNearBranches } from './useNearby';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Lista de los comercios cercanos de la barra de ubicación, del más cercano al más lejano; tocar uno abre su mapa
 * encima (spec 20). `<dialog>` nativo: cierra con Escape y devuelve el foco al link que lo abrió.
 * El cierre va en la limpieza del efecto: también corre al ocultarse la página con <Activity>.
 */
export default function NearbyBranchesDialog({ open, onClose }: Props) {
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
      // El evento close llega en una tarea aparte: si la lista ya se volvió a abrir, es el del cierre anterior
      onClose={e => { if (!e.currentTarget.open) onClose(); }}
      // El contenido ocupa todo el dialog: un click con el dialog como destino cae en el fondo oscuro
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none flex-col overflow-hidden border-0 bg-white p-0 text-gray-900 backdrop:bg-black/50 open:flex sm:m-auto sm:h-auto sm:max-h-[min(46rem,calc(100dvh-4rem))] sm:max-w-lg sm:rounded-2xl sm:shadow-xl">
      {open && <BranchList titleId={titleId} onClose={onClose} />}
    </dialog>
  );
}

// ── Contenido del modal ──────────────────────────────────────

function BranchList({ titleId, onClose }: { titleId: string; onClose: () => void }) {
  const location = useStore(s => s.location);
  const { status, branches, approx, radiusKm } = useNearBranches();
  const [mapStop, setMapStop] = useState<MapStop[] | null>(null);
  const summaryId = useId();

  const place = location?.source === 'localidad' ? location.label : undefined;

  return (
    <>
      {/* Encabezado fijo: la lista hace scroll debajo */}
      <div className="flex shrink-0 items-start gap-3 border-b border-gray-200 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-3">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg font-semibold leading-snug">Comercios cercanos</h2>
          {status === 'ready' && branches.length > 0 && (
            <p id={summaryId} className="break-words text-sm text-gray-600">
              {nearbyListSummary({ count: branches.length, radiusKm, place, limited: branches.length >= MAX_NEAR_BRANCHES })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar lista"
          className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
          <X aria-hidden="true" className="size-6" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        {status === 'loading' && <p role="status" className="px-4 py-6 text-sm text-gray-600">Buscando comercios…</p>}
        {status === 'error' && (
          <p role="alert" className="px-4 py-6 text-sm text-red-700">No se pudieron cargar los comercios</p>
        )}
        {status === 'ready' && branches.length === 0 && (
          <p className="px-4 py-6 text-sm text-gray-600">No hay comercios de Precios Claros a menos de {radiusKm} km</p>
        )}

        {branches.length > 0 && (
          <ul aria-describedby={summaryId} className="divide-y divide-gray-200">
            {branches.map((branch, i) => {
              const store = storeRefFromBranch(branch);
              const detail = [branch.address, branch.barrio ?? branch.localidad].filter(Boolean).join(', ');
              const km = formatDistance(branch.distanceKm);
              const distance = `${approx ? 'aprox. ' : ''}${km}`;
              return (
                <li key={branch.id}>
                  <button
                    type="button"
                    onClick={() => setMapStop(mapStops([store]))}
                    aria-label={`Ver ${store.name} en el mapa, a ${distance}`}
                    className="list-row min-h-11 px-4">
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-semibold text-gray-900">{store.name}</span>
                      {detail && <span className="block break-words text-sm text-gray-600">{detail}</span>}
                    </span>
                    {/* Con localidad, "aprox." chico arriba: la cifra queda alineada y no le quita ancho al nombre */}
                    <span className="shrink-0 text-right">
                      {approx && <span className="block text-xs text-gray-500">aprox.</span>}
                      <span
                        className={`block font-display font-semibold tabular-nums ${i === 0 ? 'text-primary-700' : 'text-gray-900'}`}>
                        {km}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-gray-500" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <BranchMap stops={mapStop} onClose={() => setMapStop(null)} />
    </>
  );
}
