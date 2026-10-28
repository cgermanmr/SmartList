'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/',            label: '🔍 Buscar'       },
  { href: '/upload',      label: '📸 Cargar Precio' },
  { href: '/cart',        label: '🛒 Mi Carrito'    },
  { href: '/purchases',   label: '📋 Historial'     },
  { href: '/calculadora', label: '🧮 Calculadora'   },
];

function isActive(href: string, pathname: string | null) {
  if (pathname === null) return false;
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
}

export function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 flex gap-6 overflow-x-auto whitespace-nowrap">
        {LINKS.map(link => {
          const active = isActive(link.href, pathname);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={`px-4 py-3 font-semibold text-gray-600 hover:text-primary-700 ${active ? 'border-b-2 border-primary-700 text-primary-700' : ''}`}>
              {link.label}
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
