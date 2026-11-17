'use client';

import { ChevronDown, ChevronRight, ChevronUp, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ReactNode, useState } from 'react';
import ProductImage from '@/components/ProductImage';
import SpendingVariation from '@/components/SpendingVariation';
import { useSepaImages } from '@/components/useSepaImages';
import { formatDateTime, formatMoney, formatNumber, monthName } from '@/lib/format';
import { CartItem, Purchase } from '@/lib/models';
import { paymentLabel } from '@/lib/payment-methods';
import { monthKey, monthSummary, monthVariation, previousMonth } from '@/lib/spending';
import { getPriceStats, useStore } from '@/lib/store';

export default function PurchasesPage() {
  const router = useRouter();
  const purchases = useStore(s => s.purchases);
  const prices = useStore(s => s.prices);
  const products = useStore(s => s.products);
  const loadPurchaseToCart = useStore(s => s.loadPurchaseToCart);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingPurchase, setPendingPurchase] = useState<Purchase | null>(null);
  // El mes actual se toma al montar la página (como el `now` de Buscar)
  const [currentMonth] = useState(() => monthKey(new Date()));

  // Imágenes (spec 17): solo las de la compra expandida, por el EAN del producto propio de cada ítem.
  // Si el producto se borró no hay EAN: queda el marcador con la inicial del nombre guardado en la compra
  const eanOf = (productId: string) => products.find(p => p.id === productId)?.ean;
  const expandedPurchase = purchases.find(p => p.id === expandedId);
  const images = useSepaImages(expandedPurchase?.items.map(item => eanOf(item.productId)) ?? []);
  const imageOf = (productId: string) => {
    const ean = eanOf(productId);
    return ean ? images.get(ean) : undefined;
  };

  function toggle(id: string) {
    setExpandedId(expandedId === id ? null : id);
  }

  function loadToCart(purchase: Purchase) {
    if (useStore.getState().cart.length > 0) {
      setPendingPurchase(purchase);
    } else {
      loadPurchaseToCart(purchase);
      router.push('/cart');
    }
  }

  function confirmLoad(merge: boolean) {
    if (pendingPurchase) {
      loadPurchaseToCart(pendingPurchase, merge);
      setPendingPurchase(null);
      router.push('/cart');
    }
  }

  /** Último precio registrado en el historial de precios para el producto */
  function lastRegisteredPrice(productId: string): number | null {
    return getPriceStats(prices, productId)?.current ?? null;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Historial de Compras</h1>

      {purchases.length > 0 && <SpendingCard purchases={purchases} month={currentMonth} />}

      {purchases.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg mb-2">No hay compras registradas</p>
          <p className="text-gray-500 text-sm">Finalizá una compra desde el carrito para verla aquí</p>
        </div>
      )}

      <div className="space-y-4">
        {purchases.map(purchase => {
          const expanded = expandedId === purchase.id;
          const date = formatDateTime(purchase.date);
          return (
            <div key={purchase.id} className="card overflow-hidden">

              {/* Encabezado de la compra (siempre visible): expandir y Repetir son botones hermanos */}
              <div className="flex items-center">
                <button
                  onClick={() => toggle(purchase.id)}
                  aria-expanded={expanded}
                  aria-controls={`compra-${purchase.id}`}
                  className="flex-1 min-w-0 p-4 flex justify-between items-center gap-2 hover:bg-gray-50 transition-colors text-left">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800">{date}</p>
                    <p className="text-sm text-gray-500">
                      {purchase.items.length} producto(s)
                      {purchase.store && (
                        <span className="ml-1">· {purchase.store}{purchase.barrio && <span>, {purchase.barrio}</span>}</span>
                      )}
                      {purchase.paymentMethod && <span className="ml-1">· {paymentLabel(purchase.paymentMethod)}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="text-xl font-bold text-primary-700">${formatMoney(purchase.total)}</p>
                    {expanded
                      ? <ChevronUp aria-hidden="true" className="size-5 text-gray-400" />
                      : <ChevronDown aria-hidden="true" className="size-5 text-gray-400" />}
                  </div>
                </button>
                <button
                  onClick={() => loadToCart(purchase)}
                  aria-label={`Repetir compra del ${date.slice(0, 10)}`}
                  title="Cargar todos los productos al carrito"
                  className="mr-4 shrink-0 min-h-11 text-sm px-3 py-1 rounded-lg border border-primary-300 text-primary-700 hover:bg-primary-50 transition-colors flex items-center gap-1">
                  <ShoppingCart aria-hidden="true" className="size-4" /> <span className="hidden sm:inline">Repetir</span>
                </button>
              </div>

              {/* Detalle expandible */}
              {expanded && (
                <div id={`compra-${purchase.id}`} className="border-t border-gray-100">
                  <div className="divide-y divide-gray-100">
                    {purchase.items.map((item, i) => (
                      <PurchaseItemRow
                        key={`${item.id}-${i}`}
                        item={item}
                        image={imageOf(item.productId)}
                        last={lastRegisteredPrice(item.productId)}
                      />
                    ))}
                  </div>

                  <div className="px-4 py-3 bg-gray-50 flex justify-end">
                    <p className="text-lg font-bold text-green-700">Total: ${formatMoney(purchase.total)}</p>
                  </div>
                </div>
              )}

            </div>
          );
        })}
      </div>

      {/* Modal: confirmar carga al carrito */}
      {pendingPurchase && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="load-title" className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 id="load-title" className="text-lg font-bold text-gray-900 mb-2">El carrito tiene productos</h3>
            <p className="text-gray-600 mb-6">
              ¿Querés agregar los <strong>{pendingPurchase.items.length} producto(s)</strong> de esta compra
              al carrito existente, o reemplazarlo?
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={() => confirmLoad(true)} className="btn-primary w-full">Mantener y agregar</button>
              <button onClick={() => confirmLoad(false)} className="btn-secondary w-full">Reemplazar carrito</button>
              <button onClick={() => setPendingPurchase(null)} className="w-full py-2 text-gray-500 hover:text-gray-700 text-sm transition-colors">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tarjeta que lleva a /gastos: total del mes actual y variación contra el mes anterior (spec 03) */
function SpendingCard({ purchases, month }: { purchases: Purchase[]; month: string }) {
  const summary = monthSummary(purchases, month);
  const previous = previousMonth(month);
  const name = monthName(month);

  let detail: ReactNode = null;
  if (summary.count === 0) {
    detail = <span className="text-gray-500">Todavía no compraste este mes</span>;
  } else if (monthSummary(purchases, previous).count > 0) {
    detail = <SpendingVariation value={monthVariation(purchases, month)} suffix={` que ${monthName(previous)}`} />;
  }

  return (
    <Link
      href="/gastos"
      className="card mb-4 flex min-h-11 items-center gap-3 p-4 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
      <div className="min-w-0 flex-1">
        <p className="font-bold text-gray-900 wrap-anywhere">
          {name.charAt(0).toUpperCase()}{name.slice(1)}: ${formatMoney(summary.total)}
        </p>
        {detail && <p className="text-sm">{detail}</p>}
      </div>
      <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary-700">
        Ver gastos <ChevronRight aria-hidden="true" className="size-5" />
      </span>
    </Link>
  );
}

function PurchaseItemRow({ item, image, last }: { item: CartItem; image: string | undefined; last: number | null }) {
  // Verde si pagó <= último precio registrado, rojo si pagó más
  const cheaperOrEqual = last !== null && item.price <= last;
  const expensive = last !== null && item.price > last;
  const priceColor = cheaperOrEqual ? 'text-green-600' : expensive ? 'text-red-600' : 'text-gray-700';

  // Variación del precio pagado respecto al último registrado
  const pct = last !== null && last !== 0 ? ((item.price - last) / last) * 100 : null;

  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <ProductImage src={image} name={item.productName} size={40} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-800 break-words">{item.productName}</p>
        {/* Precio pagado */}
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className={`text-base font-bold ${priceColor}`}>${formatMoney(item.price)} c/u</span>
          {pct !== null && (
            <span className={`text-xs font-semibold ${cheaperOrEqual ? 'text-green-500' : 'text-red-500'}`}>
              ({pct > 0 ? '+' : ''}{formatNumber(pct, 1)}%)
            </span>
          )}
        </div>
        {/* Sub-índice: último precio registrado */}
        {last !== null && (
          <p className="text-xs text-gray-500 mt-0.5">Último precio: ${formatMoney(last)}</p>
        )}
        <p className="text-xs text-gray-500">Cantidad: {item.quantity}</p>
      </div>

      <p className="font-bold text-gray-800 ml-4 mt-1">${formatMoney(item.subtotal)}</p>
    </div>
  );
}
