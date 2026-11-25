'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAuth } from '@/components/useAuth';
import { forgetPhotoUrl } from '@/components/useProductPhotos';
import { Product } from '@/lib/models';
import { discardPhoto } from '@/lib/photo-sync';
import { deleteBlockedReason, deleteMessage } from '@/lib/product-delete';
import { sepaEnabled } from '@/lib/sepa';
import { getPricesForProduct, purchasesWithProduct, useStore } from '@/lib/store';

interface Props {
  product: Product;
  /** Se está preparando o guardando una foto */
  busy: boolean;
  /** Se va a eliminar (o no se pudo): el detalle no tiene que mostrar "Producto no encontrado" mientras se sale */
  onLeaving: (leaving: boolean) => void;
}

/** "Eliminar producto", al pie del detalle (spec 33): con código de barras o con compras, deshabilitado con el motivo */
export default function DeleteProduct({ product, busy, onLeaving }: Props) {
  const router = useRouter();
  const auth = useAuth();
  const prices = useStore(s => s.prices);
  const cart = useStore(s => s.cart);
  const purchases = useStore(s => s.purchases);
  const deleteProduct = useStore(s => s.deleteProduct);
  const setFlash = useStore(s => s.setFlash);
  const [open, setOpen] = useState(false);
  const reasonId = useId();

  const reason = deleteBlockedReason({
    purchases: purchasesWithProduct(purchases, product.id),
    ean: product.ean !== undefined,
    canUnlink: sepaEnabled,
  });
  const disabled = reason !== null || busy;

  function remove() {
    setOpen(false);
    onLeaving(true);
    // Mientras el diálogo estaba abierto pudo llegar una compra por la sincronización
    if (!deleteProduct(product.id)) {
      onLeaving(false);
      return;
    }
    setFlash(`${product.name} eliminado`);
    router.replace('/');
    // La foto, después: si falla, el producto queda eliminado igual
    if (product.photo) {
      forgetPhotoUrl(product.photo.id);
      void discardPhoto(product.photo.id).catch(() => undefined);
    }
  }

  return (
    <div className="mt-10 border-t border-gray-200 pt-6">
      {/* aria-disabled y no disabled: con el teclado se llega al botón y se lee el motivo */}
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(true); }}
        aria-disabled={disabled || undefined}
        aria-describedby={reason ? reasonId : undefined}
        className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border bg-white px-4 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:w-auto ${
          disabled
            ? 'cursor-not-allowed border-gray-200 text-gray-500 focus-visible:ring-gray-500'
            : 'border-red-200 text-red-700 hover:bg-red-50 active:bg-red-100 focus-visible:ring-red-500'}`}>
        <Trash2 aria-hidden="true" className="size-5" />
        Eliminar producto
      </button>
      {reason && <p id={reasonId} className="mt-2 text-sm text-gray-500">{reason}</p>}

      <ConfirmDialog
        open={open}
        title={`¿Eliminar ${product.name}?`}
        message={deleteMessage({
          prices: getPricesForProduct(prices, product.id).length,
          photo: product.photo !== undefined,
          inCart: cart.some(i => i.productId === product.id),
          signedIn: auth.status === 'in',
        })}
        confirmLabel="Eliminar"
        danger
        onConfirm={remove}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}
