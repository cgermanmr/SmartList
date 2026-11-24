'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { findSharedPayload } from '@/lib/shared-cart';

/**
 * "Cargar un carrito compartido" (spec 31): link que abre un `<dialog>` para pegar el mensaje o el link de WhatsApp y
 * lleva a la vista previa. Cierra con Escape, devuelve el foco y se cierra al ocultarse la página con <Activity>
 */
export default function PasteCartDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => dialog.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-xl px-1 font-medium text-primary-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
        Cargar un carrito compartido
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={e => { if (!e.currentTarget.open) setOpen(false); }}
        onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        className="mx-auto mt-4 w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] rounded-2xl bg-white p-0 text-left text-gray-900 shadow-xl backdrop:bg-black/50 sm:mt-16">
        {open && <PasteForm titleId={titleId} onClose={() => setOpen(false)} />}
      </dialog>
    </>
  );
}

/** Contenido del modal: se monta al abrir, así cada apertura empieza con el campo vacío */
function PasteForm({ titleId, onClose }: { titleId: string; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const errorId = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload = findSharedPayload(text);
    if (!payload) {
      setError('No hay un carrito compartido en ese texto');
      inputRef.current?.focus();
      return;
    }
    onClose();
    router.push(`/cart/compartido#${payload}`);
  }

  return (
    <form onSubmit={submit} noValidate className="p-5">
      <h2 id={titleId} className="text-lg font-semibold">Cargar un carrito compartido</h2>
      <label htmlFor={inputId} className="mt-3 mb-1 block text-sm text-gray-600">Pegá el mensaje o el link</label>
      <textarea
        id={inputId}
        ref={inputRef}
        value={text}
        onChange={e => { setText(e.target.value); setError(''); }}
        rows={5}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="input-field resize-y wrap-anywhere"
      />
      {error && <p id={errorId} role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
        <button type="submit" className="btn-primary">Ver carrito</button>
      </div>
    </form>
  );
}
