'use client';

import { LocateFixed, MapPin } from 'lucide-react';
import { useId, useMemo, useState, useSyncExternalStore } from 'react';
import {
  geolocationAvailable, gpsLocation, LOCATION_ERROR_MESSAGE, LocationError, nextRadius, RADIUS_OPTIONS, RadiusKm,
  requestPosition,
} from '@/lib/location';
import { branchLocalities, MAX_NEAR_BRANCHES, sepaEnabled, SepaLocality } from '@/lib/sepa';
import { useStore } from '@/lib/store';
import { useNearBranches, useSepaBranches } from './useNearby';

const noSubscribe = () => () => {};
/** Lugares que se muestran a la vez al elegir la localidad */
const MAX_PLACES = 8;

const LINK_CLASS = 'inline-flex min-h-11 items-center px-1 text-sm font-semibold text-primary-700 underline underline-offset-2 hover:text-primary-800';

function foldText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();
}

function storeCount(count: number): string {
  if (count >= MAX_NEAR_BRANCHES) return `Los ${MAX_NEAR_BRANCHES} comercios más cercanos`;
  return count === 1 ? '1 comercio cerca' : `${count} comercios cerca`;
}

/**
 * Barra de ubicación: "Usar mi ubicación" (el permiso se pide recién al tocarlo) o elegir la localidad a mano; con
 * ubicación, el radio y "Cambiar" / "Quitar". La ubicación se guarda en el dispositivo y nunca se manda a un
 * servidor. Sin Supabase no se muestra.
 */
export default function LocationBar() {
  const location = useStore(s => s.location);
  const radiusKm = useStore(s => s.radiusKm);
  const setLocation = useStore(s => s.setLocation);
  const setRadius = useStore(s => s.setRadius);
  const canLocate = useSyncExternalStore(noSubscribe, geolocationAvailable, () => false);
  const near = useNearBranches();
  const radiusId = useId();

  /** Con ubicación, "Cambiar" vuelve a mostrar las opciones */
  const [changing, setChanging] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<LocationError | null>(null);

  if (!sepaEnabled) return null;

  function done() {
    setChanging(false);
    setPickerOpen(false);
    setError(null);
  }

  function locate() {
    setLocating(true);
    setError(null);
    requestPosition().then(
      position => {
        setLocating(false);
        setLocation(gpsLocation(position));
        done();
      },
      (reason: LocationError) => {
        setLocating(false);
        setError(reason);
        setPickerOpen(true);
      },
    );
  }

  if (location && !changing) {
    const wider = nextRadius(radiusKm);
    return (
      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-gray-900">
            <MapPin aria-hidden="true" className="size-4 shrink-0 text-primary-700" />
            <span className="truncate">{location.label}</span>
          </p>
          <label htmlFor={radiusId} className="sr-only">Radio de búsqueda</label>
          <select
            id={radiusId}
            value={radiusKm}
            onChange={e => setRadius(Number(e.target.value) as RadiusKm)}
            className="min-h-11 rounded-xl border border-gray-300 bg-white px-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200">
            {RADIUS_OPTIONS.map(km => <option key={km} value={km}>{km} km</option>)}
          </select>
          <span className="flex gap-2">
            <button type="button" onClick={() => setChanging(true)} className={LINK_CLASS}>Cambiar</button>
            <button type="button" onClick={() => setLocation(null)} className={LINK_CLASS}>Quitar</button>
          </span>
        </div>

        {/* La región queda montada para que se anuncie el cambio al mover el radio */}
        <div role="status">
          {near.status === 'ready' && near.branches.length > 0 && (
            <p className="text-sm text-gray-600">{storeCount(near.branches.length)}</p>
          )}
          {near.status === 'ready' && near.branches.length === 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-amber-50 px-3 py-2">
              <p className="min-w-0 flex-1 text-sm text-amber-900">
                No hay comercios de Precios Claros a menos de {radiusKm} km
              </p>
              {wider !== null && (
                <button type="button" onClick={() => setRadius(wider)} className="btn-secondary px-3 text-sm">
                  Buscar a {wider} km
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Sin geolocalización (o sin HTTPS) solo queda elegir la localidad
  const showPicker = pickerOpen || !canLocate;

  return (
    <div className="mt-3">
      {!location && <p className="text-sm text-gray-600">Activá tu ubicación para ver comercios cercanos</p>}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {canLocate && (
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            aria-busy={locating || undefined}
            className="btn-secondary inline-flex items-center gap-2 disabled:cursor-wait">
            <LocateFixed aria-hidden="true" className="size-5" />
            {locating ? 'Buscando tu ubicación…' : 'Usar mi ubicación'}
          </button>
        )}
        {canLocate && !pickerOpen && (
          <button type="button" onClick={() => setPickerOpen(true)} className={LINK_CLASS}>Elegir localidad</button>
        )}
        {changing && <button type="button" onClick={done} className={LINK_CLASS}>Cancelar</button>}
      </div>

      {error && <p role="alert" className="mt-2 text-sm text-red-700">{LOCATION_ERROR_MESSAGE[error]}</p>}

      {showPicker && (
        <LocalityPicker
          autoFocus={pickerOpen}
          onChoose={place => {
            setLocation({ lat: place.lat, lng: place.lng, source: 'localidad', label: place.label });
            done();
          }}
        />
      )}
    </div>
  );
}

// ── Elegir la localidad a mano ───────────────────────────────

/** Buscador de barrios y localidades con sucursales; el punto elegido es el centro de sus sucursales */
function LocalityPicker({ onChoose, autoFocus }: { onChoose: (place: SepaLocality) => void; autoFocus: boolean }) {
  const { status, branches } = useSepaBranches(true);
  const [text, setText] = useState('');
  const inputId = useId();
  const places = useMemo(() => branchLocalities(branches), [branches]);

  const query = foldText(text);
  const matches = query.length < 2 ? [] : places.filter(place => foldText(place.label).includes(query));
  // Primero los que empiezan con lo escrito ("pal" → Palermo antes que El Palomar) y, entre ellos, los que tienen
  // más comercios ("Caballito, CABA" antes que un Caballito mal cargado en otra provincia)
  const byBranches = [...matches].sort((x, y) => y.branches - x.branches);
  const shown = [
    ...byBranches.filter(place => foldText(place.label).startsWith(query)),
    ...byBranches.filter(place => !foldText(place.label).startsWith(query)),
  ].slice(0, MAX_PLACES);

  return (
    <div className="mt-2 max-w-md">
      <label htmlFor={inputId} className="mb-1 block text-sm text-gray-600">Barrio o localidad</label>
      <input
        id={inputId}
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Ej: Caballito"
        autoComplete="off"
        // Se abre al tocar "Elegir localidad": el foco pasa al campo para escribir enseguida
        autoFocus={autoFocus}
        className="input-field"
      />
      <div role="status">
        {status === 'loading' && <p className="mt-2 text-sm text-gray-600">Cargando localidades…</p>}
        {status === 'ready' && query.length >= 2 && matches.length === 0 && (
          <p className="mt-2 text-sm text-gray-600">No hay comercios de Precios Claros en ese lugar</p>
        )}
      </div>
      {status === 'error' && (
        <p role="alert" className="mt-2 text-sm text-red-700">No se pudieron cargar las localidades</p>
      )}
      {shown.length > 0 && (
        <ul className="mt-2 divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {shown.map(place => (
            <li key={place.label}>
              <button type="button" onClick={() => onChoose(place)} className="list-row min-h-11 py-2">
                <span className="min-w-0 flex-1 break-words font-medium">{place.label}</span>
                <span className="shrink-0 text-sm text-gray-600">
                  {place.branches === 1 ? '1 comercio' : `${place.branches} comercios`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
