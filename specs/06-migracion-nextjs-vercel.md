# SPEC 06 — Migración a Next.js y publicación continua en Vercel

> **Estado:** Implementado
> **Depende de:** —
> **Fecha:** 2026-10-28
> **Objetivo:** Reescribir la app de Angular 19 a Next.js (App Router) con paridad funcional, conservar los datos de `localStorage` y publicar automáticamente en Vercel: `main` → producción, `dev` y PRs → preview.

## Por qué existe esta spec

- Cada cambio tenía que publicarse a mano (build y subir `dist/`). Se busca que un push publique solo.
- Las próximas features (lista compartida, promociones) necesitan base de datos. Se elige **Supabase**
  (Postgres + Auth + Realtime + RLS) en lugar del backend .NET 8 previsto para la Fase 2.
- Next.js deja disponible código de servidor (route handlers, server actions) para cuando haga falta guardar
  secretos o mandar Web Push, y comparte React con la futura app en React Native (Fase 3).

## Alcance

**Incluye:**

- Next.js 16 (App Router, Turbopack, `cacheComponents` + `partialPrefetching`), React 19, TypeScript strict.
- Tailwind v4 con la misma paleta `primary` y las mismas clases de componente.
- Estado en **Zustand** (`src/lib/store.ts`) en lugar de `DataService` + BehaviorSubjects.
- Mismas claves `preciolocal_*` y mismo formato JSON: los datos guardados por la versión Angular se leen sin
  migración.
- Todas las páginas con el mismo comportamiento: Buscar, Cargar, Detalle, Carrito, Historial, Calculadora.
- SPEC 02 resuelta en la reescritura del historial (botones hermanos expandir / Repetir).
- Tests con Vitest para la lógica pura y lint con ESLint (`eslint-config-next`).
- CI en GitHub Actions y despliegue en Vercel.

**Fuera de alcance:**

- Integrar Supabase (queda el store como punto de enchufe).
- Service worker / modo offline.
- Reemplazar `alert()` / `confirm()`.

## Decisiones

| Tema | Decisión |
|---|---|
| Persistencia | Suscripción al store que guarda cada colección en su clave cuando cambia. No se usa el middleware `persist` de Zustand porque guarda otro formato (`{ state, version }`) |
| Hidratación | `StoreHydrator` lee `localStorage` en un `useEffect` y recién entonces muestra la página. Hasta hidratar no se guarda nada, así los datos de ejemplo nunca pisan datos reales |
| Prerender | Las páginas solo se renderizan en el cliente. Los datos de ejemplo con fechas son funciones (`defaultPrices()`) porque `Date.now()` durante el prerender rompe el build con Cache Components |
| Validación de navegación instantánea | `experimental.instantInsights.validationLevel: 'manual-warning'`: sin HTML de servidor no hay nada que validar |
| Rutas dinámicas | `/product/[id]` envuelve el detalle en `<Suspense>` (exigido por `useParams` con Cache Components); la nav del layout también |
| Rutas desconocidas | `not-found.tsx` redirige a `/` con `router.replace` |
| Formato | `src/lib/format.ts` con `Intl` es-AR (`1.234,56`). **Cambio visible:** Angular formateaba en en-US (`1,234.56`) porque no había locale registrado |
| Mutaciones | Las acciones del store copian los ítems en lugar de mutarlos (se corrige la deuda técnica) |
| IDs | `newId()` / `uniqueId()` en `src/lib/ids.ts`, misma convención `Date.now()` |
| Inputs numéricos del carrito | `NumberInput` conserva el texto mientras se edita (permite borrar y reescribir la cantidad) |
| Estado al navegar | Con Cache Components, Next oculta las páginas con `<Activity>` en lugar de desmontarlas: el estado local (pestaña de Cargar, paso de pago) se conserva al volver |
| Node | 24 (`engines` en `package.json`, CI y Vercel) |

## Despliegue

- **CI** (`.github/workflows/ci.yml`): `npm ci → lint → test → build` en cada push a `main`/`dev` y en cada PR.
- **Vercel** (configuración única en vercel.com):
  1. *Add New → Project* → importar `cgermanmr/SmartList` (framework Next.js autodetectado, sin variables).
  2. *Settings → Environments → Production* → branch `main`.
  3. Cada push a `dev` o a un PR genera una URL de preview; cada merge a `main` actualiza producción.
- Opcional: en GitHub, *branch protection* de `main` exigiendo el check `CI / build`.
- Supabase, cuando llegue: integración *Supabase* del Marketplace de Vercel, que carga
  `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Production y Preview.

## Criterios de aceptación

- [x] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.
- [x] Con los datos guardados por la versión Angular en `localhost:4200`, la app nueva muestra productos,
      precios, carrito y compras sin perder nada.
- [x] Buscar: filtro, último precio y variación, +/− y quitar desde la tarjeta.
- [x] Cargar: validaciones, alta de precio y de producto, mensaje que se oculta a los 3 s.
- [x] Detalle: stats, gráfico con más de 3 precios, edición inline (Enter guarda), deep link con recarga.
- [x] Carrito: badges vs última compra, edición de cantidad y precio, comercio único, checkout en 2 pasos que
      guarda la compra, registra los precios y vacía el carrito.
- [x] Historial: expandir con `aria-expanded`, sin botones anidados, Repetir con carrito vacío navega a
      `/cart`, con carrito lleno abre el modal y combina.
- [x] Calculadora: promos, ganador, cambio de magnitud, persistencia.
- [x] `/ruta-inexistente` → `/`.
- [x] Sin scroll horizontal en 375 px.
- [ ] Preview de `dev` y producción de `main` publicados en Vercel (requiere conectar el repo).
