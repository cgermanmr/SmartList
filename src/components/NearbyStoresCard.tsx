'use client';

import { useState } from 'react';
import { newId } from '@/lib/ids';
import { Product, StoreRef } from '@/lib/models';
import { sepaEnabled } from '@/lib/sepa';
import { mapStops, MapStop } from '@/lib/route';
import { getRecentStorePrices, useStore } from '@/lib/store';
import BranchMap from './BranchMap';
import LocationBar from './LocationBar';
import NearbyStores, { NearbyLine } from './NearbyStores';
import { useNearbyPrices } from './useNearby';

/**
 * Tarjeta "Comercios cercanos" del detalle: los comercios cerca de la ubicación que tienen el producto, con su
 * precio, más los precios cargados a mano de los últimos 60 días. Sin ubicación muestra la barra para activarla.
 * Sin EAN o sin Supabase no se muestra (ni consulta)
 */
export default function NearbyStoresCard({ product }: { product: Product }) {
  const prices = useStore(s => s.prices);
  const addToCart = useStore(s => s.addToCart);
  const nearby = useNearbyPrices([product.ean]);
  const [now] = useState(() => new Date());
  const [added, setAdded] = useState<string | null>(null);
  const [mapStop, setMapStop] = useState<MapStop[] | null>(null);

  if (!sepaEnabled || !product.ean) return null;

  const near = nearby.get(product.ean);
  const ownPrices = near === undefined ? [] : getRecentStorePrices(prices, product.id, now);

  function add(store: StoreRef, price: number) {
    addToCart({
      id: newId(), productId: product.id, productName: product.name, price, quantity: 1, subtotal: price, store,
    });
    setAdded(store.name);
  }

  return (
    <section aria-labelledby="nearby-title" className="card p-6 mb-6">
      <h2 id="nearby-title" className="text-xl font-bold">Comercios cercanos</h2>
      <LocationBar />

      {near !== undefined && (
        <div className="mt-4">
          <NearbyLine prices={near} approx={nearby.approx} />
          {Array.isArray(near) && near.length + ownPrices.length > 0 && (
            <div className="mt-3">
              <NearbyStores
                productName={product.name}
                prices={near}
                approx={nearby.approx}
                ownPrices={ownPrices}
                onChoose={add}
                onMap={store => setMapStop(mapStops([store]))}
              />
            </div>
          )}
        </div>
      )}

      {/* La región queda montada para que se anuncie al agregar */}
      <div role="status">
        {added && <p className="mt-3 text-sm font-semibold text-green-800">En el carrito, en {added}</p>}
      </div>

      <BranchMap stops={mapStop} onClose={() => setMapStop(null)} />
    </section>
  );
}
