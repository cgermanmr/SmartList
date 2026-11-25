'use client';

import { Check, CirclePlus, Tag } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useEffectEvent, useRef, useState } from 'react';
import CategoryInput from '@/components/CategoryInput';
import DuplicateProduct from '@/components/DuplicateProduct';
import PhotoField from '@/components/PhotoField';
import ScanButton from '@/components/ScanButton';
import SepaSearch from '@/components/SepaSearch';
import SizeInput from '@/components/SizeInput';
import { toGtin13 } from '@/lib/gtin';
import { uniqueId } from '@/lib/ids';
import { PhotoDraft } from '@/lib/photo';
import { savePhoto } from '@/lib/photo-sync';
import { checkEan, EanCheck, EMPTY_PRODUCT_FORM, formFromSepa, productFromForm, ProductForm } from '@/lib/product-form';
import { getSepaProduct, SepaProduct, sepaEnabled } from '@/lib/sepa';
import { useStore } from '@/lib/store';
import PriceForm from './PriceForm';

type Message = { text: string; type: 'ok' | 'error' };
type EanError = Extract<EanCheck, { status: 'invalid' | 'duplicate' }>;

function tabClass(active: boolean) {
  return `inline-flex min-h-11 items-center gap-1.5 px-4 py-3 font-semibold text-gray-500 hover:text-primary-700 transition-colors ${active ? 'border-b-2 border-primary-700 text-primary-700' : ''}`;
}

export default function UploadForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const products = useStore(s => s.products);
  const addProduct = useStore(s => s.addProduct);

  const [activeTab, setActiveTab] = useState<'price' | 'product'>('price');
  const [productForm, setProductForm] = useState<ProductForm>(EMPTY_PRODUCT_FORM);
  // Foto elegida (spec 27): en memoria hasta guardar el producto
  const [photo, setPhoto] = useState<PhotoDraft | null>(null);
  const saving = useRef(false);
  const [eanError, setEanError] = useState<EanError | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const categoryInput = useRef<HTMLInputElement>(null);
  const eanInput = useRef<HTMLInputElement>(null);
  // Búsqueda en el catálogo de un código leído en Agregar producto; la ref descarta respuestas viejas
  const [scanLookup, setScanLookup] = useState<{ ean: string; failed: boolean } | null>(null);
  const pendingScan = useRef<string | null>(null);

  // ── /upload?tab=producto&ean=… ───────────────────────────
  // Next conserva la página montada entre navegaciones: los parámetros se aplican cuando cambian, no solo al abrir.
  // Un link a /upload sin parámetros no toca nada y deja lo que se estaba escribiendo.
  const opensProduct = searchParams.get('tab') === 'producto';
  const urlEan = opensProduct ? toGtin13(searchParams.get('ean') ?? '') : null;
  const urlTarget = opensProduct ? urlEan ?? '' : null;
  const [appliedTarget, setAppliedTarget] = useState<string | null>(null);
  const [lookup, setLookup] = useState<{ ean: string; failed: boolean } | null>(null);

  // /upload?tab=precio&ean=…&monto=… (spec 26): abre Cargar precio; el producto y el monto los aplica PriceForm
  const opensPrice = searchParams.get('tab') === 'precio';
  const priceTarget = opensPrice ? `${searchParams.get('ean') ?? ''}|${searchParams.get('monto') ?? ''}` : null;
  const [appliedPrice, setAppliedPrice] = useState<string | null>(null);

  if (priceTarget !== appliedPrice) {
    setAppliedPrice(priceTarget);
    if (opensPrice) setActiveTab('price');
  }

  if (urlTarget !== appliedTarget) {
    setAppliedTarget(urlTarget);
    if (opensProduct) {
      setActiveTab('product');
      setProductForm(form => ({ ...EMPTY_PRODUCT_FORM, category: form.category, ean: urlEan ?? '' }));
      setEanError(null);
      setPhoto(null);
    }
  }

  const applyCatalogProduct = useEffectEvent((product: SepaProduct) => selectSepaProduct(product));

  useEffect(() => {
    if (!urlEan || !sepaEnabled) return undefined;
    let stale = false;
    getSepaProduct(urlEan).then(
      product => {
        if (stale) return;
        setLookup({ ean: urlEan, failed: false });
        if (product) applyCatalogProduct(product);
      },
      () => { if (!stale) setLookup({ ean: urlEan, failed: true }); },
    );
    return () => { stale = true; };
  }, [urlEan]);

  const lookupFinished = lookup?.ean === urlEan;
  const scanState = scanLookup?.ean === productForm.ean ? scanLookup : null;
  const lookingUp = (urlEan !== null && sepaEnabled && !lookupFinished) || scanState?.failed === false;
  const lookupFailed = (lookupFinished && lookup.failed) || scanState?.failed === true;

  useEffect(() => () => clearTimeout(timer.current), []);

  function showMessage(text: string, type: Message['type']) {
    setMessage({ text, type });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 3000);
  }

  async function submitProduct(e: FormEvent) {
    e.preventDefault();
    if (saving.current) return;
    if (!productForm.name.trim()) {
      showMessage('Completá el nombre', 'error');
      return;
    }

    const check = checkEan(productForm.ean, products);
    if (check.status === 'invalid' || check.status === 'duplicate') {
      setEanError(check);
      eanInput.current?.focus();
      return;
    }

    const product = productFromForm(productForm, uniqueId(), check.status === 'ok' ? check.ean : undefined);
    // Spec 27: primero la foto en IndexedDB y después el producto con `photo`; si falla, el producto va sin foto
    let photoFailed = false;
    if (photo) {
      saving.current = true;
      try {
        product.photo = await savePhoto(photo.blob);
      } catch {
        photoFailed = true;
      } finally {
        saving.current = false;
      }
      URL.revokeObjectURL(photo.url);
    }
    addProduct(product);
    showMessage(photoFailed ? 'Producto agregado. No se pudo guardar la foto.' : 'Producto agregado exitosamente!', 'ok');
    setProductForm(EMPTY_PRODUCT_FORM);
    setPhoto(null);
    // Sin el ean en la URL, recargar no vuelve a completar el formulario con el producto recién guardado
    if (searchParams.has('ean')) router.replace('/upload?tab=producto', { scroll: false });
  }

  // ── Código leído con la cámara ─────────────────────────────

  /**
   * Agregar producto: propio → "Ya tenés este producto"; en el catálogo → completa el formulario como el
   * buscador; si no, queda solo el EAN.
   */
  function scannedForProduct(ean: string) {
    setProductForm(form => ({ ...form, ean }));
    const check = checkEan(ean, useStore.getState().products);
    if (check.status === 'duplicate') {
      setEanError(check);
      return;
    }
    setEanError(null);
    if (!sepaEnabled) return;
    pendingScan.current = ean;
    setScanLookup({ ean, failed: false });
    getSepaProduct(ean).then(
      product => {
        // Solo si no se leyó otro código ni se editó el campo mientras tanto
        if (pendingScan.current !== ean) return;
        pendingScan.current = null;
        setScanLookup(null);
        if (product) selectSepaProduct(product);
      },
      () => {
        if (pendingScan.current !== ean) return;
        pendingScan.current = null;
        setScanLookup({ ean, failed: true });
      },
    );
  }

  /** Completa el formulario con el resultado elegido; la categoría (opcional) es lo único que falta */
  function selectSepaProduct(product: SepaProduct) {
    setProductForm(form => formFromSepa(product, form.category));
    setEanError(null);
    categoryInput.current?.focus();
  }

  return (
    <div className="max-w-md mx-auto">

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button onClick={() => setActiveTab('price')} aria-pressed={activeTab === 'price'} className={tabClass(activeTab === 'price')}>
          <Tag aria-hidden="true" className="size-4" />
          Cargar Precio
        </button>
        <button onClick={() => setActiveTab('product')} aria-pressed={activeTab === 'product'} className={tabClass(activeTab === 'product')}>
          <CirclePlus aria-hidden="true" className="size-4" />
          Agregar Producto
        </button>
      </div>

      {/* Tab: Cargar precio. Queda montada al cambiar de pestaña: el comercio elegido se conserva */}
      <div hidden={activeTab !== 'price'}>
        <h1 className="text-2xl font-bold mb-6">Cargar precio</h1>
        <PriceForm />
      </div>

      {/* Tab: Agregar Producto */}
      {activeTab === 'product' && (
        <div>
          <h1 className="text-2xl font-bold mb-6">Agregar Producto</h1>

          {sepaEnabled && (
            <div className="mb-6 pb-6 border-b border-gray-200">
              <SepaSearch onSelect={selectSepaProduct} />
              {lookingUp && <p role="status" className="mt-2 text-sm text-gray-600">Buscando…</p>}
              {lookupFailed && (
                <p role="alert" className="mt-2 text-sm text-red-700">No se pudo consultar Precios Claros</p>
              )}
            </div>
          )}

          <form onSubmit={e => void submitProduct(e)} className="space-y-4">
            <div>
              <label htmlFor="product-name" className="block font-semibold mb-2">Nombre del producto *</label>
              <input
                id="product-name"
                value={productForm.name}
                onChange={e => setProductForm({ ...productForm, name: e.target.value })}
                type="text"
                placeholder="Ej: Arroz Largo Fino 1kg"
                className="input-field"
              />
            </div>

            <div>
              <label htmlFor="product-category" className="block font-semibold mb-2">Categoría (opcional)</label>
              <CategoryInput
                id="product-category"
                ref={categoryInput}
                value={productForm.category}
                onChange={category => setProductForm({ ...productForm, category })}
              />
            </div>

            <div>
              <label htmlFor="product-ean" className="block font-semibold mb-2">Código de barras (Opcional)</label>
              <div className="flex gap-2">
                <input
                  id="product-ean"
                  ref={eanInput}
                  value={productForm.ean}
                  onChange={e => {
                    setProductForm({ ...productForm, ean: e.target.value });
                    setEanError(null);
                    pendingScan.current = null;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Ej: 7793704000911"
                  aria-invalid={eanError !== null}
                  aria-describedby={eanError ? 'product-ean-error' : undefined}
                  className="input-field min-w-0 flex-1"
                />
                <ScanButton onDetected={scannedForProduct} />
              </div>
              {eanError && (
                <p id="product-ean-error" role="alert" className="mt-2 text-sm text-red-700">
                  {eanError.status === 'invalid' ? 'Código de barras inválido' : <DuplicateProduct product={eanError.product} />}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="product-brand" className="block font-semibold mb-2">Marca (Opcional)</label>
              <input
                id="product-brand"
                value={productForm.brand}
                onChange={e => setProductForm({ ...productForm, brand: e.target.value })}
                type="text"
                placeholder="Ej: Playadito"
                className="input-field"
              />
            </div>

            <PhotoField value={photo} onChange={setPhoto} productName={productForm.name}
              labelClassName="block font-semibold mb-2" />

            <div>
              <label htmlFor="product-size" className="block font-semibold mb-2">Presentación (Opcional)</label>
              <SizeInput
                id="product-size"
                size={productForm.size}
                unit={productForm.sizeUnit}
                onChange={patch => setProductForm({ ...productForm, ...patch })}
              />
            </div>

            <button type="submit" className="btn-primary w-full">Agregar Producto</button>
          </form>
        </div>
      )}

      {/* Mensaje de feedback */}
      {message && (
        <div role="status" className={`mt-4 flex items-start gap-2 p-4 rounded-xl ${message.type === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {message.type === 'ok' && <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

    </div>
  );
}
