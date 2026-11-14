import Link from 'next/link';
import { Product } from '@/lib/models';

interface Props {
  product: Product;
  /** Al seguir el link: p. ej. cerrar el modal donde aparece el aviso */
  onNavigate?: () => void;
}

/** Aviso de un código de barras repetido, con link al producto que ya lo tiene */
export default function DuplicateProduct({ product, onNavigate }: Props) {
  return (
    <>
      Ya tenés este producto:{' '}
      <Link href={`/product/${product.id}`} onClick={onNavigate} className="font-semibold underline">{product.name}</Link>
    </>
  );
}
