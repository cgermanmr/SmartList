import { useEffect, useMemo, useState } from 'react';
import { RadiusKm } from '@/lib/location';
import { getNearbyPrices, getSepaBranches, NearBranch, nearestBranches, NearbyPrice, SepaBranch, sepaEnabled } from '@/lib/sepa';
import { useStore } from '@/lib/store';

// Comercios cercanos: las sucursales se bajan una vez por sesión y las distancias se calculan acá, en el navegador.

export interface BranchesState {
  /** off: no se pidieron (o no hay Supabase) */
  status: 'off' | 'loading' | 'ready' | 'error';
  branches: SepaBranch[];
}

const NO_BRANCHES: SepaBranch[] = [];
const NO_NEAR: NearBranch[] = [];
const NO_PRICES = new Map<string, NearbyPrice[]>();

/** Todas las sucursales del SEPA (caché de módulo en getSepaBranches); solo las pide con `enabled` */
export function useSepaBranches(enabled: boolean): BranchesState {
  const active = sepaEnabled && enabled;
  const [loaded, setLoaded] = useState<SepaBranch[] | 'error' | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    let stale = false;
    getSepaBranches().then(
      branches => { if (!stale) setLoaded(branches); },
      () => { if (!stale) setLoaded('error'); },
    );
    return () => { stale = true; };
  }, [active]);

  if (!active) return { status: 'off', branches: NO_BRANCHES };
  if (loaded === null) return { status: 'loading', branches: NO_BRANCHES };
  if (loaded === 'error') return { status: 'error', branches: NO_BRANCHES };
  return { status: 'ready', branches: loaded };
}

export interface NearBranchesState {
  status: BranchesState['status'];
  /** Hasta 40 sucursales dentro del radio, de la más cercana a la más lejana */
  branches: NearBranch[];
  /** La ubicación es una localidad elegida a mano: las distancias van con "aprox." */
  approx: boolean;
  radiusKm: RadiusKm;
}

/** Sucursales cercanas a la ubicación guardada; sin ubicación, `off` */
export function useNearBranches(): NearBranchesState {
  const location = useStore(s => s.location);
  const radiusKm = useStore(s => s.radiusKm);
  const { status, branches } = useSepaBranches(location !== null);
  const lat = location?.lat;
  const lng = location?.lng;
  const near = useMemo(
    () => (lat === undefined || lng === undefined ? NO_NEAR : nearestBranches(branches, { lat, lng }, radiusKm)),
    [branches, lat, lng, radiusKm],
  );
  return { status, branches: near, approx: location?.source === 'localidad', radiusKm };
}

interface Answered {
  /** Sucursales con las que se pidieron: al cambiar de ubicación o de radio, lo respondido deja de valer */
  branchKey: string;
  /** EAN que ya tuvieron respuesta (con precios, sin precios o con error) */
  eans: ReadonlySet<string>;
  /** Los que respondieron bien; [] si ningún comercio cercano lo tiene */
  prices: Map<string, NearbyPrice[]>;
}

const NONE: Answered = { branchKey: '', eans: new Set(), prices: NO_PRICES };

export interface NearbyLookup extends NearBranchesState {
  /**
   * Precios de un producto en los comercios cercanos, del más barato al más caro: 'loading' mientras se buscan,
   * [] si ninguno lo tiene y undefined si no corresponde mostrarlos (sin EAN, sin ubicación, sin comercios en el
   * radio o con error): ahí la pantalla queda como sin ubicación
   */
  get: (ean: string | undefined) => NearbyPrice[] | 'loading' | undefined;
}

/**
 * Precios de varios EAN en los comercios cercanos, en una sola consulta (`getNearbyPrices`, con caché). Las
 * respuestas se acumulan mientras no cambien las sucursales: al cambiar los EAN, solo los nuevos quedan cargando.
 * A Supabase le llegan los EAN y los id de las sucursales, nunca la ubicación.
 */
export function useNearbyPrices(eans: readonly (string | undefined)[]): NearbyLookup {
  const near = useNearBranches();
  const { status, branches } = near;
  const key = [...new Set(eans.filter((ean): ean is string => Boolean(ean)))].sort().join(',');
  const branchKey = branches.map(b => b.id).join(',');
  const active = status === 'ready' && branches.length > 0;
  const [answered, setAnswered] = useState<Answered>(NONE);

  useEffect(() => {
    if (!active || key === '') return undefined;
    let stale = false;
    const requested = key.split(',');
    const merge = (byEan: Map<string, NearbyPrice[]> | null) => setAnswered(prev => {
      const base = prev.branchKey === branchKey ? prev : NONE;
      const prices = new Map(base.prices);
      for (const ean of requested) {
        const found = byEan?.get(ean);
        if (found) prices.set(ean, found);
        else prices.delete(ean);
      }
      return { branchKey, eans: new Set([...base.eans, ...requested]), prices };
    });
    getNearbyPrices(requested, branches).then(
      byEan => { if (!stale) merge(byEan); },
      // Con error el producto queda como sin ubicación, sin mensaje
      () => { if (!stale) merge(null); },
    );
    return () => { stale = true; };
  }, [active, key, branchKey, branches]);

  const current = answered.branchKey === branchKey ? answered : NONE;
  const pending = new Set(key === '' ? [] : key.split(','));

  return {
    ...near,
    get: ean => {
      if (!ean || status === 'off' || status === 'error') return undefined;
      if (status === 'loading') return 'loading';
      if (!active) return undefined;
      if (current.eans.has(ean)) return current.prices.get(ean);
      return pending.has(ean) ? 'loading' : undefined;
    },
  };
}
