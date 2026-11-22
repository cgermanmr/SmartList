'use client';

import {
  ArrowDown, ArrowUp, Banknote, CalendarDays, Check, CreditCard, FilePen, LucideIcon, Map as MapIcon, QrCode,
  Route as RouteIcon, X,
} from 'lucide-react';
import Link from 'next/link';
import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import BranchMap from '@/components/BranchMap';
import CartCompareCard from '@/components/CartCompareCard';
import CartStoreDialog from '@/components/CartStoreDialog';
import NumberInput from '@/components/NumberInput';
import ProductImage from '@/components/ProductImage';
import { REFERENCE_TEXT_CLASS } from '@/components/ReferencePrice';
import { useSepaImages } from '@/components/useSepaImages';
import { useSepaReferenceLookup } from '@/components/useSepaReferences';
import { basketLines } from '@/lib/basket';
import { formatMoney } from '@/lib/format';
import { uniqueId } from '@/lib/ids';
import { CartItem, Price, Purchase, StoreRef } from '@/lib/models';
import { PAYMENT_METHODS } from '@/lib/payment-methods';
import { mapStops, MapStop, MAX_STOPS } from '@/lib/route';
import { ReferenceSummary, referenceShortLabel, referenceStatus, vsReference } from '@/lib/sepa';
import {
  CartGroup, NO_BARRIO, getCartStores, getCartTotal, getLastPurchasedPrice, groupCartByStore, useStore,
} from '@/lib/store';

// ── Medios de pago ─────────────────────────────────────────
const PAYMENT_ICONS: Record<string, LucideIcon> = {
  efectivo:      Banknote,
  debito:        CreditCard,
  credito1:      CreditCard,
  creditoN:      CalendarDays,
  transferencia: QrCode,
  cheque:        FilePen,
};

type PriceStatus = 'cheaper' | 'expensive' | 'same' | 'new';

const STATUS_CLASS: Record<PriceStatus, string> = {
  cheaper:   'text-green-600',
  expensive: 'text-red-600',
  same:      'text-blue-600',
  new:       '',
};

// ── Comparación de precios ─────────────────────────────────
function priceStatus(item: CartItem, last: number | null): PriceStatus {
  if (last === null) return 'new';
  if (item.price < last) return 'cheaper';
  if (item.price > last) return 'expensive';
  return 'same';
}

function priceBadge(item: CartItem, last: number): string {
  const diff = item.price - last;
  if (diff === 0) return '= igual';
  return `${diff > 0 ? '+' : '−'}$${formatMoney(Math.abs(diff))}`;
}

/** Ítem sin precio conocido (entró en $0 desde el catálogo): hay que completarlo antes de comprar */
function missingPrice(item: CartItem): boolean {
  return !(item.price > 0);
}

/** Línea gris del encabezado: dirección y barrio, lo que exista */
function storeDetail(store?: StoreRef): string {
  return [store?.address, store?.barrio].filter(Boolean).join(', ');
}

export default function CartPage() {
  const cart = useStore(s => s.cart);
  const products = useStore(s => s.products);
  const clearCart = useStore(s => s.clearCart);
  const removeCartItems = useStore(s => s.removeCartItems);
  const addPrice = useStore(s => s.addPrice);
  const savePurchase = useStore(s => s.savePurchase);

  // ── Checkout por comercio: un grupo a la vez ───────────────
  const [checkoutKey, setCheckoutKey] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState('');
  // Solo en "Sin comercio": dónde se compró (los dos opcionales)
  const [looseBarrio, setLooseBarrio] = useState('');
  const [looseStore, setLooseStore] = useState('');

  // Ítem al que se le está cambiando el comercio
  const [storeItemId, setStoreItemId] = useState<string | null>(null);

  const total = getCartTotal(cart);
  const groups = groupCartByStore(cart);
  const storeCount = groups.filter(g => g.store).length;
  const storeItem = cart.find(i => i.id === storeItemId) ?? null;

  // ── Mapa: un comercio o el recorrido por todos ─────────────
  const [map, setMap] = useState<{ stops: MapStop[]; notes?: string[] } | null>(null);
  // Paradas en el orden de los grupos; solo los comercios con coordenadas (los del SEPA)
  const located = mapStops(groups.flatMap(g => (g.store ? [g.store] : [])), Infinity);

  function showTour() {
    const missing = storeCount - located.length;
    setMap({
      stops: located.slice(0, MAX_STOPS),
      notes: [
        ...(missing === 1 ? ['1 comercio sin ubicación no aparece en el mapa'] : []),
        ...(missing > 1 ? [`${missing} comercios sin ubicación no aparecen en el mapa`] : []),
        ...(located.length > MAX_STOPS ? [`Se muestran los primeros ${MAX_STOPS} comercios`] : []),
      ],
    });
  }

  // Precio de referencia de los ítems con EAN, en una sola consulta
  const eanOf = (productId: string) => products.find(p => p.id === productId)?.ean;
  const { references, isLoading: referenceLoading } = useSepaReferenceLookup(cart.map(item => eanOf(item.productId)));
  // ¿Dónde conviene? (spec 25): los ítems con EAN entran en la comparación
  const basket = basketLines(cart, products);

  // ── Aviso "N productos pasaron a …": fijo abajo, 3 s ──────
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  function showMoved(count: number, storeName: string) {
    setNotice(count === 1 ? `1 producto pasó a ${storeName}` : `${count} productos pasaron a ${storeName}`);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3000);
  }
  // Imágenes de todo el carrito en una sola consulta (spec 17)
  const images = useSepaImages(cart.map(item => eanOf(item.productId)));

  function clear() {
    if (confirm('¿Estás seguro de que quieres vaciar el carrito?')) {
      closeCheckout();
      clearCart();
    }
  }

  function openCheckout(key: string) {
    setCheckoutKey(key);
    setSelectedPayment('');
    setLooseBarrio('');
    setLooseStore('');
  }

  function closeCheckout() {
    setCheckoutKey(null);
    setSelectedPayment('');
  }

  function confirmCheckout(group: CartGroup) {
    if (group.items.some(missingPrice)) return;
    const storeName = group.store ? group.store.name : looseStore.trim() || undefined;
    const knownBarrio = (group.store ? group.store.barrio?.trim() : looseBarrio.trim()) || undefined;
    // La compra lleva barrio solo si se conoce; el precio lo necesita siempre
    const barrio = knownBarrio ?? NO_BARRIO;
    const purchase: Purchase = {
      id: uniqueId(),
      date: new Date().toISOString(),
      items: group.items.map(i => ({ ...i })),
      total: group.total,
      ...(knownBarrio && { barrio: knownBarrio }),
      ...(storeName && { store: storeName }),
      paymentMethod: selectedPayment,
    };
    // Registrar precios pagados en el historial de precios
    const now = new Date();
    group.items.forEach((item, idx) => {
      const price: Price = {
        id: `${uniqueId()}-${idx}`,
        productId: item.productId,
        amount: item.price,
        date: now,
        barrio,
        store: storeName,
        // El comercio completo del grupo (spec 26): el precio pagado conserva dirección y coordenadas
        ...(group.store && { storeRef: group.store }),
      };
      addPrice(price);
    });

    savePurchase(purchase);
    alert(`Compra finalizada!${storeName ? `\nComercio: ${storeName}` : ''}\nTotal: $${formatMoney(group.total)}\nPago: ${selectedPayment}`);
    closeCheckout();
    // Salen solo los ítems de este comercio: los demás grupos quedan en el carrito
    removeCartItems(group.items.map(i => i.id));
  }

  if (cart.length === 0) {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-6">Mi Carrito</h1>
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg mb-4">Tu carrito está vacío</p>
          <Link href="/" className="btn-primary inline-block">Volver a Buscar</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Mi Carrito</h1>

      <CartCompareCard
        lines={basket.lines}
        withoutEan={basket.withoutEan}
        references={references}
        referencesLoading={basket.lines.some(line => referenceLoading(line.ean))}
        onMoved={showMoved}
      />

      {/* Una tarjeta por comercio */}
      <div className="grid grid-cols-1 gap-6 mb-6">
        {groups.map(group => (
          <StoreGroup
            key={group.key || 'sin-comercio'}
            group={group}
            eanOf={eanOf}
            references={references}
            images={images}
            onChangeStore={setStoreItemId}
            onMap={store => setMap({ stops: mapStops([store]) })}
            onCheckout={() => openCheckout(group.key)}
            payment={checkoutKey === group.key ? (
              <PaymentStep
                group={group}
                selectedPayment={selectedPayment}
                onSelectPayment={setSelectedPayment}
                looseBarrio={looseBarrio}
                onLooseBarrio={setLooseBarrio}
                looseStore={looseStore}
                onLooseStore={setLooseStore}
                onCancel={closeCheckout}
                onConfirm={() => confirmCheckout(group)}
              />
            ) : null}
          />
        ))}
      </div>

      {/* Total de todo el carrito */}
      <div className="bg-green-50 border-2 border-green-500 rounded-lg p-6 mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-3xl font-bold text-green-700">
          Total: ${formatMoney(total)}
          {storeCount > 0 && (
            <span className="block sm:inline text-lg font-semibold text-green-800 sm:ml-2">
              en {storeCount} {storeCount === 1 ? 'comercio' : 'comercios'}
            </span>
          )}
        </p>
        {/* Con un solo comercio en el mapa alcanza el botón de su encabezado */}
        {located.length >= 2 && (
          <button type="button" onClick={showTour} className="btn-secondary inline-flex w-full items-center justify-center gap-2 bg-white sm:w-auto">
            <RouteIcon aria-hidden="true" className="size-5" />
            Ver recorrido
          </button>
        )}
      </div>

      <button onClick={clear} className="btn-secondary w-full sm:w-auto min-h-11">
        Vaciar carrito
      </button>

      <CartStoreDialog item={storeItem} stores={getCartStores(cart)} onClose={() => setStoreItemId(null)} />
      <BranchMap stops={map?.stops ?? null} notes={map?.notes} onClose={() => setMap(null)} />

      {/* Aviso de "Pasar todo a este comercio": fijo abajo, como el de Buscar. La región queda montada */}
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

// ── Tarjeta de un comercio ─────────────────────────────────
interface StoreGroupProps {
  group: CartGroup;
  eanOf: (productId: string) => string | undefined;
  references: Map<string, ReferenceSummary>;
  images: Map<string, string>;
  onChangeStore: (itemId: string) => void;
  /** Ver el comercio en el mapa (solo se ofrece si tiene coordenadas) */
  onMap: (store: StoreRef) => void;
  onCheckout: () => void;
  /** Paso de medio de pago de este grupo, si está abierto */
  payment: ReactNode;
}

function StoreGroup({ group, eanOf, references, images, onChangeStore, onMap, onCheckout, payment }: StoreGroupProps) {
  const titleId = useId();
  const store = group.store;
  const detail = storeDetail(store);
  const count = group.items.length;
  const blocked = group.items.some(missingPrice);
  const blockedId = useId();
  return (
    <section aria-labelledby={titleId} className="card overflow-hidden">
      {/* Encabezado: comercio, dónde queda y subtotal */}
      <div className={`flex items-start gap-3 px-4 py-3 border-b ${
        store ? 'bg-primary-50 border-primary-100' : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className={`text-lg font-bold truncate ${store ? 'text-primary-900' : 'text-gray-700'}`}>
            {store ? store.name : 'Sin comercio'}
          </h2>
          <p className="text-sm text-gray-600 truncate">
            {detail && `${detail} · `}{count} {count === 1 ? 'producto' : 'productos'}
          </p>
        </div>
        {store && store.lat !== undefined && store.lng !== undefined && (
          <button
            type="button"
            onClick={() => onMap(store)}
            aria-label={`Ver ${store.name} en el mapa`}
            className="-my-1 flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-primary-700 hover:bg-primary-100 active:bg-primary-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
            <MapIcon aria-hidden="true" className="size-5" />
          </button>
        )}
        <p className={`shrink-0 whitespace-nowrap text-lg font-bold ${store ? 'text-primary-700' : 'text-gray-800'}`}>
          ${formatMoney(group.total)}
        </p>
      </div>

      {/* Ítems */}
      <ul className="divide-y divide-gray-100">
        {group.items.map(item => {
          const ean = eanOf(item.productId);
          return (
            <CartRow
              key={item.id}
              item={item}
              reference={ean ? references.get(ean) : undefined}
              image={ean ? images.get(ean) : undefined}
              onChangeStore={() => onChangeStore(item.id)}
            />
          );
        })}
      </ul>

      {/* Pie: comprar en este comercio */}
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
        {/* Con un ítem en $0 no se compra, aunque el medio de pago ya estuviera abierto */}
        {payment && !blocked ? payment : (
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            {blocked && (
              <p id={blockedId} className="text-sm font-medium text-amber-800 sm:mr-auto">
                Completá los precios para comprar
              </p>
            )}
            <button
              onClick={onCheckout}
              disabled={blocked}
              aria-describedby={blocked ? blockedId : undefined}
              className="btn-primary w-full sm:w-auto min-h-11 truncate disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary-700">
              {store ? `Comprar en ${store.name}` : 'Registrar compra'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Fila de un ítem ────────────────────────────────────────
interface CartRowProps {
  item: CartItem;
  reference: ReferenceSummary | undefined;
  image: string | undefined;
  onChangeStore: () => void;
}

function CartRow({ item, reference, image, onChangeStore }: CartRowProps) {
  const purchases = useStore(s => s.purchases);
  const removeFromCart = useStore(s => s.removeFromCart);
  const updateQuantity = useStore(s => s.updateQuantity);
  const updateCartItemPrice = useStore(s => s.updateCartItemPrice);

  const missing = missingPrice(item);
  // Sin precio no hay comparación que mostrar (sería "100 % abajo")
  const last = missing ? null : getLastPurchasedPrice(purchases, item.productId);
  const status = priceStatus(item, last);
  const refPct = reference && !missing ? vsReference(item.price, reference.reference) : null;
  const missingId = `missing-${item.id}`;

  return (
    <li className="p-4">
      <div className="flex items-start gap-3 mb-3">
        <ProductImage src={image} name={item.productName} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="font-bold break-words">{item.productName}</h3>
          {last !== null && (
            <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${STATUS_CLASS[status]}`}>
              {item.price > last && <ArrowUp aria-hidden="true" className="size-3.5" />}
              {item.price < last && <ArrowDown aria-hidden="true" className="size-3.5" />}
              {priceBadge(item, last)}
            </span>
          )}
        </div>
        <button
          onClick={() => removeFromCart(item.id)}
          aria-label={`Quitar ${item.productName}`}
          className="text-red-500 hover:text-red-700 text-xl ml-2 shrink-0 min-w-11 min-h-11 -mt-2 -mr-2 flex items-center justify-center">
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor={`price-${item.id}`} className="text-sm text-gray-600">Precio $</label>
          <NumberInput
            id={`price-${item.id}`}
            value={item.price}
            onValueChange={price => updateCartItemPrice(item.id, price)}
            min="0"
            step="0.01"
            aria-invalid={missing || undefined}
            aria-describedby={missing ? missingId : undefined}
            className={`input-field w-28 ${missing ? 'border-amber-500 bg-amber-50' : ''}`}
          />
          {missing && (
            <span id={missingId} className="text-sm font-semibold text-amber-800">Completar precio</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={`qty-${item.id}`} className="text-sm text-gray-600">Cantidad</label>
          <NumberInput
            id={`qty-${item.id}`}
            value={item.quantity}
            onValueChange={qty => { if (qty > 0) updateQuantity(item.id, qty); }}
            min="1"
            className="input-field w-20"
          />
        </div>
        <span className="text-lg font-bold text-primary-700 ml-auto">
          ${formatMoney(item.subtotal)}
        </span>
      </div>

      {reference && refPct !== null && (
        <p className={`mt-2 text-xs font-semibold ${REFERENCE_TEXT_CLASS[referenceStatus(refPct)]}`}>
          Ref. ${formatMoney(reference.reference)} · {referenceShortLabel(refPct)}
        </p>
      )}

      <button
        type="button"
        onClick={onChangeStore}
        aria-label={`Cambiar comercio de ${item.productName}`}
        className="mt-1 -ml-1 px-1 min-h-11 text-sm font-medium text-primary-700 hover:underline underline-offset-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
        Cambiar comercio
      </button>
    </li>
  );
}

// ── Paso: medio de pago de un comercio ─────────────────────
interface PaymentStepProps {
  group: CartGroup;
  selectedPayment: string;
  onSelectPayment: (label: string) => void;
  looseBarrio: string;
  onLooseBarrio: (value: string) => void;
  looseStore: string;
  onLooseStore: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function PaymentStep({
  group, selectedPayment, onSelectPayment, looseBarrio, onLooseBarrio, looseStore, onLooseStore, onCancel, onConfirm,
}: PaymentStepProps) {
  const headingId = useId();
  return (
    <div role="group" aria-labelledby={headingId} className="py-1">
      {/* Sin comercio: dónde se compró, los dos opcionales */}
      {!group.store && (
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="loose-barrio" className="text-sm text-gray-600 block mb-1">
              Barrio <span className="text-gray-500">(opcional)</span>
            </label>
            <input
              id="loose-barrio"
              type="text"
              value={looseBarrio}
              onChange={e => onLooseBarrio(e.target.value)}
              placeholder="Ej: Caballito"
              className="input-field bg-white"
            />
          </div>
          <div>
            <label htmlFor="loose-store" className="text-sm text-gray-600 block mb-1">
              Comercio <span className="text-gray-500">(opcional)</span>
            </label>
            <input
              id="loose-store"
              type="text"
              value={looseStore}
              onChange={e => onLooseStore(e.target.value)}
              placeholder="Ej: Supermercado Norte"
              className="input-field bg-white"
            />
          </div>
        </div>
      )}

      <h3 id={headingId} className="font-bold mb-3">¿Con qué medio de pago?</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        {PAYMENT_METHODS.map(m => {
          const Icon = PAYMENT_ICONS[m.id];
          return (
            <button
              key={m.id}
              onClick={() => onSelectPayment(m.label)}
              aria-pressed={selectedPayment === m.label}
              className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                selectedPayment === m.label
                  ? 'border-primary-600 bg-primary-50 text-primary-700'
                  : 'border-gray-200 bg-white hover:border-primary-300 text-gray-700'
              }`}>
              <Icon aria-hidden="true" className="size-6" />
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button onClick={onCancel} className="btn-secondary flex-1 min-h-11">
          Volver
        </button>
        <button
          onClick={onConfirm}
          disabled={!selectedPayment}
          className="btn-primary flex-1 min-h-11 disabled:opacity-40 disabled:cursor-not-allowed">
          Confirmar compra
        </button>
      </div>
    </div>
  );
}
