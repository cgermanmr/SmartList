import { APP_ENV, buildManifest } from '@/lib/app-env';

/**
 * Manifest de la PWA según el entorno (spec 32), estático. Es un route handler y no app/manifest.ts para conservar la
 * dirección /manifest.json: con otra, Android puede tomarla como otra app.
 */
export function GET() {
  return Response.json(buildManifest(APP_ENV));
}
