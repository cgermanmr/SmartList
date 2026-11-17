import { useEffect, useState } from 'react';
import { getSepaImages, sepaEnabled } from '@/lib/sepa';

const EMPTY = new Map<string, string>();

/**
 * Imágenes de varios EAN en una sola consulta (`getSepaImages`, con caché). El mapa tiene solo los EAN con imagen:
 * sin EAN, sin Supabase, mientras carga o con error no están, y la pantalla muestra el marcador sin mensajes. Las
 * respuestas se acumulan durante la vida del componente (la imagen de un EAN no cambia durante la sesión): al
 * cambiar los EAN, solo se piden los nuevos.
 */
export function useSepaImages(eans: readonly (string | undefined)[]): Map<string, string> {
  const key = [...new Set(eans.filter((ean): ean is string => Boolean(ean)))].sort().join(',');
  const active = sepaEnabled && key !== '';
  const [images, setImages] = useState(EMPTY);

  useEffect(() => {
    if (!active) return;
    getSepaImages(key.split(',')).then(
      found => {
        setImages(prev => {
          const fresh = [...found].filter(([ean, url]) => prev.get(ean) !== url);
          return fresh.length === 0 ? prev : new Map([...prev, ...fresh]);
        });
      },
      () => {},   // con error quedan los marcadores
    );
  }, [active, key]);

  return active ? images : EMPTY;
}
