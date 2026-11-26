# SPEC 33 — Eliminar producto

> **Estado:** Implementada
> **Depende de:** [SPEC 10](10-productos-con-codigo-de-barras.md), [SPEC 21](21-cuenta-y-sincronizacion.md), [SPEC 26](26-cargar-precio-en-el-comercio.md), [SPEC 27](27-fotos-propias.md)
> **Fecha:** 2026-11-24
> **Objetivo:** Eliminar desde su detalle un producto propio sin código de barras que no participa de ninguna compra, junto con sus precios, su foto y su lugar en el carrito.

## Por qué existe esta spec

La app no permite borrar productos (la spec 10 lo dejó afuera). Los de ejemplo de versiones anteriores (Leche 1L, Pan
Frances, Aceite Oliva 500ml…) y los cargados por error quedan para siempre en Buscar.

## Alcance

**Incluye:**

- **Eliminar producto** al pie del detalle, con confirmación.
- **Solo los cargados a mano y los de ejemplo**, es decir, los que no tienen código de barras.
- Un producto que está en alguna compra o que tiene código de barras **no se puede eliminar**: botón deshabilitado con el
  motivo.
- Con el producto se borran sus precios, su foto propia y su ítem del carrito.
- Con cuenta, se elimina en todos los dispositivos; si otro lo usó sin señal, **el producto vuelve**.
- **Repetir compra** vuelve a crear un producto que ya no existe.

**Fuera de alcance:**

- Eliminar productos con código de barras, del catálogo de Precios Claros o de otros integrantes del grupo.
- Eliminar precios sueltos o compras.
- Eliminar desde Buscar, elegir varios, o borrar todos los de ejemplo de una vez.
- Deshacer, papelera o archivar un producto.
- Editar el nombre o la categoría.

## Reglas

### Cuándo se puede

- Se puede si el producto **no tiene código de barras** (`ean`) y **ninguna compra** del historial tiene un ítem con su
  `productId`. Los precios, la foto y el carrito no lo impiden.
- Los de ejemplo entran por la misma regla: no tienen código. Uno de ejemplo vinculado después con Precios Claros, no.
- Con **Quitar vínculo** un producto deja de tener código y pasa a poder eliminarse.
- El motivo, uno solo (con los dos, el de las compras: quitar el vínculo no alcanzaría):

| Motivo | Texto |
|---|---|
| Está en compras (se cuentan compras, no ítems) | "No se puede eliminar: está en 1 compra de tu historial." / "… en 3 compras de tu historial." |
| Tiene código, con Supabase | "No se puede eliminar: está vinculado con Precios Claros o tiene código de barras. Quitá el vínculo primero." |
| Tiene código, sin Supabase (no hay **Quitar vínculo**) | "No se puede eliminar: tiene código de barras." |

- El botón también está deshabilitado mientras se prepara o se guarda una foto en el detalle.

### Qué se borra

| Dato | Al eliminar |
|---|---|
| Producto | Se borra |
| Precios con ese `productId` | Se borran, con su comercio |
| Ítem del carrito | Se quita; los demás no cambian |
| Foto propia | Se borra del teléfono y, si estaba en la cuenta, del bucket en la próxima sincronización (`discardPhoto`) |
| Compras, gastos y calculadora | No cambian |

- Producto, precios e ítem salen **en un solo `set`** del store: un cambio para la persistencia y la sincronización. La
  foto, después; si falla, el producto queda eliminado igual.
- El grupo no interviene: solo ve precios de productos con código de barras.

### La confirmación

- `ConfirmDialog` en rojo. Título: **"¿Eliminar <nombre>?"**. Botón: **"Eliminar"**.
- El mensaje junta solo lo que corresponde, en este orden:

| Si | Texto |
|---|---|
| Tiene precios o foto | "Se borran también sus 3 precios y tu foto." / "Se borran también su precio y tu foto." / "Se borran también sus 3 precios." / "Se borra también su precio." / "Se borra también tu foto." |
| Está en el carrito | "Se quita del carrito." |
| Hay sesión | "Se elimina en todos tus dispositivos." |
| Siempre | "No se puede deshacer." |

- Al confirmar: va a Buscar **reemplazando** el detalle en el historial del navegador (Atrás no vuelve a él), con el aviso
  fijo **"<nombre> eliminado"** (3 s). No se ve "Producto no encontrado" en el camino.
- Cancelar, Escape o tocar afuera no cambia nada y devuelve el foco al botón.

### Otras pantallas

- **Cargar precio** con ese producto elegido (la página sigue montada): vuelve a "sin producto"; el comercio y el monto
  quedan.
- **Repetir compra:** un ítem cuyo producto no existe lo vuelve a crear con el mismo `id` y el nombre guardado en la
  compra (sin código, marca, categoría ni foto), en el mismo `set` que el carrito. Solo puede pasar con la compra de otro
  dispositivo que no llegó a restaurarlo.

### Con cuenta y dos dispositivos

- El borrado viaja como los demás (`deleted`, con `data` nulo). Los **borrados de productos se suben al final** de la
  cola: si se corta entre tandas, nadie ve un producto borrado con sus precios todavía vivos.
- **El producto vuelve:** si al bajar cambios se borra un producto que este dispositivo tenía y, después de juntar todo,
  todavía lo usa un **precio, un ítem del carrito o una compra**, se restaura.
  - Vuelve como estaba en este dispositivo (nombre, marca, presentación, categoría y, si todavía no bajó que se le quitó
    el vínculo, código), **sin la foto**, que ya se mandó a borrar del bucket.
  - Solo con lo que el otro dispositivo no conocía: los precios y el ítem que sí borró no vuelven.
  - Los precios de ejemplo (`id` 1 a 3) no cuentan como uso.
  - Se encola con una fecha **posterior a la del borrado**, aunque el reloj de este dispositivo atrase: con una anterior,
    la base conservaría el borrado y se restauraría en cada vuelta.
  - La restauración va **antes** de `dedupeByEan`: si mientras tanto otro producto tiene ese código, se unen como siempre.
- Editar el producto en otro dispositivo **después** del borrado también lo trae de vuelta (gana el último, spec 21), sin
  sus precios.

## Modelo de datos

Sin estructuras guardadas nuevas, sin claves nuevas de `localStorage` y sin migraciones.

```typescript
// src/lib/store.ts — acciones y consultas
/** Saca el producto, sus precios y su ítem del carrito en un solo cambio. Con código o con compras no hace nada y
    devuelve false */
deleteProduct: (id: string) => boolean;
/** Aviso para mostrar en la próxima página (no se guarda) */
flash: string | null;
setFlash: (text: string | null) => void;

/** Cantidad de compras que tienen el producto */
export function purchasesWithProduct(purchases: Purchase[], productId: string): number;

// src/lib/product-delete.ts (puro)
/** "No se puede eliminar: está en 2 compras de tu historial."; null si se puede */
export function deleteBlockedReason(info: { purchases: number; ean: boolean; canUnlink: boolean }): string | null;
export function deleteMessage(info: {
  prices: number; photo: boolean; inCart: boolean; signedIn: boolean;
}): string;

// src/lib/sync.ts (puro)
/** Restaura los productos que `rows` borró y que `merged` todavía usa; sin ninguno devuelve el mismo estado */
export function restoreUsedProducts(local: SyncData, merged: SyncData, rows: RemoteRow[]):
  { data: SyncData; restoredIds: string[] };
/** Fecha para encolarlos: `now` o 1 ms después del borrado más nuevo, lo que sea mayor */
export function restoreTime(restoredIds: string[], rows: RemoteRow[], now: string): string;
/** Los borrados de productos, al final; el resto conserva su orden */
export function pushOrder(records: SyncRecord[]): SyncRecord[];
```

## UI/UX

Al pie del detalle, debajo del historial y de "Agregar al Carrito":

```
Se puede                            No se puede
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ [x] Eliminar producto        │    │ [x] Eliminar producto (gris) │
└──────────────────────────────┘    │ No se puede eliminar: está   │
                                    │ en 2 compras de tu historial.│
                                    └──────────────────────────────┘
```

- Botón de 44 px, texto rojo sobre blanco con borde, ícono `Trash2` con `aria-hidden`; lejos de los botones de uso
  frecuente. El motivo va en `gray-500` y es su `aria-describedby`.
- Nombre largo: se parte en el diálogo y en el aviso.
- Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Store y textos (TDD):** `deleteProduct`, `purchasesWithProduct` y `flash` en `src/lib/store.ts`, y
   `src/lib/product-delete.ts`, con sus tests: precios e ítems de otros productos intactos, un solo `set`, con
   compras o con código no cambia nada, y todas las combinaciones del motivo y del mensaje.
   **Verificar:** `npm test`.
2. **Sincronización (TDD):** `restoreUsedProducts`, `restoreTime` y `pushOrder` en `src/lib/sync.ts`; `sync-engine.ts` usa
   las dos primeras en `applyRows` (entre `mergeRemote` y `dedupeByEan`) y `pushOrder` antes de subir. Tests: usado por
   precio, carrito o compra; sin uso; solo precios de ejemplo; sin foto; con código ya tomado por otro producto; reloj
   atrasado; aplicar dos veces las mismas filas.
   **Verificar:** `npm test`, con el caso de dos dispositivos en los tests del motor: la segunda vuelta no encola nada.
3. **Repetir compra (TDD):** `loadPurchaseToCart` vuelve a crear los productos que faltan, al combinar y al reemplazar.
   **Verificar:** `npm test`; en el navegador, una compra con un `productId` inexistente queda en el carrito con su
   producto en Buscar.
4. **Detalle:** `src/components/DeleteProduct.tsx` (botón, motivo, `ConfirmDialog`, foto y navegación) en
   `ProductDetail.tsx`, y el aviso en `src/app/page.tsx`, que consume `flash`.
   **Verificar:** eliminar un producto con precios, foto y en el carrito; uno de ejemplo; uno con compras y uno
   con código (no se puede); el de código después de **Quitar vínculo**; cancelar; Atrás después de eliminar.
5. **Cargar precio:** `PriceForm.tsx` suelta un producto propio que ya no existe.
   **Verificar:** elegirlo, eliminarlo desde su detalle y volver a Cargar.
6. **Docs:** `CLAUDE.md` (Estructura, Arquitectura, Detalle, Historial, Estado Actual), `/privacidad` ("Eliminar un
   producto borra sus precios y su foto") y `docs/pruebas-pendientes.md` con las pruebas en dos dispositivos.

**A revisar a mano (sin test automático):** con una cuenta de prueba y dos dispositivos, eliminar en uno y ver que
desaparece en el otro; eliminar en uno mientras el otro, sin señal, le carga un precio; y que la foto ya no esté en el
bucket.

## Criterios de aceptación

- [ ] Eliminar Leche 1L, sin compras, la saca de Buscar junto con sus precios, y no vuelve al recargar.
- [ ] Con precios, foto y en el carrito, la confirmación nombra los tres, y después de eliminar no queda ninguno (la foto
      tampoco en IndexedDB).
- [ ] Los demás productos, precios e ítems del carrito, las compras, los gastos y la calculadora no cambian.
- [ ] Un producto en 2 compras tiene el botón deshabilitado y "No se puede eliminar: está en 2 compras de tu historial."
- [ ] Cancelar o Escape no cambia nada y devuelve el foco al botón.
- [ ] Al eliminar se ve Buscar con "<nombre> eliminado"; Atrás no vuelve al detalle; no se ve "Producto no encontrado".
- [ ] Un producto con código de barras (agregado del catálogo, vinculado o con el código escrito) tiene el botón
      deshabilitado y el motivo; después de **Quitar vínculo** se puede eliminar.
- [ ] Con código y en una compra, el motivo es el de la compra.
- [ ] En Cargar precio, un producto elegido y después eliminado deja de estar elegido; el comercio y el monto quedan.
- [ ] Sin sesión, la confirmación no habla de dispositivos.
- [ ] Con cuenta, se elimina en el otro dispositivo, y la foto deja de estar en el bucket.
- [ ] Si el otro dispositivo, sin señal, le cargó un precio, lo cambió en el carrito o lo compró, el producto vuelve en
      los dos sin los precios borrados, y la sincronización termina (no queda repitiéndose).
- [ ] Repetir una compra con un producto inexistente lo crea con su nombre y lo carga en el carrito.
- [ ] Teclado y lector de pantalla: el motivo se puede leer cuando el botón está deshabilitado.
- [ ] 320 y 375 px sin scroll horizontal; `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.

## Decisiones

- **Solo los cargados a mano y los de ejemplo** (elegido por el usuario): los que no tienen código de barras, que es lo
  único que hoy los distingue (la app no guarda cómo se creó cada producto). Uno cargado a mano con su código escrito
  cuenta como "con código". Descartado: todos los de la lista, y solo los cargados a mano (dejaba afuera a Leche 1L).
- **Se puede después de Quitar vínculo:** un producto del catálogo agregado por error tiene salida, en dos pasos.
- **Solo sin compras** (elegido por el usuario): el historial siempre puede mostrar su producto. Descartado: eliminar
  también con compras.
- **Los precios se borran con el producto** (elegido por el usuario): sin él no hay pantalla donde verlos. Descartado:
  impedirlo si tiene precios; Leche 1L y Pan Frances traen precios de ejemplo.
- **Se quita del carrito** (elegido por el usuario). Descartado: impedirlo.
- **Botón deshabilitado con el motivo** (elegido por el usuario). Descartado: esconderlo.
- **Confirmación y no Deshacer** (elegido por el usuario): no hay que postergar el borrado de la foto y de la cuenta.
- **Solo en el detalle** (elegido por el usuario). Descartado: un ícono en Buscar y un botón para los de ejemplo.
- **El producto vuelve si otro dispositivo lo usó** (elegido por el usuario): no queda un precio o una compra sin
  producto. Descartado: descartar lo que llega, o no hacer nada.
- **Vuelve con todos sus datos, no solo con el nombre:** la opción elegida decía "con su nombre y sin código", pero quien
  lo restaura es el dispositivo que todavía lo tiene entero, así que no hace falta perder nada. Solo pierde la foto.
- **Repetir vuelve a crear el producto** (elegido por el usuario), con el mismo `id` para que la compra lo siga
  encontrando.
- **`flash` en el store y no en la URL:** el aviso no reaparece al recargar ni al compartir la dirección.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Restaurar en cada vuelta (bucle) | `restoreTime` siempre posterior al borrado; test de que la segunda vuelta no encola nada |
| Restaurar por error, al bajar un borrado a medias | Borrados de productos al final de la subida (`pushOrder`) |
| El dispositivo que usó el producto no vuelve a conectarse y queda un precio sin producto | Se acepta: no se ve en ninguna pantalla; una compra se arregla con Repetir |
| Otro dispositivo con una versión anterior abierta, que no restaura | Recargar; lo que quede sin producto es como el caso anterior |
| Borrar algo que se quería | La confirmación nombra lo que se pierde |

## Qué **no** entra en esta spec

- Eliminar productos con código de barras.
- Eliminar precios sueltos o compras.
- Eliminar varios, o los de ejemplo de una vez.
- Deshacer, papelera o archivar.
- Editar nombre o categoría.

Cada una, si llega, va en su propia spec.
