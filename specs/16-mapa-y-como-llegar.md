# SPEC 16 — Mapa del comercio y cómo llegar

> **Estado:** Aprobado
> **Depende de:** [SPEC 14](14-carrito-por-comercio.md), [SPEC 15](15-precios-y-comercios-cercanos.md), [SPEC 19](19-restyling-base-y-navegacion.md)
> **Fecha:** 2026-11-17
> **Objetivo:** Abrir un mapa con la ubicación propia, la del comercio y la ruta marcada para llegar, desde la lista de comercios cercanos y desde el carrito.

## Por qué existe esta spec

La spec 15 dice a qué distancia está cada comercio; falta ver **dónde queda** y **cómo ir**. Con el carrito por
comercio (spec 14), además, hace falta ver el recorrido para pasar por todos.

Esta versión reemplaza el borrador del 15/11/2026, escrito antes de implementar las specs 15 y 19: ahora contempla
la ubicación elegida por localidad, los íconos de `lucide-react` y los componentes que ya existen (`NearbyStores`,
`StoreRef` con coordenadas, `requestPosition`).

## Alcance

**Incluye:**

- Componente `BranchMap` (modal): mapa con el marcador del usuario, el del comercio y la ruta entre los dos.
- Botón "Mapa" en cada fila de comercio con coordenadas de **Buscar** y del **detalle** (`NearbyStores`), y en el
  encabezado de cada comercio del **carrito**.
- Ruta a pie o en auto dibujada sobre el mapa, con distancia y tiempo estimado, pedida a un servicio OSRM público.
- Botón "Usar mi ubicación" dentro del mapa cuando no hay una ubicación de GPS guardada.
- Botón "Abrir en Google Maps" para la navegación paso a paso.
- En el carrito: "Ver recorrido" con todos los comercios del carrito que tienen coordenadas.

**Fuera de alcance:**

- Botón "Mapa" dentro del diálogo "Cambiar comercio" del carrito (sería un modal encima de otro) y en el historial
  de compras.
- Navegación paso a paso dentro de la app.
- Mapa con todos los comercios cercanos a la vez, o con precios sobre el mapa.
- Ordenar el recorrido por el camino más corto.
- Mapas sin conexión. Transporte público.

## Modelo de datos

No hay datos nuevos que se guarden: ni claves de localStorage ni cambios en la base. Las coordenadas del comercio
salen de `StoreRef.lat` / `StoreRef.lng` (spec 15) y la ubicación del usuario, de `location` del store.

```typescript
// src/components/BranchMap.tsx
interface MapStop {
  name: string;
  address?: string;
  lat: number;
  lng: number;
}

interface BranchMapProps {
  /** null → cerrado. 1 parada en Buscar, el detalle y el encabezado de un comercio; varias en el recorrido */
  stops: MapStop[] | null;
  onClose: () => void;
}
// El origen no es una prop: BranchMap lee `location` del store y solo la usa si `source === 'gps'`.

// src/lib/route.ts
export type TravelMode = 'foot' | 'car';

export interface Route {
  line: [number, number][];              // [lat, lng] para dibujar
  distanceKm: number;
  minutes: number;
}

/** Pasa la respuesta de OSRM a Route; null si no trae una ruta válida. Pura, con tests */
export function parseOsrmRoute(raw: unknown): Route | null;
/** Ruta por calles entre los puntos, en orden. null si el servicio falla o tarda más de 8 s */
export function getRoute(points: LatLng[], mode: TravelMode): Promise<Route | null>;
/** Link a Google Maps con destino y paradas intermedias, sin el origen; pura, con tests */
export function googleMapsUrl(stops: LatLng[], mode: TravelMode): string;
/** "25 min", "1 h 10 min"; pura, con tests */
export function formatDuration(minutes: number): string;
/** Paradas del mapa a partir de comercios: solo los que tienen lat y lng, hasta `max`. Pura, con tests */
export function mapStops(stores: StoreRef[], max?: number): MapStop[];
```

`NearbyStores` suma una prop opcional `onMap?: (store: StoreRef) => void`: sin ella (como en `CartStoreDialog`)
las filas no llevan el botón.

## Reglas

- **Mapa:** [Leaflet](https://leafletjs.com) con las teselas de OpenStreetMap. Leaflet usa `window`: se carga con
  `import()` dentro de un efecto, solo al abrir el modal por primera vez (no entra en el bundle inicial ni se
  ejecuta en el prerender). Atribución "© OpenStreetMap" siempre visible.
- **Marcadores:** el usuario con un punto azul ("Vos"); cada comercio con un marcador del color de marca
  (`var(--color-primary-700)`) y su nombre. Los íconos son SVG propios en línea (`L.divIcon`; los PNG por defecto
  de Leaflet no resuelven con el empaquetador).
- **Origen:** la ubicación guardada (la misma que usa la spec 15 para las distancias), **solo si es de GPS**
  (`location.source === 'gps'`). No se vuelve a pedir la posición al abrir el mapa.
- **Sin ubicación de GPS** (ubicación por localidad, o sin ubicación): no hay marcador "Vos" ni ruta desde el
  usuario. El mapa muestra el comercio centrado con zoom 16 y, debajo, el botón **"Usar mi ubicación"** (solo si
  `geolocationAvailable()`):
  - Llama a `requestPosition()`; si se acepta, guarda `setLocation(gpsLocation(posición))` y el mapa suma el
    marcador y la ruta. La ubicación guardada **pasa a ser la de GPS en toda la app** (las distancias de Buscar y
    del detalle dejan de decir "aprox.").
  - Permiso denegado → "Sin permiso para usar tu ubicación."; sin señal → "No se pudo obtener tu ubicación.". El
    mapa sigue con el comercio y el botón de Google Maps.
- **Encuadre:** el mapa se ajusta para mostrar todos los puntos con margen (`fitBounds`). Con un solo punto, zoom 16.
- **Ruta:** servicio OSRM público de OpenStreetMap Alemania, sin clave:
  - A pie: `https://routing.openstreetmap.de/routed-foot/route/v1/foot/<lng>,<lat>;<lng>,<lat>?overview=full&geometries=geojson`
  - En auto: `https://routing.openstreetmap.de/routed-car/route/v1/driving/…` con los mismos parámetros.
  - Probado el 17/11/2026 con dos y con tres puntos de Buenos Aires: responde `code: "Ok"` con `distance` (metros),
    `duration` (segundos) y la geometría en `[lng, lat]`.
  - Se pide **al abrir el mapa**, a pie por defecto; un selector cambia a auto. Tiempo límite de 8 s
    (`AbortController`). Caché de módulo por puntos + modo durante la sesión: volver a "A pie" no consulta de
    nuevo; un fallo no se guarda.
  - Con respuesta: línea continua sobre las calles y la leyenda "1,7 km · 23 min a pie" (o "en auto").
  - Sin respuesta (error o más de 8 s): línea recta punteada entre los puntos y "350 m en línea recta"; sin
    mensaje de error ni selector de modo.
  - Con un solo punto (un comercio y sin origen) no hay ruta ni consulta: solo el marcador y el botón de Google Maps.
- **Privacidad:** para dibujar la ruta, las coordenadas de origen y destino se mandan a ese servicio. Es el único
  momento en que la ubicación sale del dispositivo, y solo cuando el usuario abre un mapa teniendo ubicación de
  GPS. Siempre que la ruta incluye la ubicación, debajo del mapa: "Para marcar la ruta, tu ubicación se envía a
  OpenStreetMap."
- **Abrir en Google Maps:** `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=walking|driving`
  (con `&waypoints=<lat>,<lng>|<lat>,<lng>` para las paradas intermedias; el destino es la última parada). **Sin
  `origin`**: Google usa la posición del dispositivo y la app no la pone en la URL. Es un `<a>` que abre una
  pestaña nueva (`target="_blank"`, `rel="noopener noreferrer"`); en el celular, el sistema ofrece la app de mapas.
  Usa el modo elegido en el selector (a pie si no hay selector).
- **Recorrido del carrito:** paradas en el orden de los grupos del carrito (`groupCartByStore`); solo los comercios
  con coordenadas (los del SEPA). Si alguno no tiene, se aclara "N comercios sin ubicación no aparecen en el mapa"
  ("1 comercio sin ubicación no aparece en el mapa"). Hasta 9 paradas (el tope de Google Maps); si hay más, "Se
  muestran los primeros 9 comercios". "Ver recorrido" aparece con **2 o más** comercios con coordenadas. Sin
  ubicación de GPS, la ruta une solo los comercios (no viaja ninguna ubicación del usuario y no se muestra el aviso).
- **Modal:** `<dialog>` nativo con `showModal()`, a pantalla completa en el celular (con las áreas seguras de la
  spec 19); cierra con Escape y con el botón de cerrar (ícono `X` de lucide, `aria-label="Cerrar mapa"`) y devuelve
  el foco al botón que lo abrió. Al cerrar o al ocultarse la página (`<Activity>`), el modal se cierra y el mapa se
  destruye (`map.remove()`) en la limpieza del efecto, igual que `CartStoreDialog`.
- **Sin conexión** (o si no carga Leaflet): el modal muestra nombre, dirección y el botón de Google Maps, sin mapa
  ni mensaje de error.
- Distancias con `formatDistance` (spec 15); números con `src/lib/format.ts`.

## UI/UX

- Encabezado del modal: nombre del comercio (o "Recorrido: N comercios") y dirección.
- Mapa ocupando el alto disponible (mínimo 320 px). Los controles de zoom de Leaflet, abajo a la derecha.
- Debajo: leyenda de la ruta, selector **A pie / En auto** (dos botones con `aria-pressed`), el aviso de privacidad
  o el botón "Usar mi ubicación" según el caso, y el botón principal **"Abrir en Google Maps"**.
- En el recorrido, lista numerada de las paradas debajo del mapa; los marcadores llevan el mismo número.
- Botón "Mapa" en las filas de comercio: ícono de lucide + texto desde `sm`, solo ícono en 375 px
  (`aria-label="Ver <comercio> en el mapa"`), de 44 px, al lado del botón "Agregar". Las filas sin coordenadas
  (precios cargados a mano) no lo llevan.
- En el carrito: el mismo botón de solo ícono en el encabezado de cada comercio con coordenadas; "Ver recorrido"
  (`.btn-secondary`, con ícono) en el pie, junto al total.
- Mientras llega la ruta: "Buscando la ruta…" en el lugar de la leyenda; los marcadores ya se ven.
- Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Lógica pura + tests** (`src/lib/route.ts`, `route.test.ts`): `googleMapsUrl` (un destino, con paradas, sin
   origen, los dos modos), `formatDuration`, `parseOsrmRoute` (respuesta válida, `code` distinto de `Ok`, sin
   rutas, forma inesperada) y `mapStops` (sin coordenadas, tope).
2. **Dependencia.** `npm i leaflet` y `npm i -D @types/leaflet`. Verificar: `npm run build` sin errores de
   prerender y el JS inicial de `/` no crece (Leaflet queda en un chunk aparte).
3. **`BranchMap`** con un comercio: modal, mapa, marcadores, encuadre, limpieza, estado sin conexión. Probarlo
   primero solo desde el detalle (`NearbyStoresCard`). Verificar en `localhost`.
4. **Ruta:** `getRoute` con caché y tiempo límite, selector de modo, leyenda, respaldo en línea recta y aviso de
   privacidad. Verificar: bloqueando `routing.openstreetmap.de` en DevTools, se ve la línea punteada.
5. **"Usar mi ubicación"** dentro del mapa, con sus dos mensajes de error.
6. **Integración:** prop `onMap` de `NearbyStores` en Buscar (propios y catálogo) y en el detalle; botón en el
   encabezado de cada grupo del carrito y "Ver recorrido" en el pie. Cada pantalla tiene **un** `BranchMap`.
7. **Prueba en celular** con la URL de preview: el botón de Google Maps abre la app con la ruta.
8. **Documentación.** `CLAUDE.md`: estructura (`BranchMap`, `lib/route.ts`), stack (Leaflet), la excepción a "la
   ubicación no sale del dispositivo" en *Arquitectura*, *Funcionalidades* y *Estado Actual*; estado de esta spec.

## Criterios de aceptación

- [ ] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.
- [ ] Con ubicación de GPS, "Mapa" en una fila de comercio abre el modal con mi ubicación, el comercio y la ruta por las calles, con distancia y tiempo.
- [ ] Cambiar entre "A pie" y "En auto" actualiza la ruta y el tiempo; volver al modo anterior no hace otra consulta (pestaña Network).
- [ ] Si el servicio de rutas no responde, se ve la línea recta punteada y la distancia en línea recta, sin error.
- [ ] Con ubicación de GPS se ve el aviso "Para marcar la ruta, tu ubicación se envía a OpenStreetMap."
- [ ] "Abrir en Google Maps" abre la ruta hacia el comercio; la URL no contiene mi latitud ni mi longitud.
- [ ] Con una localidad elegida a mano (o sin ubicación), el mapa muestra solo el comercio centrado, sin ruta y sin consultas a `routing.openstreetmap.de`, con "Usar mi ubicación" y el botón de Google Maps.
- [ ] Al aceptar "Usar mi ubicación" en el mapa aparecen el marcador "Vos" y la ruta, y al cerrar, la barra de ubicación de Buscar dice "Mi ubicación".
- [ ] Al denegar el permiso se lee "Sin permiso para usar tu ubicación." y el mapa sigue con el comercio.
- [ ] En el carrito con 3 comercios del SEPA, "Ver recorrido" muestra los 3 marcadores numerados, la lista de paradas y la ruta que los une en orden.
- [ ] Un comercio cargado a mano (sin coordenadas) no tiene botón "Mapa" y se informa en el recorrido; con un solo comercio con coordenadas no aparece "Ver recorrido".
- [ ] Las filas de "Cerca tuyo" del diálogo "Cambiar comercio" no tienen botón "Mapa".
- [ ] Leaflet no se descarga hasta abrir un mapa (pestaña Network).
- [ ] Cerrar con Escape devuelve el foco al botón "Mapa"; abrir y cerrar 5 veces no deja mapas duplicados ni errores en consola.
- [ ] Con el mapa abierto, navegar a otra pestaña de la app y volver: la página responde (el modal quedó cerrado).
- [ ] Sin conexión, el modal muestra nombre, dirección y el botón de Google Maps.
- [ ] La atribución de OpenStreetMap está visible.
- [ ] En 375 px el modal ocupa la pantalla, el botón "Mapa" mide al menos 44 px y no hay scroll horizontal.

## Decisiones

- **Sí:** Leaflet + OpenStreetMap. Sin clave ni costo, liviano (~40 KB comprimido) y alcanza para marcadores y una línea. Google Maps embebido necesita clave y facturación.
- **Sí:** ruta dibujada en la app con OSRM público y respaldo en línea recta, aunque sea la única excepción a "la ubicación no sale del dispositivo". La distancia y el tiempo por calles son lo que sirve para decidir a qué comercio ir; el envío ocurre solo al abrir un mapa y queda avisado.
- **Sí:** el aviso de privacidad se muestra siempre que viaja la ubicación, no solo la primera vez. Evita guardar una clave más y el texto es una línea.
- **Sí:** el origen es la ubicación guardada (redondeada a ~11 m), no una lectura nueva del GPS. Coincide con las distancias que ya se ven y no pide el permiso otra vez.
- **Sí:** con localidad elegida a mano no hay ruta, y se ofrece "Usar mi ubicación" dentro del mapa. Una ruta desde un punto donde el usuario no está es engañosa; el botón da el camino corto a la ruta real.
- **Sí:** aceptar el GPS en el mapa cambia la ubicación guardada de toda la app. Una sola ubicación, sin un origen "solo para el mapa" que contradiga las distancias de las listas.
- **Sí:** el recorrido del carrito queda en esta spec. El modal ya recibe una lista de paradas y el costo extra es acotado.
- **Sí:** la navegación paso a paso se delega a Google Maps. Hacerla bien (voz, recálculo, tránsito) no es el objetivo de la app.
- **Sí:** el link de Google Maps sin origen. Más simple y la ubicación no viaja en una URL.
- **No:** pedir consentimiento con un botón antes de la primera ruta. Un paso y una clave más para un envío que ya está avisado.
- **No:** ruta aproximada desde el centro de la localidad.
- **No:** botón "Mapa" en "Cambiar comercio" ni en el historial. Un `<dialog>` encima de otro complica el foco; el historial no lo necesita para decidir una compra.
- **No:** `next/dynamic` con `ssr: false` para todo el modal. El `import()` dentro del efecto es suficiente y mantiene el `<dialog>` en el árbol para la accesibilidad.
- **No:** ordenar las paradas por el camino óptimo. Con 2 a 4 comercios el orden lo decide quien compra.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El servicio público de rutas no tiene garantía de disponibilidad ni admite uso intensivo | Una consulta por mapa y modo, con caché, tiempo límite y respaldo en línea recta; si hiciera falta, se cambia por openrouteservice (clave gratuita) detrás de `getRoute` |
| Política de uso de las teselas de OpenStreetMap (sin uso masivo) | El mapa se abre a pedido; si el uso crece, cambiar a un proveedor con plan gratuito sin tocar el resto del componente |
| Coordenadas del SEPA mal cargadas | El modal muestra la dirección en texto; Google Maps recibe las mismas coordenadas |
| Leaflet y Cache Components (`<Activity>`) | El mapa se crea y se destruye en un efecto y el modal se cierra al ocultarse la página; criterios de abrir y cerrar 5 veces y de navegar con el mapa abierto |
| El CSS de Leaflet pisa estilos o entra en el CSS inicial | Se importa solo desde `BranchMap`; revisar en el build que las pantallas no cambian |
| La ubicación guardada es vieja (se guardó otro día, en otro lugar) | El marcador "Vos" se ve en el mapa y delata el error; Google Maps usa la posición real del dispositivo |
