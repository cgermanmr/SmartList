# SPEC 16 — Mapa del comercio y cómo llegar

> **Estado:** Borrador
> **Depende de:** [SPEC 15](15-precios-y-comercios-cercanos.md)
> **Fecha:** 2026-11-15
> **Objetivo:** Abrir un mapa con la ubicación propia, la del comercio y la ruta marcada para llegar, desde la lista de comercios cercanos y desde el carrito.

## Por qué existe esta spec

La spec 15 dice a qué distancia está cada comercio; falta ver **dónde queda** y **cómo ir**. Con el carrito por
comercio (spec 14), además, hace falta ver el recorrido para pasar por todos.

## Alcance

**Incluye:**

- Componente `BranchMap` (modal): mapa con el marcador del usuario, el del comercio y la ruta entre los dos.
- Botón "Mapa" en cada fila de comercio (Buscar, detalle) y en el encabezado de cada comercio del carrito.
- Ruta a pie o en auto dibujada sobre el mapa, con distancia y tiempo estimado.
- Botón "Abrir en Google Maps" para la navegación paso a paso.
- En el carrito: "Ver recorrido" con todos los comercios del carrito que tienen coordenadas.

**Fuera de alcance:**

- Navegación paso a paso dentro de la app.
- Mapa con todos los comercios cercanos a la vez, o con precios sobre el mapa.
- Ordenar el recorrido por el camino más corto.
- Mapas sin conexión. Transporte público.

## Componentes y funciones

```typescript
// src/components/BranchMap.tsx
interface BranchMapProps {
  open: boolean;
  origin: LatLng | null;                 // ubicación del usuario (spec 15); null → solo los comercios
  stops: { name: string; address?: string; lat: number; lng: number }[];   // 1 en Buscar; varios en el carrito
  onClose: () => void;
}

// src/lib/route.ts
export type TravelMode = 'foot' | 'car';
export interface Route {
  line: [number, number][];              // [lat, lng] para dibujar
  distanceKm: number;
  minutes: number;
}
/** Ruta por calles entre los puntos, en orden. null si el servicio falla o tarda más de 8 s */
export function getRoute(points: LatLng[], mode: TravelMode): Promise<Route | null>;
/** Link a Google Maps con destino y paradas intermedias, sin el origen; pura, con tests */
export function googleMapsUrl(stops: LatLng[], mode: TravelMode): string;
/** "25 min", "1 h 10 min"; pura, con tests */
export function formatDuration(minutes: number): string;
```

## Reglas

- **Mapa:** [Leaflet](https://leafletjs.com) con las teselas de OpenStreetMap. Leaflet usa `window`: se carga con
  `import()` dentro de un efecto, solo al abrir el modal por primera vez (no entra en el bundle inicial ni se
  ejecuta en el prerender). Atribución "© OpenStreetMap" siempre visible.
- **Marcadores:** el usuario con un punto azul ("Vos"); cada comercio con un marcador del color de marca
  (`primary-700`) y su nombre. Los íconos son SVG propios en línea (los PNG por defecto de Leaflet no resuelven con
  el empaquetador).
- **Encuadre:** el mapa se ajusta para mostrar todos los puntos con margen. Sin ubicación, se centra en el
  comercio con zoom 16.
- **Ruta:** servicio OSRM público de OpenStreetMap Alemania (`routing.openstreetmap.de`, perfiles `routed-foot` y
  `routed-car`, sin clave). Probado el 15/11/2026: responde con distancia y duración para dos puntos de Buenos
  Aires.
  - Se pide **al abrir el mapa**, a pie por defecto; un selector cambia a auto.
  - Con respuesta: línea continua sobre las calles y la leyenda "1,7 km · 23 min a pie".
  - Sin respuesta (error o más de 8 s): línea recta punteada entre los puntos y "350 m en línea recta"; sin
    mensaje de error.
  - Sin ubicación del usuario y con un solo comercio no hay ruta: solo el marcador y el botón de Google Maps.
- **Privacidad:** para dibujar la ruta, las coordenadas de origen y destino se mandan a ese servicio. Es el único
  momento en que la ubicación sale del dispositivo, y solo cuando el usuario abre el mapa. La primera vez, debajo
  del mapa: "Para marcar la ruta, tu ubicación se envía a OpenStreetMap."
- **Abrir en Google Maps:** `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=walking|driving`
  (con `&waypoints=` para las paradas intermedias). **Sin `origin`**: Google usa la posición del dispositivo y la
  app no la pone en la URL. Se abre en una pestaña nueva (`rel="noopener noreferrer"`); en el celular, el sistema
  ofrece la app de mapas.
- **Recorrido del carrito:** paradas en el orden de los grupos del carrito; solo los comercios con coordenadas
  (los del SEPA). Si alguno no tiene, se aclara "N comercios sin ubicación no aparecen en el mapa". Hasta 9
  paradas (el tope de Google Maps).
- **Modal:** `<dialog>` nativo con `showModal()`, a pantalla completa en el celular; cierra con Escape y con "✕"
  (`aria-label="Cerrar mapa"`) y devuelve el foco. Al cerrar o al ocultarse la página (`<Activity>`), el mapa se
  destruye (`map.remove()`) en la limpieza del efecto.
- Sin conexión: el modal muestra nombre, dirección y el botón de Google Maps, sin mapa.
- Distancias con `formatDistance` (spec 15).

## UI/UX

- Encabezado del modal: nombre del comercio (o "Recorrido: N comercios") y dirección.
- Mapa ocupando el alto disponible (mínimo 320 px). Los controles de zoom de Leaflet, abajo a la derecha.
- Debajo: leyenda de la ruta, selector **A pie / En auto** (dos botones con `aria-pressed`) y el botón principal
  **"Abrir en Google Maps"**.
- En el recorrido, lista numerada de las paradas debajo del mapa; los marcadores llevan el mismo número.
- Botón "Mapa" en las filas de comercio: ícono + texto en escritorio, solo ícono en 375 px
  (`aria-label="Ver <comercio> en el mapa"`).
- Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Lógica pura + tests** (`src/lib/route.ts`): `googleMapsUrl` (un destino, con paradas, sin origen),
   `formatDuration`, y el pasaje de la respuesta de OSRM a `Route`.
2. **Dependencia.** `npm i leaflet` y `npm i -D @types/leaflet`. Verificar: `npm run build` sin errores de
   prerender y el bundle inicial de `/` no crece (Leaflet queda en un chunk aparte).
3. **`BranchMap`** con un comercio: mapa, marcadores, encuadre, limpieza. Verificar en `localhost`.
4. **Ruta:** `getRoute`, selector de modo, respaldo en línea recta. Verificar: cortando la red al servicio, se ve
   la línea punteada.
5. **Integración** en Buscar, detalle y carrito (un comercio y recorrido).
6. **Prueba en celular** con la URL de preview: el botón de Google Maps abre la app con la ruta.
7. **Documentación.** `CLAUDE.md` (componente, `lib/route.ts`, servicios externos, Funcionalidades).

## Criterios de aceptación

- [ ] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.
- [ ] Desde una fila de comercio, "Mapa" abre el modal con mi ubicación, el comercio y la ruta por las calles, con distancia y tiempo.
- [ ] Cambiar entre "A pie" y "En auto" actualiza la ruta y el tiempo.
- [ ] Si el servicio de rutas no responde, se ve la línea recta punteada y la distancia en línea recta, sin error.
- [ ] "Abrir en Google Maps" abre la ruta hacia el comercio; la URL no contiene mi latitud ni mi longitud.
- [ ] Sin ubicación activada, el mapa muestra el comercio centrado y el botón de Google Maps.
- [ ] En el carrito con 3 comercios del SEPA, "Ver recorrido" muestra los 3 marcadores numerados y la ruta que los une en orden.
- [ ] Un comercio cargado a mano (sin coordenadas) no tiene botón "Mapa" y se informa en el recorrido.
- [ ] Leaflet no se descarga hasta abrir un mapa (pestaña Network).
- [ ] Cerrar con Escape devuelve el foco al botón "Mapa"; abrir y cerrar 5 veces no deja mapas duplicados ni errores en consola.
- [ ] La atribución de OpenStreetMap está visible.
- [ ] En 375 px el modal ocupa la pantalla y no hay scroll horizontal.

## Decisiones

- **Sí:** Leaflet + OpenStreetMap. Sin clave ni costo, liviano (~40 KB comprimido) y alcanza para marcadores y una línea. Google Maps embebido necesita clave y facturación.
- **Sí:** ruta dibujada en la app con OSRM público y respaldo en línea recta. Muestra el camino sin salir de la app; si el servicio falla, el mapa sigue sirviendo.
- **Sí:** la navegación paso a paso se delega a Google Maps. Hacerla bien (voz, recálculo, tránsito) no es el objetivo de la app.
- **Sí:** el link de Google Maps sin origen. Más simple y la ubicación no viaja en una URL.
- **No:** `next/dynamic` con `ssr: false` para todo el modal. El `import()` dentro del efecto es suficiente y mantiene el `<dialog>` en el árbol para la accesibilidad.
- **No:** ordenar las paradas por el camino óptimo. Con 2 a 4 comercios el orden lo decide quien compra.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El servicio público de rutas no tiene garantía de disponibilidad ni admite uso intensivo | Una consulta por apertura de mapa, con tiempo límite y respaldo en línea recta; si hiciera falta, se cambia por openrouteservice (clave gratuita) detrás de `getRoute` |
| Política de uso de las teselas de OpenStreetMap (sin uso masivo) | El mapa se abre a pedido; si el uso crece, cambiar a un proveedor con plan gratuito sin tocar el componente |
| Coordenadas del SEPA mal cargadas | El modal muestra la dirección en texto; Google Maps recibe las mismas coordenadas |
| Leaflet y Cache Components (`<Activity>`) | El mapa se crea y se destruye en un efecto; criterio de aceptación de abrir y cerrar 5 veces |
| CSS de Leaflet pisa estilos | Se importa solo dentro del componente del mapa |

## Lo que **no** incluye esta spec

- Navegación paso a paso en la app.
- Todos los comercios cercanos en un mismo mapa.
- Recorrido óptimo.
- Mapas sin conexión y transporte público.
