import type { Product, ProductPhoto } from './models';
import { uniqueId } from './ids';
import { pendingUploads, photoIdsInUse, photoPath, unreferencedPhotos } from './photo';
import {
  clearPhotos, deletePhoto, forgetRemoteDeletes, getPhoto, listPhotos, markUploaded, putPhoto, queueRemoteDelete,
  resetUploads, StoredPhoto, takeRemoteDeletes,
} from './photo-store';
import { loadFromStorage, SYNC_KEY } from './storage';
import { supabase } from './supabase';

// ── Fotos propias: guardado y sincronización (spec 27) ──────
// El archivo vive en IndexedDB (photo-store.ts) y, con cuenta, en el bucket privado fotos-propias/<userId>/<id>.jpg.
// Los productos llevan solo { id, takenAt } y viajan con la sincronización de la spec 21; acá se mueven los archivos.

export const PHOTO_BUCKET = 'fotos-propias';

/** Duración de la URL firmada para bajar una foto */
const SIGNED_URL_SECONDS = 60;
const LIST_PAGE = 1000;

/**
 * Fotos recién guardadas que todavía puede no usar ningún producto (entre `savePhoto` y el alta del producto):
 * la limpieza no las toca hasta verlas en uso
 */
const fresh = new Set<string>();

function client() {
  if (!supabase) throw new Error('Supabase no está configurado');
  return supabase;
}

/** Hay una cuenta en este teléfono (con o sin sesión vigente) */
function hasAccount(): boolean {
  const meta = loadFromStorage<{ userId?: unknown } | null>(SYNC_KEY, null);
  return !!meta && typeof meta.userId === 'string';
}

// ── En el teléfono ───────────────────────────────────────────

/** Guarda una foto nueva (sin subir) y devuelve lo que va en `Product.photo` */
export async function savePhoto(blob: Blob): Promise<ProductPhoto> {
  const id = uniqueId();
  fresh.add(id);
  try {
    await putPhoto({ id, blob, uploaded: false });
  } catch (error) {
    fresh.delete(id);
    throw error;
  }
  return { id, takenAt: new Date().toISOString() };
}

/**
 * Una foto que se quitó o se reemplazó en este teléfono: si ya estaba en la cuenta, se anota para borrarla del
 * bucket; siempre se borra del teléfono. Sin copia local con cuenta, la foto vino de otro teléfono y está subida.
 */
export async function discardPhoto(id: string): Promise<void> {
  fresh.delete(id);
  const stored = await getPhoto(id).catch(() => undefined);
  if (hasAccount() && (!stored || stored.uploaded)) await queueRemoteDelete(id);
  await deletePhoto(id);
}

/** Cerrar sesión u otro usuario: vacía los dos almacenes */
export async function clearLocalPhotos(): Promise<void> {
  fresh.clear();
  await clearPhotos();
}

/** Cuenta borrada desde otro dispositivo: las fotos quedan sin subir, para otra cuenta; los borrados se olvidan */
export async function releaseLocalPhotos(): Promise<void> {
  await resetUploads();
}

// ── Con la cuenta ────────────────────────────────────────────

async function upload(userId: string, photo: StoredPhoto): Promise<void> {
  const { error } = await client().storage.from(PHOTO_BUCKET).upload(photoPath(userId, photo.id), photo.blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  // Ya estaba (se subió y no llegó a marcarse): cuenta como subida. Sin update en el bucket, no se pisa
  if (error && !/exists|duplicate/i.test(error.message)) throw error;
}

/**
 * Vuelta de fotos de `syncNow`, después de los registros: sube las pendientes que usa algún producto, borra del
 * bucket las de `photo_deletes` y borra del teléfono las que ya no usa ningún producto. Un error corta la vuelta
 * de fotos (se reintenta en la siguiente) y no toca la de los registros.
 */
export async function syncPhotos(userId: string, products: Product[]): Promise<void> {
  const stored = await listPhotos();

  for (const id of pendingUploads(products, stored)) {
    const photo = stored.find(s => s.id === id);
    if (!photo) continue;
    await upload(userId, photo);
    await markUploaded(id);
  }

  const deletes = await takeRemoteDeletes();
  if (deletes.length > 0) {
    const { error } = await client().storage.from(PHOTO_BUCKET).remove(deletes.map(id => photoPath(userId, id)));
    if (error) throw error;
    await forgetRemoteDeletes(deletes);
  }

  const inUse = photoIdsInUse(products);
  for (const id of fresh) if (inUse.has(id)) fresh.delete(id);
  const unused = unreferencedPhotos(products, stored.map(s => s.id)).filter(id => !fresh.has(id));
  for (const id of unused) await deletePhoto(id);
}

/**
 * Foto de otro teléfono de la misma cuenta que no está en este: la baja con una URL firmada y la guarda como
 * subida. Un fallo (sin conexión, todavía no subida) rechaza sin guardar nada: se reintenta la próxima vez.
 */
export async function downloadPhoto(userId: string, id: string): Promise<StoredPhoto> {
  const { data, error } = await client().storage.from(PHOTO_BUCKET).createSignedUrl(photoPath(userId, id), SIGNED_URL_SECONDS);
  if (error || !data) throw error ?? new Error('Sin URL firmada');
  const response = await fetch(data.signedUrl);
  if (!response.ok) throw new Error(`La foto respondió ${response.status}`);
  const photo: StoredPhoto = { id, blob: await response.blob(), uploaded: true };
  await putPhoto(photo);
  return photo;
}

/** Borrar la cuenta: borra todos los archivos de su carpeta; rechaza si no se pudo (la cuenta no se borra) */
export async function deleteAllRemotePhotos(userId: string): Promise<void> {
  const bucket = client().storage.from(PHOTO_BUCKET);
  for (;;) {
    const { data, error } = await bucket.list(userId, { limit: LIST_PAGE });
    if (error) throw error;
    const files = (data ?? []).filter(f => f.id !== null);   // las carpetas vienen con id null
    if (files.length === 0) return;
    const { error: removeError } = await bucket.remove(files.map(f => `${userId}/${f.name}`));
    if (removeError) throw removeError;
  }
}
