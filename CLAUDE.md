# El Changuito — Next.js 16

Estado actual del proyecto: propósito, arquitectura, funcionalidades, puesta en marcha y despliegue.
Roadmap, features futuros e ideas viven en [`docs/`](docs/README.md).

@AGENTS.md

> Next.js 16 cambió APIs y convenciones (Cache Components, Partial Prefetching, `instant`). Antes de usar una API
> de Next, leer la guía correspondiente en `node_modules/next/dist/docs/`.

## Propósito del Proyecto

**El Changuito** es una PWA para que los vecinos registren y consulten precios de productos en distintos
comercios/barrios, armen un carrito de compras comparando contra precios anteriores y lleven un historial de compras.

- UI completamente en **español** (números y fechas en `es-AR`: `1.234,56`, `28/10/2026 16:05`; moneda `$`)
- Fase actual: **Fase 1 — Frontend Next.js con localStorage**, publicado en Vercel, y comienzo de la **Fase 2**:
  cuenta optativa (Google o código por mail) que sincroniza los datos propios con Supabase
  ([SPEC 21](specs/21-cuenta-y-sincronizacion.md)); sin cuenta, todo queda en el teléfono. Aparte, una base
  Supabase de solo lectura con los precios de Precios Claros (SEPA), actualizada a diario por una tarea programada
  de Windows en una PC con IP argentina (el portal bloquea a GitHub Actions desde el 17/11/2026)
  ([SPEC 08](specs/08-base-sepa-supabase.md), [SPEC 09](specs/09-actualizacion-diaria-sepa.md)). La app consulta
  su catálogo de productos para cargar y vincular productos por código de barras
  ([SPEC 10](specs/10-productos-con-codigo-de-barras.md)) y sus precios por cadena como referencia
  ([SPEC 12](specs/12-precio-de-referencia-sepa.md)), y sus sucursales para mostrar el precio en los comercios
  cercanos ([SPEC 15](specs/15-precios-y-comercios-cercanos.md)); los datos propios siguen en localStorage. El mapa
  de un comercio con la ruta para llegar usa OpenStreetMap ([SPEC 16](specs/16-mapa-y-como-llegar.md)). Las imágenes
  de los productos con código de barras salen de Open Food Facts y del portal Precios Claros, resueltas por un script
  semanal ([SPEC 17](specs/17-imagenes-de-productos.md)); cada producto propio puede llevar una foto propia, privada,
  en el teléfono y con cuenta en un bucket privado ([SPEC 27](specs/27-fotos-propias.md))
- Objetivo: lista de precios personal/familiar para comparar compras entre fechas y analizar la suba de precios y el gasto
- Roadmap: Fase 2 (Supabase: Postgres + Auth + Realtime), Fase 3 (React Native móvil), Fase 4 (microservicios) — detalle en [`docs/roadmap.md`](docs/roadmap.md)
- Hasta la [SPEC 06](specs/06-migracion-nextjs-vercel.md) la app era Angular 19; las specs 01–02 describen esa versión
- Se llamaba **PrecioLocal** hasta la [SPEC 07](specs/07-nombre-el-changuito.md)

---

## Stack Tecnológico

| Tecnología | Versión | Rol |
|---|---|---|
| Next.js | 16.4 | Framework (App Router, Turbopack, `cacheComponents` + `partialPrefetching`) |
| React | 19.3 | UI |
| TypeScript | ^5 | Lenguaje (strict + `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride`) |
| Tailwind CSS | ^4 | Estilos (utility-first, mobile-first; loader `@tailwindcss/turbopack`, sin `tailwind.config.js`) |
| Zustand | ^5 | Estado global |
| @supabase/supabase-js | ^2.119 | Catálogo SEPA desde el navegador (clave publishable) y, con cuenta, auth, sincronización de `user_records` (spec 21) y fotos propias en Storage (spec 27) |
| barcode-detector | ^3.2 | Ponyfill de `BarcodeDetector` (ZXing en WebAssembly) para el lector de códigos de barras |
| leaflet | ^1.9 | Mapa del comercio con teselas de OpenStreetMap; se carga con `import()` al abrir el primer mapa |
| lucide-react | ^1.73 | Íconos SVG (solo entran al bundle los que se usan); no se usan emojis como ícono |
| Vitest | ^5 | Tests de la lógica pura |
| ESLint | ^9 | Lint (`eslint-config-next`: core-web-vitals + typescript + reglas del React Compiler) |
| Node.js | ≥ 24 | Runtime (local, CI y Vercel); los scripts del ETL corren como `.ts` sin compilar |
| Supabase | CLI ^2 | Postgres de la base SEPA: migraciones en `supabase/migrations/`, carga con `pg` |

---

## Estructura del Proyecto

```
.github/workflows/ci.yml        # lint + test + build en cada push a main/dev y en cada PR
.github/workflows/sepa.yml      # ETL del SEPA: 15:30 y 21:30 hora argentina y a mano (opción force); desactivado
                                #   desde el 21/11/2026 (403 del portal), ver Build y Despliegue
.github/workflows/sepa-images.yml # Imágenes de productos: domingos 06:00 hora argentina y a mano
docs/                           # Roadmap, features futuros (features/NN-*.md) e ideas
specs/                          # Specs NN-*.md (una por cambio)
.mcp.json                       # MCP de Supabase del proyecto (sin secretos)
.env.example                    # Variables de entorno; las reales van en .env.local (ignorado)
scripts/copy-zxing-wasm.ts      # postinstall: copia el .wasm de ZXing a public/ (no se versiona)
scripts/sepa/                   # ETL del SEPA (Node + TypeScript sin compilar), con sus *.test.ts
├── etl.ts                      # Punto de entrada: --file, --dry-run, --force; chequeo previo, descarga con reintentos,
│                               #   estadísticas, regla de 3 días, código de salida
├── read-zip.ts                 # Lectura en streaming del ZIP externo, los ZIP internos y los CSV
├── clean.ts                    # Limpieza pura de campos (EAN, precios, presentación, pie de archivo, sucursales)
├── aggregate.ts                # Agregación por EAN × bandera (mínimo, mediana, máximo, sucursales) y por sucursal
├── load.ts                     # Carga en una transacción con pg, bloqueo de sesión y registro en sepa_cargas
├── summary.ts                  # Resumen Markdown de la ejecución para el job summary de GitHub
├── images.ts                   # npm run sepa:images: imágenes por EAN de Open Food Facts y del portal → sepa_imagenes
├── run-local.ps1               # Corre sepa:etl o sepa:images, guarda el log en %LOCALAPPDATA%\el-changuito\logs
│                               #   y manda el mail con el resultado
├── install-tasks.ps1           # Registra las tareas programadas de Windows (ETL diario, imágenes los domingos)
└── set-mail.ps1                # Configura el SMTP de los avisos (Gmail por defecto); contraseña cifrada con DPAPI
supabase/
├── config.toml                 # Proyecto de la CLI (supabase init)
├── migrations/                 # SQL versionado: 20261031000000_sepa.sql, 20261116000000_sepa_sucursales.sql,
│                               #   20261117000000_sepa_imagenes.sql, 20261118000000_user_records.sql,
│                               #   20261122000000_fotos_propias.sql (bucket privado, spec 27)
└── prod-ca-2021.crt            # Certificado público de Supabase para la conexión SSL
public/
├── manifest.json               # PWA: tema #5b2a86, display standalone
├── icon.svg                    # Ícono de la app y favicon (changuito amarillo sobre berenjena)
└── icon-maskable.svg           # El mismo dibujo en el 60 % central, con el fondo a sangre (purpose maskable)
src/
├── app/                        # App Router: cada carpeta = ruta, page.tsx = página
│   ├── layout.tsx              # Header (Logo, CartSummary), NavBar, <StoreHydrator>{children}, footer (desde md);
│   │                           #   fuentes de next/font, metadata y viewport
│   ├── globals.css             # Tailwind v4 + @theme (primary, accent, gray, fuentes) + @layer components
│   ├── page.tsx                # Buscar
│   ├── upload/                 # page.tsx (Suspense) + UploadForm.tsx (useSearchParams): tabs cargar precio /
│   │                           #   agregar producto; ?tab=producto&ean=… abre agregar producto completado;
│   │                           #   PriceForm.tsx: pestaña Cargar precio (spec 26) y ?tab=precio&ean=…&monto=…
│   ├── product/[id]/           # page.tsx (Suspense) + ProductDetail.tsx (useParams); vincular con el catálogo
│   ├── cart/page.tsx           # Carrito y checkout con medio de pago
│   ├── purchases/page.tsx      # Historial de compras, Repetir compra, tarjeta del gasto del mes (link a /gastos)
│   ├── gastos/page.tsx         # Panel de gasto mensual: selector de mes, resumen, gráfico y desgloses
│   ├── calculadora/page.tsx    # Calculadora de precio unitario
│   ├── cuenta/                 # page.tsx (sesión, estado de la sincronización, cerrar sesión, borrar la cuenta) +
│   │                           #   SignInForm.tsx (Google o mail → código de 6 dígitos)
│   ├── privacidad/page.tsx     # Qué se guarda, dónde y cómo borrarlo (Server Component)
│   └── not-found.tsx           # Redirige a /
├── components/
│   ├── NavBar.tsx              # Barra inferior en el celular, arriba desde md; activo con usePathname (y las rutas
│   │                           #   de `match`: Historial en /gastos); NavLinks sin activo como fallback
│   ├── CartBadge.tsx           # Contador del carrito sobre el ícono de su pestaña
│   ├── CartSummary.tsx         # Total del carrito en el header, link a /cart
│   ├── Logo.tsx                # Changuito de la marca en SVG (el mismo de icon.svg)
│   ├── StoreHydrator.tsx       # Carga localStorage en el cliente antes de mostrar las páginas
│   ├── SyncManager.tsx         # Arranca/para la sincronización según la sesión; online y visibilitychange
│   ├── useAuth.ts              # Hook: sesión de Supabase (off / loading / out / in)
│   ├── useNow.ts               # Reloj compartido cada 30 s (0 en el prerender) para "hace N min"
│   ├── AccountButton.tsx       # Ícono de cuenta del header (inicial con sesión; punto ámbar si falla hace > 1 h)
│   ├── ConfirmDialog.tsx       # <dialog> de confirmación (cerrar sesión con pendientes, borrar la cuenta)
│   ├── NumberInput.tsx         # Input numérico sobre un valor del store (conserva el texto mientras se edita)
│   ├── PriceChart.tsx          # Gráfico de tendencia en SVG propio
│   ├── SpendingChart.tsx       # Gasto de 6 meses en barras de HTML; cada mes con compras es un botón que lo elige
│   ├── SpendingBreakdown.tsx   # Desglose del mes (por comercio o medio de pago): monto, % y barra horizontal
│   ├── SpendingVariation.tsx   # "X % más" (rojo) / "X % menos" (verde) / "Igual" (azul) / "—"
│   ├── useSepaSearch.ts        # Hook: consulta al catálogo con espera de 300 ms; estado idle/loading/done/error
│   ├── SepaResults.tsx         # Mensajes y lista de resultados del catálogo (cada fila la arma quien lo usa)
│   ├── SepaSearch.tsx          # Buscador "Buscar en Precios Claros" que devuelve el producto elegido
│   ├── SepaLinkDialog.tsx      # Modal <dialog> de "Vincular con Precios Claros" / "Cambiar vínculo"
│   ├── useSepaReferences.ts    # Hooks: precio de referencia de varios EAN en una sola consulta (getSepaPrices);
│   │                           #   useSepaReferenceLookup suma isLoading(ean) para esperar antes de agregar
│   ├── SepaPriceTable.tsx      # Lista de precios por cadena; ReferenceLine ("Promedio $X · más barato en…") y Chevron
│   ├── ReferencePrice.tsx      # Tarjeta "Precio de referencia" del detalle; colores de la comparación
│   ├── DuplicateProduct.tsx    # Aviso "Ya tenés este producto: <nombre>" con link a su detalle
│   ├── BarcodeScanner.tsx      # Lector de códigos de barras: <dialog> a pantalla completa con la cámara e ingreso manual
│   ├── ScanButton.tsx          # Botón que abre el lector; solo si el navegador puede pedir la cámara
│   ├── ScanOffer.tsx           # Oferta del lector en Buscar (spec 24): propio o del catálogo, comercios cercanos
│   │                           #   (resumen + 3), precios por cadena, "¿Cuánto sale acá?" y "Cargar precio acá"; ScanResult
│   ├── PriceStorePicker.tsx    # Bloque "Comercio" de Cargar precio: GPS (sucursales a menos de 200 m), comercios
│   │                           #   usados, "Otro comercio" / "Otro comercio acá"; elegido con "Cambiar"
│   ├── PriceProductPicker.tsx  # Bloque "Producto" de Cargar precio: propios y del catálogo, lector, "No tiene código
│   │                           #   de barras", casos B y C (con foto); useEanLookup (resuelve un código leído o de la URL)
│   ├── PhotoField.tsx          # Campo "Foto (opcional)" (spec 27): botón, input file oculto, compresión, vista previa,
│   │                           #   Cambiar, Quitar, "Solo la ves vos."; usePhotoPicker y PhotoStatus (también el detalle)
│   ├── CatalogActions.tsx      # AddToCartButton ("Buscando precio…") y EditLink, de Buscar y de la oferta del lector
│   ├── CartStoreDialog.tsx     # Modal <dialog> "Cambiar comercio" de un ítem del carrito; sección "Cerca tuyo"
│   ├── CartCompareCard.tsx     # Tarjeta "¿Dónde conviene?" del carrito: la mejor opción y "Comparar N comercios"
│   ├── CartCompareDialog.tsx   # Modal con las opciones (sucursales o cadenas), medidor de cobertura, faltantes,
│   │                           #   "Pasar todo a este comercio" y Mapa; OptionSummary compartido con la tarjeta
│   ├── useBasketComparison.ts  # Hook: elige sucursales (useNearbyPrices) o cadenas (referencias) y ordena las opciones
│   ├── useNearby.ts            # Hooks: useSepaBranches (todas las sucursales), useNearBranches (las del radio) y
│   │                           #   useNearbyPrices (precio de varios EAN en los comercios cercanos, una consulta)
│   ├── LocationBar.tsx         # "Usar mi ubicación" / "Elegir localidad"; con ubicación, radio, Cambiar y Quitar
│   │                           #   y el link "N comercios cerca" que abre la lista
│   ├── NearbyBranchesDialog.tsx # Modal <dialog> con los comercios del radio por distancia; tocar uno abre su mapa
│   ├── NearbyStores.tsx        # Lista de comercios con dirección, distancia, precio y botón; precios propios dentro
│   │                           #   del radio mezclados (spec 26); NearbyLine ("Desde $X…")
│   ├── NearbyStoresCard.tsx    # Tarjeta "Comercios cercanos" del detalle
│   ├── BranchMap.tsx           # Modal <dialog> con el mapa (Leaflet) de un comercio o del recorrido del carrito:
│   │                           #   marcadores, ruta a pie / en auto, "Usar mi ubicación" y "Abrir en Google Maps"
│   ├── useSepaImages.ts        # Hook: imágenes de varios EAN en una sola consulta (getSepaImages), acumuladas
│   ├── useProductPhotos.ts     # Hook: object URL de la foto propia de cada producto (caché de módulo por id); baja
│   │                           #   las que faltan con sesión; forgetPhotoUrl
│   └── ProductImage.tsx        # Imagen del producto (40/48/64/160 px) o cuadro con la inicial si no hay o no carga
└── lib/                        # Sin dependencias de React salvo store.ts (zustand)
    ├── models.ts               # Interfaces: Product, Price, CartItem, Purchase + tipos de la calculadora
    ├── storage.ts              # Claves preciolocal_*, datos de ejemplo, loadFromStorage/saveToStorage/loadCalculator
    ├── store.ts                # useStore (estado + acciones) y consultas puras (getPriceStats, getCartTotal, ...)
    ├── unit-price.ts           # Funciones puras de la calculadora (precio unitario, promos, comparación)
    ├── price-form.ts           # Cargar precio (spec 26): PriceProductChoice, storesAtPoint, recentStores, otherStore,
    │                           #   resolvePriceProduct, priceAt; ownPricesNear (precios propios en Comercios cercanos)
    ├── shelf-price.ts          # "¿Cuánto sale acá?" (spec 24): shelfComparison contra el más barato cercano o la
    │                           #   referencia, y contra el último precio propio
    ├── basket.ts               # ¿Dónde conviene el carrito?: basketLines, compareNearby, compareChains, savingsLine,
    │                           #   withoutEanLabel (spec 25)
    ├── format.ts               # formatMoney, formatNumber, formatPctChange, formatDateTime, initialOf, ... (es-AR);
    │                           #   meses con nombres propios: formatMonth, monthName, shortMonth
    ├── payment-methods.ts      # PAYMENT_METHODS (sin íconos), NO_PAYMENT y paymentLabel (id o label → label)
    ├── spending.ts             # Gasto mensual desde Purchase: monthKey, availableMonths, monthSummary,
    │                           #   lastMonthsTotals, monthVariation, byStore (por cadena o comercio), byPayment
    ├── ids.ts                  # newId() / uniqueId() (los registros nuevos usan uniqueId: spec 21)
    ├── geo.ts                  # distanceKm (haversine) y formatDistance ("350 m", "1,2 km")
    ├── route.ts                # Ruta del mapa: getRoute (OSRM, caché y 8 s de límite), parseOsrmRoute, googleMapsUrl,
    │                           #   formatDuration, mapStops (paradas a partir de comercios con coordenadas)
    ├── location.ts             # UserLocation, RADIUS_OPTIONS, parseLocationState, gpsLocation, requestPosition
    ├── gtin.ts                 # Validar y normalizar códigos de barras a GTIN-13 (también lo usa el ETL)
    ├── barcode.ts              # Lector: cameraAvailable, createDetector (nativo o ponyfill), createConfirmer
    ├── supabase.ts             # Cliente de Supabase con sesión (PKCE); null si faltan las variables
    ├── auth.ts                 # Google, código por mail, borrar la cuenta (antes, sus fotos del bucket); displayName,
    │                           #   validEmail, validCode
    ├── photo.ts                # Fotos propias (spec 27): fitWithin, photoPath, unreferencedPhotos, pendingUploads,
    │                           #   productImageSrc (qué imagen se muestra), compressPhoto (canvas → JPEG sin EXIF)
    ├── photo-store.ts          # IndexedDB `el-changuito`: almacenes photos ({ id, blob, uploaded }) y photo_deletes
    ├── photo-sync.ts           # savePhoto, discardPhoto, syncPhotos (subir, borrar del bucket, limpiar), downloadPhoto,
    │                           #   deleteAllRemotePhotos, clearLocalPhotos, releaseLocalPhotos
    ├── privacy.ts              # PRIVACY_CONTACT: El Changuito · elchanguito.app@gmail.com
    ├── sync.ts                 # Sincronización pura: diffCollection, cola (enqueue/acknowledge), mergeRemote,
    │                           #   dedupeByEan, dedupeCart, withoutSamples, pullSince
    ├── sync-remote.ts          # Llamadas a user_records: pushRecords (upsert de a 500), pullRows (de a 1.000)
    ├── sync-engine.ts          # Motor: cola persistida, startSync/stopSync/syncNow, primera sesión, cerrar sesión,
    │                           #   cuenta borrada; vuelta de fotos (syncPhotos) y syncUserId; useSyncStatus para la UI
    ├── sepa.ts                 # Consultas a sepa_productos (searchSepaProducts, getSepaProduct) y sepa_precios
    │                           #   (getSepaPrices, con caché); referenceSummary, vsReference y funciones puras;
    │                           #   sucursales y precios cercanos (getSepaBranches, nearestBranches,
    │                           #   getNearbyPrices, branchLocalities, storeRefFromBranch); imágenes
    │                           #   (getSepaImages, con caché; imageSource)
    ├── product-form.ts         # Formulario de producto: checkEan, formFromSepa, productFromForm, sepaLinkChanges;
    │                           #   productFromSepa (producto propio desde el catálogo, sin categoría)
    └── *.test.ts               # Tests de Vitest junto a cada módulo
```

---

## Arquitectura y Patrones

- **App Router** — una carpeta por ruta con `page.tsx`. Las páginas son Client Components (`'use client'`) porque
  todos los datos propios viven en `localStorage`.
- **Render solo en el cliente** — `StoreHydrator` (en el layout) llama a `hydrate()` en un `useEffect` y muestra
  "Cargando…" hasta entonces. El servidor solo prerenderiza el shell (header, nav, footer).
- **Cache Components** — Next oculta las páginas con `<Activity>` en vez de desmontarlas (hasta 3 rutas): el estado
  local de una página (pestaña, formulario, paso de pago) se conserva al volver. Los hooks de URL (`useParams`,
  `usePathname`) en rutas dinámicas, y `useSearchParams` en cualquier ruta, necesitan un `<Suspense>` arriba, o el
  build falla. Como la página no se desmonta, `UploadForm` aplica `?tab=producto&ean=…` cuando cambia la URL (ajuste
  de estado durante el render), no con una `key` que borraría lo escrito.
  `Date.now()` / `Math.random()` no pueden ejecutarse durante el prerender: generarlos en handlers o en funciones
  que se llamen en el cliente (`defaultPrices()`, `newId()`).
- **Validación de navegación instantánea** — `experimental.instantInsights.validationLevel: 'manual-warning'` en
  `next.config.ts`: solo se validan los segmentos que exporten `instant`.
- **Estado (Zustand)** — un único `useStore` en `src/lib/store.ts`. Las páginas leen con selectores
  (`useStore(s => s.cart)`) y llaman acciones (`useStore(s => s.addToCart)`). Las consultas derivadas son funciones
  puras que reciben la colección: `getPricesForProduct(prices, id)`, `getPriceStats(prices, id)`,
  `getCartTotal(cart)`, `getLastPurchasedPrice(purchases, id)`, `filterProducts(products, query)`,
  `groupCartByStore(cart)`, `getCartStores(cart)`, `storeKey(store)`, `initialCartPrice(prices, id, reference?)`,
  `getRecentStorePrices(prices, id, now)`, `priceStoreRef(price)`.
  Fuera de React: `useStore.getState()`.
- **Patrón de mutación** — las acciones devuelven arrays y objetos nuevos (`map` con spread), nunca mutan los existentes.
- **Persistencia** — una suscripción al store guarda en su clave cada colección que cambió, solo después de hidratar.
- **Cuenta y sincronización** ([SPEC 21](specs/21-cuenta-y-sincronizacion.md)) — **local primero**: el store sigue
  siendo la fuente de la UI y sigue guardando en `localStorage`. La suscripción de persistencia avisa cada cambio
  de productos, precios, carrito, compras o calculadora (`onUserDataChange`); el motor (`sync-engine.ts`) calcula
  los registros cambiados por referencia (`changesToRecords`: las acciones nunca mutan) y los encola en
  `preciolocal_outbox` (uno por `collection + id`), solo si el teléfono tiene cuenta (`preciolocal_sync.userId`),
  también con la sesión vencida. Con sesión, `syncNow` sube la cola (`upsert` a `user_records`; `acknowledge` solo
  saca lo enviado con el mismo `modifiedAt`) y baja las filas con `synced_at` posterior al cursor menos 5 min
  (`pullSince`); `mergeRemote` gana la fila salvo un pendiente local más nuevo (fechas comparadas como fechas), y
  después `dedupeByEan` (queda el producto de `id` menor) y `dedupeCart` (un ítem por producto: el más reciente);
  lo que cambian los dedupe se encola. Lo bajado se aplica sin volver a la cola. Nunca dos vueltas a la vez.
  Disparadores: al iniciar sesión, `online`, `visibilitychange` y 2 s después del último cambio. Primera sesión
  en el teléfono: sube todo salvo los datos de ejemplo sin usar (`withoutSamples`) y baja la cuenta; otro usuario
  que el guardado: descarta lo local. Cerrar sesión vacía el teléfono (la ubicación queda); una cuenta borrada desde
  otro dispositivo (`user_not_found` al retomar o FK `23503`) deja los datos sin cuenta. **La ubicación no se
  sincroniza.** Sin Supabase no hay cuenta
- **Catálogo SEPA (solo lectura)** — `lib/supabase.ts` crea el cliente con `NEXT_PUBLIC_SUPABASE_URL` y
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clave publishable `sb_publishable_…`), sin sesión. Si falta alguna, `supabase` es
  `null`, `sepaEnabled` es `false` y la UI no muestra nada del catálogo (el resto funciona igual). `lib/sepa.ts`
  consulta `sepa_productos`: por texto, cada palabra en la descripción o la marca sin importar los acentos
  (`imatch` con `accentPattern`), o por EAN; hasta 20 resultados, primero los que están en más cadenas. Las
  consultas llevan `.retry(false)`: sin conexión el error ("No se pudo consultar Precios Claros") sale enseguida
- **Precio de referencia** ([SPEC 12](specs/12-precio-de-referencia-sepa.md)) — `getSepaPrices(eans)` lee
  `sepa_precios` con el nombre de `sepa_banderas` en **una sola consulta** (`in`) para todos los EAN de la pantalla.
  Caché de módulo por EAN durante la sesión (guarda la promesa, también los "sin precios"; si falla, se borra). El
  precio de cada cadena es su **mediana** entre sucursales; la referencia es el **promedio** de esas medianas (cada
  cadena cuenta una vez). `vsReference` compara con ±5 % de margen (`referenceStatus`). Las pantallas usan
  `useSepaReferences`: sin EAN, sin Supabase, sin precios o con error no muestran nada (ni error ni tarjeta vacía).
  Las respuestas se acumulan en el hook: al cambiar los EAN, solo los nuevos quedan cargando
  (`useSepaReferenceLookup().isLoading(ean)`)
- **Lista de comercios cercanos** ([SPEC 20](specs/20-lista-de-comercios-cercanos.md)): "N comercios cerca" es un
  link que abre el modal `NearbyBranchesDialog` (pantalla completa en el celular, tarjeta desde `sm`): "N comercios
  a menos de R km" (con localidad, "… de <localidad>"; con 40, "Los 40 más cercanos, …") y una fila por sucursal
  con nombre, dirección y distancia ("aprox." con localidad), de la más cercana a la más lejana; la primera en
  `primary-700`. Tocar una fila abre `BranchMap` encima (con ruta si la ubicación es de GPS); al cerrarlo se
  vuelve a la lista. Sin consultas nuevas: sale de `useNearBranches`. También en la tarjeta del detalle
- **¿Dónde conviene el carrito?** ([SPEC 25](specs/25-donde-conviene-el-carrito.md)): `basketLines` toma los ítems
  con EAN (en cualquier grupo). `useBasketComparison` usa las sucursales del radio con `useNearbyPrices` (mismas
  llamadas y caché de la spec 15) y, sin ubicación, sin sucursales o si esa consulta falla, las cadenas con las
  referencias que el carrito ya pidió (`useSepaReferenceLookup`; sin consulta nueva). `compareNearby` /
  `compareChains` arman una opción por sucursal o cadena con al menos un producto: total = precio × cantidad de los
  que tiene; ahorro = precio actual − precio de la opción, solo de los que tienen precio en el carrito (los de $0 no
  cuentan; `null` si no queda ninguno); orden por cantidad de productos, total, distancia y nombre. "Pasar todo"
  llama a `moveCartItems(store, moves)`: un solo `set` (un cambio para la persistencia y la sincronización)
- **Comercios cercanos** ([SPEC 15](specs/15-precios-y-comercios-cercanos.md)) — **la ubicación no sale del dispositivo**
  (única excepción: la ruta del mapa, ver *Mapa y ruta*):
  `getSepaBranches()` baja todas las sucursales una vez por sesión (de a 1.000 filas, caché de módulo) y
  `nearestBranches` calcula las distancias en el navegador (haversine, línea recta): hasta **40** dentro del radio
  (1, 3, 5 o 10 km; 3 por defecto). `getNearbyPrices(eans, sucursales)` llama a `sepa_precios_en_sucursales` solo
  con los EAN y los `id` de las sucursales, **una llamada** por búsqueda (de a 20 EAN), con caché por EAN +
  sucursal: cambiar de ubicación o de radio solo pide lo que falta. Las pantallas usan `useNearbyPrices(eans)`,
  cuyo `get(ean)` devuelve la lista ordenada por precio y distancia, `'loading'` o `undefined` (sin EAN, sin
  ubicación, sin comercios en el radio o con error): con `undefined` la pantalla queda como sin ubicación, sin
  mensajes de error. El permiso de ubicación se pide solo al tocar "Usar mi ubicación" (`getCurrentPosition` sin
  alta precisión, 10 s, `maximumAge` 5 min; se guarda redondeada a 4 decimales). La alternativa manual
  (`branchLocalities`) usa el **barrio** de la sucursal o, si no tiene, la localidad (la columna localidad sola no
  sirve: en CABA casi todo dice "Capital Federal"), y el punto es la **mediana** de las coordenadas; con una
  localidad las distancias dicen "aprox.". El comercio del carrito sale de `storeRefFromBranch`
  (`"<cadena> — <sucursal>"`, `sepaId`, `chain` con el nombre de la cadena, dirección, barrio y coordenadas)
- **Mapa y ruta** ([SPEC 16](specs/16-mapa-y-como-llegar.md)) — `BranchMap` carga Leaflet y su CSS con `import()`
  dentro de un efecto, la primera vez que se abre un mapa (chunks aparte: no entran en el JS ni en el CSS inicial,
  ni se ejecutan en el prerender). El mapa se crea al montarse el contenido del modal y se destruye
  (`map.remove()`) en la limpieza; el modal se cierra también al ocultarse la página con `<Activity>`. El evento
  `close` del `<dialog>` se ignora si el modal ya está abierto otra vez (llega en una tarea aparte y cerraría un
  mapa reabierto enseguida). Los marcadores son `L.divIcon` con SVG propio y el nombre con `textContent`. El
  origen es `location` del store **solo si `source === 'gps'`**. La ruta (`getRoute`) se pide al OSRM público de
  `routing.openstreetmap.de` con 8 s de límite y caché de módulo por puntos + modo (un fallo no se guarda); sin
  respuesta, línea recta punteada. **Es la única excepción a "la ubicación no sale del dispositivo"**: las
  coordenadas viajan a ese servicio solo al abrir un mapa con ubicación de GPS, y el modal lo avisa. El link a
  Google Maps (`googleMapsUrl`) nunca lleva `origin`. Sin conexión (`navigator.onLine`) o si no carga Leaflet, el
  modal queda sin mapa
- **Imágenes de productos** ([SPEC 17](specs/17-imagenes-de-productos.md)) — el SEPA no trae imágenes: el script
  `sepa:images` guarda en `sepa_imagenes` la URL de la imagen de cada EAN (Open Food Facts primero, después el portal
  Precios Claros). La app **no guarda imágenes en el dispositivo**: las busca por EAN al mostrar, así que los
  productos creados antes también la tienen y vincular / quitar el vínculo la trae / la saca. La URL que se muestra
  sale de `productImageSrc(product, foto, imágenes.get(product.ean))`: la foto propia (spec 27), `product.image`
  (reservado, sin uso) y la del catálogo.
  `getSepaImages(eans)` lee `sepa_imagenes` (`url` no nula) de a 100 EAN con `.retry(false)`, con caché de módulo por
  EAN como `getSepaPrices` (también los "sin imagen"; un fallo no se guarda). Las pantallas usan `useSepaImages`:
  **una consulta por pantalla** (Buscar: una para los propios y otra en `SepaResults` para el catálogo; el historial
  solo pide las de la compra expandida). `ProductImage` es un `<img>` común (no `next/image`: el optimizador de
  Vercel tiene cuota) con `loading="lazy"`, `decoding="async"`, `referrerPolicy="no-referrer"`, `alt=""` y tamaño fijo;
  el marcador con la inicial (`initialOf`) está siempre debajo y la imagen se muestra al cargar: la fila no cambia de
  alto ni con imagen rota (`onError` la quita; un `src` nuevo olvida el fallo). Las imágenes se piden al sitio de
  origen: Open Food Facts o el portal ven la IP del dispositivo y la imagen pedida, sin `Referer`
- **Fotos propias** ([SPEC 27](specs/27-fotos-propias.md)) — una foto opcional por producto propio, **privada**:
  "Solo la ves vos" (la supervisión y el compartir son de la spec 28). `compressPhoto` decodifica con
  `createImageBitmap(file, { imageOrientation: 'from-image' })`, dibuja en un canvas con fondo blanco y el lado mayor
  en 800 px como máximo (`fitWithin`) y exporta JPEG con calidad 0,82, 0,7, 0,6 y 0,5 hasta quedar en 200 KB (acepta
  hasta 300 KB; si no, repite a 600 px): volver a codificar descarta todo el EXIF. En los formularios la foto vive en
  memoria (`PhotoDraft`) hasta guardar: primero `savePhoto` (IndexedDB) y después el producto con `photo`; si
  IndexedDB falla, el producto se guarda sin foto y el aviso lo dice. **Cada foto nueva tiene un `id` nuevo**
  (`uniqueId()`): cambiarla crea otro archivo y `discardPhoto` borra el anterior del teléfono (y, si ya estaba en la
  cuenta, lo anota en `photo_deletes`). `Product.photo` viaja dentro del producto en `user_records`; los archivos
  van aparte: en cada vuelta de `syncNow`, después de los registros, `syncPhotos` sube las fotos sin subir que usa
  algún producto a `fotos-propias/<userId>/<id>.jpg`, borra del bucket las de `photo_deletes` y borra del teléfono
  las que ya no usa ningún producto (salvo las recién guardadas). Un error de Storage no cambia el estado de la
  sincronización: se reintenta en la vuelta siguiente. Otro teléfono de la cuenta baja la foto al mostrarla
  (`useProductPhotos`: URL firmada de 60 s, solo con sesión; un fallo no se guarda y se reintenta en cada cambio de
  estado de la sincronización). Cerrar sesión u otro usuario vacían IndexedDB; una cuenta borrada desde otro
  dispositivo deja las fotos sin subir; **Borrar mi cuenta** borra antes los archivos de la carpeta del usuario y,
  si eso falla, no borra la cuenta
- **Códigos de barras** — `ean` se guarda siempre como GTIN-13 (`toGtin13`) y es único entre los productos propios
  (`checkEan`). Marca y presentación se copian del catálogo al agregar o vincular y no se actualizan solas
- **Lector de códigos de barras** ([SPEC 11](specs/11-lector-codigo-de-barras.md)) — `createDetector` usa el
  `BarcodeDetector` nativo si soporta EAN-13, EAN-8, UPC-A y UPC-E (Chrome en Android); si no, importa el ponyfill
  `barcode-detector/ponyfill` la primera vez que se abre el lector. Su `.wasm` se sirve desde el propio dominio
  (`/zxing_reader.wasm?v=<versión>`, configurado con `prepareZXingModule`), nunca desde el CDN por defecto: lo copia
  el `postinstall` desde `node_modules` y está en `.gitignore`. Se analiza un cuadro cada ~150 ms, nunca dos a la
  vez, y un código se acepta con 2 lecturas iguales seguidas que pasen `toGtin13` (`createConfirmer`). La cámara
  se apaga al detectar, al cerrar, al desmontar y al ocultarse la página con `<Activity>`; en ese último caso
  también se cierra el `<dialog>` (un modal oculto dejaría inerte la página a la que se navegó). `BarcodeScanner`
  se renderiza en `document.body` con un portal, porque los botones del lector están dentro de `<form>`, y el envío del
  ingreso manual hace `stopPropagation` (los eventos de React atraviesan el portal). La cámara exige **HTTPS**
  (o `localhost`): sin él no existe `getUserMedia` y no se muestra el botón del lector
- **IDs** — `newId()` (`Date.now().toString()`) y `uniqueId()` (con sufijo aleatorio) de `src/lib/ids.ts` (sin UUID).
  El lint (`react-hooks/purity`) no deja llamar a `Date.now()` directamente en el cuerpo de un componente.
- **Diálogos** — `alert()` / `confirm()` nativos del navegador (carrito y detalle); modal propio en el historial;
  `ConfirmDialog` (`<dialog>`) en `/cuenta`;
  `<dialog>` nativo con `showModal()` en el detalle (`SepaLinkDialog`: cierra con Escape y devuelve el foco), en el
  carrito (`CartStoreDialog`, se cierra también al ocultarse la página con `<Activity>`) y en el lector de códigos
  de barras (`BarcodeScanner`, a pantalla completa).

### Persistencia (localStorage)

| Clave | Contenido | Valor inicial |
|---|---|---|
| `preciolocal_products` | `Product[]` | `[]` (sin datos de ejemplo desde la spec 21) |
| `preciolocal_prices` | `Price[]` | `[]` |
| `preciolocal_cart` | `CartItem[]` | `[]` |
| `preciolocal_purchases` | `Purchase[]` (más reciente primero) | `[]` |
| `preciolocal_calculator` | `CalculatorState` (última comparación) | Peso, 2 presentaciones vacías en `g` (`defaultCalculator()`) |
| `preciolocal_location` | `{ location: UserLocation \| null, radiusKm }` | Sin ubicación, 3 km |
| `preciolocal_outbox` | `SyncRecord[]`: cambios sin subir a la cuenta (spec 21) | sin clave |
| `preciolocal_sync` | `{ userId, cursor }`: dueño de los datos del teléfono y último `synced_at` bajado | sin clave |

Las fotos propias (spec 27) no van en `localStorage`: están en **IndexedDB**, base `el-changuito`, almacén `photos`
(`{ id, blob, uploaded }`, un JPEG por foto) y almacén `photo_deletes` (ids de fotos de la cuenta que hay que borrar
del bucket). Sin IndexedDB, la app sigue sin fotos.

La sesión de Supabase la guarda supabase-js en su propia clave (`sb-<ref>-auth-token`). Los datos de ejemplo de
antes (`id` `'1'`–`'8'` y precios `'1'`–`'3'`) se conservan si ya estaban guardados, pero no suben a la cuenta salvo
que algo propio los use.

El formato es el mismo que usaba la versión Angular: no hace falta migrar datos. Los campos de `Product` de la
spec 10 (`ean`, `brand`, `size`, `sizeUnit`) son opcionales: los productos guardados antes siguen sirviendo. Lo
mismo `CartItem.store` (spec 14): un carrito guardado antes queda entero en "Sin comercio". `category` es opcional
desde la spec 18: los productos guardados la conservan; los creados desde el catálogo no la tienen.
Las claves conservan el prefijo `preciolocal_` del nombre anterior a propósito (cambiarlo dejaría sin datos a quien
ya usa la app).
`loadFromStorage<T>` / `saveToStorage<T>` envuelven todo en try/catch (fallback a defaults; ignora cuota excedida).
`preciolocal_location` se valida al cargar (`parseLocationState`): si algo no es válido, sin ubicación y 3 km.
`preciolocal_calculator` además se valida al cargar (`loadCalculator`): si la magnitud, el largo (2–6) o la forma de
alguna presentación no es válida, se usa el estado inicial.
Al leer de localStorage, `Price.date` vuelve como **string**: siempre comparar con `new Date(p.date)`.

### Rutas

| Path | Archivo | Nav | Función |
|---|---|---|---|
| `/` | `app/page.tsx` | Buscar | Búsqueda de productos |
| `/upload` | `app/upload/page.tsx` | Cargar | Cargar precio o producto nuevo; `?tab=producto&ean=…` |
| `/cart` | `app/cart/page.tsx` | Carrito | Carrito y checkout |
| `/purchases` | `app/purchases/page.tsx` | Historial | Historial de compras |
| `/gastos` | `app/gastos/page.tsx` | Historial | Panel de gasto mensual (se abre desde Historial) |
| `/calculadora` | `app/calculadora/page.tsx` | Calculadora | Comparar presentaciones por precio unitario |
| `/product/[id]` | `app/product/[id]/page.tsx` | — | Detalle del producto |
| `/cuenta` | `app/cuenta/page.tsx` | — (ícono del header) | Entrar, estado de la sincronización, salir, borrar la cuenta |
| `/privacidad` | `app/privacidad/page.tsx` | — | Qué se guarda y cómo borrarlo |
| otra | `app/not-found.tsx` | — | Redirige a `/` |

---

## Modelos de Datos (`src/lib/models.ts`)

```typescript
interface Product {
  id: string;
  name: string;
  category?: string;  // opcional (spec 18): los creados desde el catálogo no tienen; vacía no se guarda
  image?: string;     // reservado (spec 17); no se usa para la foto propia; la imagen del catálogo no se guarda
  ean?: string;       // GTIN-13 (toGtin13); único entre los productos propios
  brand?: string;
  size?: number;      // presentación: 500
  sizeUnit?: Unit;    // va junto con size: los dos o ninguno
  photo?: ProductPhoto;  // foto propia (spec 27): el archivo está en IndexedDB y, con cuenta, en el bucket privado
}

interface ProductPhoto {
  id: string;        // uniqueId(); cambia con cada foto nueva
  takenAt: string;   // ISO, al elegirla
}

interface Price {
  id: string;
  productId: string;
  amount: number;
  date: Date;        // string ISO cuando viene de localStorage
  barrio: string;    // NO_BARRIO ("Sin especificar") si no se conoce
  store?: string;    // nombre del comercio; con storeRef, igual a storeRef.name
  storeRef?: StoreRef;  // spec 26: comercio completo (sucursal SEPA o a mano, con coordenadas si se usó el GPS);
                        // priceStoreRef lo usa primero. store y barrio se siguen escribiendo para lo que ya los lee
}

interface StoreRef {   // comercio de un ítem del carrito o de un precio; viaja dentro, sin catálogo
  name: string;
  barrio?: string;
  address?: string;
  sepaId?: string;     // id de sepa_sucursales si viene del SEPA (spec 15)
  chain?: string;      // nombre de la cadena si viene del SEPA (spec 03); las compras de antes no lo tienen
  lat?: number;
  lng?: number;
}

interface CartItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  subtotal: number;  // price * quantity, se recalcula en cada cambio
  store?: StoreRef;  // sin store → grupo "Sin comercio"
}

interface Purchase {
  id: string;
  date: string;      // ISO
  items: CartItem[];
  total: number;
  barrio?: string;   // solo si se conoce
  store?: string;    // una compra por comercio
  paymentMethod?: string;  // label ('Efectivo'); la versión Angular guardaba el id ('efectivo'): leer con paymentLabel
}
```

Tipos de la calculadora (no se relacionan con `Product` ni `Price`):

```typescript
type Magnitude = 'peso' | 'volumen' | 'unidades';
type Unit = 'g' | 'kg' | 'ml' | 'l' | 'u';
type PromoType = 'ninguna' | 'nxm' | 'enesima' | 'descuento';

interface Promo {          // plano: los campos que no usa el tipo quedan en null
  type: PromoType;
  take: number | null;     // NxM: unidades que se llevan
  pay: number | null;      // NxM: unidades que se pagan
  nth: number | null;      // N-ésima: unidad con descuento
  percent: number | null;  // N-ésima y descuento directo: % de descuento
}

interface Presentation {
  id: string;
  label: string;           // vacío → "Presentación N"
  price: number | null;
  quantity: number | null;
  unit: Unit;
  promo: Promo;
}

interface CalculatorState {
  magnitude: Magnitude;
  presentations: Presentation[];  // entre 2 y 6
}
```

---

## Funcionalidades (Fase 1)

### Búsqueda (`/`)
- **Orden y buscador fijo** ([SPEC 29](specs/29-buscador-fijo-en-buscar.md)): sin título a la vista (el `<h1>` es
  `sr-only`; el campo dice "Buscar productos" como placeholder), la barra de ubicación, el buscador y los
  resultados. El buscador (campo + lector) es `sticky` arriba de `<main>` (`-top-6`, por su `py-6`) con el fondo de la
  app. Con puntero táctil, al enfocar el campo o al escribir la primera letra la página sube de golpe hasta dejarlo
  arriba (solo hacia abajo), para que el teclado no tape los resultados; mientras hay texto, el área de resultados
  tiene `min-h-dvh` para que siempre se pueda subir. En la computadora no se mueve
- Filtro en tiempo real (`filterProducts`): cada palabra del texto tiene que estar en el nombre, la **marca** o la
  categoría, sin distinguir mayúsculas ni acentos ("playadito" encuentra la yerba y el mate cocido de esa marca;
  "yerba playadito", la "Yerba" de marca PLAYADITO). Si el texto sin espacios son solo dígitos, también los
  productos cuyo EAN los contiene; un GTIN válido en otro formato (EAN-8, UPC-A, GTIN-14 con 0) encuentra el
  GTIN-13 guardado
- **Solo se agrega con la búsqueda terminada:** mientras se buscan los precios de un producto, su botón de agregar
  (catálogo, lector y "Añadir Carrito" de un propio con EAN sin precio propio) dice "Buscando precio…",
  deshabilitado (`aria-busy`); si la consulta falla, se habilita
- Sección **En Precios Claros** debajo de los productos propios (con al menos 3 caracteres y Supabase configurado):
  hasta 20 resultados del catálogo sin los que ya tienen un producto propio. Sin propios que coincidan no hay
  mensaje (la sección queda pegada al buscador); sin Supabase, "No se encontraron productos"
  - Cuando llegan los resultados, una sola consulta de precios para todos; cada uno con precios suma la línea
    "Promedio $X · más barato en <cadena> $Y" y la fila es un botón (`aria-expanded`, chevron) que despliega la
    lista por cadena (`SepaPriceTable`) con el botón **Agregar al carrito**. Uno desplegado a la vez; escribir lo cierra
  - Sin precios (o mientras cargan, o si falla la consulta de precios) la fila muestra los datos y, a la derecha,
    el botón **Agregar al carrito** (`aria-label="Agregar <descripción> al carrito"`)
  - En los dos casos, debajo, el link optativo "Editar antes de agregar" a `/upload?tab=producto&ean=…`
- **Agregar al carrito desde el catálogo** ([SPEC 18](specs/18-agregar-al-carrito-sin-alta.md), `addSepaToCart`):
  usa el producto propio con ese EAN o lo crea con `productFromSepa` (nombre sugerido, marca, presentación y EAN,
  sin categoría), sin pasar por el formulario. Entra en "Sin comercio" con `initialCartPrice` (último precio
  propio; si no, el promedio de referencia; si no, $0); si ya estaba suma 1 y conserva su comercio. No registra
  precios. Aviso fijo abajo "<nombre> en el carrito" con un ícono de check (`role="status"`, 3 s), por encima de la barra inferior; el producto pasa a los propios y
  sale de la sección del catálogo
- Botón **Leer código de barras** (ícono) al lado del buscador: muestra la oferta del lector (`ScanOffer`,
  [SPEC 24](specs/24-comercios-cercanos-en-el-lector.md)) sin salir de Buscar. Un producto propio con ese EAN: "Ya
  tenés <nombre>.", "Último precio $Y · dd/mm" (si tiene), **Agregar al carrito** (`initialCartPrice`; espera la
  referencia solo sin precio propio) y **Ver detalle**. Si no es propio, consulta el catálogo: si está, ofrece
  **Agregar al carrito** (igual que en la sección del catálogo, con "Editar antes de agregar"); si no está o falla la
  consulta, "Agregar producto", que navega a `/upload?tab=producto&ean=…`, y al lado **Cargar precio acá**
  ([SPEC 26](specs/26-cargar-precio-en-el-comercio.md)). En un propio o del catálogo, el link **Cargar precio acá**
  queda debajo de "¿Cuánto sale acá?": lleva a `/upload?tab=precio&ean=…` (con `&monto=…` si hay un monto escrito).
  Escribir en el buscador o leer otro código
  cierra la oferta (`key={scan.ean}`: nada pasa de un producto a otro)
  - **Comercios cercanos** (con ubicación, un `useNearbyPrices` propio de la oferta): `NearbyLine` y `NearbyStores`
    con los **3** más baratos abiertos (`limit`) y "Ver N más", con **Agregar** (en ese comercio y a ese precio) y
    **Mapa**; en un propio, sus precios cargados a mano al final. Sin precio cercano, cargando, sin ubicación o con
    error: el resumen por cadena y "Ver precios por cadena". Sin ubicación suma "Activá tu ubicación arriba para ver
    comercios cercanos"
  - **¿Cuánto sale acá?** (propio o del catálogo; teclado decimal, no se guarda): con un monto mayor a 0,
    `shelfComparison` contra el más barato cercano ("Más barato que en los comercios cerca" en verde, "Igual que en
    <cadena> — <distancia>" en azul, "En <cadena> — <distancia> sale $X menos" en rojo) o, sin cercanos con precio,
    contra la referencia (`referenceLabel`); en un propio con precios, "La última vez pagaste $Y (dd/mm): $X más /
    menos" o "… lo mismo". Cada línea con flecha (hacia dónde está el precio de la góndola) y `aria-live`; sin nada
    contra qué comparar, "Sin precios para comparar". Con monto, **Agregar al carrito** entra en "Sin comercio" a ese
    precio (`addSepaToCart` con `at` sin comercio); si ya estaba, suma 1 y conserva comercio y precio. No registra precios
- Muestra la imagen (64 px, o el cuadro con la inicial), categoría (si tiene), último precio y variación % respecto
  al precio anterior (`getPriceStats().previous`). Los resultados del catálogo (también en Agregar producto y en el
  modal de vincular) y la oferta del lector llevan la imagen de 48 px a la izquierda
- "Añadir Carrito" con `initialCartPrice` (la referencia SEPA si tiene EAN y no tiene precio propio; nunca el `100`
  de antes) y ajustar cantidad / quitar desde la misma tarjeta
- Navegación al detalle del producto
- **Barra de ubicación** (`LocationBar`, arriba del buscador, solo con Supabase): sin ubicación, "Activá tu
  ubicación para ver comercios cercanos" con **Usar mi ubicación** y "Elegir localidad" (buscador de barrios y
  localidades con sucursales); con ubicación, su nombre, el `select` de radio, "Cambiar" y "Quitar" (borra
  ubicación y radio), y la cantidad de comercios cerca. Sin comercios en el radio: "No hay comercios de Precios
  Claros a menos de N km" con el botón "Buscar a M km". Permiso denegado → "Sin permiso para usar tu ubicación.
  Podés elegir tu localidad."; sin señal → "No se pudo obtener tu ubicación."; en los dos casos se abre el selector
- **Comercios cercanos** ([SPEC 15](specs/15-precios-y-comercios-cercanos.md), con ubicación): cada resultado del
  catálogo y cada producto propio con EAN muestra "Desde $X · <cadena> — <distancia>" y "en N comercios cerca"
  ("Sin precio en comercios cercanos" si ninguno lo tiene; "Buscando precios…" mientras tanto). Al desplegarlo
  (la fila del catálogo, o "Ver comercios" en la tarjeta propia), la lista de comercios (`NearbyStores`): hasta
  10 y "Ver N más", por precio y después distancia, con dirección, distancia, precio y **Agregar**
  (`aria-label="Agregar <producto> en <comercio>"`); el más barato lleva "Más barato". En un producto propio se
  suman sus precios cargados a mano de los últimos 60 días que tienen comercio (el último de cada comercio,
  `storeKey`), con "Cargado por vos · dd/mm": los de un comercio con coordenadas **dentro del radio** (spec 26,
  `ownPricesNear`) se mezclan con los de Precios Claros por precio y distancia, con su distancia y Mapa ("Más
  barato" cuenta también esos); los demás (sin coordenadas, fuera del radio) van al final, sin distancia ni Mapa.
  `NearbyLine` resume solo Precios Claros. Pie "Precios de lista informados a Precios Claros el dd/mm/aaaa", en
  ámbar con más de 7 días
  - **Agregar** en un comercio: crea el producto si no existe (`addSepaToCart` con `at`) y lo deja en el carrito
    con ese comercio y ese precio; si ya estaba, suma 1 y pasa a ellos. No registra precios
  - En el catálogo, debajo de la lista quedan "Agregar sin comercio" (el de la spec 18) y "Editar antes de
    agregar". Un resultado sin precio cercano despliega la lista por cadena de la spec 12
  - Sin ubicación (o si falla la consulta) todo queda como en la spec 12: resumen y lista por cadena
  - Cada comercio con coordenadas lleva el botón **Mapa** (`aria-label="Ver <comercio> en el mapa"`; solo ícono
    en el celular), que abre el mapa del comercio (ver *Mapa del comercio*). Los precios cargados a mano solo lo
    llevan dentro del radio

### Cargar (`/upload`)
- Tab **Cargar precio** ([SPEC 26](specs/26-cargar-precio-en-el-comercio.md), `PriceForm`): tres tarjetas en orden,
  **Comercio**, **Producto** y **Precio**, y "Guardar precio". Queda montada al cambiar de pestaña (`hidden`): el
  comercio elegido se conserva al navegar y se pierde al recargar. Validación al guardar, con el error junto al
  campo y el foco en el primero: "Elegí el comercio", "Elegí el producto", "Completá el nombre" (casos B y C) y
  "Completá el precio" (vacío, 0 o no numérico)
  - **Comercio** (`PriceStorePicker`, obligatorio): **Usar mi ubicación** (con `geolocationAvailable`) hace una
    lectura de alta precisión (`requestPosition({ highAccuracy: true })`) que **no cambia la ubicación de la app**,
    baja las sucursales recién ahí y ofrece hasta 3 a menos de **200 m** (`storesAtPoint`) como "¿Estás en…?", con
    dirección y distancia (la más cercana en `primary-700`), y debajo "Otro comercio acá" (guarda las coordenadas
    de la lectura, redondeadas a 4 decimales). Sin sucursales a menos de 200 m: "No hay comercios de Precios Claros
    a menos de 200 m" con ese formulario abierto. Errores: "Sin permiso para usar tu ubicación. Elegí el comercio a
    mano." / "No se pudo obtener tu ubicación. Elegí el comercio a mano.". **Comercios que usaste** (`recentStores`:
    hasta 5 de precios y compras, del más reciente, distintos por `storeKey`) y **Otro comercio** (nombre
    obligatorio, dirección y barrio opcionales; no es un `<form>`: Enter usa el comercio). El barrio ya no es
    obligatorio. Elegido: nombre, dirección o barrio, ícono de ubicación si tiene coordenadas y **Cambiar**
  - **Producto** (`PriceProductPicker`): "Buscá un producto" con "Tus productos" (`filterProducts`, hasta 5) y "En
    Precios Claros" (sin los propios, imagen de 48 px), el lector y **No tiene código de barras** (caso C, con lo
    escrito como nombre). Un código leído (`useEanLookup`): propio → ese; en el catálogo → caso A; fuera, con error
    o sin Supabase → caso B ("El código … no está en Precios Claros." / "No se pudo consultar Precios Claros.");
    "Buscando el código…" mientras tanto y una respuesta vieja se descarta. Elegido: imagen, nombre (del catálogo, el
    sugerido), marca y presentación, "Precios Claros" si es del catálogo y **Cambiar**; en B y C, Nombre (obligatorio),
    Marca (opcional) y **Foto (opcional)** (`PhotoField`, spec 27) con el código arriba en B. Cambiar de producto
    descarta la foto elegida
  - **Precio**: "Precio ($)" con teclado decimal; con precios propios, "Último precio $Y · dd/mm"
  - **Guardar**: el producto se resuelve recién ahí (`resolvePriceProduct`: propio; A → el propio con ese EAN si
    apareció mientras tanto, si no `productFromSepa`; B y C → nuevo, sin categoría), y se registra `priceAt`
    (`storeRef`, `store` = su nombre, `barrio` = el suyo o "Sin especificar"). Aviso fijo abajo "Precio guardado:
    <producto> $X en <comercio>. Solo lo ves vos." (3 s; con " No se pudo guardar la foto." si falló IndexedDB).
    **Queda el comercio**; producto, foto y monto se limpian y el foco vuelve al buscador
  - `?tab=precio&ean=…&monto=…` abre la pestaña con el producto resuelto como al leer el código y el monto (> 0),
    cuando cambia la URL (el código, una sola vez aunque la página vuelva a mostrarse); al guardar, la URL queda en
    `?tab=precio`. La oferta del lector de Buscar lleva ahí con **Cargar precio acá** (suma `&monto=` si hay algo en
    "¿Cuánto sale acá?")
- Tab **producto**: nombre (requerido, "Completá el nombre"); "Categoría (opcional)", código de barras, marca,
  **foto** (`PhotoField`, spec 27) y presentación (número + unidad), opcionales. Sin categoría, el producto se guarda
  sin `category`
- Buscador **Buscar en Precios Claros** (espera de 300 ms, "Buscando…", "Sin resultados", error): al elegir un
  resultado completa nombre sugerido (descripción en formato título sin la marca repetida), marca, presentación y
  EAN, todo editable; la categoría es manual (opcional) y el foco pasa a ella
- Código de barras inválido → "Código de barras inválido"; ya usado por otro producto → "Ya tenés este producto"
  con link; en ambos casos no guarda
- `?tab=producto&ean=…` abre la pestaña producto completada con `getSepaProduct`; si el EAN no está en el catálogo,
  solo con el EAN (vacía si no es válido). Al guardar, la URL queda en `?tab=producto`
- Botón **Leer código de barras** (ícono) en el tab producto (al lado del código de barras): propio → "Ya tenés este
  producto" con link; en el catálogo → completa el formulario igual que el buscador; si no, completa solo el EAN y
  deja el resto como estaba
- Mensajes de éxito/error del tab producto que se ocultan a los 3 s

### Lector de códigos de barras (`BarcodeScanner`)
- Modal negro a pantalla completa: video de la cámara trasera (`facingMode: { ideal: 'environment' }`), recuadro guía
  horizontal con una línea animada (`animate-scan`, solo con `motion-safe`), "Apuntá al código de barras", botón ✕
  (`aria-label="Cerrar lector"`) y "Escribir el código"
- "Preparando el lector…" mientras se pide el permiso y se carga el detector; al detectar vibra (80 ms)
- Errores, siempre con el ingreso manual abierto: permiso denegado ("Sin permiso para usar la cámara…"), sin cámara
  o sin `getUserMedia` ("Este dispositivo no tiene cámara disponible.") y falla del detector ("No se pudo iniciar el lector.")
- Ingreso manual: valida con `toGtin13` (ignora espacios); inválido → "Código de barras inválido"

### Mapa del comercio (`BranchMap`, [SPEC 16](specs/16-mapa-y-como-llegar.md))
- Modal a pantalla completa en el celular (tarjeta centrada desde `sm`): nombre y dirección del comercio, mapa de
  OpenStreetMap con su marcador (color de marca) y, abajo, el botón **Abrir en Google Maps** (pestaña nueva, sin
  origen en la URL: Google usa la posición del dispositivo)
- **Con ubicación de GPS**: marcador azul "Vos" y la ruta por las calles, con la leyenda "1,7 km · 23 min a pie" y
  el selector **A pie / En auto** (`aria-pressed`); "Buscando la ruta…" mientras llega. Si el servicio no responde
  (o tarda más de 8 s), línea recta punteada y "350 m en línea recta", sin error ni selector. Debajo, "Para marcar
  la ruta, tu ubicación se envía a OpenStreetMap."
- **Con localidad elegida a mano o sin ubicación**: solo el comercio, centrado, sin ruta ni consultas, y el botón
  **Usar mi ubicación**: al aceptar, la ubicación guardada pasa a ser la de GPS en toda la app y aparecen el
  marcador y la ruta. Permiso denegado → "Sin permiso para usar tu ubicación."; sin señal → "No se pudo obtener
  tu ubicación."
- **Recorrido** (desde el carrito): "Recorrido: N comercios", marcadores numerados, la ruta que los une en orden y
  la lista numerada de paradas; el link de Google Maps lleva las paradas intermedias como `waypoints`
- Cierra con Escape o con el botón de cerrar (`aria-label="Cerrar mapa"`) y devuelve el foco al botón que lo abrió.
  Sin conexión: nombre, dirección y el botón de Google Maps, sin mapa
- Se abre desde Buscar y el detalle (botón "Mapa" de cada comercio) y desde el carrito; no desde "Cambiar
  comercio" ni desde el historial

### Detalle de producto (`/product/[id]`)
- Imagen de 160 px junto al nombre (centrada arriba en el celular) o el cuadro con la inicial: la foto propia
  primero, si no la del catálogo
- **Foto propia** ([SPEC 27](specs/27-fotos-propias.md)), debajo de la imagen y guardada enseguida: con foto, "Tu
  foto · Solo la ves vos", **Cambiar foto** y **Quitar foto** (`confirm('¿Quitar la foto?')`; vuelve la del catálogo
  o la inicial); sin foto, la atribución "Imagen: Open Food Facts (CC-BY-SA)" si la imagen es de ahí (`imageSource`)
  y **Agregar foto**. "Preparando la foto…" mientras se comprime; un archivo que no es una imagen → "No se pudo leer
  la imagen. Probá con otra." y no cambia nada
- Línea gris debajo del nombre: "Marca · 500 g · EAN 7793704000911" (lo que exista); "Categoría: X" solo si tiene
- Con Supabase: sin EAN, **Vincular con Precios Claros**; con EAN, **Cambiar vínculo** y **Quitar vínculo**.
  Vincular completa marca y presentación solo si están vacías; cambiar las reemplaza por las del catálogo; quitar
  pide confirmación y borra solo el EAN. Ninguno cambia el nombre ni la categoría (`sepaLinkChanges`)
- Estadísticas: actual, mínimo, máximo, promedio (`getPriceStats`)
- Con EAN y precios en el catálogo, tarjeta **Precio de referencia · Precios Claros** (`ReferencePrice`): "Actualizado
  hoy/ayer/hace N días" ("Datos del dd/mm/aaaa" con más de 7 días), promedio entre cadenas con el badge de comparación
  contra el último precio propio (verde "X % por debajo de la referencia", azul "En línea con la referencia", rojo
  "X % por encima…"; ±5 %), cadena más barata, rango y la lista por cadena. Sin EAN no consulta
- Con EAN, tarjeta **Comercios cercanos** (`NearbyStoresCard`) después de la de referencia: la `LocationBar` y,
  con ubicación, el resumen y la misma lista de comercios de Buscar, con "Agregar" por comercio
- Gráfico de tendencia en **SVG propio** (`PriceChart`, sin librerías), solo si hay más de 3 precios
- Historial de precios con barrio, tienda y fecha; edición inline del monto (`updatePrice`; Enter guarda, Escape cancela)
- Agregar al carrito con el precio actual

### Carrito (`/cart`)
- **Agrupado por comercio** ([SPEC 14](specs/14-carrito-por-comercio.md), `groupCartByStore`): una tarjeta por
  comercio en el orden en que se agregó su primer ítem, "Sin comercio" al final. Encabezado con nombre (`truncate`),
  dirección o barrio, cantidad de productos y subtotal; pie "Total: $X en N comercios" y "Vaciar carrito" (con `confirm`)
- `storeKey` identifica el comercio: `sepaId` si existe; si no, nombre + barrio sin mayúsculas ni espacios de más
  ("Coto" y " coto" son el mismo grupo, con el nombre del primer ítem)
- **¿Dónde conviene?** ([SPEC 25](specs/25-donde-conviene-el-carrito.md), `CartCompareCard`, arriba de los grupos;
  con 2 o más ítems con EAN y Supabase): la mejor opción con nombre, distancia ("aprox." con localidad), un medidor
  de cobertura (un segmento por producto), "Tiene N de M · $total" y el ahorro: "$X menos que ahora" en verde, "$X
  más que ahora" en rojo (", en los N que tiene" si no tiene todos), "Tu carrito ya está en este comercio" o nada sin
  diferencia. Sin ubicación compara por cadena ("Precio promedio de la cadena en todo el país…"). "Buscando precios
  cerca…" mientras carga; "N productos sin código no se pueden comparar"; sin opciones, "Ningún comercio cercano
  tiene tus productos" y el botón abre igual el modal
  - **Comparar N comercios** abre `CartCompareDialog` (pantalla completa en el celular, tarjeta desde `sm`): la
    `LocationBar` (cambiar el radio recalcula), "N comercios a menos de R km" o "N cadenas", 10 opciones y "Ver N
    más"; la primera con el badge "Conviene". Cada fila despliega (una a la vez) "No tiene: …" y, en sucursales,
    **Pasar todo a este comercio** (`aria-label="Pasar N productos a <comercio>"`) y **Mapa** (encima del modal).
    Pie: "N comercios cercanos no tienen ninguno de tus productos" y la fecha de los datos (ámbar con más de 7 días)
  - **Pasar todo** (`moveCartItems`): los ítems que esa sucursal informa pasan a ella con su precio (misma cantidad;
    un ítem en $0 queda con precio); los demás no cambian. Sin confirmación: cierra el modal y muestra el aviso fijo
    "N productos pasaron a <comercio>" (`role="status"`, 3 s). No registra precios
- **Un producto, un comercio**: un producto está una sola vez; `addToCart` de uno que ya está suma 1 y, si el ítem
  nuevo trae comercio, lo pasa a ese comercio y precio
- **Cerca tuyo** en "Cambiar comercio" (ítems con EAN, con ubicación): las sucursales cercanas con su precio; al
  elegir una cambian el comercio **y el precio** del ítem (la cantidad no)
- **Cambiar comercio** (link debajo de cada ítem, `CartStoreDialog`): comercios ya usados (`getCartStores`), "Sin
  comercio" u "Otro comercio" (nombre requerido, barrio opcional). No cambia cantidad ni precio
  (`setCartItemStore(itemId, store, price?)`; el precio solo con `price`)
- **Mapa** ([SPEC 16](specs/16-mapa-y-como-llegar.md)): botón de solo ícono en el encabezado de cada comercio con
  coordenadas (los del SEPA) y, con 2 o más, **Ver recorrido** junto al total: todos esos comercios en el orden
  del carrito, hasta 9 ("Se muestran los primeros 9 comercios"). Los que no tienen coordenadas se aclaran en el
  mapa ("1 comercio sin ubicación no aparece en el mapa")
- Imagen de 40 px a la izquierda del nombre de cada ítem (una consulta para todo el carrito)
- Editar cantidad y precio de cada ítem; eliminar
- **Ítem sin precio** (entró en $0 desde el catálogo, spec 18): campo en ámbar con "Completar precio" y sin
  comparaciones; el botón de compra de su grupo queda deshabilitado con "Completá los precios para comprar" hasta
  que todos sus ítems tengan precio (tampoco se confirma si el medio de pago ya estaba abierto): nunca se registra
  un `Price` de $0
- Badge comparando contra el precio de la **última compra** (`getLastPurchasedPrice`): verde más barato, rojo más caro, azul igual
- Ítems con EAN: línea "Ref. $X · 8 % arriba" (o "abajo", "en línea") con los mismos colores, comparando el precio del
  ítem contra la referencia SEPA; una sola consulta para todo el carrito
- **Checkout por comercio**: "Comprar en <comercio>" ("Registrar compra" en "Sin comercio") abre el medio de pago de
  ese grupo (un grupo a la vez): efectivo, débito, crédito 1 cuota, crédito en cuotas, transferencia/QR, cheque
  (`PAYMENT_METHODS` de `lib/payment-methods.ts`; los íconos, en el carrito); se guarda el label. En
  "Sin comercio" se pueden escribir barrio y comercio, los dos opcionales
- Al confirmar un grupo: guarda **un** `Purchase` con sus ítems (`store` = comercio, `barrio` solo si se conoce),
  **registra cada precio pagado en el historial de precios** (barrio `Sin especificar` si no se conoce; con
  comercio, también `storeRef` con el comercio del grupo, spec 26) y saca del
  carrito solo esos ítems (`removeCartItems`); los demás grupos quedan

### Historial de compras (`/purchases`)
- **Tarjeta del gasto del mes** (solo con compras), link a `/gastos`: "Noviembre: $5.000,00" y debajo la variación
  contra el mes anterior ("54,5 % menos que octubre" en verde, "X % más…" en rojo, "Igual que…" en azul), "Todavía
  no compraste este mes" o nada si el mes anterior no tiene compras; "Ver gastos" con chevron
- Lista expandible de compras (`aria-expanded` / `aria-controls`); el medio de pago se muestra con `paymentLabel`
  (una compra vieja con `'efectivo'` dice "Efectivo")
- Por ítem: imagen de 40 px (por el EAN del producto propio; si el producto ya no existe, la inicial del nombre
  guardado) y variación % del precio pagado vs último precio registrado
- "Repetir" (botón hermano del de expandir, con `aria-label` "Repetir compra del dd/MM/yyyy"): si el carrito tiene
  ítems abre un modal para **combinar o reemplazar** (`loadPurchaseToCart(purchase, merge)`); usa el precio actual
  registrado de cada producto y navega a `/cart`. Los ítems vuelven al comercio de la compra (el `StoreRef` guardado
  en el ítem o `{ name: store, barrio }`); al combinar, un ítem que ya estaba conserva su comercio

### Gastos (`/gastos`, [SPEC 03](specs/03-panel-gasto-mensual.md))
- No está en la barra de navegación: se abre desde la tarjeta de Historial, que queda activa (`match` en `NavBar`).
  Link "Historial" con flecha para volver
- Todo se calcula desde `purchases` (`lib/spending.ts`), sin datos nuevos. El mes de una compra es el de su fecha en
  **hora local** (una compra del 31/10 a las 22:00 cuenta en octubre)
- **Selector de mes** (`ChevronLeft` · "Noviembre 2026" · `ChevronRight`, botones de 44 px con `aria-label`): recorre
  los meses con compras y el actual; abre en el mes actual (estado local, se conserva con `<Activity>`)
- **Resumen** en 4 tarjetas: total del mes, compras, ticket promedio y "Vs. <mes anterior>" con la variación
  (`monthVariation`; "—" si alguno de los dos meses no tiene compras; "Igual" con menos de 0,05 %)
- **Gráfico** (`SpendingChart`): los 6 meses calendario que terminan en el elegido, en barras de HTML; el elegido en
  `primary-700`, los demás en `primary-200`; cada mes con compras es un botón (`aria-pressed`, `aria-label` "Septiembre
  2026: $6.000,00") que lo elige; un mes sin compras muestra solo la línea base
- **Desgloses** (`SpendingBreakdown`): "Por comercio" y "Por medio de pago", de mayor a menor monto, con % y barra.
  Por comercio (`byStore`): las sucursales del SEPA se suman por **cadena** (bandera de `sepaId`, nombre de
  `StoreRef.chain` o, en compras de antes, el texto anterior a `' — '`); los propios por nombre sin mayúsculas ni
  espacios de más; sin comercio, "Sin comercio". Por medio de pago (`byPayment`): `paymentLabel` suma el id viejo y
  el label; sin medio, "Sin especificar"
- Mes actual sin compras: $0,00, 0 compras, "—" y "Todavía no compraste este mes" con "Ir al carrito" en lugar de
  los desgloses. Sin ninguna compra: "Todavía no hay compras" con "Ir al carrito", sin selector

### Cuenta (`/cuenta`, [SPEC 21](specs/21-cuenta-y-sincronizacion.md))
- Optativa; se llega con el ícono de cuenta del header (sin sesión `CircleUser`; con sesión, la inicial)
- Sin sesión: **Continuar con Google** o "Tu mail" + **Enviarme el código**; después, "Te mandamos un mail a …" con
  el campo **Código** (6 dígitos, `one-time-code`), **Entrar** (`verifyOtp`), "Reenviar el mail" a los 60 s y "Usar
  otro mail". El mail trae el código y el link: en la app instalada del iPhone (no comparte datos con Safari) solo
  sirve el código, y debajo de Google dice "Si no vuelve a la app, entrá con tu mail". Con la sesión vencida, aviso
  "Tu sesión venció. Entrá de nuevo para sincronizar"
- Con sesión: nombre y mail; "Sincronizado hace N min" / "Sincronizando…" / "N cambios sin subir · Sin conexión" /
  "No se pudo sincronizar" con **Reintentar**; **Cerrar sesión** (sincroniza antes; con pendientes, confirma "Hay N
  cambios sin subir. Si cerrás sesión, se pierden."; también borra las fotos del teléfono); **Borrar mi cuenta** con
  confirmación (borra antes las fotos del bucket y después `delete_my_account`)
- Buscar sin productos propios: "Todavía no tenés productos" / "Buscá un producto en Precios Claros o leé su código
  de barras"

### Calculadora de precio unitario (`/calculadora`)
- Herramienta independiente: no lee ni modifica productos, precios, carrito ni compras
- Magnitud fija por comparación: **Peso** (`g`, `kg`), **Volumen** (`ml`, `l`) o **Unidades** (`u`); al cambiarla, todas las unidades pasan a la de defecto (`g`, `ml`, `u`) y se conservan precios, cantidades y promos
- De **2 a 6 presentaciones**, cada una con nombre opcional, precio, cantidad y unidad
- Promoción opcional por presentación: NxM (3x2), % de descuento en la N-ésima unidad ("70% en la 2da" = la 2da cuesta 30 %), % de descuento directo; las promos asumen **lote completo** y muestran la leyenda "llevando N"
- Resultado en vivo normalizado a **$/kg**, **$/l** o **$/u**: la más conveniente en verde (todas las empatadas), `+X %` en las demás, "Completar datos" en las inválidas; hay ganador solo con al menos 2 válidas
- Cálculo en `lib/unit-price.ts` (`toBaseQuantity`, `lotOf`, `unitPrice`, `compare`), sin dependencias de React
- Cada cambio se guarda en `preciolocal_calculator`; "Nueva comparación" vuelve al estado inicial sin confirmar

### Layout y PWA
- **Shell** ([SPEC 19](specs/19-restyling-base-y-navegacion.md)): contenedor flex de alto `dvh`; el scroll es de `<main>`
- **Header** compacto en `primary-700`: logo y nombre (link a `/`) y, con productos en el carrito, el total como link
  a `/cart` (`aria-label="Carrito: N productos, total $X"`)
- **Navegación**: en el celular, barra inferior de 5 pestañas de igual ancho (ícono sobre etiqueta de 11 px), último
  hijo del layout (`order-last`, no `position: fixed`); desde `md` va arriba, debajo del header. La activa lleva
  `aria-current="page"`, color `primary-700` y una píldora `primary-100` detrás del ícono; en `/product/[id]` ninguna
- **Contador del carrito** (`CartBadge`) en amarillo sobre el ícono de su pestaña; "99+" si pasa de 99
- **Footer** solo desde `md`
- **Áreas seguras**: `viewportFit: 'cover'` y `env(safe-area-inset-*)` en el header y la barra inferior
- `manifest.json` con `display: standalone` → instalable desde el navegador; `theme-color` en `viewport` del layout.
  Dos íconos SVG: `icon.svg` (`any`) e `icon-maskable.svg` (`maskable`). No hay `apple-touch-icon` en PNG
- **No hay service worker**: la app no funciona offline sin conexión inicial (los datos sí persisten en localStorage)

---

## Puesta en Marcha

Requisitos: Node.js ≥ 24.

```bash
npm install        # primera vez (el postinstall copia el .wasm del lector a public/)
npm run dev        # next dev -p 4200 → http://localhost:4200
```

El puerto 4200 es el mismo que usaba la versión Angular: así se ven los datos que ya estaban en ese origen.

### Scripts

```bash
npm run dev        # Dev server (Turbopack, hot reload)
npm run build      # Build de producción (.next/)
npm start          # Sirve el build de producción en :4200
npm run lint       # ESLint
npm test           # Vitest (una pasada)
npm run test:watch # Vitest en modo watch
npm run sepa:etl   # ETL del SEPA: baja el ZIP del día y lo carga en Supabase (ver Base de precios SEPA)
npm run sepa:images # Imágenes de productos → sepa_imagenes (ver Base de precios SEPA)
```

### Solución de problemas

- **Puerto 4200 ocupado** — Windows PowerShell: `Get-Process node | Stop-Process -Force`; Mac/Linux: `lsof -ti:4200 | xargs kill -9`
- **Módulos rotos** — borrar `node_modules`, `.next` y `package-lock.json`, luego `npm install`
- **Datos viejos / de ejemplo** — DevTools → Application → Local Storage → borrar las claves `preciolocal_*`
- **`LayoutProps` no encontrado en `tsc`** — es un tipo global que genera Next: correr `npm run build` (o `npx next typegen`)
- **Build falla por `useParams`/`usePathname` fuera de Suspense o por `Date.now()` en prerender** — ver *Cache Components* en Arquitectura
- **PWA no se instala** — requiere HTTPS (automático en Vercel) y un `manifest.json` válido
- **No aparece el botón del lector de códigos** — el navegador no tiene `getUserMedia`: pasa sin HTTPS (por ejemplo, abriendo la app
  desde otro equipo por la IP local). Para probar en el celular, usar la URL de preview de Vercel
- **"Sin permiso para usar la cámara"** — el permiso quedó bloqueado para el sitio: habilitarlo desde el candado de la
  barra de direcciones (Chrome) o en *Configuración → Safari → Cámara* (iPhone). Chrome también lo bloquea solo
  después de varios avisos cerrados sin responder
- **"No se pudo iniciar el lector"** — no cargó `/zxing_reader.wasm`: falta en `public/` (correr `npm install`, que
  ejecuta el `postinstall`) o falló la red
- **No aparece nada de Precios Claros** — faltan `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (con
  esos nombres exactos: `…_PUBLISHABLE_KEY` no sirve). Se copian al código en el build: después de cargarlas en
  `.env.local` o en Vercel hay que volver a compilar o desplegar
- **"No se pudo consultar Precios Claros"** — sin conexión, o Supabase no responde (proyecto pausado, clave
  revocada): revisar la URL y la clave en *Project Settings → API*
- **`sepa:etl` da `ENOTFOUND db.<ref>.supabase.co`** — la conexión directa es solo IPv6: usar la cadena del *Session pooler*
- **`sepa:etl` da `SELF_SIGNED_CERT_IN_CHAIN`** — falta o cambió `supabase/prod-ca-2021.crt` (Project Settings → Database → SSL Configuration)
- **`sepa:etl` termina con "Más de 3 días sin precios nuevos"** — no hubo carga `ok` reciente: revisar los logs de
  la tarea programada (`%LOCALAPPDATA%\el-changuito\logs\sepa-etl-*.log`) y las filas de `sepa_cargas`
- **`sepa:etl` termina como `omitida — otra carga en curso`** — otra carga (la tarea programada u otra a mano) tiene
  el bloqueo: esperar a que termine; si el proceso murió, Postgres lo suelta al cerrarse la conexión
- **El workflow SEPA de GitHub falla con `package_show … respondió 403 Forbidden`** — el portal
  `datos.produccion.gob.ar` bloquea las IP de los runners (desde el 17/11/2026; desde una conexión argentina responde
  200 con el mismo código y `User-Agent`). Por eso el workflow está desactivado y la carga corre en la tarea
  programada local (ver *Build y Despliegue*). Una nube cualquiera (routines, Edge Functions, un VPS) probablemente
  reciba el mismo 403: hace falta una IP argentina
- **La tarea programada no corrió** — necesita la sesión de Windows iniciada (bloqueada sirve). Ver la última
  ejecución: `Get-ScheduledTask 'El Changuito - SEPA*' | Get-ScheduledTaskInfo`; correrla ya:
  `Start-ScheduledTask 'El Changuito - SEPA ETL'`. Si `npm` no se encuentra, Node tiene que estar en el `PATH` del
  usuario o del sistema (no en el perfil de PowerShell)
- **No llega el mail de la tarea** — el final del log del día dice por qué: "Sin aviso por mail: falta …" (correr
  `scripts\sepa\set-mail.ps1`) o "No se pudo mandar el mail: …" (contraseña revocada o cambiada, o el servidor
  rechaza al remitente: volver a correr `set-mail.ps1`). Revisar también la carpeta de spam; con un SMTP que no es
  el de la casilla del remitente, el dominio del remitente tiene que estar verificado en ese proveedor

---

## Base de precios SEPA (Supabase)

Precios de referencia de las grandes cadenas, de [Precios Claros (SEPA)](docs/features/06-precios-sepa.md). Detalle
completo, reglas y números medidos en la [SPEC 08](specs/08-base-sepa-supabase.md) (base y carga), la
[SPEC 09](specs/09-actualizacion-diaria-sepa.md) (carga diaria) y la [SPEC 13](specs/13-precios-por-sucursal-sepa.md)
(sucursales y precios por sucursal).

- **Uso desde la app:** solo lectura con la clave publishable de `sepa_productos`
  ([SPEC 10](specs/10-productos-con-codigo-de-barras.md)) y de `sepa_precios` + `sepa_banderas` para el precio de
  referencia ([SPEC 12](specs/12-precio-de-referencia-sepa.md)), y de `sepa_sucursales` +
  `sepa_precios_en_sucursales` para los comercios cercanos ([SPEC 15](specs/15-precios-y-comercios-cercanos.md))
- **Proyecto:** `bjzeknajhrbtormkuunj` (`https://bjzeknajhrbtormkuunj.supabase.co`); el MCP de `.mcp.json` sirve para
  consultar e inspeccionar, no para aplicar migraciones
- **Tablas** (`public`, RLS con lectura pública salvo `sepa_cargas`):

| Tabla | Contenido |
|---|---|
| `sepa_banderas` | Cadenas (`id` = `comercio-bandera`, p. ej. `10-1`), sucursales y fecha de la última carga |
| `sepa_productos` | EAN (GTIN-13), descripción, marca, presentación normalizada, cantidad de banderas con precio |
| `sepa_precios` | Mínimo, mediana y máximo por EAN × bandera, sucursales que lo informan |
| `sepa_sucursales` | Sucursal (`id` = `comercio-bandera-sucursal`, p. ej. `10-1-123`): nombre, tipo, dirección, barrio, localidad, provincia (`AR-C`), `lat`/`lng` (null si no son válidas) y `pos` |
| `sepa_precios_sucursal` | Por EAN × bandera: `precios` (distintos, de menor a mayor) e `indices` (uno por sucursal en el orden de `pos`: posición en `precios`, 0 = no informa) |
| `sepa_cargas` | Registro de cada ejecución: estado `ok` / `omitida` / `error`, conteos, omitidos y detalle |
| `sepa_imagenes` | Por EAN: `url` de la imagen (`null` = se buscó y no hay), `fuente` (`off` / `preciosclaros`) y `revisado`; sin clave foránea a `sepa_productos` (spec 17) |
| `user_records` | Datos de cada usuario (spec 21): `user_id`, `collection` (`products` / `prices` / `cart` / `purchases` / `settings`), `id`, `data` (JSON del registro), `deleted`, `modified_at` (dispositivo; gana el último) y `synced_at` (servidor; cursor). RLS: cada usuario lee, crea y modifica solo sus filas; sin delete. Trigger `user_records_touch`; `delete_my_account()` borra el usuario y sus filas en cascada |

- **Storage** (spec 27): bucket **privado** `fotos-propias`, JPEG de hasta 300 KB (`file_size_limit` 307200,
  `allowed_mime_types` `image/jpeg`), un archivo por foto en `<user_id>/<id>.jpg`. Políticas en `storage.objects`
  para `authenticated`: leer, subir y borrar solo la carpeta propia (`storage.foldername(name)[1] = auth.uid()`);
  sin update (cada foto nueva es un archivo nuevo). Postgres no borra archivos de Storage: los borra la app antes
  de `delete_my_account`
- **Precio por sucursal** (spec 13): `sepa_precios_en_sucursales(eans, sucursales)` devuelve `ean`, `sucursal` y
  `precio` de cada producto en cada sucursal que lo informa; ignora lo que pase de 20 EAN y 40 sucursales. Arreglos
  por EAN × bandera en lugar de una fila por sucursal (serían 14 millones). `pos` se asigna en cada carga por
  `id_sucursal`, y sucursales y arreglos de una bandera se escriben juntos en la misma transacción: las sucursales
  se reemplazan enteras; los arreglos, solo si cambiaron (`is distinct from`), para no dejar cada día una copia
  muerta del tamaño de la tabla.
  Coordenadas válidas: latitud entre −56 y −21, longitud entre −74 y −53, distintas de 0
- **ETL:** `npm run sepa:etl` baja el ZIP más reciente del dataset `sepa-precios` a un temporal, lo lee en streaming
  (sin cargar ningún CSV entero), limpia, agrega y carga todo en **una sola transacción**. Opciones:
  `-- --file ruta.zip` (ZIP local), `-- --dry-run` (sin base, solo estadísticas), `-- --force` (saltea las reglas de fecha
  y el chequeo previo). La consulta a CKAN y la descarga se intentan hasta 4 veces (esperas de 1, 2 y 4 min)
- **Chequeo previo:** antes de descargar compara el `last_modified` del ZIP más reciente (UTC) con el `inicio` de la
  última carga `ok` de mayor `fecha_archivo`; si no es posterior, termina con "sin archivo nuevo" en segundos, sin
  bajar el ZIP y **sin fila** en `sepa_cargas`. No aplica con `--force`, `--file` ni `--dry-run`
- **Una carga a la vez:** `loadSepa` toma `pg_try_advisory_lock(hashtext('sepa_etl'))` antes de las reglas y lo
  suelta al terminar; si está tomado, registra `omitida` con "otra carga en curso". Necesita el *Session pooler*
  (el *Transaction pooler* no sostiene bloqueos de sesión)
- **Reglas de carga:** se omite un archivo más viejo que la última carga `ok` o de una fecha ya cargada (salvo
  `--force`); el **freno de seguridad** rechaza siempre un archivo con menos del 50 % de las filas de la última carga
  `ok`; una bandera que no viene conserva sus precios, sus sucursales y sus arreglos hasta 14 días
- **Más de 3 días:** si termina sin error pero la `fecha_archivo` más reciente con carga `ok` tiene más de 3 días
  (hora argentina), o no hay ninguna, sale con código 1 para que llegue el aviso. No aplica con `--dry-run`
- **Código de salida:** 0 con `ok`, `omitida` o "sin archivo nuevo"; 1 con `error`, descarga fallida (sin fila en
  `sepa_cargas`) o la regla de 3 días
- **Resumen:** si existe `GITHUB_STEP_SUMMARY`, agrega una tabla Markdown con el resultado, los números y la duración
  de descarga, lectura y carga, también si falla (`scripts/sepa/summary.ts`)
- **Números (02/11/2026):** 23 banderas, 75.216 productos, 236.058 precios; base de 98 MB; lectura ~2 min y carga
  3 a 6 min. El 04/11, en local, la lectura tardó ~3 min y la carga 8,5 a 10 min (~13 min en total)
- **Números con sucursales (16/11/2026, archivo del 15/11, en local):** 2.618 sucursales (1 sin coordenadas),
  237.562 arreglos con 21,8 millones de índices; `sepa_precios_sucursal` 73 MB, `sepa_sucursales` 1 MB, base de
  175 MB (freno de la spec 13: 300 MB) que no crece al repetir la carga; lectura 2 min 45 s con 820 MB de memoria y
  carga 7 min 25 s
- **Imágenes** (spec 17, `npm run sepa:images`, con `SUPABASE_DB_URL`): 1) lee en streaming el **export diario de
  Open Food Facts** (`en.openfoodfacts.org.products.csv.gz`, ~1,5 GB, separado por tabulaciones; no se guarda) con el
  `User-Agent` `ElChanguito/2.0 (https://elchanguito.vercel.app)`, y guarda `image_small_url` (200 px) de los EAN del
  catálogo, sin filtrar por país. No usa la API de búsqueda: tiene un límite global y devolvía 503 aun a un pedido
  cada 6,5 s; 2) a los EAN sin imagen les hace un `HEAD` a
  `imagenes.preciosclaros.gob.ar/productos/<ean>.jpg` (200 → URL; otro código → `null`), de mayor a menor cantidad
  de banderas, **hasta 5.000 por ejecución**, 5 a la vez, guardando de a 500. Un EAN no se vuelve a revisar hasta
  pasados 90 días; Open Food Facts reemplaza siempre al portal. Si el export no se puede leer entero (3 intentos), lo
  leído se guarda y las imágenes de Open Food Facts que ya estaban no se tocan. Resumen en consola y en `GITHUB_STEP_SUMMARY`; código 1 solo
  si no pudo conectarse a la base. Con el export (17/11/2026, en local, 10 min): 4,9 millones de filas leídas,
  8.569 productos del catálogo con imagen de Open Food Facts; con 3 ejecuciones del portal (15.000 EAN, los de más
  cadenas), 10.664 de 76.710 productos con imagen (13,9 %). El portal se termina de recorrer en unas 15 ejecuciones
- **Migraciones:** `npx supabase db push --linked` (requiere `npx supabase login` y `link` la primera vez)
- **Carga diaria:** tarea programada de Windows "El Changuito - SEPA ETL", todos los días a las 04:00 (carga el
  archivo publicado el día anterior); el workflow `SEPA` de GitHub Actions está desactivado por el 403 del portal
  (ver *Build y Despliegue*). A mano sigue funcionando `npm run sepa:etl`, y el bloqueo evita que pise a la tarea

---

## Convenciones del Código

- **TypeScript strict** completo; alias `@/*` → `src/*`
- Páginas en `src/app/<ruta>/page.tsx`; componentes compartidos en `src/components/` (PascalCase, `export default`);
  lógica sin UI en `src/lib/`
- Componentes de página con `'use client'`; los `page.tsx` que necesiten `Suspense` quedan como Server Component y
  envuelven a un componente cliente colocado al lado (ver `product/[id]/`)
- Formularios controlados con `useState`; inputs con `id` + `<label htmlFor>`; números del store con `NumberInput`
- Formato siempre con `src/lib/format.ts` (nunca `toFixed` para mostrar)
- Tailwind exclusivamente para estilos; clases reutilizables en `globals.css` (`@layer components`): `.btn-primary`, `.btn-secondary`, `.card`, `.input-field`, `.list-row` (fila tocable de una lista)
- Íconos siempre de `lucide-react`, con `aria-hidden="true"`; un botón de solo ícono lleva `aria-label`. Sin emojis ni
  símbolos (✕ ✓ ←) como ícono
- Toque mínimo de 44 px (`min-h-11`) en botones, pestañas y botones de solo ícono; texto sobre blanco no más claro que `gray-500`
- Grids responsivos: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- Comentarios de sección en el código con el estilo `// ── Título ─────`
- Textos de UI y comentarios en español
- Tests `*.test.ts` junto al módulo que prueban
- Finales de línea LF (forzado por `.gitattributes`)

### Agregar una página nueva

1. Crear `src/app/<nombre>/page.tsx` con `'use client'`
2. Agregar el link en `LINKS` de `src/components/NavBar.tsx`
3. Si necesita datos nuevos: modelo en `models.ts`, clave `preciolocal_*` y default en `storage.ts`, campo + acciones
   en `store.ts` y su línea en la suscripción de persistencia, con tests en `store.test.ts`

### Checklist de calidad

- [ ] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings
- [ ] Responsive en móvil (375 px sin scroll horizontal)
- [ ] Validaciones de formularios completas
- [ ] Accesibilidad básica (labels, `aria-*` en botones de solo ícono)

---

## Configuración de Estilos

Tokens en `@theme` de `src/app/globals.css` ([SPEC 19](specs/19-restyling-base-y-navegacion.md)):

| Token | Hex | Uso |
|---|---|---|
| `primary-50` | `#f7f3fb` | Hover de filas, fondo de `.btn-secondary` |
| `primary-100` | `#ede4f6` | Píldora de la pestaña activa |
| `primary-200` | `#dbc9ec` | Focus ring de inputs |
| `primary-500` | `#8253b3` | Borde de input en focus |
| `primary-700` | `#5b2a86` | **Color de marca** (header, botones, pestaña activa, `theme_color` PWA) |
| `primary-800` | `#48216b` | Hover de `.btn-primary` |
| `primary-900` | `#371a52` | `active` de `.btn-primary`, aviso de Buscar |
| `accent-400` | `#ffd23f` | **Acento** (amarillo cartel): solo logo y contador del carrito |
| `gray-50` | `#faf8fc` | Fondo de la app, `background_color` PWA |
| `gray-200` | `#e7e2ee` | Bordes de tarjetas |
| `gray-500` | `#6f6780` | Texto secundario (el más claro permitido sobre blanco) |
| `gray-900` | `#1f1630` | Texto principal (tinta) |

- La escala `gray-*` de Tailwind está **redefinida** con neutros apenas violáceos: `text-gray-*`, `bg-gray-*` y
  `border-gray-*` ya usan los de la marca
- **El amarillo es de marca, no de estado**: los avisos siguen en ámbar. Texto sobre amarillo en `gray-900`
- Verde, rojo, azul y ámbar (más barato, más caro, igual, completar precio) son los de Tailwind, sin cambios
- **Tipografía** con `next/font/google` (archivos servidos desde el propio dominio): **Rubik** en `h1`–`h3` y con
  `font-display`; **Nunito Sans** en el resto (`--font-sans`). Cifras tabulares en toda la app
- Formas: `.card` con `rounded-2xl`; botones e inputs con `rounded-xl` y 44 px de alto; inputs con texto de 16 px
  (regla global, para que el iPhone no haga zoom al enfocarlos)
- Ningún hex de marca en componentes: en SVG se usa `var(--color-primary-700)` (ver `PriceChart`)

---
## Build y Despliegue

- **CI** — `.github/workflows/ci.yml` (Node 24): `npm ci → lint → test → build` en cada push a `main`/`dev` y en cada PR
- **SEPA en una PC local (vigente desde el 21/11/2026)** — el portal `datos.produccion.gob.ar` responde **403** a
  los runners de GitHub Actions desde el 17/11/2026, así que la carga corre en una PC con IP argentina que queda
  encendida, con dos tareas programadas de Windows del usuario:

| Tarea | Cuándo | Qué corre | Estado |
|---|---|---|---|
| El Changuito - SEPA ETL | Todos los días, 04:00 | `npm run sepa:etl` | Habilitada |
| El Changuito - SEPA imagenes | Domingos, 06:00 | `npm run sepa:images` | Deshabilitada: el workflow de imágenes de GitHub funciona; de reserva |

  - Las registra (o actualiza) `scripts/sepa/install-tasks.ps1`; con `-EnableImages` deja habilitada también la de
    imágenes: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sepa\install-tasks.ps1 [-EnableImages]`
  - Las dos llaman a `scripts/sepa/run-local.ps1 -Script <sepa:etl|sepa:images>`, que corre el script en el repo
    con las variables de `.env.local` (`SUPABASE_DB_URL`) y guarda un log por día en
    `%LOCALAPPDATA%\el-changuito\logs\<sepa-etl|sepa-images>-AAAA-MM-DD.log` (se borran a los 30 días)
  - Despiertan la PC si está suspendida y, si estaba apagada, corren apenas se prende; límite de 1 hora y nunca dos
    a la vez. Necesitan la sesión de Windows iniciada
  - **Aviso por mail de cada corrida**, salga bien o mal: `run-local.ps1` manda a `elchanguito.app@gmail.com` un
    mail con asunto `[El Changuito] SEPA ETL: <ok | omitida | sin archivo nuevo | FALLÓ> · dd/mm/aaaa hh:mm` y la
    salida de la corrida en el cuerpo. `FALLÓ` es cualquier código distinto de 0 (403 del portal, error de carga,
    regla de "más de 3 días")
  - **Servidor SMTP genérico**, configurado una vez con `scripts/sepa/set-mail.ps1` en una ventana de PowerShell
    propia (`Get-Credential` abre el cuadro de la contraseña). Por defecto Gmail (`smtp.gmail.com:587`, usuario y
    remitente `elchanguito.app@gmail.com`, con una **contraseña de aplicación** de myaccount.google.com/apppasswords,
    que pide verificación en dos pasos); con `-SmtpHost`, `-Port`, `-User`, `-From` y `-To`, cualquier otro (Brevo,
    Mailgun, SendGrid o el del proveedor de internet), `-NoAuth` sin usuario y `-NoSsl` sin STARTTLS. **Solo
    STARTTLS (587 o 25)**: `System.Net.Mail` no soporta el TLS directo del 465. Manda un mail de prueba y solo si
    sale guarda servidor, puerto, remitente, destinatario y credencial en `%LOCALAPPDATA%\el-changuito\mail.xml`,
    con la contraseña cifrada con DPAPI (solo la lee ese usuario en esa PC; nada en el repo). Sin ese archivo no
    hay mail y el log lo dice; si el envío falla, queda "No se pudo mandar el mail: …" en el log y el código de
    salida no cambia
  - Los `.ps1` se guardan en **UTF-8 con BOM**: sin BOM, PowerShell 5.1 los lee como ANSI y rompe los acentos
  - A mano: `Start-ScheduledTask 'El Changuito - SEPA ETL'`, o `npm run sepa:etl` como siempre
- **SEPA en GitHub Actions (desactivado)** — `.github/workflows/sepa.yml` (Node 24): `npm ci → npm run sepa:etl` con
  el secret `SUPABASE_DB_URL`. Desactivado con `gh workflow disable sepa.yml` (el archivo queda igual); si el portal
  vuelve a responderles a los runners, se reactiva con `gh workflow enable sepa.yml` y se deshabilita la tarea local
  - Programado a las **15:30 y 21:30 hora argentina** (`30 18` y `30 0` UTC; el portal publica ~13:20). Los cron
    solo corren desde `main`; la segunda corrida suele terminar en segundos con "sin archivo nuevo"
  - A mano: *Actions → SEPA → Run workflow*, con la opción `force` para volver a cargar un archivo ya cargado
  - `concurrency: sepa` sin cancelar y `timeout-minutes: 30`; el resumen de cada ejecución queda en el *job summary*
  - Si falla, GitHub manda un mail a quien modificó por última vez el `cron`. Un repo público con 60 días sin
    actividad desactiva los workflows programados: reactivarlos desde *Actions*
- **SEPA imágenes** — `.github/workflows/sepa-images.yml` (Node 24): `npm ci → npm run sepa:images` con el secret
  `SUPABASE_DB_URL`; los **domingos a las 06:00 hora argentina** (`0 9 * * 0` UTC) y a mano (*Actions → SEPA
  imágenes → Run workflow*, para adelantar el recorrido del portal); `concurrency: sepa-images` sin cancelar y
  `timeout-minutes: 60`. **Sigue funcionando desde GitHub** (corrida a mano del 21/11/2026: 173 imágenes del portal,
  0 sin respuesta): `imagenes.preciosclaros.gob.ar` no bloquea a los runners. Ese portal responde **403 cuando la
  imagen no existe** (y 200 cuando existe), así que un 403 ahí no es un bloqueo. Si algún día el workflow falla por
  el portal o deja de encontrar imágenes, `gh workflow disable sepa-images.yml` y
  `Enable-ScheduledTask 'El Changuito - SEPA imagenes'` (o `install-tasks.ps1 -EnableImages`)
- **Vercel** — proyecto `elchanguito`, repo `cgermanmr/SmartList`; **`main` → producción** (https://elchanguito.vercel.app), `dev` y PRs → URL de preview automática
- Flujo: rama por spec desde `dev` → merge a `dev` (preview) → merge `dev` → `main` (producción)
- **Cuenta (spec 21), configuración de Auth en `supabase/config.toml`** (se aplica con `npx supabase config diff` y
  `npx supabase config push`): Site URL `https://elchanguito.vercel.app`; Redirect URLs `http://localhost:4200/**`,
  la de producción y la preview de `dev` (`elchanguito-git-dev-cgermanmrs-projects.vercel.app`; **sin comodines**:
  cualquiera puede crear en Vercel un proyecto cuyo dominio encaje y recibir el código del login); código de 6
  dígitos; Google con el cliente web del proyecto "El Changuito" de Google Cloud (cuenta `elchanguito.app@gmail.com`,
  app **en producción**, redirect `https://bjzeknajhrbtormkuunj.supabase.co/auth/v1/callback`). Los secretos van en
  `supabase/.env` (ignorado), que la CLI lee sola: `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`. **Pendiente:** SMTP propio
  (sin él, Supabase manda el mail en inglés, solo con el link y solo a miembros de la organización, y el plan
  gratis no deja cambiar las plantillas); con él se descomentan las plantillas de `supabase/templates/`
- Supabase: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` cargadas **a mano** en Vercel
  (*Settings → Environment Variables*), no con la integración del Marketplace, que crearía un proyecto nuevo; en
  local, `.env.local` (ignorado por git). La clave es la **publishable** (`sb_publishable_…`), la que Supabase
  recomienda hoy; la variable conserva el nombre `ANON_KEY`
- Variables de entorno (plantilla en `.env.example`):

| Variable | Dónde | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel y `.env.local` | App: lectura del catálogo y los precios SEPA (specs 10 y 12) |
| `SUPABASE_DB_URL` | `.env.local` (lo usan las tareas programadas) y secret de GitHub Actions | ETL SEPA: cadena del *Session pooler* (puerto 5432). **Nunca** con prefijo `NEXT_PUBLIC_` |

- El build no necesita ninguna variable de entorno: sin las de Supabase, la app funciona sin el catálogo

### Instalar en el móvil

- **Android (Chrome)**: menú ⋮ → "Instalar app"
- **iPhone (Safari)**: Compartir → "Agregar a pantalla de inicio"

---

## Deuda Técnica Conocida

- `localStorage` sin cifrado ni validación de esquema (salvo la calculadora); la sincronización entre dispositivos
  necesita cuenta (spec 21).
- Sin tests de componentes ni end-to-end (solo lógica pura en `src/lib`).
- Sin service worker.
- `alert()` / `confirm()` nativos en carrito y detalle.

---

## Roadmap

Fases técnicas en [`docs/roadmap.md`](docs/roadmap.md). Features planificados (calculadora de precio unitario,
comparación por comercio, lista compartida, promociones de comercios, pedidos a comercios), su priorización y
prerrequisitos en [`docs/README.md`](docs/README.md). Ideas sin analizar en [`docs/ideas.md`](docs/ideas.md).

---

## Estado Actual

- [x] Búsqueda y filtrado de productos en tiempo real
- [x] Carga de precios y de productos nuevos con validación
- [x] Detalle de producto con estadísticas, gráfico de tendencia e historial editable
- [x] Carrito con cantidades/precios editables y comparación contra última compra
- [x] Checkout con medio de pago y registro automático de precios pagados
- [x] Historial de compras con recarga al carrito (reemplazar/combinar)
- [x] Calculadora de precio unitario con promociones y última comparación guardada
- [x] Persistencia en localStorage
- [x] PWA instalable (manifest)
- [x] Next.js 16 + Vercel con CI (lint, tests, build)
- [ ] Service worker / modo offline
- [x] Base de precios SEPA en Supabase con carga manual (`npm run sepa:etl`)
- [x] Actualización diaria del SEPA (spec 09); desde el 21/11/2026 en una tarea programada local, por el 403 del portal a GitHub Actions
- [x] Sucursales y precios por sucursal en la base SEPA (spec 13)
- [x] Productos con código de barras, marca y presentación; búsqueda y vínculo con el catálogo SEPA (spec 10)
- [x] Lector de códigos de barras con la cámara en Buscar, Cargar precio y Agregar producto (spec 11)
- [x] Precio de referencia SEPA por cadena en Buscar, el lector, el detalle y el carrito (spec 12)
- [x] Carrito agrupado por comercio con checkout por comercio (spec 14)
- [x] Agregar al carrito desde el catálogo sin dar de alta el producto; categoría opcional (spec 18)
- [x] Precios y comercios cercanos con ubicación o localidad en Buscar, el detalle y el carrito (spec 15)
- [x] Restyling: paleta berenjena y amarillo, Rubik + Nunito Sans, íconos de lucide y barra de navegación inferior (spec 19)
- [x] Mapa del comercio con la ruta para llegar y recorrido del carrito (spec 16)
- [x] Imágenes de productos por EAN (Open Food Facts y portal Precios Claros) con marcador de inicial (spec 17)
- [x] Panel de gasto mensual por cadena o comercio y por medio de pago, desde Historial (spec 03)
- [x] Lista de comercios cercanos por distancia con su mapa, desde la barra de ubicación (spec 20)
- [x] ¿Dónde conviene el carrito? Comparación contra las sucursales cercanas o las cadenas y "Pasar todo" (spec 25)
- [x] Comercios cercanos en el lector, producto propio sin salir de Buscar y "¿Cuánto sale acá?" (spec 24)
- [x] Buscador fijo arriba en Buscar, sin título a la vista ni mensaje sin propios (spec 29)
- [x] Cargar precio en el comercio: comercio por GPS o a mano, cualquier producto sin darlo de alta antes y
  `Price.storeRef`; precios propios en Comercios cercanos (spec 26)
- [x] Cuenta optativa con Google o código por mail y sincronización de los datos con Supabase (spec 21)
- [x] Fotos propias de los productos: comprimidas, en el teléfono y con cuenta en un bucket privado; "Solo la ves
  vos" (spec 27)
- [ ] Supabase: grupos, precios compartidos y validación (specs 22 y 23), tiempo real (Fase 2)

---

## Documentación

- Este archivo describe **lo que existe hoy**. Al implementar un feature, actualizar *Funcionalidades* y *Estado Actual*.
- [`docs/`](docs/README.md) contiene **lo que viene**: roadmap, un archivo por feature e ideas.
- [`specs/`](specs/) contiene una spec por cambio, con alcance, decisiones y criterios de aceptación.
- `README.md` queda como presentación breve para GitHub.
