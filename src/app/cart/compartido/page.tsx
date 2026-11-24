'use client';

import { RefreshCw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, useSyncExternalStore } from 'react';
import ProductImage from '@/components/ProductImage';
import { useProductPhotos } from '@/components/useProductPhotos';
import { useSepaImages } from '@/components/useSepaImages';
import { useSharedCart } from '@/components/useSharedCart';
import { formatIsoDate, formatMoney, formatNumber } from '@/lib/format';
import { productImageSrc } from '@/lib/photo';
import { decodeSharedCart, DecodeResult, findOwn, SharedCart, SharedItem, unknownProductName } from '@/lib/shared-cart';
import { CartGroup, groupCartByStore, useStore } from '@/lib/store';
import InstalledAppNotice from './InstalledAppNotice';
import LoadDialog from './LoadDialog';

// ── Datos del link: lo que sigue al # ───────────────────────
// No se envían al servidor. Vacío (null) en el prerender y mientras la dirección todavía es la de otra página: al
// navegar, la dirección cambia recién al mostrarse esta. La suscripción se rehace al volver a mostrarse (<Activity>)
// y ahí se vuelve a leer.

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function readPayload(): string | null {
  return window.location.pathname.startsWith('/cart/compartido') ? window.location.hash.slice(1) : null;
}

const ERROR_TEXT: Record<Extract<DecodeResult, { ok: false }>['error'], string> = {
  invalid: 'El link no es válido.',
  incomplete: 'El link está incompleto. Pedí que te lo manden de nuevo.',
  version: 'Este link es de una versión más nueva de la app. Recargá la página.',
};

/** Vista previa de un carrito o una compra compartidos (spec 31). Abrirla no cambia ningún dato */
export default function SharedCartPage() {
  const payload = useSyncExternalStore(subscribeToHash, readPayload, () => null);

  if (payload === null) return <p role="status" className="py-12 text-center text-gray-500">Cargando…</p>;

  const result = decodeSharedCart(payload);
  if (!result.ok) {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-6">Carrito compartido</h1>
        <div className="text-center py-12">
          <p role="alert" className="text-gray-700 text-lg mb-4">{ERROR_TEXT[result.error]}</p>
          <Link href="/cart" className="btn-primary">Ir al carrito</Link>
        </div>
      </div>
    );
  }
  return <SharedCartPreview key={payload} cart={result.cart} />;
}

// ── Vista previa ────────────────────────────────────────────

function SharedCartPreview({ cart }: { cart: SharedCart }) {
  const router = useRouter();
  const products = useStore(s => s.products);
  const loadSharedCart = useStore(s => s.loadSharedCart);
  const view = useSharedCart(cart);
  const [choosing, setChoosing] = useState(false);

  // ── Imágenes: la foto propia va antes que la del catálogo ──
  const images = useSepaImages(cart.items.map(item => item.ean));
  const photoUrl = useProductPhotos(cart.items.map(item => findOwn(item, products)));

  const rows = cart.items.map((item, index): Row => {
    const own = findOwn(item, products);
    const image = item.ean ? images.get(item.ean) : undefined;
    return {
      key: String(index),
      item,
      store: view.storeOf(item.store),
      subtotal: item.quantity * (item.price ?? 0),
      name: view.nameOf(item) ?? (view.searching ? 'Buscando…' : unknownProductName(item.ean)),
      image: own ? productImageSrc(own, photoUrl(own), image) : image,
    };
  });
  const groups = groupCartByStore(rows);
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const count = cart.items.length;

  // Si el catálogo falló, se puede cargar igual mientras ningún producto se quede sin nombre
  const nameless = cart.items.some(item => view.nameOf(item) === undefined);
  const disabled = view.waiting || (view.failed && nameless);

  function load(merge: boolean) {
    setChoosing(false);
    loadSharedCart(view.resolve(), merge);
    router.push('/cart');
  }

  function start() {
    if (useStore.getState().cart.length > 0) setChoosing(true);
    else load(false);
  }

  return (
    <div>
      <h1 className="text-3xl font-bold">
        {cart.kind === 'purchase' ? `Compra del ${formatIsoDate(cart.date ?? '')}` : 'Carrito compartido'}
      </h1>
      <p className="mt-1 mb-6 text-lg text-gray-600">
        {count} {count === 1 ? 'producto' : 'productos'} · <strong className="text-gray-900">${formatMoney(total)}</strong>
      </p>

      <InstalledAppNotice />

      {view.failed && (
        <div role="alert" className="card mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <p className="flex flex-1 items-center gap-2 text-gray-700">
            <TriangleAlert aria-hidden="true" className="size-5 shrink-0 text-amber-700" />
            No se pudo consultar Precios Claros
          </p>
          <button type="button" onClick={view.retry} className="btn-secondary inline-flex items-center justify-center gap-2">
            <RefreshCw aria-hidden="true" className="size-4" /> Reintentar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {groups.map(group => <SharedGroup key={group.key || 'sin-comercio'} group={group} />)}
      </div>

      {cart.kind === 'purchase' && (
        <p className="mt-4 text-sm text-gray-600">
          Son los precios de esa compra. En tu carrito entran con tu último precio o el de referencia, si hay.
        </p>
      )}

      {/* Fijo abajo: con una lista larga queda a mano. -bottom-6 compensa el py-6 de <main> */}
      <div className="sticky -bottom-6 -mx-4 mt-6 bg-gray-50 px-4 py-3">
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          aria-busy={view.waiting || undefined}
          className="btn-primary w-full disabled:cursor-not-allowed disabled:hover:bg-primary-700">
          {view.waiting ? 'Buscando productos…' : 'Cargar en mi carrito'}
        </button>
      </div>

      <LoadDialog
        open={choosing}
        onMerge={() => load(true)}
        onReplace={() => load(false)}
        onCancel={() => setChoosing(false)}
      />
    </div>
  );
}

// ── Tarjeta de un comercio (solo lectura) ───────────────────

interface Row {
  key: string;
  item: SharedItem;
  store?: CartGroup['store'];
  subtotal: number;
  name: string;
  image: string | undefined;
}

function SharedGroup({ group }: { group: CartGroup<Row> }) {
  const titleId = useId();
  const { store } = group;
  const detail = store?.address ?? store?.barrio;
  return (
    <section aria-labelledby={titleId} className="card overflow-hidden">
      <div className={`flex items-start gap-3 border-b px-4 py-3 ${
        store ? 'bg-primary-50 border-primary-100' : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className={`text-lg font-bold break-words ${store ? 'text-primary-900' : 'text-gray-700'}`}>
            {store ? store.name : 'Sin comercio'}
          </h2>
          {detail && <p className="text-sm text-gray-600 break-words">{detail}</p>}
        </div>
        <p className={`shrink-0 whitespace-nowrap text-lg font-bold ${store ? 'text-primary-700' : 'text-gray-800'}`}>
          ${formatMoney(group.total)}
        </p>
      </div>

      <ul className="divide-y divide-gray-100">
        {group.items.map(({ key, item, name, image, subtotal }) => (
          <li key={key} className="flex items-start gap-3 px-4 py-3">
            <ProductImage src={image} name={name} size={40} />
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-gray-800 break-words">{name}</h3>
              <p className="text-sm text-gray-600">
                {item.price === undefined
                  ? `Cantidad: ${formatNumber(item.quantity, 0, 3)}`
                  : `${formatNumber(item.quantity, 0, 3)} × $${formatMoney(item.price)}`}
              </p>
            </div>
            {item.price === undefined
              ? <p className="shrink-0 whitespace-nowrap text-sm font-semibold text-gray-600">Sin precio</p>
              : <p className="shrink-0 whitespace-nowrap font-bold text-gray-800">${formatMoney(subtotal)}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
