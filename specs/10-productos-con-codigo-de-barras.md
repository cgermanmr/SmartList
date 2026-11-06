# SPEC 10 — Productos con código de barras y catálogo SEPA

> **Estado:** Aprobado
> **Depende de:** [SPEC 08](08-base-sepa-supabase.md)
> **Fecha:** 2026-11-06
> **Objetivo:** Agregar código de barras (EAN), marca y presentación a `Product`, conectar la app a Supabase solo para leer, y permitir crear o vincular productos buscándolos en el catálogo SEPA.

## Por qué existe esta spec

El SEPA identifica todo por código de barras y la app no lo tiene: sin EAN no hay forma de mostrar un precio de
referencia (spec 12) ni de reconocer un producto escaneado (spec 11). De paso, el catálogo SEPA trae marca y
presentación, que resuelven el prerrequisito transversal **Presentación del producto** de `docs/README.md`.

Desde la spec 09 el catálogo se actualiza solo todos los días (~75 mil productos), pero la app todavía no lo usa.

## Alcance

**Incluye:**

- Campos opcionales nuevos en `Product`: `ean`, `brand`, `size`, `sizeUnit`. Los datos guardados siguen
  sirviendo sin migración.
- Acción `updateProduct` en el store.
- Cliente de Supabase de solo lectura (`src/lib/supabase.ts`) y consultas al catálogo (`src/lib/sepa.ts`).
- Búsqueda en el catálogo **sin importar los acentos** ("azúcar" y "azucar" encuentran lo mismo), sin migración.
- **Cargar → Agregar producto:** campo "Código de barras" y buscador "Buscar en Precios Claros" que completa
  nombre, marca, presentación y EAN.
- **Detalle de producto:** se ven EAN, marca y presentación. Sin EAN: "Vincular con Precios Claros". Con EAN:
  "Cambiar vínculo" y "Quitar vínculo", para corregir un vínculo equivocado.
- **Buscar:** si el texto son solo dígitos, también busca por EAN (parcial) entre los productos propios.
- **Buscar en el catálogo:** en `/`, debajo de los productos propios, una sección "En Precios Claros" con los
  productos del catálogo SEPA que coinciden por nombre (o por EAN). Tocar uno abre Agregar producto con los datos
  completos.
- **`/upload` con parámetros** (`?tab=producto&ean=<gtin13>`): abre la pestaña producto con los datos del catálogo
  ya completos. Lo usan Buscar en esta spec y el lector de la spec 11.
- Variables `NEXT_PUBLIC_SUPABASE_*` cargadas **a mano** en Vercel (Production y Preview) con la clave publishable.
- La app funciona igual sin variables de Supabase: el buscador SEPA, la sección "En Precios Claros" y los botones
  de vínculo no se muestran.

**Fuera de alcance:**

- Escanear con la cámara (spec 11).
- Mostrar precios SEPA (spec 12).
- Guardar productos o precios propios en Supabase (Fase 2).
- Usar `size` en la calculadora o en $/kg del detalle.
- Editar nombre o categoría de un producto, o borrarlo.
- Ignorar acentos en el filtro de productos propios (sigue como hoy: solo sin distinguir mayúsculas).
- Cambios en la base: ni migraciones ni extensiones nuevas (`unaccent`).
- Actualizar marca o presentación de un producto propio cuando cambian en el catálogo: se copian al vincular.

## Modelo de datos

### `Product` — `src/lib/models.ts`

```typescript
export interface Product {
  id: string;
  name: string;
  category: string;
  image?: string;
  ean?: string;       // GTIN-13 (toGtin13); único entre los productos propios
  brand?: string;
  size?: number;      // presentación: 500
  sizeUnit?: Unit;    // 'g' | 'kg' | 'ml' | 'l' | 'u' (mismo tipo que la calculadora)
}
```

### Store — `src/lib/store.ts`

```typescript
/** Copia el producto con los cambios; `ean: undefined` quita el vínculo (JSON.stringify omite la clave) */
updateProduct(id: string, changes: Partial<Omit<Product, 'id'>>): void;
```

### Catálogo SEPA — `src/lib/sepa.ts`

```typescript
export interface SepaProduct {
  ean: string;
  description: string;
  brand: string | null;
  size: number | null;
  sizeUnit: 'g' | 'ml' | 'u' | null;
  banderas: number;
}

/** Texto de búsqueda (mín. 3 caracteres sin espacios) o EAN; hasta 20 resultados, primero los que están en más cadenas */
export function searchSepaProducts(query: string): Promise<SepaProduct[]>;
export function getSepaProduct(ean: string): Promise<SepaProduct | null>;
/** Fila de sepa_productos → SepaProduct (pura, con tests) */
export function toSepaProduct(row: SepaProductRow): SepaProduct;
/** Nombre sugerido: descripción en formato título, sin la marca repetida al final (pura, con tests) */
export function suggestedName(p: SepaProduct): string;
/** Patrón de una palabra que ignora acentos y escapa los caracteres especiales de regex (pura, con tests) */
export function accentPattern(word: string): string;
```

- **Búsqueda por texto:** el texto se parte en palabras y cada una se convierte con `accentPattern`; todas deben
  aparecer (`.imatch('descripcion', patrón)` por palabra, que es `~*` en Postgres). El índice trigram de la spec 08
  soporta `~*`: medido el 06/11/2026, "yerba playadito" tarda 1,8 ms y "azúcar" encuentra 229 productos (220 sin
  tilde + 9 con tilde; con `ilike` eran 9). Orden `banderas desc, descripcion`, límite 20.
- **`accentPattern`:** pasa a minúsculas, saca las tildes (`normalize('NFD')`), escapa `\ . * + ? ^ $ ( ) [ ] { } |`
  y reemplaza cada vocal y la `n` por su clase: `a → [aá]`, `e → [eé]`, `i → [ií]`, `o → [oó]`, `u → [uúü]`,
  `n → [nñ]`. Ejemplo: `"Azúcar"` → `"[aá]z[uúü]c[aá]r"`.
- **Búsqueda por EAN:** si `query` son solo dígitos y `toGtin13(query)` es válido → `eq('ean', …)`. Si son dígitos
  pero no un GTIN válido, se busca como texto.
- Errores de red o de Supabase → la promesa rechaza; la UI muestra "No se pudo consultar Precios Claros".

### Cliente — `src/lib/supabase.ts`

```typescript
/** null si faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY */
export const supabase: SupabaseClient | null;
```

Sin sesión ni persistencia de auth (`auth: { persistSession: false }`): solo se leen datos públicos por RLS.
`NEXT_PUBLIC_SUPABASE_ANON_KEY` lleva la clave **publishable** (`sb_publishable_…`); el nombre de la variable no
cambia (ya está en `.env.example` y `CLAUDE.md`).

## Reglas

- `ean` se guarda siempre con `toGtin13`. Si el usuario escribe un código que no pasa `isValidGtin`, el formulario
  muestra "Código de barras inválido" y no guarda.
- No puede haber dos productos propios con el mismo `ean`: al agregar, vincular o cambiar el vínculo a uno
  repetido, mensaje "Ya tenés este producto: <nombre>" con link a su detalle.
- Al elegir un resultado del catálogo: `name = suggestedName`, `brand`, `size`, `sizeUnit` y `ean` se completan y
  quedan editables. `category` sigue siendo obligatoria y manual (el SEPA no tiene categorías).
- **Vincular** (producto sin EAN) asigna `ean` y completa `brand` / `size` / `sizeUnit` solo si estaban vacíos.
- **Cambiar vínculo** asigna el `ean` nuevo y **reemplaza** `brand` / `size` / `sizeUnit` por los del producto
  elegido (los que el catálogo trae en `null` no se tocan). Los anteriores vinieron casi siempre del vínculo
  equivocado.
- **Quitar vínculo** pide confirmación (`confirm`, como el resto del detalle) y borra solo `ean`; marca y
  presentación se conservan.
- Vincular, cambiar y quitar **nunca** cambian el nombre ni la categoría.
- Presentación: `size` y `sizeUnit` van juntos (los dos o ninguno).
- **Buscar por EAN propio:** si el texto (sin espacios) son solo dígitos, coinciden también los productos cuyo `ean`
  **contiene** esos dígitos; si los dígitos son un GTIN válido, se compara con su `toGtin13` (así un EAN-8 o un
  UPC-A completo encuentra el GTIN-13 guardado). Se suma al filtro de nombre y categoría de siempre.
- **Buscar en el catálogo:** se consulta con `searchSepaProducts` cuando el texto tiene al menos 3 caracteres
  (sin contar espacios); con menos, la sección no se muestra. El filtro de productos propios sigue siendo
  instantáneo y local, como hoy; la consulta al catálogo no lo demora.
- Los resultados del catálogo cuyo `ean` ya tiene un producto propio **no** se muestran en "En Precios Claros": ese
  producto ya aparece arriba (o aparece al buscar por su EAN).
- Al tocar un resultado se navega a `/upload?tab=producto&ean=<ean>`. Esa pantalla busca el EAN con
  `getSepaProduct` y completa el formulario con las mismas reglas que elegirlo en el buscador de Agregar producto.
  Si el EAN no es válido o no está en el catálogo, abre la pestaña producto con solo el EAN (si es válido) o vacía.
- Leer `useSearchParams` con Cache Components exige un `<Suspense>` arriba: `upload/page.tsx` pasa a Server
  Component que envuelve a `UploadForm.tsx`, igual que `product/[id]/`.

## UI/UX

- **Agregar producto** (`/upload`, pestaña producto): arriba un buscador "Buscar en Precios Claros" con
  resultados debajo (descripción, marca, presentación como "500 g", "en 9 cadenas"); al tocar uno se completa el
  formulario. Debajo, los campos de siempre más "Código de barras", "Marca" y "Presentación" (número + `select`
  de unidad), todos opcionales.
- Búsqueda con espera de 300 ms entre teclas; "Buscando…" mientras tanto; "Sin resultados" si no hay.
- **Buscar** (`/`): debajo de las tarjetas propias, título "En Precios Claros" y una lista de hasta 20 resultados
  con el mismo formato que el buscador de Agregar producto (descripción, marca, presentación, "en N cadenas") y
  un "Agregar" a la derecha de cada uno. Usa la misma espera de 300 ms y los mismos mensajes ("Buscando…", "Sin
  resultados", "No se pudo consultar Precios Claros"). Si no hay productos propios que coincidan, "No se
  encontraron productos" pasa a "No tenés productos con ese nombre" y la sección del catálogo queda debajo.
  Cada resultado es un link (`<Link>`) con `aria-label="Agregar <descripción>"`.
- **Detalle:** debajo del nombre, línea gris "Marca · 500 g · EAN 7793704000911" (lo que exista). Si hay Supabase:
  - sin EAN, botón secundario "Vincular con Precios Claros";
  - con EAN, dos botones secundarios chicos: "Cambiar vínculo" y "Quitar vínculo".
  "Vincular" y "Cambiar vínculo" abren el mismo buscador en un modal.
- Fuente al pie de los resultados: "Datos: Precios Claros — SEPA (CC-BY-4.0)".
- Inputs con `id` + `<label htmlFor>`; resultados como lista de botones navegables con teclado.

## Plan de implementación

1. **Modelo y store.** Campos nuevos en `Product`; `updateProduct(id, changes)` en `store.ts` (copia, no muta).
   Verificar: tests en `store.test.ts`, incluido quitar `ean` con `undefined`; los datos guardados siguen cargando.
2. **Cliente y consultas.** `npm i @supabase/supabase-js`; `src/lib/supabase.ts` y `src/lib/sepa.ts` con
   `toSepaProduct`, `suggestedName` y `accentPattern` testeadas (acentos, mayúsculas, caracteres especiales de
   regex, `ü` y `ñ`). Verificar: tests; `npm run build` sin variables de entorno.
3. **Variables.** Clave publishable desde *Project Settings → API Keys* de Supabase. En Vercel (*Settings →
   Environment Variables*), a mano, `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` para Production y
   Preview. En local, `.env.local`. Verificar: en `npm run dev` la búsqueda devuelve resultados.
4. **Buscador SEPA** (`src/components/SepaSearch.tsx`), reutilizable en Cargar y en el modal del detalle. La
   espera, la consulta y los estados (buscando / sin resultados / error) van en un hook `useSepaSearch(query)`
   que también usa Buscar, para no duplicarlos.
5. **Agregar producto.** Campos nuevos, validación de EAN, duplicados. Verificar: criterios de Cargar.
6. **`/upload` con parámetros.** Separar `UploadForm.tsx` con `<Suspense>`; leer `tab` y `ean`; con `ean`,
   completar con `getSepaProduct`. Verificar: `/upload?tab=producto&ean=7793704000508` abre la pestaña con los
   datos; `npm run build` pasa.
7. **Detalle.** Línea de datos; "Vincular con Precios Claros", "Cambiar vínculo" y "Quitar vínculo". Verificar:
   criterios del detalle.
8. **Buscar por EAN** en `/`. Verificar: buscar `7793704` y `7793704000508` encuentran el producto vinculado.
9. **Buscar en el catálogo** en `/`. Sección "En Precios Claros" con `useSepaSearch` y el filtro de EAN propios.
   Verificar: criterios de Buscar.
10. **Documentación.** `CLAUDE.md` (modelo `Product`, `lib/supabase.ts`, `lib/sepa.ts`, Funcionalidades, variables
    en Vercel y la clave publishable, Estado Actual); feature 06 y `docs/README.md`.

## Criterios de aceptación

- [ ] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings; el build pasa sin variables de entorno.
- [ ] Sin variables de Supabase la app funciona como antes y no muestra el buscador SEPA ni los botones de vínculo.
- [ ] Buscar "yerba playadito" en Agregar producto lista resultados en menos de 2 s; al tocar uno se completan nombre, marca, presentación y EAN.
- [ ] "azúcar" y "azucar" devuelven los mismos resultados en el catálogo.
- [ ] Un texto con caracteres especiales (`(`, `[`, `*`, `\`) no rompe la búsqueda: devuelve resultados o "Sin resultados".
- [ ] Se guarda el producto con categoría elegida y aparece en Buscar con su EAN.
- [ ] Un EAN inválido (`7793704000912`) muestra "Código de barras inválido" y no guarda.
- [ ] Un EAN ya usado por otro producto propio muestra "Ya tenés este producto" con link, al agregar, vincular y cambiar el vínculo.
- [ ] En el detalle de un producto sin EAN, "Vincular con Precios Claros" asigna el EAN sin cambiar el nombre.
- [ ] En el detalle de un producto con EAN, "Cambiar vínculo" asigna el EAN nuevo con su marca y presentación, sin cambiar el nombre.
- [ ] "Quitar vínculo" pide confirmación y borra solo el EAN; marca y presentación quedan.
- [ ] Sin conexión, el buscador muestra "No se pudo consultar Precios Claros" y el resto del formulario funciona.
- [ ] En Buscar, `7793704` encuentra los productos propios cuyo EAN contiene esos dígitos.
- [ ] En Buscar, "yerba playadito" sin productos propios que coincidan muestra resultados en "En Precios Claros" en menos de 2 s.
- [ ] Tocar un resultado abre Agregar producto con nombre, marca, presentación y EAN completos; falta solo la categoría.
- [ ] Un producto propio con EAN no aparece repetido en "En Precios Claros".
- [ ] Con 1 o 2 letras la sección del catálogo no aparece y no se hace ninguna consulta (pestaña Network).
- [ ] Sin conexión, Buscar filtra los productos propios igual que antes y la sección muestra "No se pudo consultar Precios Claros".
- [ ] `/upload?tab=producto&ean=7793704000508` abre la pestaña producto con los datos del catálogo.
- [ ] En una URL de preview de Vercel y en producción, la búsqueda en el catálogo devuelve resultados.
- [ ] Los productos guardados antes de esta spec se ven igual y se pueden vincular.
- [ ] En 375 px no hay scroll horizontal en Buscar, Cargar ni el detalle (con los botones de vínculo y el modal).

## Decisiones

- **Sí:** EAN opcional. La app sigue sirviendo para productos sin código (verdura, carne, panadería).
- **Sí:** reutilizar `Unit` de la calculadora para `sizeUnit`. Permite pasar después la presentación a la calculadora con `toBaseQuantity`.
- **Sí:** Supabase solo para leer el catálogo público, sin login. Los datos propios siguen en `localStorage` hasta la Fase 2.
- **Sí:** consultar desde el navegador con `supabase-js`. La tabla es pública por RLS y no hace falta un route handler.
- **No:** guardar el catálogo SEPA en `localStorage`. Son decenas de MB y se desactualiza a diario.
- **Sí:** nombre sugerido editable. Las descripciones del SEPA vienen en mayúsculas, abreviadas y a veces cortadas a 20 caracteres ("DULCE D LECHE REPOST").
- **Sí:** ignorar acentos con una expresión regular armada en la app (`accentPattern` + `~*`). El índice trigram la soporta (1,8 ms medido), encuentra las dos formas y no necesita migración.
- **No:** sacar las tildes del texto antes de consultar. Es más simple, pero pierde los ~1.800 productos que tienen acento en la descripción.
- **No:** `unaccent` con una función inmutable y un índice nuevo. Es más prolijo, pero suma una migración y cambios en la base a una spec de la app.
- **Sí:** variables cargadas a mano en Vercel. La integración del Marketplace crea un proyecto de Supabase nuevo, y el de la spec 08 ya existe.
- **Sí:** clave publishable (`sb_publishable_…`) en la variable `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Es la que Supabase recomienda hoy; se conserva el nombre de la variable porque ya está documentada.
- **Sí:** "Cambiar vínculo" y "Quitar vínculo" en el detalle. Sin ellos, un vínculo equivocado no se puede corregir: no hay edición ni borrado de productos.
- **No:** un formulario para editar todos los datos del producto. Agranda la spec; queda para cuando haga falta editar nombre y categoría.
- **Sí:** al cambiar el vínculo se reemplazan marca y presentación; al vincular solo se completan las vacías. Las de un vínculo anterior vinieron casi siempre de ese vínculo; las de un producto sin vínculo las escribió el usuario.
- **Sí:** buscar el EAN propio por dígitos contenidos. Sirve para escribirlo a mano a medias y también para el código completo.
- **Sí:** buscar en el catálogo también desde Buscar, no solo desde Agregar producto. Es el primer lugar donde se escribe un nombre; si ahí no aparece nada, parece que la base está vacía.
- **Sí:** el catálogo en una sección aparte, debajo de los propios. Los productos propios tienen historial y carrito; los del catálogo todavía no son del usuario y tienen otra acción (agregar).
- **Sí:** tocar un resultado lleva a Agregar producto, no a un detalle propio del catálogo. La categoría es obligatoria y manual, y sin producto propio no hay dónde cargar precios ni agregar al carrito. Ver precios SEPA de un producto queda para la spec 12.
- **Sí:** `/upload?tab=producto&ean=…` en esta spec y no en la 11. Buscar ya lo necesita; la spec 11 lo reutiliza.
- **Sí:** marca y presentación se copian al vincular y no se actualizan solas. El producto propio es del usuario; el catálogo cambia todos los días.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Supabase caído o proyecto pausado | La UI degrada a mensaje; nada más depende de Supabase. La carga diaria de la spec 09 mantiene activo el proyecto |
| Búsqueda lenta | Índice trigram (1,8 ms medido con regex); límite de 20 resultados |
| Una palabra de 1 o 2 letras no aprovecha el índice trigram | Con ~75 mil filas un recorrido completo sigue siendo rápido; se mide en el paso 9 |
| Texto del usuario con caracteres especiales de regex | `accentPattern` los escapa; criterio de aceptación específico |
| Una consulta por cada tecla en Buscar | Espera de 300 ms y mínimo de 3 caracteres; se descarta la respuesta de una consulta vieja si llega después de la nueva |
| Descripciones poco claras o cortadas | Se muestran marca y presentación; el nombre es editable |
| Un EAN vinculado deja de estar en el catálogo (el ETL borra productos sin precio) | El producto propio conserva sus datos; `getSepaProduct` devuelve `null` y `/upload` abre con solo el EAN |
| La clave publishable queda expuesta en el navegador | Es pública por diseño: RLS solo permite leer las tablas del catálogo; `sepa_cargas` no es legible |
| Cache Components conserva el estado del buscador al volver a la página | Es el comportamiento esperado; el resultado elegido se limpia al guardar |

## Lo que **no** incluye esta spec

- Lector de códigos con cámara (spec 11).
- Precios de referencia (spec 12).
- Presentación en la calculadora o $/kg en el detalle.
- Sincronizar productos propios con Supabase.
- Editar nombre o categoría, o borrar productos.
- Migraciones o cambios en la base.
