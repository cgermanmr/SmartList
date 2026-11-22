import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CartItem, Price, Product } from './models';
import type { RemoteRow, SyncRecord } from './sync';

// localStorage en memoria para el entorno de Node
class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}
const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

vi.mock('./sync-remote', () => ({
  pushRecords: vi.fn(),
  pullRows: vi.fn(),
  accountGone: vi.fn(),
  signOutHere: vi.fn(),
  SyncCallError: class extends Error {
    code?: string;
    constructor(message: string, code?: string) { super(message); this.code = code; }
  },
}));

vi.mock('./photo-sync', () => ({
  syncPhotos: vi.fn(),
  clearLocalPhotos: vi.fn(),
  releaseLocalPhotos: vi.fn(),
}));

const OUTBOX = 'preciolocal_outbox';
const SYNC = 'preciolocal_sync';
const LOCATION = 'preciolocal_location';

/** Store, motor y mocks nuevos en cada test: el motor guarda estado de módulo */
async function load() {
  vi.resetModules();
  const remote = await import('./sync-remote');
  const photos = await import('./photo-sync');
  const { useStore } = await import('./store');
  const engine = await import('./sync-engine');
  vi.mocked(remote.pushRecords).mockReset().mockResolvedValue(undefined);
  vi.mocked(remote.pullRows).mockReset().mockResolvedValue([]);
  vi.mocked(remote.accountGone).mockReset().mockResolvedValue(false);
  vi.mocked(remote.signOutHere).mockReset().mockResolvedValue(undefined);
  vi.mocked(photos.syncPhotos).mockReset().mockResolvedValue(undefined);
  vi.mocked(photos.clearLocalPhotos).mockReset().mockResolvedValue(undefined);
  vi.mocked(photos.releaseLocalPhotos).mockReset().mockResolvedValue(undefined);
  useStore.getState().hydrate();
  return { remote, photos, useStore, engine };
}

function saved<T>(key: string): T | null {
  const raw = storage.getItem(key);
  return raw === null ? null : JSON.parse(raw) as T;
}

function product(id: string, ean?: string): Product {
  return { id, name: `Producto ${id}`, ...(ean && { ean }) };
}

function price(id: string, productId: string): Price {
  return { id, productId, amount: 100, date: '2026-11-10T10:00:00.000Z' as unknown as Date, barrio: 'Almagro' };
}

function item(id: string, productId: string, quantity = 1): CartItem {
  return { id, productId, productName: `Producto ${productId}`, price: 100, quantity, subtotal: 100 * quantity };
}

function row(collection: RemoteRow['collection'], id: string, data: unknown, synced = '2026-11-17T14:00:00+00:00'): RemoteRow {
  return { collection, id, data, deleted: false, modified_at: '2026-11-17T13:00:00+00:00', synced_at: synced };
}

beforeEach(() => {
  storage.clear();
});

describe('cola de cambios', () => {
  it('sin cuenta en el teléfono no encola nada', async () => {
    const { useStore, engine } = await load();
    useStore.getState().addProduct(product('a'));
    expect(engine.pendingCount()).toBe(0);
    expect(saved(OUTBOX)).toBeNull();
  });

  it('con cuenta, cada cambio del store queda en la cola', async () => {
    storage.setItem(SYNC, JSON.stringify({ userId: 'u1', cursor: null }));
    const { useStore, engine } = await load();
    useStore.getState().addProduct(product('a'));
    expect(engine.pendingCount()).toBe(1);
    expect(saved<SyncRecord[]>(OUTBOX)?.map(r => `${r.collection}/${r.id}`)).toEqual(['products/a']);
  });
});

describe('startSync', () => {
  it('primera sesión: sube todo salvo los datos de ejemplo, baja todo y guarda el cursor', async () => {
    storage.setItem('preciolocal_products', JSON.stringify([product('1'), product('mio')]));
    storage.setItem('preciolocal_prices', JSON.stringify([price('1', '1'), price('p', 'mio')]));
    const { remote, engine } = await load();
    vi.mocked(remote.pullRows).mockResolvedValue([row('products', 'otro', product('otro'), '2026-11-17T15:00:00+00:00')]);

    await engine.startSync('u1');

    const sent = vi.mocked(remote.pushRecords).mock.calls[0];
    expect(sent[0]).toBe('u1');
    expect(sent[1].map(r => `${r.collection}/${r.id}`)).toEqual(['products/mio', 'prices/p', 'settings/calculator']);
    expect(remote.pullRows).toHaveBeenCalledWith(null);
    expect(saved(SYNC)).toEqual({ userId: 'u1', cursor: '2026-11-17T15:00:00+00:00' });
    expect(engine.pendingCount()).toBe(0);
  });

  it('el mismo usuario: sube solo la cola, sin volver a subir todo', async () => {
    storage.setItem('preciolocal_products', JSON.stringify([product('a'), product('b')]));
    storage.setItem(SYNC, JSON.stringify({ userId: 'u1', cursor: '2026-11-17T12:00:00.000Z' }));
    const pending: SyncRecord = { collection: 'products', id: 'b', data: product('b'), deleted: false, modifiedAt: '2026-11-17T12:30:00.000Z' };
    storage.setItem(OUTBOX, JSON.stringify([pending]));
    const { remote, engine } = await load();

    await engine.startSync('u1');

    expect(vi.mocked(remote.pushRecords).mock.calls[0][1]).toEqual([pending]);
    expect(remote.pullRows).toHaveBeenCalledWith('2026-11-17T11:55:00.000Z');
  });

  it('otro usuario: descarta lo local sin subirlo y baja la cuenta nueva', async () => {
    storage.setItem('preciolocal_products', JSON.stringify([product('a')]));
    storage.setItem(SYNC, JSON.stringify({ userId: 'u1', cursor: '2026-11-17T12:00:00.000Z' }));
    storage.setItem(OUTBOX, JSON.stringify([{ collection: 'products', id: 'a', data: product('a'), deleted: false, modifiedAt: 'x' }]));
    const { remote, useStore, engine } = await load();
    vi.mocked(remote.pullRows).mockResolvedValue([row('products', 'z', product('z'))]);

    await engine.startSync('u2');

    expect(remote.pushRecords).not.toHaveBeenCalled();
    expect(remote.pullRows).toHaveBeenCalledWith(null);
    expect(useStore.getState().products.map(p => p.id)).toEqual(['z']);
    expect(saved<{ userId: string }>(SYNC)?.userId).toBe('u2');
  });
});

describe('syncNow', () => {
  it('si falla la subida, la cola queda igual y el estado es error', async () => {
    storage.setItem(SYNC, JSON.stringify({ userId: 'u1', cursor: null }));
    const { remote, useStore, engine } = await load();
    useStore.getState().addProduct(product('a'));
    vi.mocked(remote.pushRecords).mockRejectedValue(new remote.SyncCallError('offline'));

    await engine.startSync('u1');

    expect(engine.pendingCount()).toBe(1);
    expect(engine.useSyncStatus.getState().status.state).toBe('error');
  });

  it('lo bajado entra al store sin volver a la cola; lo que cambia el dedupe sí se encola', async () => {
    const EAN = '7790000000017';
    storage.setItem(SYNC, JSON.stringify({ userId: 'u1', cursor: null }));
    storage.setItem('preciolocal_products', JSON.stringify([product('b', EAN)]));
    const { remote, useStore, engine } = await load();
    vi.mocked(remote.pullRows).mockResolvedValueOnce([row('products', 'a', product('a', EAN)), row('prices', 'p1', price('p1', 'b'))]);

    await engine.startSync('u1');

    const s = useStore.getState();
    expect(s.products.map(p => p.id)).toEqual(['a']);
    expect(s.prices[0].productId).toBe('a');
    // Se suben el borrado de 'b' y el precio que pasó a 'a'; nada de lo bajado tal cual
    const second = vi.mocked(remote.pushRecords).mock.calls.at(-1)![1];
    expect(second.map(r => `${r.collection}/${r.id}/${r.deleted}`).sort()).toEqual(['prices/p1/false', 'products/b/true']);
    expect(engine.pendingCount()).toBe(0);
  });

  it('dos ítems del carrito del mismo producto quedan en uno: el más reciente', async () => {
    storage.setItem(SYNC, JSON.stringify({ userId: 'u1', cursor: null }));
    storage.setItem('preciolocal_cart', JSON.stringify([item('i1', 'a', 1)]));
    const { remote, useStore, engine } = await load();
    vi.mocked(remote.pullRows).mockResolvedValueOnce([row('cart', 'i2', item('i2', 'a', 4))]);

    await engine.startSync('u1');

    expect(useStore.getState().cart).toEqual([item('i2', 'a', 4)]);
  });

  it('nunca corre dos sincronizaciones a la vez', async () => {
    storage.setItem(SYNC, JSON.stringify({ userId: 'u1', cursor: null }));
    const { remote, useStore, engine } = await load();
    let running = 0;
    let overlap = false;
    vi.mocked(remote.pushRecords).mockImplementation(async () => {
      running += 1;
      if (running > 1) overlap = true;
      await new Promise(resolve => setTimeout(resolve, 5));
      running -= 1;
    });
    await engine.startSync('u1');
    useStore.getState().addProduct(product('a'));
    await Promise.all([engine.syncNow(), engine.syncNow(), engine.syncNow()]);

    expect(overlap).toBe(false);
    expect(engine.pendingCount()).toBe(0);
  });
});

describe('cerrar sesión y cuenta borrada', () => {
  it('signOutEverywhere vacía el teléfono y conserva la ubicación', async () => {
    storage.setItem(SYNC, JSON.stringify({ userId: 'u1', cursor: null }));
    storage.setItem(LOCATION, JSON.stringify({ location: null, radiusKm: 5 }));
    const { remote, useStore, engine } = await load();
    await engine.startSync('u1');
    useStore.getState().addProduct(product('a'));

    await engine.signOutEverywhere();

    expect(remote.signOutHere).toHaveBeenCalled();
    expect(useStore.getState().products).toEqual([]);
    expect(useStore.getState().radiusKm).toBe(5);
    expect(saved(OUTBOX)).toBeNull();
    expect(saved(SYNC)).toBeNull();
  });

  it('con la subida fallida, informa lo pendiente antes de cerrar sesión', async () => {
    storage.setItem(SYNC, JSON.stringify({ userId: 'u1', cursor: null }));
    const { remote, useStore, engine } = await load();
    await engine.startSync('u1');
    vi.mocked(remote.pushRecords).mockRejectedValue(new remote.SyncCallError('offline'));
    useStore.getState().addProduct(product('a'));
    useStore.getState().addProduct(product('b'));

    await engine.syncNow();

    expect(engine.pendingCount()).toBe(2);
  });

  it('cuenta borrada desde otro dispositivo: cierra la sesión y conserva los datos sin cuenta', async () => {
    storage.setItem(SYNC, JSON.stringify({ userId: 'u1', cursor: null }));
    const { remote, useStore, engine } = await load();
    useStore.getState().addProduct(product('a'));
    vi.mocked(remote.pushRecords).mockRejectedValue(new remote.SyncCallError('fk', '23503'));
    vi.mocked(remote.accountGone).mockResolvedValue(true);

    await engine.startSync('u1');

    expect(remote.signOutHere).toHaveBeenCalled();
    expect(useStore.getState().products.map(p => p.id)).toEqual(['a']);
    expect(saved(OUTBOX)).toBeNull();
    expect(saved(SYNC)).toBeNull();
    expect(engine.useSyncStatus.getState().status.state).toBe('off');
  });

  it('al retomar la sesión, si la cuenta ya no existe, conserva los datos sin cuenta', async () => {
    storage.setItem(SYNC, JSON.stringify({ userId: 'u1', cursor: null }));
    storage.setItem('preciolocal_products', JSON.stringify([product('a')]));
    const { remote, useStore, engine } = await load();
    vi.mocked(remote.accountGone).mockResolvedValue(true);

    await engine.startSync('u1');

    expect(remote.pushRecords).not.toHaveBeenCalled();
    expect(useStore.getState().products.map(p => p.id)).toEqual(['a']);
    expect(saved(SYNC)).toBeNull();
  });

  it('sesión vencida: los cambios se siguen encolando y el estado es expired', async () => {
    storage.setItem(SYNC, JSON.stringify({ userId: 'u1', cursor: null }));
    const { remote, useStore, engine } = await load();
    await engine.startSync('u1');
    engine.stopSync();
    useStore.getState().addProduct(product('a'));

    expect(engine.pendingCount()).toBe(1);
    expect(engine.useSyncStatus.getState().status.state).toBe('expired');
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(remote.pushRecords).not.toHaveBeenCalled(); // sin sesión no sube
  });
});

describe('fotos propias (spec 27)', () => {
  it('después de subir y bajar los registros, sincroniza las fotos con los productos de ahora', async () => {
    storage.setItem(SYNC, JSON.stringify({ userId: 'u1', cursor: null }));
    storage.setItem('preciolocal_products', JSON.stringify([product('a')]));
    const { remote, photos, engine } = await load();
    vi.mocked(remote.pullRows).mockResolvedValue([row('products', 'b', product('b'))]);

    await engine.startSync('u1');

    expect(photos.syncPhotos).toHaveBeenCalledTimes(1);
    const [userId, products] = vi.mocked(photos.syncPhotos).mock.calls[0];
    expect(userId).toBe('u1');
    expect(products.map(p => p.id).sort()).toEqual(['a', 'b']);
    const pulled = vi.mocked(remote.pullRows).mock.invocationCallOrder[0];
    expect(vi.mocked(photos.syncPhotos).mock.invocationCallOrder[0]).toBeGreaterThan(pulled);
  });

  it('un error de las fotos no deja la sincronización en error', async () => {
    storage.setItem(SYNC, JSON.stringify({ userId: 'u1', cursor: null }));
    const { photos, engine } = await load();
    vi.mocked(photos.syncPhotos).mockRejectedValue(new Error('storage caído'));

    await engine.startSync('u1');

    expect(engine.useSyncStatus.getState().status.state).toBe('idle');
  });

  it('si fallan los registros, no sincroniza las fotos', async () => {
    storage.setItem(SYNC, JSON.stringify({ userId: 'u1', cursor: null }));
    const { remote, photos, engine } = await load();
    vi.mocked(remote.pullRows).mockRejectedValue(new remote.SyncCallError('offline'));

    await engine.startSync('u1');

    expect(photos.syncPhotos).not.toHaveBeenCalled();
  });

  it('cerrar sesión vacía las fotos del teléfono', async () => {
    storage.setItem(SYNC, JSON.stringify({ userId: 'u1', cursor: null }));
    const { photos, engine } = await load();
    await engine.startSync('u1');

    await engine.signOutEverywhere();

    expect(photos.clearLocalPhotos).toHaveBeenCalled();
  });

  it('otro usuario que el guardado: vacía las fotos del teléfono', async () => {
    storage.setItem(SYNC, JSON.stringify({ userId: 'u1', cursor: null }));
    const { photos, engine } = await load();

    await engine.startSync('u2');

    expect(photos.clearLocalPhotos).toHaveBeenCalled();
  });

  it('cuenta borrada desde otro dispositivo: las fotos quedan sin subir', async () => {
    storage.setItem(SYNC, JSON.stringify({ userId: 'u1', cursor: null }));
    const { remote, photos, engine } = await load();
    vi.mocked(remote.accountGone).mockResolvedValue(true);

    await engine.startSync('u1');

    expect(photos.releaseLocalPhotos).toHaveBeenCalled();
    expect(photos.clearLocalPhotos).not.toHaveBeenCalled();
  });

  it('syncUserId es el usuario de la sesión, o null sin sesión', async () => {
    storage.setItem(SYNC, JSON.stringify({ userId: 'u1', cursor: null }));
    const { engine } = await load();
    expect(engine.syncUserId()).toBeNull();
    await engine.startSync('u1');
    expect(engine.syncUserId()).toBe('u1');
    engine.stopSync();
    expect(engine.syncUserId()).toBeNull();
  });
});
