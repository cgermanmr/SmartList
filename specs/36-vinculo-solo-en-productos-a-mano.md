# SPEC 36 — Cambiar y quitar el vínculo solo en los productos cargados a mano

> **Estado:** Aprobada
> **Depende de:** [SPEC 10](10-productos-con-codigo-de-barras.md), [SPEC 18](18-agregar-al-carrito-sin-alta.md), [SPEC 21](21-cuenta-y-sincronizacion.md), [SPEC 26](26-cargar-precio-en-el-comercio.md), [SPEC 31](31-compartir-carrito-por-whatsapp.md), [SPEC 33](33-eliminar-producto.md), [SPEC 34](34-cargar-producto-a-mano.md)
> **Fecha:** 2026-11-26
> **Objetivo:** Guardar en cada producto si salió de Precios Claros o se cargó a mano, y mostrar **Cambiar vínculo** y **Quitar vínculo** en su detalle solo en los cargados a mano.

## Por qué existe esta spec

Un producto creado desde el catálogo (Buscar, el lector, Cargar precio, un carrito compartido) **es** el producto de
Precios Claros: su nombre, marca, presentación y código salen de ahí. Cambiarle el vínculo lo convierte en otro producto
con el nombre del anterior; quitárselo lo deja sin precio de referencia, sin comercios cercanos ni imagen. Esas opciones
solo tienen sentido para un producto que la persona cargó a mano y después vinculó, o que vinculó mal.

Hoy `Product` no guarda de dónde salió: uno del catálogo (`productFromSepa`) y uno cargado a mano con código
(`productFromForm`) quedan iguales.

## Alcance

**Incluye:**

- Campo nuevo `Product.origin` (`'sepa'` o `'manual'`), que se guarda al crear cada producto.
- Migración que escribe el origen de los productos que no lo tienen: con código de barras y sin categoría, `'sepa'`; si
  no, `'manual'`. Al hidratar y al bajar registros de la cuenta.
- Detalle del producto: sin **Cambiar vínculo** ni **Quitar vínculo** en los de origen `'sepa'`.
- Eliminar producto (spec 33): motivo propio para los de origen `'sepa'`.

**Fuera de alcance:**

- Una etiqueta o aviso "Producto de Precios Claros" en el detalle.
- Mostrar el origen en Buscar, el carrito, el historial u otras pantallas.
- Cambiar el origen a mano o pasar un producto de un origen al otro.
- Editar nombre, marca, presentación o categoría de un producto ya creado.
- Cambios en la base (`user_records` guarda el producto entero en `data`).
- Cambios en **Vincular con Precios Claros**: sigue igual para todo producto sin código.

## Reglas

### El origen de un producto nuevo

| Dónde se crea | Origen |
|---|---|
| `productFromSepa`: Buscar (catálogo, comercios cercanos), oferta del lector, Cargar precio con un resultado de Precios Claros o **Usar este producto**, carrito compartido con el EAN en el catálogo | `'sepa'` |
| Agregar producto con el formulario completado desde el catálogo (buscador, lector o `?tab=producto&ean=…` encontrado) y **el mismo EAN** al guardar | `'sepa'` |
| Agregar producto sin completar desde el catálogo, o con el EAN cambiado o borrado después de completarlo | `'manual'` |
| Cargar precio, formulario del producto nuevo (spec 34), aunque el código esté en Precios Claros | `'manual'` |
| Carrito compartido sin EAN o con un EAN que no está en el catálogo (o si falló la consulta) | `'manual'` |
| Repetir compra que vuelve a crear un producto que no existe (spec 33) | `'manual'` |

- En Agregar producto, el EAN de referencia es el del **último** producto del catálogo que completó el formulario. Se
  compara el GTIN-13 que se guarda (`checkEan`) con ese EAN. Elegir otro resultado lo reemplaza; vaciar el formulario
  al guardar lo olvida.
- **Vincular**, **Cambiar vínculo** y **Quitar vínculo** no cambian el origen. Un producto cargado a mano y vinculado
  después sigue siendo `'manual'` y conserva las dos opciones.
- `dedupeByEan` (spec 21) conserva el producto de `id` menor con su origen, sin mezclarlo con el del otro.

### Productos sin origen (migración)

- `inferOrigin(product)`: `'sepa'` si tiene `ean` y no tiene `category`; si no, `'manual'`.
- `withOrigins(products)` aplica `inferOrigin` solo a los productos sin `origin` y devuelve **el mismo array** si no
  cambió ninguno (la persistencia y la sincronización comparan por referencia).
- **Al hidratar:** `hydrate` carga como hoy y, si `withOrigins` cambió algo, hace un segundo `set` con los productos
  migrados. Ese `set` pasa por la suscripción de persistencia: se guarda en `preciolocal_products` y, si el teléfono
  tiene cuenta (`preciolocal_sync.userId`), se encola como cualquier cambio.
- **Al bajar de la cuenta:** `applyRows` aplica `withOrigins` después de `dedupeByEan` y antes de `dedupeCart`. Lo que
  cambie se encola con el resto de `changesToRecords`. Así un producto sin origen que llega de un dispositivo con una
  versión anterior queda migrado y sube con su origen.
- Una vez escrito, el origen no se vuelve a deducir: un producto `'sepa'` al que después se le agregue una categoría
  sigue siendo `'sepa'`.
- Un producto sin origen que llegara a la UI sin pasar por la migración se trata como `'manual'` (`isFromSepa` es
  `origin === 'sepa'`).

### Detalle del producto

- Con Supabase y sin `ean`: **Vincular con Precios Claros**, como hoy.
- Con `ean` y origen `'manual'`: **Cambiar vínculo** y **Quitar vínculo**, como hoy.
- Con `ean` y origen `'sepa'`: ninguno de los dos botones ni el contenedor de la fila; la línea "Marca · 500 g · EAN …"
  sigue igual. `SepaLinkDialog` no se monta.

### Eliminar producto

- `deleteBlockedReason` recibe `fromSepa`. Orden de los motivos:
  1. Con compras: el de las compras, como hoy.
  2. Origen `'sepa'`: "No se puede eliminar: es un producto de Precios Claros." (con Supabase o sin él).
  3. Con código y origen `'manual'`: los textos de hoy ("… Quitá el vínculo primero." con Supabase; "… tiene código de
     barras." sin él).

## Modelo de datos

```ts
// src/lib/models.ts
export type ProductOrigin = 'sepa' | 'manual';

interface Product {
  // … campos de hoy
  origin?: ProductOrigin;  // spec 36: 'sepa' si salió del catálogo; opcional solo para los guardados antes
}
```

```ts
// src/lib/product-form.ts
export function inferOrigin(product: Product): ProductOrigin;     // ean y sin category → 'sepa'
export function withOrigins(products: Product[]): Product[];      // mismo array si no cambió nada
export function isFromSepa(product: Product): boolean;            // origin === 'sepa'
export function productFromForm(form: ProductForm, id: string, ean?: string,
  origin?: ProductOrigin): Product;                              // por defecto 'manual'
// productFromSepa agrega origin: 'sepa'
```

- Ninguna clave nueva de `localStorage`. `preciolocal_products` guarda el campo dentro de cada producto.
- `user_records.data` lleva el campo: sin migración en la base. Una versión anterior de la app lo ignora y, si edita el
  producto, lo conserva solo si lo copia con spread (las acciones de `store.ts` lo hacen).

## UI/UX

- Producto de Precios Claros: el detalle pasa de "Cambiar vínculo · Quitar vínculo" a no tener esa fila; lo siguiente
  (estadísticas, referencia) sube.
- Eliminar producto deshabilitado con el motivo "No se puede eliminar: es un producto de Precios Claros." en
  `aria-describedby`, como el resto de los motivos de la spec 33.
- Ningún texto nuevo más.

## Plan de implementación

1. **Modelo y funciones (TDD):** `ProductOrigin` y `Product.origin` en `models.ts`; `inferOrigin`, `withOrigins`,
   `isFromSepa`, `productFromSepa` con `'sepa'` y `productFromForm` con `origin` en `product-form.ts`, con tests:
   las cuatro combinaciones de `ean` y `category`, `withOrigins` devuelve el mismo array sin cambios y no toca un
   origen ya escrito.
   **Verificar:** `npm test`.
2. **Creación (TDD donde es puro):** `resolvePriceProduct` (manual → `'manual'`), `newProduct` de `shared-cart.ts`
   (sin catálogo → `'manual'`), `loadPurchaseToCart` (recreado → `'manual'`) y `addSepaToCart` (por `productFromSepa`),
   con sus tests. `UploadForm.tsx` guarda el EAN del último producto del catálogo que completó el formulario y pasa
   `'sepa'` o `'manual'` a `productFromForm`.
   **Verificar:** `npm test`; en el navegador, Agregar producto con un resultado elegido, con el código cambiado y sin
   resultado.
3. **Migración (TDD):** segundo `set` en `hydrate` (`store.ts`) y `withOrigins` en `applyRows` (`sync-engine.ts`).
   Tests: productos viejos quedan migrados y guardados; sin productos viejos no hay `set`; las filas bajadas sin origen
   se migran y se encolan; una segunda vuelta con las mismas filas no encola nada.
   **Verificar:** `npm test`.
4. **Detalle y eliminar:** `ProductDetail.tsx` oculta la fila con `isFromSepa`; `deleteBlockedReason` con `fromSepa` y
   sus tests; `DeleteProduct.tsx` lo pasa.
   **Verificar:** en el navegador, un producto agregado desde Buscar (sin botones, motivo nuevo) y uno cargado a mano
   y vinculado (con los dos botones).
5. **Docs:** `CLAUDE.md` (modelo `Product`, Arquitectura, Detalle de producto, Estado Actual) y
   `docs/pruebas-pendientes.md` con la prueba de dos dispositivos.

**A revisar a mano (sin test automático):** con una cuenta de prueba, abrir la versión nueva con productos viejos y
ver en `user_records` que sus filas suben con `origin`; y en un segundo dispositivo, que bajan con el mismo origen.

## Criterios de aceptación

- [ ] Un producto agregado al carrito desde la sección En Precios Claros de Buscar se guarda con `origin: 'sepa'`.
- [ ] Un producto creado en Cargar precio con un resultado de Precios Claros se guarda con `origin: 'sepa'`.
- [ ] Un producto creado con el formulario de Cargar precio (spec 34) se guarda con `origin: 'manual'`, también con un
  código que está en Precios Claros.
- [ ] En Agregar producto, elegir un resultado de Precios Claros y guardar sin tocar el código crea un producto
  `'sepa'`; cambiar o borrar el código antes de guardar crea uno `'manual'`.
- [ ] Un carrito compartido crea `'sepa'` los productos que encuentra en el catálogo y `'manual'` los demás.
- [ ] En el detalle de un producto `'sepa'` no aparecen **Cambiar vínculo** ni **Quitar vínculo**.
- [ ] En el detalle de un producto `'manual'` con código aparecen **Cambiar vínculo** y **Quitar vínculo**, y siguen
  funcionando como antes.
- [ ] Vincular un producto `'manual'` no cambia su origen y después muestra los dos botones.
- [ ] Al abrir la app con productos guardados sin `origin`, los que tienen código y no tienen categoría quedan
  `'sepa'` y los demás `'manual'`, guardados en `preciolocal_products`.
- [ ] Con cuenta, esa migración se encola y sube; una segunda apertura no encola nada.
- [ ] Un producto sin `origin` que baja de la cuenta queda migrado y se vuelve a subir con su origen.
- [ ] Un producto `'sepa'` sin compras muestra **Eliminar producto** deshabilitado con "No se puede eliminar: es un
  producto de Precios Claros."
- [ ] Un producto `'manual'` con código sigue con "… Quitá el vínculo primero." (con Supabase).
- [ ] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.

## Decisiones

- **Sí:** campo `origin` en `Product`. Es el único dato que distingue con certeza un producto del catálogo de uno
  cargado a mano con código.
- **No:** deducir el origen siempre al leer. Un producto cargado a mano con código y sin categoría quedaría como del
  catálogo.
- **Sí:** deducir una vez los productos guardados antes (código y sin categoría → `'sepa'`). Es lo que deja hoy
  `productFromSepa`; los productos viejos también pierden las opciones si vinieron del catálogo.
- **Sí:** la migración escribe y sube a la cuenta, en lugar de deducirse en cada lectura. Elegido así para que el
  origen quede guardado y viaje igual que en los productos nuevos.
- **Sí:** migrar también en `applyRows`. Sin eso, una fila sin origen bajada de la cuenta (otro dispositivo con la
  versión anterior) pisaría el producto ya migrado.
- **Sí:** guardar `'manual'` explícito en los nuevos (no dejar el campo vacío). Así la migración no confunde un
  producto nuevo cargado a mano con uno viejo.
- **Sí:** en Agregar producto, `'sepa'` solo si el EAN guardado es el del resultado elegido. Editar el nombre o la
  marca no cambia que sea ese producto del catálogo; cambiar el código sí.
- **Sí:** Vincular no cambia el origen. Un producto cargado a mano conserva **Cambiar vínculo** para corregir un
  vínculo equivocado.
- **No:** etiqueta "Producto de Precios Claros" ni botones deshabilitados. La línea de detalles ya muestra el EAN.
- **Sí:** motivo propio al eliminar un producto `'sepa'`. "Quitá el vínculo primero" pediría algo que ya no se puede
  hacer.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un producto viejo cargado a mano, con código y sin categoría, queda `'sepa'` y pierde las opciones | Aceptado al elegir la deducción. No se puede eliminar ni cambiar el vínculo, pero sus datos siguen intactos. |
| Dos dispositivos con versiones distintas: la anterior edita un producto y le borra `origin` | `applyRows` lo vuelve a migrar y lo sube; la deducción da el mismo resultado salvo que la categoría haya cambiado. |
| La migración sube todos los productos viejos de una cuenta en la primera apertura | `pushRecords` sube de a 500 y es una sola vez por dispositivo; los siguientes ya los bajan con origen. |
| Un producto viejo con categoría agregada en un dispositivo y no en otro se deduce distinto en cada uno | Gana el último cambio, como en toda la sincronización (spec 21). |

## Qué **no** entra en esta spec

- Etiqueta o aviso del origen en el detalle u otras pantallas.
- Cambiar el origen a mano.
- Editar los datos de un producto ya creado.
- Cambios en la base o en **Vincular con Precios Claros**.

Cada uno de esos, si llega, va en su propia spec.
