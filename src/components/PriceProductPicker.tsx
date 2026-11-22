'use client';

import { Ref, useId, useRef, useState } from 'react';
import { formatSize } from '@/lib/format';
import { Product } from '@/lib/models';
import { productImageSrc } from '@/lib/photo';
import { PriceProductChoice } from '@/lib/price-form';
import { getSepaProduct, sepaEnabled, SepaProduct, suggestedName } from '@/lib/sepa';
import { filterProducts, useStore } from '@/lib/store';
import PhotoField from './PhotoField';
import ProductImage from './ProductImage';
import ScanButton from './ScanButton';
import SepaResults from './SepaResults';
import { useProductPhotos } from './useProductPhotos';
import { useSepaImages } from './useSepaImages';
import { useSepaSearch } from './useSepaSearch';

const LINK_CLASS = 'inline-flex min-h-11 items-center px-1 text-sm font-semibold text-primary-700 underline underline-offset-2 hover:text-primary-800';
const OWN_LIMIT = 5;

// ── Código leído (o de la URL) ─────────────────────────────

/** Consulta de un código que no es de un producto propio: buscando, fuera del catálogo, falló o sin Supabase */
export interface EanLookup {
  ean: string;
  status: 'loading' | 'missing' | 'failed' | 'off';
}

/**
 * Resuelve un código como en la tabla de la spec 26: propio → ese producto; en Precios Claros → caso A; fuera del
 * catálogo, si falla la consulta o sin Supabase → caso B. Una respuesta vieja (otro código leído, o `cancel` porque
 * se editó el buscador o se cambió el producto) se descarta
 */
export function useEanLookup(onChoice: (choice: PriceProductChoice | null) => void) {
  const [lookup, setLookup] = useState<EanLookup | null>(null);
  const pending = useRef<string | null>(null);

  function resolve(ean: string) {
    const own = useStore.getState().products.find(p => p.ean === ean);
    if (own) {
      pending.current = null;
      setLookup(null);
      onChoice({ kind: 'own', product: own });
      return;
    }
    const unknown: PriceProductChoice = { kind: 'new', ean, name: '', brand: '' };
    if (!sepaEnabled) {
      pending.current = null;
      setLookup({ ean, status: 'off' });
      onChoice(unknown);
      return;
    }
    pending.current = ean;
    setLookup({ ean, status: 'loading' });
    onChoice(null);
    getSepaProduct(ean).then(
      sepa => {
        if (pending.current !== ean) return;
        pending.current = null;
        setLookup(sepa ? null : { ean, status: 'missing' });
        onChoice(sepa ? { kind: 'sepa', sepa } : unknown);
      },
      () => {
        if (pending.current !== ean) return;
        pending.current = null;
        setLookup({ ean, status: 'failed' });
        onChoice(unknown);
      },
    );
  }

  function cancel() {
    pending.current = null;
    setLookup(null);
  }

  return { lookup, resolve, cancel };
}

// ── Bloque del producto ────────────────────────────────────

interface Props {
  value: PriceProductChoice | null;
  onChange: (choice: PriceProductChoice | null) => void;
  lookup: EanLookup | null;
  onScan: (ean: string) => void;
  /** Se editó el buscador o se cambió el producto: descarta la consulta de un código en curso */
  onCancelLookup: () => void;
  /** "Elegí el producto" al guardar sin producto */
  error?: string;
  /** "Completá el nombre" en los casos B y C */
  nameError?: string;
  /** Buscador (sin producto) o campo Nombre (casos B y C): Cargar precio lo enfoca ante un error o al guardar */
  inputRef?: Ref<HTMLInputElement>;
}

function details(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' · ');
}

function productDetails(product: Product): string {
  const size = product.size !== undefined && product.sizeUnit ? formatSize(product.size, product.sizeUnit) : null;
  return details([product.brand, size]);
}

function sepaDetails(product: SepaProduct): string {
  const size = product.size !== null && product.sizeUnit ? formatSize(product.size, product.sizeUnit) : null;
  return details([product.brand, size]);
}

/**
 * Bloque "Producto" de Cargar precio (spec 26): un buscador de los propios y de Precios Claros, el lector y "No tiene
 * código de barras". Nada se crea al elegir: el producto se resuelve al guardar
 */
export default function PriceProductPicker(props: Props) {
  const { value, onChange, onCancelLookup } = props;
  const titleId = useId();

  function change() {
    onCancelLookup();
    onChange(null);
  }

  return (
    <section aria-labelledby={titleId} className="card p-4">
      {value === null
        ? <ProductSearch {...props} titleId={titleId} />
        : (
          <>
            <h2 id={titleId} className="font-semibold mb-2">Producto *</h2>
            {value.kind === 'new'
              ? <NewProductFields {...props} value={value} onChangeProduct={change} />
              : <ChosenProduct choice={value} onChangeProduct={change} />}
          </>
        )}
    </section>
  );
}

function ProductSearch({ onChange, lookup, onScan, onCancelLookup, error, inputRef, titleId }: Props & { titleId: string }) {
  const products = useStore(s => s.products);
  const [query, setQuery] = useState('');
  const errorId = useId();
  const text = query.trim();
  const own = text ? filterProducts(products, text).slice(0, OWN_LIMIT) : [];
  const sepaSearch = useSepaSearch(text);
  const ownEans = new Set(products.map(p => p.ean));
  const catalog = { ...sepaSearch, results: sepaSearch.results.filter(r => !ownEans.has(r.ean)) };
  const images = useSepaImages(own.map(p => p.ean));
  // La foto propia va antes que la del catálogo (spec 27)
  const photoUrl = useProductPhotos(own);
  const searching = lookup?.status === 'loading';

  return (
    <>
      <label id={titleId} htmlFor={`${titleId}-search`} className="block font-semibold mb-2">Producto *</label>
      <div className="flex gap-2">
        <input
          id={`${titleId}-search`}
          ref={inputRef}
          type="search"
          value={query}
          onChange={e => { setQuery(e.target.value); onCancelLookup(); }}
          placeholder="Buscá un producto"
          autoComplete="off"
          enterKeyHint="search"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="input-field min-w-0 flex-1"
        />
        <ScanButton onDetected={ean => { setQuery(''); onScan(ean); }} />
      </div>
      {error && <p id={errorId} role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
      <div role="status">
        {searching && <p className="mt-2 text-sm text-gray-600">Buscando el código…</p>}
      </div>
      <button type="button" onClick={() => { onCancelLookup(); onChange({ kind: 'new', name: query.trim(), brand: '' }); }}
        className={LINK_CLASS}>
        No tiene código de barras
      </button>

      {own.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-sm font-semibold text-gray-700">Tus productos</p>
          <ul className="rounded-xl border border-gray-200 divide-y divide-gray-200 overflow-hidden">
            {own.map(product => (
              <li key={product.id}>
                <button type="button" onClick={() => onChange({ kind: 'own', product })} className="list-row">
                  <ProductImage src={productImageSrc(product, photoUrl(product), product.ean ? images.get(product.ean) : undefined)} name={product.name} size={48} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold break-words">{product.name}</span>
                    {productDetails(product) && (
                      <span className="block text-sm text-gray-600 break-words">{productDetails(product)}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sepaEnabled && catalog.status !== 'idle' && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-gray-700">En Precios Claros</p>
          <SepaResults
            search={catalog}
            renderItem={(product, info) => (
              <button type="button" onClick={() => onChange({ kind: 'sepa', sepa: product })} className="list-row">
                {info}
              </button>
            )}
          />
        </div>
      )}
    </>
  );
}

/** Producto elegido: propio o del catálogo (caso A) */
function ChosenProduct({ choice, onChangeProduct }: {
  choice: Extract<PriceProductChoice, { kind: 'own' | 'sepa' }>;
  onChangeProduct: () => void;
}) {
  // Del catálogo, el nombre con el que se va a crear (productFromSepa)
  const name = choice.kind === 'own' ? choice.product.name : suggestedName(choice.sepa);
  const ean = choice.kind === 'own' ? choice.product.ean : choice.sepa.ean;
  const images = useSepaImages([ean]);
  const photoUrl = useProductPhotos(choice.kind === 'own' ? [choice.product] : []);
  const catalogSrc = ean ? images.get(ean) : undefined;
  const src = choice.kind === 'own' ? productImageSrc(choice.product, photoUrl(choice.product), catalogSrc) : catalogSrc;
  const info = choice.kind === 'own' ? productDetails(choice.product) : sepaDetails(choice.sepa);

  return (
    <div className="flex items-center gap-3 rounded-xl bg-primary-50 px-3 py-2">
      <ProductImage src={src} name={name} size={48} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold break-words">{name}</span>
        {info && <span className="block text-sm text-gray-600 break-words">{info}</span>}
        {choice.kind === 'sepa' && <span className="block text-xs font-semibold text-primary-700">Precios Claros</span>}
      </span>
      <button type="button" onClick={onChangeProduct} aria-label={`Cambiar el producto ${name}`}
        className={`${LINK_CLASS} shrink-0`}>
        Cambiar
      </button>
    </div>
  );
}

/** Casos B (con código) y C (sin código): Nombre (obligatorio), Marca y Foto (opcionales) */
function NewProductFields({ value, onChange, lookup, nameError, inputRef, onChangeProduct }: Props & {
  value: Extract<PriceProductChoice, { kind: 'new' }>;
  onChangeProduct: () => void;
}) {
  const id = useId();
  const note = value.ean && lookup?.ean === value.ean
    ? lookup.status === 'missing' ? `El código ${value.ean} no está en Precios Claros.`
      : lookup.status === 'failed' ? 'No se pudo consultar Precios Claros.'
        : null
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-gray-600 break-words">
          {value.ean ? <>Código <span className="tabular-nums">{value.ean}</span></> : 'Sin código de barras'}
        </p>
        <button type="button" onClick={onChangeProduct} aria-label="Cambiar el producto" className={`${LINK_CLASS} shrink-0`}>
          Cambiar
        </button>
      </div>
      {note && <p role="status" className="text-sm text-gray-700">{note}</p>}
      <div>
        <label htmlFor={`${id}-name`} className="mb-1 block text-sm text-gray-600">Nombre</label>
        <input id={`${id}-name`} ref={inputRef} type="text" value={value.name} autoComplete="off"
          placeholder="Ej: Alfajor de maicena"
          onChange={e => onChange({ ...value, name: e.target.value })}
          aria-invalid={nameError ? true : undefined} aria-describedby={nameError ? `${id}-error` : undefined}
          className="input-field" />
        {nameError && <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-700">{nameError}</p>}
      </div>
      <div>
        <label htmlFor={`${id}-brand`} className="mb-1 block text-sm text-gray-600">
          Marca <span className="text-gray-500">(opcional)</span>
        </label>
        <input id={`${id}-brand`} type="text" value={value.brand} autoComplete="off" placeholder="Ej: La Luna"
          onChange={e => onChange({ ...value, brand: e.target.value })} className="input-field" />
      </div>
      <PhotoField
        value={value.photo ?? null}
        productName={value.name}
        onChange={photo => onChange({ ...value, photo: photo ?? undefined })}
      />
    </div>
  );
}
