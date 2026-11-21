'use client';

import { useEffect, useId, useRef } from 'react';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** Acción destructiva: el botón de confirmar va en rojo */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmación en un `<dialog>` nativo (en lugar de confirm()): cierra con Escape y devuelve el foco. El cierre va
 * en la limpieza del efecto: también corre al ocultarse la página con <Activity>.
 */
export default function ConfirmDialog({ open, title, message, confirmLabel, danger = false, busy = false, onConfirm, onCancel }: Props) {
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
      onClick={e => { if (e.target === e.currentTarget && !busy) onCancel(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-0 text-gray-900 shadow-xl backdrop:bg-black/50">
      {open && (
        <div className="p-5">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <p id={messageId} className="mt-2 text-gray-700">{message}</p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary">Cancelar</button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              aria-busy={busy || undefined}
              className={danger
                ? 'inline-flex min-h-11 items-center justify-center rounded-xl bg-red-700 px-4 font-semibold text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-60'
                : 'btn-primary'}>
              {confirmLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
