# SPEC 34 — Cargar un producto a mano al cargar un precio

> **Estado:** Aprobada
> **Depende de:** [SPEC 10](10-productos-con-codigo-de-barras.md), [SPEC 11](11-lector-codigo-de-barras.md), [SPEC 26](26-cargar-precio-en-el-comercio.md), [SPEC 27](27-fotos-propias.md)
> **Fecha:** 2026-11-24
> **Objetivo:** Ofrecer en el buscador de Cargar precio, cuando el producto no aparece, cargarlo a mano con nombre, código de barras, marca, presentación, categoría y foto.

## Por qué existe esta spec

Cargar precio ya permite un producto nuevo (casos B y C de la spec 26), pero:

- La entrada es el link "No tiene código de barras", que está siempre y no responde a "busqué y no está". Además excluye a
  los que sí tienen código.
- El formulario pide solo nombre, marca y foto: sin presentación el precio no se puede comparar después, y la categoría
  solo se puede cargar en Agregar producto.

## Alcance

**Incluye:**

- Oferta **"Cargar … a mano"** debajo de los resultados del buscador de Cargar precio: destacada sin resultados, discreta
  con resultados.
- **Un solo formulario** para todo producto nuevo: Nombre, Código de barras, Marca, Presentación, Categoría y Foto.
  Reemplaza a los de los casos B y C.
- Código de barras optativo, con lector, que avisa si ya es de un producto propio o si está en Precios Claros.
- **Cambiar** vuelve al buscador con el texto buscado.
- Sugerencias de categoría con las de los productos propios, también en Agregar producto.
- Se saca el link "No tiene código de barras".

**Fuera de alcance:**

- Ofrecer la carga a mano en Buscar, en el carrito o en la oferta del lector de Buscar.
- Crear el producto sin guardar un precio (para eso está Agregar producto).
- Otros cambios en Agregar producto.
- Editar nombre, marca, presentación o categoría de un producto ya creado.
- Detectar productos propios con nombres parecidos o unir repetidos.
- Cambiar la escritura de las 8 categorías fijas ("Lacteos", "Almacen"…).
- Aportar el producto a Precios Claros o a Open Food Facts.

## Reglas

### La oferta en el buscador

Se muestra con algo escrito, cuando terminó la búsqueda (no mientras dice "Buscando…" ni "Buscando el código…"), debajo
de los resultados.

| Situación | Qué se ve |
|---|---|
| Sin propios ni resultados del catálogo | Destacada: "No encontramos "alfajor luna" en tus productos ni en Precios Claros." y botón **Cargar "alfajor luna" a mano**. Reemplaza a la sección "En Precios Claros" con su "Sin resultados" |
| Sin propios, y falla la consulta | Destacada: "No se pudo consultar Precios Claros" y el botón |
| Sin propios, sin Supabase | Destacada: "No encontramos "alfajor luna" en tus productos." y el botón |
| Menos de 3 caracteres, sin propios (el catálogo no se consulta) | Discreta |
| Con algún resultado, propio o del catálogo | Discreta, al final: **¿No está? Cargar "alfajor luna" a mano** |

- Si el texto es un código válido (`toGtin13`), en lugar del texto entre comillas dice el código normalizado: "El código
  7790001000012 no está en tus productos ni en Precios Claros." y **Cargar el código 7790001000012 a mano**.
- El mensaje destacado se anuncia (`role="status"`).

### Cómo se abre el formulario

| Desde | Nombre | Código de barras |
|---|---|---|
| La oferta (destacada o discreta), con texto | El texto buscado, tal como se escribió y editable | Vacío |
| La oferta, con un código válido | Vacío | El código, normalizado |
| El lector del buscador o `?tab=precio&ean=…`, con un código que no está en Precios Claros, si falla la consulta o sin Supabase | Vacío | El código leído |

- El resto de los campos, vacío; la unidad de la presentación, `g`.
- El foco pasa a **Nombre**.
- Los códigos propios o del catálogo leídos con el lector del buscador se eligen directamente, como hoy.

### El formulario

Todos los campos a la vista, en este orden:

| Campo | Regla |
|---|---|
| **Nombre** | Obligatorio: "Completá el nombre" |
| **Código de barras** (opcional) | Teclado numérico y lector |
| **Marca** (opcional) | Texto |
| **Presentación** (opcional) | Número mayor que 0 y unidad (`g`, `kg`, `ml`, `l`, `u`); sin número válido no se guarda ninguna de las dos |
| **Categoría** (opcional) | Texto libre con sugerencias; vacía no se guarda |
| **Foto** (opcional) | `PhotoField` de la spec 27, sin cambios |

- Nombre, marca y categoría se guardan sin espacios de más.
- El título del bloque es "Producto nuevo", con **Cambiar** al lado.
- **Cambiar:** descarta lo completado (también la foto), vuelve al buscador con el texto buscado y sus resultados, y el
  foco queda en el buscador. Si se llegó por el lector o por la URL, el buscador vuelve vacío. Con un producto elegido
  de la lista, **Cambiar** también conserva el texto.
- Al guardar, el producto se crea con su precio como en la spec 26; después el buscador queda vacío.

### El código de barras en el formulario

Se revisa al leerlo, o 300 ms después de escribir si es válido. Una respuesta vieja se descarta. No se vuelve a consultar
el código que el buscador o el lector acaba de buscar.

| El código | Qué se ve junto al campo | ¿Deja guardar? |
|---|---|---|
| Vacío | Nada | Sí |
| Incompleto o inválido | Nada mientras se escribe; al guardar, "Código de barras inválido" | No; foco en el campo |
| De un producto propio | "Ya tenés este producto: <nombre>" y **Usar este producto** | No; foco en el campo |
| En Precios Claros | "Este código está en Precios Claros: <nombre sugerido>, marca y presentación" con su imagen de 48 px y **Usar este producto** | Sí: se guarda lo escrito, con ese código |
| Consultando | "Buscando el código…" | Sí |
| Fuera de Precios Claros | "El código … no está en Precios Claros." | Sí |
| Falla la consulta | "No se pudo consultar Precios Claros." | Sí |
| Sin Supabase | Nada | Sí |

- **Usar este producto** reemplaza el formulario por ese producto elegido (propio o del catálogo), descarta lo completado
  y lleva el foco a Precio.
- Al guardar se mira de nuevo si el código es de un producto propio, por si llegó uno por la sincronización.
- El orden de los errores es el de la pantalla: comercio, producto, nombre, código, precio.

### Sugerencias de categoría

- Las de los productos propios y las 8 fijas de hoy, sin repetir (sin distinguir mayúsculas ni acentos: queda la
  escritura propia), en orden alfabético.
- Las mismas en Cargar precio y en Agregar producto.

## Modelo de datos

Sin datos guardados nuevos, sin claves nuevas de `localStorage` y sin migraciones: `Product` ya tiene todos los campos.

```typescript
// src/lib/price-form.ts
export type PriceProductChoice =
  | { kind: 'own'; product: Product }
  | { kind: 'sepa'; sepa: SepaProduct }
  | { kind: 'new'; form: ProductForm; photo?: PhotoDraft };  // antes: ean?, name, brand, photo?

/** Formulario con el que se abre la carga a mano: lo escrito va al nombre o, si es un código válido, al código */
export function manualProductForm(query: string): ProductForm;

/** Qué mostrar debajo de los resultados; null: nada (sin texto o buscando) */
export function manualOffer(input: {
  query: string;
  ownCount: number;
  catalog: { status: 'idle' | 'loading' | 'done' | 'error'; count: number };
  catalogEnabled: boolean;
}): { prominent: boolean; message: string | null; label: string } | null;

// resolvePriceProduct: el caso 'new' usa productFromForm

// src/lib/product-form.ts
export const CATEGORIES: string[];  // sale de UploadForm.tsx
export function categorySuggestions(products: Product[]): string[];
```

## UI/UX

```
Sin resultados                           Formulario
┌──────────────────────────────────┐     ┌──────────────────────────────────┐
│ Producto *                       │     │ Producto nuevo          Cambiar  │
│ [alfajor luna          ] [lector]│     │ Nombre                           │
│                                  │     │ [alfajor luna                  ] │
│ No encontramos "alfajor luna" en │     │ Código de barras (opcional)      │
│ tus productos ni en Precios      │     │ [                     ] [lector] │
│ Claros.                          │     │ Marca (opcional)                 │
│ [+ Cargar "alfajor luna" a mano] │     │ [                              ] │
└──────────────────────────────────┘     │ Presentación (opcional)          │
                                         │ [              ] [g v]           │
Con resultados                           │ Categoría (opcional)             │
│ ...lista...                      │     │ [                              ] │
│ ¿No está? Cargar "alfajor luna"  │     │ Foto (opcional)                  │
│ a mano                           │     │ [Agregar foto]                   │
└──────────────────────────────────┘     └──────────────────────────────────┘
```

- Destacada: `.btn-secondary` de ancho completo con `CirclePlus` (`aria-hidden`); el principal de la pantalla sigue
  siendo "Guardar precio". Discreta: link de texto de 44 px de alto.
- Un texto largo se parte en renglones; no se corta.
- Errores y avisos junto a su campo (`aria-invalid`, `aria-describedby`).
- Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Funciones puras (TDD):** `manualProductForm` y `manualOffer` en `price-form.ts`; `CATEGORIES` y
   `categorySuggestions` en `product-form.ts`, con sus tests (cada fila de las tablas, códigos EAN-8 y UPC-A, texto en
   blanco, categorías repetidas con acentos).
   **Verificar:** `npm test`.
2. **Campos compartidos:** `src/components/CategoryInput.tsx` (con su `datalist` de `id` único) y
   `src/components/SizeInput.tsx`, sacados de `UploadForm.tsx`, que pasa a usarlos.
   **Verificar:** Agregar producto igual que antes, con las categorías propias entre las sugerencias.
3. **Modelo del producto nuevo (TDD):** `PriceProductChoice` con `form`; `resolvePriceProduct` con `productFromForm`;
   adaptar `useEanLookup`, `PriceProductPicker.tsx` y `PriceForm.tsx` sin cambiar lo que se ve.
   **Verificar:** `npm test`; casos B y C guardan como hoy.
4. **Formulario:** `src/components/ManualProductFields.tsx` con todos los campos, salvo el código, que todavía se ve
   como texto; reemplaza a `NewProductFields`.
   **Verificar:** guardar con todos los datos y solo con el nombre; el detalle los muestra.
5. **Código de barras:** `src/components/useManualEan.ts` (propio, catálogo, fuera, falla) y el campo con lector, los
   avisos, **Usar este producto** y la validación al guardar en `PriceForm.tsx`.
   **Verificar:** cada fila de la tabla del código, con lector y escrito.
6. **Oferta y Cambiar:** la oferta en `PriceProductPicker.tsx`, sin el link "No tiene código de barras"; el texto del
   buscador se conserva al volver, y el foco.
   **Verificar:** cada fila de la tabla de la oferta, sin conexión y sin Supabase.
7. **Docs:** `CLAUDE.md` (Estructura, Cargar precio, Agregar producto, Estado Actual) y una nota en la spec 26: la 34
   reemplaza "No tiene código de barras" y los formularios B y C.

**A revisar a mano (sin test automático):** en el celular, la foto con la cámara y el lector dentro del formulario; y con
cuenta, que el producto llegue entero a otro dispositivo.

## Criterios de aceptación

- [ ] Buscar "alfajor luna" sin coincidencias muestra el mensaje y **Cargar "alfajor luna" a mano**; no se ve "Sin
      resultados".
- [ ] Con resultados, **¿No está? Cargar … a mano** aparece al final de la lista; mientras busca no aparece.
- [ ] Sin conexión o sin Supabase, la oferta aparece igual.
- [ ] Ya no existe "No tiene código de barras", y con el buscador vacío no hay oferta.
- [ ] Desde la oferta, el formulario se abre con el texto buscado en Nombre, editable y con el foco ahí; guardar sin tocarlo
      usa ese nombre, y cambiarlo usa el nuevo.
- [ ] Escribir un código válido sin coincidencias abre el formulario con el código en su campo y el nombre vacío.
- [ ] Leer con el buscador un código fuera de Precios Claros abre el mismo formulario con el código editable, sin
      consultarlo dos veces.
- [ ] Guardar con todos los campos crea un producto con nombre, código, marca, presentación, categoría y foto, y su
      precio; el detalle los muestra.
- [ ] Guardar solo con el nombre crea el producto sin los demás campos. Sin nombre: "Completá el nombre".
- [ ] Presentación vacía o en 0 no guarda número ni unidad.
- [ ] Un código inválido no deja guardar ("Código de barras inválido").
- [ ] Un código de un producto propio no deja guardar; **Usar este producto** lo elige y no crea otro.
- [ ] Un código de Precios Claros ofrece **Usar este producto**; sin tocarlo, se guarda lo escrito con ese código.
- [ ] **Cambiar** vuelve al buscador con el texto y los resultados, y no crea ningún producto ni deja fotos en IndexedDB.
- [ ] Después de guardar queda el comercio, y el buscador, vacío y con el foco.
- [ ] Una categoría usada por un producto propio aparece una sola vez entre las sugerencias, en las dos pestañas.
- [ ] Agregar producto, Buscar y la oferta del lector no cambian (salvo las sugerencias de categoría).
- [ ] Teclado y lector de pantalla: la oferta se anuncia y el foco nunca se pierde al abrir, cambiar o usar un producto.
- [ ] 320 y 375 px sin scroll horizontal; `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.

## Decisiones

- **La oferta va siempre, no solo sin resultados** (elegido por el usuario): Precios Claros casi siempre devuelve algo
  parecido, y solo sin resultados la oferta no aparecería cuando hace falta.
- **Se saca "No tiene código de barras"** (elegido por el usuario): una sola entrada. Cuesta escribir algo antes, pero
  eso ya completa el nombre y evita repetir un producto propio. Descartado: dejarlo o renombrarlo.
- **Código optativo en el formulario** (elegido por el usuario): no aparecer por nombre no es no tener código, y el grupo
  solo ve precios de productos con código. Descartado: cargar sin código y vincular después.
- **Código en Precios Claros: se ofrece, no se impone** (elegido por el usuario): no se pierde lo escrito. Descartado:
  elegirlo directamente, o completar solo lo vacío.
- **Código de un propio: no deja guardar** (elegido por el usuario): el código es único, y guardar en silencio en el otro
  producto perdería lo escrito. Descartado: usarlo directamente.
- **Un solo formulario, con el código editable también al leerlo** (elegido por el usuario). Descartado: código fijo.
- **Todos los campos a la vista** (elegido por el usuario). Descartado: plegar los optativos.
- **El código va segundo:** si está en Precios Claros, ahorra completar el resto.
- **Sugerencias fijas más las propias** (elegido por el usuario). Descartado: solo las fijas.
- **Cambiar conserva el texto** (elegido por el usuario para el formulario); se extiende al producto elegido de la lista
  para que **Cambiar** haga siempre lo mismo.
- **Un código escrito va al campo código** (elegido por el usuario). Descartado: dejarlo como nombre.
- **`ProductForm` en lugar de campos sueltos:** es el mismo formulario de Agregar producto y ya tiene las reglas de
  presentación y categoría.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Se crean productos repetidos con nombres parecidos | La oferta va después de los resultados; con código, se avisa |
| El formulario largo aleja el precio del comercio en el celular | Solo el nombre es obligatorio; "Enter" y el error llevan al campo que falta |
| La oferta parpadea al escribir | Solo aparece con la búsqueda terminada, debajo de los resultados, sin mover el campo |

## Qué **no** entra en esta spec

- Carga a mano desde Buscar, el carrito o la oferta del lector de Buscar.
- Crear el producto sin precio desde Cargar precio.
- Editar un producto ya creado.
- Detectar o unir productos parecidos.
- Corregir la escritura de las categorías fijas.

Cada una, si llega, va en su propia spec.
