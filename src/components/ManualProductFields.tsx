'use client';

import { Ref, useId } from 'react';
import { formatSize } from '@/lib/format';
import { PhotoDraft } from '@/lib/photo';
import { PriceProductChoice } from '@/lib/price-form';
import { ProductForm } from '@/lib/product-form';
import { SepaProduct, suggestedName } from '@/lib/sepa';
import CategoryInput from './CategoryInput';
import PhotoField from './PhotoField';
import ProductImage from './ProductImage';
import ScanButton from './ScanButton';
import SizeInput from './SizeInput';
import { EanAnswer, ManualEan, useManualEan } from './useManualEan';
import { useSepaImages } from './useSepaImages';

const LABEL_CLASS = 'mb-1 block text-sm text-gray-600';

/** Error del código al guardar: no es válido o ya es de un producto propio */
export type ManualEanError = 'invalid' | 'duplicate';

interface Props {
  value: Extract<PriceProductChoice, { kind: 'new' }>;
  /** Lo que el buscador o el lector ya averiguó del código */
  known: EanAnswer | null;
  onEdit: (patch: Partial<ProductForm>) => void;
  onPhoto: (photo: PhotoDraft | null) => void;
  /** "Usar este producto": el propio o el del catálogo que tiene el código */
  onUse: (choice: PriceProductChoice) => void;
  nameError?: string;
  eanError?: ManualEanError;
  nameRef?: Ref<HTMLInputElement>;
  eanRef?: Ref<HTMLInputElement>;
}

function Optional() {
  return <span className="text-gray-500">(opcional)</span>;
}

/** Producto nuevo de Cargar precio (spec 34): solo el nombre es obligatorio */
export default function ManualProductFields({
  value, known, onEdit, onPhoto, onUse, nameError, eanError, nameRef, eanRef,
}: Props) {
  const id = useId();
  const { form } = value;
  const { state, check } = useManualEan(form.ean, known, eanError === 'duplicate');
  const eanNoteId = `${id}-ean-note`;
  const eanErrorId = `${id}-ean-error`;
  const invalidEan = eanError === 'invalid';
  const hasNote = state.status !== 'idle';

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${id}-name`} className={LABEL_CLASS}>Nombre</label>
        <input id={`${id}-name`} ref={nameRef} type="text" value={form.name} autoComplete="off"
          placeholder="Ej: Alfajor de maicena"
          onChange={e => onEdit({ name: e.target.value })}
          aria-required="true"
          aria-invalid={nameError ? true : undefined} aria-describedby={nameError ? `${id}-name-error` : undefined}
          className="input-field" />
        {nameError && <p id={`${id}-name-error`} role="alert" className="mt-1 text-sm text-red-700">{nameError}</p>}
      </div>

      <div>
        <label htmlFor={`${id}-ean`} className={LABEL_CLASS}>Código de barras <Optional /></label>
        <div className="flex gap-2">
          <input id={`${id}-ean`} ref={eanRef} type="text" inputMode="numeric" autoComplete="off" value={form.ean}
            placeholder="Ej: 7793704000911"
            onChange={e => onEdit({ ean: e.target.value })}
            aria-invalid={invalidEan || state.status === 'own' ? true : undefined}
            aria-describedby={invalidEan ? eanErrorId : hasNote ? eanNoteId : undefined}
            className="input-field min-w-0 flex-1" />
          <ScanButton onDetected={ean => { onEdit({ ean }); check(ean); }} />
        </div>
        {invalidEan && <p id={eanErrorId} role="alert" className="mt-1 text-sm text-red-700">Código de barras inválido</p>}
        <EanNote id={eanNoteId} state={state} onUse={onUse} />
      </div>

      <div>
        <label htmlFor={`${id}-brand`} className={LABEL_CLASS}>Marca <Optional /></label>
        <input id={`${id}-brand`} type="text" value={form.brand} autoComplete="off" placeholder="Ej: La Luna"
          onChange={e => onEdit({ brand: e.target.value })} className="input-field" />
      </div>

      <div>
        <label htmlFor={`${id}-size`} className={LABEL_CLASS}>Presentación <Optional /></label>
        <SizeInput id={`${id}-size`} size={form.size} unit={form.sizeUnit} onChange={onEdit} />
      </div>

      <div>
        <label htmlFor={`${id}-category`} className={LABEL_CLASS}>Categoría <Optional /></label>
        <CategoryInput id={`${id}-category`} value={form.category} onChange={category => onEdit({ category })} />
      </div>

      <PhotoField value={value.photo ?? null} productName={form.name} onChange={onPhoto} />
    </div>
  );
}

// ── Aviso del código ───────────────────────────────────────

function sepaDetails(product: SepaProduct): string {
  const size = product.size !== null && product.sizeUnit ? formatSize(product.size, product.sizeUnit) : null;
  return [product.brand, size].filter(Boolean).join(' · ');
}

/** Aviso junto al código y "Usar este producto". La región `status` queda montada para que se anuncie */
function EanNote({ id, state, onUse }: { id: string; state: ManualEan; onUse: Props['onUse'] }) {
  const images = useSepaImages(state.status === 'sepa' ? [state.ean] : []);
  const use: PriceProductChoice | null =
    state.status === 'own' ? { kind: 'own', product: state.product }
      : state.status === 'sepa' ? { kind: 'sepa', sepa: state.sepa }
        : null;
  const details = state.status === 'sepa' ? sepaDetails(state.sepa) : '';

  return (
    <>
      <div id={id} role="status">
        {state.status === 'own' && (
          <p className="mt-2 text-sm text-red-700 break-words">Ya tenés este producto: {state.product.name}</p>
        )}
        {state.status === 'loading' && <p className="mt-2 text-sm text-gray-600">Buscando el código…</p>}
        {state.status === 'missing' && (
          <p className="mt-2 text-sm text-gray-700">
            El código <span className="tabular-nums">{state.ean}</span> no está en Precios Claros.
          </p>
        )}
        {state.status === 'failed' && <p className="mt-2 text-sm text-gray-700">No se pudo consultar Precios Claros.</p>}
        {state.status === 'sepa' && (
          <div className="mt-2 flex items-center gap-3 rounded-xl bg-primary-50 px-3 py-2">
            <ProductImage src={images.get(state.ean)} name={suggestedName(state.sepa)} size={48} />
            <p className="min-w-0 flex-1 text-sm break-words">
              Este código está en Precios Claros: <span className="font-semibold">{suggestedName(state.sepa)}</span>
              {details && <span className="block text-gray-600">{details}</span>}
            </p>
          </div>
        )}
      </div>
      {use && (
        <button type="button" onClick={() => onUse(use)} className="btn-secondary mt-2">Usar este producto</button>
      )}
    </>
  );
}
