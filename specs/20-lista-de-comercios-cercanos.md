# SPEC 20 — Lista de comercios cercanos

> **Estado:** Implementado
> **Depende de:** [SPEC 15](15-precios-y-comercios-cercanos.md), [SPEC 16](16-mapa-y-como-llegar.md)
> **Fecha:** 2026-11-17
> **Objetivo:** Ver cuáles son los comercios cercanos que cuenta la barra de ubicación, del más cercano al más lejano, y abrir el mapa con la ruta a cualquiera de ellos.

## Por qué existe esta spec

Con la ubicación activa, la barra de ubicación dice "12 comercios cerca", pero no hay forma de ver **cuáles** son.
Los comercios aparecen solo dentro de la lista de un producto (con su precio). Quien quiere saber qué súper tiene a
la vuelta, o cómo llegar al más cercano, no tiene dónde mirarlo.

## Alcance

**Incluye:**

- En `LocationBar`, el texto "N comercios cerca" (y "Los 40 comercios más cercanos") pasa a ser un botón con
  aspecto de link.
- Modal nuevo `NearbyBranchesDialog` con la lista de las sucursales del radio, de la más cercana a la más lejana:
  nombre (`<cadena> — <sucursal>`), dirección y distancia.
- Tocar un comercio abre el mapa (`BranchMap`, spec 16) de ese comercio, con la ruta si la ubicación es de GPS.
- Vale en todos los lugares donde está la barra: Buscar y la tarjeta Comercios cercanos del detalle.

**Fuera de alcance:**

- Precios en la lista (los precios dependen de un producto; ya están en `NearbyStores`).
- Un mapa con todos los comercios a la vez.
- Filtrar por cadena u ordenar de otra forma.

## Reglas

- La lista es exactamente `useNearBranches().branches`: hasta 40 (`MAX_NEAR_BRANCHES`) dentro del radio, ya
  ordenadas por distancia; solo sucursales con coordenadas. No hay consultas nuevas: las sucursales ya están
  bajadas para contar las cercanas.
- La distancia se muestra con `formatDistance`; con una localidad elegida a mano lleva "aprox." (`approx`), como en
  `NearbyStores`.
- El nombre y la dirección salen de `storeRefFromBranch` y la parada del mapa de `mapStops([store])`, igual que el
  botón "Mapa" de `NearbyStores`.
- El mapa se abre **encima** de la lista (los dos son `<dialog>` modales). Al cerrarlo, la lista sigue abierta y
  el foco vuelve a la fila tocada.
- La lista sale del mismo hook que el contador: si cambian el radio o la ubicación, cambia con ellos.
- Al ocultarse la página con `<Activity>`, la lista se cierra (como `CartStoreDialog` y `BranchMap`).

## UI/UX

```
┌ Comercios cercanos ──────────── ✕ ┐
│ 12 comercios a menos de 3 km      │
│ ───────────────────────────────── │
│ Coto — Caballito          350 m › │
│ Av. Rivadavia 5000                │
│ ───────────────────────────────── │
│ Día — Primera Junta       600 m › │
│ Av. Rivadavia 5400                │
│ …                                 │
└───────────────────────────────────┘
```

- Pantalla completa en el celular y tarjeta centrada desde `sm`, como `BranchMap`; la lista hace scroll y el
  encabezado queda fijo.
- Título "Comercios cercanos"; debajo, "N comercios a menos de R km" (con localidad: "cerca de <localidad>").
- Cada fila es un botón `.list-row` de al menos 44 px: nombre en negrita (`break-words`), dirección en
  `text-gray-500`, distancia a la derecha con cifras tabulares, chevron. `aria-label="Ver <comercio> en el mapa"`.
- Botón cerrar de solo ícono (`X` de lucide, `aria-label="Cerrar lista"`); cierra también con Escape y con un toque
  en el fondo. Al cerrar, el foco vuelve al link "N comercios cerca".
- El link de la barra conserva el `role="status"` de la región, para que se siga anunciando el cambio de cantidad.

## Plan de implementación

1. **Texto del resumen (TDD)** — `nearbyListSummary({ count, radiusKm, place?, limited? }): string` en
   `src/lib/location.ts`, con tests en `location.test.ts`:
   - `{ count: 12, radiusKm: 3 }` → `'12 comercios a menos de 3 km'`
   - `{ count: 1, radiusKm: 1 }` → `'1 comercio a menos de 1 km'`
   - `{ count: 12, radiusKm: 3, place: 'Caballito, CABA' }` → `'12 comercios a menos de 3 km de Caballito, CABA'`
   - `{ count: 40, radiusKm: 10, limited: true }` → `'Los 40 más cercanos, a menos de 10 km'`
2. **Modal** — `src/components/NearbyBranchesDialog.tsx`, `export default function NearbyBranchesDialog({ open,
   onClose }: { open: boolean; onClose: () => void })`: `<dialog>` con `showModal()` en un efecto y `close()` en
   su limpieza (como `BranchMap`); contenido montado solo con `open`; usa `useNearBranches()`; cada fila arma el
   `StoreRef` con `storeRefFromBranch` y abre su propio `BranchMap` con `mapStops([store])`. `place` del resumen =
   `location.label` solo si `source === 'localidad'`; `limited` = `count >= MAX_NEAR_BRANCHES`.
3. **Barra** — en `LocationBar.tsx`, estado `listOpen`; el texto de `storeCount` pasa a ser un `<button>` con
   `LINK_CLASS` (dentro del `role="status"`) que abre `NearbyBranchesDialog`.
4. **Docs** — `CLAUDE.md`: Estructura (componente nuevo), Funcionalidades → Búsqueda (barra de ubicación) y
   Estado Actual.

**A revisar (sin test automático):** el foco vuelve a la fila al cerrar el mapa y al link al cerrar la lista; la
lista se cierra al navegar con la lista abierta (`<Activity>`); dos `<dialog>` modales apilados (Escape cierra solo
el de arriba); 40 filas con nombres largos a 375 px; la lista abierta cuando el radio deja 0 comercios (muestra
"No hay comercios…" en lugar de una lista vacía).

## Criterios de aceptación

- [x] Con ubicación y comercios en el radio, "N comercios cerca" es un botón que abre la lista.
- [x] La lista tiene N filas, de la más cercana a la más lejana, con nombre, dirección y distancia.
- [x] Con localidad elegida a mano, las distancias dicen "aprox.".
- [x] Tocar una fila abre el mapa de ese comercio; con GPS se ve la ruta (spec 16).
- [x] Al cerrar el mapa se vuelve a la lista; al cerrar la lista, el foco vuelve al link.
- [x] Después de cambiar el radio, la lista muestra la cantidad y los comercios nuevos.
- [x] Sin comercios en el radio no hay link (queda el aviso ámbar de la spec 15).
- [x] Navegar a otra pestaña con la lista abierta no deja la página inerte.
- [x] 375 px sin scroll horizontal; `npm run lint`, `npm test` y `npm run build` sin errores.

## Decisiones

- **Sin precios en la lista:** la barra no depende de un producto; mezclar precios obligaría a elegir uno.
- **Mapa encima de la lista** en lugar de reemplazarla: así se pueden mirar varios comercios seguidos sin volver
  a abrir la lista.
- **Sin consultas nuevas:** todo sale de las sucursales que ya bajó `getSepaBranches`.
- **"aprox." chico arriba de la distancia** (agregado al probar a 375 px): en la misma línea le quitaba ancho al
  nombre del comercio; arriba deja la cifra alineada y el nombre en una línea más.
