'use client';

import { MapPin, MapPinOff } from 'lucide-react';
import { KeyboardEvent, useId, useRef, useState } from 'react';
import { reverseAddress } from '@/lib/address';
import { LatLng } from '@/lib/geo';
import { StoreRef } from '@/lib/models';
import { useStore } from '@/lib/store';
import {
  applyReverse, chooseSuggestion, draftStore, emptyDraft, mapCenter, markPoint, PointSource, removePoint, typeAddress,
  typeBarrio,
} from '@/lib/store-draft';
import AddressField from './AddressField';
import PointMapDialog from './PointMapDialog';

const LINK_CLASS = 'inline-flex min-h-11 items-center px-1 text-sm font-semibold text-primary-700 underline underline-offset-2 hover:text-primary-800 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';

const POINT_TEXT: Record<PointSource, string> = {
  gps: 'Punto: tu ubicación',
  suggestion: 'Punto: el de la dirección',
  marked: 'Punto: marcado en el mapa',
};

interface Props {
  title: string;
  /** Con la lectura del GPS ("Otro comercio acá"), el comercio empieza con ese punto */
  gps?: LatLng;
  submitLabel: string;
  onSave: (store: StoreRef) => void;
  onCancel?: () => void;
  className?: string;
}

/**
 * "Otro comercio" de Cargar precio y del carrito: nombre (obligatorio), dirección con sugerencias, barrio y punto en el
 * mapa (spec 35). No es un <form>: en Cargar precio está adentro del formulario, así que Enter en un campo usa este
 * comercio en vez de guardar el precio
 */
export default function OtherStoreForm({ title, gps, submitLabel, onSave, onCancel, className = '' }: Props) {
  const id = useId();
  const location = useStore(s => s.location);
  const [draft, setDraft] = useState(() => emptyDraft(gps));
  const [error, setError] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const [reverse, setReverse] = useState<'idle' | 'loading' | 'failed'>('idle');
  // Escribir en Dirección o cambiar el punto descarta la respuesta que esté en camino
  const request = useRef(0);
  const mapButtonRef = useRef<HTMLButtonElement>(null);
  const completeRef = useRef<HTMLButtonElement>(null);

  const { point } = draft;

  function save() {
    if (!draft.name.trim()) {
      setError('Completá el nombre del comercio');
      document.getElementById(`${id}-name`)?.focus();
      return;
    }
    onSave(draftStore(draft));
  }

  function onEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    save();
  }

  function dropReverse() {
    request.current++;
    setReverse('idle');
  }

  // ── Punto ──────────────────────────────────────────────────

  /** Busca la dirección del punto y reemplaza la escrita. Se puede guardar sin esperar */
  function findAddress(target: LatLng) {
    const current = ++request.current;
    setReverse('loading');
    void reverseAddress(target).then(found => {
      if (current !== request.current) return;
      setReverse(found ? 'idle' : 'failed');
      if (!found) return;
      // "Completar la dirección" desaparece al llenarse: el foco no se pierde
      if (document.activeElement === completeRef.current) mapButtonRef.current?.focus();
      setDraft(d => applyReverse(d, found));
    });
  }

  /** Confirmar sin mover el mapa no envía nada, y con un punto no cambia nada */
  function confirmPoint(target: LatLng, moved: boolean) {
    setMapOpen(false);
    if (!moved && point) return;
    dropReverse();
    setDraft(d => markPoint(d, target));
    if (moved) findAddress(target);
  }

  function remove() {
    dropReverse();
    setDraft(removePoint);
    mapButtonRef.current?.focus();
  }

  return (
    <div role="group" aria-labelledby={`${id}-title`} className={className}>
      <h3 id={`${id}-title`} className="mb-3 font-semibold">{title}</h3>
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label htmlFor={`${id}-name`} className="mb-1 block text-sm text-gray-600">Nombre</label>
          <input id={`${id}-name`} type="text" value={draft.name} autoComplete="off" placeholder="Ej: Super Luna"
            onChange={e => { const name = e.target.value; setDraft(d => ({ ...d, name })); setError(''); }} onKeyDown={onEnter}
            aria-required="true"
            aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
            className="input-field" />
          {error && <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
        </div>

        <AddressField id={`${id}-address`} draft={draft} onSubmit={save}
          onType={address => { dropReverse(); setDraft(d => typeAddress(d, address)); }}
          onChoose={(suggestion, number) => { dropReverse(); setDraft(d => chooseSuggestion(d, suggestion, number)); }} />

        <div>
          <label htmlFor={`${id}-barrio`} className="mb-1 block text-sm text-gray-600">
            Barrio <span className="text-gray-500">(opcional)</span>
          </label>
          <input id={`${id}-barrio`} type="text" value={draft.barrio} autoComplete="off" placeholder="Ej: Caballito"
            onChange={e => { const barrio = e.target.value; setDraft(d => typeBarrio(d, barrio)); }} onKeyDown={onEnter}
            className="input-field" />
        </div>
      </div>

      {/* Punto en el mapa */}
      <div className="mt-3 rounded-xl bg-gray-50 px-3 pt-2 pb-1">
        <p role="status" className="flex items-center gap-2 text-sm text-gray-700">
          {point
            ? <MapPin aria-hidden="true" className="size-4 shrink-0 text-primary-700" />
            : <MapPinOff aria-hidden="true" className="size-4 shrink-0 text-gray-500" />}
          {point ? POINT_TEXT[point.source] : 'Sin punto en el mapa'}
        </p>
        <div className="flex flex-wrap items-center gap-x-4">
          <button ref={mapButtonRef} type="button" onClick={() => setMapOpen(true)} className={LINK_CLASS}>
            {point ? 'Ver o ajustar' : 'Marcar en el mapa'}
          </button>
          {point && <button type="button" onClick={remove} aria-label="Quitar el punto" className={LINK_CLASS}>Quitar</button>}
          {point?.source === 'gps' && draft.address.trim() === '' && (
            <button ref={completeRef} type="button" onClick={() => { if (reverse !== 'loading') findAddress(point); }}
              aria-disabled={reverse === 'loading'} aria-describedby={`${id}-sends`} className={LINK_CLASS}>
              Completar la dirección
            </button>
          )}
        </div>
        {point?.source === 'gps' && draft.address.trim() === '' && (
          <p id={`${id}-sends`} className="mb-1 text-xs text-gray-500">El punto se envía a OpenStreetMap</p>
        )}
        <div role="status">
          {reverse === 'loading' && <p className="mb-1 text-sm text-gray-600">Buscando la dirección…</p>}
          {reverse === 'failed' && (
            <p className="mb-1 text-sm text-gray-700">
              No encontramos la dirección de este punto. Revisá que coincida con la escrita.
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={save} className="btn-primary flex-1">{submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>}
      </div>

      <PointMapDialog open={mapOpen} center={mapCenter(draft, location)} onConfirm={confirmPoint}
        onClose={() => setMapOpen(false)} />
    </div>
  );
}
