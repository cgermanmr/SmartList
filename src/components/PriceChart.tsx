import { formatDayMonth, formatMoney, formatNumber } from '@/lib/format';
import { Price } from '@/lib/models';

const W = 480, H = 180;
const padL = 52, padR = 16, padT = 16, padB = 32;
const cW = W - padL - padR;
const cH = H - padT - padB;

/** Gráfico de tendencia en SVG propio. `prices` viene del más reciente al más antiguo. */
export default function PriceChart({ prices }: { prices: Price[] }) {
  const sorted = [...prices].reverse(); // cronológico
  const amounts = sorted.map(p => p.amount);
  const minVal = Math.min(...amounts);
  const maxVal = Math.max(...amounts);
  const range = maxVal - minVal || 1;

  const points = sorted.map((p, i) => ({
    id: p.id,
    x: padL + (sorted.length === 1 ? cW / 2 : (i / (sorted.length - 1)) * cW),
    y: padT + cH - ((p.amount - minVal) / range) * cH,
    price: p.amount,
    label: formatDayMonth(p.date),
  }));

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');
  const areaPath = [
    `M${points[0].x},${points[0].y}`,
    ...points.slice(1).map(p => `L${p.x},${p.y}`),
    `L${points[points.length - 1].x},${padT + cH}`,
    `L${points[0].x},${padT + cH}`,
    'Z',
  ].join(' ');

  // etiquetas eje X: primera, media, última
  const xLabels = [
    points[0],
    points[Math.floor((points.length - 1) / 2)],
    points[points.length - 1],
  ].filter((v, i, a) => a.indexOf(v) === i);

  // líneas guía horizontales (3 niveles)
  const gridY = [0, 0.5, 1].map(f => padT + cH - f * cH);
  const gridLabels = [minVal, Math.round((minVal + maxVal) / 2), maxVal];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 180 }} xmlns="http://www.w3.org/2000/svg"
         role="img" aria-label={`Evolución del precio: de $${formatMoney(amounts[0])} a $${formatMoney(amounts[amounts.length - 1])}`}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0f766e" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#0f766e" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Líneas guía horizontales y etiquetas eje Y */}
      {gridY.map((gy, gi) => (
        <g key={gi}>
          <line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="#e5e7eb" strokeWidth="1" />
          <text x={padL - 6} y={gy + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
            ${formatNumber(gridLabels[gi], 0)}
          </text>
        </g>
      ))}

      {/* Área rellena */}
      <path d={areaPath} fill="url(#areaGrad)" />

      {/* Línea */}
      <polyline points={polyline} fill="none" stroke="#0f766e" strokeWidth="2.5"
                strokeLinejoin="round" strokeLinecap="round" />

      {/* Puntos */}
      {points.map(pt => (
        <g key={pt.id}>
          <circle cx={pt.x} cy={pt.y} r="4" fill="white" stroke="#0f766e" strokeWidth="2" />
          <title>${formatMoney(pt.price)}</title>
        </g>
      ))}

      {/* Etiquetas eje X */}
      {xLabels.map(pt => (
        <text key={pt.id} x={pt.x} y={padT + cH + padB - 6} textAnchor="middle" fontSize="10" fill="#9ca3af">
          {pt.label}
        </text>
      ))}
    </svg>
  );
}
