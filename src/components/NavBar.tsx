'use client';

import { Calculator, CirclePlus, LucideIcon, ReceiptText, Search, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import CartBadge from '@/components/CartBadge';

// `match`: otras rutas en las que la pestaña queda activa (Gastos se abre desde Historial, spec 03)
const LINKS: { href: string; label: string; icon: LucideIcon; match?: string[] }[] = [
  { href: '/',            label: 'Buscar',      icon: Search       },
  { href: '/upload',      label: 'Cargar',      icon: CirclePlus   },
  { href: '/cart',        label: 'Carrito',     icon: ShoppingCart },
  { href: '/purchases',   label: 'Historial',   icon: ReceiptText, match: ['/gastos'] },
  { href: '/calculadora', label: 'Calculadora', icon: Calculator   },
];

function matchesRoute(href: string, pathname: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
}

function isActive(link: { href: string; match?: string[] }, pathname: string | null) {
  if (pathname === null) return false;
  return [link.href, ...(link.match ?? [])].some(href => matchesRoute(href, pathname));
}

/**
 * Navegación: en el celular es la barra inferior (ícono sobre etiqueta, último hijo del layout);
 * desde md va arriba, debajo del header, con el ícono al lado de la etiqueta
 */
export function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Principal"
      className="order-last z-40 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:order-none md:border-t-0 md:border-b md:pb-0">
      <div className="mx-auto flex max-w-6xl md:gap-2 md:px-4">
        {LINKS.map(link => {
          const active = isActive(link, pathname);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-semibold transition-colors hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 md:min-h-12 md:flex-none md:flex-row md:gap-2 md:px-3 md:text-base ${active ? 'text-primary-700' : 'text-gray-500'}`}>
              {/* La activa no depende solo del color: lleva la píldora de fondo */}
              <span className={`relative flex h-7 w-12 items-center justify-center rounded-full md:w-10 ${active ? 'bg-primary-100' : ''}`}>
                <Icon aria-hidden="true" className="h-6 w-6 md:h-5 md:w-5" strokeWidth={active ? 2.4 : 2} />
                {link.href === '/cart' && <CartBadge />}
              </span>
              <span className="max-w-full truncate">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function NavBar() {
  return <NavLinks pathname={usePathname()} />;
}
