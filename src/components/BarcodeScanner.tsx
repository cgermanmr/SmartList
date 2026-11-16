'use client';

import { X } from 'lucide-react';
import { FormEvent, useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { BarcodeDetectorLike, cameraAvailable, createConfirmer, createDetector } from '@/lib/barcode';
import { toGtin13 } from '@/lib/gtin';

interface BarcodeScannerProps {
  open: boolean;
  onDetected: (gtin13: string) => void;   // ya validado y normalizado con toGtin13
  onClose: () => void;
}

type Status = 'starting' | 'scanning' | 'denied' | 'no-camera' | 'failed';

const MESSAGES: Record<Status, string> = {
  starting: 'Preparando el lector…',
  scanning: 'Apuntá al código de barras',
  denied: 'Sin permiso para usar la cámara. Podés habilitarlo en la configuración del navegador o escribir el código.',
  'no-camera': 'Este dispositivo no tiene cámara disponible.',
  failed: 'No se pudo iniciar el lector.',
};

const noSubscribe = () => () => {};

/** Un cuadro cada ~150 ms: alcanza para leer en menos de un segundo sin recalentar el celular */
const FRAME_INTERVAL_MS = 150;

/**
 * Lector de códigos de barras con la cámara, en un `<dialog>` nativo a pantalla completa.
 * Siempre ofrece escribir el código. Al detectar uno válido (2 lecturas iguales) apaga la cámara y llama a
 * onDetected: quien lo usa cierra el lector ahí (open = false). Al cerrarse el dialog llega también onClose.
 * Se renderiza en document.body: el botón que lo abre suele estar dentro de un <form> y no puede anidarse otro.
 */
export default function BarcodeScanner({ open, onDetected, onClose }: BarcodeScannerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const isClient = useSyncExternalStore(noSubscribe, () => true, () => false);

  // El cierre va en la limpieza del efecto: también corre al ocultarse la página con <Activity>, así un
  // dialog modal escondido no deja inerte la página a la que se navegó.
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => dialog.close();
  }, [open]);

  if (!isClient) return null;

  return createPortal(
    <dialog
      ref={ref}
      aria-label="Lector de código de barras"
      onClose={onClose}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-hidden border-0 bg-black p-0 text-white backdrop:bg-black">
      {open && <ScannerView onDetected={onDetected} onClose={onClose} />}
    </dialog>,
    document.body,
  );
}

// ── Vista del lector ─────────────────────────────────────────────

/** Se monta al abrir: la vida de la cámara es la de este componente */
function ScannerView({ onDetected, onClose }: Omit<BarcodeScannerProps, 'open'>) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Sin getUserMedia (navegador viejo o sin HTTPS) no hay nada que intentar
  const [status, setStatus] = useState<Status>(() => cameraAvailable() ? 'starting' : 'no-camera');
  const [manual, setManual] = useState(false);
  const detected = useEffectEvent((gtin: string) => onDetected(gtin));

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cameraAvailable()) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let frame = 0;

    const stopCamera = () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach(track => track.stop());
      stream = null;
      video.srcObject = null;
    };

    async function start(video: HTMLVideoElement) {
      // El detector (y el .wasm, si hace falta) se prepara mientras se pide permiso para la cámara
      const detectorPromise = createDetector();
      detectorPromise.catch(() => {});

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch (error) {
        if (stopped) return;
        const name = error instanceof DOMException ? error.name : '';
        setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'no-camera');
        return;
      }
      if (stopped) {
        stopCamera();
        return;
      }
      video.srcObject = stream;
      video.play().catch(() => {});

      let detector: BarcodeDetectorLike;
      try {
        detector = await detectorPromise;
      } catch {
        if (stopped) return;
        stopCamera();
        setStatus('failed');
        return;
      }
      if (stopped) return;
      setStatus('scanning');

      const confirm = createConfirmer();
      let busy = false;
      let last = 0;
      const tick = (time: number) => {
        if (stopped) return;
        frame = requestAnimationFrame(tick);
        // Nunca dos análisis a la vez; el video necesita al menos un cuadro cargado
        if (busy || time - last < FRAME_INTERVAL_MS || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
        busy = true;
        last = time;
        detector.detect(video)
          .then(codes => {
            if (stopped || codes.length === 0) return;
            const gtin = confirm(codes[0].rawValue);
            if (gtin === null) return;
            stopCamera();
            navigator.vibrate?.(80);
            detected(gtin);
          })
          .catch(() => {})
          .finally(() => { busy = false; });
      };
      frame = requestAnimationFrame(tick);
    }

    start(video);
    return stopCamera;
  }, []);

  const error = status === 'denied' || status === 'no-camera' || status === 'failed';
  const showForm = manual || error;

  return (
    <div className="relative flex h-full w-full flex-col">
      <video
        ref={videoRef}
        aria-hidden="true"
        autoPlay
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Recuadro guía: oscurece el resto de la imagen con una sombra enorme */}
      {status === 'scanning' && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
          <div className="relative aspect-[5/2] w-full max-w-sm rounded-2xl border-2 border-white/90 shadow-[0_0_0_100vmax_rgb(0_0_0/0.55)]">
            <div className="absolute inset-x-4 top-1/2 h-0.5 rounded-full bg-primary-400 shadow-[0_0_12px_2px_var(--color-primary-400)] motion-safe:animate-scan" />
          </div>
        </div>
      )}

      <div className="relative flex justify-end px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar lector"
          className="flex size-11 items-center justify-center rounded-full bg-black/60 text-xl leading-none text-white hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          <X aria-hidden="true" className="size-6" />
        </button>
      </div>

      <div className="relative mt-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p
          role="status"
          className={`mx-auto max-w-sm text-center text-base font-medium [text-shadow:0_1px_3px_rgb(0_0_0/0.8)] ${error ? 'mb-4' : 'mb-3'}`}>
          {MESSAGES[status]}
        </p>

        {showForm ? (
          <ManualEntry
            onSubmit={onDetected}
            onCancel={error ? undefined : () => setManual(false)}
          />
        ) : (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setManual(true)}
              className="min-h-11 rounded-lg px-4 font-semibold text-white underline underline-offset-4 hover:text-primary-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Escribir el código
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Ingreso manual ─────────────────────────────────────────────

interface ManualEntryProps {
  onSubmit: (gtin13: string) => void;
  /** Volver a la cámara; sin él (la cámara no anda) no se ofrece */
  onCancel?: () => void;
}

function ManualEntry({ onSubmit, onCancel }: ManualEntryProps) {
  const inputId = useId();
  const errorId = useId();
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    // Los eventos de React atraviesan el portal: sin esto el envío llega también al <form> de la página
    e.stopPropagation();
    const gtin = toGtin13(code.replace(/\s/g, ''));
    if (gtin === null) {
      setInvalid(true);
      return;
    }
    onSubmit(gtin);
  }

  return (
    <form onSubmit={submit} noValidate className="mx-auto w-full max-w-sm rounded-2xl bg-white p-4 text-gray-900 shadow-xl">
      <label htmlFor={inputId} className="mb-1 block text-sm font-semibold text-gray-700">Código de barras</label>
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="done"
        autoFocus
        value={code}
        onChange={e => { setCode(e.target.value); setInvalid(false); }}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        className="input-field"
        placeholder="7790000000000"
      />
      {invalid && <p id={errorId} className="mt-1 text-sm text-red-700">Código de barras inválido</p>}
      <div className="mt-3 flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary min-h-11 flex-1">Usar la cámara</button>
        )}
        <button type="submit" className="btn-primary min-h-11 flex-1">Usar código</button>
      </div>
    </form>
  );
}
