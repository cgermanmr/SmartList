import { useCallback, useEffect, useState } from 'react';
import type { Product } from '@/lib/models';
import { downloadPhoto } from '@/lib/photo-sync';
import { getPhoto } from '@/lib/photo-store';
import { syncUserId, useSyncStatus } from '@/lib/sync-engine';

// ── Fotos propias para mostrar (spec 27) ────────────────────
// Caché de módulo por id de foto: el object URL de su Blob de IndexedDB. Cada foto nueva tiene un id nuevo, así que
// una URL guardada nunca muestra una foto equivocada. Una foto que no está en el teléfono se baja de la cuenta
// (solo con sesión); un fallo no se guarda: se reintenta la próxima vez que se muestre.

const urls = new Map<string, string>();
const loading = new Map<string, Promise<string | undefined>>();

function loadPhotoUrl(id: string): Promise<string | undefined> {
  const cached = urls.get(id);
  if (cached) return Promise.resolve(cached);
  let pending = loading.get(id);
  if (!pending) {
    pending = (async () => {
      let photo = await getPhoto(id).catch(() => undefined);
      if (!photo) {
        const userId = syncUserId();
        if (!userId) return undefined;
        photo = await downloadPhoto(userId, id).catch(() => undefined);
        if (!photo) return undefined;
      }
      const url = URL.createObjectURL(photo.blob);
      urls.set(id, url);
      return url;
    })().finally(() => loading.delete(id));
    loading.set(id, pending);
  }
  return pending;
}

/** Olvida el object URL de una foto quitada o reemplazada */
export function forgetPhotoUrl(id: string): void {
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
}

/**
 * URL de la foto propia de cada producto: `photoUrl(product)` da el object URL o `undefined` (sin foto, mientras
 * carga, o si no se pudo leer ni bajar). Con `productImageSrc` decide qué imagen se muestra.
 */
export function useProductPhotos(products: readonly (Product | undefined)[]): (product?: Product) => string | undefined {
  const key = [...new Set(products.flatMap(p => (p?.photo ? [p.photo.id] : [])))].sort().join(',');
  // Cada vuelta de la sincronización reintenta las que faltan (llegó la sesión, o la foto ya se subió)
  const syncState = useSyncStatus(s => s.status.state);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (key === '') return;
    let alive = true;
    for (const id of key.split(',')) {
      if (urls.has(id)) continue;
      void loadPhotoUrl(id).then(url => {
        if (url && alive) setVersion(v => v + 1);
      });
    }
    return () => {
      alive = false;
    };
  }, [key, syncState]);

  // Una función nueva cuando llega una foto: el React Compiler no reusa lo que calculó con la anterior
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((product?: Product) => (product?.photo ? urls.get(product.photo.id) : undefined), [version]);
}
