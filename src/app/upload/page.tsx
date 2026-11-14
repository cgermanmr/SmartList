import { Suspense } from 'react';
import UploadForm from './UploadForm';

// useSearchParams espera la URL (los parámetros no se conocen al compilar): el formulario va dentro de Suspense
export default function UploadPage() {
  return (
    <Suspense fallback={<p className="text-center text-gray-500 py-12" role="status">Cargando…</p>}>
      <UploadForm />
    </Suspense>
  );
}
