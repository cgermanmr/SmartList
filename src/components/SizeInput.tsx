import { Unit } from '@/lib/models';
import { ProductForm, SIZE_UNITS } from '@/lib/product-form';

interface Props {
  id: string;
  size: string;
  unit: Unit;
  onChange: (patch: Partial<Pick<ProductForm, 'size' | 'sizeUnit'>>) => void;
}

/** Presentación de un producto: número y unidad */
export default function SizeInput({ id, size, unit, onChange }: Props) {
  return (
    <div className="flex gap-2">
      <input
        id={id}
        value={size}
        onChange={e => onChange({ size: e.target.value })}
        type="number"
        step="any"
        min="0"
        inputMode="decimal"
        placeholder="Ej: 500"
        className="input-field min-w-0 flex-1"
      />
      <select
        value={unit}
        onChange={e => onChange({ sizeUnit: e.target.value as Unit })}
        aria-label="Unidad de la presentación"
        className="input-field w-24 shrink-0">
        {SIZE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
      </select>
    </div>
  );
}
