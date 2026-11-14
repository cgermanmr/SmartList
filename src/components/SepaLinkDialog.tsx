'use client';

import { useEffect, useId, useRef, useState } from 'react';
import DuplicateProduct from '@/components/DuplicateProduct';
import SepaSearch from '@/components/SepaSearch';
import { Product } from '@/lib/models';
import { checkEan, sepaLinkChanges } from '@/lib/product-form';
import { SepaProduct } from '@/lib/sepa';
import { useStore } from '@/lib/store';

interface Props {
  product: Product;
  open: boolean;
  onClose: () => void;
}

/**
 * Modal de "Vincular con Precios Claros" (producto sin EAN) y "Cambiar vínculo" (con EAN).
 * `<dialog>` nativo con showModal: deja inerte el resto de la página, cierra con Escape y devuelve el foco.
 */
export default function SepaLinkDialog({ product, open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const relink = product.ean !== undefined;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector('input')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // El contenido ocupa todo el dialog: un click con el dialog como destino cae en el fondo oscuro
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      className="w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] mx-auto mt-4 sm:mt-16 rounded-xl bg-white text-gray-900 shadow-xl backdrop:bg-black/50 scroll-pt-28">
      {open && (
        <LinkForm
          product={product}
          title={relink ? 'Cambiar vínculo' : 'Vincular con Precios Claros'}
          hint={relink
            ? 'La marca y la presentación pasan a ser las del catálogo. El nombre y la categoría no cambian.'
            : 'Se completan la marca y la presentación que falten. El nombre y la categoría no cambian.'}
          titleId={titleId}
          onClose={onClose}
        />
      )}
    </dialog>
  );
}

interface FormProps {
  product: Product;
  title: string;
  hint: string;
  titleId: string;
  onClose: () => void;
}

/** Contenido del modal: se monta al abrir, así cada apertura empieza sin texto ni aviso */
function LinkForm({ product, title, hint, titleId, onClose }: FormProps) {
  const updateProduct = useStore(s => s.updateProduct);
  const [duplicate, setDuplicate] = useState<Product | null>(null);

  function select(sepa: SepaProduct) {
    const check = checkEan(sepa.ean, useStore.getState().products, product.id);
    if (check.status === 'duplicate') {
      setDuplicate(check.product);
      return;
    }
    updateProduct(product.id, sepaLinkChanges(product, sepa));
    onClose();
  }

  return (
    <>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 pt-5 pb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg font-bold">{title}</h2>
          <p className="mt-1 text-sm text-gray-600">{hint}</p>
        </div>
        <button type="button" onClick={onClose} className="btn-secondary shrink-0 text-sm min-h-11">Cerrar</button>
      </div>

      <div className="px-5 pt-4 pb-5">
        {duplicate && (
          <p role="alert" className="mb-4 text-sm text-red-700">
            <DuplicateProduct product={duplicate} onNavigate={onClose} />
          </p>
        )}
        <SepaSearch onSelect={select} />
      </div>
    </>
  );
}
