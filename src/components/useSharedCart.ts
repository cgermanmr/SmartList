import { useEffect, useState } from 'react';
import { useSepaBranches } from '@/components/useNearby';
import { useSepaReferenceLookup } from '@/components/useSepaReferences';
import { uniqueId } from '@/lib/ids';
import { StoreRef } from '@/lib/models';
import { getSepaProducts, sepaEnabled, SepaProduct } from '@/lib/sepa';
import {
  findOwn, resolveSharedCart, SharedCart, SharedItem, sharedItemName, SharedLoad, sharedStoreRef,
} from '@/lib/shared-cart';
import { useStore } from '@/lib/store';

const NO_PRODUCTS = new Map<string, SepaProduct>();

interface Answer {
  key: string;
  /** null si la consulta falló */
  products: Map<string, SepaProduct> | null;
}

export interface SharedCartView {
  /** Nombre de un ítem; undefined si no se conoce (todavía, o porque no está en el catálogo) */
  nameOf: (item: SharedItem) => string | undefined;
  /** Comercio con los datos de la sucursal, si es de Precios Claros */
  storeOf: (store: StoreRef | undefined) => StoreRef | undefined;
  /** true mientras se consulta el catálogo */
  searching: boolean;
  /** true mientras falta algo para cargar bien: el catálogo, las sucursales o las referencias */
  waiting: boolean;
  /** La consulta al catálogo falló */
  failed: boolean;
  retry: () => void;
  /** Productos e ítems para loadSharedCart, con los datos propios del momento */
  resolve: () => SharedLoad;
}

/**
 * Datos del catálogo para mostrar y cargar un carrito compartido (spec 31): los productos que no son propios, las
 * sucursales (solo si hay un comercio de Precios Claros) y las referencias de los precios que hacen falta. Si fallan
 * las sucursales o las referencias no hay error: el comercio queda con su nombre y el precio sigue sin la referencia
 */
export function useSharedCart(cart: SharedCart): SharedCartView {
  const products = useStore(s => s.products);

  // ── Catálogo ───────────────────────────────────────────────
  const unknown = cart.items.flatMap(item => (item.ean && !findOwn(item, products) ? [item.ean] : []));
  const key = [...new Set(unknown)].sort().join(',');
  const active = sepaEnabled && key !== '';
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const requestKey = `${attempt}|${key}`;

  useEffect(() => {
    if (!active) return undefined;
    let stale = false;
    getSepaProducts(key.split(',')).then(
      found => { if (!stale) setAnswer({ key: requestKey, products: found }); },
      () => { if (!stale) setAnswer({ key: requestKey, products: null }); },
    );
    return () => { stale = true; };
  }, [active, key, requestKey]);

  const current = active && answer?.key === requestKey ? answer : null;
  const catalog = current?.products ?? NO_PRODUCTS;
  const searching = active && current === null;

  // ── Sucursales y referencias ───────────────────────────────
  const branches = useSepaBranches(cart.items.some(item => item.store?.sepaId));
  // En un carrito vale el precio del link: la referencia hace falta solo para lo que viajó sin precio
  const priced = cart.items.filter(item => cart.kind === 'purchase' || item.price === undefined);
  const { references, isLoading } = useSepaReferenceLookup(priced.map(item => item.ean));

  return {
    nameOf: item => sharedItemName(item, products, catalog),
    storeOf: store => sharedStoreRef(store, branches.branches),
    searching,
    waiting: searching || branches.status === 'loading' || priced.some(item => isLoading(item.ean)),
    failed: current !== null && current.products === null,
    retry: () => setAttempt(n => n + 1),
    resolve: () => {
      const state = useStore.getState();
      return resolveSharedCart(cart, {
        products: state.products,
        prices: state.prices,
        catalog,
        branches: branches.branches,
        references: new Map([...references].map(([ean, summary]) => [ean, summary.reference])),
        newId: uniqueId,
      });
    },
  };
}
