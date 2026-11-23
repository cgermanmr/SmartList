'use client';

import { ArrowDown, ArrowUp, Equal, Tag } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { AddToCartButton, EditLink } from '@/components/CatalogActions';
import NearbyStores, { NearbyLine } from '@/components/NearbyStores';
import ProductImage from '@/components/ProductImage';
import SepaPriceTable, { Chevron, ReferenceLine } from '@/components/SepaPriceTable';
import { useGroupPrices } from '@/components/useGroupPrices';
import { useNearbyPrices } from '@/components/useNearby';
import { useProductPhotos } from '@/components/useProductPhotos';
import { useSepaImages } from '@/components/useSepaImages';
import { useSepaReferenceLookup } from '@/components/useSepaReferences';
import { formatDayMonth, formatMoney } from '@/lib/format';
import { groupPricesNear } from '@/lib/group';
import { uniqueId } from '@/lib/ids';
import { Product, StoreRef } from '@/lib/models';
import { productImageSrc } from '@/lib/photo';
import { SepaProduct, sepaEnabled } from '@/lib/sepa';
import { shelfComparison, ShelfTone } from '@/lib/shelf-price';
import { getPricesForProduct, getRecentStorePrices, initialCartPrice, useStore } from '@/lib/store';

// ── Oferta para un código leído en Buscar ─────────────────────────────

/** Código leído con la cámara: propio, del catálogo o sin datos */
export type ScanResult =
  | { ean: string; status: 'loading' | 'missing' | 'error' }
  | { ean: string; status: 'found'; product: SepaProduct }
  | { ean: string; status: 'own'; product: Product };

/** Comercios abiertos antes de "Ver N más": la respuesta a "¿hay más barato cerca?" sin tocar nada */
const OPEN_STORES = 3;

/** Color e ícono de cada línea de "¿Cuánto sale acá?": la flecha es hacia dónde está el precio de la góndola */
const TONES: Record<ShelfTone, { className: string; Icon: typeof Equal }> = {
  good: { className: 'text-green-700', Icon: ArrowDown },
  same: { className: 'text-blue-700', Icon: Equal },
  bad: { className: 'text-red-700', Icon: ArrowUp },
};

interface Props {
  scan: ScanResult;
  /** Se agregó el producto al carrito (con su nombre propio): la página cierra la oferta y muestra el aviso */
  onAdded: (name: string) => void;
  /** Ver un comercio en el mapa (el BranchMap de la página) */
  onMap: (store: StoreRef) => void;
}

export default function ScanOffer({ scan, onAdded, onMap }: Props) {
  const prices = useStore(s => s.prices);
  const location = useStore(s => s.location);
  const addToCart = useStore(s => s.addToCart);
  const addSepaToCart = useStore(s => s.addSepaToCart);
  const known = scan.status === 'found' || scan.status === 'own';
  const eans = known ? [scan.ean] : [];
  const lookup = useSepaReferenceLookup(eans);
  const summary = lookup.references.get(scan.ean);
  const images = useSepaImages(eans);
  // La foto propia va antes que la del catálogo (spec 27)
  const photoUrl = useProductPhotos(scan.status === 'own' ? [scan.product] : []);
  // Un useNearbyPrices propio: la oferta no depende de la búsqueda de texto; la caché evita pedir dos veces
  const nearby = useNearbyPrices(eans);
  // Precios del grupo (spec 22): solo los de dentro del radio, así que solo con ubicación
  const groupPrices = useGroupPrices(location ? eans : []).get(scan.ean);
  const [now] = useState(() => new Date());
  const [pricesOpen, setPricesOpen] = useState(false);
  // Precio de la góndola: no se guarda; la oferta se vuelve a montar con cada código (key={scan.ean})
  const [shelf, setShelf] = useState('');
  const shelfId = useId();
  const panelId = `cadenas-lector-${scan.ean}`;

  if (scan.status === 'loading') {
    return <p role="status" className="mt-3 text-sm text-gray-600">Buscando el código {scan.ean}…</p>;
  }

  const own = scan.status === 'own' ? scan.product : null;
  const name = scan.status === 'own' ? scan.product.name : scan.status === 'found' ? scan.product.description : '';
  // Último precio propio (el historial viene del más reciente al más viejo)
  const last = own ? getPricesForProduct(prices, own.id)[0] : undefined;

  const shelfPrice = Number(shelf);
  const hasShelfPrice = shelf.trim() !== '' && Number.isFinite(shelfPrice) && shelfPrice > 0;

  // ── Agregar al carrito ─────────────────────────────────────
  // Con el precio de la góndola escrito, entra en "Sin comercio" a ese precio (no se sabe en qué comercio está)
  const shelfAt = hasShelfPrice ? { price: shelfPrice } : undefined;
  // Cargar precio acá (spec 26): la pestaña Cargar precio con el producto y, si se escribió, el precio de la góndola
  const loadPriceHref = `/upload?tab=precio&ean=${scan.ean}${hasShelfPrice ? `&monto=${shelfPrice}` : ''}`;

  function addOwn(product: Product, at?: { store?: StoreRef; price: number }) {
    const price = at ? at.price : initialCartPrice(prices, product.id, summary?.reference);
    addToCart({
      id: uniqueId(), productId: product.id, productName: product.name, price, quantity: 1, subtotal: price,
      ...(at?.store && { store: at.store }),
    });
    onAdded(product.name);
  }

  function addSepa(product: SepaProduct, at?: { store?: StoreRef; price: number }) {
    const created = at ? addSepaToCart(product, undefined, at) : addSepaToCart(product, summary?.reference);
    onAdded(created.name);
  }

  function addAt(store: StoreRef, price: number) {
    if (scan.status === 'own') addOwn(scan.product, { store, price });
    else if (scan.status === 'found') addSepa(scan.product, { store, price });
  }

  // ── Comercios cercanos ─────────────────────────────────────
  const near = known ? nearby.get(scan.ean) : undefined;
  // En un propio, sus precios cargados a mano con comercio van al final de la lista, como en las tarjetas de Buscar
  const ownStorePrices = own && near !== undefined ? getRecentStorePrices(prices, own.id, now) : [];
  const groupNear = Array.isArray(near) ? groupPricesNear(groupPrices ?? [], location ?? undefined, nearby.radiusKm) : [];
  const hasNear = Array.isArray(near) && near.length > 0;
  const showList = Array.isArray(near) && near.length + ownStorePrices.length + groupNear.length > 0;
  const showSummary = !hasNear && near !== 'loading' && summary !== undefined;
  const askLocation = sepaEnabled && location === null;

  // ── ¿Cuánto sale acá? ──────────────────────────────────────
  // Contra el más barato cercano (de Precios Claros o del grupo); si no hay cercanos con precio, contra la
  // referencia; y contra el último propio
  const comparing = near === 'loading' || lookup.isLoading(scan.ean);
  const shelfLines = hasShelfPrice ? shelfComparison({
    price: shelfPrice,
    nearby: hasNear ? near : undefined,
    group: groupNear,
    approx: nearby.approx,
    reference: near === 'loading' ? undefined : summary?.reference,
    last: last && { amount: last.amount, date: last.date },
  }) : [];

  return (
    <div className="mt-3 rounded-lg border border-primary-200 bg-primary-50 p-4">
      <div role="status" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {scan.status === 'found' && <ProductImage src={images.get(scan.ean)} name={name} size={48} />}
          {own && <ProductImage src={productImageSrc(own, photoUrl(own), images.get(scan.ean))} name={name} size={48} />}
          {own ? (
            <div className="min-w-0 flex-1 text-sm break-words">
              <p className="font-semibold text-gray-900">Ya tenés {own.name}.</p>
              {last && (
                <p className="text-gray-600">
                  Último precio <span className="font-semibold text-gray-900 tabular-nums">${formatMoney(last.amount)}</span>
                  {' · '}{formatDayMonth(last.date)}
                </p>
              )}
            </div>
          ) : (
            <p className="min-w-0 flex-1 text-sm text-gray-700 break-words">
              {scan.status === 'found'
                ? `No tenés ${name}. Está en Precios Claros (${scan.ean}).`
                : scan.status === 'error'
                  ? `No tenés un producto con el código ${scan.ean} y no se pudo consultar Precios Claros.`
                  : `No tenés un producto con el código ${scan.ean}.`}
            </p>
          )}
        </div>
        {own ? (
          <div className="flex shrink-0 items-center gap-3">
            <AddToCartButton
              name={own.name}
              // Sin precio propio, espera la referencia para no entrar en $0 (spec 18)
              loading={!last && !shelfAt && lookup.isLoading(scan.ean)}
              onClick={() => addOwn(own, shelfAt)}
              className="min-h-11 flex-1 sm:flex-none"
            />
            <Link
              href={`/product/${own.id}`}
              className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-primary-700 underline underline-offset-2 hover:text-primary-800">
              Ver detalle
            </Link>
          </div>
        ) : scan.status === 'found' ? (
          <div className="flex shrink-0 flex-col items-center sm:items-end">
            <AddToCartButton
              name={name}
              loading={!shelfAt && lookup.isLoading(scan.ean)}
              onClick={() => addSepa(scan.product, shelfAt)}
              className="min-h-11 w-full sm:w-auto"
            />
            <EditLink ean={scan.ean} />
          </div>
        ) : (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href={`/upload?tab=producto&ean=${scan.ean}`} className="btn-primary flex-1 text-center sm:flex-none">
              Agregar producto
            </Link>
            <Link
              href={loadPriceHref}
              className="btn-secondary inline-flex flex-1 items-center justify-center gap-1.5 sm:flex-none">
              <Tag aria-hidden="true" className="size-4" />
              Cargar precio acá
            </Link>
          </div>
        )}
      </div>

      {/* Comercios cercanos y precios por cadena: fuera de la región status para no leerlos enteros cada vez */}
      {known && (near !== undefined || summary || askLocation) && (
        <div className="mt-3 border-t border-primary-200 pt-3">
          {near !== undefined && <NearbyLine prices={near} approx={nearby.approx} />}
          {showList && (
            <div className="mt-2">
              <NearbyStores
                productName={name}
                prices={near}
                approx={nearby.approx}
                ownPrices={ownStorePrices}
                groupPrices={groupPrices}
                origin={location ?? undefined}
                radiusKm={nearby.radiusKm}
                limit={OPEN_STORES}
                onChoose={addAt}
                onMap={onMap}
              />
            </div>
          )}
          {/* Sin comercios cercanos con precio (o sin ubicación): el resumen por cadena, como en la spec 12 */}
          {showSummary && (
            <div className={near !== undefined ? 'mt-2' : undefined}>
              <ReferenceLine summary={summary} />
              <button
                type="button"
                onClick={() => setPricesOpen(open => !open)}
                aria-expanded={pricesOpen}
                aria-controls={panelId}
                className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-800">
                Ver precios por cadena
                <Chevron open={pricesOpen} />
              </button>
              {pricesOpen && <SepaPriceTable id={panelId} summary={summary} />}
            </div>
          )}
          {askLocation && (
            <p className="mt-1 text-sm text-gray-600">Activá tu ubicación arriba para ver comercios cercanos</p>
          )}
        </div>
      )}

      {known && (
        <div className="mt-3 border-t border-primary-200 pt-3">
          <div className="flex items-center gap-3">
            <label htmlFor={shelfId} className="min-w-0 flex-1 font-display text-base font-semibold text-gray-900">
              ¿Cuánto sale acá?
            </label>
            <div className="relative w-32 shrink-0">
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-display font-semibold text-gray-500">
                $
              </span>
              <input
                id={shelfId}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={shelf}
                onChange={e => setShelf(e.target.value)}
                className="input-field w-full appearance-none pl-7 text-right font-display font-semibold tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
              />
            </div>
          </div>
          {/* Región aparte del status del encabezado: anuncia solo la comparación cuando cambia */}
          <div aria-live="polite">
            {hasShelfPrice && (shelfLines.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {shelfLines.map(line => {
                  const { className, Icon } = TONES[line.tone];
                  return (
                    <li key={line.text} className={`flex items-start gap-1.5 text-sm font-semibold ${className}`}>
                      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                      <span className="min-w-0 break-words">{line.text}</span>
                    </li>
                  );
                })}
              </ul>
            ) : !comparing && (
              <p className="mt-2 text-sm text-gray-600">Sin precios para comparar</p>
            ))}
          </div>
          <Link
            href={loadPriceHref}
            className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary-700 underline underline-offset-2 hover:text-primary-800">
            <Tag aria-hidden="true" className="size-4" />
            Cargar precio acá
          </Link>
        </div>
      )}
    </div>
  );
}
