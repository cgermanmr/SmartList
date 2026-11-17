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
- Fase actual: **Fase 1 — Frontend Next.js con localStorage (sin backend)**, publicado en Vercel. Aparte, una base
  Supabase de solo lectura con los precios de Precios Claros (SEPA), actualizada a diario por GitHub Actions
  ([SPEC 08](specs/08-base-sepa-supabase.md), [SPEC 09](specs/09-actualizacion-diaria-sepa.md)). La app consulta
  su catálogo de productos para cargar y vincular productos por código de barras
  ([SPEC 10](specs/10-productos-con-codigo-de-barras.md)) y sus precios por cadena como referencia
  ([SPEC 12](specs/12-precio-de-referencia-sepa.md)), y sus sucursales para mostrar el precio en los comercios
  cercanos ([SPEC 15](specs/15-precios-y-comercios-cercanos.md)); los datos propios siguen en localStorage
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
| @supabase/supabase-js | ^2.119 | Lectura del catálogo SEPA desde el navegador (clave publishable, sin sesión) |
| barcode-detector | ^3.2 | Ponyfill de `BarcodeDetector` (ZXing en WebAssembly) para el lector de códigos de barras |
| lucide-react | ^1.73 | Íconos SVG (solo entran al bundle los que se usan); no se usan emojis como ícono |
| Vitest | ^5 | Tests de la lógica pura |
| ESLint | ^9 | Lint (`eslint-config-next`: core-web-vitals + typescript + reglas del React Compiler) |
| Node.js | ≥ 24 | Runtime (local, CI y Vercel); los scripts del ETL corren como `.ts` sin compilar |
| Supabase | CLI ^2 | Postgres de la base SEPA: migraciones en `supabase/migrations/`, carga con `pg` |

---

## Estructura del Proyecto

```
.github/workflows/ci.yml        # lint + test + build en cada push a main/dev y en cada PR
.github/workflows/sepa.yml      # ETL del SEPA: 15:30 y 21:30 hora argentina y a mano (opción force)
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
└── summary.ts                  # Resumen Markdown de la ejecución para el job summary de GitHub
supabase/
├── config.toml                 # Proyecto de la CLI (supabase init)
├── migrations/                 # SQL versionado: 20261031000000_sepa.sql, 20261116000000_sepa_sucursales.sql
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
│   │                           #   agregar producto; ?tab=producto&ean=… abre agregar producto completado
│   ├── product/[id]/           # page.tsx (Suspense) + ProductDetail.tsx (useParams); vincular con el catálogo
│   ├── cart/page.tsx           # Carrito y checkout con medio de pago
│   ├── purchases/page.tsx      # Historial de compras, Repetir compra
│   ├── calculadora/page.tsx    # Calculadora de precio unitario
│   └── not-found.tsx           # Redirige a /
├── components/
│   ├── NavBar.tsx              # Barra inferior en el celular, arriba desde md; activo con usePathname;
│   │                           #   NavLinks sin activo como fallback
│   ├── CartBadge.tsx           # Contador del carrito sobre el ícono de su pestaña
│   ├── CartSummary.tsx         # Total del carrito en el header, link a /cart
│   ├── Logo.tsx                # Changuito de la marca en SVG (el mismo de icon.svg)
│   ├── StoreHydrator.tsx       # Carga localStorage en el cliente antes de mostrar las páginas
│   ├── NumberInput.tsx         # Input numérico sobre un valor del store (conserva el texto mientras se edita)
│   ├── PriceChart.tsx          # Gráfico de tendencia en SVG propio
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
│   ├── CartStoreDialog.tsx     # Modal <dialog> "Cambiar comercio" de un ítem del carrito; sección "Cerca tuyo"
│   ├── useNearby.ts            # Hooks: useSepaBranches (todas las sucursales), useNearBranches (las del radio) y
│   │                           #   useNearbyPrices (precio de varios EAN en los comercios cercanos, una consulta)
│   ├── LocationBar.tsx         # "Usar mi ubicación" / "Elegir localidad"; con ubicación, radio, Cambiar y Quitar
│   ├── NearbyStores.tsx        # Lista de comercios con dirección, distancia, precio y botón; NearbyLine ("Desde $X…")
│   └── NearbyStoresCard.tsx    # Tarjeta "Comercios cercanos" del detalle
└── lib/                        # Sin dependencias de React salvo store.ts (zustand)
    ├── models.ts               # Interfaces: Product, Price, CartItem, Purchase + tipos de la calculadora
    ├── storage.ts              # Claves preciolocal_*, datos de ejemplo, loadFromStorage/saveToStorage/loadCalculator
    ├── store.ts                # useStore (estado + acciones) y consultas puras (getPriceStats, getCartTotal, ...)
    ├── unit-price.ts           # Funciones puras de la calculadora (precio unitario, promos, comparación)
    ├── format.ts               # formatMoney, formatNumber, formatPctChange, formatDateTime, ... (es-AR)
    ├── ids.ts                  # newId() / uniqueId()
    ├── geo.ts                  # distanceKm (haversine) y formatDistance ("350 m", "1,2 km")
    ├── location.ts             # UserLocation, RADIUS_OPTIONS, parseLocationState, gpsLocation, requestPosition
    ├── gtin.ts                 # Validar y normalizar códigos de barras a GTIN-13 (también lo usa el ETL)
    ├── barcode.ts              # Lector: cameraAvailable, createDetector (nativo o ponyfill), createConfirmer
    ├── supabase.ts             # Cliente de Supabase de solo lectura; null si faltan las variables
    ├── sepa.ts                 # Consultas a sepa_productos (searchSepaProducts, getSepaProduct) y sepa_precios
    │                           #   (getSepaPrices, con caché); referenceSummary, vsReference y funciones puras;
    │                           #   sucursales y precios cercanos (getSepaBranches, nearestBranches,
    │                           #   getNearbyPrices, branchLocalities, storeRefFromBranch)
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
- **Punto de integración con backend** — las acciones del store; cuando llegue Supabase, ahí van las llamadas.
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
- **Comercios cercanos** ([SPEC 15](specs/15-precios-y-comercios-cercanos.md)) — **la ubicación no sale del dispositivo**:
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
  (`"<cadena> — <sucursal>"`, `sepaId`, dirección, barrio y coordenadas)
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
  `<dialog>` nativo con `showModal()` en el detalle (`SepaLinkDialog`: cierra con Escape y devuelve el foco), en el
  carrito (`CartStoreDialog`, se cierra también al ocultarse la página con `<Activity>`) y en el lector de códigos
  de barras (`BarcodeScanner`, a pantalla completa).

### Persistencia (localStorage)

| Clave | Contenido | Valor inicial |
|---|---|---|
| `preciolocal_products` | `Product[]` | 8 productos de ejemplo (`DEFAULT_PRODUCTS`) |
| `preciolocal_prices` | `Price[]` | 3 precios de ejemplo (`defaultPrices()`) |
| `preciolocal_cart` | `CartItem[]` | `[]` |
| `preciolocal_purchases` | `Purchase[]` (más reciente primero) | `[]` |
| `preciolocal_calculator` | `CalculatorState` (última comparación) | Peso, 2 presentaciones vacías en `g` (`defaultCalculator()`) |
| `preciolocal_location` | `{ location: UserLocation \| null, radiusKm }` | Sin ubicación, 3 km |

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
| `/calculadora` | `app/calculadora/page.tsx` | Calculadora | Comparar presentaciones por precio unitario |
| `/product/[id]` | `app/product/[id]/page.tsx` | — | Detalle del producto |
| otra | `app/not-found.tsx` | — | Redirige a `/` |

---

## Modelos de Datos (`src/lib/models.ts`)

```typescript
interface Product {
  id: string;
  name: string;
  category?: string;  // opcional (spec 18): los creados desde el catálogo no tienen; vacía no se guarda
  image?: string;
  ean?: string;       // GTIN-13 (toGtin13); único entre los productos propios
  brand?: string;
  size?: number;      // presentación: 500
  sizeUnit?: Unit;    // va junto con size: los dos o ninguno
}

interface Price {
  id: string;
  productId: string;
  amount: number;
  date: Date;        // string ISO cuando viene de localStorage
  barrio: string;
  store?: string;
}

interface StoreRef {   // comercio de un ítem del carrito; viaja dentro del ítem, sin catálogo
  name: string;
  barrio?: string;
  address?: string;
  sepaId?: string;     // id de sepa_sucursales si viene del SEPA (spec 15)
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
  paymentMethod?: string;
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
- Filtro en tiempo real (`filterProducts`): cada palabra del texto tiene que estar en el nombre, la **marca** o la
  categoría, sin distinguir mayúsculas ni acentos ("playadito" encuentra la yerba y el mate cocido de esa marca;
  "yerba playadito", la "Yerba" de marca PLAYADITO). Si el texto sin espacios son solo dígitos, también los
  productos cuyo EAN los contiene; un GTIN válido en otro formato (EAN-8, UPC-A, GTIN-14 con 0) encuentra el
  GTIN-13 guardado
- **Solo se agrega con la búsqueda terminada:** mientras se buscan los precios de un producto, su botón de agregar
  (catálogo, lector y "Añadir Carrito" de un propio con EAN sin precio propio) dice "Buscando precio…",
  deshabilitado (`aria-busy`); si la consulta falla, se habilita
- Sección **En Precios Claros** debajo de los productos propios (con al menos 3 caracteres y Supabase configurado):
  hasta 20 resultados del catálogo sin los que ya tienen un producto propio. Sin propios que coincidan, el mensaje
  es "No tenés productos con ese nombre"
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
- Botón **Leer código de barras** (ícono) al lado del buscador: un producto propio con ese EAN abre su detalle; si no,
  consulta el catálogo: si está, ofrece **Agregar al carrito** (igual que en la sección del catálogo, con "Editar
  antes de agregar"); si no está o falla la consulta, "Agregar producto", que navega a `/upload?tab=producto&ean=…`.
  Escribir en el buscador borra la oferta. Si el producto tiene precios, la oferta suma el resumen y el botón "Ver
  precios por cadena", que despliega la lista
- Muestra categoría (si tiene), último precio y variación % respecto al precio anterior (`getPriceStats().previous`)
- "Añadir Carrito" con `initialCartPrice` (la referencia SEPA si tiene EAN y no tiene precio propio; nunca el `100`
  de antes) y ajustar cantidad / quitar desde la misma tarjeta
- Navegación al detalle del producto
- **Barra de ubicación** (`LocationBar`, debajo del buscador, solo con Supabase): sin ubicación, "Activá tu
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
  suman al final sus precios cargados a mano de los últimos 60 días que tienen comercio (el último de cada barrio
  + comercio), con "Cargado por vos · dd/mm". Pie "Precios de lista informados a Precios Claros el dd/mm/aaaa",
  en ámbar con más de 7 días
  - **Agregar** en un comercio: crea el producto si no existe (`addSepaToCart` con `at`) y lo deja en el carrito
    con ese comercio y ese precio; si ya estaba, suma 1 y pasa a ellos. No registra precios
  - En el catálogo, debajo de la lista quedan "Agregar sin comercio" (el de la spec 18) y "Editar antes de
    agregar". Un resultado sin precio cercano despliega la lista por cadena de la spec 12
  - Sin ubicación (o si falla la consulta) todo queda como en la spec 12: resumen y lista por cadena

### Cargar (`/upload`)
- Tab **precio**: producto, monto, barrio (requeridos) y tienda (opcional)
- Tab **producto**: nombre (requerido, "Completá el nombre"); "Categoría (opcional)", código de barras, marca y
  presentación (número + unidad), opcionales. Sin categoría, el producto se guarda sin `category`
- Buscador **Buscar en Precios Claros** (espera de 300 ms, "Buscando…", "Sin resultados", error): al elegir un
  resultado completa nombre sugerido (descripción en formato título sin la marca repetida), marca, presentación y
  EAN, todo editable; la categoría es manual (opcional) y el foco pasa a ella
- Código de barras inválido → "Código de barras inválido"; ya usado por otro producto → "Ya tenés este producto"
  con link; en ambos casos no guarda
- `?tab=producto&ean=…` abre la pestaña producto completada con `getSepaProduct`; si el EAN no está en el catálogo,
  solo con el EAN (vacía si no es válido). Al guardar, la URL queda en `?tab=producto`
- Botón **Leer código de barras** (ícono) en los dos tabs:
  - **precio** (al lado del producto): un producto propio con ese EAN queda seleccionado; si no, "No tenés un
    producto con el código …" con "Agregar producto", que lleva al tab producto con `?tab=producto&ean=…`
  - **producto** (al lado del código de barras): propio → "Ya tenés este producto" con link; en el catálogo →
    completa el formulario igual que el buscador; si no, completa solo el EAN y deja el resto como estaba
- Mensajes de éxito/error que se ocultan a los 3 s

### Lector de códigos de barras (`BarcodeScanner`)
- Modal negro a pantalla completa: video de la cámara trasera (`facingMode: { ideal: 'environment' }`), recuadro guía
  horizontal con una línea animada (`animate-scan`, solo con `motion-safe`), "Apuntá al código de barras", botón ✕
  (`aria-label="Cerrar lector"`) y "Escribir el código"
- "Preparando el lector…" mientras se pide el permiso y se carga el detector; al detectar vibra (80 ms)
- Errores, siempre con el ingreso manual abierto: permiso denegado ("Sin permiso para usar la cámara…"), sin cámara
  o sin `getUserMedia` ("Este dispositivo no tiene cámara disponible.") y falla del detector ("No se pudo iniciar el lector.")
- Ingreso manual: valida con `toGtin13` (ignora espacios); inválido → "Código de barras inválido"

### Detalle de producto (`/product/[id]`)
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
- **Un producto, un comercio**: un producto está una sola vez; `addToCart` de uno que ya está suma 1 y, si el ítem
  nuevo trae comercio, lo pasa a ese comercio y precio
- **Cerca tuyo** en "Cambiar comercio" (ítems con EAN, con ubicación): las sucursales cercanas con su precio; al
  elegir una cambian el comercio **y el precio** del ítem (la cantidad no)
- **Cambiar comercio** (link debajo de cada ítem, `CartStoreDialog`): comercios ya usados (`getCartStores`), "Sin
  comercio" u "Otro comercio" (nombre requerido, barrio opcional). No cambia cantidad ni precio
  (`setCartItemStore(itemId, store, price?)`; el precio solo con `price`)
- Editar cantidad y precio de cada ítem; eliminar
- **Ítem sin precio** (entró en $0 desde el catálogo, spec 18): campo en ámbar con "Completar precio" y sin
  comparaciones; el botón de compra de su grupo queda deshabilitado con "Completá los precios para comprar" hasta
  que todos sus ítems tengan precio (tampoco se confirma si el medio de pago ya estaba abierto): nunca se registra
  un `Price` de $0
- Badge comparando contra el precio de la **última compra** (`getLastPurchasedPrice`): verde más barato, rojo más caro, azul igual
- Ítems con EAN: línea "Ref. $X · 8 % arriba" (o "abajo", "en línea") con los mismos colores, comparando el precio del
  ítem contra la referencia SEPA; una sola consulta para todo el carrito
- **Checkout por comercio**: "Comprar en <comercio>" ("Registrar compra" en "Sin comercio") abre el medio de pago de
  ese grupo (un grupo a la vez): efectivo, débito, crédito 1 cuota, crédito en cuotas, transferencia/QR, cheque. En
  "Sin comercio" se pueden escribir barrio y comercio, los dos opcionales
- Al confirmar un grupo: guarda **un** `Purchase` con sus ítems (`store` = comercio, `barrio` solo si se conoce),
  **registra cada precio pagado en el historial de precios** (barrio `Sin especificar` si no se conoce) y saca del
  carrito solo esos ítems (`removeCartItems`); los demás grupos quedan

### Historial de compras (`/purchases`)
- Lista expandible de compras (`aria-expanded` / `aria-controls`)
- Por ítem: variación % del precio pagado vs último precio registrado
- "Repetir" (botón hermano del de expandir, con `aria-label` "Repetir compra del dd/MM/yyyy"): si el carrito tiene
  ítems abre un modal para **combinar o reemplazar** (`loadPurchaseToCart(purchase, merge)`); usa el precio actual
  registrado de cada producto y navega a `/cart`. Los ítems vuelven al comercio de la compra (el `StoreRef` guardado
  en el ítem o `{ name: store, barrio }`); al combinar, un ítem que ya estaba conserva su comercio

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
- **`sepa:etl` termina con "Más de 3 días sin precios nuevos"** — no hubo carga `ok` reciente: revisar las últimas
  ejecuciones en *Actions → SEPA* y las filas de `sepa_cargas`
- **`sepa:etl` termina como `omitida — otra carga en curso`** — otra carga (el workflow u otra local) tiene el
  bloqueo: esperar a que termine; si el proceso murió, Postgres lo suelta al cerrarse la conexión

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
- **Migraciones:** `npx supabase db push --linked` (requiere `npx supabase login` y `link` la primera vez)
- **Carga diaria:** workflow `SEPA` de GitHub Actions (ver *Build y Despliegue*); a mano sigue funcionando
  `npm run sepa:etl`, y el bloqueo evita que pise al workflow

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
- **SEPA** — `.github/workflows/sepa.yml` (Node 24): `npm ci → npm run sepa:etl` con el secret `SUPABASE_DB_URL`
  - Programado a las **15:30 y 21:30 hora argentina** (`30 18` y `30 0` UTC; el portal publica ~13:20). Los cron
    solo corren desde `main`; la segunda corrida suele terminar en segundos con "sin archivo nuevo"
  - A mano: *Actions → SEPA → Run workflow*, con la opción `force` para volver a cargar un archivo ya cargado
  - `concurrency: sepa` sin cancelar y `timeout-minutes: 30`; el resumen de cada ejecución queda en el *job summary*
  - Si falla, GitHub manda un mail a quien modificó por última vez el `cron`. Un repo público con 60 días sin
    actividad desactiva los workflows programados: reactivarlos desde *Actions*
- **Vercel** — proyecto `elchanguito`, repo `cgermanmr/SmartList`; **`main` → producción** (https://elchanguito.vercel.app), `dev` y PRs → URL de preview automática
- Flujo: rama por spec desde `dev` → merge a `dev` (preview) → merge `dev` → `main` (producción)
- Supabase: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` cargadas **a mano** en Vercel
  (*Settings → Environment Variables*), no con la integración del Marketplace, que crearía un proyecto nuevo; en
  local, `.env.local` (ignorado por git). La clave es la **publishable** (`sb_publishable_…`), la que Supabase
  recomienda hoy; la variable conserva el nombre `ANON_KEY`
- Variables de entorno (plantilla en `.env.example`):

| Variable | Dónde | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel y `.env.local` | App: lectura del catálogo y los precios SEPA (specs 10 y 12) |
| `SUPABASE_DB_URL` | `.env.local` y secret de GitHub Actions | ETL SEPA: cadena del *Session pooler* (puerto 5432). **Nunca** con prefijo `NEXT_PUBLIC_` |

- El build no necesita ninguna variable de entorno: sin las de Supabase, la app funciona sin el catálogo

### Instalar en el móvil

- **Android (Chrome)**: menú ⋮ → "Instalar app"
- **iPhone (Safari)**: Compartir → "Agregar a pantalla de inicio"

---

## Deuda Técnica Conocida

- `localStorage` sin cifrado ni validación de esquema (salvo la calculadora); sin sincronización entre dispositivos.
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
- [x] Actualización diaria del SEPA en GitHub Actions (spec 09)
- [x] Sucursales y precios por sucursal en la base SEPA (spec 13)
- [x] Productos con código de barras, marca y presentación; búsqueda y vínculo con el catálogo SEPA (spec 10)
- [x] Lector de códigos de barras con la cámara en Buscar, Cargar precio y Agregar producto (spec 11)
- [x] Precio de referencia SEPA por cadena en Buscar, el lector, el detalle y el carrito (spec 12)
- [x] Carrito agrupado por comercio con checkout por comercio (spec 14)
- [x] Agregar al carrito desde el catálogo sin dar de alta el producto; categoría opcional (spec 18)
- [x] Precios y comercios cercanos con ubicación o localidad en Buscar, el detalle y el carrito (spec 15)
- [x] Restyling: paleta berenjena y amarillo, Rubik + Nunito Sans, íconos de lucide y barra de navegación inferior (spec 19)
- [ ] Supabase: base de datos, autenticación y tiempo real (Fase 2)

---

## Documentación

- Este archivo describe **lo que existe hoy**. Al implementar un feature, actualizar *Funcionalidades* y *Estado Actual*.
- [`docs/`](docs/README.md) contiene **lo que viene**: roadmap, un archivo por feature e ideas.
- [`specs/`](specs/) contiene una spec por cambio, con alcance, decisiones y criterios de aceptación.
- `README.md` queda como presentación breve para GitHub.
