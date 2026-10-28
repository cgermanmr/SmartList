# PrecioLocal — Next.js 16

Estado actual del proyecto: propósito, arquitectura, funcionalidades, puesta en marcha y despliegue.
Roadmap, features futuros e ideas viven en [`docs/`](docs/README.md).

@AGENTS.md

> Next.js 16 cambió APIs y convenciones (Cache Components, Partial Prefetching, `instant`). Antes de usar una API
> de Next, leer la guía correspondiente en `node_modules/next/dist/docs/`.

## Propósito del Proyecto

**PrecioLocal** es una PWA para que los vecinos registren y consulten precios de productos en distintos
comercios/barrios, armen un carrito de compras comparando contra precios anteriores y lleven un historial de compras.

- UI completamente en **español** (números y fechas en `es-AR`: `1.234,56`, `28/10/2026 16:05`; moneda `$`)
- Fase actual: **Fase 1 — Frontend Next.js con localStorage (sin backend)**, publicado en Vercel
- Objetivo: lista de precios personal/familiar para comparar compras entre fechas y analizar la suba de precios y el gasto
- Roadmap: Fase 2 (Supabase: Postgres + Auth + Realtime), Fase 3 (React Native móvil), Fase 4 (microservicios) — detalle en [`docs/roadmap.md`](docs/roadmap.md)
- Hasta la [SPEC 06](specs/06-migracion-nextjs-vercel.md) la app era Angular 19; las specs 01–02 describen esa versión

---

## Stack Tecnológico

| Tecnología | Versión | Rol |
|---|---|---|
| Next.js | 16.4 | Framework (App Router, Turbopack, `cacheComponents` + `partialPrefetching`) |
| React | 19.3 | UI |
| TypeScript | ^5 | Lenguaje (strict + `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride`) |
| Tailwind CSS | ^4 | Estilos (utility-first, mobile-first; loader `@tailwindcss/turbopack`, sin `tailwind.config.js`) |
| Zustand | ^5 | Estado global |
| Vitest | ^5 | Tests de la lógica pura |
| ESLint | ^9 | Lint (`eslint-config-next`: core-web-vitals + typescript + reglas del React Compiler) |
| Node.js | ≥ 24 | Runtime (local, CI y Vercel) |

---

## Estructura del Proyecto

```
.github/workflows/ci.yml        # lint + test + build en cada push a main/dev y en cada PR
docs/                           # Roadmap, features futuros (features/NN-*.md) e ideas
specs/                          # Specs NN-*.md (una por cambio)
public/
├── manifest.json               # PWA: tema #0f766e, display standalone
└── icon.svg                    # Ícono de la app y favicon
src/
├── app/                        # App Router: cada carpeta = ruta, page.tsx = página
│   ├── layout.tsx              # Header (CartSummary), NavBar, <StoreHydrator>{children}, footer; metadata y viewport
│   ├── globals.css             # Tailwind v4 + @theme (paleta primary) + @layer components
│   ├── page.tsx                # Buscar
│   ├── upload/page.tsx         # Tabs: cargar precio / agregar producto
│   ├── product/[id]/           # page.tsx (Suspense) + ProductDetail.tsx (useParams)
│   ├── cart/page.tsx           # Carrito y checkout con medio de pago
│   ├── purchases/page.tsx      # Historial de compras, Repetir compra
│   ├── calculadora/page.tsx    # Calculadora de precio unitario
│   └── not-found.tsx           # Redirige a /
├── components/
│   ├── NavBar.tsx              # Links con estado activo (usePathname); NavLinks sin activo como fallback
│   ├── CartSummary.tsx         # "Carrito: N | Total: $X" del header
│   ├── StoreHydrator.tsx       # Carga localStorage en el cliente antes de mostrar las páginas
│   ├── NumberInput.tsx         # Input numérico sobre un valor del store (conserva el texto mientras se edita)
│   └── PriceChart.tsx          # Gráfico de tendencia en SVG propio
└── lib/                        # Sin dependencias de React salvo store.ts (zustand)
    ├── models.ts               # Interfaces: Product, Price, CartItem, Purchase + tipos de la calculadora
    ├── storage.ts              # Claves preciolocal_*, datos de ejemplo, loadFromStorage/saveToStorage/loadCalculator
    ├── store.ts                # useStore (estado + acciones) y consultas puras (getPriceStats, getCartTotal, ...)
    ├── unit-price.ts           # Funciones puras de la calculadora (precio unitario, promos, comparación)
    ├── format.ts               # formatMoney, formatNumber, formatPctChange, formatDateTime, ... (es-AR)
    ├── ids.ts                  # newId() / uniqueId()
    └── *.test.ts               # Tests de Vitest junto a cada módulo
```

---

## Arquitectura y Patrones

- **App Router** — una carpeta por ruta con `page.tsx`. Las páginas son Client Components (`'use client'`) porque
  todos los datos viven en `localStorage`.
- **Render solo en el cliente** — `StoreHydrator` (en el layout) llama a `hydrate()` en un `useEffect` y muestra
  "Cargando…" hasta entonces. El servidor solo prerenderiza el shell (header, nav, footer).
- **Cache Components** — Next oculta las páginas con `<Activity>` en vez de desmontarlas (hasta 3 rutas): el estado
  local de una página (pestaña, formulario, paso de pago) se conserva al volver. Los hooks de URL (`useParams`,
  `usePathname`) en rutas dinámicas necesitan un `<Suspense>` arriba, o el build falla.
  `Date.now()` / `Math.random()` no pueden ejecutarse durante el prerender: generarlos en handlers o en funciones
  que se llamen en el cliente (`defaultPrices()`, `newId()`).
- **Validación de navegación instantánea** — `experimental.instantInsights.validationLevel: 'manual-warning'` en
  `next.config.ts`: solo se validan los segmentos que exporten `instant`.
- **Estado (Zustand)** — un único `useStore` en `src/lib/store.ts`. Las páginas leen con selectores
  (`useStore(s => s.cart)`) y llaman acciones (`useStore(s => s.addToCart)`). Las consultas derivadas son funciones
  puras que reciben la colección: `getPricesForProduct(prices, id)`, `getPriceStats(prices, id)`,
  `getCartTotal(cart)`, `getLastPurchasedPrice(purchases, id)`. Fuera de React: `useStore.getState()`.
- **Patrón de mutación** — las acciones devuelven arrays y objetos nuevos (`map` con spread), nunca mutan los existentes.
- **Persistencia** — una suscripción al store guarda en su clave cada colección que cambió, solo después de hidratar.
- **Punto de integración con backend** — las acciones del store; cuando llegue Supabase, ahí van las llamadas.
- **IDs** — `newId()` (`Date.now().toString()`) y `uniqueId()` (con sufijo aleatorio) de `src/lib/ids.ts` (sin UUID).
  El lint (`react-hooks/purity`) no deja llamar a `Date.now()` directamente en el cuerpo de un componente.
- **Diálogos** — `alert()` / `confirm()` nativos del navegador (carrito y detalle); modal propio en el historial.

### Persistencia (localStorage)

| Clave | Contenido | Valor inicial |
|---|---|---|
| `preciolocal_products` | `Product[]` | 8 productos de ejemplo (`DEFAULT_PRODUCTS`) |
| `preciolocal_prices` | `Price[]` | 3 precios de ejemplo (`defaultPrices()`) |
| `preciolocal_cart` | `CartItem[]` | `[]` |
| `preciolocal_purchases` | `Purchase[]` (más reciente primero) | `[]` |
| `preciolocal_calculator` | `CalculatorState` (última comparación) | Peso, 2 presentaciones vacías en `g` (`defaultCalculator()`) |

El formato es el mismo que usaba la versión Angular: no hace falta migrar datos.
`loadFromStorage<T>` / `saveToStorage<T>` envuelven todo en try/catch (fallback a defaults; ignora cuota excedida).
`preciolocal_calculator` además se valida al cargar (`loadCalculator`): si la magnitud, el largo (2–6) o la forma de
alguna presentación no es válida, se usa el estado inicial.
Al leer de localStorage, `Price.date` vuelve como **string**: siempre comparar con `new Date(p.date)`.

### Rutas

| Path | Archivo | Nav | Función |
|---|---|---|---|
| `/` | `app/page.tsx` | 🔍 Buscar | Búsqueda de productos |
| `/upload` | `app/upload/page.tsx` | 📸 Cargar Precio | Cargar precio o producto nuevo |
| `/cart` | `app/cart/page.tsx` | 🛒 Mi Carrito | Carrito y checkout |
| `/purchases` | `app/purchases/page.tsx` | 📋 Historial | Historial de compras |
| `/calculadora` | `app/calculadora/page.tsx` | 🧮 Calculadora | Comparar presentaciones por precio unitario |
| `/product/[id]` | `app/product/[id]/page.tsx` | — | Detalle del producto |
| otra | `app/not-found.tsx` | — | Redirige a `/` |

---

## Modelos de Datos (`src/lib/models.ts`)

```typescript
interface Product {
  id: string;
  name: string;
  category: string;
  image?: string;
}

interface Price {
  id: string;
  productId: string;
  amount: number;
  date: Date;        // string ISO cuando viene de localStorage
  barrio: string;
  store?: string;
}

interface CartItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  subtotal: number;  // price * quantity, se recalcula en cada cambio
}

interface Purchase {
  id: string;
  date: string;      // ISO
  items: CartItem[];
  total: number;
  barrio?: string;
  store?: string;
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
- Filtro en tiempo real por nombre o categoría (case-insensitive)
- Muestra último precio y variación % respecto al precio anterior (`getPriceStats().previous`)
- Agregar al carrito (si no hay precio registrado usa `100` como fallback) y ajustar cantidad / quitar desde la misma tarjeta
- Navegación al detalle del producto

### Cargar (`/upload`)
- Tab **precio**: producto, monto, barrio (requeridos) y tienda (opcional)
- Tab **producto**: nombre y categoría (requeridos)
- Mensajes de éxito/error que se ocultan a los 3 s

### Detalle de producto (`/product/[id]`)
- Estadísticas: actual, mínimo, máximo, promedio (`getPriceStats`)
- Gráfico de tendencia en **SVG propio** (`PriceChart`, sin librerías), solo si hay más de 3 precios
- Historial de precios con barrio, tienda y fecha; edición inline del monto (`updatePrice`; Enter guarda, Escape cancela)
- Agregar al carrito con el precio actual

### Carrito (`/cart`)
- Editar cantidad y precio de cada ítem; eliminar; vaciar (con `confirm`)
- Badge comparando contra el precio de la **última compra** (`getLastPurchasedPrice`): verde más barato, rojo más caro, azul igual
- Opción "comercio único" (barrio + tienda) para toda la compra
- Checkout en dos pasos con medio de pago: efectivo, débito, crédito 1 cuota, crédito en cuotas, transferencia/QR, cheque
- Al confirmar: guarda un `Purchase`, **registra cada precio pagado en el historial de precios** (barrio `Sin especificar` si no es comercio único) y vacía el carrito

### Historial de compras (`/purchases`)
- Lista expandible de compras (`aria-expanded` / `aria-controls`)
- Por ítem: variación % del precio pagado vs último precio registrado
- "Repetir" (botón hermano del de expandir, con `aria-label` "Repetir compra del dd/MM/yyyy"): si el carrito tiene
  ítems abre un modal para **combinar o reemplazar** (`loadPurchaseToCart(purchase, merge)`); usa el precio actual
  registrado de cada producto y navega a `/cart`

### Calculadora de precio unitario (`/calculadora`)
- Herramienta independiente: no lee ni modifica productos, precios, carrito ni compras
- Magnitud fija por comparación: **Peso** (`g`, `kg`), **Volumen** (`ml`, `l`) o **Unidades** (`u`); al cambiarla, todas las unidades pasan a la de defecto (`g`, `ml`, `u`) y se conservan precios, cantidades y promos
- De **2 a 6 presentaciones**, cada una con nombre opcional, precio, cantidad y unidad
- Promoción opcional por presentación: NxM (3x2), % de descuento en la N-ésima unidad ("70% en la 2da" = la 2da cuesta 30 %), % de descuento directo; las promos asumen **lote completo** y muestran la leyenda "llevando N"
- Resultado en vivo normalizado a **$/kg**, **$/l** o **$/u**: la más conveniente en verde (todas las empatadas), `+X %` en las demás, "Completar datos" en las inválidas; hay ganador solo con al menos 2 válidas
- Cálculo en `lib/unit-price.ts` (`toBaseQuantity`, `lotOf`, `unitPrice`, `compare`), sin dependencias de React
- Cada cambio se guarda en `preciolocal_calculator`; "Nueva comparación" vuelve al estado inicial sin confirmar

### Layout y PWA
- Header con contador de ítems y total del carrito
- Nav con scroll horizontal (`overflow-x-auto`) para que los 5 ítems entren en móvil
- `manifest.json` con `display: standalone` → instalable desde el navegador; `theme-color` en `viewport` del layout
- **No hay service worker**: la app no funciona offline sin conexión inicial (los datos sí persisten en localStorage)

---

## Puesta en Marcha

Requisitos: Node.js ≥ 24.

```bash
npm install        # primera vez
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
```

### Solución de problemas

- **Puerto 4200 ocupado** — Windows PowerShell: `Get-Process node | Stop-Process -Force`; Mac/Linux: `lsof -ti:4200 | xargs kill -9`
- **Módulos rotos** — borrar `node_modules`, `.next` y `package-lock.json`, luego `npm install`
- **Datos viejos / de ejemplo** — DevTools → Application → Local Storage → borrar las claves `preciolocal_*`
- **`LayoutProps` no encontrado en `tsc`** — es un tipo global que genera Next: correr `npm run build` (o `npx next typegen`)
- **Build falla por `useParams`/`usePathname` fuera de Suspense o por `Date.now()` en prerender** — ver *Cache Components* en Arquitectura
- **PWA no se instala** — requiere HTTPS (automático en Vercel) y un `manifest.json` válido

---

## Convenciones del Código

- **TypeScript strict** completo; alias `@/*` → `src/*`
- Páginas en `src/app/<ruta>/page.tsx`; componentes compartidos en `src/components/` (PascalCase, `export default`);
  lógica sin UI en `src/lib/`
- Componentes de página con `'use client'`; los `page.tsx` que necesiten `Suspense` quedan como Server Component y
  envuelven a un componente cliente colocado al lado (ver `product/[id]/`)
- Formularios controlados con `useState`; inputs con `id` + `<label htmlFor>`; números del store con `NumberInput`
- Formato siempre con `src/lib/format.ts` (nunca `toFixed` para mostrar)
- Tailwind exclusivamente para estilos; clases reutilizables en `globals.css` (`@layer components`): `.btn-primary`, `.btn-secondary`, `.card`, `.input-field`
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

Paleta custom `primary` (teal) en `@theme` de `src/app/globals.css`:

| Token | Hex | Uso |
|---|---|---|
| `primary-50` | `#f0fdfa` | |
| `primary-200` | `#99f6e4` | Focus ring de inputs |
| `primary-500` | `#14b8a6` | Borde de input en focus |
| `primary-600` | `#0d9488` | Gradiente del header |
| `primary-700` | `#0f766e` | **Color de marca** (botones, nav activo, `theme_color` PWA) |
| `primary-800` | `#115e59` | Hover de `.btn-primary` |
| `primary-900` | `#134e4a` | |

---

## Build y Despliegue

- **CI** — `.github/workflows/ci.yml` (Node 24): `npm ci → lint → test → build` en cada push a `main`/`dev` y en cada PR
- **Vercel** — repo `cgermanmr/SmartList` conectado; **`main` → producción**, `dev` y PRs → URL de preview automática
- Flujo: rama por spec desde `dev` → merge a `dev` (preview) → merge `dev` → `main` (producción)
- Supabase (Fase 2): integración del Marketplace de Vercel, que carga `NEXT_PUBLIC_SUPABASE_URL` y
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`; en local, `.env.local` (ignorado por git)

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
- [ ] Supabase: base de datos, autenticación y tiempo real (Fase 2)

---

## Documentación

- Este archivo describe **lo que existe hoy**. Al implementar un feature, actualizar *Funcionalidades* y *Estado Actual*.
- [`docs/`](docs/README.md) contiene **lo que viene**: roadmap, un archivo por feature e ideas.
- [`specs/`](specs/) contiene una spec por cambio, con alcance, decisiones y criterios de aceptación.
- `README.md` queda como presentación breve para GitHub.
