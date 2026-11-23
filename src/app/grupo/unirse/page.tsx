import { Suspense } from 'react';
import JoinGroup from './JoinGroup';

/** Unirse a un grupo con el link de invitación (spec 22): useSearchParams necesita un Suspense arriba */
export default function JoinGroupPage() {
  return (
    <Suspense fallback={<p role="status" className="py-12 text-center text-gray-500">Cargando…</p>}>
      <JoinGroup />
    </Suspense>
  );
}
