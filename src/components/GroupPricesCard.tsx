'use client';

import { Map as MapIcon } from 'lucide-react';
import { useState } from 'react';
import { formatMoney } from '@/lib/format';
import { distanceKm, formatDistance } from '@/lib/geo';
import { GroupPrice, groupPriceNote } from '@/lib/group';
import { uniqueId } from '@/lib/ids';
import { Product, StoreRef } from '@/lib/models';
import { mapStops, MapStop } from '@/lib/route';
import { storeKey, useStore } from '@/lib/store';
import BranchMap from './BranchMap';
import { useGroupPrices } from './useGroupPrices';

const VISIBLE = 10;

function storeDetail(store: StoreRef): string {
  return store.address ? [store.address, store.barrio].filter(Boolean).join(', ') : store.barrio ?? '';
}

/**
 * Tarjeta "Precios del grupo" del detalle (spec 22): el último precio de cada integrante en cada comercio, de los
 * últimos 60 días, también fuera del radio y sin ubicación. Por precio y, a igual precio, el más nuevo; hasta 10 y
 * "Ver N más". Sin EAN, sin sesión o sin precios del grupo no se muestra
 */
export default function GroupPricesCard({ product }: { product: Product }) {
  const addToCart = useStore(s => s.addToCart);
  const location = useStore(s => s.location);
  const prices = useGroupPrices([product.ean]).get(product.ean ?? '');
  const [showAll, setShowAll] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const [mapStop, setMapStop] = useState<MapStop[] | null>(null);

  if (!product.ean || !prices || prices.length === 0) return null;

  const approx = location?.source === 'localidad';
  const visible = showAll ? prices : prices.slice(0, VISIBLE);
  const hidden = prices.length - visible.length;

  function add(price: GroupPrice) {
    addToCart({
      id: uniqueId(), productId: product.id, productName: product.name, price: price.amount, quantity: 1,
      subtotal: price.amount, store: price.store,
    });
    setAdded(price.store.name);
  }

  return (
    <section aria-labelledby="group-prices-title" className="card p-6 mb-6">
      <h2 id="group-prices-title" className="text-xl font-bold">Precios del grupo</h2>

      <ul className="mt-4 divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {visible.map(price => {
          const { lat, lng } = price.store;
          const hasCoords = lat !== undefined && lng !== undefined;
          const distance = location && hasCoords ? distanceKm(location, { lat, lng }) : undefined;
          const detail = storeDetail(price.store);
          return (
            <li key={`${price.memberId}|${storeKey(price.store)}`} className="px-3 py-3 sm:flex sm:items-center sm:gap-4">
              <div className="min-w-0 sm:flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 break-words font-semibold text-gray-900">{price.store.name}</span>
                  {distance !== undefined && (
                    <span className="shrink-0 text-sm text-gray-600">{approx ? 'aprox. ' : ''}{formatDistance(distance)}</span>
                  )}
                </div>
                {detail && <p className="text-sm text-gray-600 break-words">{detail}</p>}
                <p className="text-sm text-gray-600">{groupPriceNote(price)}</p>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 sm:mt-0 sm:shrink-0 sm:justify-end">
                <span className="font-display text-xl font-semibold tabular-nums text-gray-900">${formatMoney(price.amount)}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {hasCoords && (
                    <button
                      type="button"
                      onClick={() => setMapStop(mapStops([price.store]))}
                      aria-label={`Ver ${price.store.name} en el mapa`}
                      className="btn-secondary inline-flex min-w-11 items-center justify-center gap-1.5 px-2.5 text-sm sm:px-3">
                      <MapIcon aria-hidden="true" className="size-5" />
                      <span aria-hidden="true" className="hidden sm:inline">Mapa</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => add(price)}
                    aria-label={`Agregar ${product.name} en ${price.store.name}`}
                    className="btn-primary shrink-0 px-4 text-sm">
                    Agregar
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {hidden > 0 && (
        <button type="button" onClick={() => setShowAll(true)} className="btn-secondary mt-2 w-full text-sm">
          Ver {hidden} más
        </button>
      )}

      <p className="mt-2 text-xs text-gray-600">Precios cargados por tu grupo en los últimos 60 días.</p>

      {/* La región queda montada para que se anuncie al agregar */}
      <div role="status">
        {added && <p className="mt-3 text-sm font-semibold text-green-800">En el carrito, en {added}</p>}
      </div>

      <BranchMap stops={mapStop} onClose={() => setMapStop(null)} />
    </section>
  );
}
