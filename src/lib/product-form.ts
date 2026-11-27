import { toGtin13 } from './gtin';
import { Product, ProductOrigin, Unit } from './models';
import { SepaProduct, suggestedName } from './sepa';

// Reglas del formulario de producto: validación del código de barras y paso de catálogo a formulario y a producto.

export interface ProductForm {
  name: string;
  category: string;
  ean: string;
  brand: string;
  size: string;
  sizeUnit: Unit;
}

export type EanCheck =
  | { status: 'empty' }
  | { status: 'ok'; ean: string }
  | { status: 'invalid' }
  | { status: 'duplicate'; product: Product };

export const SIZE_UNITS: Unit[] = ['g', 'kg', 'ml', 'l', 'u'];

export const EMPTY_PRODUCT_FORM: ProductForm = { name: '', category: '', ean: '', brand: '', size: '', sizeUnit: 'g' };

// ── Categorías ─────────────────────────────────────────────

/** Categorías que se sugieren siempre, además de las de los productos propios */
export const CATEGORIES = ['Lacteos', 'Almacen', 'Aceites', 'Proteina', 'Bebidas', 'Verduras', 'Frutas', 'Limpieza'];

/** Compara sin distinguir mayúsculas ni acentos ("ñ" y "n" son distintas) */
const collator = new Intl.Collator('es-AR', { sensitivity: 'base' });

/**
 * Sugerencias de categoría: las de los productos propios y las fijas, sin repetir y en orden alfabético. El orden es
 * estable y las propias van primero: entre dos iguales queda la escritura propia
 */
export function categorySuggestions(products: Product[]): string[] {
  const own = products.map(p => p.category?.trim() ?? '').filter(Boolean);
  return [...own, ...CATEGORIES]
    .sort(collator.compare)
    .filter((category, i, sorted) => i === 0 || collator.compare(category, sorted[i - 1]) !== 0);
}

// ── Formulario ─────────────────────────────────────────────

/** Valida y normaliza un código a GTIN-13; `exceptId` deja afuera al producto que ya lo tiene al vincular */
export function checkEan(text: string, products: Product[], exceptId?: string): EanCheck {
  const code = text.trim();
  if (!code) return { status: 'empty' };
  const ean = toGtin13(code);
  if (!ean) return { status: 'invalid' };
  const product = products.find(p => p.ean === ean && p.id !== exceptId);
  return product ? { status: 'duplicate', product } : { status: 'ok', ean };
}

/** Formulario completo con un resultado del catálogo; la categoría es manual y se conserva */
export function formFromSepa(product: SepaProduct, category: string): ProductForm {
  return {
    name: suggestedName(product),
    category,
    ean: product.ean,
    brand: product.brand ?? '',
    size: product.size === null ? '' : String(product.size),
    sizeUnit: product.sizeUnit ?? EMPTY_PRODUCT_FORM.sizeUnit,
  };
}

/**
 * Cambios al vincular un producto propio con uno del catálogo. Sin EAN (vincular): completa marca y presentación
 * solo si están vacías. Con EAN (cambiar vínculo): las reemplaza, salvo lo que el catálogo trae vacío.
 * Nunca toca el nombre ni la categoría.
 */
export function sepaLinkChanges(product: Product, sepa: SepaProduct): Partial<Omit<Product, 'id'>> {
  const relink = product.ean !== undefined;
  const changes: Partial<Omit<Product, 'id'>> = { ean: sepa.ean };
  if (sepa.brand && (relink || !product.brand)) changes.brand = sepa.brand;
  if (sepa.size !== null && sepa.sizeUnit && (relink || product.size === undefined)) {
    changes.size = sepa.size;
    changes.sizeUnit = sepa.sizeUnit;
  }
  return changes;
}

/**
 * Producto desde el formulario. `ean` ya pasó por checkEan; la presentación va completa o no va. La categoría es
 * opcional: vacía no se guarda (ni como texto vacío). El origen es 'manual' salvo que quien llama sepa que el
 * formulario lo completó el catálogo con ese mismo EAN (Agregar producto, spec 36)
 */
export function productFromForm(form: ProductForm, id: string, ean?: string, origin: ProductOrigin = 'manual'): Product {
  const size = Number(form.size);
  const hasSize = size > 0;
  return {
    id,
    name: form.name.trim(),
    category: form.category.trim() || undefined,
    ean,
    brand: form.brand.trim() || undefined,
    size: hasSize ? size : undefined,
    sizeUnit: hasSize ? form.sizeUnit : undefined,
    origin,
  };
}

/** Producto propio a partir del catálogo: nombre sugerido (suggestedName), marca, presentación y EAN; sin categoría */
export function productFromSepa(sepa: SepaProduct, id: string): Product {
  const { size, sizeUnit } = sepa;
  const hasSize = size !== null && size > 0 && sizeUnit !== null;
  return {
    id,
    name: suggestedName(sepa),
    ean: sepa.ean,
    brand: sepa.brand?.trim() || undefined,
    size: hasSize ? size : undefined,
    sizeUnit: hasSize ? sizeUnit : undefined,
    origin: 'sepa',
  };
}

// ── Origen del producto (spec 36) ────────────────────────────

/** Origen de un producto guardado antes de la spec 36: con código y sin categoría es lo que deja productFromSepa */
export function inferOrigin(product: Product): ProductOrigin {
  return product.ean && !product.category ? 'sepa' : 'manual';
}

/** Escribe el origen de los productos que no lo tienen; el mismo array si no cambió ninguno */
export function withOrigins(products: Product[]): Product[] {
  if (products.every(p => p.origin !== undefined)) return products;
  return products.map(p => p.origin !== undefined ? p : { ...p, origin: inferOrigin(p) });
}

/** Producto de Precios Claros: sin Cambiar vínculo ni Quitar vínculo. Sin origen cuenta como cargado a mano */
export function isFromSepa(product: Product): boolean {
  return product.origin === 'sepa';
}
