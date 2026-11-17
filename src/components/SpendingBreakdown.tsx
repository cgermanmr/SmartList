import { useId } from 'react';
import { formatMoney, formatPct } from '@/lib/format';
import { Breakdown } from '@/lib/spending';

/** Desglose del gasto del mes: nombre, monto, porcentaje y una barra horizontal por fila */
export default function SpendingBreakdown({ title, rows }: { title: string; rows: Breakdown[] }) {
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="card p-4">
      <h2 id={titleId} className="mb-3 text-lg font-bold">{title}</h2>
      <ul className="space-y-3">
        {rows.map(row => (
          <li key={row.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-semibold text-gray-800">{row.label}</span>
              <span className="shrink-0 whitespace-nowrap">
                <span className="font-bold">${formatMoney(row.amount)}</span>
                <span className="ml-2 text-sm text-gray-500">{formatPct(row.percent)}</span>
              </span>
            </div>
            {/* El ancho es un valor calculado: única excepción a "solo Tailwind" */}
            <div aria-hidden="true" className="mt-1.5 h-2 overflow-hidden rounded-full bg-primary-100">
              <div className="h-full rounded-full bg-primary-700" style={{ width: `${row.percent}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
