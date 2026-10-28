'use client';

import { useMemo } from 'react';
import { formatMoney, formatNumber } from '@/lib/format';
import { uniqueId } from '@/lib/ids';
import { Magnitude, Presentation, Promo, PromoType, Unit } from '@/lib/models';
import { useStore } from '@/lib/store';
import { DEFAULT_UNIT, UNITS_BY_MAGNITUDE, compare } from '@/lib/unit-price';

const MIN_PRESENTATIONS = 2;
const MAX_PRESENTATIONS = 6;

// Unidad de referencia del precio normalizado
const BASE_UNIT: Record<Magnitude, string> = {
  peso:     'kg',
  volumen:  'l',
  unidades: 'u',
};

const MAGNITUDES: { value: Magnitude; icon: string; label: string }[] = [
  { value: 'peso',     icon: '⚖️', label: 'Peso'     },
  { value: 'volumen',  icon: '🧴', label: 'Volumen'  },
  { value: 'unidades', icon: '📦', label: 'Unidades' },
];

const PROMO_TYPES: { value: PromoType; label: string }[] = [
  { value: 'ninguna',   label: 'Sin promoción'          },
  { value: 'nxm',       label: 'Llevá N, pagá M (3x2)'  },
  { value: 'enesima',   label: '% en la N-ésima unidad' },
  { value: 'descuento', label: '% de descuento'         },
];

const LABEL_CLASS = 'block text-sm font-semibold text-gray-600 mb-1';

/** Valor de un input numérico: vacío o inválido → null */
function toNumberOrNull(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

type NullableFieldProps = {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  inputMode: 'decimal' | 'numeric';
  min: string;
  max?: string;
  step: string;
  placeholder: string;
};

function NullableNumberField({ id, label, value, onChange, ...rest }: NullableFieldProps) {
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>{label}</label>
      <input
        id={id}
        type="number"
        value={value ?? ''}
        onChange={e => onChange(toNumberOrNull(e.target.value))}
        className="input-field"
        {...rest}
      />
    </div>
  );
}

export default function CalculatorPage() {
  const state = useStore(s => s.calculator);
  const saveCalculator = useStore(s => s.saveCalculator);
  const resetCalculator = useStore(s => s.resetCalculator);

  const results = useMemo(() => new Map(compare(state.presentations).map(r => [r.id, r])), [state.presentations]);
  const units: Unit[] = UNITS_BY_MAGNITUDE[state.magnitude];
  const baseUnit = BASE_UNIT[state.magnitude];
  const canAdd = state.presentations.length < MAX_PRESENTATIONS;
  const canRemove = state.presentations.length > MIN_PRESENTATIONS;

  // ── Formulario ────────────────────────────────────────────
  function setMagnitude(magnitude: Magnitude) {
    if (magnitude === state.magnitude) return;
    const unit = DEFAULT_UNIT[magnitude];
    saveCalculator({ magnitude, presentations: state.presentations.map(p => ({ ...p, unit })) });
  }

  function updatePresentation(id: string, patch: Partial<Presentation>) {
    saveCalculator({ ...state, presentations: state.presentations.map(p => p.id === id ? { ...p, ...patch } : p) });
  }

  function updatePromo(p: Presentation, patch: Partial<Promo>) {
    updatePresentation(p.id, { promo: { ...p.promo, ...patch } });
  }

  function addPresentation() {
    if (!canAdd) return;
    saveCalculator({
      ...state,
      presentations: [...state.presentations, {
        id: uniqueId(),
        label: '',
        price: null,
        quantity: null,
        unit: DEFAULT_UNIT[state.magnitude],
        promo: { type: 'ninguna', take: null, pay: null, nth: null, percent: null },
      }],
    });
  }

  function removePresentation(id: string) {
    if (!canRemove) return;
    saveCalculator({ ...state, presentations: state.presentations.filter(p => p.id !== id) });
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">🧮 Calculadora de precio unitario</h1>
      <p className="text-gray-600 mb-6">Compará presentaciones del mismo producto por precio por kg, litro o unidad.</p>

      {/* Magnitud */}
      <div className="mb-6">
        <span id="magnitude-label" className="block font-semibold mb-2">¿Qué vas a comparar?</span>
        <div role="group" aria-labelledby="magnitude-label" className="grid grid-cols-3 gap-2">
          {MAGNITUDES.map(m => {
            const active = state.magnitude === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setMagnitude(m.value)}
                aria-pressed={active}
                className={`flex flex-col items-center px-2 py-2 rounded-lg border font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary-200 ${
                  active ? 'bg-primary-700 text-white border-primary-700' : 'bg-white text-gray-700 border-gray-300'
                }`}>
                <span aria-hidden="true">{m.icon}</span>
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Presentaciones */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">Presentaciones</h2>
        <button
          type="button"
          onClick={resetCalculator}
          className="px-3 py-1 rounded-lg text-sm font-semibold text-primary-700 hover:bg-primary-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-200">
          ↺ Nueva comparación
        </button>
      </div>

      <div className="space-y-4 mb-4">
        {state.presentations.map((p, i) => {
          const r = results.get(p.id);
          return (
            <div key={p.id} className={`card p-4 ${r?.isBest ? 'border-green-500 ring-2 ring-green-200' : ''}`}>
              <div className="flex items-center gap-2 mb-3">
                <label htmlFor={`label-${p.id}`} className="sr-only">Nombre de la presentación {i + 1}</label>
                <input
                  id={`label-${p.id}`}
                  value={p.label}
                  onChange={e => updatePresentation(p.id, { label: e.target.value })}
                  type="text"
                  placeholder={`Presentación ${i + 1}`}
                  className="input-field font-semibold"
                />
                <button
                  type="button"
                  onClick={() => removePresentation(p.id)}
                  disabled={!canRemove}
                  aria-label={`Quitar presentación ${i + 1}`}
                  className="shrink-0 w-10 h-10 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500 disabled:cursor-not-allowed">
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <NullableNumberField
                  id={`price-${p.id}`} label="Precio ($)" value={p.price}
                  onChange={price => updatePresentation(p.id, { price })}
                  inputMode="decimal" min="0" step="any" placeholder="0"
                />
                <NullableNumberField
                  id={`quantity-${p.id}`} label="Cantidad" value={p.quantity}
                  onChange={quantity => updatePresentation(p.id, { quantity })}
                  inputMode="decimal" min="0" step="any" placeholder="0"
                />
                <div>
                  <label htmlFor={`unit-${p.id}`} className={LABEL_CLASS}>Unidad</label>
                  <select
                    id={`unit-${p.id}`}
                    value={p.unit}
                    onChange={e => updatePresentation(p.id, { unit: e.target.value as Unit })}
                    className="input-field">
                    {units.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              {/* Promoción */}
              <div className="mt-3">
                <label htmlFor={`promo-${p.id}`} className={LABEL_CLASS}>Promoción</label>
                <select
                  id={`promo-${p.id}`}
                  value={p.promo.type}
                  onChange={e => updatePromo(p, { type: e.target.value as PromoType })}
                  className="input-field">
                  {PROMO_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {p.promo.type === 'nxm' && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <NullableNumberField
                    id={`take-${p.id}`} label="Llevás" value={p.promo.take}
                    onChange={take => updatePromo(p, { take })}
                    inputMode="numeric" min="2" step="1" placeholder="3"
                  />
                  <NullableNumberField
                    id={`pay-${p.id}`} label="Pagás" value={p.promo.pay}
                    onChange={pay => updatePromo(p, { pay })}
                    inputMode="numeric" min="1" step="1" placeholder="2"
                  />
                </div>
              )}

              {p.promo.type === 'enesima' && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <NullableNumberField
                    id={`nth-${p.id}`} label="En la unidad N°" value={p.promo.nth}
                    onChange={nth => updatePromo(p, { nth })}
                    inputMode="numeric" min="2" step="1" placeholder="2"
                  />
                  <NullableNumberField
                    id={`nth-percent-${p.id}`} label="Descuento (%)" value={p.promo.percent}
                    onChange={percent => updatePromo(p, { percent })}
                    inputMode="decimal" min="0" max="100" step="any" placeholder="70"
                  />
                </div>
              )}

              {p.promo.type === 'descuento' && (
                <div className="mt-2">
                  <NullableNumberField
                    id={`percent-${p.id}`} label="Descuento (%)" value={p.promo.percent}
                    onChange={percent => updatePromo(p, { percent })}
                    inputMode="decimal" min="0" max="100" step="any" placeholder="20"
                  />
                </div>
              )}

              {/* Resultado */}
              {r && (
                <div aria-live="polite" className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                  {r.unitPrice !== null ? (
                    <>
                      <p className={`text-xl font-bold ${r.isBest ? 'text-green-700' : 'text-gray-800'}`}>
                        ${formatMoney(r.unitPrice)}<span className="text-sm font-semibold text-gray-500">/{baseUnit}</span>
                        {r.lotUnits > 1 && <span className="block text-sm font-normal text-gray-500">llevando {r.lotUnits}</span>}
                      </p>
                      {r.isBest && (
                        <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 text-sm font-semibold">
                          ✓ Más conveniente
                        </span>
                      )}
                      {r.diffPercent !== null && (
                        <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-sm font-semibold">
                          +{formatNumber(r.diffPercent, 0, 2)} %
                        </span>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">Completar datos</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addPresentation}
        disabled={!canAdd}
        className="btn-secondary w-full disabled:opacity-50 disabled:cursor-not-allowed">
        + Agregar presentación
      </button>
      {!canAdd && <p className="text-sm text-gray-500 text-center mt-2">Máximo 6 presentaciones.</p>}
    </div>
  );
}
