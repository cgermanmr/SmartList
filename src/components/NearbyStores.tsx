'use client';

import { Map as MapIcon } from 'lucide-react';
import { useState } from 'react';
import { formatDayMonth, formatIsoDate, formatMoney } from '@/lib/format';
import { formatDistance, LatLng } from '@/lib/geo';
import { Price, StoreRef } from '@/lib/models';
import { ownPricesNear } from '@/lib/price-form';
import { isStaleDate, latestBranchDate, NearbyPrice, storeRefFromBranch } from '@/lib/sepa';
import { priceStoreRef, storeKey } from '@/lib/store';

/** Comercios que se ven antes de tocar "Ver más", si no se pide otro límite */
const VISIBLE_STORES = 10;

function distanceLabel(km: number, approx: boolean): string {
  return `${approx ? 'aprox. ' : ''}${formatDistance(km)}`;
}

function nearbyCount(count: number): string {
  return count === 1 ? 'en 1 comercio cerca' : `en ${count} comercios cerca`;
}

// ── Resumen de un producto ───────────────────────────────────

interface LineProps {
  /** Precios cercanos ya ordenados; 'loading' mientras se buscan */
  prices: NearbyPrice[] | 'loading';
  approx: boolean;
}

/** "Desde $X · <cadena> — <distancia>" y "en N comercios cerca": el menor precio cercano (a igual precio, el más cerca) */
export function NearbyLine({ prices, approx }: LineProps) {
  if (prices === 'loading') return <span className="block text-sm text-gray-600">Buscando precios…</span>;
  if (prices.length === 0) return <span className="block text-sm text-gray-600">Sin precio en comercios cercanos</span>;
  const best = prices[0];
  return (
    <span className="block text-sm text-gray-700 break-words">
      Desde <strong className="font-semibold text-gray-900 tabular-nums">${formatMoney(best.price)}</strong>
      {' · '}{best.branch.chain} — {distanceLabel(best.distanceKm, approx)}
      <span className="block text-gray-600">{nearbyCount(prices.length)}</span>
    </span>
  );
}

// ── Lista de comercios ───────────────────────────────────────

interface Props {
  id?: string;
  /** Nombre del producto, para el aria-label de cada botón */
  productName: string;
  /** Precios en los comercios cercanos, ya ordenados por precio y distancia */
  prices: NearbyPrice[];
  approx: boolean;
  /**
   * Precios cargados a mano (getRecentStorePrices). Los de un comercio con coordenadas dentro del radio se mezclan
   * con los de Precios Claros, con su distancia y Mapa (spec 26); los demás van al final, sin distancia
   */
  ownPrices?: Price[];
  /** Ubicación de la app y radio: para la distancia de los precios propios */
  origin?: LatLng;
  radiusKm?: number;
  /** Elegir un comercio con su precio; sin esto las filas no llevan botón */
  onChoose?: (store: StoreRef, price: number) => void;
  /** Texto del botón de cada fila */
  action?: string;
  /** Comercio actual del ítem (storeKey): su fila dice "Actual" en lugar del botón */
  currentKey?: string;
  /** Ver un comercio en el mapa; sin esto (o si el comercio no tiene coordenadas) la fila no lleva el botón */
  onMap?: (store: StoreRef) => void;
  /** Filas que se ven antes de tocar "Ver N más"; por defecto 10 */
  limit?: number;
}

interface Row {
  key: string;
  store: StoreRef;
  price: number;
  /** Dirección y localidad, o el barrio de un precio propio */
  detail: string;
  /** Distancia, o "Cargado por vos · dd/mm" */
  aside: string;
  /** "Cargado por vos · dd/mm" debajo, en un precio propio con distancia */
  note?: string;
  distanceKm: number;
  cheapest: boolean;
  /** Botón Mapa: las sucursales y los precios propios dentro del radio */
  mappable: boolean;
}

function ownLabel(price: Price): string {
  return `Cargado por vos · ${formatDayMonth(price.date)}`;
}

function ownDetail(price: Price): string {
  const store = priceStoreRef(price);
  return store.address ? [store.address, store.barrio].filter(Boolean).join(', ') : store.barrio ?? '';
}

/**
 * Comercios que tienen un producto: nombre, dirección, distancia, precio y botón. Hasta 10 (o `limit`) y "Ver más"; el más barato
 * de los cercanos (empatados, todos) se marca con fondo y con texto, no solo con color. En 375 px cada fila apila
 * nombre y dirección arriba y precio y botón abajo.
 */
export default function NearbyStores({ id, productName, prices, approx, ownPrices = [], origin, radiusKm, onChoose, action = 'Agregar', currentKey, onMap, limit = VISIBLE_STORES }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [today] = useState(() => new Date());
  const own = ownPricesNear(ownPrices, origin, radiusKm);

  // Sucursales y precios propios dentro del radio, por precio y después distancia
  const near: Row[] = [
    ...prices.map(p => ({
      key: p.branch.id,
      store: storeRefFromBranch(p.branch),
      price: p.price,
      detail: [p.branch.address, p.branch.barrio ?? p.branch.localidad].filter(Boolean).join(', '),
      aside: distanceLabel(p.distanceKm, approx),
      distanceKm: p.distanceKm,
      cheapest: false,
      mappable: true,
    })),
    ...own.near.map(({ price: p, distanceKm }) => ({
      key: `propio-${p.id}`,
      store: priceStoreRef(p),
      price: p.amount,
      detail: ownDetail(p),
      aside: distanceLabel(distanceKm, approx),
      note: ownLabel(p),
      distanceKm,
      cheapest: false,
      mappable: true,
    })),
  ].sort((a, b) => a.price - b.price || a.distanceKm - b.distanceKm || a.key.localeCompare(b.key));
  const lowest = near[0]?.price;

  const rows: Row[] = [
    ...near.map(row => ({ ...row, cheapest: row.price === lowest })),
    ...own.rest.map(p => ({
      key: `propio-${p.id}`,
      store: priceStoreRef(p),
      price: p.amount,
      detail: ownDetail(p),
      aside: ownLabel(p),
      distanceKm: Infinity,
      cheapest: false,
      mappable: false,
    })),
  ];
  const visible = showAll ? rows : rows.slice(0, limit);
  const hidden = rows.length - visible.length;
  const date = latestBranchDate(prices.map(p => p.branch));

  return (
    <div id={id}>
      <ul className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {visible.map(row => {
          const current = currentKey !== undefined && storeKey(row.store) === currentKey;
          return (
            <li key={row.key} className={`px-3 py-3 sm:flex sm:items-center sm:gap-4 ${row.cheapest ? 'bg-green-50' : ''}`}>
              <div className="min-w-0 sm:flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 break-words font-semibold text-gray-900">{row.store.name}</span>
                  <span className="shrink-0 text-sm text-gray-600">{row.aside}</span>
                </div>
                {row.detail && <p className="text-sm text-gray-600 break-words">{row.detail}</p>}
                {row.note && <p className="text-sm text-gray-600">{row.note}</p>}
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 sm:mt-0 sm:shrink-0 sm:justify-end">
                <span className="flex flex-wrap items-center gap-x-2">
                  <span className={`font-display text-xl font-semibold tabular-nums ${row.cheapest ? 'text-green-800' : 'text-gray-900'}`}>
                    ${formatMoney(row.price)}
                  </span>
                  {row.cheapest && (
                    <span className="rounded-full bg-green-100 px-2 text-xs font-semibold text-green-800">Más barato</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {onMap && row.mappable && row.store.lat !== undefined && row.store.lng !== undefined && (
                    <button
                      type="button"
                      onClick={() => onMap(row.store)}
                      aria-label={`Ver ${row.store.name} en el mapa`}
                      className="btn-secondary inline-flex min-w-11 items-center justify-center gap-1.5 px-2.5 text-sm sm:px-3">
                      <MapIcon aria-hidden="true" className="size-5" />
                      <span aria-hidden="true" className="hidden sm:inline">Mapa</span>
                    </button>
                  )}
                  {current ? (
                    <span className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-primary-700">Actual</span>
                  ) : onChoose && (
                    <button
                      type="button"
                      onClick={() => onChoose(row.store, row.price)}
                      aria-label={`${action} ${productName} en ${row.store.name}`}
                      className="btn-primary shrink-0 px-4 text-sm">
                      {action}
                    </button>
                  )}
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

      {date && (
        <p className={`mt-2 text-xs ${isStaleDate(date, today) ? 'font-semibold text-amber-800' : 'text-gray-600'}`}>
          Precios de lista informados a Precios Claros el {formatIsoDate(date)} — SEPA (CC-BY-4.0)
        </p>
      )}
    </div>
  );
}
