'use client';

import { LocateFixed, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { distanceKm, LatLng } from '@/lib/geo';
import { geolocationAvailable, LocationError, requestPosition } from '@/lib/location';
import { useLeafletMap } from './useLeafletMap';

interface Props {
  open: boolean;
  /** Centro y zoom con los que se abre */
  center: LatLng & { zoom: number };
  /** `moved`: el punto no es el centro con el que se abrió */
  onConfirm: (point: LatLng, moved: boolean) => void;
  onClose: () => void;
}

const noSubscribe = () => () => {};

/** Más lejos, el punto puede quedar a varias cuadras */
const MIN_ZOOM = 16;

/** Zoom al centrar en el GPS */
const GPS_ZOOM = 17;

/** Menos que esto es el redondeo a píxeles del mapa, no un movimiento */
const MOVED_KM = 0.003;

/** El zoom se hace sobre el centro: acercar no corre el punto que está bajo el pin */
const MAP_OPTIONS = { scrollWheelZoom: 'center', touchZoom: 'center', doubleClickZoom: 'center' } as const;

const LOCATE_ERROR: Record<LocationError, string> = {
  denied: 'Sin permiso para usar tu ubicación.',
  unavailable: 'No se pudo obtener tu ubicación.',
};

/**
 * "Marcar en el mapa" (spec 35): el pin queda fijo en el centro y se mueve el mapa. Modal como el de BranchMap, que se
 * abre encima del modal del carrito: Escape cierra solo este y devuelve el foco al botón que lo abrió
 */
export default function PointMapDialog({ open, center, onConfirm, onClose }: Props) {
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
      // El evento close llega en una tarea aparte: si el mapa ya se volvió a abrir, es el del cierre anterior
      onClose={e => { if (!e.currentTarget.open) onClose(); }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none flex-col overflow-hidden border-0 bg-white p-0 text-gray-900 backdrop:bg-black/50 open:flex sm:m-auto sm:h-[min(46rem,calc(100dvh-4rem))] sm:max-w-2xl sm:rounded-2xl sm:shadow-xl">
      {open && <PointMap titleId={titleId} center={center} onConfirm={onConfirm} onClose={onClose} />}
    </dialog>
  );
}

/** Se monta al abrir: la vida del mapa es la de este componente */
function PointMap({ titleId, center, onConfirm, onClose }: Omit<Props, 'open'> & { titleId: string }) {
  const hintId = useId();
  const canLocate = useSyncExternalStore(noSubscribe, geolocationAvailable, () => false);
  const { containerRef, leaflet, failed } = useLeafletMap(MAP_OPTIONS);
  const [initial] = useState(center);
  const [zoom, setZoom] = useState(center.zoom);
  const [moving, setMoving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<LocationError | null>(null);

  useEffect(() => {
    if (!leaflet) return;
    const { map } = leaflet;
    const onZoom = () => setZoom(map.getZoom());
    const onMoveStart = () => setMoving(true);
    const onMoveEnd = () => setMoving(false);
    map.setView([initial.lat, initial.lng], initial.zoom, { animate: false });
    map.on({ zoomend: onZoom, movestart: onMoveStart, moveend: onMoveEnd });
    return () => { map.off({ zoomend: onZoom, movestart: onMoveStart, moveend: onMoveEnd }); };
  }, [leaflet, initial]);

  const tooFar = zoom < MIN_ZOOM;

  function locate() {
    setLocating(true);
    setLocateError(null);
    requestPosition({ highAccuracy: true }).then(
      position => {
        setLocating(false);
        // Solo centra el mapa: la ubicación de la app no cambia
        leaflet?.map.setView([position.lat, position.lng], GPS_ZOOM);
      },
      (reason: LocationError) => {
        setLocating(false);
        setLocateError(reason);
      },
    );
  }

  function confirm() {
    if (!leaflet || tooFar) return;
    const { lat, lng } = leaflet.map.getCenter();
    const moved = distanceKm(initial, { lat, lng }) > MOVED_KM;
    onConfirm(moved ? { lat, lng } : { lat: initial.lat, lng: initial.lng }, moved);
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-3">
        <h2 id={titleId} className="min-w-0 flex-1 text-lg font-semibold leading-snug">Marcar el comercio</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar mapa"
          className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
          <X aria-hidden="true" className="size-6" />
        </button>
      </div>

      {failed ? (
        <p role="alert" className="flex flex-1 items-center justify-center px-4 text-center text-gray-600">
          No se pudo cargar el mapa
        </p>
      ) : (
        <>
          {/* isolate: los z-index de Leaflet no tapan el resto del modal */}
          <div className="relative isolate min-h-40 flex-1 bg-gray-100">
            <div
              ref={containerRef}
              role="application"
              aria-label="Mapa. El comercio queda en el centro: movelo con las flechas, y acercá o alejá con más y menos."
              className="absolute inset-0 z-0 font-sans focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-primary-500" />
            {leaflet && <CenterPin lifted={moving} />}
          </div>

          <div className="shrink-0 border-t border-gray-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3">
            {canLocate && (
              <button type="button" onClick={locate} disabled={locating || !leaflet}
                className="btn-secondary inline-flex w-full items-center justify-center gap-2">
                <LocateFixed aria-hidden="true" className="size-5" />
                {locating ? 'Buscando tu ubicación…' : 'Usar mi ubicación'}
              </button>
            )}
            <div role="alert">
              {locateError && <p className="mt-2 text-sm font-semibold text-red-700">{LOCATE_ERROR[locateError]}</p>}
            </div>
            <p className="my-2 text-sm text-gray-600">El punto se envía a OpenStreetMap para buscar su dirección.</p>
            <button type="button" onClick={confirm} disabled={!leaflet || tooFar} aria-describedby={hintId}
              className="btn-primary w-full">
              Usar este punto
            </button>
            {/* Alto reservado: al acercarse, el mapa no cambia de tamaño */}
            <p id={hintId} role="status" className="mt-1 min-h-5 text-center text-sm font-semibold text-gray-700">
              {tooFar && 'Acercá el mapa para marcar el punto'}
            </p>
          </div>
        </>
      )}
    </>
  );
}

/** Pin de la marca con la punta en el centro exacto; se levanta mientras el mapa se mueve y deja ver el punto */
function CenterPin({ lifted }: { lifted: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-10">
      <span className="absolute -left-1 -top-0.5 block h-1 w-2 rounded-full bg-gray-900/50" />
      <svg width="36" height="46" viewBox="0 0 28 36"
        className={`absolute -left-[18px] -top-[45px] drop-shadow motion-safe:transition-transform motion-safe:duration-150 ${
          lifted ? '-translate-y-2' : ''
        }`}>
        <path d="M14 35C14 35 27 22.5 27 14A13 13 0 1 0 1 14C1 22.5 14 35 14 35Z"
          fill="var(--color-primary-700)" stroke="#fff" strokeWidth="2" />
        <circle cx="14" cy="14" r="5" fill="#fff" />
      </svg>
    </div>
  );
}
