import { BasketLine, BasketOption, compareChains, compareNearby } from '@/lib/basket';
import { latestBranchDate, MAX_NEAR_BRANCHES, NearbyPrice, ReferenceSummary } from '@/lib/sepa';
import { useNearbyPrices } from './useNearby';

export interface BasketComparison {
  /** branches: sucursales cercanas; chains: cadenas con su precio nacional (sin ubicación o si fallan los cercanos) */
  mode: 'branches' | 'chains';
  /** true mientras se buscan las sucursales o los precios */
  loading: boolean;
  /** Opciones con al menos un producto, de la que más conviene a la que menos */
  options: BasketOption[];
  /** Sucursales del radio que no tienen ninguno de los productos (solo en modo sucursales) */
  emptyBranches: number;
  /** Sucursales del radio (hasta 40) */
  branchCount: number;
  /** Se cortó en las 40 más cercanas */
  limited: boolean;
  /** La ubicación es una localidad elegida a mano: las distancias van con "aprox." */
  approx: boolean;
  radiusKm: number;
  /** Fecha más reciente de los datos ('YYYY-MM-DD'), para el pie; null sin opciones */
  date: string | null;
}

/**
 * ¿Dónde conviene el carrito? (spec 25). Con ubicación y sucursales en el radio, compara contra cada sucursal con
 * `useNearbyPrices` (una llamada por cada 20 EAN, con caché por EAN + sucursal; a Supabase le llegan los EAN y los id
 * de las sucursales, nunca la ubicación). Sin ubicación, sin sucursales en el radio o si falla esa consulta, compara
 * contra las cadenas con las referencias que el carrito ya pidió (`references`), sin consultas nuevas.
 */
export function useBasketComparison(
  lines: BasketLine[], references: Map<string, ReferenceSummary>, referencesLoading = false,
): BasketComparison {
  const nearby = useNearbyPrices(lines.map(line => line.ean));
  const { status, branches, approx, radiusKm } = nearby;
  const answers = lines.map(line => nearby.get(line.ean));
  const near = {
    branchCount: branches.length,
    limited: branches.length >= MAX_NEAR_BRANCHES,
    approx,
    radiusKm,
  };

  // Con ubicación: mientras bajan las sucursales o los precios, queda esperando en modo sucursales
  if (status === 'loading' || answers.some(answer => answer === 'loading')) {
    return { mode: 'branches', loading: true, options: [], emptyBranches: 0, date: null, ...near };
  }

  const prices = new Map<string, NearbyPrice[]>();
  lines.forEach((line, i) => {
    const answer = answers[i];
    if (Array.isArray(answer)) prices.set(line.ean, answer);
  });

  if (status === 'ready' && branches.length > 0 && prices.size === new Set(lines.map(l => l.ean)).size) {
    const options = compareNearby(lines, prices, branches);
    return {
      mode: 'branches',
      loading: false,
      options,
      emptyBranches: branches.length - options.length,
      date: latestBranchDate(options.flatMap(o => (o.branch ? [o.branch] : []))),
      ...near,
    };
  }

  const options = compareChains(lines, references);
  const dates = lines.flatMap(line => {
    const summary = references.get(line.ean);
    return summary ? [summary.date] : [];
  });
  return {
    mode: 'chains',
    loading: referencesLoading,
    options: referencesLoading ? [] : options,
    emptyBranches: 0,
    date: dates.reduce<string | null>((latest, d) => (latest === null || d > latest ? d : latest), null),
    ...near,
  };
}
