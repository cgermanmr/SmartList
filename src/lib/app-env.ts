import type { MetadataRoute } from 'next';

// ── Entorno del build (spec 32) ─────
// Puro y sin React: lo importa next.config.ts, que calcula el entorno una sola vez y lo escribe en el código compilado.

/** Producción, preview de Vercel (DEV: la rama dev y los PR) o fuera de Vercel (LOCAL: la computadora y la CI) */
export type AppEnv = 'production' | 'preview' | 'local';

/** Entorno según las variables de Vercel; lanza un error si está en Vercel y no se conoce */
export function resolveAppEnv(env: { VERCEL?: string; VERCEL_ENV?: string }): AppEnv {
  if (!env.VERCEL) return 'local';
  switch (env.VERCEL_ENV) {
    case 'production':
      return 'production';
    case 'preview':
      return 'preview';
    case 'development':
      return 'local';
    default:
      // Mejor sin publicar que publicado con la marca equivocada
      throw new Error(
        'No se conoce el entorno de Vercel: revisar Automatically expose System Environment Variables',
      );
  }
}

/** Entorno de este build, escrito por next.config.ts (env: { APP_ENV }); fuera de Next (los tests), LOCAL */
export const APP_ENV = (process.env.APP_ENV ?? 'local') as AppEnv;

/** 'DEV', 'LOCAL' o null en producción */
export function envLabel(env: AppEnv): 'DEV' | 'LOCAL' | null {
  switch (env) {
    case 'production':
      return null;
    case 'preview':
      return 'DEV';
    case 'local':
      return 'LOCAL';
  }
}

// ── Nombre, títulos e íconos ─────

/** Nombre de la app instalada. La etiqueta va adelante: el celular corta el nombre a unos 12 caracteres */
export function installName(env: AppEnv): string {
  const label = envLabel(env);
  return label ? `${label} Changuito` : 'El Changuito';
}

/** Título de la pestaña: 'El Changuito' → 'DEV · El Changuito'; igual en producción */
export function pageTitle(title: string, env: AppEnv): string {
  const label = envLabel(env);
  return label ? `${label} · ${title}` : title;
}

/** Ícono SVG de public/ (también es el favicon) */
export function iconPath(env: AppEnv): string {
  return `${iconBase(env)}.svg`;
}

function iconBase(env: AppEnv): string {
  const label = envLabel(env);
  return label ? `/icon-${label.toLowerCase()}` : '/icon';
}

/** Manifest de la PWA: entre entornos solo cambian el nombre y los íconos */
export function buildManifest(env: AppEnv): MetadataRoute.Manifest {
  const name = installName(env);
  return {
    name,
    short_name: name,
    description: 'PWA para comparar precios y gestionar compras',
    start_url: '/',
    display: 'standalone',
    background_color: '#faf8fc',
    theme_color: '#5b2a86',
    lang: 'es',
    icons: [
      { src: iconPath(env), sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: `${iconBase(env)}-maskable.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
