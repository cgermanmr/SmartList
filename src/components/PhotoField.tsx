'use client';

import { Camera, ImageOff } from 'lucide-react';
import { ChangeEvent, useId, useRef, useState } from 'react';
import { compressPhoto, PhotoDraft } from '@/lib/photo';
import ProductImage from './ProductImage';

// ── Foto propia de un producto (spec 27) ────────────────────

export const PHOTO_READ_ERROR = 'No se pudo leer la imagen. Probá con otra.';

/**
 * Selector de foto: un `<input type="file" accept="image/*">` oculto (sin `capture`: el sistema ofrece cámara o
 * galería) que abre el botón, y la compresión. `onPicked` recibe el JPEG listo; con error queda lo anterior.
 */
export function usePhotoPicker(onPicked: (blob: Blob) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';   // elegir el mismo archivo otra vez también avisa
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onPicked(await compressPhoto(file));
    } catch {
      setError(PHOTO_READ_ERROR);
    } finally {
      setBusy(false);
    }
  }

  const input = (
    <input ref={inputRef} type="file" accept="image/*" hidden tabIndex={-1} aria-hidden="true"
      onChange={e => void handleChange(e)} />
  );

  return {
    open: () => inputRef.current?.click(),
    busy,
    error,
    clearError: () => setError(null),
    input,
  };
}

/** "Preparando la foto…" y el error, junto al campo */
export function PhotoStatus({ busy, error }: { busy: boolean; error: string | null }) {
  return (
    <>
      <div role="status">{busy && <p className="mt-2 text-sm text-gray-600">Preparando la foto…</p>}</div>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </>
  );
}

const ACTION_CLASS = 'inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-primary-700 hover:bg-primary-50 active:bg-primary-100 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';

interface PhotoFieldProps {
  /** Foto elegida (en memoria hasta guardar) o null */
  value: PhotoDraft | null;
  onChange: (value: PhotoDraft | null) => void;
  /** Nombre del producto: la inicial del cuadro mientras carga la vista previa */
  productName: string;
  /** Clase del título, para que se vea como los demás campos del formulario */
  labelClassName?: string;
}

/**
 * Campo "Foto (opcional)" de los formularios de producto nuevo (Cargar precio B y C, Agregar producto). La foto vive
 * en memoria: nada se escribe en IndexedDB hasta guardar el producto.
 */
export default function PhotoField({ value, onChange, productName, labelClassName }: PhotoFieldProps) {
  const titleId = useId();
  const picker = usePhotoPicker(blob => {
    if (value) URL.revokeObjectURL(value.url);
    onChange({ blob, url: URL.createObjectURL(blob) });
  });

  function remove() {
    if (value) URL.revokeObjectURL(value.url);
    picker.clearError();
    onChange(null);
  }

  return (
    <div role="group" aria-labelledby={titleId}>
      <p id={titleId} className={labelClassName ?? 'mb-1 block text-sm text-gray-600'}>
        Foto {labelClassName ? '(opcional)' : <span className="text-gray-500">(opcional)</span>}
      </p>
      {picker.input}
      {value ? (
        <div className="flex items-center gap-3">
          <ProductImage src={value.url} name={productName || 'Foto'} size={64} />
          <div className="min-w-0 flex-1">
            <div className="-ml-3 flex flex-wrap">
              <button type="button" onClick={picker.open} disabled={picker.busy} aria-label="Cambiar la foto"
                className={ACTION_CLASS}>
                <Camera aria-hidden="true" className="size-4" />
                Cambiar
              </button>
              <button type="button" onClick={remove} disabled={picker.busy} aria-label="Quitar la foto"
                className={ACTION_CLASS}>
                <ImageOff aria-hidden="true" className="size-4" />
                Quitar
              </button>
            </div>
            <p className="text-sm text-gray-600">Solo la ves vos.</p>
          </div>
        </div>
      ) : (
        <button type="button" onClick={picker.open} disabled={picker.busy}
          className="btn-secondary inline-flex items-center gap-2">
          <Camera aria-hidden="true" className="size-5" />
          Agregar foto
        </button>
      )}
      <PhotoStatus busy={picker.busy} error={picker.error} />
    </div>
  );
}
