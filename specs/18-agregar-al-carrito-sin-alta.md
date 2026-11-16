# SPEC 18 — Agregar al carrito sin dar de alta el producto

> **Estado:** Implementado
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
- Buscar en los productos propios también **por marca**, palabra por palabra (agregado en la revisión).
- **Agregar** deshabilitado mientras se buscan los precios del producto (agregado en la revisión).

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

Cambio en una consulta existente (agregado en la revisión):

```typescript
// src/lib/store.ts
/** Cada palabra del texto está en el nombre, la marca o la categoría, sin distinguir mayúsculas ni acentos;
 *  con solo dígitos, también por EAN (como antes) */
export function filterProducts(products: Product[], query: string): Product[];
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
- **Búsqueda de propios por marca** (revisión): `filterProducts` separa el texto en palabras y cada una tiene que
  estar en el nombre, la marca o la categoría, sin distinguir mayúsculas ni acentos. "playadito" encuentra la yerba
  y el mate cocido de esa marca; "yerba playadito" encuentra "Yerba" de marca PLAYADITO (que antes desaparecía de
  la vista al agregarlo, porque el nombre sugerido saca la marca). La búsqueda por EAN no cambia.
- **Solo se agrega con la búsqueda terminada** (revisión): mientras se buscan los precios de referencia del
  producto, el botón de agregar está deshabilitado, para que no entre en $0 algo que tiene precios. Aplica a los
  resultados del catálogo, a la oferta del lector y a "Añadir Carrito" de un propio con EAN y sin precio propio.
  Si la consulta de precios falla, se habilita (entra en $0 con "Completar precio").
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
- Mientras se buscan los precios, el botón de agregar dice **"Buscando precio…"**, deshabilitado (`aria-busy`).
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
7. **Ajustes de la revisión:** `filterProducts` por palabras en nombre, marca y categoría, sin acentos (+ tests);
   agregar deshabilitado mientras se buscan los precios ("Buscando precio…"). Verificar en el navegador.

## Criterios de aceptación

- [x] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.
- [x] "Agregar al carrito" en un resultado del catálogo crea el producto vinculado (nombre, marca, presentación y EAN), sin categoría, y lo deja en "Sin comercio" del carrito, sin pasar por el formulario.
- [x] Con precios en el catálogo, el ítem entra con el promedio de referencia; con un precio propio, con ese.
- [x] Un resultado sin precios entra con $0 y "Completar precio"; su grupo no se puede comprar hasta completarlo.
- [x] Agregar dos veces el mismo producto del catálogo deja un solo producto propio y una sola línea con cantidad 2.
- [ ] Desde el lector, un producto del catálogo que no es propio se agrega con un toque.
- [x] En Agregar producto se puede guardar sin categoría; el producto se ve en Buscar y en el detalle sin la línea de categoría.
- [x] Los productos guardados antes conservan su categoría y la búsqueda por categoría sigue funcionando.
- [x] "Añadir Carrito" de un producto propio sin precios ya no usa $100.
- [x] En 375 px no hay scroll horizontal.
- [x] Buscar "playadito" muestra los productos propios de esa marca; "yerba playadito" encuentra "Yerba" de marca PLAYADITO; sin distinguir acentos.
- [x] Mientras se buscan los precios de un producto, su botón de agregar está deshabilitado y dice "Buscando precio…".

## Decisiones

- **Sí:** sin categoría en lugar de "Sin categoría". No inventa un valor que después hay que distinguir de uno real; la UI simplemente no la muestra.
- **Sí:** crear el producto propio al agregarlo. El carrito, el historial y los precios trabajan con `productId`; un ítem sin producto rompería "Repetir" y el historial de precios.
- **Sí:** precio 0 con "Completar precio" cuando no hay ninguno conocido. El `100` registraba precios falsos al confirmar la compra; bloquear solo ese grupo no frena el agregado.
- **Sí:** el formulario queda como camino opcional ("Editar antes de agregar") para cambiar el nombre sugerido o poner categoría.
- **Sí:** buscar por palabras en nombre, marca y categoría. Quien busca "playadito" puede estar pensando en la yerba o en el mate cocido; es un filtro, no una búsqueda exacta.
- **Sí:** esperar los precios antes de agregar. Agregar en $0 algo que tiene referencia obliga a completar un precio que la app ya conocía.
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
