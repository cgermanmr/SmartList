'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ReactNode, useEffect, useRef, useState } from 'react';
import NumberInput from '@/components/NumberInput';
import ScanButton from '@/components/ScanButton';
import SepaPriceTable, { Chevron, ReferenceLine } from '@/components/SepaPriceTable';
import SepaResults from '@/components/SepaResults';
import { useSepaReferenceLookup } from '@/components/useSepaReferences';
import { useSepaSearch } from '@/components/useSepaSearch';
import { formatMoney, formatPctChange } from '@/lib/format';
import { newId } from '@/lib/ids';
import { CartItem, Product } from '@/lib/models';
import { getSepaProduct, isSearchableQuery, ReferenceSummary, SepaProduct, sepaEnabled } from '@/lib/sepa';
import { filterProducts, getPriceStats, initialCartPrice, useStore } from '@/lib/store';

/** Código leído con la cámara que no es de un producto propio */
type ScanResult =
  | { ean: string; status: 'loading' | 'missing' | 'error' }
  | { ean: string; status: 'found'; product: SepaProduct };

export default function SearchPage() {
  const router = useRouter();
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
  /** Aviso "✓ <nombre> en el carrito"; se oculta a los 3 s */
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  function showNotice(name: string) {
    setNotice(`${name} en el carrito`);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3000);
  }

  // ── Agregar al carrito ─────────────────────────────────────
  // Un producto del catálogo se crea solo (sin categoría) o se usa el propio con ese EAN; nunca pasa por el formulario
  function addSepa(product: SepaProduct, summary: ReferenceSummary | undefined) {
    const own = addSepaToCart(product, summary?.reference);
    showNotice(own.name);
  }

  // ── Código leído con la cámara ─────────────────────────────
  // Propio → su detalle; si no, se busca en el catálogo para ofrecer agregarlo con los datos completos
  function scanned(ean: string) {
    const own = useStore.getState().products.find(p => p.ean === ean);
    if (own) {
      setScan(null);
      router.push(`/product/${own.id}`);
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
      id: newId(),
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
      <h1 className="text-3xl font-bold mb-6">Buscar Productos</h1>

      <div className="mb-6">
        <div className="flex gap-2">
          <input
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setScan(null);
              setExpandedEan(null);
            }}
            type="text"
            placeholder="Busca un producto..."
            aria-label="Buscar producto por nombre, categoría o código de barras"
            className="input-field min-w-0 flex-1"
          />
          <ScanButton onDetected={scanned} />
        </div>
        {scan && (
          <ScanOffer
            key={scan.ean}
            scan={scan}
            onAdd={(product, summary) => {
              setScan(null);
              addSepa(product, summary);
            }}
          />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts.map(product => {
          const stats = getPriceStats(prices, product.id);
          const cartItem = cart.find(i => i.productId === product.id);
          const priceColor = stats && stats.previous !== null && stats.current > stats.previous
            ? 'text-red-600'
            : stats && stats.previous !== null && stats.current < stats.previous
              ? 'text-green-600'
              : 'text-primary-700';

          return (
            <div key={product.id} className="card p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-lg">{product.name}</h3>
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

      {filteredProducts.length === 0 && (
        <div className={`text-center ${showCatalog ? 'py-6' : 'py-12'}`}>
          <p className="text-gray-500 text-lg">
            {showCatalog ? 'No tenés productos con ese nombre' : 'No se encontraron productos'}
          </p>
        </div>
      )}

      {showCatalog && (
        <section aria-labelledby="catalog-title" className="mt-8">
          <h2 id="catalog-title" className="text-xl font-bold">En Precios Claros</h2>
          <SepaResults
            search={catalogSearch}
            renderDetails={product => {
              const summary = references.get(product.ean);
              return summary && <ReferenceLine summary={summary} />;
            }}
            renderItem={(product, info) => {
              const summary = references.get(product.ean);
              const loading = catalogLookup.isLoading(product.ean);
              // Sin precios (o mientras cargan): datos y, a la derecha, el botón y el link al formulario
              if (!summary) {
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
                      <SepaPriceTable summary={summary} />
                      <AddToCartButton
                        name={product.description}
                        loading={loading}
                        onClick={() => addSepa(product, summary)}
                        className="mt-3 min-h-11 w-full"
                      />
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

      {/* Aviso al agregar: fijo abajo para que se vea desde cualquier parte de la lista. La región queda montada */}
      <div role="status" className="pointer-events-none fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex justify-center md:bottom-14">
        {notice && (
          <p className="flex max-w-sm items-start gap-2 rounded-xl bg-primary-900 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-400" />
            <span className="min-w-0 break-words">{notice}</span>
          </p>
        )}
      </div>
    </div>
  );
}

interface AddToCartButtonProps {
  /** Nombre del producto para el aria-label */
  name: string;
  /** Se están buscando sus precios: deshabilitado con "Buscando precio…" para no agregarlo en $0 */
  loading: boolean;
  onClick: () => void;
  className?: string;
  children?: ReactNode;
}

function AddToCartButton({ name, loading, onClick, className = '', children = 'Agregar al carrito' }: AddToCartButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-busy={loading || undefined}
      aria-label={loading ? `Buscando el precio de ${name}` : `Agregar ${name} al carrito`}
      className={`btn-primary disabled:cursor-wait disabled:opacity-60 disabled:hover:bg-primary-700 ${className}`}>
      {loading ? 'Buscando precio…' : children}
    </button>
  );
}

/** Link al formulario para cambiar el nombre sugerido o ponerle categoría antes de agregarlo (optativo) */
function EditLink({ ean }: { ean: string }) {
  return (
    <Link
      href={`/upload?tab=producto&ean=${ean}`}
      className="inline-flex min-h-11 items-center text-sm text-primary-700 underline underline-offset-2 hover:text-primary-800">
      Editar antes de agregar
    </Link>
  );
}

// ── Oferta para un código leído que no es propio ─────────────────────────────

interface ScanOfferProps {
  scan: ScanResult;
  /** Agrega al carrito el producto del catálogo, con su referencia si tiene precios */
  onAdd: (product: SepaProduct, summary: ReferenceSummary | undefined) => void;
}

function ScanOffer({ scan, onAdd }: ScanOfferProps) {
  const href = `/upload?tab=producto&ean=${scan.ean}`;
  const lookup = useSepaReferenceLookup(scan.status === 'found' ? [scan.ean] : []);
  const summary = lookup.references.get(scan.ean);
  const [pricesOpen, setPricesOpen] = useState(false);
  const panelId = `cadenas-lector-${scan.ean}`;

  if (scan.status === 'loading') {
    return <p role="status" className="mt-3 text-sm text-gray-600">Buscando el código {scan.ean}…</p>;
  }

  const text = scan.status === 'found'
    ? `No tenés ${scan.product.description}. Está en Precios Claros (${scan.ean}).`
    : scan.status === 'error'
      ? `No tenés un producto con el código ${scan.ean} y no se pudo consultar Precios Claros.`
      : `No tenés un producto con el código ${scan.ean}.`;

  return (
    <div className="mt-3 rounded-lg border border-primary-200 bg-primary-50 p-4">
      <div role="status" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-sm text-gray-700 break-words">{text}</p>
        {scan.status === 'found' ? (
          <div className="flex shrink-0 flex-col items-center sm:items-end">
            <AddToCartButton
              name={scan.product.description}
              loading={lookup.isLoading(scan.ean)}
              onClick={() => onAdd(scan.product, summary)}
              className="min-h-11 w-full sm:w-auto"
            />
            <EditLink ean={scan.ean} />
          </div>
        ) : (
          <Link href={href} className="btn-primary shrink-0 text-center">Agregar producto</Link>
        )}
      </div>

      {/* Precios por cadena: fuera de la región status para no leer la lista entera al desplegarla */}
      {summary && (
        <div className="mt-3 border-t border-primary-200 pt-3">
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
    </div>
  );
}
