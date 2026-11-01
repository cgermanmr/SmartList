# SPEC 12 — Precio de referencia SEPA en el detalle y el carrito

> **Estado:** Borrador
> **Depende de:** [SPEC 08](08-base-sepa-supabase.md), [SPEC 10](10-productos-con-codigo-de-barras.md)
> **Fecha:** 2026-10-31
> **Objetivo:** Mostrar, para los productos con EAN, cuánto cuestan hoy en cada cadena según el SEPA, y si el precio propio está por encima o por debajo de esa referencia.

## Por qué existe esta spec

Con la base cargada (spec 08) y los productos vinculados (spec 10), la app ya puede responder la pregunta que
motivó el feature 06: **¿lo que pagué es caro o barato?** Hoy solo compara contra los precios propios.

## Alcance

**Incluye:**

- Consulta `getSepaPrices(eans)` y resumen puro `referenceSummary(prices)` en `src/lib/sepa.ts`.
- **Detalle de producto:** tarjeta "Precio de referencia" con la tabla por cadena y la comparación contra el
  último precio propio.
- **Carrito:** línea de referencia por ítem con EAN y comparación contra el precio del ítem.
- Caché en memoria por sesión para no repetir consultas.

**Fuera de alcance:**

- Precios por sucursal o cercanía (geolocalización).
- Promociones de las cadenas.
- Historial o gráfico de precios SEPA.
- Comparar la canasta entera contra cada cadena.

## Modelo de datos

```typescript
export interface SepaPrice {
  ean: string;
  bandera: string;          // nombre de sepa_banderas ("Coto", "Hipermercado Carrefour")
  minimo: number;
  mediana: number;
  maximo: number;
  sucursales: number;
  actualizado: string;      // 'YYYY-MM-DD'
}

export interface ReferenceSummary {
  reference: number;        // mediana de las medianas por cadena
  cheapest: SepaPrice;      // cadena con la menor mediana
  range: [number, number];  // menor mínimo y mayor máximo
  chains: number;
  date: string;             // actualizado más reciente
  stale: boolean;           // date con más de 7 días
}

/** Una consulta para varios EAN (in), con join a sepa_banderas para el nombre; usa la caché */
export function getSepaPrices(eans: string[]): Promise<Map<string, SepaPrice[]>>;
/** null si no hay precios; pura, con tests */
export function referenceSummary(prices: SepaPrice[], today: Date): ReferenceSummary | null;
/** (precio − referencia) / referencia × 100; pura */
export function vsReference(price: number, reference: number): number;
```

## Reglas

- **Referencia = mediana de las medianas por cadena:** cada cadena cuenta una vez, sin importar cuántas
  sucursales tenga (DIA con 971 sucursales no tapa a Coto con 122).
- La tabla del detalle se ordena por mediana, de menor a mayor, y marca la más barata (empatadas, todas).
- **Comparación:** `vsReference(precio propio, reference)`:
  - menor a −5 % → verde "X % por debajo de la referencia";
  - entre −5 % y +5 % → azul "En línea con la referencia";
  - mayor a +5 % → rojo "X % por encima de la referencia".
  En el detalle, el precio propio es el último registrado (`getPriceStats().current`); en el carrito, el precio
  del ítem.
- `stale` → leyenda gris "Datos del dd/mm/aaaa" en lugar de "Actualizado hoy/ayer".
- Sin EAN, sin Supabase, sin precios o con error de red → no se muestra nada (ni error ni tarjeta vacía).
- **Caché:** un `Map` de módulo por EAN, válido durante la sesión; el carrito pide todos los EAN que falten en
  una sola consulta.
- Montos con `formatMoney` y porcentajes con `formatPctChange` de `src/lib/format.ts`.

## UI/UX

- **Detalle**, después de las estadísticas propias, tarjeta `.card` "Precio de referencia · Precios Claros":
  - Línea principal: "Referencia $X" y el badge de comparación.
  - "Más barato en <cadena>: $Y" y "Rango $A – $B en N cadenas".
  - Tabla por cadena: cadena, mediana, sucursales; la más barata en verde.
  - Pie: "Precios de lista de grandes cadenas. Datos del dd/mm/aaaa — SEPA (CC-BY-4.0)".
- **Carrito**, debajo del precio de cada ítem con EAN, texto chico: "Ref. $X · 8 % arriba" con el mismo color del
  badge. Convive con el badge de "última compra" existente.
- Mientras carga, nada (sin skeleton): la referencia es información secundaria.

## Plan de implementación

1. **Lógica pura + tests:** `referenceSummary` (cadena única, empate, `stale`, lista vacía) y `vsReference`.
2. **Consulta y caché:** `getSepaPrices` con `select('ean, minimo, mediana, maximo, sucursales, actualizado, sepa_banderas(nombre)')` e `in('ean', …)`. Verificar: el carrito con 5 productos hace una sola consulta (pestaña Network).
3. **Detalle:** componente `ReferencePrice.tsx`. Verificar: criterios del detalle.
4. **Carrito:** línea de referencia por ítem. Verificar: criterios del carrito.
5. **Documentación:** `CLAUDE.md` (Funcionalidades del detalle y del carrito) y feature 06 → *Hecho*.

## Criterios de aceptación

- [ ] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.
- [ ] En el detalle de un producto vinculado se ven referencia, cadena más barata, rango, tabla por cadena y fecha.
- [ ] Con precios 4.000 / 4.200 / 5.000 / 9.000 en cuatro cadenas, la referencia es $4.600 y la más barata la de $4.000.
- [ ] Con último precio propio $5.000 y referencia $4.600, se ve "8,7 % por encima de la referencia" en rojo.
- [ ] Un producto sin EAN no muestra la tarjeta ni hace consultas.
- [ ] En el carrito, cada ítem con EAN muestra la referencia; con 5 ítems vinculados hay una sola consulta.
- [ ] Sin conexión o sin variables de Supabase, el detalle y el carrito funcionan como antes, sin mensajes de error.
- [ ] Con datos de más de 7 días se ve "Datos del dd/mm/aaaa".
- [ ] En 375 px la tabla por cadena no genera scroll horizontal.

## Decisiones

- **Sí:** mediana de medianas por cadena como referencia. Representa "lo que sale en el súper" sin que una cadena grande domine.
- **Sí:** margen de ±5 % para "en línea". Diferencias menores no cambian la decisión de compra.
- **Sí:** caché solo en memoria. Los precios cambian a diario; guardarlos en `localStorage` sumaría datos viejos y otra clave que validar.
- **No:** mezclar la referencia con las estadísticas propias (`getPriceStats`). Son fuentes distintas y confundiría el historial personal.
- **Sí:** ocultar en silencio cuando no hay datos. La app tiene que seguir siendo útil para productos sin código y sin conexión.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Presentaciones distintas con el mismo EAN entre cadenas | El EAN identifica la presentación; si una cadena informa mal, la mediana de medianas lo amortigua |
| La referencia nacional no refleja el barrio | Se aclara "grandes cadenas"; la cercanía queda para una spec futura |
| Supabase lento | La tarjeta aparece cuando llega; nada espera a la consulta |

## Lo que **no** incluye esta spec

- Precios por sucursal o cercanía.
- Promociones.
- Historial o gráfico SEPA.
- Comparación de canasta por cadena.
