'use client';

import { KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { AddressSuggestion, suggestionDetail } from '@/lib/address';
import { useStore } from '@/lib/store';
import { addressSearch, draftOrigin, missingNumber, StoreDraft, typedNumber } from '@/lib/store-draft';
import { useAddressSearch } from './useAddressSearch';

interface Props {
  id: string;
  draft: StoreDraft;
  onType: (address: string) => void;
  /** `typedNumber`: la altura escrita que no existe, al elegir una calle en su lugar */
  onChoose: (suggestion: AddressSuggestion, typedNumber?: string) => void;
  /** Enter sin ninguna sugerencia resaltada */
  onSubmit: () => void;
}

/**
 * Campo Dirección con sugerencias de Georef (spec 35), como combobox: flechas para recorrer, Enter elige la resaltada
 * y Escape cierra solo la lista. La lista va en el flujo, no flotante: así no la cortan el teclado del celular ni el
 * modal del carrito
 */
export default function AddressField({ id, draft, onType, onChoose, onSubmit }: Props) {
  const listId = useId();
  const noteId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const location = useStore(s => s.location);
  const origin = draftOrigin(draft, location);
  const { status, suggestions, unknownNumber } = useAddressSearch(addressSearch(draft), origin.point);

  // Lo escrito cuando se cerró la lista con Escape: escribir otra cosa la vuelve a abrir
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const open = suggestions.length > 0 && dismissed !== draft.address;
  const activeIndex = open && active < suggestions.length ? active : -1;

  useEffect(() => {
    if (activeIndex >= 0) listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function choose(suggestion: AddressSuggestion) {
    onChoose(suggestion, unknownNumber ? typedNumber(draft) : undefined);
    setActive(-1);
    // El cursor al final: después de una calle se escribe la altura
    const input = inputRef.current;
    input?.focus();
    requestAnimationFrame(() => input?.setSelectionRange(input.value.length, input.value.length));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0) choose(suggestions[activeIndex]);
      else onSubmit();
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      // Al pasar la primera o la última, ninguna resaltada
      setActive(next(activeIndex, step, suggestions.length));
    } else if (e.key === 'Escape') {
      // Cancelado, no llega a cerrar el modal que está debajo
      e.preventDefault();
      e.stopPropagation();
      setDismissed(draft.address);
      setActive(-1);
    }
  }

  const note = noteText(draft, status, suggestions.length, unknownNumber);

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-gray-600">
        Dirección <span className="text-gray-500">(opcional)</span>
      </label>
      <input ref={inputRef} id={id} type="text" value={draft.address} autoComplete="off"
        placeholder="Ej: Av. Rivadavia 5000"
        role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-describedby={note ? noteId : undefined}
        onChange={e => { onType(e.target.value); setActive(-1); setDismissed(null); }}
        onKeyDown={onKeyDown} className="input-field" />

      {/* La región queda montada para que cada estado se anuncie */}
      <div role="status">
        {note && <p id={noteId} className="mt-1 text-sm text-gray-600">{note}</p>}
        {open && (
          <p className="sr-only">
            {suggestions.length === 1 ? '1 dirección' : `${suggestions.length} direcciones`}. Recorrelas con las flechas.
          </p>
        )}
      </div>

      {open && (
        <>
          <ul ref={listRef} id={listId} role="listbox" aria-label="Direcciones"
            className="mt-2 overflow-hidden rounded-xl border border-gray-200 divide-y divide-gray-200">
            {suggestions.map((suggestion, i) => (
              <li key={`${suggestion.street}|${suggestion.number ?? ''}|${suggestion.place}|${i}`}
                id={`${listId}-${i}`} role="option" aria-selected={i === activeIndex}
                // El foco queda en el campo: no se cierra el teclado del celular
                onMouseDown={e => e.preventDefault()}
                onClick={() => choose(suggestion)}
                className={`list-row min-h-12 cursor-pointer ${i === activeIndex ? 'bg-primary-100' : ''}`}>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold break-words">
                    {suggestion.street}{suggestion.number && ` ${suggestion.number}`}
                  </span>
                  <span className="block text-sm text-gray-600 break-words">{suggestionDetail(suggestion, origin.approx)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-gray-500">Direcciones: Georef — datos.gob.ar</p>
        </>
      )}
    </div>
  );
}

/** Siguiente resaltada: -1 es ninguna, antes de la primera y después de la última */
function next(current: number, step: number, count: number): number {
  const index = current + step;
  if (index >= count) return -1;
  return index < -1 ? count - 1 : index;
}

function noteText(draft: StoreDraft, status: string, count: number, unknownNumber: boolean): string | null {
  if (missingNumber(draft)) return 'Agregá la altura';
  if (status === 'loading') return 'Buscando direcciones…';
  if (status === 'failed') return 'No se pudo validar la dirección. Podés guardarla igual.';
  if (status !== 'done') return null;
  if (count === 0) return 'No encontramos esa dirección. Podés marcarla en el mapa.';
  return unknownNumber ? 'No encontramos esa altura. Elegí la calle y marcá el punto en el mapa.' : null;
}
