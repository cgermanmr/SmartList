# SPEC 05 — Exportar compras y precios a CSV

> **Estado:** Borrador
> **Depende de:** [SPEC 02](02-boton-repetir-historial.md) (mismo template de `/purchases`), [SPEC 03](03-panel-gasto-mensual.md) (`paymentLabel`)
> **Fecha:** 2026-10-28
> **Objetivo:** Permitir descargar desde `/purchases` el historial de compras y el historial de precios como archivos CSV que se abren bien con doble clic en Excel en español.

Origen: [`docs/ideas.md`](../docs/ideas.md) → *Análisis de gastos* → "Exportar historial de compras y precios a CSV".

## Por qué existe esta spec

Los datos viven solo en el `localStorage` del navegador: no hay backup, no se pueden pasar a otro dispositivo
y no se pueden analizar en una planilla. Exportar a CSV resuelve las tres cosas mientras no exista el backend
de la Fase 2, sin agregar dependencias.

Excel con configuración regional de Argentina usa `;` como separador de lista y `,` como separador decimal, y
sin BOM interpreta el archivo como ANSI (rompe tildes y ñ). El formato se elige para ese caso.

## Alcance

**Incluye:**

- Dos botones en el encabezado de `/purchases`: "⬇️ Compras CSV" y "⬇️ Precios CSV".
- CSV de compras con **una fila por ítem** de cada compra.
- CSV de precios con una fila por `Price` registrado.
- Formato para Excel en español: separador `;`, decimales con coma, BOM UTF-8, fin de línea `\r\n`.
- Escapado de valores con `;`, comillas o saltos de línea, y neutralización de fórmulas.
- Funciones puras en `src/app/utils/csv.ts` y descarga con `Blob`, sin librerías.

**Fuera de alcance (para specs futuras):**

- Importar CSV (restaurar un backup).
- Elegir formato (CSV estándar con `,`) o exportar a `.xlsx`.
- Exportar productos, carrito o calculadora.
- Filtrar por rango de fechas antes de exportar.
- Compartir el archivo con la Web Share API.
- Tests unitarios.

## Modelo de datos

Sin datos persistidos nuevos.

### Columnas

**`preciolocal-compras-AAAA-MM-DD.csv`** — en el orden en que están guardadas las compras (más reciente primero) y los ítems dentro de cada una:

| Columna | Origen | Formato |
|---|---|---|
| Fecha | `Purchase.date` | `dd/MM/yyyy HH:mm`, hora local |
| ID compra | `Purchase.id` | texto (agrupa las filas de una misma compra) |
| Comercio | `Purchase.store` | texto, vacío si no hay |
| Barrio | `Purchase.barrio` | texto, vacío si no hay |
| Medio de pago | `paymentLabel(Purchase.paymentMethod)` | texto |
| Producto | `CartItem.productName` | texto |
| Categoría | `Product.category` por `productId` | texto, `Sin categoría` si no existe |
| Cantidad | `CartItem.quantity` | número |
| Precio unitario | `CartItem.price` | dinero |
| Subtotal | `CartItem.subtotal` | dinero |
| Total compra | `Purchase.total` | dinero (se repite en cada fila de la compra) |

**`preciolocal-precios-AAAA-MM-DD.csv`** — ordenado por fecha, más reciente primero:

| Columna | Origen | Formato |
|---|---|---|
| Fecha | `new Date(Price.date)` | `dd/MM/yyyy HH:mm`, hora local |
| Producto | `Product.name` por `productId` | texto, `Producto desconocido` si no existe |
| Categoría | `Product.category` | texto, `Sin categoría` si no existe |
| Monto | `Price.amount` | dinero |
| Barrio | `Price.barrio` | texto |
| Comercio | `Price.store` | texto, vacío si no hay |

`AAAA-MM-DD` es la fecha local del día de la descarga.

### Funciones — `src/app/utils/csv.ts`

| Función | Qué hace |
|---|---|
| `formatMoney(n)` | 2 decimales con coma, sin separador de miles: `1234.5` → `1234,50` |
| `formatNumber(n)` | Sin decimales fijos, con coma: `2` → `2`, `1.5` → `1,5` |
| `formatDateTime(value)` | `dd/MM/yyyy HH:mm` en hora local; acepta `string` o `Date` |
| `escapeCell(value)` | Neutraliza fórmulas y escapa comillas (ver reglas) |
| `toCsv(headers, rows)` | BOM + encabezado + filas, `;` entre celdas y `\r\n` entre filas |
| `purchasesToCsv(purchases, products)` | Arma el CSV de compras |
| `pricesToCsv(prices, products)` | Arma el CSV de precios |
| `downloadFile(filename, content)` | `Blob` (`text/csv;charset=utf-8`) + `URL.createObjectURL` + `<a download>` + `revokeObjectURL` |

### Reglas de escapado

- Solo en celdas de **texto** (no en números ya formateados): si el valor empieza con `=`, `+`, `-`, `@`, tabulación o retorno de carro, se le antepone `'` para que Excel no lo evalúe como fórmula.
- Si el valor contiene `;`, `"`, `\n` o `\r`, se encierra entre comillas dobles y cada `"` interna se duplica.
- `undefined` y `null` se exportan como celda vacía.
- El BOM (`﻿`) va una sola vez al principio del archivo.

## UI/UX

- Encabezado de `/purchases`: el `h1` "Historial de Compras" a la izquierda y los dos botones a la derecha
  (`flex flex-wrap justify-between items-center gap-2`), con estilo `.btn-secondary` en tamaño chico.
- "⬇️ Compras CSV" deshabilitado si no hay compras; "⬇️ Precios CSV" deshabilitado si no hay precios. Ambos con `title` que explica el contenido.
- En 375 px los botones bajan debajo del título si no entran.
- Sin mensajes de confirmación: la descarga del navegador es la confirmación.

## Plan de implementación

1. **Formato y escapado.** Crear `src/app/utils/csv.ts` con `formatMoney`, `formatNumber`, `formatDateTime`, `escapeCell` y `toCsv`. Verificar: build compila.
2. **Armado de los archivos.** Agregar `purchasesToCsv` y `pricesToCsv` en el mismo archivo, con una sección `// ── Exportación ─────`, usando `paymentLabel` de `src/app/utils/payment-methods.ts`. Verificar: build compila.
3. **Descarga.** Agregar `downloadFile`. Verificar: build compila.
4. **Botones.** En `src/app/pages/purchases/purchases.component.ts` agregar `exportPurchases()` y `exportPrices()`, leyendo `getPurchases()`, `getPrices()` y `getProducts()` de `DataService`. En el `.html` agregar los botones en el encabezado. Verificar: con datos se descargan los dos archivos; sin compras, el botón de compras está deshabilitado.
5. **Prueba en Excel.** Abrir ambos archivos con doble clic en Excel con configuración regional es-AR (y en Google Sheets como control). Verificar: criterios de aceptación.
6. **Documentación.** Actualizar `CLAUDE.md` (Funcionalidades → Historial de compras, árbol con `csv.ts`) y quitar "Exportar historial de compras y precios a CSV" de `docs/ideas.md`.

## Datos de prueba

**Prueba 1** — fixture de compras de la [spec 03](03-panel-gasto-mensual.md#datos-de-prueba) sin cambios.
Los criterios de filas, primera fila y suma de subtotales se verifican con este fixture.

**Prueba 2** — escapado. Agregar a `preciolocal_products` un producto con nombre y categoría problemáticos y
cargarle un precio desde "Cargar Precio" con monto `1234.5`:

```json
{ "id": "100", "name": "Pan; \"casero\"", "category": "=SUMA(1;1)" }
```

## Criterios de aceptación

- [ ] `npm run build:prod` termina sin errores ni warnings nuevos.
- [ ] `/purchases` muestra "⬇️ Compras CSV" y "⬇️ Precios CSV"; sin compras el primero está deshabilitado.
- [ ] Los archivos se llaman `preciolocal-compras-AAAA-MM-DD.csv` y `preciolocal-precios-AAAA-MM-DD.csv` con la fecha del día.
- [ ] Los tres primeros bytes de cada archivo son `EF BB BF` (BOM UTF-8).
- [ ] Con doble clic en Excel es-AR cada columna queda en su celda y "Categoría", "Débito" y "Sin categoría" se ven con tildes.
- [ ] Con el fixture de la spec 03, el CSV de compras tiene 1 encabezado y 6 filas; la primera es `31/10/2026 22:00;3;;;Efectivo;Pan Frances;Almacen;4;600,00;2400,00;2400,00`.
- [ ] La compra sin medio de pago se exporta con "Sin especificar" y el producto `999` con "Sin categoría".
- [ ] La suma de la columna Subtotal da $16.000, igual que la suma de los totales en pantalla.
- [ ] `1234.5` se exporta como `1234,50` y Excel lo reconoce como número.
- [ ] `Pan; "casero"` queda en una sola celda con las comillas visibles.
- [ ] `=SUMA(1;1)` se ve como texto y no se evalúa.
- [ ] El CSV de precios ordena del más reciente al más viejo y usa el nombre del producto, no el id.
- [ ] Repetir, expandir compras y el resto de las páginas funcionan igual que antes.

## Decisiones

- **Sí:** formato para Excel en español (`;`, coma decimal, BOM). Es la herramienta más probable del usuario y abre con doble clic sin asistente de importación.
- **No:** CSV estándar con `,` y punto decimal. En Excel es-AR abre todo en una sola columna.
- **Sí:** una fila por ítem en el CSV de compras, repitiendo los datos de la compra. Es la forma que se puede filtrar y sumar con una tabla dinámica.
- **No:** una fila por compra con los ítems concatenados. No sirve para analizar por producto.
- **Sí:** neutralizar fórmulas. Los nombres y categorías son texto libre; un valor que empieza con `=` se ejecutaría al abrir el archivo.
- **Sí:** funciones puras en `utils/csv.ts` y sin librerías. Son pocas líneas y quedan listas para testear.
- **Sí:** botones en `/purchases`. Es donde se consulta el historial; el panel `/gastos` es de análisis y no hace falta duplicarlos.
- **Sí:** exportar el nombre y la categoría actuales del producto en el CSV de precios. `Price` solo guarda `productId`, que no le dice nada a quien abre la planilla.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Excel con configuración regional en inglés abre todo en una columna | Documentado; Google Sheets y "Datos → Desde texto" permiten elegir `;` |
| `<a download>` no funciona igual en iOS Safari en modo PWA | Probar en iPhone; si falla, abrir el `Blob` en pestaña nueva en otra spec (o Web Share API) |
| Datos con fechas inválidas en `localStorage` | `formatDateTime` devuelve celda vacía si la fecha no es válida |
| El apóstrofo de neutralización se ve en celdas que empiezan con `-` legítimamente | Aceptado: solo afecta texto libre, no columnas numéricas |

## Lo que **no** incluye esta spec

- Importar CSV.
- Otros formatos (`,`, `.xlsx`).
- Exportar productos, carrito o calculadora.
- Filtro por fechas.
- Web Share API.
- Tests unitarios.

Cada uno de estos, si llega, va en su propia spec.
