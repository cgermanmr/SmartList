# SPEC 24 — Comercios cercanos en el lector

> **Estado:** Implementada
> **Depende de:** [SPEC 11](11-lector-codigo-de-barras.md), [SPEC 12](12-precio-de-referencia-sepa.md), [SPEC 15](15-precios-y-comercios-cercanos.md), [SPEC 16](16-mapa-y-como-llegar.md), [SPEC 18](18-agregar-al-carrito-sin-alta.md)
> **Fecha:** 2026-11-21
> **Objetivo:** Al leer un código de barras en Buscar, ver en la misma pantalla en qué comercios cercanos está más barato y comparar contra ese precio el que dice la góndola.

## Por qué existe esta spec

Uno de los dos usos principales de la app es **consultar en la góndola**
([feature 08](../docs/features/08-consulta-y-aportes.md)): leer el código y saber si cerca hay un comercio más
barato. Hoy, en la oferta del lector (`ScanOffer`, `src/app/page.tsx`):

- un producto del catálogo que no es propio muestra solo los precios **por cadena** (spec 12), aunque haya
  ubicación;
- un producto propio **sale de Buscar** y abre su detalle, que tiene la tarjeta "Comercios cercanos" pero obliga a
  cambiar de pantalla y volver para leer el siguiente;
- no hay forma de escribir el precio de la góndola para saber si conviene.

Los componentes ya existen (`NearbyLine`, `NearbyStores`, `useNearbyPrices`): la spec los suma a la oferta del
lector.

## Alcance

**Incluye:**

- La oferta del lector de Buscar, con ubicación, muestra los **comercios cercanos**: resumen y los 3 más baratos
  abiertos, con "Ver N más".
- Un código de un producto **propio** deja de abrir el detalle: muestra la misma oferta en Buscar, con "Ver
  detalle" y "Agregar al carrito".
- Campo **"¿Cuánto sale acá?"**: compara el precio de la góndola contra el más barato cercano (o contra la
  referencia sin ubicación) y, en un producto propio, contra lo que se pagó la última vez. No se guarda.
- Con un precio escrito, **"Agregar al carrito"** usa ese precio.
- Sin ubicación, la oferta queda como hoy y suma el aviso "Activá tu ubicación arriba para ver comercios cercanos".

**Fuera de alcance:**

- Guardar el precio de la góndola como precio propio, con su comercio (spec 26).
- Saber en qué comercio está el usuario (por GPS) para cargar el ítem en ese comercio (spec 26).
- El lector de Cargar precio y de Agregar producto (`/upload`): no cambia.
- Un código que no está en el catálogo ni es propio: sigue "Agregar producto" como hoy.
- Un acceso directo al lector fuera de Buscar.

## Reglas

### Qué pasa al leer un código

| Código | Hoy | Con esta spec |
|---|---|---|
| Producto propio | Abre `/product/[id]` | Oferta en Buscar (`status: 'own'`) |
| En el catálogo, no propio | Oferta con precios por cadena | Oferta con comercios cercanos (con ubicación) o por cadena |
| Fuera del catálogo o con error | "Agregar producto" | Sin cambios |

- El producto propio se busca por EAN como hoy (`products.find(p => p.ean === ean)`).
- Escribir en el buscador o leer otro código cierra la oferta (como hoy). La oferta se vuelve a montar con cada
  código (`key={scan.ean}`): el precio escrito no pasa de un producto a otro.

### Comercios cercanos en la oferta

- Precios con un `useNearbyPrices([ean])` propio de la oferta (una llamada, con la caché de `getNearbyPrices`). En
  un producto propio también se pasan sus precios cargados a mano con comercio (`getRecentStorePrices`), al final,
  como en las tarjetas de Buscar.
- `get(ean)`:
  - lista con precios → `NearbyLine` y debajo `NearbyStores` con los **3 más baratos** y "Ver N más" (el botón que
    ya tiene `NearbyStores`). Cada fila con **Agregar** (entra en ese comercio y a ese precio: `addSepaToCart`
    con `at`, o `addToCart` con `store` en un propio) y **Mapa** (spec 16);
  - `[]` → "Sin precio en comercios cercanos" y, si hay referencia, el resumen y "Ver precios por cadena" (como hoy);
  - `'loading'` → "Buscando precios…";
  - `undefined` (sin ubicación, sin comercios en el radio o con error) → como hoy: resumen por cadena y "Ver precios
    por cadena".
- Sin ubicación (`location === null`) y con Supabase, una línea debajo del resumen: "Activá tu ubicación arriba
  para ver comercios cercanos". Con ubicación pero sin comercios en el radio no se agrega nada: la barra de
  ubicación ya muestra su aviso.

### Oferta de un producto propio

- Encabezado: imagen de 48 px (`product.image ?? imágenes.get(ean)`), "Ya tenés <nombre>." y, si tiene precios
  propios, "Último precio $Y · dd/mm" (`getPriceStats(...).current` y la fecha del último).
- Acciones: **Agregar al carrito** (`initialCartPrice` con la referencia si no tiene precio propio; si ya está en
  el carrito, suma 1 y conserva comercio y precio, como hoy) y el link **Ver detalle** a `/product/[id]`.
- El botón espera la referencia como en la spec 18 ("Buscando precio…") solo si no tiene precio propio.

### ¿Cuánto sale acá?

- Campo de monto (`type="number"`, `inputMode="decimal"`, `min="0"`, `step="0.01"`, label "¿Cuánto sale acá?") en
  la oferta de un producto propio o del catálogo. No aparece en "Agregar producto" (código fuera del catálogo).
- Con un monto mayor a 0, debajo, una o dos líneas de comparación (`aria-live="polite"`), de
  `shelfComparison` (`src/lib/shelf-price.ts`):
  1. **Contra los comercios cercanos** (si `get(ean)` es una lista con precios), con el más barato (`prices[0]`):
     - menor → "Más barato que en los comercios cerca" (verde);
     - igual → "Igual que en <cadena> — <distancia>" (azul);
     - mayor → "En <cadena> — <distancia> sale $X menos" (rojo). La distancia lleva "aprox." con localidad.
  2. **Si no hay comercios cercanos con precio**, contra la referencia (spec 12): `referenceLabel(vsReference(…))`
     con los colores de `referenceStatus` (verde debajo, azul en línea, rojo encima).
  3. **Producto propio con precio anterior:** "La última vez pagaste $Y (dd/mm): $X más" (rojo), "…: $X menos"
     (verde) o "La última vez pagaste lo mismo (dd/mm)" (azul).
- Sin nada contra qué comparar: "Sin precios para comparar".
- Monto vacío, 0 o no numérico: sin líneas.
- El monto no se guarda (ni en el store ni en `localStorage`): se pierde al cerrar la oferta.

### Agregar con el precio escrito

- Con un monto mayor a 0, **Agregar al carrito** entra en "Sin comercio" **con ese precio** (no se sabe en qué
  comercio está el usuario). Sin monto, como hoy.
- Si el producto ya está en el carrito, suma 1 y conserva su comercio y su precio (regla de las specs 14 y 18).
- Los "Agregar" por comercio de la lista no cambian: usan el precio de ese comercio.
- No se registra ningún `Price`.

## Modelo de datos

No hay datos persistidos nuevos: ningún formato de `localStorage` cambia.

```typescript
// src/app/page.tsx — resultado del lector
type ScanResult =
  | { ean: string; status: 'loading' | 'missing' | 'error' }
  | { ean: string; status: 'found'; product: SepaProduct }
  | { ean: string; status: 'own'; product: Product };        // nuevo

// src/lib/store.ts — `at.store` pasa a ser opcional: sin comercio entra en "Sin comercio" a ese precio
addSepaToCart: (sepa: SepaProduct, reference?: number, at?: { store?: StoreRef; price: number }) => Product;

// src/components/NearbyStores.tsx — prop nueva
limit?: number;   // filas antes de "Ver N más"; por defecto 10 (VISIBLE_STORES)
```

Función pura nueva, con tests:

```typescript
// src/lib/shelf-price.ts
export type ShelfTone = 'good' | 'same' | 'bad';
export interface ShelfLine { text: string; tone: ShelfTone }

/** Líneas de "¿Cuánto sale acá?": contra el más barato cercano o la referencia, y contra el último precio propio */
export function shelfComparison(input: {
  price: number;
  nearby?: NearbyPrice[];                       // ordenados (sortNearbyPrices); vacío o sin dato → referencia
  approx?: boolean;
  reference?: number;
  last?: { amount: number; date: Date | string };
}): ShelfLine[];
```

## UI/UX

```
┌───────────────────────────────────────┐
│ [img] Ya tenés Yerba Playadito 1 kg.  │
│       Último precio $4.200 · 12/11    │
│ [Agregar al carrito]   Ver detalle    │
│ ───────────────────────────────────── │
│ Desde $3.890 · Día — 600 m            │
│ en 8 comercios cerca                  │
│ ┌ Día — Primera Junta      600 m ───┐ │
│ │ $3.890 Más barato   [Mapa][Agregar]│ │
│ │ Coto — Caballito         800 m    │ │
│ │ $4.050              [Mapa][Agregar]│ │
│ │ …                                 │ │
│ └───────────────────────────────────┘ │
│ Ver 5 más                             │
│ ───────────────────────────────────── │
│ ¿Cuánto sale acá?  [ $ 4.300      ]   │
│ En Día — 600 m sale $410 menos        │
│ La última vez pagaste $4.200 (12/11): │
│ $100 más                              │
└───────────────────────────────────────┘
```

- La oferta conserva el recuadro de hoy (`border-primary-200 bg-primary-50`); los bloques se separan con
  `border-t`.
- El campo "¿Cuánto sale acá?" va al final, con `.input-field` de 16 px (sin zoom en el iPhone) y 44 px de alto.
- Líneas de comparación en `text-green-700`, `text-blue-700` y `text-red-700`, con texto que dice lo mismo sin el
  color ("más", "menos", "igual").
- La región `role="status"` sigue envolviendo solo el encabezado: la lista y las comparaciones van fuera, para no
  leerlas enteras cada vez que cambian (las comparaciones tienen su propio `aria-live`).
- 375 px sin scroll horizontal.
- Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Comparación (TDD)** — `src/lib/shelf-price.ts` con `shelfComparison` y `shelf-price.test.ts`: menor, igual y
   mayor que el más barato cercano (con y sin "aprox."); sin cercanos, contra la referencia en los tres estados;
   último precio más, menos e igual; sin nada → `[]`; monto ≤ 0 → `[]`.
2. **Agregar a un precio sin comercio (TDD)** — `at.store` opcional en `addSepaToCart`, con tests en
   `store.test.ts`: entra en "Sin comercio" al precio pedido; si ya estaba, suma 1 y conserva comercio y precio.
3. **Límite de filas** — prop `limit` en `NearbyStores` (por defecto 10).
4. **Mover la oferta** — `ScanOffer`, `AddToCartButton` y `EditLink` salen de `src/app/page.tsx` a
   `src/components/ScanOffer.tsx` (y `AddToCartButton` / `EditLink`, que también usa Buscar, a
   `src/components/CatalogActions.tsx`), sin cambiar el comportamiento. Verificar: el lector funciona igual que antes.
5. **Comercios cercanos en la oferta** — `useNearbyPrices([ean])` en `ScanOffer`, resumen + 3 abiertos, "Agregar"
   por comercio y "Mapa" (el `BranchMap` de la página, por `onMap`), aviso sin ubicación.
6. **Producto propio** — `status: 'own'` en `scanned`: oferta con "Ya tenés…", último precio, "Agregar al carrito",
   "Ver detalle" y sus precios cargados a mano en la lista.
7. **¿Cuánto sale acá?** — campo, líneas de `shelfComparison` y "Agregar al carrito" con el precio escrito.
8. **Docs** — `CLAUDE.md`: Estructura (archivos nuevos), Funcionalidades → Búsqueda (lector) y Estado Actual;
   `docs/features/08-consulta-y-aportes.md` (spec 24 hecha).

**A revisar (sin test automático):** leer dos códigos seguidos (el precio escrito no pasa al segundo); el mapa
abierto desde la oferta; cambiar el radio en la barra con la oferta abierta; 375 px con nombres largos; el teclado
numérico del celular en "¿Cuánto sale acá?".

## Criterios de aceptación

- [ ] Con ubicación, leer el código de un producto del catálogo muestra "Desde $X · <cadena> — <distancia>", los 3 comercios más baratos y "Ver N más".
- [ ] "Agregar" en un comercio de la oferta deja el producto en el carrito en ese comercio y a ese precio.
- [ ] "Mapa" en un comercio de la oferta abre su mapa.
- [ ] Leer el código de un producto propio no sale de Buscar: muestra "Ya tenés <nombre>", su último precio, "Agregar al carrito", "Ver detalle" y los comercios cercanos.
- [ ] "Ver detalle" abre `/product/[id]` de ese producto.
- [ ] Sin ubicación, la oferta muestra el resumen por cadena, "Ver precios por cadena" y "Activá tu ubicación arriba para ver comercios cercanos".
- [ ] Con un monto en "¿Cuánto sale acá?" mayor que el más barato cercano, aparece "En <cadena> — <distancia> sale $X menos" en rojo; menor, "Más barato que en los comercios cerca" en verde.
- [ ] Sin comercios cercanos con precio, la comparación es contra la referencia ("X % por encima de la referencia").
- [ ] En un producto propio con precios, aparece "La última vez pagaste $Y (dd/mm)" con la diferencia.
- [ ] Con un monto escrito, "Agregar al carrito" deja el producto en "Sin comercio" con ese precio; sin monto, con el precio de siempre.
- [ ] Leer otro código vacía "¿Cuánto sale acá?".
- [ ] Un código fuera del catálogo sigue mostrando "Agregar producto".
- [ ] 375 px sin scroll horizontal; `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.

## Decisiones

- **El producto propio se queda en Buscar** (elegido) en lugar de abrir el detalle: en la góndola se leen varios
  códigos seguidos y cada ida al detalle obliga a volver. El detalle queda a un toque con "Ver detalle".
- **Resumen + 3 abiertos** (elegido): la respuesta ("¿hay más barato cerca?") se ve sin tocar nada. Descartado: un
  desplegable como la fila del catálogo (un toque más) y la lista entera abierta (empuja el campo del precio hacia
  abajo). Se usa el "Ver N más" que ya tiene `NearbyStores`, por consistencia.
- **"¿Cuánto sale acá?" solo compara** (elegido): guardar el precio necesita saber el comercio, que es la spec 26.
  Descartado: guardarlo con barrio y comercio a mano (adelantaría la mitad de la 26 con un formulario que después
  cambia).
- **Con monto escrito, agregar usa ese precio**, en "Sin comercio": es el precio real de la góndola, pero sin GPS
  no se sabe qué comercio es.
- **Comparar contra el último precio propio** en los productos propios: responde "¿subió desde la última vez?",
  que es el objetivo original de la app.
- **Sin ubicación, como hoy + aviso**: la barra de ubicación está justo arriba de la oferta.
- **Un `useNearbyPrices` propio de la oferta** en lugar de sumar el EAN al de la página: la oferta es
  independiente de la búsqueda de texto, y la caché de `getNearbyPrices` evita pedir dos veces lo mismo.
- **"Último precio" en el encabezado del propio** (agregado al escribir la spec): sin precio escrito, es el dato que
  responde "¿está más caro que la última vez?".

## Qué **no** entra en esta spec

- Guardar el precio de la góndola y elegir el comercio por GPS (spec 26).
- Cambios en el lector de `/upload`.
- Un acceso directo al lector fuera de Buscar.
- Cambios para los códigos que no están en el catálogo.
