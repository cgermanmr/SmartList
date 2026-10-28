'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Rutas desconocidas → Buscar */
export default function NotFound() {
  const router = useRouter();

  useEffect(() => router.replace('/'), [router]);

  return <p className="text-center text-gray-500 py-12" role="status">Redirigiendo…</p>;
}
