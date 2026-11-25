'use client';

import { Car, ExternalLink, Footprints, LocateFixed, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { distanceKm, formatDistance, LatLng } from '@/lib/geo';
import { geolocationAvailable, gpsLocation, LocationError, requestPosition } from '@/lib/location';
import { formatDuration, getRoute, googleMapsUrl, MapStop, osrmUrl, Route, TravelMode } from '@/lib/route';
import { useStore } from '@/lib/store';
import { LeafletModule, useLeafletMap } from './useLeafletMap';

export type { MapStop } from '@/lib/route';

interface BranchMapProps {
  /** null → cerrado. 1 parada en Buscar, el detalle y el encabezado de un comercio; varias en el recorrido */
  stops: MapStop[] | null;
  /** Aclaraciones del recorrido ("1 comercio sin ubicación no aparece en el mapa") */
  notes?: string[];
  onClose: () => void;
}

const noSubscribe = () => () => {};

const MODES: { id: TravelMode; label: string; suffix: string; icon: typeof Car }[] = [
  { id: 'foot', label: 'A pie', suffix: 'a pie', icon: Footprints },
  { id: 'car', label: 'En auto', suffix: 'en auto', icon: Car },
];

/** Dentro del mapa no se ofrece elegir la localidad: los mensajes son más cortos que los de la barra de ubicación */
const LOCATE_ERROR: Record<LocationError, string> = {
  denied: 'Sin permiso para usar tu ubicación.',
  unavailable: 'No se pudo obtener tu ubicación.',
};

/** Zoom con un solo punto */
const SINGLE_ZOOM = 16;

/**
 * Mapa de un comercio (o del recorrido del carrito) con la ruta para llegar, en un `<dialog>` nativo: a pantalla
 * completa en el celular, cierra con Escape y devuelve el foco al botón que lo abrió.
 * El cierre va en la limpieza del efecto: también corre al ocultarse la página con <Activity>, así un modal
 * escondido no deja inerte la página a la que se navegó.
 */
export default function BranchMap({ stops, notes, onClose }: BranchMapProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = stops !== null && stops.length > 0;

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
      {open && <MapView stops={stops} notes={notes} titleId={titleId} onClose={onClose} />}
    </dialog>
  );
}

// ── Contenido del modal ──────────────────────────────────────

interface MapViewProps {
  stops: MapStop[];
  notes?: string[];
  titleId: string;
  onClose: () => void;
}

/** Se monta al abrir: la vida del mapa es la de este componente */
function MapView({ stops, notes = [], titleId, onClose }: MapViewProps) {
  const location = useStore(s => s.location);
  const setLocation = useStore(s => s.setLocation);
  const canLocate = useSyncExternalStore(noSubscribe, geolocationAvailable, () => false);
  // El origen es la ubicación guardada, solo si es de GPS: una ruta desde el centro de una localidad sería engañosa
  const origin = location?.source === 'gps' ? location : null;
  const tour = stops.length > 1;

  const [mode, setMode] = useState<TravelMode>('foot');
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<LocationError | null>(null);

  // ── Ruta ───────────────────────────────────────────────────
  const points: LatLng[] = useMemo(() => (origin ? [origin, ...stops] : stops), [origin, stops]);
  // Con un solo punto (un comercio y sin origen) no hay ruta ni consulta
  const routeKey = points.length >= 2 ? osrmUrl(points, mode) : null;
  const [result, setResult] = useState<{ key: string; route: Route | null } | null>(null);

  useEffect(() => {
    if (!routeKey) return;
    let cancelled = false;
    getRoute(points, mode).then(route => {
      if (!cancelled) setResult({ key: routeKey, route });
    });
    return () => { cancelled = true; };
  }, [routeKey, points, mode]);

  const pending = routeKey !== null && result?.key !== routeKey;
  const route = routeKey !== null && result?.key === routeKey ? result.route : null;
  const failed = routeKey !== null && !pending && route === null;
  // Sin respuesta del servicio no hay selector: la línea recta es la misma a pie y en auto
  const showModes = routeKey !== null && !failed;

  const straightKm = useMemo(
    () => points.slice(1).reduce((sum, point, i) => sum + distanceKm(points[i], point), 0),
    [points],
  );

  // ── Mapa ───────────────────────────────────────────────────
  // Sin conexión (o si no carga Leaflet) quedan el nombre, la dirección y el botón de Google Maps
  const { containerRef, leaflet, failed: mapFailed } = useLeafletMap();

  // Marcadores y encuadre: todos los puntos con margen; con uno solo, centrado
  useEffect(() => {
    if (!leaflet) return;
    const { L, map } = leaflet;
    const group = L.layerGroup().addTo(map);
    stops.forEach((stop, i) => {
      L.marker([stop.lat, stop.lng], { icon: stopIcon(L, stop.name, tour ? i + 1 : undefined), interactive: false, keyboard: false })
        .addTo(group);
    });
    if (origin) {
      L.marker([origin.lat, origin.lng], { icon: userIcon(L), interactive: false, keyboard: false, zIndexOffset: 1000 })
        .addTo(group);
    }
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], SINGLE_ZOOM);
    else map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng])), { padding: [48, 48], maxZoom: 17 });
    return () => { group.remove(); };
  }, [leaflet, stops, origin, points, tour]);

  // Línea: por las calles si el servicio respondió; si no, recta y punteada
  useEffect(() => {
    if (!leaflet || (!route && !failed)) return;
    const { L, map } = leaflet;
    const group = L.layerGroup().addTo(map);
    if (route) {
      // Borde blanco debajo para que la línea se lea sobre cualquier calle
      L.polyline(route.line, { className: 'stroke-white', weight: 9, opacity: 0.9, interactive: false }).addTo(group);
      const line = L.polyline(route.line, { className: 'stroke-primary-700', weight: 5, opacity: 0.9, interactive: false })
        .addTo(group);
      map.fitBounds(line.getBounds().extend(L.latLngBounds(points.map(p => [p.lat, p.lng]))), { padding: [48, 48], maxZoom: 17 });
    } else {
      L.polyline(points.map(p => [p.lat, p.lng]), {
        className: 'stroke-gray-800', weight: 4, opacity: 0.9, dashArray: '1 10', lineCap: 'round', interactive: false,
      }).addTo(group);
    }
    return () => { group.remove(); };
  }, [leaflet, route, failed, points]);

  // ── Usar mi ubicación ──────────────────────────────────────
  function locate() {
    setLocating(true);
    setLocateError(null);
    requestPosition().then(
      position => {
        setLocating(false);
        // Pasa a ser la ubicación de toda la app: una sola, la misma de las distancias de las listas
        setLocation(gpsLocation(position));
      },
      (reason: LocationError) => {
        setLocating(false);
        setLocateError(reason);
      },
    );
  }

  const modeInfo = MODES.find(m => m.id === mode) ?? MODES[0];
  // El link usa el modo elegido; sin selector, a pie
  const mapsUrl = googleMapsUrl(stops, showModes ? mode : 'foot');

  return (
    <>
      {/* Encabezado */}
      <div className="flex shrink-0 items-start gap-3 border-b border-gray-200 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-3">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="break-words text-lg font-semibold leading-snug">
            {tour ? `Recorrido: ${stops.length} comercios` : stops[0].name}
          </h2>
          {!tour && stops[0].address && <p className="break-words text-sm text-gray-600">{stops[0].address}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar mapa"
          className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
          <X aria-hidden="true" className="size-6" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Mapa: isolate para que los z-index de Leaflet no tapen el resto del modal */}
        {!mapFailed && (
          <div className="relative isolate min-h-80 flex-1 bg-gray-100">
            <div ref={containerRef} aria-hidden={leaflet ? undefined : true} className="absolute inset-0 font-sans" />
          </div>
        )}

        <div className="shrink-0 px-4 py-3">
          {/* Leyenda de la ruta y modo */}
          {routeKey !== null && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p role="status" className="min-w-0 font-display text-lg font-semibold">
                {pending && <span className="font-sans text-base font-normal text-gray-600">Buscando la ruta…</span>}
                {route && `${formatDistance(route.distanceKm)} · ${formatDuration(route.minutes)} ${modeInfo.suffix}`}
                {failed && `${formatDistance(straightKm)} en línea recta`}
              </p>
              {showModes && (
                <div role="group" aria-label="Cómo vas" className="flex shrink-0 rounded-xl bg-gray-100 p-1">
                  {MODES.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      aria-pressed={mode === m.id}
                      className={`flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                        mode === m.id ? 'bg-white text-primary-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                      }`}>
                      <m.icon aria-hidden="true" className="size-4" />
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Paradas del recorrido, con el mismo número que su marcador */}
          {tour && (
            <ol className="mt-3 space-y-2">
              {stops.map((stop, i) => (
                <li key={`${i}-${stop.lat}-${stop.lng}`} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-700 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block break-words font-semibold">{stop.name}</span>
                    {stop.address && <span className="block break-words text-sm text-gray-600">{stop.address}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {notes.map(note => <p key={note} className="mt-2 text-sm text-gray-600">{note}</p>)}

          {/* Privacidad: es el único momento en que la ubicación sale del dispositivo */}
          {origin && routeKey !== null && (
            <p className="mt-2 text-sm text-gray-600">Para marcar la ruta, tu ubicación se envía a OpenStreetMap.</p>
          )}

          {!origin && canLocate && (
            <button type="button" onClick={locate} disabled={locating} className="btn-secondary mt-2 inline-flex w-full items-center justify-center gap-2">
              <LocateFixed aria-hidden="true" className="size-5" />
              {locating ? 'Buscando tu ubicación…' : 'Usar mi ubicación'}
            </button>
          )}
          {/* La región queda montada para que el error se anuncie */}
          <div role="alert">
            {!origin && locateError && <p className="mt-2 text-sm font-semibold text-red-700">{LOCATE_ERROR[locateError]}</p>}
          </div>
        </div>
      </div>

      {/* Acción principal, siempre a la vista */}
      <div className="shrink-0 border-t border-gray-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3">
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary flex w-full items-center justify-center gap-2">
          Abrir en Google Maps
          <ExternalLink aria-hidden="true" className="size-4" />
        </a>
      </div>
    </>
  );
}

// ── Marcadores ───────────────────────────────────────────────
// SVG propios en línea: los PNG por defecto de Leaflet no resuelven con el empaquetador.
// El nombre va con textContent (nunca como HTML): viene de datos externos.

const LABEL_CLASS = 'max-w-36 truncate rounded-full bg-white/95 px-2 text-xs font-semibold text-gray-900 shadow-sm';

/** Comercio: gota del color de marca con la punta en la coordenada; en el recorrido lleva el número de la parada */
function stopIcon(L: LeafletModule, name: string, number?: number) {
  const el = document.createElement('div');
  el.className = 'flex flex-col items-center';
  const center = number === undefined
    ? '<circle cx="14" cy="14" r="5" fill="#fff"/>'
    : `<text x="14" y="18.5" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">${number}</text>`;
  el.innerHTML = `<svg width="28" height="36" viewBox="0 0 28 36" aria-hidden="true" class="drop-shadow">`
    + `<path d="M14 35C14 35 27 22.5 27 14A13 13 0 1 0 1 14C1 22.5 14 35 14 35Z" fill="var(--color-primary-700)" stroke="#fff" stroke-width="2"/>`
    + `${center}</svg>`;
  const label = document.createElement('span');
  label.className = `${LABEL_CLASS} mt-0.5`;
  label.textContent = name;
  el.append(label);
  return L.divIcon({ html: el, className: '', iconSize: [144, 60], iconAnchor: [72, 35] });
}

/** Usuario: punto azul centrado en la coordenada */
function userIcon(L: LeafletModule) {
  const el = document.createElement('div');
  el.className = 'flex flex-col items-center';
  const dot = document.createElement('span');
  dot.className = 'block size-5 rounded-full border-[3px] border-white bg-blue-600 shadow-[0_0_0_6px_rgb(37_99_235/0.25)]';
  const label = document.createElement('span');
  label.className = `${LABEL_CLASS} mt-2`;
  label.textContent = 'Vos';
  el.append(dot, label);
  return L.divIcon({ html: el, className: '', iconSize: [64, 48], iconAnchor: [32, 10] });
}
