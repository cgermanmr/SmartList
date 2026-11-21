# SPEC 25 — ¿Dónde conviene el carrito?

> **Estado:** Implementado
> **Depende de:** [SPEC 12](12-precio-de-referencia-sepa.md), [SPEC 14](14-carrito-por-comercio.md), [SPEC 15](15-precios-y-comercios-cercanos.md), [SPEC 16](16-mapa-y-como-llegar.md), [SPEC 20](20-lista-de-comercios-cercanos.md)
> **Fecha:** 2026-11-21
> **Objetivo:** Comparar el carrito entero contra los comercios cercanos (o contra las cadenas, sin ubicación) para ver cuál tiene más productos y más baratos, y pasar el carrito a ese comercio con un toque.

## Por qué existe esta spec

El uso principal de la app es armar el carrito antes de ir al súper y saber **adónde ir**. Hoy el carrito solo
permite elegir el comercio **ítem por ítem** ("Cambiar comercio" → "Cerca tuyo", spec 15): para saber qué
sucursal conviene para todo el carrito hay que abrir cada producto y sumar a mano. Los precios ya están en la base
(`sepa_precios_en_sucursales`, spec 13) y la app ya sabe pedirlos para varios EAN en una consulta
(`getNearbyPrices`); falta juntarlos por comercio.

La numeración salta a la 25: las specs 22 (grupos) y 23 (validación) están reservadas desde la
[spec 21](21-cuenta-y-sincronizacion.md), y la 24 queda para los comercios cercanos en el lector.

## Alcance

**Incluye:**

- Tarjeta **"¿Dónde conviene?"** arriba de los grupos del carrito, con la mejor opción y el botón
  "Comparar N comercios".
- Modal `CartCompareDialog` con la lista de opciones: con ubicación, las **sucursales cercanas** (hasta 40, las del
  radio); sin ubicación, las **cadenas** con su precio nacional (mediana del SEPA, spec 12).
- Por opción: cuántos productos del carrito tiene ("Tiene 9 de 10"), el total de esos productos, el ahorro contra
  el carrito como está y, desplegando la fila, los productos que no tiene.
- **"Pasar todo a este comercio"** (solo sucursales): los ítems que esa sucursal informa pasan a ella con su
  precio; los demás quedan donde estaban.
- Botón **Mapa** por sucursal (spec 16), encima del modal (como la lista de la spec 20).
- La barra de ubicación (`LocationBar`) dentro del modal, para activar la ubicación o cambiar el radio ahí mismo.

**Fuera de alcance:**

- Combinar dos comercios ("los 2 que faltan, en Día a 400 m").
- Precios cargados a mano por el usuario como opción de la comparación (necesitan comercio con coordenadas: spec 26).
- Promociones de las cadenas (solo precio de lista, como en el resto de la app).
- Comparar la canasta de compras pasadas (historial) contra las cadenas.
- Ordenar o filtrar la lista de otra forma (por distancia, por cadena).

## Reglas

### Qué entra en la comparación

- Entran los ítems del carrito cuyo producto tiene **EAN** (`products.find(p => p.id === item.productId)?.ean`),
  **en cualquier grupo** (también los que ya tienen comercio).
- Los ítems sin EAN no se comparan y se cuentan aparte: "1 producto sin código no se puede comparar" /
  "N productos sin código no se pueden comparar".
- La tarjeta aparece con **2 o más ítems con EAN** y Supabase configurado. Con 0 o 1 no se muestra.

### Opciones

- **Con ubicación** (`useNearBranches` con sucursales en el radio): una opción por sucursal. Los precios salen de
  `useNearbyPrices(eans)` (una llamada por cada 20 EAN, con la caché por EAN + sucursal de `getNearbyPrices`). A
  Supabase le llegan los EAN y los `id` de las sucursales, nunca la ubicación.
- **Sin ubicación**, sin sucursales en el radio o si falla la consulta de precios cercanos: una opción por
  **cadena**, con la `mediana` de cada cadena de `getSepaPrices` (ya se piden en el carrito con
  `useSepaReferences`; no hay consulta nueva). Una cadena "tiene" un producto si aparece en su `byChain`.
- Solo se muestran las opciones con **al menos 1** producto del carrito. Al pie: "N comercios cercanos no tienen
  ninguno de tus productos" (solo en modo sucursales y si N > 0).

### Cálculo (puro, en `src/lib/basket.ts`)

- `total` de una opción = Σ precio de la opción × cantidad, solo de los productos que tiene.
- `currentTotal` = Σ precio actual del ítem × cantidad, de los productos que la opción tiene **y** que tienen
  precio en el carrito (> 0).
- `savings` = `currentTotal` − Σ precio de la opción × cantidad de esos mismos productos. Positivo = más barato
  que ahora. Los ítems en $0 ("Completar precio", spec 18) cuentan en la cobertura y en el total, pero no en el
  ahorro.
- **Orden:** más productos primero; a igual cantidad, menor `total`; después menor distancia (solo sucursales);
  después nombre.
- Montos con `formatMoney`; nada de redondeos propios.

### Tarjeta

- Mientras cargan las sucursales o los precios: "Buscando precios cerca…" (con ubicación) o "Buscando precios…".
- Muestra la **primera opción**: nombre, distancia (sucursales; "aprox." con localidad), "Tiene N de M · $total" y
  la línea de ahorro:
  - `savings > 0`: "$X menos que ahora" en verde (`text-green-700`).
  - `savings < 0`: "$X más que ahora" en rojo (`text-red-700`).
  - `savings === 0` o sin precios actuales para comparar: sin línea de ahorro.
  - Si todos los productos que tiene ya están en esa sucursal (mismo `sepaId`): "Tu carrito ya está en este
    comercio", sin línea de ahorro.
  - Con N < M, se aclara "en los N que tiene" junto al ahorro.
- Sin ubicación (modo cadenas): debajo, "Precio promedio de la cadena en todo el país. Activá tu ubicación para ver
  comercios cercanos."
- Botón "Comparar N comercios" (o "Comparar N cadenas") que abre el modal. Si no hay ninguna opción con
  productos: "Ningún comercio cercano tiene tus productos" (o "Ninguna cadena…") y el botón abre igual el modal
  (para cambiar el radio).

### Modal

- `LocationBar` arriba; al cambiar ubicación o radio, la lista se recalcula (mismos hooks).
- Encabezado: "N comercios a menos de R km" (`nearbyListSummary`, spec 20) o "N cadenas" sin ubicación.
- Los primeros **10** y "Ver N más" (como `NearbyStores`).
- Cada fila: nombre (`branchLabel`), dirección, distancia, "Tiene N de M", total y ahorro (mismos textos y colores
  que la tarjeta). La primera lleva el badge **"Conviene"**.
- La fila es un botón que despliega (`aria-expanded`, chevron; una a la vez) los productos que no tiene ("No tiene:
  Yerba Playadito 1 kg, Leche …") y las acciones:
  - **Pasar todo a este comercio** (`btn-primary`, solo sucursales; `aria-label="Pasar <N> productos a <comercio>"`).
  - **Mapa** (`aria-label="Ver <comercio> en el mapa"`), si la sucursal tiene coordenadas.
- Pie: "Precios de lista informados a Precios Claros el dd/mm/aaaa" (`latestBranchDate`; ámbar con más de 7 días),
  o la fecha de la referencia en modo cadenas (`freshnessLabel`).

### Pasar todo a este comercio

- Acción nueva del store `moveCartItems(store, moves)`: en **un solo `set`**, cada ítem de `moves` pasa al
  `StoreRef` de la sucursal (`storeRefFromBranch`) con el precio de esa sucursal; la cantidad no cambia y el
  subtotal se recalcula. Un solo cambio para la persistencia y la sincronización (spec 21).
- Los ítems que la sucursal no informa no cambian (ni comercio ni precio).
- Sin confirmación. Cierra el modal y muestra el aviso fijo "N productos pasaron a <comercio>" (`role="status"`, 3 s,
  como el aviso de Buscar de la spec 18).
- Un ítem en $0 que la sucursal tiene queda con precio: deja de pedir "Completar precio".
- No registra precios (eso pasa al comprar, como hoy).

## Modelo de datos

No hay datos persistidos nuevos: `preciolocal_cart` no cambia de formato.

Tipos y funciones puras nuevas:

```typescript
// src/lib/basket.ts
/** Ítem del carrito que entra en la comparación (tiene EAN) */
export interface BasketLine {
  itemId: string;
  productName: string;
  ean: string;
  quantity: number;
  price: number;              // precio actual en el carrito (0 = sin precio)
  sepaId?: string;            // sucursal en la que está hoy, si tiene
}

/** Una opción de la comparación: una sucursal cercana o una cadena */
export interface BasketOption {
  key: string;                // id de la sucursal o nombre de la cadena
  name: string;
  branch?: NearBranch;        // solo en modo sucursales
  found: { line: BasketLine; price: number }[];
  missing: BasketLine[];
  total: number;
  savings: number | null;     // null si ningún producto que tiene tiene precio actual
  alreadyThere: boolean;      // todos los que tiene ya están en esta sucursal
}

export function basketLines(cart: CartItem[], products: Product[]): { lines: BasketLine[]; withoutEan: number };
export function compareNearby(lines: BasketLine[], prices: Map<string, NearbyPrice[]>, branches: NearBranch[]): BasketOption[];
export function compareChains(lines: BasketLine[], references: Map<string, ReferenceSummary>): BasketOption[];
```

Acción nueva del store:

```typescript
// src/lib/store.ts
/** Pasa esos ítems a ese comercio con su precio (cantidad igual, subtotal recalculado), en un solo cambio */
moveCartItems: (store: StoreRef, moves: { itemId: string; price: number }[]) => void;
```

Hook nuevo:

```typescript
// src/components/useBasketComparison.ts
/** Opciones ordenadas, modo ('branches' | 'chains'), carga, sin EAN y sin productos; junta useNearbyPrices y las referencias */
export function useBasketComparison(lines: BasketLine[], references: Map<string, ReferenceSummary>): BasketComparison;
```

## UI/UX

```
┌ ¿Dónde conviene? ─────────────────────┐
│ Coto — Caballito              800 m   │
│ Tiene 10 de 10 · $12.340              │
│ $1.200 menos que ahora                │
│ [ Comparar 12 comercios  › ]          │
└───────────────────────────────────────┘
(grupos del carrito)

┌ ¿Dónde conviene? ───────────────── ✕ ┐
│ (LocationBar)                         │
│ 12 comercios a menos de 3 km          │
│ ───────────────────────────────────── │
│ [Conviene] Coto — Caballito   800 m ▾ │
│ Tiene 10 de 10 · $12.340              │
│ $1.200 menos que ahora                │
│   [Pasar todo a este comercio] [Mapa] │
│ ───────────────────────────────────── │
│ Día — Primera Junta         1,2 km ▸ │
│ Tiene 9 de 10 · $11.900               │
│ $400 menos que ahora, en los 9        │
│ …                                     │
│ Ver 2 más                             │
│ Precios de lista informados … 20/11   │
└───────────────────────────────────────┘
```

- Tarjeta `.card` con título en Rubik (`font-display`); botón `btn-secondary` de 44 px.
- Modal a pantalla completa en el celular y tarjeta centrada desde `sm`, como `NearbyBranchesDialog`; encabezado
  fijo y lista con scroll. Cierra con Escape, con el botón `X` (`aria-label="Cerrar comparación"`) y con un toque
  en el fondo; el foco vuelve al botón "Comparar". Se cierra al ocultarse la página con `<Activity>`.
- Badge "Conviene" en `primary-700` sobre `primary-100`; montos con cifras tabulares.
- Íconos de `lucide-react` con `aria-hidden="true"`; sin emojis.
- 375 px sin scroll horizontal; nombres largos con `break-words`.
- Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Líneas del carrito (TDD)** — `src/lib/basket.ts` con `BasketLine` y `basketLines`, tests en `basket.test.ts`:
   ítems con y sin EAN, `sepaId` del comercio actual, ítem en $0.
2. **Comparación por sucursal (TDD)** — `compareNearby`: cobertura, total con cantidades, ahorro (sin los ítems en
   $0; `null` si no queda ninguno), `alreadyThere`, sin las sucursales con 0 productos, orden (cobertura → total →
   distancia → nombre).
3. **Comparación por cadena (TDD)** — `compareChains` con la `mediana` de `byChain`; mismo orden sin distancia.
4. **Acción del store (TDD)** — `moveCartItems` en `store.ts` con tests en `store.test.ts`: cambia comercio y precio
   de los ítems pedidos, recalcula subtotal, no toca los demás, ignora precios ≤ 0.
5. **Hook** — `src/components/useBasketComparison.ts`: elige el modo (sucursales si `useNearbyPrices` responde con
   sucursales en el radio; si no, cadenas), expone carga y las opciones ordenadas.
6. **Modal** — `src/components/CartCompareDialog.tsx`: `LocationBar`, encabezado, filas desplegables, "Ver N más",
   "Pasar todo a este comercio", "Mapa" (con su propio `BranchMap` encima) y pie de fecha.
7. **Tarjeta en el carrito** — `src/components/CartCompareCard.tsx` arriba de los grupos en
   `src/app/cart/page.tsx` (recibe `references` y las líneas que ya calcula la página) y el aviso "N productos
   pasaron a …".
8. **Docs** — `CLAUDE.md`: Estructura (archivos nuevos), Arquitectura (comparación del carrito), Funcionalidades →
   Carrito y Estado Actual; `docs/features/07-precios-cercanos-sepa.md` ("Comparar la canasta" pasa a hecho, con
   la combinación de 2 comercios pendiente).

**A revisar (sin test automático):** carrito de más de 20 productos con EAN (2 llamadas a la función); cambiar el
radio con el modal abierto; mapa encima del modal y foco al cerrarlo; navegar con el modal abierto; nombres largos
y 40 sucursales a 375 px.

## Criterios de aceptación

- [ ] Con 2 o más productos con EAN en el carrito y Supabase configurado, aparece la tarjeta "¿Dónde conviene?" arriba de los grupos; con 0 o 1, no.
- [ ] Con ubicación, la tarjeta muestra la sucursal con más productos del carrito y, entre las que tienen la misma cantidad, la de menor total.
- [ ] "Tiene N de M" y el total coinciden con los precios por sucursal de esos productos multiplicados por su cantidad.
- [ ] El ahorro compara contra el precio actual de cada ítem y no cuenta los ítems en $0.
- [ ] Sin ubicación, la comparación es por cadena con la mediana nacional y no ofrece "Pasar todo a este comercio".
- [ ] Las sucursales sin ningún producto del carrito no aparecen y se cuentan en el pie.
- [ ] El modal muestra 10 opciones y "Ver N más"; desplegar una fila muestra los productos que no tiene.
- [ ] "Pasar todo a este comercio" deja los productos que tiene en ese comercio y a su precio, con la misma cantidad; los demás no cambian; aparece el aviso "N productos pasaron a <comercio>".
- [ ] Después de pasar todo, la tarjeta dice "Tu carrito ya está en este comercio".
- [ ] Un ítem en $0 que pasa a una sucursal con precio deja de mostrar "Completar precio".
- [ ] Cambiar el radio en el modal recalcula las opciones.
- [ ] "Mapa" abre el mapa del comercio encima del modal; al cerrarlo se vuelve al modal.
- [ ] Los productos sin EAN se aclaran ("N productos sin código no se pueden comparar").
- [ ] Navegar a otra pestaña con el modal abierto no deja la página inerte.
- [ ] 375 px sin scroll horizontal; `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.

## Decisiones

- **Tarjeta arriba + modal** (elegido) en lugar de la lista entera en la página o un botón solo: la mejor opción se
  ve sin tocar nada y los grupos del carrito no quedan empujados hacia abajo.
- **Orden por cobertura y después total** (elegido): un comercio que tiene menos productos siempre "suma" menos;
  ordenar solo por total premiaría al que tiene menos. Descartado: completar los faltantes con el precio actual del
  carrito (mezcla precios de lugares distintos) y mostrar solo los que tienen todo (con carritos grandes casi
  nunca hay uno).
- **Ahorro sobre los productos que la opción tiene** contra el precio actual: "en los 9 que tiene, $400 menos" es
  una comparación entre los mismos productos.
- **Sin ubicación, por cadena** (elegido) en lugar de solo invitar a activarla: los precios ya están cargados en
  el carrito (`useSepaReferences`) y no hay consulta nueva. Es informativo: no hay una sucursal a la que pasar.
- **"Pasar todo" mueve los que tiene, sin confirmación** (elegido): es reversible ítem por ítem con "Cambiar
  comercio" y el aviso dice qué pasó. Descartado: confirmar antes (un paso más en la acción principal) y no tener
  acción (obliga a cambiar ítem por ítem).
- **Una sola acción del store** (`moveCartItems`) en lugar de llamar N veces a `setCartItemStore`: un solo cambio
  para la persistencia y una sola vuelta de sincronización.
- **Desde 2 productos con EAN:** con uno, la comparación es la lista de comercios del producto que ya existe.
- **Solo listar los faltantes** (elegido); la sugerencia de dónde conseguirlos (combinar 2 comercios) queda para
  otra spec.
- **10 y "Ver N más"**, como `NearbyStores`.
- **Sin las sucursales con 0 productos**, contadas en el pie.
- **Todos los ítems con EAN, también los que ya tienen comercio:** la pregunta es dónde conviene el carrito entero,
  no solo lo que está en "Sin comercio".

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Carritos grandes: 40 sucursales × muchos EAN | `getNearbyPrices` pide de a 20 EAN, con caché por EAN + sucursal; cambiar de radio solo pide lo que falta |
| La sucursal informa un precio viejo | Pie con la fecha de los datos, en ámbar con más de 7 días (como `NearbyStores`) |
| Falla la consulta de precios cercanos | Se cae al modo cadenas, sin mensaje de error (misma regla de la spec 15) |
| "Pasar todo" sin querer | El aviso dice cuántos productos pasaron; "Cambiar comercio" vuelve cada uno atrás |

## Qué **no** entra en esta spec

- Combinar dos comercios para conseguir los faltantes.
- Precios cargados a mano como opción (spec 26).
- Promociones de las cadenas.
- Comparar compras pasadas contra las cadenas.
- Otros órdenes o filtros de la lista.
