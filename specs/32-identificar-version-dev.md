# SPEC 32 — Identificar la versión de dev

> **Estado:** Implementada
> **Depende de:** [SPEC 06](06-migracion-nextjs-vercel.md), [SPEC 07](07-nombre-el-changuito.md), [SPEC 19](19-restyling-base-y-navegacion.md), [SPEC 30](30-compartir-por-whatsapp.md)
> **Fecha:** 2026-11-24
> **Objetivo:** Que la versión de dev (y la local) se distinga de la de producción por su nombre, su ícono y una etiqueta en el header, sin cambiar nada de lo que ve quien usa producción salvo el ícono en el iPhone.

## Por qué existe esta spec

La preview de `dev` y producción usan el mismo manifest: instaladas en el celular tienen el mismo nombre y el mismo
ícono, y una vez abiertas no se ve la dirección. Sus datos son distintos, así que es fácil probar sobre los datos reales
o cargar una compra real en la de prueba.

## Alcance

**Incluye:**

- Tres entornos, resueltos al compilar: **producción** (sin marca), **DEV** (toda preview de Vercel: `dev` y los PR) y
  **LOCAL** (fuera de Vercel: `npm run dev`, `npm start` y la CI).
- Nombre de la app instalada, título de la pestaña, íconos y etiqueta en el header según el entorno.
- Ícono PNG para el iPhone (`apple-touch-icon`) en los tres, también en producción (pendiente desde la spec 19).
- El build en Vercel falla si no se conoce el entorno.

**Fuera de alcance:**

- Cambiar el color del header o de la barra de estado (`theme-color`).
- Distinguir entre sí la preview de `dev` y la de cada PR.
- Vista previa del link (Open Graph): sigue siendo la de producción en todos los entornos.
- Pantallas de inicio (splash) del iPhone.
- Separar la base de Supabase de dev y la de producción, o pasar datos de una app a la otra.
- Mostrar el número de versión o el commit.

## Reglas

### El entorno

| `VERCEL` | `VERCEL_ENV` | Entorno |
|---|---|---|
| presente | `production` | Producción |
| presente | `preview` | DEV |
| presente | `development` (`vercel dev`) | LOCAL |
| presente | vacío u otro valor | **El build falla:** "No se conoce el entorno de Vercel: revisar Automatically expose System Environment Variables" |
| vacío o ausente | cualquiera | LOCAL |

- Se calcula **una sola vez, en `next.config.ts`**, y queda escrito en el código compilado. No hay variables nuevas para
  cargar en Vercel ni en `.env.local`.

### Qué cambia en cada entorno

| | Producción | DEV | LOCAL |
|---|---|---|---|
| Nombre instalado (`name` y `short_name`) | El Changuito | DEV Changuito | LOCAL Changuito |
| Título de la pestaña | El Changuito | DEV · El Changuito | LOCAL · El Changuito |
| Título de Privacidad | Privacidad — El Changuito | DEV · Privacidad — El Changuito | LOCAL · Privacidad — El Changuito |
| Íconos (SVG y PNG) | Los de hoy; PNG nuevo | Invertidos con cinta DEV | Invertidos con cinta LOCAL |
| Etiqueta en el header | — | DEV | LOCAL |

- El manifest **conserva su dirección** (`/manifest.json`), y en producción **su contenido es idéntico al de hoy**: las
  apps ya instaladas no cambian.
- `theme_color`, `background_color`, `start_url`, `display` y descripción son iguales en los tres.

### Los íconos

- **DEV y LOCAL:** changuito berenjena (`#5b2a86`) sobre fondo amarillo (`#ffd23f`), más arriba que en el de producción,
  y abajo una cinta berenjena de lado a lado con el texto en amarillo.
- El texto de los SVG va **dibujado como trazos**, no como `<text>`: la pantalla de inicio no tiene la tipografía.
- **Maskable:** el changuito y el texto de la cinta entran en el círculo central del 80 %; la cinta va más arriba que en
  el ícono común para que el recorte redondo no la tape.
- **PNG del iPhone:** 180 × 180, cuadrado, opaco y sin esquinas redondeadas (las redondea el sistema), generado en el
  build. En producción es el mismo changuito amarillo sobre berenjena.
- El favicon sigue siendo el SVG del entorno.

### La etiqueta del header

- Al lado del nombre, **dentro del link a `/`** y antes del botón de WhatsApp: texto "DEV" o "LOCAL" en `gray-900` sobre
  `accent-400`, en negrita de 11 px, con esquinas redondeadas.
- **Siempre visible**, también con carrito y menos de 430 px, cuando el nombre pasa a `sr-only`. Nunca se achica: si falta
  lugar, se trunca el nombre.
- Para lectores de pantalla dice "versión DEV" (o "versión LOCAL"); el nombre accesible del link empieza con "El
  Changuito".
- En producción no se dibuja nada: el header queda igual.

## Modelo de datos

No hay datos nuevos ni persistencia.

```typescript
// src/lib/app-env.ts (puro, sin React; lo importa next.config.ts)
export type AppEnv = 'production' | 'preview' | 'local';

/** Entorno según las variables de Vercel; lanza un error si está en Vercel y no se conoce */
export function resolveAppEnv(env: { VERCEL?: string; VERCEL_ENV?: string }): AppEnv;

/** 'DEV', 'LOCAL' o null en producción */
export function envLabel(env: AppEnv): 'DEV' | 'LOCAL' | null;

/** 'El Changuito' / 'DEV Changuito' / 'LOCAL Changuito' */
export function installName(env: AppEnv): string;

/** 'El Changuito' → 'DEV · El Changuito'; igual en producción */
export function pageTitle(title: string, env: AppEnv): string;

export function buildManifest(env: AppEnv): MetadataRoute.Manifest;

/** Entorno de este build, escrito por next.config.ts (env: { APP_ENV }) */
export const APP_ENV: AppEnv;
```

Archivos: `public/icon-dev.svg`, `public/icon-dev-maskable.svg`, `public/icon-local.svg` y
`public/icon-local-maskable.svg`. `public/manifest.json` se borra: lo reemplaza `src/app/manifest.json/route.ts`.

## UI/UX

```
Íconos                          Header (375 px), DEV
Producción     DEV              │ [🛒] El Changuito ‹DEV› [WA]      (A) │
┌──────────┐   ┌──────────┐
│ berenjena│   │ amarillo │     Con carrito, menos de 430 px
│    🛒    │   │    🛒    │     │ [🛒] ‹DEV› [WA]     (A)  $12.345,67 │
│ amarillo │   │ berenjena│
│          │   │▓▓ DEV ▓▓▓│     Producción: sin cambios
└──────────┘   └──────────┘
```

- Área de toque del link a `/`: 44 px, como hoy. Sin scroll horizontal a 320 y 375 px.
- El amarillo pasa a usarse también en la etiqueta y los íconos de DEV y LOCAL: sigue siendo de marca, no de estado.
- Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Entorno y manifest (TDD):** `src/lib/app-env.ts` y `app-env.test.ts`: la tabla de entornos, el error, nombres,
   títulos y que el manifest de producción sea **idéntico** al `public/manifest.json` actual (copiado en el test).
   `next.config.ts` calcula el entorno y lo escribe con `env`.
   **Verificar:** `VERCEL=1 npm run build` (sin `VERCEL_ENV`) falla con el mensaje; sin `VERCEL` compila.
2. **Íconos:** los cuatro SVG de `public/` y `src/app/apple-icon.tsx` con `ImageResponse` (leer antes la guía
   `app-icons.md` de `node_modules/next/dist/docs/`), estático, con Rubik SemiBold de `src/assets/` para la cinta.
   **Verificar:** los SVG a 48 y 192 px, la máscara redonda, y el PNG de los tres entornos.
3. **Manifest y metadata:** `src/app/manifest.json/route.ts` (estático), borrar `public/manifest.json`, y en
   `src/app/layout.tsx` el título con `default` y `template`, y el favicon del entorno.
   **Verificar:** con `VERCEL=1 VERCEL_ENV=production npm run build`, `/manifest.json` responde lo mismo que hoy; con
   `preview` y sin `VERCEL`, nombre, títulos e íconos de cada entorno.
4. **Etiqueta:** `src/components/EnvBadge.tsx` (Server Component) dentro del link del header.
   **Verificar:** 320, 375, 429, 430 y 1280 px, con y sin carrito, en DEV, LOCAL y producción.
5. **Docs:** `CLAUDE.md` (Estructura, Layout y PWA, uso del amarillo, Build y Despliegue, Estado Actual) y
   `docs/pruebas-pendientes.md` con las pruebas en los celulares.

**A revisar a mano (sin test automático):** después de publicar en `dev`, desinstalar e instalar de nuevo la versión de
dev en Android y en iPhone. **Antes de desinstalar**, si esa app no tiene cuenta, sus datos se pueden perder (en el
iPhone se borran siempre). Producción no hace falta reinstalarla, salvo para ver el ícono nuevo en el iPhone.

## Criterios de aceptación

- [ ] En la preview de `dev`, `/manifest.json` tiene `name` y `short_name` "DEV Changuito" y los íconos de DEV.
- [ ] En producción, `/manifest.json` tiene el mismo contenido que antes de esta spec.
- [ ] Con `npm run dev` y `npm start`, el nombre es "LOCAL Changuito" y la etiqueta, LOCAL.
- [ ] La pestaña dice "DEV · El Changuito" en la preview y "El Changuito" en producción; en Privacidad, "DEV · Privacidad
      — El Changuito" y "Privacidad — El Changuito".
- [ ] El favicon de la preview es el invertido con la cinta DEV; el de producción, el de hoy.
- [ ] La etiqueta se ve en todas las páginas de la preview, también con carrito y a 320 px, y no está en producción.
- [ ] El link del logo se anuncia como "El Changuito, versión DEV" en la preview y "El Changuito" en producción, y lleva
      a `/`.
- [ ] El HTML de los tres entornos tiene `apple-touch-icon`, un PNG de 180 × 180 sin transparencia.
- [ ] Recortados en círculo, los maskable de DEV y LOCAL muestran enteros el changuito y el texto.
- [ ] `VERCEL=1 npm run build` sin `VERCEL_ENV` falla con el mensaje; `npm run build` sin `VERCEL` compila.
- [ ] El link de WhatsApp (specs 30 y 31) sigue siendo el de producción en los tres entornos.
- [ ] En Android y en iPhone, con las dos apps instaladas, se distinguen por el nombre y el ícono.
- [ ] 320 y 375 px sin scroll horizontal; `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.

## Decisiones

- **PNG para el iPhone en los tres entornos** (elegido por el usuario): el iPhone no usa los SVG como ícono de inicio.
  Descartado: solo en dev, o seguir solo con SVG.
- **Colores invertidos y cinta** (elegido por el usuario): se distingue de lejos y dice cuál es. Descartado: sin texto, o
  el mismo ícono con cinta.
- **Etiqueta en el header** (elegido por el usuario): no ocupa alto. Descartado: cambiar la barra de estado, una franja
  arriba, o nada.
- **DEV en las previews y LOCAL en la computadora** (elegido por el usuario). Descartado: DEV en todo, o solo previews.
- **"DEV Changuito" y no "Changuito DEV"** (elegido por el usuario): el celular corta el nombre a unos 12 caracteres y lo
  que distingue va adelante.
- **Prefijo en el título de la pestaña** (elegido por el usuario).
- **El build falla si no se conoce el entorno** (elegido por el usuario): es mejor que publicar con la marca equivocada.
  Descartado: verse como producción.
- **Entorno escrito al compilar en `next.config.ts`:** un solo lugar, y el error sale en el build. Descartado: leer
  `VERCEL_ENV` en cada componente o comparar el dominio en el navegador.
- **`/manifest.json` conserva su dirección con un route handler:** `app/manifest.ts` la cambiaría a
  `/manifest.webmanifest`, y Android puede tomarla como otra app al actualizar las instaladas.
- **SVG estáticos y no generados:** son cuatro archivos chicos, y los de DEV y LOCAL quedan publicados también en
  producción, sin uso.
- **Sin `appleWebApp` en la metadata:** agrega etiquetas que cambian cómo se abre la app en el iPhone; el nombre sale del
  manifest o del título, y los dos distinguen.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Vercel no informa ni `VERCEL` ni `VERCEL_ENV` y producción sale como LOCAL | Revisar la preview de `dev` antes de mergear a `main`, y producción apenas se publica; opción *Automatically expose System Environment Variables* encendida |
| Android tarda en actualizar el nombre y el ícono de la app de dev ya instalada | Reinstalarla |
| El iPhone toma el nombre del título de la pestaña | "DEV · El Changuito" también distingue |
| Desinstalar la de dev borra sus datos | Aviso en las pruebas: son datos de prueba |
| A 430 px, con carrito y etiqueta, el nombre se trunca | Se acepta: la etiqueta y el total nunca se achican |

## Qué **no** entra en esta spec

- Color de la barra de estado o del header.
- Distinguir la preview de cada PR.
- Open Graph por entorno, splash del iPhone y número de versión.
- Separar las bases de datos.

Cada una, si llega, va en su propia spec.
