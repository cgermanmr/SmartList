'use client';

import { ArrowLeft, Camera, ImageOff, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import DeleteProduct from '@/components/DeleteProduct';
import GroupPricesCard from '@/components/GroupPricesCard';
import NearbyStoresCard from '@/components/NearbyStoresCard';
import { PhotoStatus, usePhotoPicker } from '@/components/PhotoField';
import PriceChart from '@/components/PriceChart';
import ProductImage from '@/components/ProductImage';
import ReferencePrice from '@/components/ReferencePrice';
import SepaLinkDialog from '@/components/SepaLinkDialog';
import { useOwnPriceVotes } from '@/components/useOwnPriceVotes';
import { forgetPhotoUrl, useProductPhotos } from '@/components/useProductPhotos';
import { useSepaImages } from '@/components/useSepaImages';
import ValidationBadge from '@/components/ValidationBadge';
import { formatMoney, formatShortDateTime, formatSize } from '@/lib/format';
import { uniqueId } from '@/lib/ids';
import { CartItem, Price, Product } from '@/lib/models';
import { productImageSrc } from '@/lib/photo';
import { discardPhoto, savePhoto } from '@/lib/photo-sync';
import { priceValidation, validationSummary } from '@/lib/price-validation';
import { isFromSepa } from '@/lib/product-form';
import { imageSource, sepaEnabled } from '@/lib/sepa';
import { getPriceStats, getPricesForProduct, useStore } from '@/lib/store';

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const product = useStore(s => s.products.find(p => p.id === id));
  const allPrices = useStore(s => s.prices);
  const addToCart = useStore(s => s.addToCart);
  const updatePrice = useStore(s => s.updatePrice);
  const updateProduct = useStore(s => s.updateProduct);

  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingAmount, setEditingAmount] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  // Eliminado desde acá (spec 33): nada que mostrar mientras se navega a Buscar. Al ocultarse la página se olvida
  const [leaving, setLeaving] = useState(false);
  useEffect(() => () => setLeaving(false), []);

  // Vincular y quitar reemplazan el botón que tenía el foco: si quedó perdido, pasa al primero de los nuevos
  const linkActions = useRef<HTMLDivElement>(null);
  const ean = product?.ean;
  const previousEan = useRef(ean);
  // La imagen se busca por EAN al mostrar (spec 17): quitar el vínculo la saca, vincular la trae
  const images = useSepaImages([ean]);
  // La foto propia va antes que la del catálogo (spec 27)
  const photoUrl = useProductPhotos([product]);
  // Agregar, cambiar o quitar la foto propia guarda enseguida (spec 27): no hay botón Guardar en el detalle
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function replacePhoto(blob: Blob) {
    if (!product) return;
    const previous = product.photo;
    setPhotoSaving(true);
    setPhotoError(null);
    try {
      const photo = await savePhoto(blob);
      updateProduct(product.id, { photo });
      if (previous) await dropPhoto(previous.id);
    } catch {
      setPhotoError('No se pudo guardar la foto.');
    } finally {
      setPhotoSaving(false);
    }
  }

  async function removePhoto() {
    if (!product?.photo || !confirm('¿Quitar la foto?')) return;
    const previous = product.photo;
    updateProduct(product.id, { photo: undefined });
    await dropPhoto(previous.id);
  }

  /** La foto anterior: se borra del teléfono y, si estaba en la cuenta, del bucket en la próxima sincronización */
  async function dropPhoto(id: string) {
    forgetPhotoUrl(id);
    await discardPhoto(id).catch(() => undefined);
  }
  const picker = usePhotoPicker(blob => void replacePhoto(blob));
  // Votos del grupo sobre los precios propios de un producto con EAN (spec 23): sin sesión o sin grupo, ninguno
  const ownVotes = useOwnPriceVotes(
    product?.ean ? getPricesForProduct(allPrices, product.id).slice(0, 100).map(price => price.id) : []);
  useEffect(() => {
    if (previousEan.current === ean) return;
    previousEan.current = ean;
    if (document.activeElement === document.body) linkActions.current?.querySelector('button')?.focus();
  }, [ean]);

  if (!product && leaving) return null;

  if (!product) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Producto no encontrado</p>
      </div>
    );
  }

  const prices = getPricesForProduct(allPrices, product.id);
  const stats = getPriceStats(allPrices, product.id);
  const details = productDetails(product);
  const image = productImageSrc(product, photoUrl(product), product.ean ? images.get(product.ean) : undefined);

  function add() {
    if (!product || !stats) return;
    const item: CartItem = {
      id: uniqueId(),
      productId: product.id,
      productName: product.name,
      price: stats.current,
      quantity: 1,
      subtotal: stats.current,
    };
    addToCart(item);
    alert('Producto añadido al carrito!');
  }

  function unlink() {
    if (!product || !confirm('¿Quitar el vínculo con Precios Claros? La marca y la presentación se conservan.')) return;
    updateProduct(product.id, { ean: undefined });
  }

  function startEdit(price: Price) {
    setEditingPriceId(price.id);
    setEditingAmount(String(price.amount));
  }

  function saveEdit(price: Price) {
    const amount = Number(editingAmount);
    if (amount > 0) updatePrice(price.id, amount);
    setEditingPriceId(null);
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 text-primary-700 hover:text-primary-800 font-semibold">
          <ArrowLeft aria-hidden="true" className="size-5" />
          Volver
        </Link>
      </div>

      <div className="card p-6 mb-6">
        {/* Imagen junto al nombre; en el celular, centrada arriba */}
        <div className="mb-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="flex w-40 shrink-0 flex-col items-center">
            <ProductImage src={image} name={product.name} size={160} />
            {picker.input}
            {product.photo ? (
              <>
                <p className="mt-1 text-center text-sm text-gray-600">Tu foto · Solo la ves vos</p>
                <button type="button" onClick={picker.open} disabled={picker.busy || photoSaving}
                  className="btn-secondary mt-2 inline-flex w-full items-center justify-center gap-2 text-sm">
                  <Camera aria-hidden="true" className="size-4" />
                  Cambiar foto
                </button>
                <button type="button" onClick={() => void removePhoto()} disabled={picker.busy || photoSaving}
                  className="btn-secondary mt-2 inline-flex w-full items-center justify-center gap-2 text-sm">
                  <ImageOff aria-hidden="true" className="size-4" />
                  Quitar foto
                </button>
              </>
            ) : (
              <>
                {image && imageSource(image) === 'off' && (
                  <p className="mt-1 text-center text-xs text-gray-500">Imagen: Open Food Facts (CC-BY-SA)</p>
                )}
                <button type="button" onClick={picker.open} disabled={picker.busy || photoSaving}
                  className="btn-secondary mt-2 inline-flex w-full items-center justify-center gap-2 text-sm">
                  <Camera aria-hidden="true" className="size-4" />
                  Agregar foto
                </button>
              </>
            )}
            <div className="text-center">
              <PhotoStatus busy={picker.busy || photoSaving} error={picker.error ?? photoError} />
            </div>
          </div>
          <div className="min-w-0 w-full flex-1">
            <h1 className="text-3xl font-bold mb-2 break-words">{product.name}</h1>
            {details && <p className="text-gray-600 mb-1 break-words">{details}</p>}
            {product.category && <p className="text-gray-600">Categoría: {product.category}</p>}
          </div>
        </div>

        {/* Spec 36: un producto de Precios Claros no se vuelve a vincular ni se desvincula; sin código, Vincular como siempre */}
        {sepaEnabled && (product.ean === undefined || !isFromSepa(product)) && (
          <div ref={linkActions} className="flex flex-wrap gap-2 mb-4">
            {product.ean === undefined ? (
              <button type="button" onClick={() => setLinkOpen(true)} className="btn-secondary">
                Vincular con Precios Claros
              </button>
            ) : (
              <>
                <button type="button" onClick={() => setLinkOpen(true)} className="btn-secondary text-sm px-3 min-h-11">
                  Cambiar vínculo
                </button>
                <button type="button" onClick={unlink} className="btn-secondary text-sm px-3 min-h-11">
                  Quitar vínculo
                </button>
              </>
            )}
            <SepaLinkDialog product={product} open={linkOpen} onClose={() => setLinkOpen(false)} />
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded">
              <p className="text-xs text-gray-600">Precio Actual</p>
              <p className="text-2xl font-bold text-blue-700">${formatMoney(stats.current)}</p>
            </div>
            <div className="bg-green-50 p-4 rounded">
              <p className="text-xs text-gray-600">Mínimo</p>
              <p className="text-2xl font-bold text-green-700">${formatMoney(stats.min)}</p>
            </div>
            <div className="bg-red-50 p-4 rounded">
              <p className="text-xs text-gray-600">Máximo</p>
              <p className="text-2xl font-bold text-red-700">${formatMoney(stats.max)}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded">
              <p className="text-xs text-gray-600">Promedio</p>
              <p className="text-2xl font-bold text-purple-700">${formatMoney(stats.avg)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Referencia nacional de Precios Claros: solo con EAN y precios en el catálogo */}
      <ReferencePrice ean={product.ean} ownPrice={stats?.current ?? null} />

      {/* Comercios cerca de la ubicación que tienen el producto: solo con EAN */}
      <NearbyStoresCard product={product} />
      <GroupPricesCard product={product} />

      {/* Gráfico de evolución de precios (solo si hay más de 3 registros) */}
      {prices.length > 3 && (
        <div className="card p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Evolución del Precio</h2>
          <PriceChart prices={prices} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="text-xl font-bold mb-4">Historial de Precios</h2>
          <div className="space-y-2">
            {prices.map(price => {
              // Solo cuentan los votos sobre el monto local: si se editó y todavía no se sincronizó, no se muestran
              const validation = priceValidation(ownVotes.get(price.id) ?? [], price.amount);
              return (
                <div key={price.id} className="card p-4">
                  {editingPriceId !== price.id ? (
                    // Modo visualización
                    <>
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-semibold">${formatMoney(price.amount)}</p>
                          <p className="text-sm text-gray-600">{price.barrio} - {price.store}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-xs text-gray-500">{formatShortDateTime(price.date)}</p>
                          <button
                            onClick={() => startEdit(price)}
                            className="flex size-11 items-center justify-center rounded-lg text-gray-500 hover:text-primary-700 transition-colors"
                            title="Editar precio"
                            aria-label={`Editar precio de $${formatMoney(price.amount)}`}>
                            <Pencil aria-hidden="true" className="size-4" />
                          </button>
                        </div>
                      </div>
                      {validation.votes.length > 0 && (
                        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-700">
                          <ValidationBadge status={validation.status} />
                          <span className="break-words">{validationSummary(validation, '')}</span>
                        </p>
                      )}
                    </>
                  ) : (
                    // Modo edición inline
                    <div>
                      <p className="text-sm text-gray-500 mb-2">
                        {price.barrio} - {price.store} · {formatShortDateTime(price.date)}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-gray-600 font-semibold">$</span>
                        <input
                          type="number"
                          value={editingAmount}
                          onChange={e => setEditingAmount(e.target.value)}
                          step="0.01"
                          min="0"
                          aria-label="Nuevo monto"
                          className="input-field w-32"
                          onKeyUp={e => {
                            if (e.key === 'Enter') saveEdit(price);
                            if (e.key === 'Escape') setEditingPriceId(null);
                          }}
                        />
                        <button onClick={() => saveEdit(price)} className="btn-primary py-1 px-3 text-sm">Guardar</button>
                        <button onClick={() => setEditingPriceId(null)} className="btn-secondary py-1 px-3 text-sm">Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-xl font-bold mb-4">Agregar al Carrito</h2>
          <p className="text-2xl font-bold text-primary-700 mb-4">${formatMoney(stats?.current || 0)}</p>
          <button onClick={add} className="btn-primary w-full">
            Añadir al Carrito
          </button>
        </div>
      </div>

      <DeleteProduct product={product} busy={picker.busy || photoSaving} onLeaving={setLeaving} />
    </div>
  );
}

/** "Marca · 500 g · EAN 7793704000911" con lo que exista; vacío si no hay ninguno */
function productDetails(product: Product): string {
  const size = product.size !== undefined && product.sizeUnit ? formatSize(product.size, product.sizeUnit) : null;
  const ean = product.ean ? `EAN ${product.ean}` : null;
  return [product.brand, size, ean].filter(Boolean).join(' · ');
}
