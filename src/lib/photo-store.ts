// ── Fotos propias en el teléfono (spec 27): IndexedDB, sin dependencias ──────
//
// Base `el-changuito`, almacén `photos` (una entrada por foto) y `photo_deletes` (ids de fotos de la cuenta que hay
// que borrar del bucket). Si IndexedDB no existe o falla, las funciones rechazan y la app sigue sin fotos.

export interface StoredPhoto {
  id: string;
  blob: Blob;
  uploaded: boolean;
}

const DB_NAME = 'el-changuito';
const DB_VERSION = 1;
const PHOTOS = 'photos';
const DELETES = 'photo_deletes';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB no disponible'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(DELETES)) db.createObjectStore(DELETES);
      };
      request.onsuccess = () => {
        const db = request.result;
        // Otra pestaña con una versión nueva: se cierra para no bloquearla y se abre de nuevo la próxima vez
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB'));
      request.onblocked = () => reject(new Error('IndexedDB bloqueada'));
    });
    // Un fallo no se guarda: se reintenta en la próxima llamada
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

/** Corre `work` en una transacción y resuelve cuando termina (con el valor del último pedido, si hay) */
async function run<T>(
  stores: string | string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => IDBRequest<T> | void,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const request = work(tx);
    tx.oncomplete = () => resolve(request ? request.result : (undefined as T));
    tx.onerror = () => reject(tx.error ?? new Error('Error de IndexedDB'));
    tx.onabort = () => reject(tx.error ?? new Error('Transacción de IndexedDB cancelada'));
  });
}

export function putPhoto(photo: StoredPhoto): Promise<void> {
  return run(PHOTOS, 'readwrite', tx => {
    tx.objectStore(PHOTOS).put(photo);
  });
}

export function getPhoto(id: string): Promise<StoredPhoto | undefined> {
  return run<StoredPhoto | undefined>(PHOTOS, 'readonly', tx => tx.objectStore(PHOTOS).get(id));
}

export function listPhotos(): Promise<StoredPhoto[]> {
  return run<StoredPhoto[]>(PHOTOS, 'readonly', tx => tx.objectStore(PHOTOS).getAll());
}

export function deletePhoto(id: string): Promise<void> {
  return run(PHOTOS, 'readwrite', tx => {
    tx.objectStore(PHOTOS).delete(id);
  });
}

export function markUploaded(id: string): Promise<void> {
  return run(PHOTOS, 'readwrite', tx => {
    const store = tx.objectStore(PHOTOS);
    const request = store.get(id);
    request.onsuccess = () => {
      const photo = request.result as StoredPhoto | undefined;
      if (photo && !photo.uploaded) store.put({ ...photo, uploaded: true });
    };
  });
}

/** Marca una foto de la cuenta para borrarla del bucket en la próxima vuelta de la sincronización */
export function queueRemoteDelete(id: string): Promise<void> {
  return run(DELETES, 'readwrite', tx => {
    tx.objectStore(DELETES).put(true, id);
  });
}

/** Ids pendientes de borrar del bucket; no los saca: lo hace `forgetRemoteDeletes` cuando el borrado salió */
export function takeRemoteDeletes(): Promise<string[]> {
  return run<IDBValidKey[]>(DELETES, 'readonly', tx => tx.objectStore(DELETES).getAllKeys()).then(keys =>
    keys.map(String),
  );
}

/** Saca de `photo_deletes` los ids ya borrados del bucket */
export function forgetRemoteDeletes(ids: string[]): Promise<void> {
  return run(DELETES, 'readwrite', tx => {
    const store = tx.objectStore(DELETES);
    for (const id of ids) store.delete(id);
  });
}

/** Todas las fotos pasan a "sin subir" y se olvidan los borrados pendientes (cuenta borrada desde otro lado) */
export function resetUploads(): Promise<void> {
  return run([PHOTOS, DELETES], 'readwrite', tx => {
    const store = tx.objectStore(PHOTOS);
    const request = store.getAll();
    request.onsuccess = () => {
      for (const photo of request.result as StoredPhoto[]) if (photo.uploaded) store.put({ ...photo, uploaded: false });
    };
    tx.objectStore(DELETES).clear();
  });
}

/** Vacía los dos almacenes */
export function clearPhotos(): Promise<void> {
  return run([PHOTOS, DELETES], 'readwrite', tx => {
    tx.objectStore(PHOTOS).clear();
    tx.objectStore(DELETES).clear();
  });
}
