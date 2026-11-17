import { formatMoney, formatMonth, shortMonth } from '@/lib/format';
import { MonthTotal } from '@/lib/spending';

interface SpendingChartProps {
  months: MonthTotal[];          // del más viejo al más nuevo
  selected: string;              // 'YYYY-MM'
  onSelect: (month: string) => void;
}

/**
 * Gasto de los últimos meses en barras de HTML (no SVG): cada mes con compras es un <button> que ocupa la columna
 * entera y lo selecciona; un mes sin compras muestra solo la línea base
 */
export default function SpendingChart({ months, selected, onSelect }: SpendingChartProps) {
  const max = Math.max(0, ...months.map(m => m.total));

  return (
    <div className="flex h-44 gap-1">
      {months.map(m => {
        const isSelected = m.month === selected;
        const label = (
          <span className={`text-xs ${isSelected ? 'font-bold text-primary-700' : 'text-gray-500'}`}>
            {shortMonth(m.month)}
          </span>
        );

        if (m.count === 0 || max === 0) {
          return (
            <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1 pt-1">
              <div className="relative w-full flex-1">
                <div className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-gray-200" />
              </div>
              {label}
            </div>
          );
        }

        // El alto es un valor calculado: única excepción a "solo Tailwind"
        const height = Math.max((m.total / max) * 100, 2);
        return (
          <button
            key={m.month}
            type="button"
            onClick={() => onSelect(m.month)}
            aria-label={`${formatMonth(m.month)}: $${formatMoney(m.total)}`}
            aria-pressed={isSelected}
            className="group flex min-h-11 min-w-0 flex-1 flex-col items-center gap-1 rounded-lg pt-1 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
            <span className="relative w-full flex-1">
              <span
                className={`absolute inset-x-1 bottom-0 mx-auto max-w-10 rounded-t-md transition-colors sm:inset-x-2 ${
                  isSelected ? 'bg-primary-700' : 'bg-primary-200 group-hover:bg-primary-300'
                }`}
                style={{ height: `${height}%` }}
              />
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );
}
