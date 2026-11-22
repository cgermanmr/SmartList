import Link from 'next/link';
import { ReactNode } from 'react';

// ── Acciones de un producto del catálogo (Buscar y la oferta del lector) ─────────────

interface AddToCartButtonProps {
  /** Nombre del producto para el aria-label */
  name: string;
  /** Se están buscando sus precios: deshabilitado con "Buscando precio…" para no agregarlo en $0 */
  loading: boolean;
  onClick: () => void;
  /** Acción de segundo orden: cuando arriba ya hay un "Agregar" por comercio */
  secondary?: boolean;
  className?: string;
  children?: ReactNode;
}

export function AddToCartButton({ name, loading, onClick, secondary = false, className = '', children = 'Agregar al carrito' }: AddToCartButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-busy={loading || undefined}
      aria-label={loading ? `Buscando el precio de ${name}` : `Agregar ${name} al carrito`}
      className={`${secondary ? 'btn-secondary' : 'btn-primary disabled:hover:bg-primary-700'} disabled:cursor-wait disabled:opacity-60 ${className}`}>
      {loading ? 'Buscando precio…' : children}
    </button>
  );
}

/** Link al formulario para cambiar el nombre sugerido o ponerle categoría antes de agregarlo (optativo) */
export function EditLink({ ean }: { ean: string }) {
  return (
    <Link
      href={`/upload?tab=producto&ean=${ean}`}
      className="inline-flex min-h-11 items-center text-sm text-primary-700 underline underline-offset-2 hover:text-primary-800">
      Editar antes de agregar
    </Link>
  );
}
