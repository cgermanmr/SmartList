# 07 — Precios cercanos y extensiones del SEPA

- **Estado:** En curso (spec 13: sucursales y precios por sucursal en la base; specs 15, 16 y 17 en borrador)
- **Fase:** 1–2 (Supabase de solo lectura; los datos propios siguen en localStorage)

> Separado del [feature 06](06-precios-sepa.md) el 16/11/2026, al cerrarlo con la
> [spec 12](../../specs/12-precio-de-referencia-sepa.md). El 06 respondió **¿lo que pagué es caro o barato?** con
> una referencia nacional por cadena; este feature reúne lo que quedó pendiente.

## Problema

La referencia nacional dice cuánto sale un producto en cada cadena, pero no **dónde conseguirlo cerca y a
cuánto**: el precio de una cadena cambia entre sucursales y la app no sabe cuáles están cerca. Tampoco guarda
historial de precios SEPA, ni compara una compra entera contra cada cadena, ni usa las promociones que el SEPA
también publica.

## Qué existe hoy

- Base Supabase con el catálogo y los precios SEPA agregados por **EAN × bandera** a nivel nacional, actualizada
  todos los días (specs 08 y 09).
- Productos con EAN, marca y presentación, y lector de códigos de barras (specs 10 y 11).
- Precio de referencia por cadena en Buscar, el lector, el detalle y el carrito (spec 12): `getSepaPrices` con
  caché por sesión y la fila desplegable del catálogo en Buscar, que la spec 15 reutiliza.
- Sucursales con dirección y coordenadas (`sepa_sucursales`) y precio de cada producto en cada sucursal
  (`sepa_precios_sucursal`, arreglos por EAN × bandera), con la función `sepa_precios_en_sucursales` para pedir
  hasta 20 productos en 40 sucursales (spec 13). Medido el 16/11/2026: 2.618 sucursales, 75 MB, base de 178 MB.

## Alcance MVP

| Spec | Qué hace |
|---|---|
| [13 — Precios por sucursal](../../specs/13-precios-por-sucursal-sepa.md) | Sucursales con coordenadas y precio por sucursal, en arreglos por EAN × bandera |
| [15 — Precios y comercios cercanos](../../specs/15-precios-y-comercios-cercanos.md) | Ubicación, distancia y lista de comercios en Buscar; agregar al carrito desde la lista |
| [16 — Mapa y cómo llegar](../../specs/16-mapa-y-como-llegar.md) | Mapa con la ubicación propia, el comercio y la ruta |
| [17 — Imágenes de productos](../../specs/17-imagenes-de-productos.md) | Imágenes por EAN desde Open Food Facts y el portal |
| [18 — Agregar al carrito sin dar de alta](../../specs/18-agregar-al-carrito-sin-alta.md) | Agregar un producto del catálogo al carrito con un toque, sin formulario; categoría opcional |

Las specs 13 a 17 se agregaron el 15/11/2026. La
[14 — Carrito por comercio](../../specs/14-carrito-por-comercio.md) pertenece al
[feature 02](02-comparacion-por-comercio.md). Orden: 13 → 18 → 15 → 16; la 17 es independiente. La 18 se agregó
el 16/11/2026, separada de la 15 porque no necesita ubicación.

## Evolución futura

Sin spec todavía:

- **Comparar el precio propio contra las sucursales cercanas** en vez de la referencia nacional (detalle y
  carrito). La spec 12 deja la referencia nacional aunque haya ubicación.
- **Comparar la canasta** de una compra entera contra cada cadena ("en Coto te salía $X").
- **Promociones de las cadenas** (`promo1` / `promo2` y sus leyendas del SEPA): mostrarlas junto al precio de lista
  y usarlas en la calculadora de precio unitario.
- **Historial de precios SEPA.** Criterio propuesto después de medir la base en la spec 08 (98 MB con el agregado
  vigente):
  - **Precios SEPA: el precio actual y los 2 anteriores de cada EAN × bandera**, cada uno con su vigencia
    (`desde`, `hasta`). Un producto cuyo precio cambia una vez por mes conserva unos 3 meses; uno que cambia 3
    veces por semana, solo la última semana.
  - **Carga por diferencia:** el ZIP se sigue leyendo entero (el SEPA no publica cambios), pero en la base solo se
    agrega una versión cuando el precio cambió o el producto es nuevo. Si no cambió, solo se extiende su vigencia.
  - **Compras del usuario: completas, sin límite.** Son los precios que pagó, ocupan poco y se pueden comparar
    contra el SEPA en cualquier fecha de su historial.
  - La comparación de las compras con precios SEPA depende de que estén en Supabase (Fase 2) y tengan EAN
    (spec 10). Habilitaría comparar la inflación propia contra la de las cadenas
    ([SPEC 04](../../specs/04-inflacion-personal.md)).

### Historial de precios SEPA: mediciones (movidas del feature 06)

#### Medición: cuánto cambian los precios (30/10 → 02/11)

Comparando el agregado del ZIP del viernes 30/10 con el del lunes 02/11 (3 días, fin de semana en el medio):

| | Filas | % de las 225.210 que están en los dos |
|---|---|---|
| Cambia la mediana | 8.944 | 4,0 % (3,2 % con más de 1 % de diferencia) |
| Cambia el mínimo, la mediana o el máximo | 17.031 | 7,6 % |
| EAN × bandera nuevos | 7.631 | — |
| EAN × bandera que dejan de estar | 2.944 | — |

Varía mucho por cadena: Changomas, SuperChangomas e HiperChangomas (`11-*`) cambian 0,2 %; Vea, Disco y Jumbo
(`9-*`) ~6 %; Carrefour Express y Maxi (`10-3`, `10-4`) ~10 %; La Anónima (`2-1`) 17,5 %.

#### Tamaño estimado

Cada fila de `sepa_precios` ocupa ~220 B con su índice (52 MB / 236 mil filas); con `desde` y `hasta`, ~240 B.

- **Techo:** 3 versiones por EAN × bandera son ~710 mil filas, **~170 MB**. Con el resto de la base, ~215 MB: entra
  holgado en los 500 MB del plan gratuito, haya los cambios que haya.
- **Ritmo:** con ~4 % de cambios cada 3 días se agregan unas 3 mil versiones por día (~0,7 MB). El techo se acerca
  recién cuando la mayoría de los precios cambió dos veces, que con la inflación actual es cuestión de meses.

Para resolver en la spec del historial:

1. **Qué cuenta como cambio.** Solo la mediana (4 %) o cualquiera de los tres valores (7,6 %). La mediana es el
   precio de referencia; el mínimo y el máximo se mueven cuando cambia una sola sucursal.
2. **No reescribir todas las filas cada día.** Actualizar el `hasta` de las ~220 mil que no cambian equivale a la
   carga completa de hoy (3 a 6 minutos). Alternativa: no guardar el `hasta` de la versión vigente y tomarlo de
   `sepa_banderas.actualizado` (la última carga de esa cadena); solo se escribe al cerrar una versión.
3. **Los que dejan de estar** (2.944 en 3 días): cerrar su versión con la última fecha en que aparecieron, o
   borrarlos como hoy.
4. **Medir de un día al siguiente** (no de viernes a lunes) antes de cerrar la spec.

## Modelo de datos propuesto

El de cada spec (13: sucursales y precios por sucursal; 17: imágenes). Para el historial, una versión por cambio
de precio con `desde` / `hasta` por EAN × bandera, como se describe arriba.

## UI/UX

- Con ubicación, el resumen y la lista por cadena de Buscar pasan a ser los de los comercios cercanos (spec 15);
  sin ubicación quedan los de la spec 12.
- En el detalle, la tarjeta "Comercios cercanos" va después de la de "Precio de referencia".
- Igual que en el 06: si no hay dato, no se muestra nada en lugar de un error.

## Dependencias

- [06 — Precios de referencia (SEPA)](06-precios-sepa.md): base, ETL diario, EAN en los productos y
  `getSepaPrices`.
- Geolocalización del navegador (HTTPS) para la spec 15.
- Supabase con datos propios (Fase 2) para comparar el historial de compras con el SEPA.

## Preguntas abiertas

- ¿Qué precio mostrar cuando hay promo: el de lista, el de la promo o los dos?
- ¿Cuántas versiones de precio SEPA entran en el plan gratuito una vez sumados los precios por sucursal (spec 13)?
