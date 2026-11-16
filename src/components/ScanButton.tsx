'use client';

import { ScanBarcode } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import BarcodeScanner from '@/components/BarcodeScanner';
import { cameraAvailable } from '@/lib/barcode';

interface Props {
  onDetected: (gtin13: string) => void;
}

const noSubscribe = () => () => {};

/**
 * Botón que abre el lector de códigos de barras. Solo se muestra si el navegador puede pedir la cámara
 * (en el servidor no se muestra; en el cliente se decide al hidratar).
 */
export default function ScanButton({ onDetected }: Props) {
  const available = useSyncExternalStore(noSubscribe, cameraAvailable, () => false);
  const [open, setOpen] = useState(false);

  if (!available) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Leer código de barras"
        title="Leer código de barras"
        className="flex min-h-11 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-300 bg-white text-primary-700 hover:border-primary-500 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-200 focus-visible:border-primary-500 transition-colors">
        <ScanBarcode aria-hidden="true" className="size-6" />
      </button>
      <BarcodeScanner
        open={open}
        onDetected={gtin => {
          setOpen(false);
          onDetected(gtin);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
