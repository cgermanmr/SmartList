import type { Metadata, Viewport } from 'next';
import { Nunito_Sans, Rubik } from 'next/font/google';
import Link from 'next/link';
import { Suspense } from 'react';
import AccountButton from '@/components/AccountButton';
import AppName from '@/components/AppName';
import CartSummary from '@/components/CartSummary';
import EnvBadge from '@/components/EnvBadge';
import Logo from '@/components/Logo';
import NavBar, { NavLinks } from '@/components/NavBar';
import StoreHydrator from '@/components/StoreHydrator';
import SyncManager from '@/components/SyncManager';
import WhatsAppButton from '@/components/WhatsAppButton';
import { APP_ENV, envLabel, iconPath, pageTitle } from '@/lib/app-env';
import { APP_DESCRIPTION, APP_URL } from '@/lib/share';
import './globals.css';

// Fuentes servidas desde el propio dominio: Rubik para títulos y precios, Nunito Sans para el texto
const rubik = Rubik({ subsets: ['latin'], display: 'swap', variable: '--font-rubik' });
const nunitoSans = Nunito_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-nunito-sans' });

// DEV o LOCAL; null en producción (spec 32)
const ENV_LABEL = envLabel(APP_ENV);

export const metadata: Metadata = {
  // Las imágenes de la vista previa (opengraph-image) se publican con la dirección de producción
  metadataBase: new URL(APP_URL),
  // La vista previa del link (openGraph) es la de producción en todos los entornos (spec 32)
  title: { default: pageTitle('El Changuito', APP_ENV), template: pageTitle('%s', APP_ENV) },
  description: APP_DESCRIPTION,
  // Sin `url` ni canonical: un link a otra página (por ejemplo, una invitación a un grupo) conserva su dirección
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    siteName: 'El Changuito',
    title: 'El Changuito',
    description: APP_DESCRIPTION,
  },
  manifest: '/manifest.json',
  icons: {
    icon: iconPath(APP_ENV),
    // Lo genera apple-icon.tsx; con `icons` definido acá, Next no agrega solo el link
    apple: { url: '/apple-icon', sizes: '180x180', type: 'image/png' },
  },
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
              <div className="flex min-w-0 items-center">
                {/* El relleno lateral suma área de toque: sin el nombre a la vista, el logo solo mide 28 px */}
                <Link
                  href="/"
                  aria-label={ENV_LABEL ? `El Changuito, versión ${ENV_LABEL}` : undefined}
                  className={`-ml-3 flex min-h-11 min-w-0 items-center gap-2 rounded-xl pl-3 pr-1 font-display text-xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${ENV_LABEL ? 'max-[359px]:gap-1 max-[359px]:pr-0' : ''}`}>
                  {/* Con etiqueta, a 320 px y con carrito no entra todo: cede el logo, no la etiqueta ni el total */}
                  <Logo className={`h-7 w-7 text-accent-400 ${ENV_LABEL ? 'min-w-0' : 'shrink-0'}`} />
                  <AppName />
                  <EnvBadge />
                </Link>
                <WhatsAppButton />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <AccountButton />
                <CartSummary />
              </div>
            </div>
          </header>

          {/* usePathname espera la URL en las rutas dinámicas: mientras tanto, nav sin link activo */}
          <Suspense fallback={<NavLinks pathname={null} />}>
            <NavBar />
          </Suspense>

          <main className="flex-1 overflow-y-auto max-w-6xl mx-auto w-full px-4 py-6">
            <StoreHydrator>
              <SyncManager />
              {children}
            </StoreHydrator>
          </main>

          <footer className="hidden bg-gray-800 py-3 text-center text-xs text-white md:block">
            El Changuito © 2024 - PWA para comparar precios
          </footer>
        </div>
      </body>
    </html>
  );
}
