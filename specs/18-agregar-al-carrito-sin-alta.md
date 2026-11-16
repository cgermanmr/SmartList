# SPEC 18 — Agregar al carrito sin dar de alta el producto

> **Estado:** Aprobado
> **Depende de:** [SPEC 10](10-productos-con-codigo-de-barras.md), [SPEC 12](12-precio-de-referencia-sepa.md), [SPEC 14](14-carrito-por-comercio.md)
> **Fecha:** 2026-11-16
> **Objetivo:** Agregar al carrito un producto de Precios Claros con un toque, sin pasar por el formulario de Agregar producto y sin pedir la categoría, que pasa a ser opcional y solo se ofrece al dar de alta a mano un producto que no existe.

## Por qué existe esta spec

Hoy, para llevar al carrito un producto que aparece en **En Precios Claros** (o que se leyó con el lector), hay que
ir al formulario de Agregar producto, completar la **categoría** (obligatoria), guardar, volver a Buscar y recién
ahí agregarlo, con precio `100` si no tiene ninguno registrado.

Obligar a poner la categoría para comprar es un **error funcional**: el carrito no la necesita y el producto ya
tiene nombre, marca, presentación y EAN en el catálogo.

La [spec 15](15-precios-y-comercios-cercanos.md) resuelve el agregado desde una sucursal cercana, pero necesita la
ubicación. Esta spec arregla el caso general antes, sin ubicación ni sucursales, y la 15 reusa lo que define acá.

## Alcance

**Incluye:**

- Botón **"Agregar al carrito"** en Buscar para los productos del catálogo: resultados de **En Precios Claros**
  (con o sin precios) y oferta del **lector de códigos de barras** cuando el producto está en el catálogo.
- El producto se crea solo, **sin categoría**, vinculado al catálogo; si ya había uno propio con ese EAN se usa ese.
- `Product.category` pasa a ser **opcional**. En el formulario de Agregar producto (alta a mano) el campo queda,
  como opcional. No aparece en ningún otro camino.
- Precio inicial del ítem sin el `100` inventado; un ítem sin precio se marca para completar en el carrito.

**Fuera de alcance:**

- Precios y comercios cercanos, agregar desde una sucursal (spec 15).
- Editar nombre y categoría de un producto desde el detalle.
- Cargar precio (`/upload`, tab precio): no es un camino al carrito y no cambia.

## Modelo de datos

```typescript
// src/lib/models.ts
interface Product {
  // ...
  category?: string;   // antes requerido; los productos creados desde el catálogo no tienen
}
```

`preciolocal_products` no cambia de formato: los productos guardados tienen `category` y siguen igual. Sin migración.

Funciones nuevas (puras, con tests):

```typescript
// src/lib/product-form.ts
/** Producto propio a partir del catálogo: nombre sugerido (suggestedName), marca, presentación y EAN; sin categoría */
export function productFromSepa(sepa: SepaProduct, id: string): Product;

// src/lib/store.ts
/** Precio inicial de un ítem: el último propio; si no hay, la referencia SEPA (spec 12) si se pasa; si no, 0 */
export function initialCartPrice(prices: Price[], productId: string, reference?: number): number;
```

Acción nueva en el store:

```typescript
/** Busca el producto propio con ese EAN o lo crea con productFromSepa, y lo agrega al carrito sin comercio */
addSepaToCart: (sepa: SepaProduct, reference?: number) => Product;
```

## Reglas

- **Agregar al carrito** un producto del catálogo:
  1. si hay un producto propio con ese EAN (`toGtin13`), se usa ese; si no, se crea con `productFromSepa`;
  2. `addToCart` sin `store` (queda en "Sin comercio", spec 14) con `initialCartPrice`. Por la regla "un producto,
     un comercio" de la spec 14, si ya estaba en el carrito suma 1 y conserva su comercio;
  3. no se registra ningún `Price`: eso pasa al confirmar la compra, como hoy.
- **Sin precio conocido** (ni propio ni de referencia): el ítem entra con precio **0**. En el carrito muestra
  "Completar precio" y el botón de compra de su grupo queda deshabilitado hasta que todos sus ítems tengan precio,
  para no registrar un `Price` de $0.
- **"Añadir Carrito" de un producto propio** usa la misma regla (`initialCartPrice`, con la referencia si tiene EAN
  y precios en el catálogo) en lugar del `100`.
- **Categoría opcional.** En Agregar producto el campo se llama "Categoría (opcional)"; vacía, el producto se guarda
  sin `category` (no como texto vacío). Nombre sigue obligatorio; el mensaje pasa a "Completá el nombre".
- **Sin categoría no se muestra nada:** la tarjeta de Buscar y el detalle omiten la línea de categoría.
  `filterProducts` no falla con productos sin categoría.
- **Producto fuera del catálogo** (el lector no lo encontró o falló la consulta): sigue "Agregar producto" al
  formulario, porque no hay nombre para crearlo.
- Sin Supabase, la sección del catálogo no existe y nada de esto aparece (como hoy).

## UI/UX

- **Resultado del catálogo sin precios** (hoy la fila es el link "Agregar"): la fila muestra descripción, marca y
  presentación, y a la derecha el botón **"Agregar al carrito"** (`aria-label="Agregar <descripción> al carrito"`,
  44 px de alto).
- **Resultado con precios** (desplegable de la spec 12): dentro del desplegado, "Agregar producto" pasa a ser
  **"Agregar al carrito"** (`btn-primary`).
- **Oferta del lector** con el producto en el catálogo: el botón dice "Agregar al carrito".
- En los tres casos, debajo, el link chico **"Editar antes de agregar"** a `/upload?tab=producto&ean=…` para quien
  quiera cambiar el nombre o ponerle categoría. Es optativo.
- Al agregar: aviso "✓ <nombre> en el carrito" (`role="status"`, se oculta a los 3 s como los mensajes de Cargar).
  El producto pasa a la lista de productos propios y sale de la sección del catálogo, como cualquier propio.
- **Carrito:** el ítem en $0 muestra "Completar precio" en ámbar junto al campo de precio; el botón "Comprar en …"
  deshabilitado lleva la leyenda "Completá los precios para comprar".
- 375 px sin scroll horizontal.
- Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Modelo y lógica pura + tests:** `category?` en `Product`, `filterProducts` sin categoría, `productFromSepa`,
   `productFromForm` sin `category` vacía, `initialCartPrice`.
2. **Acción + tests:** `addSepaToCart` (crea o reusa por EAN, agrega sin comercio, no duplica).
3. **Buscar:** "Agregar al carrito" en los resultados del catálogo (con y sin precios) y en la oferta del lector,
   con el aviso; "Añadir Carrito" de propios con `initialCartPrice`. Verificar: ningún camino de Buscar al carrito
   pasa por el formulario.
4. **Categoría opcional** en Agregar producto, la tarjeta de Buscar y el detalle.
5. **Carrito:** "Completar precio" y compra del grupo bloqueada con ítems en $0.
6. **Documentación.** `CLAUDE.md` (modelo, Buscar, Cargar, Carrito) y la spec 15 (usa `productFromSepa` de esta spec).

## Criterios de aceptación

- [ ] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.
- [ ] "Agregar al carrito" en un resultado del catálogo crea el producto vinculado (nombre, marca, presentación y EAN), sin categoría, y lo deja en "Sin comercio" del carrito, sin pasar por el formulario.
- [ ] Con precios en el catálogo, el ítem entra con el promedio de referencia; con un precio propio, con ese.
- [ ] Un resultado sin precios entra con $0 y "Completar precio"; su grupo no se puede comprar hasta completarlo.
- [ ] Agregar dos veces el mismo producto del catálogo deja un solo producto propio y una sola línea con cantidad 2.
- [ ] Desde el lector, un producto del catálogo que no es propio se agrega con un toque.
- [ ] En Agregar producto se puede guardar sin categoría; el producto se ve en Buscar y en el detalle sin la línea de categoría.
- [ ] Los productos guardados antes conservan su categoría y la búsqueda por categoría sigue funcionando.
- [ ] "Añadir Carrito" de un producto propio sin precios ya no usa $100.
- [ ] En 375 px no hay scroll horizontal.

## Decisiones

- **Sí:** sin categoría en lugar de "Sin categoría". No inventa un valor que después hay que distinguir de uno real; la UI simplemente no la muestra.
- **Sí:** crear el producto propio al agregarlo. El carrito, el historial y los precios trabajan con `productId`; un ítem sin producto rompería "Repetir" y el historial de precios.
- **Sí:** precio 0 con "Completar precio" cuando no hay ninguno conocido. El `100` registraba precios falsos al confirmar la compra; bloquear solo ese grupo no frena el agregado.
- **Sí:** el formulario queda como camino opcional ("Editar antes de agregar") para cambiar el nombre sugerido o poner categoría.
- **No:** pedir el precio al agregar. Es un paso más en la góndola; se completa en el carrito.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Nombres sugeridos feos ("Pañal Babys Xg 40 U") | "Editar antes de agregar"; editar desde el detalle queda pendiente aparte |
| Muchos productos propios sin categoría | La categoría era texto libre sin uso más allá del filtro; se puede completar en el formulario al darlos de alta |
| Comprar con un ítem en $0 | La compra del grupo queda bloqueada hasta completar el precio |

## Lo que **no** incluye esta spec

- Comercios cercanos y agregar desde una sucursal (spec 15).
- Editar nombre y categoría desde el detalle.
- Categorías predefinidas o un selector de categorías.
