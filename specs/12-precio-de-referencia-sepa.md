# SPEC 12 — Precio de referencia SEPA en Buscar, el detalle y el carrito

> **Estado:** Aprobado
> **Depende de:** [SPEC 08](08-base-sepa-supabase.md), [SPEC 10](10-productos-con-codigo-de-barras.md), [SPEC 11](11-lector-codigo-de-barras.md)
> **Fecha:** 2026-10-31 (ampliada el 2026-11-16)
> **Objetivo:** Mostrar, para los productos con EAN, cuánto cuestan hoy en cada cadena según el SEPA: el precio promedio entre cadenas en los resultados de Buscar y del lector, la lista de cadenas con su precio al elegir un producto, y si el precio propio está por encima o por debajo de esa referencia.

## Por qué existe esta spec

Con la base cargada (spec 08) y los productos vinculados (spec 10), la app ya puede responder la pregunta que
motivó el feature 06: **¿lo que pagué es caro o barato?** Hoy solo compara contra los precios propios.

**Ampliación del 16/11/2026.** Al probar el lector (spec 11) en Android, buscar "yerba" o leer un código muestra
el producto del catálogo ("YERBA · PLAYADITO · 500 g · en 16 cadenas") pero **ningún precio ni cadena**: la base
los tiene, la app no los muestra. Lo esperado es ver el precio promedio de esas 16 cadenas en el resultado y, al
elegir el producto, todas las cadenas con su precio, **antes** de darlo de alta.

## Alcance

**Incluye:**

- Consulta `getSepaPrices(eans)` y resumen puro `referenceSummary(prices)` en `src/lib/sepa.ts`.
- Componente `SepaPriceTable` (lista de precios por cadena), compartido por Buscar y el detalle.
- **Buscar:** en cada resultado de **En Precios Claros**, línea de resumen ("Promedio $X · más barato en
  <cadena> $Y"); al tocar el resultado se despliega la lista por cadena con el link "Agregar producto".
- **Lector en Buscar** (spec 11): la oferta "Agregar <descripción>" suma el mismo resumen y el botón "Ver precios
  por cadena", que despliega la lista.
- **Detalle de producto:** tarjeta "Precio de referencia" con el resumen, la lista por cadena y la comparación
  contra el último precio propio.
- **Carrito:** línea de referencia por ítem con EAN y comparación contra el precio del ítem.
- Caché en memoria por sesión para no repetir consultas.

**Fuera de alcance:**

- Precios por sucursal o cercanía (geolocalización): specs [13](13-precios-por-sucursal-sepa.md) y [15](15-precios-y-comercios-cercanos.md).
- Agregar al carrito desde una cadena (spec 15).
- Resumen de referencia en las tarjetas de productos **propios** de Buscar (la spec 15 lo suma con la ubicación);
  los propios lo ven en el detalle.
- Promociones de las cadenas.
- Historial o gráfico de precios SEPA.
- Comparar la canasta entera contra cada cadena.

## Modelo de datos

```typescript
export interface SepaPrice {
  ean: string;
  bandera: string;          // nombre de sepa_banderas ("Coto", "Hipermercado Carrefour")
  minimo: number;
  mediana: number;          // precio de la cadena: mediana entre sus sucursales
  maximo: number;
  sucursales: number;
  actualizado: string;      // 'YYYY-MM-DD'
}

export interface ReferenceSummary {
  reference: number;        // promedio de las medianas por cadena
  cheapest: SepaPrice;      // cadena con la menor mediana (la primera de byChain)
  byChain: SepaPrice[];     // ordenadas por mediana, de menor a mayor; a igual mediana, por nombre
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

## Relación con las specs 13 a 17

Revisado el 15/11/2026 y el 16/11/2026. Esta spec es la **referencia nacional por cadena** ("¿lo que pagué es caro
o barato?" y "¿cuánto sale en cada cadena?"). La pregunta "¿dónde lo consigo cerca y a cuánto?" va por otro camino:

| Spec | Qué agrega | Qué comparte con esta |
|---|---|---|
| [13](13-precios-por-sucursal-sepa.md) | Sucursales y precio por sucursal en la base | Nada: tablas nuevas, `sepa_precios` no cambia |
| [14](14-carrito-por-comercio.md) | Comercio por ítem y carrito agrupado | La línea de referencia del carrito va dentro de cada ítem, en cualquier grupo |
| [15](15-precios-y-comercios-cercanos.md) | Precios y comercios cercanos en Buscar, el detalle y el carrito | `getSepaPrices` y su caché, y la fila desplegable del catálogo en Buscar, se crean acá. Con ubicación, la spec 15 cambia el resumen y la lista por los de comercios cercanos; sin ubicación quedan los de esta spec |
| [16](16-mapa-y-como-llegar.md) | Mapa y ruta | — |
| [17](17-imagenes-de-productos.md) | Imágenes | — |

- **Orden:** esta spec no depende de las 13 a 17. La spec 15 se implementa **después** de esta y reutiliza la
  fila desplegable y `getSepaPrices`.
- **Detalle:** la tarjeta "Precio de referencia" va después de las estadísticas propias y **antes** de la tarjeta
  "Comercios cercanos" de la spec 15. La referencia sigue siendo nacional aunque haya ubicación: no se recalcula
  con las sucursales cercanas.

## Reglas

- **Precio de cada cadena = su mediana** (`sepa_precios.mediana`): el precio típico entre sus sucursales.
- **Referencia = promedio de los precios de las cadenas:** cada cadena cuenta una vez, sin importar cuántas
  sucursales tenga (DIA con 971 sucursales no tapa a Coto con 122). Se muestra como "Promedio".
- La lista por cadena se ordena por precio, de menor a mayor, y marca la más barata (empatadas, todas).
- **Buscar:**
  - Una sola consulta `getSepaPrices` con los EAN de los resultados visibles del catálogo (hasta 20), cuando
    llegan los resultados (ya pasaron los 300 ms de espera de `useSepaSearch`). Si el texto cambia antes de que
    responda, la respuesta vieja se descarta.
  - Un resultado sin precios (o si la consulta falla) se ve como hoy, sin resumen, y su fila sigue siendo el
    link "Agregar" de la spec 10 (no se despliega).
  - Se despliega un resultado a la vez; cambiar el texto de búsqueda lo cierra.
- **Lector en Buscar:** después de `getSepaProduct`, si el producto está en el catálogo, `getSepaPrices([ean])`
  (usa la caché). Sin precios, la oferta queda como en la spec 11.
- **Comparación** (detalle y carrito): `vsReference(precio propio, reference)`:
  - menor a −5 % → verde "X % por debajo de la referencia";
  - entre −5 % y +5 % → azul "En línea con la referencia";
  - mayor a +5 % → rojo "X % por encima de la referencia".
  En el detalle, el precio propio es el último registrado (`getPriceStats().current`); en el carrito, el precio
  del ítem.
- `stale` → leyenda gris "Datos del dd/mm/aaaa" en lugar de "Actualizado hoy/ayer".
- Sin EAN, sin Supabase, sin precios o con error de red → no se muestra nada (ni error ni tarjeta vacía). En
  Buscar, el error del catálogo de la spec 10 sigue siendo el único mensaje.
- **Caché:** un `Map` de módulo por EAN, válido durante la sesión (también guarda "sin precios" para no repetir
  la consulta); cada pantalla pide en una sola consulta todos los EAN que falten.
- Montos con `formatMoney` y porcentajes con `formatPctChange` de `src/lib/format.ts`.

## UI/UX

- **`SepaPriceTable`** (lista, no una `<table>` ancha, para que entre en 375 px): por fila, cadena a la izquierda
  y precio a la derecha; debajo, en gris, "N sucursales". La más barata con fondo verde claro y la marca "Más
  barato". Pie: "Precios de lista de grandes cadenas. Datos del dd/mm/aaaa — SEPA (CC-BY-4.0)".
- **Buscar, resultado del catálogo** (fila de `SepaResults`):
  - Debajo de la descripción, marca, presentación y "en N cadenas", una línea: "Promedio **$X** · más barato en
    <cadena> $Y".
  - Con precios, la fila entera es un botón que despliega la lista debajo (`aria-expanded` / `aria-controls`,
    como el historial de compras), con un chevron que gira. Al final del desplegado, el link "Agregar producto"
    (`btn-primary`) a `/upload?tab=producto&ean=…`.
  - Mientras cargan los precios, la fila se ve como hoy (link "Agregar"); cuando llegan, aparece el resumen.
- **Buscar, oferta del lector:** debajo de "Agregar <descripción>", la misma línea de resumen y el botón "Ver
  precios por cadena" que despliega la lista.
- **Detalle**, después de las estadísticas propias, tarjeta `.card` "Precio de referencia · Precios Claros":
  - Línea principal: "Promedio $X" y el badge de comparación.
  - "Más barato en <cadena>: $Y" y "Rango $A – $B en N cadenas".
  - `SepaPriceTable`.
- **Carrito**, debajo del precio de cada ítem con EAN, texto chico: "Ref. $X · 8 % arriba" con el mismo color del
  badge. Convive con el badge de "última compra" existente.
- Mientras carga, nada (sin skeleton): la referencia es información secundaria.

## Plan de implementación

1. **Lógica pura + tests:** `referenceSummary` (promedio, orden por precio, cadena única, empate, `stale`, lista
   vacía) y `vsReference`.
2. **Consulta y caché:** `getSepaPrices` con `select('ean, minimo, mediana, maximo, sucursales, actualizado, sepa_banderas(nombre)')`
   e `in('ean', …)`. Verificar: buscar "yerba" hace una sola consulta de precios (pestaña Network) y repetir la
   búsqueda no hace ninguna.
3. **`SepaPriceTable`.**
4. **Buscar:** resumen y desplegado en los resultados del catálogo y en la oferta del lector. Verificar:
   criterios de Buscar, también en el celular con la URL de preview.
5. **Detalle:** componente `ReferencePrice.tsx`. Verificar: criterios del detalle.
6. **Carrito:** línea de referencia por ítem. Verificar: criterios del carrito.
7. **Documentación:** `CLAUDE.md` (Funcionalidades de Buscar, el detalle y el carrito) y feature 06 → *Hecho*.

## Criterios de aceptación

- [ ] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.
- [ ] Con precios 4.000 / 4.200 / 5.000 / 9.000 en cuatro cadenas, el promedio es $5.550 y la más barata la de $4.000.
- [ ] En Buscar, "yerba playadito" muestra en el resultado del catálogo "Promedio $X · más barato en <cadena> $Y".
- [ ] Tocar ese resultado despliega todas las cadenas con su precio, ordenadas de menor a mayor, con la más barata
  marcada, y el link "Agregar producto" abre el formulario completado.
- [ ] Una búsqueda con 20 resultados del catálogo hace una sola consulta de precios.
- [ ] Un resultado del catálogo sin precios se ve como antes y su link "Agregar" funciona igual.
- [ ] Leer con el lector un código del catálogo muestra el resumen y "Ver precios por cadena".
- [ ] En el detalle de un producto vinculado se ven promedio, cadena más barata, rango, lista por cadena y fecha.
- [ ] Con último precio propio $5.000 y promedio $5.550, se ve "9,9 % por debajo de la referencia" en verde.
- [ ] Un producto sin EAN no muestra la tarjeta ni hace consultas.
- [ ] En el carrito, cada ítem con EAN muestra la referencia; con 5 ítems vinculados hay una sola consulta.
- [ ] Sin conexión o sin variables de Supabase, Buscar, el detalle y el carrito funcionan como antes, sin
  mensajes de error nuevos.
- [ ] Con datos de más de 7 días se ve "Datos del dd/mm/aaaa".
- [ ] En 375 px la lista por cadena y el desplegado de Buscar no generan scroll horizontal.

## Decisiones

- **Sí:** el precio de cada cadena es su mediana entre sucursales. Una sucursal con un precio raro no mueve el de la cadena.
- **Sí:** la referencia es el **promedio** de los precios de las cadenas (pedido el 16/11/2026). Es el número que
  se entiende sin explicación. Antes decía mediana de medianas, que resiste mejor a una cadena muy cara o muy
  barata; como la lista muestra todas las cadenas y la más barata, ese caso se ve igual.
- **Sí:** cada cadena cuenta una vez en la referencia. Representa "lo que sale en el súper" sin que una cadena grande domine.
- **Sí:** margen de ±5 % para "en línea". Diferencias menores no cambian la decisión de compra.
- **Sí:** ver las cadenas antes de agregar el producto desplegando el resultado en Buscar, en vez de una pantalla
  nueva por producto del catálogo. No suma rutas y la spec 15 extiende el mismo desplegado.
- **Sí:** caché solo en memoria. Los precios cambian a diario; guardarlos en `localStorage` sumaría datos viejos y otra clave que validar.
- **No:** mezclar la referencia con las estadísticas propias (`getPriceStats`). Son fuentes distintas y confundiría el historial personal.
- **Sí:** ocultar en silencio cuando no hay datos. La app tiene que seguir siendo útil para productos sin código y sin conexión.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Presentaciones distintas con el mismo EAN entre cadenas | El EAN identifica la presentación; si una cadena informa mal, se ve en la lista. El promedio no lo amortigua: si pasa seguido, volver a la mediana de medianas |
| La referencia nacional no refleja el barrio | Se aclara "grandes cadenas"; los precios por cercanía son la [spec 15](15-precios-y-comercios-cercanos.md) |
| Supabase lento | El resumen y la tarjeta aparecen cuando llegan; nada espera a la consulta |
| Consulta de precios para 20 resultados (hasta ~460 filas) | Una sola consulta con `in` y solo las columnas necesarias; medir el tiempo en el paso 2 |

## Lo que **no** incluye esta spec

- Precios por sucursal o cercanía (specs [13](13-precios-por-sucursal-sepa.md) y [15](15-precios-y-comercios-cercanos.md)).
- Agregar al carrito desde una cadena.
- Promociones.
- Historial o gráfico SEPA.
- Comparación de canasta por cadena.
