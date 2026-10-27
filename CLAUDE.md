# CLAUDE.md — PrecioLocal Angular 19

## Propósito del Proyecto

**PrecioLocal** es una PWA (Progressive Web App) para comparar precios de productos en distintos comercios/barrios y gestionar un carrito de compras. El objetivo es que los vecinos puedan registrar y consultar precios localmente.

- UI completamente en **español**
- Fase actual: **Fase 1 — Frontend Angular con localStorage (sin backend)**
- Roadmap: Fase 2 (backend .NET 8 + DB), Fase 3 (React Native móvil), Fase 4 (microservicios)

---

## Stack Tecnológico

| Tecnología | Versión | Rol |
|---|---|---|
| Angular | ^19.0.0 | Framework principal (standalone components) |
| TypeScript | ^5.6.0 | Lenguaje (strict mode activo) |
| Tailwind CSS | ^3.4.0 | Estilos (utility-first, mobile-first) |
| RxJS | ^7.8.0 | Estado reactivo (BehaviorSubjects) |
| PostCSS + Autoprefixer | ^8.4 / ^10.4 | Transformación CSS |
| Angular CLI | ^19.0.0 | Build y dev server |

---

## Estructura del Proyecto

```
src/
├── app/
│   ├── models/
│   │   └── product.ts          # Interfaces: Product, CartItem, Price
│   ├── services/
│   │   └── data.service.ts     # Servicio único con toda la lógica de datos
│   ├── pages/
│   │   ├── search/             # Búsqueda y filtrado de productos
│   │   ├── cart/               # Carrito (cantidades, totales, vaciar)
│   │   ├── upload/             # Formulario para cargar precios
│   │   └── product/            # Detalle: stats de precio + historial
│   ├── app.component.ts        # Root component: layout + header
│   └── app.routes.ts           # 4 rutas con lazy loading
├── index.html
├── main.ts
├── styles.css                  # Estilos globales + @layer components Tailwind
└── manifest.json               # PWA: tema teal #0f766e
```

---

## Arquitectura y Patrones

- **Standalone Components** — sin NgModules (Angular 19 moderno)
- **DataService** — servicio único `providedIn: 'root'` con BehaviorSubjects para state
- **Observables con sufijo `$`** — `products$`, `prices$`, `cart$`
- **Lazy loading** — rutas usan dynamic imports
- **Sin NgRx** — estado gestionado directamente con RxJS BehaviorSubjects
- **localStorage** — persistencia en Fase 1 (sin backend)

### Rutas

| Path | Componente | Función |
|---|---|---|
| `/` | SearchComponent | Búsqueda de productos |
| `/cart` | CartComponent | Carrito de compras |
| `/upload` | UploadComponent | Cargar nuevo precio |
| `/product/:id` | ProductComponent | Detalle del producto |

---

## Modelos de Datos

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
  date: Date;
  barrio: string;
  store?: string;
}

interface CartItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  subtotal: number;
}
```

---

## Scripts Disponibles

```bash
npm start          # Dev server en localhost:4200 con auto-open
npm run build      # Build de desarrollo
npm run build:prod # Build de producción optimizado → dist/precio-local/
npm run watch      # Build en modo watch
npm run format     # Prettier
```

---

## Convenciones del Código

- **TypeScript strict** completamente activo (noImplicitAny, noImplicitOverride, etc.)
- Componentes standalone con selector `app-[nombre]`
- Templates inline en los componentes
- Observables expuestos con sufijo `$`
- Tailwind exclusivamente para estilos, con paleta custom `primary` (teal)
- Clases de componentes reutilizables definidas en `styles.css` con `@layer components`
- Grids responsivos: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- Formularios con `FormsModule` y `[(ngModel)]`

---

## Configuración de Estilos

Paleta custom en `tailwind.config.js`:
- `primary-500` = `#0f766e` (color de marca teal)
- Rango: `primary-50` (#f0fdfa) a `primary-900` (#134e4a)

---

## Requisitos de Entorno

- Node.js ≥ 18, npm ≥ 9
- `npm install` antes de empezar
- Build de producción: límite 500KB (warn) / 1MB (error)
- Despliegue: archivos estáticos en `dist/precio-local/` → Netlify, Vercel o GitHub Pages

---

## Documentación Existente

| Archivo | Contenido |
|---|---|
| `README.md` | Introducción general |
| `INICIO_RAPIDO.md` | Guía de inicio rápido en español |
| `FEATURES.md` | Lista de funcionalidades y roadmap |
| `DESCARGAR_Y_USAR.md` | Guía de descarga y uso |
| `RESUMEN.txt` | Resumen del proyecto |

---

## Estado Actual (Fase 1)

- [x] Búsqueda y filtrado de productos en tiempo real
- [x] Carrito con cantidades, subtotales y total
- [x] Formulario de carga de precios con validación
- [x] Detalle de producto con estadísticas (min/max/promedio) e historial
- [x] PWA: manifest.json, tema teal, instalable
- [x] localStorage persistente (pendiente)
- [ ] Backend .NET 8 (Fase 2)
- [ ] Autenticación JWT (Fase 2)
