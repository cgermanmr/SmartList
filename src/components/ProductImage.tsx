import { useState } from 'react';
import { initialOf } from '@/lib/format';

interface ProductImageProps {
  /** URL de la imagen; sin ella (o si falla la carga) se ve el marcador */
  src?: string;
  /** Nombre del producto: de acá sale la inicial del marcador */
  name: string;
  /** Lado del cuadro, en px */
  size: 40 | 48 | 64 | 160;
}

/** Cuadro, esquinas y tamaño de la inicial (cerca del 45 % del lado) de cada tamaño */
const SIZES: Record<ProductImageProps['size'], string> = {
  40: 'size-10 rounded-xl text-lg',
  48: 'size-12 rounded-xl text-[1.375rem]',
  64: 'size-16 rounded-xl text-[1.75rem]',
  160: 'size-40 rounded-2xl text-7xl',
};

/**
 * Imagen de un producto, o un cuadro con la inicial de su nombre cuando no hay o no carga (spec 17).
 * El marcador está siempre debajo y la imagen se muestra encima recién cuando terminó de cargar: el cuadro ocupa
 * el mismo espacio en los tres casos y la lista no salta. Es decorativa: el nombre ya está al lado.
 */
export default function ProductImage({ src, name, size }: ProductImageProps) {
  // Se guarda la URL que cargó o falló, no un booleano: si cambia el src, el resultado anterior se olvida solo
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <span
      aria-hidden="true"
      className={`relative flex shrink-0 select-none items-center justify-center overflow-hidden border border-gray-200 bg-primary-50 font-display font-semibold leading-none text-primary-700 ${SIZES[size]}`}>
      {initialOf(name)}
      {src && failed !== src && (
        // <img> común y no next/image: el optimizador de Vercel tiene cuota y obliga a declarar los dominios
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(src)}
          onError={() => setFailed(src)}
          className={`absolute inset-0 size-full bg-white object-contain ${loaded === src ? '' : 'opacity-0'}`}
        />
      )}
    </span>
  );
}
