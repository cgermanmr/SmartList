/**
 * Changuito de la marca: el mismo dibujo que public/icon.svg. Toma el color del texto (currentColor). `size` (px) es
 * para opengraph-image, donde no hay clases de Tailwind.
 */
export default function Logo({ className, size }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}>
      <path d="M2.5 4h2.6l2.3 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.45-1.1L20.5 8H6.2" />
      <circle cx="9.5" cy="19.5" r="1.4" fill="currentColor" />
      <circle cx="17.5" cy="19.5" r="1.4" fill="currentColor" />
    </svg>
  );
}
