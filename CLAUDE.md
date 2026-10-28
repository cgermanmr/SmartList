# PrecioLocal — Angular 19

Estado actual del proyecto: propósito, arquitectura, funcionalidades, puesta en marcha y despliegue.
Roadmap, features futuros e ideas viven en [`docs/`](docs/README.md).

## Propósito del Proyecto

**PrecioLocal** es una PWA para que los vecinos registren y consulten precios de productos en distintos
comercios/barrios, armen un carrito de compras comparando contra precios anteriores y lleven un historial de compras.

- UI completamente en **español** (formato de fechas `es-AR`, moneda `$`)
- Fase actual: **Fase 1 — Frontend Angular con localStorage (sin backend)**
- Objetivo: lista de precios personal/familiar para comparar compras entre fechas y analizar la suba de precios y el gasto
- Roadmap: Fase 2 (backend .NET 8 + DB), Fase 3 (React Native móvil), Fase 4 (microservicios) — detalle en [`docs/roadmap.md`](docs/roadmap.md)

---

## Stack Tecnológico

| Tecnología | Versión | Rol |
|---|---|---|
| Angular | ^19.0.0 | Framework principal (standalone components) |
| TypeScript | ^5.6.0 | Lenguaje (strict mode + `strictTemplates`) |
| Tailwind CSS | ^3.4.0 | Estilos (utility-first, mobile-first) |
| RxJS | ^7.8.0 | Estado reactivo (BehaviorSubjects) |
| zone.js | ^0.15.0 | Change detection (no es zoneless) |
| PostCSS + Autoprefixer | ^8.4 / ^10.4 | Transformación CSS |
| Angular CLI | ^19.0.0 | Build y dev server (builder `@angular-devkit/build-angular:browser`) |

---

## Estructura del Proyecto

```
docs/
├── README.md                   # Índice de features futuros, priorización y prerrequisitos
├── roadmap.md                  # Fases 2–4
├── ideas.md                    # Bandeja de ideas sin analizar
└── features/                   # Un archivo por feature (NN-nombre.md)
src/
├── app/
│   ├── models/
│   │   └── product.ts          # Interfaces: Product, Price, CartItem, Purchase + tipos de la calculadora
│   ├── services/
│   │   └── data.service.ts     # Servicio único con toda la lógica de datos + persistencia
│   ├── utils/
│   │   └── unit-price.ts       # Funciones puras de la calculadora (precio unitario, promos, comparación)
│   ├── pages/                  # Cada página = *.component.ts + *.component.html
│   │   ├── search/             # Búsqueda, último precio, variación %, +/- cantidad en carrito
│   │   ├── cart/               # Carrito, comparación vs última compra, checkout con medio de pago
│   │   ├── upload/             # Tabs: cargar precio / agregar producto
│   │   ├── product/            # Detalle: stats, gráfico SVG, historial editable
│   │   ├── purchases/          # Historial de compras, recargar compra al carrito
│   │   └── calculator/         # Calculadora de precio unitario ($/kg, $/l, $/u) con promociones
│   ├── app.component.ts/.html  # Layout: header (contador + total carrito), nav, router-outlet, footer
│   └── app.routes.ts           # Rutas con lazy loading (loadComponent)
├── index.html                  # lang="es", theme-color, link a manifest
├── main.ts                     # bootstrapApplication + provideRouter + provideAnimations
├── styles.css                  # Estilos globales + @layer components de Tailwind
└── manifest.json               # PWA: tema #0f766e, ícono SVG inline
```

---

## Arquitectura y Patrones

- **Standalone Components** — sin NgModules; cada componente declara sus `imports` (`CommonModule`, `FormsModule`, `RouterModule`)
- **Templates en archivo separado** — `templateUrl: './x.component.html'` (no inline)
- **DataService** — servicio único `providedIn: 'root'`, inyectado por constructor (`constructor(private data: DataService)`)
- **Estado** — un `BehaviorSubject` privado por colección, expuesto como Observable con sufijo `$`: `products$`, `prices$`, `cart$`, `purchases$`, `calculator$`; getters síncronos `getProducts()`, `getPrices()`, `getCart()`, `getPurchases()`, `getCalculator()`
- **Patrón de mutación** — construir el nuevo array → `subject.next(next)` → `saveToStorage(KEY, next)`
- **Sin NgRx** — estado gestionado directamente con RxJS
- **IDs** — se generan con `Date.now().toString()` (sin UUID)
- **Diálogos** — se usan `alert()` / `confirm()` nativos del navegador (carrito y detalle)

### Persistencia (localStorage)

| Clave | Contenido | Valor inicial |
|---|---|---|
| `preciolocal_products` | `Product[]` | 8 productos de ejemplo (`DEFAULT_PRODUCTS`) |
| `preciolocal_prices` | `Price[]` | 3 precios de ejemplo (`DEFAULT_PRICES`) |
| `preciolocal_cart` | `CartItem[]` | `[]` |
| `preciolocal_purchases` | `Purchase[]` (más reciente primero) | `[]` |
| `preciolocal_calculator` | `CalculatorState` (última comparación) | Peso, 2 presentaciones vacías en `g` (`DEFAULT_CALCULATOR`) |

`loadFromStorage<T>` / `saveToStorage<T>` (genéricos, no solo arrays) envuelven todo en try/catch (fallback a defaults; ignora cuota excedida).
`preciolocal_calculator` además se valida al cargar (`loadCalculator`): si la magnitud, el largo (2–6) o la forma de alguna
presentación no es válida, se usa el estado inicial.
Al leer de localStorage, `Price.date` vuelve como **string**: siempre comparar con `new Date(p.date)`.

### Rutas

| Path | Componente | Nav | Función |
|---|---|---|---|
| `/` | SearchComponent | 🔍 Buscar | Búsqueda de productos |
| `/upload` | UploadComponent | 📸 Cargar Precio | Cargar precio o producto nuevo |
| `/cart` | CartComponent | 🛒 Mi Carrito | Carrito y checkout |
| `/purchases` | PurchasesComponent | 📋 Historial | Historial de compras |
| `/calculadora` | CalculatorComponent | 🧮 Calculadora | Comparar presentaciones por precio unitario |
| `/product/:id` | ProductComponent | — | Detalle del producto |
| `**` | — | — | Redirige a `/` |

---

## Modelos de Datos (`src/app/models/product.ts`)

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

### Detalle de producto (`/product/:id`)
- Estadísticas: actual, mínimo, máximo, promedio (`getPriceStats`)
- Gráfico de tendencia en **SVG propio** (sin librerías), solo si hay más de 3 precios
- Historial de precios con barrio, tienda y fecha; edición inline del monto (`updatePrice`)
- Agregar al carrito con el precio actual

### Carrito (`/cart`)
- Editar cantidad y precio de cada ítem; eliminar; vaciar (con `confirm`)
- Badge comparando contra el precio de la **última compra** (`getLastPurchasedPrice`): verde más barato, rojo más caro, azul igual
- Opción "comercio único" (barrio + tienda) para toda la compra
- Checkout en dos pasos con medio de pago: efectivo, débito, crédito 1 cuota, crédito en cuotas, transferencia/QR, cheque
- Al confirmar: guarda un `Purchase`, **registra cada precio pagado en el historial de precios** (barrio `Sin especificar` si no es comercio único) y vacía el carrito

### Historial de compras (`/purchases`)
- Lista expandible de compras
- Por ítem: variación % del precio pagado vs último precio registrado
- "Cargar al carrito": si el carrito tiene ítems pregunta si **reemplazar o combinar** (`loadPurchaseToCart(purchase, merge)`); usa el precio actual registrado de cada producto

### Calculadora de precio unitario (`/calculadora`)
- Herramienta independiente: no lee ni modifica productos, precios, carrito ni compras
- Magnitud fija por comparación: **Peso** (`g`, `kg`), **Volumen** (`ml`, `l`) o **Unidades** (`u`); al cambiarla, todas las unidades pasan a la de defecto (`g`, `ml`, `u`) y se conservan precios, cantidades y promos
- De **2 a 6 presentaciones**, cada una con nombre opcional, precio, cantidad y unidad
- Promoción opcional por presentación: NxM (3x2), % de descuento en la N-ésima unidad ("70% en la 2da" = la 2da cuesta 30 %), % de descuento directo; las promos asumen **lote completo** y muestran la leyenda "llevando N"
- Resultado en vivo normalizado a **$/kg**, **$/l** o **$/u**: la más conveniente en verde (todas las empatadas), `+X %` en las demás, "Completar datos" en las inválidas; hay ganador solo con al menos 2 válidas
- Cálculo en `utils/unit-price.ts` (`toBaseQuantity`, `lotOf`, `unitPrice`, `compare`), sin dependencias de Angular
- Guarda la última comparación en `preciolocal_calculator`; "Nueva comparación" vuelve al estado inicial sin confirmar

### Layout y PWA
- Header con contador de ítems y total del carrito
- Nav con scroll horizontal (`overflow-x-auto`) para que los 5 ítems entren en móvil
- `manifest.json` con `display: standalone` → instalable desde el navegador
- **No hay service worker**: la app no funciona offline sin conexión inicial (los datos sí persisten en localStorage)

---

## Puesta en Marcha

Requisitos: Node.js ≥ 18, npm ≥ 9.

```bash
npm install        # primera vez (~2-3 min)
npm start          # ng serve --open → http://localhost:4200 (configuración development)
```

### Scripts

```bash
npm start          # Dev server con hot reload
npm run build      # ng build (defaultConfiguration = production)
npm run build:prod # Build de producción → dist/precio-local/
npm run watch      # Build en modo watch (development)
npm run format     # Prettier sobre src/**/*.{ts,html,css}
npm test           # ng test
npm run lint       # ng lint
```

> `format`, `test` y `lint` están declarados pero **sus herramientas no están instaladas** (no hay `prettier`,
> karma/jasmine ni eslint en `devDependencies`, ni target `test`/`lint` en `angular.json`). Hay que agregarlas
> antes de usarlos.

### Solución de problemas

- **Puerto 4200 ocupado** — Windows PowerShell: `Get-Process node | Stop-Process -Force`; Mac/Linux: `lsof -ti:4200 | xargs kill -9`
- **Módulos rotos** — borrar `node_modules` y `package-lock.json`, luego `npm install`
- **Datos viejos / de ejemplo** — DevTools → Application → Local Storage → borrar las claves `preciolocal_*`
- **PWA no se instala** — requiere HTTPS (automático en Netlify/Vercel) y un `manifest.json` válido
- `angular.json` declara `src/favicon.ico` como asset pero el archivo **no existe** en el repo

---

## Convenciones del Código

- **TypeScript strict** completo (`strict`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `strictTemplates`)
- Componentes standalone con selector `app-[nombre]` (prefix `app` en `angular.json`)
- Templates en `.component.html` junto al `.component.ts`
- Observables expuestos con sufijo `$`
- Tailwind exclusivamente para estilos; clases reutilizables en `styles.css` (`@layer components`): `.btn-primary`, `.btn-secondary`, `.card`, `.input-field`
- Grids responsivos: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- Formularios con `FormsModule` y `[(ngModel)]` (sin Reactive Forms)
- Comentarios de sección en el código con el estilo `// ── Título ─────`
- Textos de UI y comentarios en español
- Finales de línea LF (forzado por `.gitattributes`)

### Agregar una página nueva

1. Crear `src/app/pages/<nombre>/<nombre>.component.ts` + `.html` (standalone, `templateUrl`)
2. Agregar la ruta con `loadComponent` en `app.routes.ts`
3. Agregar el link en el `<nav>` de `app.component.html`
4. Si necesita datos nuevos: modelo en `product.ts`, `BehaviorSubject` + clave `preciolocal_*` en `DataService`

### Checklist de calidad

- [ ] `npm run build:prod` sin errores ni warnings
- [ ] Responsive en móvil
- [ ] Validaciones de formularios completas
- [ ] Accesibilidad básica
- [ ] Sin memory leaks

---

## Configuración de Estilos

Paleta custom `primary` (teal) en `tailwind.config.js`:

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

- Salida: `dist/precio-local/` (archivos estáticos)
- Presupuesto de producción (bundle inicial): 500 KB warning / 1 MB error
- **Netlify**: `npm run build:prod` y arrastrar `dist/precio-local` a https://app.netlify.com/drop
- **Vercel**: conectar el repositorio o ejecutar `vercel` tras el build
- **GitHub Pages**: publicar `dist/precio-local` (ajustar `<base href>` si se sirve desde subcarpeta)
- Al ser SPA, el hosting debe redirigir rutas desconocidas a `index.html`

### Instalar en el móvil

- **Android (Chrome)**: menú ⋮ → "Instalar app"
- **iPhone (Safari)**: Compartir → "Agregar a pantalla de inicio"

---

## Deuda Técnica Conocida

- Las suscripciones en `ngOnInit` no se desuscriben (sin `takeUntilDestroyed` / `async` pipe). En `ProductComponent` se anida una suscripción a `prices$` dentro de `route.params`, que se acumula al navegar entre productos.
- Varios métodos de `DataService` (`addToCart`, `updateQuantity`, `updatePrice`, `updateCartItemPrice`) mutan el objeto existente antes de emitir un array nuevo.
- `ProductComponent.stats` está tipado como `any`.
- `localStorage` sin cifrado ni validación de esquema; sin sincronización entre dispositivos.
- Sin tests, sin lint, sin service worker (ver secciones anteriores).

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
- [ ] Service worker / modo offline
- [ ] Tests y lint configurados
- [ ] Backend .NET 8 (Fase 2)
- [ ] Autenticación JWT (Fase 2)

---

## Documentación

- Este archivo describe **lo que existe hoy**. Al implementar un feature, actualizar *Funcionalidades* y *Estado Actual*.
- [`docs/`](docs/README.md) contiene **lo que viene**: roadmap, un archivo por feature e ideas.
- `README.md` queda como presentación breve para GitHub.
