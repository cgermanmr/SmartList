import type { Metadata, Viewport } from 'next';
import { Nunito_Sans, Rubik } from 'next/font/google';
import Link from 'next/link';
import { Suspense } from 'react';
import CartSummary from '@/components/CartSummary';
import Logo from '@/components/Logo';
import NavBar, { NavLinks } from '@/components/NavBar';
import StoreHydrator from '@/components/StoreHydrator';
import './globals.css';

// Fuentes servidas desde el propio dominio: Rubik para títulos y precios, Nunito Sans para el texto
const rubik = Rubik({ subsets: ['latin'], display: 'swap', variable: '--font-rubik' });
const nunitoSans = Nunito_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-nunito-sans' });

export const metadata: Metadata = {
  title: 'El Changuito',
  description: 'PWA para comparar precios y gestionar compras',
  manifest: '/manifest.json',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#5b2a86',
  // La app llega hasta los bordes: el header y la barra inferior suman el área segura (notch y barra de gestos)
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${rubik.variable} ${nunitoSans.variable}`}>
      <body>
        {/* En el celular la navegación es el último hijo (order-last): el scroll es de <main> y nada queda tapado */}
        <div className="flex h-dvh flex-col bg-gray-50">
          <header className="bg-primary-700 pt-[env(safe-area-inset-top)] text-white">
            <div className="mx-auto flex h-13 max-w-6xl items-center justify-between gap-3 px-4">
              <Link
                href="/"
                className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl font-display text-xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                <Logo className="h-7 w-7 shrink-0 text-accent-400" />
                <span className="truncate">El Changuito</span>
              </Link>
              <CartSummary />
            </div>
          </header>

          {/* usePathname espera la URL en las rutas dinámicas: mientras tanto, nav sin link activo */}
          <Suspense fallback={<NavLinks pathname={null} />}>
            <NavBar />
          </Suspense>

          <main className="flex-1 overflow-y-auto max-w-6xl mx-auto w-full px-4 py-6">
            <StoreHydrator>{children}</StoreHydrator>
          </main>

          <footer className="hidden bg-gray-800 py-3 text-center text-xs text-white md:block">
            El Changuito © 2024 - PWA para comparar precios
          </footer>
        </div>
      </body>
    </html>
  );
}
