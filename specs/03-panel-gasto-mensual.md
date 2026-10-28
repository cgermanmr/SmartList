# SPEC 03 — Panel de gasto mensual

> **Estado:** Borrador
> **Depende de:** —
> **Fecha:** 2026-10-28
> **Objetivo:** Agregar una página `/gastos` que muestre, a partir del historial de compras, cuánto se gastó por mes, cómo se compara con el mes anterior y cómo se reparte por categoría y por medio de pago.

Origen: [`docs/ideas.md`](../docs/ideas.md) → *Análisis de gastos* → "Panel de gasto mensual".

## Por qué existe esta spec

El propósito de la app es "analizar la suba de precios y el gasto", pero hoy el gasto solo se ve compra por
compra en `/purchases`. No hay forma de saber cuánto se gastó en octubre, si fue más que en septiembre ni en
qué se fue la plata. Todos los datos ya están en `Purchase`: fecha, ítems con subtotal, total y medio de pago.

Esta spec crea la página `/gastos`. La [spec 04](04-inflacion-personal.md) le agrega la sección de inflación personal.

## Alcance

**Incluye:**

- Página nueva `/gastos` con lazy loading y link `📊 Gastos` en el nav, después de `📋 Historial`.
- Selector de mes entre los meses que tienen compras; por defecto, el de la compra más reciente.
- Resumen del mes: total gastado, cantidad de compras, ticket promedio y variación % contra el mes calendario anterior.
- Gráfico de barras en SVG propio con el total de los últimos 6 meses calendario, con el mes elegido resaltado.
- Desglose del mes por **categoría** y por **medio de pago**: monto, % del total y barra horizontal.
- Estado vacío cuando no hay compras.
- Lista de medios de pago compartida en `src/app/utils/payment-methods.ts` (hoy vive solo en el carrito).
- Lógica de agregación como funciones puras en `src/app/utils/spending.ts`.

**Fuera de alcance (para specs futuras):**

- Inflación personal (va en la [spec 04](04-inflacion-personal.md)).
- Presupuesto mensual y avisos.
- Rangos de fechas libres, comparación por semana o por año.
- Gasto por comercio (necesita el catálogo de comercios del [feature 02](../docs/features/02-comparacion-por-comercio.md)).
- Normalizar categorías ("Lacteos" / "lácteos" quedan separadas).
- Tests unitarios (el proyecto todavía no tiene karma/jasmine instalados).

## Modelo de datos

Sin datos persistidos nuevos: todo se calcula desde `purchases$` y `products$`.

### Medios de pago — `src/app/utils/payment-methods.ts`

```typescript
export interface PaymentMethod {
  id: string;
  label: string;
  icon: string;
}

// Misma lista que hoy está en CartComponent.paymentMethods
export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'efectivo',      label: 'Efectivo',           icon: '💵' },
  { id: 'debito',        label: 'Débito',             icon: '💳' },
  { id: 'credito1',      label: 'Crédito (1 cuota)',  icon: '💳' },
  { id: 'creditoN',      label: 'Crédito en cuotas',  icon: '📆' },
  { id: 'transferencia', label: 'Transferencia / QR', icon: '📲' },
  { id: 'cheque',        label: 'Cheque',             icon: '📝' },
];

/** id vacío o ausente → "Sin especificar"; id desconocido → el valor tal cual */
export function paymentLabel(id: string | undefined): string;
```

`Purchase.paymentMethod` guarda el **id** (`'efectivo'`), no el label; por eso hace falta la traducción.

### Resultados calculados — `src/app/utils/spending.ts`

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
}

export interface Breakdown {
  label: string;           // categoría o medio de pago
  amount: number;
  percent: number;         // amount / total del mes × 100
}
```

Funciones (sin dependencias de Angular):

| Función | Devuelve |
|---|---|
| `monthKey(iso: string)` | `'YYYY-MM'` según la **hora local** del dispositivo |
| `previousMonth(month)` | Mes calendario anterior (`'2026-01'` → `'2025-12'`) |
| `monthsWithPurchases(purchases)` | Meses con al menos una compra, del más viejo al más nuevo, sin repetidos |
| `monthSummary(purchases, month)` | `MonthSummary` |
| `lastMonthsTotals(purchases, month, n)` | `n` meses calendario terminando en `month`, incluidos los que dan 0 |
| `variationPercent(current, previous)` | `(current − previous) / previous × 100`; `null` si `previous` es 0 |
| `byCategory(purchases, products, month)` | `Breakdown[]` sumando `CartItem.subtotal` por `Product.category` |
| `byPayment(purchases, month)` | `Breakdown[]` sumando `Purchase.total` por `paymentLabel(paymentMethod)` |
| `formatMonth(month)` / `shortMonth(month)` | `'Octubre 2026'` / `'oct'` con nombres en español propios (`MONTH_NAMES`) |

### Reglas de cálculo

- El mes de una compra sale de `new Date(purchase.date)` en hora local: una compra del 31/10 a las 22:00 en
  Argentina (guardada como `2026-11-01T01:00:00.000Z`) cuenta en **octubre**.
- Categoría: se busca el `Product` por `item.productId`; si no existe, `"Sin categoría"`. Se agrupa por el texto exacto de `category`, sin normalizar.
- Los desgloses se ordenan por monto de mayor a menor; a igual monto, por `label` alfabético.
- La suma de los montos de cada desglose es igual al total del mes (`Purchase.total` = suma de `subtotal`, ver `getCartTotal` en `DataService`).
- Redondeo solo al mostrar (`number:'1.2-2'` para montos, `number:'1.0-2'` para %).

## UI/UX

- **Encabezado:** título "Gastos" y selector `◀ Octubre 2026 ▶`. ◀ deshabilitado en el mes más viejo con compras, ▶ en el más nuevo.
- **Tarjetas** (`grid-cols-2 md:grid-cols-4`, clase `.card`): Total del mes · Compras · Ticket promedio ·
  Vs. mes anterior (`+66,67 %` en rojo si subió, verde si bajó, "—" si el mes anterior no tiene compras).
- **Gráfico:** barras SVG de los últimos 6 meses (etiquetas `may`…`oct`), el mes elegido en `primary-700` y
  los demás en `primary-200`; clic en una barra de un mes con compras lo selecciona. Seguir el estilo de
  `ProductComponent.getChartData()` (`src/app/pages/product/product.component.ts`): cálculo de coordenadas en
  el componente, `viewBox` y `w-full`.
- **Desgloses:** dos tarjetas "Por categoría" y "Por medio de pago" (`grid-cols-1 md:grid-cols-2`); cada fila
  con nombre, monto, % y una barra `div` con `[style.width.%]`.
- **Estado vacío:** "Todavía no hay compras" + link "Ir al carrito" a `/cart`.

## Plan de implementación

1. **Medios de pago compartidos.** Crear `src/app/utils/payment-methods.ts` con `PaymentMethod`, `PAYMENT_METHODS` y `paymentLabel`. En `src/app/pages/cart/cart.component.ts` reemplazar el array literal por `paymentMethods = PAYMENT_METHODS`. Verificar: build compila y el checkout muestra los 6 medios de pago igual que antes.
2. **Lógica pura.** Crear `src/app/utils/spending.ts` con las interfaces y funciones de la tabla. Verificar: build compila.
3. **Página y ruta.** Crear `src/app/pages/spending/spending.component.ts` + `.html` (standalone, selector `app-spending`, `templateUrl`) con el título. Agregar la ruta `gastos` con `loadComponent` en `src/app/app.routes.ts` y el link `📊 Gastos` en `src/app/app.component.html`, después de Historial. Verificar: se navega a `/gastos`, el link queda activo y el nav se desplaza en 375 px sin scroll horizontal de la página.
4. **Datos y selector de mes.** Suscribirse a `purchases$` y `products$` con `combineLatest` + `takeUntilDestroyed()`; calcular meses disponibles y mes elegido (si el elegido deja de existir, volver al más reciente). Verificar: con el fixture abre en Octubre 2026 y ◀ ▶ recorren Septiembre y Octubre.
5. **Resumen.** Tarjetas con `monthSummary` y `variationPercent`. Verificar: criterios de resumen.
6. **Gráfico.** Barras de `lastMonthsTotals(..., 6)` en SVG. Verificar: criterio del gráfico.
7. **Desgloses.** Tarjetas con `byCategory` y `byPayment`. Verificar: criterios de desglose.
8. **Estado vacío.** Verificar: sin compras se ve el mensaje y no hay errores en consola.
9. **Documentación.** Actualizar `CLAUDE.md` (árbol con `spending/` y los dos archivos de `utils/`, tabla de Rutas, Funcionalidades, Estado Actual, nota del nav con 6 ítems) y quitar "Panel de gasto mensual" de `docs/ideas.md`.

## Datos de prueba

Pegar en DevTools → Application → Local Storage → `preciolocal_purchases` (con los productos de ejemplo por defecto):

```json
[
  { "id": "3", "date": "2026-11-01T01:00:00.000Z", "total": 2400, "paymentMethod": "efectivo",
    "items": [ { "id": "a", "productId": "2", "productName": "Pan Frances", "price": 600, "quantity": 4, "subtotal": 2400 } ] },
  { "id": "2", "date": "2026-10-05T15:00:00.000Z", "total": 7600, "paymentMethod": "debito",
    "items": [ { "id": "b", "productId": "1", "productName": "Leche 1L", "price": 1200, "quantity": 3, "subtotal": 3600 },
               { "id": "c", "productId": "7", "productName": "Cafe 500g", "price": 4000, "quantity": 1, "subtotal": 4000 } ] },
  { "id": "1", "date": "2026-09-15T15:00:00.000Z", "total": 6000,
    "items": [ { "id": "d", "productId": "1", "productName": "Leche 1L", "price": 1000, "quantity": 2, "subtotal": 2000 },
               { "id": "e", "productId": "6", "productName": "Fideos 500g", "price": 1500, "quantity": 2, "subtotal": 3000 },
               { "id": "f", "productId": "999", "productName": "Producto borrado", "price": 1000, "quantity": 1, "subtotal": 1000 } ] }
]
```

La compra `"3"` es el 31/10/2026 a las 22:00 en hora de Argentina (UTC−3). Los criterios asumen esa zona horaria.

## Criterios de aceptación

- [ ] `npm run build:prod` termina sin errores ni warnings nuevos.
- [ ] El nav muestra `📊 Gastos` después de `📋 Historial`, lleva a `/gastos` y queda resaltado como activo.
- [ ] En 375 px el nav con 6 ítems se desplaza en horizontal y la página no tiene scroll horizontal.
- [ ] Sin compras, `/gastos` muestra "Todavía no hay compras" con link al carrito y no hay errores en consola.
- [ ] Con el fixture, la página abre en **Octubre 2026** (la compra del 31/10 22:00 cuenta en octubre, no en noviembre).
- [ ] Octubre: total $10.000, 2 compras, ticket promedio $5.000, +66,67 % vs septiembre.
- [ ] Septiembre: total $6.000, 1 compra, ticket promedio $6.000, "—" vs agosto.
- [ ] ◀ está deshabilitado en Septiembre y ▶ en Octubre.
- [ ] El gráfico muestra may–oct: cuatro meses en 0, Septiembre $6.000 y Octubre $10.000 resaltado; clic en la barra de Septiembre lo selecciona.
- [ ] Por categoría en Octubre: Bebidas $4.000 (40 %), Lacteos $3.600 (36 %), Almacen $2.400 (24 %).
- [ ] Por categoría en Septiembre: Almacen $3.000 (50 %), Lacteos $2.000 (33,33 %), Sin categoría $1.000 (16,67 %).
- [ ] Por medio de pago en Octubre: Débito $7.600 (76 %), Efectivo $2.400 (24 %).
- [ ] Por medio de pago en Septiembre: Sin especificar $6.000 (100 %).
- [ ] En cada mes, la suma de cada desglose es igual al total del mes.
- [ ] El checkout del carrito sigue mostrando los 6 medios de pago y guarda el id como antes.
- [ ] Búsqueda, carga, detalle, carrito, historial y calculadora funcionan igual que antes.

## Decisiones

- **Sí:** página propia `/gastos` con link en el nav. Es una vista de análisis distinta del historial y la spec 04 la reutiliza.
- **No:** pestañas dentro de `/purchases`. Mezcla la lista operativa (repetir compras) con el análisis.
- **Sí:** calcular todo desde `Purchase`, sin datos nuevos. Es lo que realmente se pagó; el historial de precios incluye precios cargados sin comprar.
- **Sí:** mes calendario en hora local. Es como la persona piensa "lo que gasté en octubre"; con UTC las compras de la noche del último día caen en el mes siguiente.
- **Sí:** selector entre meses con compras y variación contra el mes calendario anterior. Navegar no pasa por meses vacíos, pero la variación sí refleja que un mes sin compras es un mes sin gasto registrado.
- **Sí:** gráfico de 6 meses fijos con ceros. Muestra la tendencia sin escalas engañosas por meses faltantes.
- **Sí:** SVG propio, sin librerías. Sigue el criterio del gráfico del detalle de producto y no suma peso al bundle.
- **Sí:** mover los medios de pago a `utils/payment-methods.ts`. El panel necesita los labels y duplicar la lista haría que se desincronicen.
- **Sí:** nombres de meses propios en español. La app no registra el locale `es-AR` y el `date` pipe mostraría "October"; pasar la app a `es-AR` es un cambio global con su propia spec.
- **Sí:** agrupar categorías por texto exacto. Normalizar es parte del catálogo, no de esta vista.
- **Sí:** `takeUntilDestroyed()` en las suscripciones nuevas. Evita sumar a la deuda de suscripciones sin cerrar que ya tienen las otras páginas.
- **Sí:** ruta en español (`/gastos`), igual que `/calculadora`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Categorías escritas distinto aparecen como filas separadas | Documentado; se resuelve con un catálogo de categorías en otra spec |
| Compras viejas sin `paymentMethod` o con un valor que no es id | `paymentLabel` devuelve "Sin especificar" o el valor tal cual, nunca vacío |
| Producto borrado o id inexistente | Categoría "Sin categoría"; el monto igual se suma |
| Nav con 6 ítems en móvil | Ya tiene `overflow-x-auto` desde la spec 01 |
| Diferencias de redondeo entre el total y la suma de desgloses | Se suman números completos y se redondea solo al mostrar |

## Lo que **no** incluye esta spec

- Inflación personal (spec 04).
- Presupuesto mensual.
- Rangos de fechas libres o comparación anual.
- Gasto por comercio.
- Normalización de categorías.
- Tests unitarios.

Cada uno de estos, si llega, va en su propia spec.
