import { formatIsoDate, formatMoney } from '@/lib/format';
import { ReferenceSummary } from '@/lib/sepa';

interface Props {
  summary: ReferenceSummary;
  id?: string;
}

function branchCount(count: number): string {
  return count === 1 ? '1 sucursal' : `${count} sucursales`;
}

/**
 * Precio de cada cadena (su mediana), de menor a mayor. Una lista y no una tabla para que entre en 375 px; la más
 * barata (empatadas, todas) se marca con fondo y con texto, no solo con color
 */
export default function SepaPriceTable({ summary, id }: Props) {
  const lowest = summary.cheapest.mediana;

  return (
    <div id={id}>
      <ul className="border border-gray-200 rounded-lg divide-y divide-gray-200 overflow-hidden bg-white">
        {summary.byChain.map(price => {
          const cheapest = price.mediana === lowest;
          return (
            <li key={price.bandera} className={`flex items-start gap-3 px-3 py-2 ${cheapest ? 'bg-green-50' : ''}`}>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-gray-900 break-words">{price.bandera}</span>
                <span className="block text-xs text-gray-600">{branchCount(price.sucursales)}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className={`block font-semibold tabular-nums ${cheapest ? 'text-green-800' : 'text-gray-900'}`}>
                  ${formatMoney(price.mediana)}
                </span>
                {cheapest && (
                  <span className="mt-0.5 inline-block rounded-full bg-green-100 px-2 text-xs font-semibold text-green-800">
                    Más barato
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-gray-600">
        Precios de lista de grandes cadenas. Datos del {formatIsoDate(summary.date)} — SEPA (CC-BY-4.0)
      </p>
    </div>
  );
}

/** "Promedio $X · más barato en <cadena> $Y": la línea de resumen de Buscar y de la oferta del lector */
export function ReferenceLine({ summary }: { summary: ReferenceSummary }) {
  return (
    <span className="block text-sm text-gray-700 break-words">
      Promedio <strong className="font-semibold text-gray-900 tabular-nums">${formatMoney(summary.reference)}</strong>
      {' · '}más barato en {summary.cheapest.bandera}{' '}
      <span className="tabular-nums">${formatMoney(summary.cheapest.mediana)}</span>
    </span>
  );
}

/** Flecha de un desplegable: gira al abrir */
export function Chevron({ open }: { open: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
         className={`h-5 w-5 shrink-0 text-gray-500 motion-safe:transition-transform ${open ? 'rotate-180' : ''}`}>
      <path fillRule="evenodd" clipRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z" />
    </svg>
  );
}
