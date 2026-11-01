# SPEC 10 — Productos con código de barras y catálogo SEPA

> **Estado:** Borrador
> **Depende de:** [SPEC 08](08-base-sepa-supabase.md)
> **Fecha:** 2026-10-31
> **Objetivo:** Agregar código de barras (EAN), marca y presentación a `Product`, conectar la app a Supabase solo para leer, y permitir crear o vincular productos buscándolos en el catálogo SEPA.

## Por qué existe esta spec

El SEPA identifica todo por código de barras y la app no lo tiene: sin EAN no hay forma de mostrar un precio de
referencia (spec 12) ni de reconocer un producto escaneado (spec 11). De paso, el catálogo SEPA trae marca y
presentación, que resuelven el prerrequisito transversal **Presentación del producto** de `docs/README.md`.

## Alcance

**Incluye:**

- Campos opcionales nuevos en `Product`: `ean`, `brand`, `size`, `sizeUnit`. Los datos guardados siguen
  sirviendo sin migración.
- Acción `updateProduct` en el store.
- Cliente de Supabase de solo lectura (`src/lib/supabase.ts`) y consultas al catálogo (`src/lib/sepa.ts`).
- **Cargar → Agregar producto:** campo "Código de barras" y buscador "Buscar en Precios Claros" que completa
  nombre, marca, presentación y EAN.
- **Detalle de producto:** se ven EAN, marca y presentación; botón "Vincular con Precios Claros" para productos
  sin EAN (busca y asigna el EAN).
- **Buscar:** si el texto son solo dígitos, también busca por EAN entre los productos propios.
- La app funciona igual sin variables de Supabase: el buscador SEPA no se muestra.

**Fuera de alcance:**

- Escanear con la cámara (spec 11).
- Mostrar precios SEPA (spec 12).
- Guardar productos o precios propios en Supabase (Fase 2).
- Usar `size` en la calculadora o en $/kg del detalle.

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

/** Texto de búsqueda (mín. 3 caracteres) o EAN; hasta 20 resultados, primero los que están en más cadenas */
export function searchSepaProducts(query: string): Promise<SepaProduct[]>;
export function getSepaProduct(ean: string): Promise<SepaProduct | null>;
/** Fila de sepa_productos → SepaProduct (pura, con tests) */
export function toSepaProduct(row: SepaProductRow): SepaProduct;
/** Nombre sugerido: descripción en formato título, sin la marca repetida al final */
export function suggestedName(p: SepaProduct): string;
```

- Búsqueda por texto: `ilike '%palabra%'` por **cada** palabra (todas deben aparecer), aprovechando el índice
  trigram de la spec 08; orden `banderas desc, descripcion`.
- Búsqueda por EAN: si `query` son solo dígitos y `toGtin13(query)` es válido → `eq('ean', …)`.
- Errores de red o de Supabase → la promesa rechaza; la UI muestra "No se pudo consultar Precios Claros".

### Cliente — `src/lib/supabase.ts`

```typescript
/** null si faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY */
export const supabase: SupabaseClient | null;
```

Sin sesión ni persistencia de auth (`auth: { persistSession: false }`): solo se leen datos públicos.

## Reglas

- `ean` se guarda siempre con `toGtin13`. Si el usuario escribe un código que no pasa `isValidGtin`, el formulario
  muestra "Código de barras inválido" y no guarda.
- No puede haber dos productos propios con el mismo `ean`: al agregar o vincular uno repetido, mensaje "Ya tenés
  este producto: <nombre>" con link a su detalle.
- Al elegir un resultado del catálogo: `name = suggestedName`, `brand`, `size`, `sizeUnit` y `ean` se completan y
  quedan editables. `category` sigue siendo obligatoria y manual (el SEPA no tiene categorías).
- Vincular un producto existente solo asigna `ean` (y `brand` / `size` / `sizeUnit` si estaban vacíos); nunca
  cambia el nombre.
- Presentación: `size` y `sizeUnit` van juntos (los dos o ninguno).

## UI/UX

- **Agregar producto** (`/upload`, pestaña producto): arriba un buscador "Buscar en Precios Claros" con
  resultados debajo (descripción, marca, presentación como "500 g", "en 9 cadenas"); al tocar uno se completa el
  formulario. Debajo, los campos de siempre más "Código de barras", "Marca" y "Presentación" (número + `select`
  de unidad), todos opcionales.
- Búsqueda con espera de 300 ms entre teclas; "Buscando…" mientras tanto; "Sin resultados" si no hay.
- **Detalle:** debajo del nombre, línea gris "Marca · 500 g · EAN 7793704000911" (lo que exista). Si no tiene
  EAN y hay Supabase: botón secundario "Vincular con Precios Claros" que abre el mismo buscador en un modal.
- Fuente al pie de los resultados: "Datos: Precios Claros — SEPA (CC-BY-4.0)".
- Inputs con `id` + `<label htmlFor>`; resultados como lista de botones navegables con teclado.

## Plan de implementación

1. **Modelo y store.** Campos nuevos en `Product`; `updateProduct(id, changes)` en `store.ts` (copia, no muta).
   Verificar: tests en `store.test.ts`; los datos guardados siguen cargando.
2. **Cliente y consultas.** `npm i @supabase/supabase-js`; `src/lib/supabase.ts` y `src/lib/sepa.ts` con
   `toSepaProduct` y `suggestedName` testeadas. Verificar: tests; `npm run build` sin variables de entorno.
3. **Variables.** En Vercel, la integración de Supabase carga `NEXT_PUBLIC_SUPABASE_URL` y
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (si se usa la clave *publishable* nueva, va en esa misma variable). En local,
   `.env.local`. Verificar: en `npm run dev` la búsqueda devuelve resultados.
4. **Buscador SEPA** (`src/components/SepaSearch.tsx`), reutilizable en Cargar y en el modal del detalle.
5. **Agregar producto.** Campos nuevos, validación de EAN, duplicados. Verificar: criterios de Cargar.
6. **Detalle.** Línea de datos y "Vincular con Precios Claros". Verificar: criterios del detalle.
7. **Buscar por EAN** en `/`. Verificar: buscar `7793704000911` encuentra el producto vinculado.
8. **Documentación.** `CLAUDE.md` (modelo `Product`, `lib/supabase.ts`, `lib/sepa.ts`, Funcionalidades, variables).

## Criterios de aceptación

- [ ] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings; el build pasa sin variables de entorno.
- [ ] Sin variables de Supabase la app funciona como antes y no muestra el buscador SEPA.
- [ ] Buscar "yerba playadito" en Agregar producto lista resultados en menos de 2 s; al tocar uno se completan nombre, marca, presentación y EAN.
- [ ] Se guarda el producto con categoría elegida y aparece en Buscar con su EAN.
- [ ] Un EAN inválido (`7793704000912`) muestra "Código de barras inválido" y no guarda.
- [ ] Un EAN ya usado por otro producto propio muestra "Ya tenés este producto" con link.
- [ ] En el detalle de un producto sin EAN, "Vincular con Precios Claros" asigna el EAN sin cambiar el nombre.
- [ ] Sin conexión, el buscador muestra "No se pudo consultar Precios Claros" y el resto del formulario funciona.
- [ ] Los productos guardados antes de esta spec se ven y editan igual.
- [ ] En 375 px no hay scroll horizontal en Cargar ni en el detalle.

## Decisiones

- **Sí:** EAN opcional. La app sigue sirviendo para productos sin código (verdura, carne, panadería).
- **Sí:** reutilizar `Unit` de la calculadora para `sizeUnit`. Permite pasar después la presentación a la calculadora con `toBaseQuantity`.
- **Sí:** Supabase solo para leer el catálogo público, sin login. Los datos propios siguen en `localStorage` hasta la Fase 2.
- **Sí:** consultar desde el navegador con `supabase-js`. La tabla es pública por RLS y no hace falta un route handler.
- **No:** guardar el catálogo SEPA en `localStorage`. Son decenas de MB y se desactualiza a diario.
- **Sí:** nombre sugerido editable. Las descripciones del SEPA están en mayúsculas y abreviadas ("YERBA M.PLAYADITO X500G").

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Supabase caído o proyecto pausado | La UI degrada a mensaje; nada más depende de Supabase |
| Búsqueda lenta con `ilike` | Índice trigram de la spec 08; límite de 20 resultados |
| Descripciones poco claras | Se muestran marca y presentación; el nombre es editable |
| Cache Components conserva el estado del buscador al volver a la página | Es el comportamiento esperado; el resultado elegido se limpia al guardar |

## Lo que **no** incluye esta spec

- Lector de códigos con cámara (spec 11).
- Precios de referencia (spec 12).
- Presentación en la calculadora o $/kg en el detalle.
- Sincronizar productos propios con Supabase.
