# SPEC 04 — Inflación personal

> **Estado:** Borrador
> **Depende de:** [SPEC 03 — Panel de gasto mensual](03-panel-gasto-mensual.md)
> **Fecha:** 2026-10-28
> **Objetivo:** Agregar a `/gastos` una sección que calcule cuánto subió (o bajó) la canasta propia entre el mes elegido y el mes anterior con compras, usando los precios realmente pagados.
>
> **Nota (2026-10-28):** escrita para la versión Angular. Desde la [SPEC 06](06-migracion-nextjs-vercel.md) la app es Next.js: las páginas están en `src/app/<ruta>/page.tsx`, la lógica de datos en `src/lib/store.ts` (Zustand) y el formato en `src/lib/format.ts`. Adaptar rutas de archivos y sintaxis de templates al implementarla.

Origen: [`docs/ideas.md`](../docs/ideas.md) → *Análisis de gastos* → "Inflación personal".

## Por qué existe esta spec

El panel de la spec 03 dice cuánto se gastó, pero gastar más no significa que los precios subieron: puede
ser que se compró más. La pregunta que falta es **"lo mismo que compré el mes pasado, ¿cuánto más caro me sale
ahora?"**, para compararlo con la inflación oficial que se publica cada mes.

La respuesta sale del historial de compras: los productos que se compraron en los dos meses, con el precio
pagado en cada uno, ponderados por las cantidades del mes base.

## Alcance

**Incluye:**

- Sección "Inflación personal" en `/gastos`, debajo de los desgloses, para el mes elegido en el selector de la spec 03.
- Comparación contra el **mes anterior con compras** (no necesariamente el mes calendario anterior), nombrando ambos meses.
- Variación % de la canasta, con color (rojo si subió, verde si bajó).
- Cobertura: "Basado en N de M productos de Octubre".
- Detalle por producto: precio medio en cada mes, variación % y aporte en $ a la diferencia.
- Mensajes cuando no hay mes anterior o no hay productos en común.
- Cálculo como función pura en `src/app/utils/spending.ts`.

**Fuera de alcance (para specs futuras):**

- Traer o cargar la inflación oficial (INDEC) para compararla en pantalla.
- Índice encadenado o acumulado de varios meses / gráfico de evolución.
- Comparar entre dos compras sueltas o entre dos meses cualesquiera elegidos a mano.
- Usar el historial de precios (`Price`) en lugar de las compras.
- Agrupar presentaciones distintas del mismo producto (p. ej. leche de 1 l y de 500 ml).
- Tests unitarios.

## Modelo de datos

Sin datos persistidos nuevos.

### Resultado calculado — `src/app/utils/spending.ts`

```typescript
export interface ProductInflation {
  productId: string;
  productName: string;     // Product.name si existe; si no, el CartItem.productName más reciente
  baseQuantity: number;    // unidades compradas en el mes base (peso de la canasta)
  basePrice: number;       // precio medio pagado en el mes base
  comparePrice: number;    // precio medio pagado en el mes comparado
  percent: number;         // (comparePrice − basePrice) / basePrice × 100
  contribution: number;    // baseQuantity × (comparePrice − basePrice), en $
}

export interface BasketInflation {
  baseMonth: string;       // 'YYYY-MM'
  compareMonth: string;    // 'YYYY-MM'
  baseCost: number;        // Σ baseQuantity × basePrice
  compareCost: number;     // Σ baseQuantity × comparePrice
  percent: number | null;  // null si no hay productos en común
  matched: number;         // productos en común
  totalProducts: number;   // productos distintos comprados en el mes comparado
  items: ProductInflation[];
}
```

Funciones:

| Función | Devuelve |
|---|---|
| `previousMonthWithPurchases(purchases, month)` | El mes más reciente anterior a `month` con compras, o `null` |
| `basketInflation(purchases, products, baseMonth, compareMonth)` | `BasketInflation` |

Reutiliza `monthKey` y `formatMonth` de la spec 03.

### Reglas de cálculo

- Por mes y por `productId`: cantidad = Σ `quantity`; precio medio = Σ `subtotal` ÷ Σ `quantity`. Se ignoran ítems con `quantity ≤ 0`.
- Canasta = productos con compras **en ambos** meses, con las cantidades del **mes base** (índice de Laspeyres).
- `baseCost` = Σ `baseQuantity × basePrice`; `compareCost` = Σ `baseQuantity × comparePrice`.
- `percent` = (`compareCost` ÷ `baseCost` − 1) × 100. Si no hay productos en común, `null`.
- Los productos que solo están en uno de los dos meses no entran en el cálculo; solo cuentan para `totalProducts`.
- `items` se ordena por `contribution` de mayor a menor (primero lo que más empujó la suba, al final lo que bajó).
- Redondeo solo al mostrar.

## UI/UX

- Título "Inflación personal" y subtítulo "Octubre 2026 vs Septiembre 2026" (con `formatMonth`).
- Número grande `+16 %` (rojo si > 0, verde si < 0, gris si 0) y debajo "Lo mismo que compraste en
  Septiembre te costó $2.900 en lugar de $2.500".
- Leyenda de cobertura: "Basado en 2 de 3 productos de Octubre".
- Tabla por producto: Producto · Antes · Ahora · Variación · Aporte. En móvil, una tarjeta por producto.
- Sin mes anterior con compras: "Hace falta al menos un mes anterior con compras para comparar".
- Sin productos en común: "No hay productos comprados en los dos meses".
- Nota fija debajo: "Compará este número con la inflación mensual oficial. Si hay meses sin compras en el
  medio, la variación es acumulada entre los dos meses."

## Plan de implementación

1. **Lógica pura.** Agregar `ProductInflation`, `BasketInflation`, `previousMonthWithPurchases` y `basketInflation` en `src/app/utils/spending.ts`, con una sección `// ── Inflación personal ─────`. Verificar: build compila.
2. **Componente.** En `src/app/pages/spending/spending.component.ts` calcular la inflación cada vez que cambian el mes elegido o los datos: base = `previousMonthWithPurchases(selected)`, comparado = `selected`. Verificar: build compila.
3. **Sección en el template.** Agregar la sección en `spending.component.html` con número, frase, cobertura, tabla y mensajes. Verificar: escenarios de los criterios.
4. **Responsive.** Tabla en escritorio, tarjetas en 375 px. Verificar: sin scroll horizontal en 375 px.
5. **Documentación.** Actualizar `CLAUDE.md` (Funcionalidades → Gastos, Estado Actual) y quitar "Inflación personal" de `docs/ideas.md`.

## Datos de prueba

**Escenario A** — `preciolocal_purchases` (productos de ejemplo por defecto):

```json
[
  { "id": "3", "date": "2026-10-20T15:00:00.000Z", "total": 5500, "paymentMethod": "debito",
    "items": [ { "id": "a", "productId": "1", "productName": "Leche 1L", "price": 1250, "quantity": 2, "subtotal": 2500 },
               { "id": "b", "productId": "7", "productName": "Cafe 500g", "price": 3000, "quantity": 1, "subtotal": 3000 } ] },
  { "id": "2", "date": "2026-10-05T15:00:00.000Z", "total": 1600, "paymentMethod": "efectivo",
    "items": [ { "id": "c", "productId": "1", "productName": "Leche 1L", "price": 1100, "quantity": 1, "subtotal": 1100 },
               { "id": "d", "productId": "2", "productName": "Pan Frances", "price": 500, "quantity": 1, "subtotal": 500 } ] },
  { "id": "1", "date": "2026-09-10T15:00:00.000Z", "total": 2500, "paymentMethod": "efectivo",
    "items": [ { "id": "e", "productId": "1", "productName": "Leche 1L", "price": 1000, "quantity": 2, "subtotal": 2000 },
               { "id": "f", "productId": "2", "productName": "Pan Frances", "price": 500, "quantity": 1, "subtotal": 500 } ] }
]
```

Octubre: Leche 3 u por $3.600 (precio medio $1.200), Pan 1 u a $500, Cafe 1 u a $3.000.
Canasta de Septiembre: 2 Leche + 1 Pan → $2.500 antes, 2 × $1.200 + $500 = $2.900 ahora.

**Escenario B** — igual que A, pero con la compra `"1"` en fecha `"2026-08-10T15:00:00.000Z"` (septiembre sin compras).

**Escenario C** — igual que A, pero la compra `"1"` solo con `Fideos 500g` (`productId` `"6"`).

## Criterios de aceptación

- [ ] `npm run build:prod` termina sin errores ni warnings nuevos.
- [ ] Escenario A, Octubre: "Octubre 2026 vs Septiembre 2026", **+16 %** en rojo, "$2.900 en lugar de $2.500", "Basado en 2 de 3 productos de Octubre".
- [ ] Escenario A, detalle: Leche $1.000 → $1.200, +20 %, aporte +$400 (primera fila); Pan $500 → $500, 0 %, aporte $0. Cafe no aparece en la tabla.
- [ ] Escenario A, Septiembre: "Hace falta al menos un mes anterior con compras para comparar".
- [ ] Escenario B, Octubre: "Octubre 2026 vs Agosto 2026" y +16 %.
- [ ] Escenario C, Octubre: "No hay productos comprados en los dos meses".
- [ ] Si se edita el fixture para que la Leche de octubre cueste $900, la variación es negativa y se muestra en verde con signo −.
- [ ] Cambiar el mes con ◀ ▶ actualiza la sección.
- [ ] En 375 px el detalle se ve como tarjetas, sin scroll horizontal.
- [ ] El resto del panel de la spec 03 sigue mostrando los mismos números.

## Decisiones

- **Sí:** solo compras, no el historial de precios. Es el precio que realmente se pagó por lo que realmente se compró; el historial incluye precios cargados a mano en comercios donde no se compró.
- **No:** historial de precios (`Price`). Da más datos, pero mezcla comercios y productos que no son parte de la canasta propia.
- **Sí:** canasta fija con cantidades del mes base (Laspeyres). Es el mismo criterio del IPC: "lo mismo que compré antes, a precios de ahora", y permite compararlo con la inflación oficial.
- **Sí:** precio medio ponderado por cantidad dentro del mes. Si la leche se compró dos veces a precios distintos, cuenta lo que se pagó en promedio por unidad.
- **Sí:** comparar contra el mes anterior **con compras**. Quien no compró en septiembre igual quiere ver algo; se nombran los dos meses y se aclara que la variación es acumulada.
- **No:** elegir libremente los dos meses. Agrega UI sin cambiar el uso más común (mes a mes).
- **Sí:** mostrar la cobertura. Una variación calculada con 2 de 30 productos no vale lo mismo que con 28 de 30.
- **Sí:** ordenar por aporte en $. Responde "qué me encareció el mes", que es lo accionable.
- **No:** inflación oficial en pantalla. Requiere una fuente externa o carga manual; queda para otra spec.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Pocos productos en común dan una variación poco representativa | Leyenda de cobertura siempre visible |
| El mismo producto cargado dos veces con ids distintos no se empareja | Documentado; se resuelve con deduplicación de productos en otra spec |
| Meses salteados dan una variación acumulada que se confunde con mensual | Se nombran los dos meses y hay una nota fija |
| Precio pagado editado a mano en el carrito (p. ej. con descuento) | Es el precio real pagado; se acepta como dato válido |

## Lo que **no** incluye esta spec

- Inflación oficial en pantalla.
- Índice acumulado o gráfico de varios meses.
- Comparación entre compras sueltas o meses elegidos a mano.
- Uso del historial de precios.
- Agrupar presentaciones del mismo producto.
- Tests unitarios.

Cada uno de estos, si llega, va en su propia spec.
