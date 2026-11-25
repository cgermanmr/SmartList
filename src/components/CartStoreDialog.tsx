'use client';

import { useEffect, useId, useRef } from 'react';
import { CartItem, StoreRef } from '@/lib/models';
import { storeKey, useStore } from '@/lib/store';
import NearbyStores from './NearbyStores';
import OtherStoreForm from './OtherStoreForm';
import { useNearbyPrices } from './useNearby';

interface Props {
  /** Ítem al que se le cambia el comercio; null con el modal cerrado */
  item: CartItem | null;
  /** Comercios ya usados en el carrito (getCartStores) */
  stores: StoreRef[];
  onClose: () => void;
}

/**
 * Modal "Cambiar comercio" de un ítem del carrito: comercios ya usados, "Sin comercio", las sucursales cercanas con
 * su precio (ítems con EAN, con ubicación) u otro comercio nuevo.
 * `<dialog>` nativo con showModal: deja inerte el resto de la página, cierra con Escape y devuelve el foco.
 * Se cierra también si la página se oculta con <Activity> (un modal oculto dejaría inerte la página nueva).
 */
export default function CartStoreDialog({ item, stores, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = item !== null;

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
      // React propaga el close del mapa que se abre encima: solo vale el propio
      onClose={e => { if (e.target === e.currentTarget) onClose(); }}
      // El contenido ocupa todo el dialog: un click con el dialog como destino cae en el fondo oscuro
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      className="w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] mx-auto mt-4 sm:mt-16 rounded-xl bg-white text-gray-900 shadow-xl backdrop:bg-black/50">
      {item && <StoreForm key={item.id} item={item} stores={stores} titleId={titleId} onClose={onClose} />}
    </dialog>
  );
}

interface FormProps {
  item: CartItem;
  stores: StoreRef[];
  titleId: string;
  onClose: () => void;
}

/** Contenido del modal: se monta al abrir, así cada apertura empieza con el formulario vacío */
function StoreForm({ item, stores, titleId, onClose }: FormProps) {
  const setCartItemStore = useStore(s => s.setCartItemStore);
  const currentKey = storeKey(item.store);
  // Sucursales cercanas que tienen el producto: solo si tiene EAN y hay ubicación
  const ean = useStore(s => s.products.find(p => p.id === item.productId)?.ean);
  const nearby = useNearbyPrices([ean]);
  const near = nearby.get(ean);

  function choose(store?: StoreRef) {
    if (storeKey(store) !== currentKey) setCartItemStore(item.id, store);
    onClose();
  }

  /** Una sucursal cercana cambia el comercio y también el precio, que es el de esa sucursal */
  function chooseNearby(store: StoreRef, price: number) {
    setCartItemStore(item.id, store, price);
    onClose();
  }

  /** También si es el comercio actual: puede traer la dirección o el punto (completa los demás ítems, spec 35) */
  function chooseOther(store: StoreRef) {
    setCartItemStore(item.id, store);
    onClose();
  }

  const options: { key: string; store?: StoreRef; label: string; detail?: string }[] = [
    ...stores.map(store => ({ key: storeKey(store), store, label: store.name, detail: store.address ?? store.barrio })),
    { key: '', label: 'Sin comercio' },
  ];

  return (
    <>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 pt-5 pb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg font-bold">Cambiar comercio</h2>
          <p className="mt-1 text-sm text-gray-600 truncate">{item.productName}</p>
        </div>
        <button type="button" onClick={onClose} className="btn-secondary shrink-0 text-sm min-h-11">Cerrar</button>
      </div>

      <div className="px-5 pt-4 pb-5">
        <ul className="rounded-lg border border-gray-200 divide-y divide-gray-200 overflow-hidden">
          {options.map(option => {
            const current = option.key === currentKey;
            return (
              <li key={option.key || 'sin-comercio'}>
                <button
                  type="button"
                  onClick={() => choose(option.store)}
                  aria-current={current ? 'true' : undefined}
                  className={`list-row min-h-12 ${current ? 'bg-primary-50' : ''}`}>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-medium ${option.store ? '' : 'text-gray-600'}`}>
                      {option.label}
                    </span>
                    {option.detail && <span className="block truncate text-sm text-gray-500">{option.detail}</span>}
                  </span>
                  {current && <span className="shrink-0 text-sm font-semibold text-primary-700">Actual</span>}
                </button>
              </li>
            );
          })}
        </ul>

        {near !== undefined && (near === 'loading' || near.length > 0) && (
          <section aria-labelledby="nearby-stores-title" className="mt-5">
            <h3 id="nearby-stores-title" className="font-semibold mb-1">Cerca tuyo</h3>
            {near === 'loading' ? (
              <p role="status" className="text-sm text-gray-600">Buscando precios…</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-gray-600">Al elegir uno, el ítem pasa a ese comercio y a su precio.</p>
                <NearbyStores
                  productName={item.productName}
                  prices={near}
                  approx={nearby.approx}
                  onChoose={chooseNearby}
                  action="Elegir"
                  currentKey={currentKey}
                />
              </>
            )}
          </section>
        )}

        <OtherStoreForm title="Otro comercio" submitLabel="Mover a este comercio" onSave={chooseOther} className="mt-5" />
      </div>
    </>
  );
}
