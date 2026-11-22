import type { Product } from './models';

// ── Fotos propias (spec 27) ─────────────────────────────────────────────────

export const PHOTO_MAX_SIDE = 800;
export const PHOTO_TARGET_BYTES = 200 * 1024;
export const PHOTO_LIMIT_BYTES = 300 * 1024;   // igual al límite del bucket

/** Foto elegida en un formulario, todavía sin guardar: el JPEG comprimido y su object URL para la vista previa */
export interface PhotoDraft {
  blob: Blob;
  url: string;
}

/** Lado mayor de la segunda pasada, si con 800 px no entra en el límite */
const PHOTO_FALLBACK_SIDE = 600;
const QUALITIES = [0.82, 0.7, 0.6, 0.5];

/** Tamaño que entra en `max` px de lado mayor, sin agrandar */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Ruta del archivo en el bucket */
export function photoPath(userId: string, photoId: string): string {
  return `${userId}/${photoId}.jpg`;
}

/** Ids de las fotos que usan los productos */
export function photoIdsInUse(products: Product[]): Set<string> {
  return new Set(products.flatMap(p => (p.photo ? [p.photo.id] : [])));
}

/** Fotos guardadas que ya no usa ningún producto */
export function unreferencedPhotos(products: Product[], storedIds: string[]): string[] {
  const used = photoIdsInUse(products);
  return storedIds.filter(id => !used.has(id));
}

/** Fotos guardadas sin subir que usa algún producto (las que se suben en la próxima vuelta) */
export function pendingUploads(products: Product[], stored: { id: string; uploaded: boolean }[]): string[] {
  const used = photoIdsInUse(products);
  return stored.filter(s => !s.uploaded && used.has(s.id)).map(s => s.id);
}

/** Qué imagen se muestra: foto propia, image, catálogo */
export function productImageSrc(product: Product, photoUrl?: string, catalogUrl?: string): string | undefined {
  return (product.photo ? photoUrl : undefined) ?? product.image ?? catalogUrl;
}

// ── Compresión en el navegador ──────────────────────────────────────────────

/** Decodifica con la orientación del EXIF ya aplicada; rechaza si no es una imagen que el navegador entienda */
async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, { imageOrientation: 'from-image' });
  }
  // Sin createImageBitmap: un <img> también aplica la orientación (image-orientation: from-image por defecto)
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo exportar la imagen'))), 'image/jpeg', quality);
  });
}

/** Comprime en el navegador (canvas); rechaza si no se puede decodificar */
export async function compressPhoto(file: Blob): Promise<Blob> {
  const image = await decode(file);
  const sourceWidth = 'naturalWidth' in image ? image.naturalWidth : image.width;
  const sourceHeight = 'naturalHeight' in image ? image.naturalHeight : image.height;
  if (!sourceWidth || !sourceHeight) throw new Error('Imagen vacía');

  try {
    for (const side of [PHOTO_MAX_SIDE, PHOTO_FALLBACK_SIDE]) {
      const { width, height } = fitWithin(sourceWidth, sourceHeight, side);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Sin canvas');
      // Fondo blanco: un PNG con transparencia quedaría negro en JPEG
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);

      // Volver a codificar en el canvas descarta todo el EXIF (ubicación, fecha, cámara)
      let blob: Blob | undefined;
      for (const quality of QUALITIES) {
        blob = await toJpeg(canvas, quality);
        if (blob.size <= PHOTO_TARGET_BYTES) return blob;
      }
      if (blob && blob.size <= PHOTO_LIMIT_BYTES) return blob;
    }
    throw new Error('La foto no entra en el límite');
  } finally {
    if ('close' in image) image.close();
  }
}
