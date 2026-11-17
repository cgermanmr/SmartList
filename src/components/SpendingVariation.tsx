import { formatPct } from '@/lib/format';

/** Colores del carrito: más caro en rojo, más barato en verde, igual en azul */
const VARIATION_CLASS = { more: 'text-red-600', less: 'text-green-600', same: 'text-blue-600' };

/**
 * Variación del gasto contra el mes anterior: "X % más", "X % menos" o "Igual" (menos de 0,05 % de diferencia),
 * seguida de `suffix` (" que octubre"); "—" si no hay variación
 */
export default function SpendingVariation({ value, suffix = '' }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-gray-500">—</span>;
  const status = Math.abs(value) < 0.05 ? 'same' : value > 0 ? 'more' : 'less';
  const text = status === 'same' ? 'Igual' : `${formatPct(Math.abs(value))} ${status === 'more' ? 'más' : 'menos'}`;
  return <span className={`font-semibold ${VARIATION_CLASS[status]}`}>{text}{suffix}</span>;
}
