import { formatIsoDate, formatMoney, formatNumber } from './format';
import { toGtin13 } from './gtin';
import { CartItem, Price, Product, StoreRef } from './models';
import { productFromSepa } from './product-form';
import { SepaBranch, SepaProduct, storeRefFromBranch, suggestedName } from './sepa';
import { APP_URL } from './share';
import { groupCartByStore, initialCartPrice } from './store';

// Compartir el carrito o una compra por WhatsApp (spec 31). Los datos viajan dentro del link, después del `#`: no
// pasan por ningún servidor. Todo lo que llega en un link se valida antes de usarlo.

export const MAX_SHARED_ITEMS = 100;
export const MAX_MESSAGE_ITEMS = 40;

const SHARED_PATH = '/cart/compartido';
const VERSION = '1';
const MAX_TEXT_CHARS = 200;
const MAX_QUANTITY = 9_999;
const MAX_PRICE = 100_000_000;
const SEPA_ID = /^[0-9]+-[0-9]+-[0-9]+$/;

export interface SharedItem {
  ean?: string;        // GTIN-13
  name?: string;       // obligatorio sin EAN
  quantity: number;
  price?: number;      // sin precio conocido, ausente
  store?: StoreRef;    // sin lat, lng ni chain; con sepaId, solo name y sepaId
}

export interface SharedCart {
  kind: 'cart' | 'purchase';
  date?: string;       // 'AAAA-MM-DD' en hora local, solo en 'purchase'
  items: SharedItem[];
}

export type DecodeResult = { ok: true; cart: SharedCart } | { ok: false; error: 'invalid' | 'incomplete' | 'version' };

// ── Qué se comparte ─────────────────────────────────────────

/**
 * Ítems del carrito o de una compra (con su comercio ya resuelto) tal como viajan. Un producto del catálogo va solo
 * con el EAN; los demás llevan también el nombre. Todo sale dentro de los límites que se validan al abrirlo
 */
export function sharedFromItems(
  items: CartItem[], products: Product[], inCatalog: (ean: string) => boolean,
): SharedItem[] {
  return items.map(item => {
    const ean = toGtin13(products.find(p => p.id === item.productId)?.ean ?? '');
    const price = Math.round(item.price * 100) / 100;
    const store = sharedStore(item.store);
    return {
      ...(ean && { ean }),
      ...(!(ean && inCatalog(ean)) && { name: cleanText(item.productName) || 'Producto' }),
      quantity: Math.min(Math.max(Math.round(item.quantity * 1000) / 1000, 0.001), MAX_QUANTITY),
      ...(price > 0 && price <= MAX_PRICE && { price }),
      ...(store && { store }),
    };
  });
}

/** Nunca viajan las coordenadas: las de un comercio a mano salieron del GPS y las del SEPA se completan al abrirlo */
function sharedStore(store: StoreRef | undefined): StoreRef | null {
  const name = cleanText(store?.name);
  if (!store || !name) return null;
  if (store.sepaId && SEPA_ID.test(store.sepaId)) return { name, sepaId: store.sepaId };
  const barrio = cleanText(store.barrio);
  const address = cleanText(store.address);
  return { name, ...(barrio && { barrio }), ...(address && { address }) };
}

/** Sin espacios de más y hasta 200 caracteres (contados enteros: un emoji no queda cortado) */
function cleanText(text: string | undefined): string {
  return [...(text ?? '').replace(/\s+/g, ' ').trim()].slice(0, MAX_TEXT_CHARS).join('').trim();
}

// ── Mensaje ─────────────────────────────────────────────────

/**
 * Texto del mensaje, sin el link (va en el renglón siguiente). `names`: nombre de cada ítem en el mismo orden (en el
 * mensaje va siempre, aunque no viaje en el link). Lista hasta 40 productos; subtotales y total son de todos
 */
export function shareMessage(cart: SharedCart, names: string[]): string {
  const groups = groupCartByStore(cart.items.map((item, i) => ({
    ...item, label: plainText(names[i]), subtotal: item.quantity * (item.price ?? 0),
  })));
  const single = groups.length === 1 ? groups[0] : null;
  const count = cart.items.length;

  const what = cart.kind === 'purchase' ? `Compra del ${formatIsoDate(cart.date ?? '')}` : 'Mi carrito';
  const where = single?.store ? ` en ${plainText(single.store.name)}` : '';
  const blocks = [`🛒 *${what}${where}* (${count} ${count === 1 ? 'producto' : 'productos'})`];

  let left = MAX_MESSAGE_ITEMS;
  for (const group of groups) {
    const listed = group.items.slice(0, left);
    if (listed.length === 0) break;
    left -= listed.length;
    const heading = single
      ? []
      : [`*${group.store ? plainText(group.store.name) : 'Sin comercio'}* · $${formatMoney(group.total)}`];
    blocks.push([...heading, ...listed.map(item => {
      const amount = item.price === undefined ? 'sin precio' : `$${formatMoney(item.subtotal)}`;
      return `• ${formatNumber(item.quantity, 0, 3)} × ${item.label} · ${amount}`;
    })].join('\n'));
  }
  const more = count - MAX_MESSAGE_ITEMS;
  if (more > 0) blocks.push(`y ${more} ${more === 1 ? 'producto' : 'productos'} más`);

  const total = groups.reduce((sum, group) => sum + group.total, 0);
  blocks.push(`*Total: $${formatMoney(total)}*`, `${cart.kind === 'purchase' ? 'Cargala' : 'Cargalo'} en El Changuito:`);
  return blocks.join('\n\n');
}

/** Sin los caracteres de formato de WhatsApp ni saltos de línea */
function plainText(text: string): string {
  return text.replace(/[*_~`\s]+/g, ' ').trim();
}

// ── Carga en el carrito propio ──────────────────────────────

/** Datos para cargar: productos nuevos e ítems listos para el carrito */
export interface SharedLoad {
  products: Product[];
  items: CartItem[];
}

/** Lo que hace falta para convertir un link en ítems del carrito de quien lo recibe */
export interface SharedContext {
  products: Product[];                  // propios
  prices: Price[];                      // propios
  catalog: Map<string, SepaProduct>;    // por EAN
  branches: SepaBranch[];
  references: Map<string, number>;      // precio de referencia por EAN
  newId: () => string;
}

/**
 * Productos e ítems a cargar. Un producto que ya es propio no se duplica (por EAN o, sin EAN, por nombre) y dos ítems
 * del mismo producto se suman. En un carrito vale el precio del link; en una compra, el de quien recibe
 */
export function resolveSharedCart(cart: SharedCart, context: SharedContext): SharedLoad {
  const load: SharedLoad = { products: [], items: [] };
  for (const shared of cart.items) {
    let product = findOwn(shared, context.products) ?? findOwn(shared, load.products);
    if (!product) {
      product = newProduct(shared, context);
      load.products.push(product);
    }
    const productId = product.id;
    const repeated = load.items.findIndex(item => item.productId === productId);
    if (repeated >= 0) {
      const first = load.items[repeated];
      const quantity = first.quantity + shared.quantity;
      load.items[repeated] = { ...first, quantity, subtotal: first.price * quantity };
      continue;
    }
    const own = initialCartPrice(context.prices, productId, shared.ean ? context.references.get(shared.ean) : undefined);
    const price = cart.kind === 'purchase' ? own || (shared.price ?? 0) : shared.price ?? own;
    const store = sharedStoreRef(shared.store, context.branches);
    load.items.push({
      id: context.newId(), productId, productName: product.name, price, quantity: shared.quantity,
      subtotal: price * shared.quantity, ...(store && { store }),
    });
  }
  return load;
}

/** Nombre a mostrar: el propio, el sugerido del catálogo o el del link; undefined si todavía no se conoce ninguno */
export function sharedItemName(
  item: SharedItem, products: Product[], catalog: Map<string, SepaProduct>,
): string | undefined {
  const sepa = item.ean ? catalog.get(item.ean) : undefined;
  return findOwn(item, products)?.name ?? (sepa ? suggestedName(sepa) : item.name);
}

/** Nombre de un producto que no está en el catálogo y viajó sin nombre */
export function unknownProductName(ean: string | undefined): string {
  return `Producto ${ean ?? ''}`.trim();
}

/** Comercio completo: el de Precios Claros, con los datos de la sucursal si está; uno a mano, como viajó */
export function sharedStoreRef(store: StoreRef | undefined, branches: SepaBranch[]): StoreRef | undefined {
  const branch = store?.sepaId ? branches.find(b => b.id === store.sepaId) : undefined;
  return branch ? storeRefFromBranch(branch) : store;
}

/** 'AAAA-MM-DD' en hora local: el día de una compra */
export function localIsoDate(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** El producto propio de un ítem: con EAN, el que lo tiene; sin EAN, uno sin EAN con el mismo nombre */
export function findOwn(item: SharedItem, products: Product[]): Product | undefined {
  if (item.ean) return products.find(p => p.ean === item.ean);
  const key = nameKey(item.name);
  return products.find(p => !p.ean && nameKey(p.name) === key);
}

function nameKey(name: string | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function newProduct(item: SharedItem, { catalog, newId }: SharedContext): Product {
  const sepa = item.ean ? catalog.get(item.ean) : undefined;
  if (sepa) return productFromSepa(sepa, newId());
  return { id: newId(), name: item.name ?? unknownProductName(item.ean), ...(item.ean && { ean: item.ean }) };
}

// ── Link ────────────────────────────────────────────────────
// Registros separados por `.` y campos por `-`; los campos vacíos del final se omiten. Números en base 36 y textos
// (UTF-8) en base 62: solo letras, dígitos, `.` y `-`, que WhatsApp deja enteros dentro del link.

export function sharedCartUrl(cart: SharedCart): string {
  return `${APP_URL}${SHARED_PATH}#${encodeSharedCart(cart)}`;
}

/** Los datos de un link compartido dentro de cualquier texto (con cualquier dominio); null si no hay */
export function findSharedPayload(text: string): string | null {
  return text.match(/\/cart\/compartido\/?#([0-9A-Za-z.-]+)/)?.[1] ?? null;
}

export function encodeSharedCart(cart: SharedCart): string {
  const stores = new Map<string, number>();   // registro → número, desde 1
  const items = cart.items.map(item => {
    let storeNumber = '';
    if (item.store) {
      const { name, barrio, address, sepaId } = item.store;
      const storeRecord = record('s', [name, barrio, address, sepaId].map(text => (text ? encodeText(text) : '')));
      if (!stores.has(storeRecord)) stores.set(storeRecord, stores.size + 1);
      storeNumber = encodeNumber(stores.get(storeRecord)!);
    }
    return record('i', [
      item.ean ? encodeNumber(Number(item.ean)) : '',
      encodeNumber(Math.round(item.quantity * 1000)),
      item.price ? encodeNumber(Math.round(item.price * 100)) : '',
      storeNumber,
      item.name ? encodeText(item.name) : '',
    ]);
  });
  const header = cart.kind === 'purchase'
    ? record(`${VERSION}p`, [encodeNumber(Number((cart.date ?? '').replaceAll('-', '')))])
    : `${VERSION}c`;
  return [header, ...stores.keys(), ...items, record('e', [encodeNumber(items.length)])].join('.');
}

/** Lee los datos de un link. Un solo dato inválido invalida el link; sin el registro de cierre, está incompleto */
export function decodeSharedCart(payload: string): DecodeResult {
  if (!/^[0-9A-Za-z.-]+$/.test(payload)) return { ok: false, error: 'invalid' };
  const version = payload.match(/^[0-9]+/)?.[0];
  if (version === undefined) return { ok: false, error: 'invalid' };
  if (version !== VERSION) return { ok: false, error: 'version' };

  // El punto final de una frase puede quedar pegado al link
  const records = payload.replace(/\.+$/, '').split('.').map(text => text.split('-'));
  const [header, ...body] = records;
  const isHeader = header[0] === `${VERSION}c` || header[0] === `${VERSION}p` || (records.length === 1 && header[0] === VERSION);
  if (!isHeader) return { ok: false, error: 'invalid' };

  // El cierre se mira primero: en un link cortado, el último registro puede ser cualquier cosa
  const end = body.pop();
  const itemCount = body.filter(([type]) => type === 'i').length;
  if (!end || end[0] !== 'e' || end.length !== 2 || decodeNumber(end[1]) !== itemCount) {
    return { ok: false, error: 'incomplete' };
  }

  const cart = itemCount >= 1 && itemCount <= MAX_SHARED_ITEMS ? readCart(header, body) : null;
  return cart ? { ok: true, cart } : { ok: false, error: 'invalid' };
}

function readCart(header: string[], body: string[][]): SharedCart | null {
  const storeRecords = body.filter(([type]) => type === 's');
  if (storeRecords.length > MAX_SHARED_ITEMS) return null;
  const stores: StoreRef[] = [];
  for (const fields of storeRecords) {
    const store = readStore(fields);
    if (!store) return null;
    stores.push(store);
  }
  const items: SharedItem[] = [];
  for (const fields of body) {
    if (fields[0] === 's') continue;
    const item = fields[0] === 'i' ? readItem(fields, stores) : null;
    if (!item) return null;
    items.push(item);
  }
  if (header[0] === `${VERSION}c`) return header.length === 1 ? { kind: 'cart', items } : null;
  const date = header.length === 2 ? readDate(header[1]) : null;
  return date ? { kind: 'purchase', date, items } : null;
}

function readStore(fields: string[]): StoreRef | null {
  if (fields.length > 5) return null;
  const [name, barrio, address, sepaId] = fields.slice(1).map(text => (text ? decodeText(text) : undefined));
  if (!name || barrio === null || address === null || sepaId === null) return null;
  if (sepaId !== undefined && !SEPA_ID.test(sepaId)) return null;
  return { name, ...(barrio && { barrio }), ...(address && { address }), ...(sepaId && { sepaId }) };
}

function readItem(fields: string[], stores: StoreRef[]): SharedItem | null {
  if (fields.length > 6) return null;
  const [, eanText = '', quantityText = '', priceText = '', storeText = '', nameText = ''] = fields;

  const item: SharedItem = { quantity: (decodeNumber(quantityText) ?? 0) / 1000 };
  if (!(item.quantity > 0 && item.quantity <= MAX_QUANTITY)) return null;

  if (eanText) {
    const digits = decodeNumber(eanText);
    const ean = digits === null ? null : String(digits).padStart(13, '0');
    if (ean === null || ean.length !== 13 || toGtin13(ean) === null) return null;
    item.ean = ean;
  }
  if (priceText) {
    const cents = decodeNumber(priceText);
    if (cents === null || cents / 100 > MAX_PRICE) return null;
    if (cents > 0) item.price = cents / 100;
  }
  if (storeText) {
    const store = stores[(decodeNumber(storeText) ?? 0) - 1];
    if (!store) return null;
    item.store = store;
  }
  if (nameText) {
    const name = decodeText(nameText);
    if (name === null) return null;
    item.name = name;
  }
  return item.ean || item.name ? item : null;
}

/** AAAAMMDD en base 36 → 'AAAA-MM-DD'; null si no es un día que exista */
function readDate(text: string): string | null {
  const digits = String(decodeNumber(text) ?? '');
  if (!/^[0-9]{8}$/.test(digits)) return null;
  const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) ? iso : null;
}

// ── Números y textos del link ───────────────────────────────

const BASE_62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/** Más largo que 200 caracteres de 4 bytes en base 62 (1.076): no hace falta decodificarlo para saber que no sirve */
const MAX_TEXT_FIELD = 1_100;

function record(type: string, fields: string[]): string {
  return [type, ...fields].join('-').replace(/-+$/, '');
}

function encodeNumber(value: number): string {
  return value.toString(36);
}

/** Entero en base 36 en minúsculas; null si no lo es (10 dígitos alcanzan para un EAN y siguen siendo exactos) */
function decodeNumber(text: string): number | null {
  return /^[0-9a-z]{1,10}$/.test(text) ? parseInt(text, 36) : null;
}

/** UTF-8 como un solo número en base 62; el 1 de adelante conserva los bytes en cero del principio */
function encodeText(text: string): string {
  const hex = Array.from(new TextEncoder().encode(text), byte => byte.toString(16).padStart(2, '0')).join('');
  let value = BigInt(`0x1${hex}`);
  let encoded = '';
  while (value > 0n) {
    encoded = BASE_62[Number(value % 62n)] + encoded;
    value /= 62n;
  }
  return encoded;
}

/** null si no es UTF-8, está en blanco o pasa de 200 caracteres */
function decodeText(encoded: string): string | null {
  if (encoded.length > MAX_TEXT_FIELD) return null;
  let value = 0n;
  for (const char of encoded) value = value * 62n + BigInt(BASE_62.indexOf(char));
  const hex = value.toString(16);
  if (hex[0] !== '1' || hex.length % 2 === 0) return null;
  const bytes = Uint8Array.from(hex.slice(1).match(/../g) ?? [], pair => parseInt(pair, 16));
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return text.trim() && [...text].length <= MAX_TEXT_CHARS ? text : null;
  } catch {
    return null;
  }
}
