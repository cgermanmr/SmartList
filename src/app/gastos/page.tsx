'use client';

import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { ReactNode, useState } from 'react';
import SpendingBreakdown from '@/components/SpendingBreakdown';
import SpendingChart from '@/components/SpendingChart';
import SpendingVariation from '@/components/SpendingVariation';
import { formatMoney, formatMonth, monthName } from '@/lib/format';
import {
  availableMonths, byPayment, byStore, lastMonthsTotals, monthKey, monthSummary, monthVariation, previousMonth,
} from '@/lib/spending';
import { useStore } from '@/lib/store';

const ARROW_CLASS =
  'flex size-11 shrink-0 items-center justify-center rounded-xl text-primary-700 transition-colors hover:bg-primary-50 ' +
  'disabled:text-gray-300 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';

export default function GastosPage() {
  const purchases = useStore(s => s.purchases);

  // El mes actual se toma al montar la página; con <Activity> el mes elegido se conserva al volver
  const [current] = useState(() => monthKey(new Date()));
  const [month, setMonth] = useState(current);

  const header = (
    <>
      <Link
        href="/purchases"
        className="-ml-2 mb-1 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 font-semibold text-primary-700 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
        <ArrowLeft aria-hidden="true" className="size-5" /> Historial
      </Link>
      <h1 className="text-3xl font-bold">Gastos</h1>
    </>
  );

  if (purchases.length === 0) {
    return (
      <div>
        {header}
        <EmptyMessage text="Todavía no hay compras" />
      </div>
    );
  }

  const months = availableMonths(purchases, current);
  const index = months.indexOf(month);
  const summary = monthSummary(purchases, month);
  const variation = monthVariation(purchases, month);

  return (
    <div className="space-y-4">
      <div>{header}</div>

      {/* Selector de mes: recorre los meses con compras y el actual */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMonth(months[index - 1])}
          disabled={index <= 0}
          aria-label="Mes anterior"
          className={ARROW_CLASS}>
          <ChevronLeft aria-hidden="true" className="size-6" />
        </button>
        <p aria-live="polite" className="font-display text-xl font-bold text-gray-900">{formatMonth(month)}</p>
        <button
          type="button"
          onClick={() => setMonth(months[index + 1])}
          disabled={index === -1 || index >= months.length - 1}
          aria-label="Mes siguiente"
          className={ARROW_CLASS}>
          <ChevronRight aria-hidden="true" className="size-6" />
        </button>
      </div>

      {/* Resumen del mes */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Total del mes">
          <span className="text-primary-700">${formatMoney(summary.total)}</span>
        </SummaryCard>
        <SummaryCard label="Compras">{summary.count}</SummaryCard>
        <SummaryCard label="Ticket promedio">
          {summary.average === null ? <span className="text-gray-500">—</span> : `$${formatMoney(summary.average)}`}
        </SummaryCard>
        <SummaryCard label={`Vs. ${monthName(previousMonth(month))}`}>
          <SpendingVariation value={variation} />
        </SummaryCard>
      </div>

      <section aria-labelledby="chart-title" className="card p-4">
        <h2 id="chart-title" className="mb-3 text-lg font-bold">Últimos 6 meses</h2>
        <SpendingChart months={lastMonthsTotals(purchases, month, 6)} selected={month} onSelect={setMonth} />
      </section>

      {summary.count === 0 ? (
        <EmptyMessage text="Todavía no compraste este mes" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SpendingBreakdown title="Por comercio" rows={byStore(purchases, month)} />
          <SpendingBreakdown title="Por medio de pago" rows={byPayment(purchases, month)} />
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="card min-w-0 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-bold wrap-anywhere sm:text-xl">{children}</p>
    </div>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <div className="py-12 text-center">
      <p className="mb-4 text-lg text-gray-500">{text}</p>
      <Link href="/cart" className="btn-secondary">Ir al carrito</Link>
    </div>
  );
}
