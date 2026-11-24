'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const NEVER = () => () => {};

/** Safari del iPhone fuera de la app instalada (`navigator.standalone` solo existe ahí) */
function inIphoneBrowser(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === false;
}

/**
 * En el iPhone, WhatsApp abre el link en Safari, que no comparte datos con la app instalada (spec 31): ofrece copiarlo
 * para pegarlo en la app
 */
export default function InstalledAppNotice() {
  const show = useSyncExternalStore(NEVER, inIphoneBrowser, () => false);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!show) return null;

  async function copy() {
    let text = 'Link copiado';
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      text = 'No se pudo copiar el link';
    }
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 3000);
  }

  return (
    <div className="card mb-6 p-4">
      <p className="text-gray-700">
        ¿Tenés la app en la pantalla de inicio? Copiá este link y pegalo en Carrito → Cargar un carrito compartido.
      </p>
      <button type="button" onClick={copy} className="btn-secondary mt-3 inline-flex w-full items-center justify-center gap-2 sm:w-auto">
        <Copy aria-hidden="true" className="size-4" /> Copiar link
      </button>

      {/* Aviso fijo abajo, como los demás. La región queda montada */}
      <div role="status" className="pointer-events-none fixed inset-x-4 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-10 flex justify-center md:bottom-28">
        {message && (
          <p className="flex max-w-sm items-start gap-2 rounded-xl bg-primary-900 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            {message === 'Link copiado' && <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-400" />}
            <span className="min-w-0 break-words">{message}</span>
          </p>
        )}
      </div>
    </div>
  );
}
