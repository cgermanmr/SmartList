# SPEC 15 — Precios y comercios cercanos en la búsqueda

> **Estado:** Implementado
> **Depende de:** [SPEC 10](10-productos-con-codigo-de-barras.md), [SPEC 13](13-precios-por-sucursal-sepa.md), [SPEC 14](14-carrito-por-comercio.md), [SPEC 18](18-agregar-al-carrito-sin-alta.md)
> **Fecha:** 2026-11-15
> **Objetivo:** Al buscar un producto, ver su precio en los comercios cercanos con la distancia a cada uno, y agregarlo al carrito directamente desde la lista, con el comercio y el precio elegidos.

## Por qué existe esta spec

Revisando la app el 15/11/2026: al buscar "pañal" la sección **En Precios Claros** lista los productos con "BABYS ·
40 u · en 14 cadenas" y un link "Agregar" que lleva al formulario de Agregar producto. No se ve **ningún precio**,
**ningún comercio**, y para llevarlo al carrito hay que dar de alta el producto, volver a Buscar y recién ahí
agregarlo, con precio `100` porque no tiene ninguno registrado.

Lo que se quiere: buscar "pañales" y ver producto, precio y los comercios que lo tienen, con la distancia
("0,5 km", "1 km"), y agregarlo al carrito con un toque.

## Alcance

**Incluye:**

- **Ubicación:** botón "Usar mi ubicación" (geolocalización del navegador) y alternativa manual por localidad.
  Radio de búsqueda elegible.
- **Buscar (`/`)**: cada resultado de **En Precios Claros** y cada producto propio con EAN muestra el mejor precio
  cercano ("Desde $13.179 · Maxi — 0,8 km") y se despliega con la lista de comercios: nombre, dirección,
  distancia y precio.
- **Agregar al carrito desde la lista**, en un comercio puntual: si el producto no existe entre los propios, se
  crea solo.
- **Detalle de producto** (con EAN): la misma lista de comercios cercanos.
- **Carrito:** "Cambiar comercio" (spec 14) ofrece también las sucursales cercanas con su precio.
- Sin ubicación: precio por cadena a nivel nacional, sin distancia.

**Fuera de alcance:**

- Mapa y ruta (spec 16). Imágenes (spec 17).
- La tarjeta "Precio de referencia" y la comparación contra el precio propio (spec 12).
- Distancia a los comercios cargados a mano (texto libre, sin coordenadas).
- Buscar la combinación más barata del carrito entero entre varios comercios.
- Promociones de las cadenas.

## Modelo de datos

```typescript
// src/lib/geo.ts — puro, con tests
export interface LatLng { lat: number; lng: number }
/** Distancia en línea recta (haversine), en km */
export function distanceKm(a: LatLng, b: LatLng): number;
/** "350 m" hasta 950 m; después "1,2 km"; desde 10 km sin decimales */
export function formatDistance(km: number): string;

// src/lib/location.ts
export interface UserLocation extends LatLng {
  source: 'gps' | 'localidad';
  label: string;            // "Mi ubicación" o "Caballito, CABA"
}
export const RADIUS_OPTIONS = [1, 3, 5, 10] as const;   // km; por defecto 3

// src/lib/sepa.ts
export interface SepaBranch {
  id: string;               // '10-1-123'
  chain: string;            // nombre de la bandera
  name: string;
  address: string | null;
  barrio: string | null;
  localidad: string | null;
  provincia: string | null;
  lat: number | null;
  lng: number | null;
}
export interface NearbyPrice {
  ean: string;
  branch: SepaBranch;
  price: number;
  distanceKm: number;
}

/** Todas las sucursales, una vez por sesión (caché de módulo) */
export function getSepaBranches(): Promise<SepaBranch[]>;
/** Las `limit` sucursales con coordenadas dentro del radio, de la más cercana a la más lejana; pura */
export function nearestBranches(branches: SepaBranch[], origin: LatLng, radiusKm: number, limit?: number): (SepaBranch & { distanceKm: number })[];
/** Precios de esos EAN en esas sucursales (función de la spec 13); con caché por EAN + sucursal */
export function getNearbyPrices(eans: string[], branches: (SepaBranch & { distanceKm: number })[]): Promise<Map<string, NearbyPrice[]>>;
/** Ordena por precio y, a igual precio, por distancia; pura */
export function sortNearbyPrices(prices: NearbyPrice[]): NearbyPrice[];
/** Localidades con sucursales y su punto medio, para elegir ubicación a mano; pura */
export function branchLocalities(branches: SepaBranch[]): { label: string; lat: number; lng: number; branches: number }[];
/** StoreRef del carrito a partir de una sucursal: name = "<cadena> — <sucursal>", address, barrio, sepaId, lat, lng */
export function storeRefFromBranch(branch: SepaBranch): StoreRef;
```

`productFromSepa` (producto propio desde el catálogo, sin categoría) y `addSepaToCart` vienen de la
[spec 18](18-agregar-al-carrito-sin-alta.md).

Estado nuevo en el store: `location: UserLocation | null` y `radiusKm`, con las acciones `setLocation` y
`setRadius`, persistidos en la clave nueva **`preciolocal_location`** (validada al cargar; si no es válida, `null`
y 3 km).

## Reglas

- **La ubicación no sale del dispositivo.** La app baja la lista completa de sucursales (2.683 filas) y calcula las
  distancias en el navegador. A Supabase solo le llegan los `id` de las sucursales elegidas, nunca las coordenadas
  del usuario.
- **Pedir permiso solo cuando se toca "Usar mi ubicación"**, nunca al abrir la página. `getCurrentPosition` con
  `enableHighAccuracy: false`, `timeout` de 10 s y `maximumAge` de 5 min. La posición se guarda redondeada a 4
  decimales (~11 m).
- **Errores de ubicación:** permiso denegado → "Sin permiso para usar tu ubicación. Podés elegir tu localidad.";
  sin señal o tiempo agotado → "No se pudo obtener tu ubicación."; en los dos casos se ofrece el selector de
  localidad. Sin `navigator.geolocation` (o sin HTTPS) solo se muestra el selector.
- **Por localidad:** el punto es el promedio de las coordenadas de las sucursales de esa localidad. Las distancias
  se muestran con "aprox." adelante.
- **Sucursales cercanas:** hasta **40**, dentro del radio elegido. Si no hay ninguna: "No hay comercios de Precios
  Claros a menos de N km" con un botón para pasar al radio siguiente.
- **Consulta de precios:** una sola llamada por búsqueda con los EAN visibles (hasta 20: los resultados del
  catálogo más los propios con EAN que pasaron el filtro) y las sucursales cercanas. Se dispara después de los
  300 ms de espera de `useSepaSearch`, cuando ya están los resultados.
- **Resumen por producto:** "Desde $X · <cadena> — <distancia>" con el menor precio cercano (a igual precio, el
  más cerca) y "en N comercios cerca". Si ningún comercio cercano lo tiene: "Sin precio en comercios cercanos".
- **Lista de comercios** (al desplegar): hasta 10, ordenados por precio y después distancia; "Ver más" muestra el
  resto. El más barato lleva la marca verde "Más barato" (todos los empatados).
- **Sin ubicación:** quedan el resumen ("Promedio $X · más barato en <cadena> $Y") y la lista por cadena de la
  spec 12, sin distancia ni "Agregar" por sucursal. Arriba, el aviso "Activá tu ubicación para ver comercios cercanos".
- **Agregar al carrito** desde una fila de comercio:
  1. si no hay un producto propio con ese EAN, se crea con `productFromSepa` de la spec 18 (vinculado al catálogo,
     sin categoría);
  2. `addToCart` con el precio de esa sucursal y `store = storeRefFromBranch(...)`. Por la regla "un producto, un
     comercio" de la spec 14, si ya estaba en el carrito pasa a ese comercio y a ese precio.
  No se registra ningún `Price`: eso pasa al confirmar la compra, como hoy.
- **"Agregar" sin comercio** (el botón "Añadir Carrito" de la tarjeta de un producto propio y el "Agregar al
  carrito" de la spec 18) sigue como hoy, con `initialCartPrice`.
- **Productos propios sin EAN:** no consultan nada; se ven como hoy, con el link "Vincular con Precios Claros" en
  el detalle.
- **Precios propios:** en la lista de comercios de un producto propio se agregan, al final y sin distancia, sus
  precios cargados a mano de los últimos 60 días (el último de cada par barrio + comercio), con la leyenda
  "Cargado por vos · dd/mm". Se pueden agregar al carrito con ese comercio (`{ name: store, barrio }`).
- **Fecha del dato:** pie "Precios de lista informados a Precios Claros el dd/mm/aaaa — SEPA (CC-BY-4.0)". Con
  más de 7 días, en ámbar.
- **Caché:** sucursales y precios en memoria durante la sesión. Cambiar de ubicación o de radio no vuelve a bajar
  las sucursales.
- Sin Supabase (`sepaEnabled` falso), sin conexión o con error: Buscar funciona como hoy, sin precios ni comercios
  y sin mensajes de error nuevos (el error del catálogo ya existe).
- Montos con `formatMoney`; distancias con `formatDistance`.

## UI/UX

- **Barra de ubicación** debajo del buscador de `/` (componente `LocationBar`), solo con Supabase configurado:
  - sin ubicación: "📍 Usar mi ubicación" (`btn-secondary`) y link "Elegir localidad";
  - con ubicación: "📍 Mi ubicación · 3 km" con un `select` de radio y "Cambiar" / "Quitar".
- **Resultado del catálogo** (fila `list-row` de `SepaResults`): a la descripción, marca y presentación se suma el
  resumen de precio. La fila entera es un botón que despliega la lista de comercios (`aria-expanded` /
  `aria-controls`, como el historial de compras). El link "Agregar" a `/upload?tab=producto&ean=…` pasa a ser
  "Editar antes de agregar", dentro del desplegado.
- **Fila de comercio:** cadena y sucursal en negrita, dirección y localidad en gris, distancia a la derecha del
  nombre, precio grande y botón "Agregar" (`aria-label="Agregar <producto> en <comercio>"`). Con la spec 16, un
  botón "Mapa" al lado.
- **Tarjeta de producto propio con EAN:** debajo del precio propio, el resumen cercano y un botón "Ver comercios"
  que despliega la misma lista.
- **Detalle:** tarjeta "Comercios cercanos" después de las estadísticas, con la misma lista. Sin ubicación,
  la `LocationBar`.
- **Carrito:** el diálogo "Cambiar comercio" de la spec 14 suma, para ítems con EAN y con ubicación, la sección
  "Cerca tuyo" con las sucursales y su precio; al elegir una se actualizan comercio y precio.
- Mientras se piden los precios, el resumen dice "Buscando precios…"; la lista de productos no espera.
- 375 px: la fila de comercio apila nombre/dirección arriba y precio/botón abajo.
- Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Lógica pura + tests:** `geo.ts` (`distanceKm` contra distancias conocidas, `formatDistance`), y en `sepa.ts`
   `nearestBranches`, `sortNearbyPrices`, `branchLocalities`, `storeRefFromBranch`. `productFromSepa` ya existe
   (spec 18, en `src/lib/product-form.ts`): se reusa, no se vuelve a escribir.
2. **Sucursales y precios:** `getSepaBranches` (paginado de a 1.000 filas, el tope por defecto de la API de
   Supabase) y `getNearbyPrices` (`supabase.rpc('sepa_precios_en_sucursales', …)`, con `.retry(false)`).
   Verificar: una búsqueda hace una sola llamada de precios (pestaña Network).
3. **Ubicación:** estado en el store, `preciolocal_location`, `LocationBar` con geolocalización, errores y
   selector de localidad. Verificar en `localhost` (la geolocalización funciona sin HTTPS solo ahí).
4. **Buscar:** resumen y lista desplegable en el catálogo y en las tarjetas propias; agregar al carrito.
5. **Detalle** y **diálogo del carrito**.
6. **Sin ubicación:** resumen por cadena.
7. **Prueba en celular** con la URL de preview de Vercel (HTTPS): Android con Chrome y iPhone con Safari.
8. **Documentación.** `CLAUDE.md` (lib, componentes, clave nueva, Funcionalidades), features 02 y 06.

## Criterios de aceptación

- [x] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.
- [x] Al abrir Buscar no aparece ningún pedido de permiso de ubicación.
- [x] Con ubicación, buscar "pañal" muestra en cada resultado "Desde $X · <cadena> — <distancia>" y al desplegarlo, los comercios con dirección, distancia y precio, del más barato al más caro.
- [x] El precio de una fila coincide con el de esa sucursal en la base (comparado con la función de la spec 13).
- [x] "Agregar" en un comercio, sobre un producto que no era propio, crea el producto vinculado y lo deja en el carrito con ese precio y ese comercio, sin pasar por el formulario.
- [x] El mismo producto agregado después desde otro comercio queda en una sola línea, con el comercio y el precio nuevos.
- [ ] Con el permiso denegado se ve el mensaje y se puede elegir una localidad; las distancias dicen "aprox.".
- [x] Cambiar el radio de 3 a 10 km suma comercios sin volver a bajar las sucursales.
- [x] Sin ubicación se ven el resumen y la lista por cadena de la spec 12 y el aviso para activarla; no hay botón "Agregar" por sucursal.
- [x] En la pestaña Network, ninguna consulta a Supabase lleva la latitud ni la longitud del usuario.
- [x] La ubicación y el radio se conservan al recargar; "Quitar" los borra.
- [ ] Sin variables de Supabase o sin conexión, Buscar, el detalle y el carrito funcionan como antes.
- [ ] En 375 px no hay scroll horizontal y los botones se pueden tocar (44 px de alto como mínimo).

## Decisiones

- **Sí:** distancia calculada en el navegador. Son 2.683 sucursales (~200 KB): alcanza con bajarlas una vez y la ubicación del usuario no se manda a ningún servidor.
- **Sí:** distancia en línea recta. Sirve para ordenar y decidir; la distancia caminando o en auto la da la ruta (spec 16).
- **Sí:** alternativa por localidad sin geocodificador. No depende de un servicio externo ni pide escribir una dirección.
- **Sí:** crear el producto al agregarlo al carrito, sin categoría, como en la spec 18. El alta con formulario sigue disponible, pero no es un paso obligatorio para comprar.
- **Sí:** guardar la ubicación en `localStorage`. Evita pedirla en cada visita; se borra con "Quitar".
- **Sí:** radio por defecto de 3 km. En CABA y el conurbano deja varias cadenas a mano sin listar media ciudad.
- **No:** `watchPosition` (seguir la posición en vivo). Gasta batería y la lista no necesita actualizarse mientras se camina.
- **No:** optimizar el carrito completo entre comercios. Es otro problema (canasta por comercio); queda para después.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El precio informado no coincide con la góndola | Leyenda con la fecha del dato y "precios de lista"; el precio del carrito se puede editar |
| Solo hay grandes cadenas | Los precios cargados a mano aparecen en la misma lista; el aviso "No hay comercios de Precios Claros a menos de N km" lo aclara |
| Zonas sin sucursales cerca | Botón para ampliar el radio; resumen por cadena como respaldo |
| 20 productos × 40 sucursales tarda | La lista de productos se muestra antes; los precios llegan después. Caché por sesión |
| Geolocalización imprecisa en escritorio | Se muestra la dirección de cada comercio; alternativa por localidad |
| Productos creados solos sin categoría | La categoría es opcional desde la spec 18; pendiente aparte: editar nombre y categoría desde el detalle |

## Lo que **no** incluye esta spec

- Mapa y ruta.
- Imágenes.
- Precio de referencia y comparación contra el precio propio.
- Canasta más barata entre comercios.
- Promociones.
