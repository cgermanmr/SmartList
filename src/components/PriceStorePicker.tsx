'use client';

import { LocateFixed, MapPin, Store } from 'lucide-react';
import { Ref, useId, useMemo, useState, useSyncExternalStore } from 'react';
import { formatDistance, LatLng } from '@/lib/geo';
import { geolocationAvailable, LOCATION_ERROR_MESSAGE, LocationError, requestPosition } from '@/lib/location';
import { StoreRef } from '@/lib/models';
import { recentStores, storesAtPoint } from '@/lib/price-form';
import { branchLabel, storeRefFromBranch } from '@/lib/sepa';
import { useStore } from '@/lib/store';
import OtherStoreForm from './OtherStoreForm';
import { useSepaBranches } from './useNearby';

const noSubscribe = () => () => {};

const LINK_CLASS = 'inline-flex min-h-11 items-center px-1 text-sm font-semibold text-primary-700 underline underline-offset-2 hover:text-primary-800';

/** El error del GPS con la indicación de seguir a mano */
const POSITION_ERROR: Record<LocationError, string> = {
  denied: 'Sin permiso para usar tu ubicación. Elegí el comercio a mano.',
  unavailable: `${LOCATION_ERROR_MESSAGE.unavailable} Elegí el comercio a mano.`,
};

interface Props {
  value: StoreRef | null;
  onChange: (store: StoreRef | null) => void;
  /** "Elegí el comercio" al guardar sin comercio */
  error?: string;
  /** Contenedor del bloque: Cargar precio enfoca su primer control cuando falta el comercio */
  ref?: Ref<HTMLElement>;
}

type Gps =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'located'; point: LatLng }
  | { status: 'error'; error: LocationError };

/**
 * Bloque "Comercio" de Cargar precio (spec 26): "Usar mi ubicación" (sucursales de Precios Claros a menos de 200 m),
 * los comercios usados o "Otro comercio". La posición se lee una vez y no cambia la ubicación guardada de la app.
 */
export default function PriceStorePicker({ value, onChange, error, ref }: Props) {
  const titleId = useId();
  const errorId = useId();

  if (value) {
    const detail = value.address ?? value.barrio;
    const located = value.lat !== undefined && value.lng !== undefined;
    return (
      <section ref={ref} aria-labelledby={titleId} className="card p-4">
        <h2 id={titleId} className="font-semibold mb-2">Comercio *</h2>
        <div className="flex items-center gap-3 rounded-xl bg-primary-50 px-3 py-2">
          {located
            ? <MapPin aria-hidden="true" className="size-5 shrink-0 text-primary-700" />
            : <Store aria-hidden="true" className="size-5 shrink-0 text-primary-700" />}
          <span className="min-w-0 flex-1">
            <span className="block font-semibold break-words">{value.name}</span>
            {detail && <span className="block text-sm text-gray-600 break-words">{detail}</span>}
          </span>
          <button type="button" onClick={() => onChange(null)} aria-label={`Cambiar el comercio ${value.name}`}
            className={`${LINK_CLASS} shrink-0`}>
            Cambiar
          </button>
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} aria-labelledby={titleId} className="card p-4">
      <h2 id={titleId} className="font-semibold">Comercio *</h2>
      {error && <p id={errorId} role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
      <StoreChooser onChoose={onChange} describedBy={error ? errorId : undefined} />
    </section>
  );
}

/** Sin comercio elegido: GPS, comercios usados y "Otro comercio". Se monta de nuevo con cada "Cambiar" */
function StoreChooser({ onChoose, describedBy }: { onChoose: (store: StoreRef) => void; describedBy?: string }) {
  const canLocate = useSyncExternalStore(noSubscribe, geolocationAvailable, () => false);
  const prices = useStore(s => s.prices);
  const purchases = useStore(s => s.purchases);
  const used = useMemo(() => recentStores(prices, purchases), [prices, purchases]);

  const [gps, setGps] = useState<Gps>({ status: 'idle' });
  const point = gps.status === 'located' ? gps.point : null;
  // Las sucursales se bajan recién con la posición (una vez por sesión, caché de módulo)
  const branches = useSepaBranches(point !== null);
  const atPoint = useMemo(
    () => (point && branches.status === 'ready' ? storesAtPoint(branches.branches, point) : []),
    [branches, point],
  );
  const searching = gps.status === 'locating' || (point !== null && branches.status === 'loading');
  const noBranches = point !== null && !searching && atPoint.length === 0;

  // "Otro comercio" a mano, u "Otro comercio acá" con las coordenadas de la lectura
  const [other, setOther] = useState<'closed' | 'manual' | 'here'>('closed');
  const otherMode = noBranches && other === 'closed' ? 'here' : other;

  function locate() {
    setGps({ status: 'locating' });
    setOther('closed');
    requestPosition({ highAccuracy: true }).then(
      position => setGps({ status: 'located', point: position }),
      (error: LocationError) => setGps({ status: 'error', error }),
    );
  }

  return (
    <div className="mt-3 space-y-4">
      {canLocate && (
        <div>
          <button type="button" onClick={locate} disabled={searching} aria-describedby={describedBy}
            className="btn-secondary inline-flex w-full items-center justify-center gap-2">
            <LocateFixed aria-hidden="true" className="size-5" />
            Usar mi ubicación
          </button>

          <div role="status">
            {searching && <p className="mt-2 text-sm text-gray-600">Buscando comercios cerca…</p>}
            {noBranches && <p className="mt-2 text-sm text-gray-600">No hay comercios de Precios Claros a menos de 200 m</p>}
          </div>
          {gps.status === 'error' && <p role="alert" className="mt-2 text-sm text-red-700">{POSITION_ERROR[gps.error]}</p>}

          {atPoint.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-sm font-semibold text-gray-700">¿Estás en…?</p>
              <ul className="rounded-xl border border-gray-200 divide-y divide-gray-200 overflow-hidden">
                {atPoint.map((branch, i) => {
                  const label = branchLabel(branch);
                  return (
                    <li key={branch.id}>
                      <button type="button" onClick={() => onChoose(storeRefFromBranch(branch))}
                        aria-label={`¿Estás en ${label}? A ${formatDistance(branch.distanceKm)}`}
                        className="list-row min-h-12">
                        <span className="min-w-0 flex-1">
                          <span className={`block font-semibold break-words ${i === 0 ? 'text-primary-700' : 'text-gray-900'}`}>
                            {label}
                          </span>
                          {branch.address && <span className="block text-sm text-gray-600 break-words">{branch.address}</span>}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-gray-600">a {formatDistance(branch.distanceKm)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {point && !searching && otherMode !== 'here' && (
            <button type="button" onClick={() => setOther('here')} className={`${LINK_CLASS} mt-1`}>
              Otro comercio acá
            </button>
          )}
        </div>
      )}

      {used.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-gray-700">Comercios que usaste</p>
          <ul className="rounded-xl border border-gray-200 divide-y divide-gray-200 overflow-hidden">
            {used.map(store => {
              const detail = store.address ?? store.barrio;
              return (
                <li key={`${store.sepaId ?? ''}|${store.name}|${store.barrio ?? ''}`}>
                  <button type="button" onClick={() => onChoose(store)} className="list-row min-h-12">
                    <Store aria-hidden="true" className="size-5 shrink-0 text-gray-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium break-words">{store.name}</span>
                      {detail && <span className="block text-sm text-gray-500 break-words">{detail}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {otherMode === 'closed' ? (
        <button type="button" onClick={() => setOther('manual')} className={LINK_CLASS}>Otro comercio</button>
      ) : (
        <OtherStoreForm
          key={otherMode}
          title={otherMode === 'here' ? 'Otro comercio acá' : 'Otro comercio'}
          gps={otherMode === 'here' ? point ?? undefined : undefined}
          submitLabel="Usar este comercio"
          className="rounded-xl border border-gray-200 p-3"
          onSave={onChoose}
          onCancel={noBranches ? undefined : () => setOther('closed')}
        />
      )}
    </div>
  );
}
