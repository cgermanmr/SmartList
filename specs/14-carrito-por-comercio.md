# SPEC 14 — Carrito por comercio

> **Estado:** Aprobado
> **Depende de:** [SPEC 06](06-migracion-nextjs-vercel.md)
> **Fecha:** 2026-11-15
> **Objetivo:** Que cada producto del carrito pueda tener su comercio, ver el carrito agrupado por comercio y cerrar la compra de cada comercio por separado, para salir a comprar y visitar cada local.

## Por qué existe esta spec

Hoy el carrito es una sola lista y el comercio se elige al final, uno para toda la compra ("comercio único"); si
no se marca, los precios se registran con barrio `Sin especificar`. No sirve para el uso real: comprar los
pañales en un local, la leche en otro y la verdura en un tercero.

Responde además la pregunta abierta del [feature 02](../docs/features/02-comparacion-por-comercio.md): el
comercio **puede variar por ítem**.

## Alcance

**Incluye:**

- Comercio opcional en cada ítem del carrito (`CartItem.store`).
- Carrito agrupado por comercio, con subtotal por grupo y total general.
- Asignar o cambiar el comercio de un ítem desde el carrito.
- Checkout **por comercio**: cada grupo se confirma por separado y genera su propia compra.
- "Repetir compra" conserva el comercio de la compra original.

**Fuera de alcance:**

- Elegir el comercio desde la búsqueda con precios y distancia (spec 15).
- Mapa y recorrido (spec 16).
- Catálogo de comercios normalizado (`Store` con `id`, feature 02): el comercio sigue viajando dentro del ítem.
- Marcar ítems como "ya comprado" sin cerrar la compra.

## Modelo de datos

```typescript
// src/lib/models.ts
interface StoreRef {
  name: string;        // "Coto", "Carrefour Market"
  barrio?: string;     // barrio o localidad
  address?: string;    // "Av Rivadavia 5000"
  sepaId?: string;     // id de sepa_sucursales ('10-1-123') si viene del SEPA (spec 15)
  lat?: number;
  lng?: number;
}

interface CartItem {
  // ...
  store?: StoreRef;    // sin store → grupo "Sin comercio"
}
```

`Purchase` y `Price` no cambian: ya tienen `barrio` y `store` como texto. La clave `preciolocal_cart` conserva su
formato: los ítems guardados antes no tienen `store` y caen en "Sin comercio". Sin migración.

Funciones puras nuevas en `src/lib/store.ts` (con tests):

```typescript
/** Clave del comercio: sepaId si existe; si no, nombre + barrio sin mayúsculas ni espacios de más. '' sin comercio */
export function storeKey(store?: StoreRef): string;
/** Grupos en el orden en que se agregó el primer ítem de cada comercio; "Sin comercio" al final */
export function groupCartByStore(cart: CartItem[]): { key: string; store?: StoreRef; items: CartItem[]; total: number }[];
/** Comercios distintos ya usados en el carrito (para el selector) */
export function getCartStores(cart: CartItem[]): StoreRef[];
```

Acciones nuevas o modificadas:

```typescript
setCartItemStore: (itemId: string, store?: StoreRef, price?: number) => void;
removeCartItems: (itemIds: string[]) => void;       // el checkout de un grupo saca solo sus ítems
addToCart: (item: CartItem) => void;                // ver regla "un producto, un comercio"
```

## Reglas

- **Un producto, un comercio.** Un producto está una sola vez en el carrito. `addToCart` con un producto que ya
  está: suma 1 a la cantidad; si el ítem nuevo trae `store`, el ítem existente pasa a ese comercio y a ese precio.
- **"Coto" y " coto" son el mismo comercio** dentro del carrito (`storeKey` normaliza); se muestra el nombre del
  primer ítem del grupo.
- **Cambiar comercio** no toca el precio, salvo que se pase `price` (lo usa la spec 15 al elegir una sucursal con
  precio conocido).
- **Checkout por grupo.** Confirmar un grupo:
  1. guarda un `Purchase` con los ítems del grupo, `store = name`, `barrio = barrio ?? 'Sin especificar'`, el medio
     de pago elegido y el total del grupo;
  2. registra un `Price` por ítem con ese barrio y comercio;
  3. saca del carrito solo esos ítems. Los demás grupos quedan intactos.
- **Grupo "Sin comercio":** al confirmarlo se puede escribir barrio y comercio (los dos opcionales), que reemplazan
  al checkbox "comercio único" de hoy. Sin datos, se registra `Sin especificar` como hoy.
- **Repetir compra** (`loadPurchaseToCart`): si la compra tiene `store`, cada ítem cargado lleva
  `{ name: store, barrio }`. Al combinar, un ítem que ya estaba conserva su comercio.
- **Total del header** (`CartSummary`): sigue siendo el total de todo el carrito.
- El badge contra la última compra (`getLastPurchasedPrice`) no cambia.

## UI/UX

- **Carrito** (`/cart`): una tarjeta por comercio.
  - Encabezado: nombre, línea gris con dirección o barrio si existen, cantidad de ítems y subtotal.
  - Ítems como hoy (cantidad, precio, quitar, badge). Debajo de cada uno, link chico **"Cambiar comercio"**.
  - Pie de la tarjeta: botón **"Comprar en <comercio>"** (`btn-primary`) que abre el paso de medio de pago de ese
    grupo. En "Sin comercio" el botón dice "Registrar compra".
- **Cambiar comercio:** `<dialog>` nativo (como `SepaLinkDialog`) con la lista de comercios ya usados en el
  carrito, "Sin comercio" y un formulario "Otro comercio" (nombre requerido, barrio opcional).
- **Un solo grupo:** se ve igual que hoy, con el encabezado del comercio arriba. Sin ítems: el mensaje vacío actual.
- **Pie de la página:** "Total: $X en N comercios" y "Vaciar carrito" (vacía todo, con `confirm` como hoy).
- 375 px: el encabezado del grupo corta el nombre con `truncate`; el subtotal no se parte.
- Diseño de las tarjetas con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Modelo y lógica pura + tests:** `StoreRef`, `storeKey`, `groupCartByStore`, `getCartStores`.
2. **Acciones + tests:** `addToCart` (un producto, un comercio), `setCartItemStore`, `removeCartItems`,
   `loadPurchaseToCart` con comercio.
3. **Carrito agrupado** y diálogo "Cambiar comercio". Verificar: criterios de agrupado.
4. **Checkout por grupo.** Verificar: con 2 comercios, confirmar uno deja el otro en el carrito y crea una compra
   y sus precios con el comercio correcto.
5. **Historial:** sin cambios de código; verificar que cada compra muestra su comercio y que "Repetir" lo conserva.
6. **Documentación.** `CLAUDE.md` (modelo, carrito, checkout) y feature 02.

## Criterios de aceptación

- [ ] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.
- [ ] Un carrito guardado antes de esta spec abre sin errores, con todos los ítems en "Sin comercio".
- [ ] Con ítems en 3 comercios se ven 3 tarjetas con su subtotal, y la suma coincide con el total del header.
- [ ] "Cambiar comercio" mueve el ítem de tarjeta sin cambiar cantidad ni precio.
- [ ] "Coto" y " coto" quedan en el mismo grupo.
- [ ] Confirmar la compra de un comercio crea **una** compra con solo sus ítems, registra sus precios con ese barrio y comercio, y deja los demás grupos en el carrito.
- [ ] Confirmar "Sin comercio" sin completar nada registra `Sin especificar`, como hoy.
- [ ] Agregar desde Buscar un producto que ya está en el carrito suma cantidad y no crea otra línea.
- [ ] "Repetir" una compra hecha en un comercio carga los ítems en ese comercio.
- [ ] Recargar la página conserva los comercios de cada ítem.
- [ ] En 375 px no hay scroll horizontal.

## Decisiones

- **Sí:** el comercio dentro del ítem (`StoreRef`), no un catálogo con `storeId`. No hace falta migrar nada y el catálogo normalizado del feature 02 se puede sumar después generándolo desde estos datos.
- **Sí:** un producto, un comercio. Es una lista para salir a comprar: cada cosa se compra en un lugar. Permitir el mismo producto en dos comercios duplica líneas en Buscar y en "Repetir" sin un caso de uso claro.
- **Sí:** una compra por comercio. `Purchase` ya tiene un solo `store`; el historial y la comparación por comercio (feature 02) quedan correctos sin tocar el modelo.
- **Sí:** quitar el checkbox "comercio único". El agrupado lo reemplaza y el caso "todo en un comercio" es un solo grupo.
- **No:** pagar todos los comercios juntos. Son compras distintas, en momentos y con medios de pago distintos.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Quien compra todo en un lugar siente más pasos | Con un solo grupo el flujo tiene los mismos dos pasos de hoy |
| Compras a medio cerrar (un comercio sí, otro no) | Es el comportamiento buscado: lo no comprado queda en el carrito |
| Nombres casi iguales ("Coto" / "Coto Caballito") quedan en grupos distintos | El selector ofrece primero los comercios ya usados; el catálogo normalizado queda para el feature 02 |

## Lo que **no** incluye esta spec

- Precios y distancia de cada comercio (spec 15).
- Mapa y recorrido (spec 16).
- Catálogo de comercios normalizado.
- Marcar ítems como comprados.
