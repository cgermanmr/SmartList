'use client';

import { Check } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { ManualEanError } from '@/components/ManualProductFields';
import PriceProductPicker, { useEanLookup } from '@/components/PriceProductPicker';
import PriceStorePicker from '@/components/PriceStorePicker';
import { EanAnswer } from '@/components/useManualEan';
import { formatDayMonth, formatMoney } from '@/lib/format';
import { toGtin13 } from '@/lib/gtin';
import { uniqueId } from '@/lib/ids';
import { StoreRef } from '@/lib/models';
import { PhotoDraft } from '@/lib/photo';
import { savePhoto } from '@/lib/photo-sync';
import { priceAt, PriceProductChoice, resolvePriceProduct } from '@/lib/price-form';
import { checkEan, ProductForm } from '@/lib/product-form';
import { getPricesForProduct, useStore } from '@/lib/store';

interface Errors {
  store?: string;
  product?: string;
  name?: string;
  ean?: ManualEanError;
  amount?: string;
}

type Field = 'store' | 'product' | 'ean' | 'amount';

const NOTICE_MS = 3000;

/** Monto escrito como número mayor que 0; null si está vacío, es 0 o no es un número */
function parseAmount(text: string): number | null {
  const amount = Number(text.replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(amount) && amount > 0 ? amount : null;
}

/**
 * Pestaña "Cargar precio" (spec 26): comercio, producto y precio, en ese orden. Al guardar queda el comercio, para
 * cargar varios precios seguidos en el mismo lugar. El producto (si es nuevo) se crea recién al guardar.
 */
export default function PriceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const addPrice = useStore(s => s.addPrice);
  const addProduct = useStore(s => s.addProduct);
  const prices = useStore(s => s.prices);
  const amountId = useId();

  const [store, setStore] = useState<StoreRef | null>(null);
  const [choice, setChoice] = useState<PriceProductChoice | null>(null);
  // Texto del buscador de productos: se conserva mientras hay un producto elegido, para "Cambiar" (spec 34)
  const [query, setQuery] = useState('');
  // Lo que se sabe del código de un producto nuevo al abrir su formulario
  const [knownEan, setKnownEan] = useState<EanAnswer | null>(null);
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { searching, resolve, cancel } = useEanLookup(chooseProduct);

  const storeBlock = useRef<HTMLElement>(null);
  const productInput = useRef<HTMLInputElement>(null);
  const eanInput = useRef<HTMLInputElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  // Guardando la foto (spec 27): un segundo envío mientras tanto no hace nada
  const saving = useRef(false);
  // Después de guardar (o ante un error), el foco va al campo que corresponde cuando ya se dibujó
  const [focusTarget, setFocusTarget] = useState<{ field: Field; n: number } | null>(null);

  useEffect(() => {
    if (!focusTarget) return;
    if (focusTarget.field === 'store') storeBlock.current?.querySelector<HTMLElement>('button, input')?.focus();
    if (focusTarget.field === 'product') productInput.current?.focus();
    if (focusTarget.field === 'ean') eanInput.current?.focus();
    if (focusTarget.field === 'amount') amountInput.current?.focus();
  }, [focusTarget]);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  // ── /upload?tab=precio&ean=…&monto=… ─────────────────────
  // Next conserva la página montada: los parámetros se aplican cuando cambian (como ?tab=producto&ean=…), no con una
  // key. El comercio que ya estaba elegido se conserva
  const opensPrice = searchParams.get('tab') === 'precio';
  const urlEan = opensPrice ? toGtin13(searchParams.get('ean') ?? '') : null;
  const urlAmount = opensPrice ? parseAmount(searchParams.get('monto') ?? '') : null;
  const [appliedAmount, setAppliedAmount] = useState<number | null>(null);

  if (urlAmount !== appliedAmount) {
    setAppliedAmount(urlAmount);
    if (urlAmount !== null) {
      setAmount(String(urlAmount));
      setErrors(e => ({ ...e, amount: undefined }));
    }
  }

  // El código se resuelve como al leerlo con la cámara. La ref (que sobrevive a <Activity>) evita resolverlo de nuevo
  // al volver a la página con la misma URL, lo que borraría el nombre escrito en un producto nuevo
  const appliedEan = useRef<string | null>(null);
  const resolveFromUrl = useEffectEvent((ean: string) => scan(ean));

  useEffect(() => {
    if (urlEan === appliedEan.current) return;
    appliedEan.current = urlEan;
    if (urlEan) resolveFromUrl(urlEan);
  }, [urlEan]);

  function focus(field: Field) {
    setFocusTarget(prev => ({ field, n: (prev?.n ?? 0) + 1 }));
  }

  function chooseStore(next: StoreRef | null) {
    setStore(next);
    if (next) setErrors(e => ({ ...e, store: undefined }));
  }

  function chooseProduct(next: PriceProductChoice | null, answer: EanAnswer | null = null) {
    // Cambiar de producto descarta la foto elegida y sin guardar (spec 27)
    if (choice?.kind === 'new' && choice.photo) URL.revokeObjectURL(choice.photo.url);
    setChoice(next);
    setKnownEan(answer);
    setErrors(e => ({ ...e, product: next ? undefined : e.product, name: undefined, ean: undefined }));
    // Producto nuevo (spec 34): el foco pasa a Nombre
    if (next?.kind === 'new') focus('product');
  }

  /** Código leído o de la URL: el buscador queda vacío */
  function scan(ean: string) {
    setQuery('');
    resolve(ean);
  }

  /** "Cambiar": vuelve al buscador con el texto buscado */
  function changeProduct() {
    cancel();
    chooseProduct(null);
    focus('product');
  }

  // Sobre el valor más nuevo: la foto llega después de comprimirla, y mientras tanto se puede seguir escribiendo (o
  // haber vuelto al buscador, y entonces no se usa)
  function editForm(patch: Partial<ProductForm>) {
    setChoice(c => (c?.kind === 'new' ? { ...c, form: { ...c.form, ...patch } } : c));
    setErrors(e => ({ ...e, name: 'name' in patch ? undefined : e.name, ean: 'ean' in patch ? undefined : e.ean }));
  }

  function setPhoto(photo: PhotoDraft | null) {
    setChoice(c => (c?.kind === 'new' ? { ...c, photo: photo ?? undefined } : c));
  }

  /** Error del código de un producto nuevo; con la colección actual, por si llegó uno por la sincronización */
  function manualEanError(form: ProductForm): ManualEanError | undefined {
    const { status } = checkEan(form.ean, useStore.getState().products);
    return status === 'invalid' || status === 'duplicate' ? status : undefined;
  }

  // "Último precio $Y · dd/mm" de un producto propio
  const ownId = choice?.kind === 'own' ? choice.product.id : null;
  const last = ownId ? getPricesForProduct(prices, ownId)[0] : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving.current) return;
    const value = parseAmount(amount);
    const next: Errors = {
      store: store ? undefined : 'Elegí el comercio',
      product: choice ? undefined : 'Elegí el producto',
      name: choice?.kind === 'new' && !choice.form.name.trim() ? 'Completá el nombre' : undefined,
      ean: choice?.kind === 'new' ? manualEanError(choice.form) : undefined,
      amount: value === null ? 'Completá el precio' : undefined,
    };
    setErrors(next);
    if (next.store) return focus('store');
    if (next.product || next.name) return focus('product');
    if (next.ean) return focus('ean');
    if (next.amount) return focus('amount');
    if (!store || !choice || value === null) return;

    const { product, isNew } = resolvePriceProduct(choice, useStore.getState().products, uniqueId());
    // Spec 27: primero la foto en IndexedDB y después el producto con `photo`; si falla, el producto va sin foto
    const draft = choice.kind === 'new' ? choice.photo : undefined;
    let photoFailed = false;
    if (draft && isNew) {
      saving.current = true;
      try {
        product.photo = await savePhoto(draft.blob);
      } catch {
        photoFailed = true;
      } finally {
        saving.current = false;
      }
    }
    if (draft) URL.revokeObjectURL(draft.url);
    if (isNew) addProduct(product);
    addPrice(priceAt({ id: uniqueId(), productId: product.id, amount: value, store, date: new Date() }));

    setNotice(`Precio guardado: ${product.name} $${formatMoney(value)} en ${store.name}. Solo lo ves vos.`
      + (photoFailed ? ' No se pudo guardar la foto.' : ''));
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
    // Queda el comercio: se limpian producto y monto
    cancel();
    setChoice(null);
    setQuery('');
    setAmount('');
    focus('product');
    // Sin ean ni monto en la URL, recargar no vuelve a completar el formulario con lo recién guardado
    if (searchParams.has('ean') || searchParams.has('monto')) router.replace('/upload?tab=precio', { scroll: false });
  }

  return (
    <>
      <form onSubmit={e => void submit(e)} noValidate className="space-y-4">
        <PriceStorePicker ref={storeBlock} value={store} onChange={chooseStore} error={errors.store} />

        <PriceProductPicker
          value={choice}
          onChoose={next => { cancel(); chooseProduct(next); }}
          onChangeProduct={changeProduct}
          query={query}
          onQueryChange={text => { setQuery(text); cancel(); }}
          searching={searching}
          onScan={scan}
          onManual={(form, answer) => { cancel(); chooseProduct({ kind: 'new', form }, answer); }}
          knownEan={knownEan}
          onEditForm={editForm}
          onPhoto={setPhoto}
          onUse={next => { chooseProduct(next); focus('amount'); }}
          error={errors.product}
          nameError={errors.name}
          eanError={errors.ean}
          inputRef={productInput}
          eanRef={eanInput}
        />

        <section className="card p-4">
          <label htmlFor={amountId} className="block font-semibold mb-2">Precio ($) *</label>
          <input
            id={amountId}
            ref={amountInput}
            value={amount}
            onChange={e => { setAmount(e.target.value); setErrors(er => ({ ...er, amount: undefined })); }}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="Ej: 4300"
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={errors.amount ? `${amountId}-error` : last ? `${amountId}-last` : undefined}
            className="input-field tabular-nums"
          />
          {errors.amount && <p id={`${amountId}-error`} role="alert" className="mt-1 text-sm text-red-700">{errors.amount}</p>}
          {last && (
            <p id={`${amountId}-last`} className="mt-2 text-sm text-gray-600 tabular-nums">
              Último precio ${formatMoney(last.amount)} · {formatDayMonth(last.date)}
            </p>
          )}
        </section>

        <button type="submit" className="btn-primary w-full">Guardar precio</button>
      </form>

      {/* Aviso al guardar: fijo abajo, como el de Buscar. La región queda montada para que se anuncie */}
      <div role="status" className="pointer-events-none fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex justify-center md:bottom-14">
        {notice && (
          <p className="flex max-w-sm items-start gap-2 rounded-xl bg-primary-900 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-400" />
            <span className="min-w-0 break-words">{notice}</span>
          </p>
        )}
      </div>
    </>
  );
}
