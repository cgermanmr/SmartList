# SPEC 03 — Panel de gasto mensual

> **Estado:** Implementado
> **Depende de:** [SPEC 06](06-migracion-nextjs-vercel.md), [SPEC 14](14-carrito-por-comercio.md), [SPEC 15](15-precios-y-comercios-cercanos.md), [SPEC 19](19-restyling-base-y-navegacion.md)
> **Fecha:** 2026-11-17
> **Objetivo:** Agregar una página `/gastos`, a la que se llega desde Historial, que muestre a partir de las compras cuánto se gastó por mes, cómo se compara con el mes anterior y cómo se reparte por cadena o comercio y por medio de pago.

Origen: [`docs/ideas.md`](../docs/ideas.md) → *Análisis de gastos* → "Panel de gasto mensual".

Reescrita el 2026-11-17 para Next.js. La versión del 2026-10-28 era para Angular y nunca se implementó. Desde
entonces la navegación pasó a ser una barra inferior de 5 pestañas (spec 19), la categoría se volvió opcional
(spec 18) y cada compra pasó a ser de un solo comercio (spec 14).

## Por qué existe esta spec

El propósito de la app es "analizar la suba de precios y el gasto". Hoy el gasto solo se ve compra por compra en
`/purchases`: no hay forma de saber cuánto se gastó en octubre, si fue más que en septiembre ni dónde se fue la
plata.

Todos los datos ya están en `Purchase`: fecha, total, comercio y medio de pago. Desde la spec 14 cada compra es de
un solo comercio, así que hoy se puede desglosar por comercio, algo que la versión anterior de esta spec dejaba afuera.

La [spec 04](04-inflacion-personal.md) le agrega a `/gastos` la sección de inflación personal.

## Alcance

**Incluye:**

- Página nueva `/gastos`. No va en la barra de navegación: se llega desde una tarjeta arriba de Historial, y
  mientras se está en `/gastos` queda activa la pestaña **Historial**.
- **Tarjeta en Historial** (solo si hay compras), que lleva a `/gastos`: total del mes calendario actual y
  variación contra el mes anterior.
- **Selector de mes**: recorre los meses con compras y el mes actual. Abre en el mes actual.
- **Resumen del mes**: total gastado, cantidad de compras, ticket promedio y variación contra el mes calendario anterior.
- **Gráfico de barras** con los 6 meses calendario que terminan en el mes elegido. Tocar la barra de un mes con
  compras lo selecciona.
- **Desglose por cadena o comercio**: las sucursales de una misma cadena del SEPA se suman en una fila.
- **Desglose por medio de pago**: los ids de la versión Angular (`'efectivo'`) y los labels actuales
  (`'Efectivo'`) se suman juntos.
- Estado vacío, sin compras, y mes actual sin compras.
- Lista de medios de pago compartida en `src/lib/payment-methods.ts` (hoy vive solo en el carrito). Historial pasa
  a mostrar el medio de pago con `paymentLabel` (una compra vieja con `'efectivo'` dice "Efectivo").
- `StoreRef.chain`: nombre de la cadena, guardado desde ahora en los comercios que vienen del SEPA.
- Lógica de agregación como funciones puras en `src/lib/spending.ts`, con tests de Vitest.

**Fuera de alcance (para specs futuras):**

- Desglose por **categoría**. Desde la spec 18 la mayoría de los productos no la tiene.
- Inflación personal ([spec 04](04-inflacion-personal.md); su adaptación a Next.js va en esa spec).
- Presupuesto mensual y avisos.
- Rangos de fechas libres, comparación por semana o por año, gráfico de más de 6 meses.
- Tocar una fila de un desglose para ver sus compras.
- Completar `chain` en las compras ya guardadas (no hay migración de datos).
- Pestaña propia de Gastos en la barra de navegación.

## Modelo de datos

No hay claves de localStorage nuevas: todo se calcula desde `purchases`. Lo único que cambia en lo persistido es un
campo opcional nuevo en `StoreRef`.

### `StoreRef.chain` — `src/lib/models.ts`

```typescript
interface StoreRef {
  name: string;
  barrio?: string;
  address?: string;
  sepaId?: string;
  chain?: string;      // nuevo: nombre de la cadena (bandera) si viene del SEPA, p. ej. "Coto"
  lat?: number;
  lng?: number;
}
```

`storeRefFromBranch` completa `chain` con `branch.chain`. Viaja dentro de `CartItem.store` y, al comprar, queda en
los ítems de la `Purchase`. Las compras ya guardadas no lo tienen: ver *Agrupación por comercio*.

### Medios de pago — `src/lib/payment-methods.ts`

```typescript
export interface PaymentMethod {
  id: string;
  label: string;
}

// Misma lista y orden que hoy está en src/app/cart/page.tsx
export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'efectivo',      label: 'Efectivo'           },
  { id: 'debito',        label: 'Débito'             },
  { id: 'credito1',      label: 'Crédito (1 cuota)'  },
  { id: 'creditoN',      label: 'Crédito en cuotas'  },
  { id: 'transferencia', label: 'Transferencia / QR' },
  { id: 'cheque',        label: 'Cheque'             },
];

export const NO_PAYMENT = 'Sin especificar';

/** id o label conocido → label; vacío o ausente → "Sin especificar"; otro valor → el valor tal cual */
export function paymentLabel(value: string | undefined): string;
```

`src/lib/` no depende de React. Los íconos de lucide quedan en el carrito, en un `Record<id, LucideIcon>`. El carrito
sigue guardando el **label** en `Purchase.paymentMethod`, como hoy.

### Resultados calculados — `src/lib/spending.ts`

```typescript
export interface MonthSummary {
  month: string;           // 'YYYY-MM'
  total: number;           // suma de Purchase.total
  count: number;           // cantidad de compras
  average: number | null;  // total / count; null si count = 0
}

export interface MonthTotal {
  month: string;           // 'YYYY-MM'
  total: number;           // 0 si no hubo compras
  count: number;
}

export interface Breakdown {
  key: string;             // clave de agrupación (estable para React)
  label: string;           // cadena, comercio o medio de pago
  amount: number;
  percent: number;         // amount / total del mes × 100
}
```

| Función | Devuelve |
|---|---|
| `monthKey(date: Date \| string)` | `'YYYY-MM'` según la **hora local** del dispositivo |
| `previousMonth(month)` | Mes calendario anterior (`'2026-01'` → `'2025-12'`) |
| `availableMonths(purchases, current)` | Meses con al menos una compra más `current`, del más viejo al más nuevo, sin repetidos |
| `monthSummary(purchases, month)` | `MonthSummary` |
| `lastMonthsTotals(purchases, month, n)` | `n` meses calendario terminando en `month`, del más viejo al más nuevo, con los que dan 0 |
| `monthVariation(purchases, month)` | `(total − total anterior) / total anterior × 100` contra el mes calendario anterior; `null` si alguno de los dos meses no tiene compras |
| `byStore(purchases, month)` | `Breakdown[]` sumando `Purchase.total` por cadena o comercio |
| `byPayment(purchases, month)` | `Breakdown[]` sumando `Purchase.total` por `paymentLabel(paymentMethod)` |

### Meses — `src/lib/format.ts`

| Función | Ejemplo |
|---|---|
| `formatMonth(month)` | `'2026-11'` → `'Noviembre 2026'` |
| `monthName(month)` | `'2026-10'` → `'octubre'` |
| `shortMonth(month)` | `'2026-09'` → `'sep'` |

Usan un arreglo propio `MONTH_NAMES` en español, no `Intl`: el nombre corto de `Intl` cambia entre versiones de ICU
(`'sept'`, `'sep.'`), y estas funciones tienen que dar lo mismo en el navegador, en Node y en los tests.

### Reglas de cálculo

- **Mes de una compra:** sale de `new Date(purchase.date)` en hora local. Una compra del 31/10 a las 22:00 en
  Argentina (guardada como `2026-11-01T01:00:00.000Z`) cuenta en **octubre**.
- **Agrupación por comercio** (`byStore`), en este orden:
  1. Si algún ítem tiene `store.sepaId`, la compra va a su **cadena**. La clave es la bandera, es decir, las dos
     primeras partes del id (`'10-1-123'` → `sepa:10-1`). El nombre es `store.chain`. Si ningún ítem del grupo lo
     tiene (compras de antes de esta spec), es el texto anterior a `' — '` en `Purchase.store`, y si no hay
     `' — '`, `Purchase.store` entero.
  2. Si no hay `sepaId` pero sí `Purchase.store`, la clave es el nombre sin mayúsculas ni espacios de más (la misma
     normalización que `storeKey`). El nombre que se muestra es el `Purchase.store` de la compra más reciente del
     grupo en el mes, sin espacios al principio ni al final.
  3. Sin `Purchase.store`: **"Sin comercio"**.
- **Medio de pago:** `paymentLabel(purchase.paymentMethod)`; `'efectivo'` y `'Efectivo'` son la misma fila.
- **Orden de los desgloses:** monto de mayor a menor; a igual monto, por `label` alfabético (`localeCompare`
  con `'es-AR'`). "Sin comercio" y "Sin especificar" se ordenan como cualquier otra fila.
- La suma de los montos de cada desglose es igual al total del mes: cada compra entra entera en una sola fila.
- **Redondeo solo al mostrar:** montos con `formatMoney`, porcentajes con `formatPct` ("69,1 %").
- **Variación:** se muestra como "X % más" (rojo, `text-red-600`), "X % menos" (verde, `text-green-600`) o "Igual"
  (azul, `text-blue-600`) si el valor absoluto es menor a 0,05. Son los colores del carrito. Si es `null`: "—".

## UI/UX

### Tarjeta en Historial (`src/app/purchases/page.tsx`)

- Va entre el título y la lista, solo si hay al menos una compra. Es un `<Link href="/gastos">` con clase `.card`,
  de al menos 44 px de alto, con `ChevronRight` a la derecha.
- Primera línea: "Noviembre: $5.000,00".
- Segunda línea, en este orden de prioridad:
  - Mes actual sin compras: "Todavía no compraste este mes".
  - Mes anterior sin compras: no hay segunda línea.
  - Si no: la variación, "54,5 % menos que octubre" en verde, "X % más que octubre" en rojo o "Igual que octubre" en azul.
- Texto del link: "Ver gastos".

### Página `/gastos` (`src/app/gastos/page.tsx`)

- **Encabezado:** link "Historial" con `ArrowLeft` (vuelve a `/purchases`), título "Gastos" y el selector
  `ChevronLeft` · "Noviembre 2026" · `ChevronRight`.
  - Los botones del selector son de solo ícono, de 44 px, con `aria-label` "Mes anterior" / "Mes siguiente".
  - ◀ queda deshabilitado en el primer mes de `availableMonths` y ▶ en el último.
- **Tarjetas de resumen** (`grid-cols-2 md:grid-cols-4`, `.card`):
  - "Total del mes".
  - "Compras".
  - "Ticket promedio" ("—" si no hay compras).
  - "Vs. <mes anterior>", por ejemplo "Vs. octubre": la variación con su color, o "—".
- **Gráfico** (`src/components/SpendingChart.tsx`): 6 columnas de igual ancho, hechas con HTML y Tailwind (no SVG).
  - Cada columna tiene una barra de alto proporcional al total, con `style={{ height: '…%' }}`, y debajo el mes
    corto (`shortMonth`).
  - El mes elegido va en `primary-700` y los demás en `primary-200`.
  - Una columna de un mes con compras es un `<button>` que ocupa la columna entera, con `aria-label`
    "Septiembre 2026: $6.000,00" y `aria-pressed` en el elegido. Un mes sin compras no es botón: muestra solo una
    línea base de 2 px.
  - Si los 6 meses dan 0, el gráfico muestra solo las líneas base.
- **Desgloses** (`src/components/SpendingBreakdown.tsx`): dos tarjetas, "Por comercio" y "Por medio de pago"
  (`grid-cols-1 md:grid-cols-2`).
  - Cada fila tiene el nombre (`truncate`), el monto, el porcentaje y una barra horizontal `primary-700` sobre
    `primary-100`, con `style={{ width: '…%' }}`.
- **Mes sin compras** (solo puede ser el mes actual): tarjetas con $0,00, 0 compras y "—". En lugar de los
  desgloses va "Todavía no compraste este mes" con el link "Ir al carrito" a `/cart`.
- **Sin ninguna compra:** solo el encabezado sin selector, "Todavía no hay compras" y el link "Ir al carrito".
- El mes elegido es estado local (`useState`) y arranca en el mes actual: `useState(() => monthKey(new Date()))`,
  como el `now` de Buscar. Con `<Activity>` se conserva al volver a la página.

### Navegación (`src/components/NavBar.tsx`)

- `LINKS` admite rutas extra por pestaña (`match?: string[]`). Historial lleva `match: ['/gastos']`, y en `/gastos`
  queda con `aria-current="page"`.

## Plan de implementación

1. **Medios de pago compartidos.**
   - Crear `src/lib/payment-methods.ts` con `PaymentMethod`, `PAYMENT_METHODS`, `NO_PAYMENT` y `paymentLabel`, más
     `payment-methods.test.ts`.
   - En `src/app/cart/page.tsx`, usar `PAYMENT_METHODS` y un mapa local `id → ícono`.
   - En `src/app/purchases/page.tsx`, mostrar `paymentLabel(purchase.paymentMethod)`.
   - Verificar: el checkout muestra los 6 medios con sus íconos y guarda el label como antes; `npm test` pasa.
2. **Cadena en el comercio.**
   - Agregar `chain?` a `StoreRef` y completarlo en `storeRefFromBranch`, con su caso en `sepa.test.ts`.
     *Al implementar:* el caso quedó en `sepa-nearby.test.ts`, donde ya estaban los tests de `storeRefFromBranch`.
   - Verificar: al agregar un producto en un comercio cercano, el ítem del carrito guardado en localStorage tiene `chain`.
3. **Meses en `format.ts`.**
   - Agregar `MONTH_NAMES`, `formatMonth`, `monthName` y `shortMonth`, con sus tests en `format.test.ts`.
4. **Lógica pura.**
   - Crear `src/lib/spending.ts` con las interfaces y funciones de la tabla, y `spending.test.ts` con los datos de
     prueba de abajo.
   - Las fechas de los tests se arman con `new Date(2026, 9, 31, 22, 0).toISOString()` (hora local), para que
     pasen en cualquier zona horaria, incluido el CI en UTC.
   - Verificar: `npm test` pasa con los números de los criterios.
5. **Página y navegación.**
   - Crear `src/app/gastos/page.tsx` (`'use client'`) con el encabezado, el estado vacío y el link a Historial.
   - Agregar `match` en `NavBar.tsx`.
   - Verificar: `/gastos` abre, Historial queda activa y `npm run build` pasa.
6. **Selector y resumen.** Agregar el selector de mes y las 4 tarjetas con `monthSummary` y `monthVariation`.
7. **Gráfico.** Crear `SpendingChart.tsx` con `lastMonthsTotals(..., 6)` y la selección al tocar.
8. **Desgloses.** Crear `SpendingBreakdown.tsx` y usarlo con `byStore` y `byPayment`; agregar el mensaje del mes sin compras.
   *Al implementar:* el texto de la variación ("X % más" / "X % menos" / "Igual" / "—", con su color) quedó en
   `src/components/SpendingVariation.tsx`, que usan `/gastos` y la tarjeta de Historial.
9. **Tarjeta en Historial.** Agregarla arriba de la lista de `/purchases`.
10. **Documentación.**
    - Actualizar `CLAUDE.md`: árbol (`gastos/`, `payment-methods.ts`, `spending.ts`, los dos componentes), tabla de
      Rutas (`/gastos`, Nav "Historial"), `StoreRef.chain` en Modelos, Funcionalidades (Historial y la sección nueva
      Gastos) y Estado Actual.
    - En `docs/ideas.md`, sacar "Panel de gasto mensual" de *Análisis de gastos*.

## Datos de prueba

Pegar en DevTools → Application → Local Storage → `preciolocal_purchases`:

```json
[
  { "id": "6", "date": "2026-11-10T18:00:00.000Z", "total": 5000, "store": "Coto — Sucursal Palermo", "paymentMethod": "Débito",
    "items": [ { "id": "f", "productId": "1", "productName": "Leche 1L", "price": 1250, "quantity": 4, "subtotal": 5000,
                 "store": { "name": "Coto — Sucursal Palermo", "sepaId": "10-1-123", "chain": "Coto" } } ] },
  { "id": "5", "date": "2026-11-01T01:00:00.000Z", "total": 2400, "store": "Coto — Sucursal Belgrano", "paymentMethod": "efectivo",
    "items": [ { "id": "e", "productId": "2", "productName": "Pan Frances", "price": 600, "quantity": 4, "subtotal": 2400,
                 "store": { "name": "Coto — Sucursal Belgrano", "sepaId": "10-1-45" } } ] },
  { "id": "4", "date": "2026-10-20T15:00:00.000Z", "total": 1000, "paymentMethod": "Efectivo",
    "items": [ { "id": "d", "productId": "3", "productName": "Arroz 1kg", "price": 1000, "quantity": 1, "subtotal": 1000 } ] },
  { "id": "3", "date": "2026-10-12T15:00:00.000Z", "total": 2600, "store": "Verdulería Juan", "barrio": "Palermo", "paymentMethod": "Transferencia / QR",
    "items": [ { "id": "c", "productId": "4", "productName": "Aceite 1.5L", "price": 2600, "quantity": 1, "subtotal": 2600 } ] },
  { "id": "2", "date": "2026-10-05T15:00:00.000Z", "total": 5000, "store": "  verdulería   juan ", "paymentMethod": "transferencia",
    "items": [ { "id": "b", "productId": "6", "productName": "Fideos 500g", "price": 2500, "quantity": 2, "subtotal": 5000 } ] },
  { "id": "1", "date": "2026-09-15T15:00:00.000Z", "total": 6000, "store": "Verdulería Juan",
    "items": [ { "id": "a", "productId": "1", "productName": "Leche 1L", "price": 1000, "quantity": 6, "subtotal": 6000 } ] }
]
```

La compra `"5"` es el 31/10/2026 a las 22:00 en hora de Argentina (UTC−3). Los criterios manuales asumen esa zona
horaria y que se prueba en **noviembre de 2026** (el mes actual). Los tests de Vitest pasan el mes actual como
parámetro y no dependen de la fecha del sistema.

Totales: septiembre $6.000 (1 compra); octubre $11.000 (4 compras: 2.400 + 1.000 + 2.600 + 5.000); noviembre $5.000 (1 compra).

## Criterios de aceptación

- [x] `npm run lint`, `npm test` y `npm run build` terminan sin errores ni warnings.
- [x] La barra de navegación sigue con 5 pestañas. En `/gastos`, Historial tiene `aria-current="page"`.
- [x] Sin compras, Historial no muestra la tarjeta y `/gastos` muestra "Todavía no hay compras" con el link a
      `/cart`, sin selector ni errores en consola.
- [x] Con los datos de prueba, la tarjeta de Historial dice "Noviembre: $5.000,00" y "54,5 % menos que octubre"
      en verde, y lleva a `/gastos`.
- [x] `/gastos` abre en **Noviembre 2026**.
- [x] ◀ recorre Octubre 2026 y Septiembre 2026. ◀ está deshabilitado en Septiembre y ▶ en Noviembre.
- [x] Noviembre: total $5.000,00, 1 compra, ticket promedio $5.000,00, "Vs. octubre" 54,5 % menos en verde.
- [x] Octubre: total $11.000,00, 4 compras, ticket promedio $2.750,00, "Vs. septiembre" 83,3 % más en rojo. La
      compra del 31/10 22:00 cuenta en octubre, no en noviembre.
- [x] Septiembre: total $6.000,00, 1 compra, ticket promedio $6.000,00, "Vs. agosto" "—".
- [x] Con Noviembre elegido, el gráfico muestra jun–nov: jun, jul y ago con solo la línea base, sep y oct en
      `primary-200` y nov en `primary-700`. Tocar la barra de sep selecciona Septiembre 2026.
- [x] Por comercio en Octubre: Verdulería Juan $7.600,00 (69,1 %), Coto $2.400,00 (21,8 %), Sin comercio $1.000,00 (9,1 %).
- [x] Por comercio en Noviembre: Coto $5.000,00 (100 %).
- [x] Por comercio en Septiembre: Verdulería Juan $6.000,00 (100 %).
- [x] Por medio de pago en Octubre: Transferencia / QR $7.600,00 (69,1 %), Efectivo $3.400,00 (30,9 %).
- [x] Por medio de pago en Noviembre: Débito $5.000,00 (100 %). En Septiembre: Sin especificar $6.000,00 (100 %).
- [x] En Historial, la compra `"5"` muestra "Efectivo" y la `"2"` muestra "Transferencia / QR".
- [x] Con compras solo en meses anteriores, `/gastos` abre en el mes actual con $0,00, 0 compras, "—" en ticket y
      variación, y "Todavía no compraste este mes" con el link a `/cart`. La tarjeta de Historial dice
      "Todavía no compraste este mes".
- [x] Los tests de `spending.test.ts` cubren: compra de las 22:00 del último día del mes, cadena con `chain`, cadena
      sin `chain` (texto antes de `' — '`), comercio con mayúsculas y espacios distintos, compra sin comercio, id y
      label del mismo medio de pago, compra sin medio de pago, y suma de cada desglose igual al total del mes.
- [x] Al agregar un producto en un comercio cercano y comprarlo, la `Purchase` guardada tiene `chain` en sus ítems.
- [x] En 375 px, `/gastos` y la tarjeta de Historial no tienen scroll horizontal y las columnas del gráfico se pueden tocar.
- [x] El checkout del carrito sigue mostrando los 6 medios de pago con sus íconos y guarda el label.

## Decisiones

- **Sí:** página propia `/gastos`, a la que se llega desde una tarjeta en Historial. La barra inferior queda en 5
  pestañas de igual ancho (spec 19). Con 6, "Calculadora" se trunca en 375 px.
- **No:** sexta pestaña, ni reemplazar a Calculadora. **No:** pestañas dentro de `/purchases`: mezcla la lista
  operativa (repetir compras) con el análisis, y la spec 04 suma otra sección al panel.
- **Sí:** reescribir la spec 03 en el mismo archivo. Nunca se implementó y la spec 04 depende de ella por número.
- **Sí:** calcular todo desde `Purchase`, sin datos nuevos. Es lo que realmente se pagó: el historial de precios
  incluye precios cargados sin comprar.
- **Sí:** mes calendario en hora local. Así piensa la persona "lo que gasté en octubre"; con UTC, las compras de la
  noche del último día caerían en el mes siguiente.
- **Sí:** abrir en el mes actual, que el selector incluye aunque no tenga compras. La tarjeta de Historial habla
  del mes en curso, y la página tiene que coincidir con ella al tocarla.
- **No:** abrir en el último mes con compras (la versión anterior). A mitad de mes mostraría un mes viejo sin decirlo.
- **Sí:** variación contra el **mes calendario anterior**, y solo si los dos meses tienen compras. Si no, "—": un
  mes sin compras registradas no es un mes sin gasto, es un mes sin datos, y "−100 %" a principio de mes engaña.
- **Sí:** gráfico de 6 meses fijos con ceros. Muestra la tendencia sin escalas engañosas por meses faltantes. 12
  meses dejaba columnas de unos 25 px en 375 px, por debajo del toque mínimo.
- **Sí:** barras en HTML con Tailwind en lugar de SVG. Cada columna es un `<button>` real (foco, `aria-pressed`,
  44 px), cosa que dentro de un SVG no se puede. El alto y el ancho de las barras van en `style` porque son valores
  calculados; es la única excepción a "solo Tailwind".
- **Sí:** desglose por **cadena** para los comercios del SEPA. "¿Cuánto gasto en Coto?" importa más que la sucursal.
- **No:** agrupar por sucursal (texto exacto de `Purchase.store`). Reparte el gasto de una cadena en varias filas.
- **Sí:** guardar `chain` en `StoreRef` en lugar de separar el texto por `' — '`. `branchLabel` no pone el
  separador cuando el nombre de la sucursal ya empieza con el de la cadena, así que el texto no alcanza. El separador
  queda solo como respaldo para las compras de antes de esta spec.
- **No:** consultar `sepa_banderas` para el nombre de la cadena. El panel tiene que funcionar sin Supabase y sin conexión.
- **No:** desglose por categoría. Desde la spec 18 los productos del catálogo no la tienen, y "Sin categoría"
  sería casi todo.
- **Sí:** `paymentLabel` acepta id y label. El carrito de Angular guardaba el id; el de Next.js guarda el label. Las
  dos formas tienen que sumarse en la misma fila.
- **No:** migrar las compras guardadas al label. `paymentLabel` lo resuelve al leer y no toca los datos de nadie.
- **Sí:** `src/lib/payment-methods.ts` sin íconos. `lib/` no depende de React; los íconos quedan en el carrito.
- **Sí:** nombres de meses propios. `Intl` da nombres cortos distintos según la versión de ICU, y los tests tienen
  que dar lo mismo en todos lados.
- **Sí:** tests con fechas en hora local (`new Date(año, mes, día, hora)`), para que el caso de las 22:00 del último
  día pase igual en Argentina y en el CI en UTC.
- **Sí:** ruta en español (`/gastos`), igual que `/calculadora`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Compras viejas con `paymentMethod` como id, o sin él | `paymentLabel` traduce el id y devuelve "Sin especificar" si falta; nunca un texto vacío |
| Compras de antes de esta spec sin `chain` | Se usa el texto anterior a `' — '` de `Purchase.store`; si no lo hay, el nombre entero. Peor caso: una cadena en dos filas hasta que se compre de nuevo en ella |
| Compras de la versión Angular sin `store` en los ítems | Se agrupan por `Purchase.store` normalizado, o van a "Sin comercio" |
| Un mismo comercio propio escrito distinto ("Verdulería Juan" / "Verduleria Juan") | Mayúsculas y espacios se igualan; los acentos no, igual que en `storeKey`. Queda en dos filas |
| Diferencias de redondeo entre el total y la suma de los desgloses | Se suman los números completos y se redondea solo al mostrar |
| El mes cambia con la página abierta (medianoche del último día) | El mes actual se toma al montar la página; se corrige al recargar. Es aceptable |

## Lo que **no** incluye esta spec

- Desglose por categoría.
- Inflación personal (spec 04).
- Presupuesto mensual.
- Rangos de fechas libres, comparación anual o gráfico de más de 6 meses.
- Detalle de compras al tocar una fila del desglose.
- Completar `chain` en compras ya guardadas.
- Pestaña de Gastos en la barra de navegación.

Cada uno de estos, si llega, va en su propia spec.
