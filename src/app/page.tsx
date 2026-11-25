'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import BranchMap from '@/components/BranchMap';
import { AddToCartButton, EditLink } from '@/components/CatalogActions';
import LocationBar from '@/components/LocationBar';
import NearbyStores, { NearbyLine } from '@/components/NearbyStores';
import NumberInput from '@/components/NumberInput';
import ProductImage from '@/components/ProductImage';
import ScanButton from '@/components/ScanButton';
import ScanOffer, { ScanResult } from '@/components/ScanOffer';
import SepaPriceTable, { Chevron, ReferenceLine } from '@/components/SepaPriceTable';
import SepaResults from '@/components/SepaResults';
import { useGroupPrices } from '@/components/useGroupPrices';
import { useNearbyPrices } from '@/components/useNearby';
import { useProductPhotos } from '@/components/useProductPhotos';
import { useSepaImages } from '@/components/useSepaImages';
import { useSepaReferenceLookup } from '@/components/useSepaReferences';
import { useSepaSearch } from '@/components/useSepaSearch';
import { formatMoney, formatPctChange } from '@/lib/format';
import { groupPricesNear } from '@/lib/group';
import { uniqueId } from '@/lib/ids';
import { CartItem, Product, StoreRef } from '@/lib/models';
import { productImageSrc } from '@/lib/photo';
import { mapStops, MapStop } from '@/lib/route';
import { getSepaProduct, isSearchableQuery, ReferenceSummary, SepaProduct, sepaEnabled } from '@/lib/sepa';
import { filterProducts, getPriceStats, getRecentStorePrices, initialCartPrice, useStore } from '@/lib/store';

export default function SearchPage() {
  const products = useStore(s => s.products);
  const prices = useStore(s => s.prices);
  const cart = useStore(s => s.cart);
  const addToCart = useStore(s => s.addToCart);
  const addSepaToCart = useStore(s => s.addSepaToCart);
  const updateQuantity = useStore(s => s.updateQuantity);
  const removeFromCart = useStore(s => s.removeFromCart);
  const [searchQuery, setSearchQuery] = useState('');
  const [scan, setScan] = useState<ScanResult | null>(null);
  /** Resultado del catálogo desplegado con sus precios por cadena (uno a la vez) */
  const [expandedEan, setExpandedEan] = useState<string | null>(null);
  /** Producto propio con la lista de comercios desplegada (uno a la vez) */
  const [storesOpenId, setStoresOpenId] = useState<string | null>(null);
  const [now] = useState(() => new Date());
  // Comercio que se está viendo en el mapa (un solo BranchMap para toda la pantalla)
  const [mapStop, setMapStop] = useState<MapStop[] | null>(null);
  const showMap = (store: StoreRef) => setMapStop(mapStops([store]));
  /** Aviso "✓ <nombre> en el carrito" o "<nombre> eliminado" (spec 33); se oculta a los 3 s */
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const searchAnchor = useRef<HTMLDivElement>(null);

  /**
   * En el celular, sube el buscador arriba de todo para que el teclado no tape los resultados (spec 29). Solo con
   * puntero táctil y solo hacia abajo: si ya está arriba, no se mueve. Instantáneo: cada tecla corta un
   * desplazamiento suave y el buscador quedaba a mitad de camino
   */
  function raiseSearch() {
    const anchor = searchAnchor.current;
    const main = anchor?.closest('main');
    if (!anchor || !main || !window.matchMedia('(pointer: coarse)').matches) return;
    if (anchor.getBoundingClientRect().top <= main.getBoundingClientRect().top + 1) return;
    anchor.scrollIntoView({ block: 'start' });
  }

  const filteredProducts = filterProducts(products, searchQuery);

  // Catálogo: aparte del filtro propio, que sigue siendo instantáneo. Sin los productos que ya tienen un propio
  const showCatalog = sepaEnabled && isSearchableQuery(searchQuery);
  const sepaSearch = useSepaSearch(searchQuery);
  const ownEans = new Set(products.map(p => p.ean));
  const catalogSearch = { ...sepaSearch, results: sepaSearch.results.filter(r => !ownEans.has(r.ean)) };
  // Precios de los resultados visibles en una sola consulta, cuando llegan los resultados
  // Solo se agrega con la búsqueda terminada: mientras se buscan los precios de un producto, su botón espera
  const catalogLookup = useSepaReferenceLookup(
    catalogSearch.status === 'done' ? catalogSearch.results.map(r => r.ean) : [],
  );
  const references = catalogLookup.references;
  // Referencia de los propios con EAN y sin precio propio: es su precio inicial en el carrito
  const ownLookup = useSepaReferenceLookup(
    filteredProducts.filter(p => p.ean && !getPriceStats(prices, p.id)).map(p => p.ean),
  );

  // Comercios cercanos (solo con ubicación): una sola consulta con los EAN visibles, propios y del catálogo, cuando
  // ya llegaron los resultados; mientras se escribe no se pide nada nuevo
  // Ubicación de la app: la distancia de los precios propios en "Comercios cercanos" (spec 26)
  const location = useStore(s => s.location);
  const nearbyEans = sepaSearch.status === 'loading' ? [] : [
    ...filteredProducts.map(p => p.ean),
    ...catalogSearch.results.map(r => r.ean),
  ];
  const nearby = useNearbyPrices(nearbyEans);
  // Precios del grupo (spec 22): los mismos EAN, en una consulta; sin ubicación no se muestran en Buscar
  const groupPrices = useGroupPrices(location ? nearbyEans : []);
  const groupNear = (ean: string | undefined) =>
    ean ? groupPricesNear(groupPrices.get(ean) ?? [], location ?? undefined, nearby.radiusKm) : [];

  // Imágenes de los productos propios con EAN, en una sola consulta; las del catálogo las pide SepaResults
  const images = useSepaImages(filteredProducts.map(p => p.ean));
  // La foto propia va antes que la del catálogo (spec 27)
  const photoUrl = useProductPhotos(filteredProducts);
  const imageOf = (product: Product) =>
    productImageSrc(product, photoUrl(product), product.ean ? images.get(product.ean) : undefined);

  // Al ocultarse la página se corta el temporizador: el aviso se quita ahí, para no quedar fijo al volver
  useEffect(() => () => {
    clearTimeout(noticeTimer.current);
    setNotice(null);
  }, []);

  function showText(text: string) {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3000);
  }

  function showNotice(name: string) {
    showText(`${name} en el carrito`);
  }

  // Aviso que dejó otra página: "<nombre> eliminado", desde el detalle (spec 33). Se toma al mostrarse Buscar
  const flash = useStore(s => s.flash);
  const setFlash = useStore(s => s.setFlash);
  const takeFlash = useEffectEvent((text: string) => {
    showText(text);
    setFlash(null);
  });
  useEffect(() => {
    if (flash === null) return;
    const timer = setTimeout(() => takeFlash(flash));
    return () => clearTimeout(timer);
  }, [flash]);

  // La oferta del lector de un producto propio eliminado se cierra (se quitó el vínculo y se eliminó desde su detalle)
  if (scan?.status === 'own' && !products.some(p => p.id === scan.product.id)) setScan(null);

  // ── Agregar al carrito ─────────────────────────────────────
  // Un producto del catálogo se crea solo (sin categoría) o se usa el propio con ese EAN; nunca pasa por el formulario
  function addSepa(product: SepaProduct, summary: ReferenceSummary | undefined) {
    const own = addSepaToCart(product, summary?.reference);
    showNotice(own.name);
  }

  // Desde una fila de comercio: entra con ese comercio y ese precio; si ya estaba en el carrito, pasa a ellos
  function addSepaAt(product: SepaProduct, store: StoreRef, price: number) {
    const own = addSepaToCart(product, undefined, { store, price });
    showNotice(own.name);
  }

  function addAt(product: Product, store: StoreRef, price: number) {
    addToCart({
      id: uniqueId(), productId: product.id, productName: product.name, price, quantity: 1, subtotal: price, store,
    });
    showNotice(product.name);
  }

  // ── Código leído con la cámara ─────────────────────────────
  // Propio → su oferta en Buscar, sin salir (spec 24); si no, se busca en el catálogo para ofrecer agregarlo
  function scanned(ean: string) {
    const own = useStore.getState().products.find(p => p.ean === ean);
    if (own) {
      setScan({ ean, status: 'own', product: own });
      return;
    }
    if (!sepaEnabled) {
      setScan({ ean, status: 'missing' });
      return;
    }
    setScan({ ean, status: 'loading' });
    // Si mientras tanto se leyó otro código, la respuesta vieja se descarta
    getSepaProduct(ean).then(
      product => setScan(s => s?.ean !== ean ? s
        : product ? { ean, status: 'found', product } : { ean, status: 'missing' }),
      () => setScan(s => s?.ean !== ean ? s : { ean, status: 'error' }),
    );
  }

  function changeQuantity(itemId: string, qty: number) {
    if (qty > 0) updateQuantity(itemId, qty);
  }

  function add(product: Product) {
    const reference = product.ean ? ownLookup.references.get(product.ean)?.reference : undefined;
    const price = initialCartPrice(prices, product.id, reference);
    const item: CartItem = {
      id: uniqueId(),
      productId: product.id,
      productName: product.name,
      price,
      quantity: 1,
      subtotal: price,
    };
    addToCart(item);
  }

  return (
    <div>
      {/* El título queda para los lectores de pantalla; a la vista lo reemplaza el placeholder (spec 29) */}
      <h1 className="sr-only">Buscar productos</h1>

      <LocationBar />

      {/* Marcador para subir el buscador al tocarlo en el celular */}
      <div ref={searchAnchor} />
      {/* Buscador fijo arriba de <main> (el que hace scroll): los resultados pasan por debajo. Es hijo directo de
          la página para que quede fijo en todo el largo de la lista (sticky no sale de su contenedor). -top-6
          compensa el py-6 de <main>: sticky cuenta desde el padding y la lista se vería por encima */}
      <div className="sticky -top-6 z-10 -mx-4 mt-1 flex gap-2 bg-gray-50 px-4 py-2">
        <input
          value={searchQuery}
          onFocus={raiseSearch}
          onChange={e => {
            // Después de que se aplique el alto mínimo de los resultados; antes no habría lugar para subir
            if (searchQuery === '' && e.target.value !== '') requestAnimationFrame(raiseSearch);
            setSearchQuery(e.target.value);
            setScan(null);
            setExpandedEan(null);
          }}
          type="text"
          placeholder="Buscar productos"
          aria-label="Buscar producto por nombre, categoría o código de barras"
          className="input-field min-w-0 flex-1"
        />
        <ScanButton onDetected={scanned} />
      </div>
      {scan && (
        <ScanOffer
          key={scan.ean}
          scan={scan}
          onAdded={name => {
            setScan(null);
            showNotice(name);
          }}
          onMap={showMap}
        />
      )}

      {/* Con texto, al menos el alto de la pantalla: así siempre se puede subir el buscador arriba (spec 29) */}
      <div className={searchQuery !== '' ? 'min-h-dvh' : undefined}>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map(product => {
            const stats = getPriceStats(prices, product.id);
            const cartItem = cart.find(i => i.productId === product.id);
            // Comercios cercanos: solo con EAN y con ubicación; los precios cargados a mano van al final de la lista
            const near = nearby.get(product.ean);
            const ownStorePrices = near === undefined ? [] : getRecentStorePrices(prices, product.id, now);
            const hasStores = Array.isArray(near) && near.length + ownStorePrices.length + groupNear(product.ean).length > 0;
            const storesOpen = storesOpenId === product.id && hasStores;
            const storesId = 'comercios-' + product.id;
            const priceColor = stats && stats.previous !== null && stats.current > stats.previous
              ? 'text-red-600'
              : stats && stats.previous !== null && stats.current < stats.previous
                ? 'text-green-600'
                : 'text-primary-700';

            return (
              <div key={product.id} className="card p-4">
                <div className="flex items-start gap-3 mb-3">
                  <ProductImage src={imageOf(product)} name={product.name} size={64} />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-lg break-words">{product.name}</h3>
                    {product.category && <p className="text-sm text-gray-600">{product.category}</p>}
                  </div>
                </div>

                {stats && (
                  <div className="mb-4">
                    <div className="flex items-baseline gap-2 mb-1">
                      <p className={`text-2xl font-bold ${priceColor}`}>${formatMoney(stats.current)}</p>
                      {stats.previous !== null && stats.current !== stats.previous && (
                        <span className={`text-sm font-semibold ${stats.current > stats.previous ? 'text-red-500' : 'text-green-500'}`}>
                          ({formatPctChange(stats.current, stats.previous)})
                        </span>
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-gray-500">
                      {stats.previous !== null && <span>Anterior: ${formatMoney(stats.previous)}</span>}
                      <span>Promedio: ${formatMoney(stats.avg)}</span>
                    </div>
                  </div>
                )}

                {near !== undefined && (
                  <div className="mb-4">
                    <NearbyLine prices={near} approx={nearby.approx} />
                    {hasStores && (
                      <button
                        type="button"
                        onClick={() => setStoresOpenId(storesOpen ? null : product.id)}
                        aria-expanded={storesOpen}
                        aria-controls={storesId}
                        className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-800">
                        Ver comercios
                        <Chevron open={storesOpen} />
                      </button>
                    )}
                    {storesOpen && Array.isArray(near) && (
                      <NearbyStores
                        id={storesId}
                        productName={product.name}
                        prices={near}
                        approx={nearby.approx}
                        ownPrices={ownStorePrices}
                        groupPrices={groupPrices.get(product.ean ?? '')}
                        origin={location ?? undefined}
                        radiusKm={nearby.radiusKm}
                        onChoose={(store, price) => addAt(product, store, price)}
                        onMap={showMap}
                      />
                    )}
                  </div>
                )}

                {cartItem ? (
                  <>
                    {/* Producto ya en carrito: controles de cantidad y borrado */}
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() => removeFromCart(cartItem.id)}
                        className="text-red-400 hover:text-red-600 transition-colors flex size-11 shrink-0 items-center justify-center rounded-lg -ml-2"
                        title="Quitar del carrito"
                        aria-label={`Quitar ${product.name} del carrito`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                      <div className="flex items-center border border-primary-300 rounded-xl overflow-hidden flex-1">
                        <button
                          onClick={() => changeQuantity(cartItem.id, cartItem.quantity - 1)}
                          aria-label="Restar uno"
                          className="min-h-11 min-w-11 px-3 text-primary-700 hover:bg-primary-50 font-bold text-lg leading-none">−</button>
                        <NumberInput
                          value={cartItem.quantity}
                          onValueChange={qty => changeQuantity(cartItem.id, qty)}
                          min="1"
                          aria-label={`Cantidad de ${product.name}`}
                          className="w-12 text-center text-sm font-semibold border-x border-primary-300 min-h-11 focus:outline-none"
                        />
                        <button
                          onClick={() => changeQuantity(cartItem.id, cartItem.quantity + 1)}
                          aria-label="Sumar uno"
                          className="min-h-11 min-w-11 px-3 text-primary-700 hover:bg-primary-50 font-bold text-lg leading-none">+</button>
                      </div>
                      <span className="text-sm font-bold text-primary-700 whitespace-nowrap">
                        ${formatMoney(cartItem.subtotal)}
                      </span>
                    </div>
                    <Link href={`/product/${product.id}`} className="btn-secondary w-full block text-center">
                      Ver Detalles
                    </Link>
                  </>
                ) : (
                  <div className="flex gap-2">
                    <Link href={`/product/${product.id}`} className="btn-secondary flex-1 text-center">
                      Ver Detalles
                    </Link>
                    <AddToCartButton
                      name={product.name}
                      loading={ownLookup.isLoading(product.ean)}
                      onClick={() => add(product)}
                      className="flex-1">
                      Añadir Carrito
                    </AddToCartButton>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {products.length === 0 && searchQuery.trim() === '' && (
          <div className="py-12 text-center">
            <p className="text-lg font-semibold text-gray-900">Todavía no tenés productos</p>
            <p className="mt-1 text-gray-600">Buscá un producto en Precios Claros o leé su código de barras</p>
          </div>
        )}

        {/* Con catálogo no hay mensaje: la lista vacía ya lo dice y "En Precios Claros" está debajo (spec 29) */}
        {!sepaEnabled && filteredProducts.length === 0 && (products.length > 0 || searchQuery.trim() !== '') && (
          <div className="py-12 text-center">
            <p className="text-gray-500 text-lg">No se encontraron productos</p>
          </div>
        )}

        {showCatalog && (
          <section aria-labelledby="catalog-title" className={filteredProducts.length > 0 ? 'mt-6' : undefined}>
            <h2 id="catalog-title" className="text-lg font-bold">En Precios Claros</h2>
            <SepaResults
              search={catalogSearch}
              renderDetails={product => {
                // Con ubicación, el mejor precio cercano; si no (o si falla), el resumen por cadena
                const near = nearby.get(product.ean);
                if (near !== undefined) return <NearbyLine prices={near} approx={nearby.approx} />;
                const summary = references.get(product.ean);
                return summary && <ReferenceLine summary={summary} />;
              }}
              renderItem={(product, info) => {
                const summary = references.get(product.ean);
                const loading = catalogLookup.isLoading(product.ean);
                const near = nearby.get(product.ean);
                // Con precios cercanos de Precios Claros o del grupo (spec 22), la lista de comercios
                const stores = Array.isArray(near) && near.length + groupNear(product.ean).length > 0 ? near : null;
                // Sin precios (o mientras cargan): datos y, a la derecha, el botón y el link al formulario
                if (!summary && !stores) {
                  return (
                    <div className="flex items-center gap-3 px-3 py-2">
                      {info}
                      <div className="flex shrink-0 flex-col items-end">
                        <AddToCartButton
                          name={product.description}
                          loading={loading}
                          onClick={() => addSepa(product, undefined)}
                          className="min-h-11 px-3 text-sm"
                        />
                        <EditLink ean={product.ean} />
                      </div>
                    </div>
                  );
                }
                const open = expandedEan === product.ean;
                const panelId = `cadenas-${product.ean}`;
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => setExpandedEan(open ? null : product.ean)}
                      aria-expanded={open}
                      aria-controls={panelId}
                      className="list-row">
                      {info}
                      <Chevron open={open} />
                    </button>
                    {open && (
                      <div id={panelId} className="border-t border-gray-200 bg-gray-50 px-3 py-3">
                        {/* Con comercios cercanos, la lista por sucursal; si no, el precio por cadena */}
                        {stores ? (
                          <NearbyStores
                            productName={product.description}
                            prices={stores}
                            approx={nearby.approx}
                            groupPrices={groupPrices.get(product.ean)}
                            origin={location ?? undefined}
                            radiusKm={nearby.radiusKm}
                            onChoose={(store, price) => addSepaAt(product, store, price)}
                            onMap={showMap}
                          />
                        ) : summary && <SepaPriceTable summary={summary} />}
                        <AddToCartButton
                          name={product.description}
                          loading={loading}
                          onClick={() => addSepa(product, summary)}
                          secondary={stores !== null}
                          className="mt-3 min-h-11 w-full">
                          {stores ? 'Agregar sin comercio' : undefined}
                        </AddToCartButton>
                        <div className="text-center">
                          <EditLink ean={product.ean} />
                        </div>
                      </div>
                    )}
                  </>
                );
              }}
            />
          </section>
        )}
      </div>

      {/* Aviso al agregar: fijo abajo para que se vea desde cualquier parte de la lista. La región queda montada */}
      <div role="status" className="pointer-events-none fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex justify-center md:bottom-14">
        {notice && (
          <p className="flex min-w-0 max-w-sm items-start gap-2 rounded-xl bg-primary-900 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-400" />
            <span className="min-w-0 break-words">{notice}</span>
          </p>
        )}
      </div>

      <BranchMap stops={mapStop} onClose={() => setMapStop(null)} />
    </div>
  );
}
