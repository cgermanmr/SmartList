import { Suspense } from 'react';
import ProductDetail from './ProductDetail';

// useParams espera la URL (el id no se conoce al compilar): el detalle va dentro de Suspense
export default function ProductPage() {
  return (
    <Suspense fallback={<p className="text-center text-gray-500 py-12" role="status">Cargando…</p>}>
      <ProductDetail />
    </Suspense>
  );
}
