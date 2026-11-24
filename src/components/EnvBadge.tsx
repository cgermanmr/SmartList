import { APP_ENV, envLabel } from '@/lib/app-env';

/**
 * Etiqueta DEV o LOCAL del header (spec 32), siempre visible: si falta lugar, se trunca el nombre. En producción no
 * dibuja nada. Para lectores de pantalla la dice el nombre del link que la contiene.
 */
export default function EnvBadge() {
  const label = envLabel(APP_ENV);
  if (!label) return null;

  return (
    <span
      aria-hidden="true"
      className="shrink-0 rounded-md bg-accent-400 px-1.5 py-1 text-[11px] font-bold leading-none text-gray-900">
      {label}
    </span>
  );
}
