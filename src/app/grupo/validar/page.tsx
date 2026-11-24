'use client';

import { ArrowLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import PriceVoteButtons from '@/components/PriceVoteButtons';
import ProductImage from '@/components/ProductImage';
import { useAuth } from '@/components/useAuth';
import { useMyGroup } from '@/components/useMyGroup';
import { usePendingValidations } from '@/components/usePendingValidations';
import { useSepaImages } from '@/components/useSepaImages';
import ValidationBadge from '@/components/ValidationBadge';
import { formatMoney, formatSize } from '@/lib/format';
import { groupPriceNote } from '@/lib/group';
import { PendingPrice, validationSummary } from '@/lib/price-validation';

const VISIBLE = 20;

function Title() {
  return <h1 className="mb-4 text-3xl font-bold">Por validar</h1>;
}

/** Por validar (spec 23): los precios de los demás de los últimos 14 días que todavía no votaste y no están validados */
export default function ValidatePage() {
  const auth = useAuth();

  return (
    <div className="mx-auto max-w-lg">
      <Link
        href="/grupo"
        className="-ml-2 mb-1 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 font-semibold text-primary-700 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
        <ArrowLeft aria-hidden="true" className="size-5" /> Grupo
      </Link>

      {auth.status === 'off' && (
        <>
          <Title />
          <p className="card p-5 text-gray-600">Los grupos no están disponibles</p>
        </>
      )}
      {auth.status === 'loading' && <p role="status" className="py-12 text-center text-gray-500">Cargando…</p>}
      {auth.status === 'out' && (
        <>
          <Title />
          <div className="card p-5">
            <p className="text-gray-700">Entrá con tu cuenta para validar precios</p>
            <Link href="/cuenta" className="btn-primary mt-4 w-full">Entrar</Link>
          </div>
        </>
      )}
      {auth.status === 'in' && <SignedIn userId={auth.user.id} />}
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="card p-5">
      <p className="text-gray-700">No se pudo cargar</p>
      <button type="button" onClick={onRetry} className="btn-secondary mt-4 inline-flex w-full items-center justify-center gap-2">
        <RefreshCw aria-hidden="true" className="size-4" /> Reintentar
      </button>
    </div>
  );
}

function SignedIn({ userId }: { userId: string }) {
  const { status, group, retry } = useMyGroup(userId);

  if (status === 'loading') return <p role="status" className="py-12 text-center text-gray-500">Cargando…</p>;
  if (status === 'error') return <><Title /><LoadError onRetry={retry} /></>;
  if (!group) {
    return (
      <>
        <Title />
        <div className="card p-5">
          <p className="text-gray-700">Unite a un grupo para validar precios</p>
          <Link href="/grupo" className="btn-primary mt-4 w-full">Ir al grupo</Link>
        </div>
      </>
    );
  }
  return <PendingList userId={userId} />;
}

/** Lo que se ve en esta visita: los que faltaban al abrir la página siguen aunque se voten (para poder cambiarlo) */
interface Kept {
  visit: number;
  keys: string[];
}

const keyOf = (price: PendingPrice) => `${price.memberId}|${price.priceId}`;

function PendingList({ userId }: { userId: string }) {
  const { status, prices, pending, visit, retry } = usePendingValidations(userId);
  const [kept, setKept] = useState<Kept | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Una visita nueva (la página volvió a mostrarse): lo ya votado sale de la lista
  if (status === 'ready' && kept?.visit !== visit) setKept({ visit, keys: pending.map(keyOf) });
  const keys = new Set([...(kept?.visit === visit ? kept.keys : []), ...pending.map(keyOf)]);
  const rows = prices
    .filter(price => keys.has(keyOf(price)))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const images = useSepaImages(rows.map(price => price.ean));

  if (status === 'loading') return <p role="status" className="py-12 text-center text-gray-500">Cargando…</p>;
  if (status === 'error') return <><Title /><LoadError onRetry={retry} /></>;

  const visible = showAll ? rows : rows.slice(0, VISIBLE);
  const hidden = rows.length - visible.length;

  return (
    <>
      <Title />
      <p className="-mt-2 mb-4 text-gray-600">
        Precios que cargó tu grupo en los últimos 14 días. Si sabés cuánto salen, contá si están bien.
      </p>

      {rows.length === 0 ? (
        <div className="card p-5">
          <p className="font-semibold text-gray-900">No hay precios por validar</p>
          <p className="mt-1 text-gray-600">Cuando alguien del grupo cargue un precio, aparece acá.</p>
        </div>
      ) : (
        <ul className="card divide-y divide-gray-200 overflow-hidden">
          {visible.map(price => (
            <PendingRow key={keyOf(price)} price={price} image={images.get(price.ean)} userId={userId} />
          ))}
        </ul>
      )}

      {hidden > 0 && (
        <button type="button" onClick={() => setShowAll(true)} className="btn-secondary mt-2 w-full text-sm">
          Ver {hidden} más
        </button>
      )}
    </>
  );
}

function PendingRow({ price, image, userId }: { price: PendingPrice; image?: string; userId: string }) {
  const name = price.productName || 'Producto';
  const size = price.size !== undefined && price.sizeUnit ? formatSize(price.size, price.sizeUnit) : '';
  const product = [price.brand, size].filter(Boolean).join(' · ');
  const where = price.store.address ?? price.store.barrio;
  const summary = validationSummary(price.validation, userId);

  return (
    <li className="px-4 py-4">
      <div className="flex gap-3">
        <ProductImage src={image} name={name} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 break-words font-semibold text-gray-900">{name}</span>
            <span className="shrink-0 font-display text-xl font-semibold tabular-nums text-gray-900">
              ${formatMoney(price.amount)}
            </span>
          </div>
          {product && <p className="text-sm text-gray-600 break-words">{product}</p>}
          <p className="text-sm text-gray-700 break-words">{where ? `${price.store.name} · ${where}` : price.store.name}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
            <span>{groupPriceNote(price)}</span>
            <ValidationBadge status={price.validation.status} />
          </p>
          {summary && <p className="mt-1 text-sm text-gray-700 break-words">{summary}</p>}
        </div>
      </div>
      <PriceVoteButtons key={`${price.priceId}|${price.amount}`} price={price} myUserId={userId} />
    </li>
  );
}
