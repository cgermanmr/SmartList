'use client';

import { useEffect, useId, useRef } from 'react';

interface Props {
  open: boolean;
  onMerge: () => void;
  onReplace: () => void;
  onCancel: () => void;
}

/**
 * Combinar o reemplazar el carrito al cargar uno compartido (spec 31). `<dialog>` nativo como ConfirmDialog: cierra
 * con Escape, devuelve el foco y se cierra al ocultarse la página con <Activity>
 */
export default function LoadDialog({ open, onMerge, onReplace, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const messageId = useId();

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
      aria-describedby={messageId}
      onClose={e => { if (!e.currentTarget.open) onCancel(); }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-0 text-gray-900 shadow-xl backdrop:bg-black/50">
      {open && (
        <div className="p-5">
          <h2 id={titleId} className="text-lg font-semibold">Tu carrito tiene productos</h2>
          <p id={messageId} className="mt-2 text-gray-700">
            Al combinar, lo que ya tenías suma la cantidad y conserva su comercio y su precio. Al reemplazar, tu carrito
            se vacía antes de cargar.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button type="button" onClick={onMerge} className="btn-primary">Combinar</button>
            <button type="button" onClick={onReplace} className="btn-secondary">Reemplazar</button>
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 rounded-xl text-sm font-medium text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
