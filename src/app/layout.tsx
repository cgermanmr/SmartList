import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import CartSummary from '@/components/CartSummary';
import NavBar, { NavLinks } from '@/components/NavBar';
import StoreHydrator from '@/components/StoreHydrator';
import './globals.css';

export const metadata: Metadata = {
  title: 'PrecioLocal - Carrito de Compras',
  description: 'PWA para comparar precios y gestionar compras',
  manifest: '/manifest.json',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#0f766e',
};
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es">
      <body>
        <div className="flex flex-col h-screen bg-gray-50">
          <header className="bg-gradient-to-r from-primary-700 to-primary-600 text-white shadow-lg">
            <div className="max-w-6xl mx-auto px-4 py-4">
              <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">💰 PrecioLocal</h1>
                <CartSummary />
              </div>
            </div>
          </header>

          {/* usePathname espera la URL en las rutas dinámicas: mientras tanto, nav sin link activo */}
          <Suspense fallback={<NavLinks pathname={null} />}>
            <NavBar />
          </Suspense>

          <main className="flex-1 overflow-y-auto max-w-6xl mx-auto w-full px-4 py-6">
            <StoreHydrator>{children}</StoreHydrator>
          </main>

          <footer className="bg-gray-800 text-white text-center py-3 text-xs">
            PrecioLocal © 2024 - PWA para comparar precios
          </footer>
        </div>
      </body>
    </html>
  );
}
