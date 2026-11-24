import { BadgeCheck, TriangleAlert } from 'lucide-react';
import type { ValidationStatus } from '@/lib/price-validation';

/**
 * Insignia del estado de un precio del grupo (spec 23): "Validado" en verde o "Dudoso" en ámbar, siempre con texto e
 * ícono (no solo color). Sin validar no muestra nada
 */
export default function ValidationBadge({ status }: { status: ValidationStatus }) {
  if (status === 'sin_validar') return null;
  const validated = status === 'validado';
  const Icon = validated ? BadgeCheck : TriangleAlert;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 align-middle text-xs font-semibold ${
      validated ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
      <Icon aria-hidden="true" className="size-3.5" />
      {validated ? 'Validado' : 'Dudoso'}
    </span>
  );
}
