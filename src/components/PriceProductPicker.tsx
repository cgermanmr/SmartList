'use client';

import { CirclePlus } from 'lucide-react';
import { Ref, useId, useRef, useState } from 'react';
import { formatSize } from '@/lib/format';
import { toGtin13 } from '@/lib/gtin';
import { Product } from '@/lib/models';
import { PhotoDraft, productImageSrc } from '@/lib/photo';
import { manualOffer, manualProductForm, PriceProductChoice } from '@/lib/price-form';
import { ProductForm } from '@/lib/product-form';
import { getSepaProduct, sepaEnabled, SepaProduct, suggestedName } from '@/lib/sepa';
import { filterProducts, useStore } from '@/lib/store';
import ManualProductFields, { ManualEanError } from './ManualProductFields';
import ProductImage from './ProductImage';
import ScanButton from './ScanButton';
import SepaResults from './SepaResults';
import { EanAnswer } from './useManualEan';
import { useProductPhotos } from './useProductPhotos';
import { useSepaImages } from './useSepaImages';
import { SepaSearchState, useSepaSearch } from './useSepaSearch';

const LINK_CLASS = 'inline-flex min-h-11 items-center px-1 text-left text-sm font-semibold text-primary-700 underline underline-offset-2 hover:text-primary-800';
const OWN_LIMIT = 5;

// ── Código leído (o de la URL) ─────────────────────────────

/**
 * Resuelve un código: propio → ese producto; en Precios Claros → caso A; fuera del catálogo, si falla la consulta o sin
 * Supabase → el formulario con el código (spec 34), con la respuesta para no consultarlo otra vez. Una respuesta vieja
 * (otro código leído, o `cancel` porque se editó el buscador o se cambió el producto) se descarta
 */
export function useEanLookup(onChoice: (choice: PriceProductChoice | null, answer: EanAnswer | null) => void) {
  const [searching, setSearching] = useState(false);
  const pending = useRef<string | null>(null);

  function finish(choice: PriceProductChoice, answer: EanAnswer | null) {
    pending.current = null;
    setSearching(false);
    onChoice(choice, answer);
  }

  function resolve(ean: string) {
    const own = useStore.getState().products.find(p => p.ean === ean);
    if (own) return finish({ kind: 'own', product: own }, null);
    const unknown: PriceProductChoice = { kind: 'new', form: manualProductForm(ean) };
    if (!sepaEnabled) return finish(unknown, null);
    pending.current = ean;
    setSearching(true);
    onChoice(null, null);
    getSepaProduct(ean).then(
      sepa => {
        if (pending.current !== ean) return;
        if (sepa) finish({ kind: 'sepa', sepa }, null);
        else finish(unknown, { ean, status: 'missing' });
      },
      () => { if (pending.current === ean) finish(unknown, { ean, status: 'failed' }); },
    );
  }

  function cancel() {
    pending.current = null;
    setSearching(false);
  }

  return { searching, resolve, cancel };
}

// ── Bloque del producto ────────────────────────────────────

interface Props {
  value: PriceProductChoice | null;
  /** Elegido de la lista o con "Usar este producto" */
  onChoose: (choice: PriceProductChoice) => void;
  /** "Cambiar": vuelve al buscador */
  onChangeProduct: () => void;
  /** Texto del buscador: se conserva mientras hay un producto elegido */
  query: string;
  onQueryChange: (query: string) => void;
  /** Hay un código leído consultándose */
  searching: boolean;
  onScan: (ean: string) => void;
  /** "Cargar … a mano", con lo que el buscador ya averiguó del código */
  onManual: (form: ProductForm, answer: EanAnswer | null) => void;
  /** Lo que se sabe del código del producto nuevo al abrir el formulario */
  knownEan: EanAnswer | null;
  onEditForm: (patch: Partial<ProductForm>) => void;
  onPhoto: (photo: PhotoDraft | null) => void;
  onUse: (choice: PriceProductChoice) => void;
  /** "Elegí el producto" al guardar sin producto */
  error?: string;
  nameError?: string;
  eanError?: ManualEanError;
  /** Buscador (sin producto) o campo Nombre (producto nuevo): Cargar precio lo enfoca */
  inputRef?: Ref<HTMLInputElement>;
  eanRef?: Ref<HTMLInputElement>;
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
 * Bloque "Producto" de Cargar precio (spec 26): un buscador de los propios y de Precios Claros, el lector y, cuando no
 * está, "Cargar … a mano" (spec 34). Nada se crea al elegir: el producto se resuelve al guardar
 */
export default function PriceProductPicker(props: Props) {
  const { value, query, onChangeProduct } = props;
  const titleId = useId();
  // Acá y no en ProductSearch: al volver con "Cambiar", los resultados siguen
  const sepaSearch = useSepaSearch(query);

  if (value === null) {
    return (
      <section aria-labelledby={titleId} className="card p-4">
        <ProductSearch {...props} sepaSearch={sepaSearch} titleId={titleId} />
      </section>
    );
  }

  return (
    <section aria-labelledby={titleId} className="card p-4">
      {value.kind === 'new' ? (
        <>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 id={titleId} className="font-semibold">Producto nuevo</h2>
            <button type="button" onClick={onChangeProduct} aria-label="Cambiar el producto" className={`${LINK_CLASS} shrink-0`}>
              Cambiar
            </button>
          </div>
          <ManualProductFields value={value} known={props.knownEan} onEdit={props.onEditForm} onPhoto={props.onPhoto}
            onUse={props.onUse} nameError={props.nameError} eanError={props.eanError}
            nameRef={props.inputRef} eanRef={props.eanRef} />
        </>
      ) : (
        <>
          <h2 id={titleId} className="font-semibold mb-2">Producto *</h2>
          <ChosenProduct choice={value} onChangeProduct={onChangeProduct} />
        </>
      )}
    </section>
  );
}

/** Lo que la búsqueda ya averiguó de un texto que es un código; null si no es un código o no se consultó */
function answerFromSearch(query: string, search: SepaSearchState): EanAnswer | null {
  const ean = toGtin13(query.trim());
  if (!ean) return null;
  if (search.status === 'error') return { ean, status: 'failed' };
  if (search.status !== 'done') return null;
  const sepa = search.results.find(r => r.ean === ean);
  return sepa ? { ean, status: 'sepa', sepa } : { ean, status: 'missing' };
}

function ProductSearch({
  query, onQueryChange, onChoose, searching, onScan, onManual, error, inputRef, sepaSearch, titleId,
}: Props & { sepaSearch: SepaSearchState; titleId: string }) {
  const products = useStore(s => s.products);
  const errorId = useId();
  const text = query.trim();
  const own = text ? filterProducts(products, text).slice(0, OWN_LIMIT) : [];
  const ownEans = new Set(products.map(p => p.ean));
  const catalog = { ...sepaSearch, results: sepaSearch.results.filter(r => !ownEans.has(r.ean)) };
  const offer = searching ? null : manualOffer({
    query,
    ownCount: own.length,
    catalog: { status: catalog.status, count: catalog.results.length },
    catalogEnabled: sepaEnabled,
  });
  const images = useSepaImages(own.map(p => p.ean));
  // La foto propia va antes que la del catálogo (spec 27)
  const photoUrl = useProductPhotos(own);

  function openManual() {
    onManual(manualProductForm(query), answerFromSearch(query, sepaSearch));
  }

  return (
    <>
      <label id={titleId} htmlFor={`${titleId}-search`} className="block font-semibold mb-2">Producto *</label>
      <div className="flex gap-2">
        <input
          id={`${titleId}-search`}
          ref={inputRef}
          type="search"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder="Buscá un producto"
          autoComplete="off"
          enterKeyHint="search"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="input-field min-w-0 flex-1"
        />
        <ScanButton onDetected={onScan} />
      </div>
      {error && <p id={errorId} role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
      <div role="status">
        {searching && <p className="mt-2 text-sm text-gray-600">Buscando el código…</p>}
      </div>
      {own.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-sm font-semibold text-gray-700">Tus productos</p>
          <ul className="rounded-xl border border-gray-200 divide-y divide-gray-200 overflow-hidden">
            {own.map(product => (
              <li key={product.id}>
                <button type="button" onClick={() => onChoose({ kind: 'own', product })} className="list-row">
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

      {sepaEnabled && catalog.status !== 'idle' && !offer?.prominent && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-gray-700">En Precios Claros</p>
          <SepaResults
            search={catalog}
            renderItem={(product, info) => (
              <button type="button" onClick={() => onChoose({ kind: 'sepa', sepa: product })} className="list-row">
                {info}
              </button>
            )}
          />
        </div>
      )}

      {/* Queda montada para que el mensaje se anuncie */}
      <div role="status">
        {offer?.message && <p className="mt-3 text-sm text-gray-700 wrap-anywhere">{offer.message}</p>}
      </div>
      {offer?.prominent && (
        <button type="button" onClick={openManual}
          className="btn-secondary mt-2 flex w-full items-center justify-center gap-2">
          <CirclePlus aria-hidden="true" className="size-5 shrink-0" />
          <span className="min-w-0 wrap-anywhere">{offer.label}</span>
        </button>
      )}
      {offer && !offer.prominent && (
        <button type="button" onClick={openManual} className={`${LINK_CLASS} mt-2 wrap-anywhere`}>{offer.label}</button>
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
