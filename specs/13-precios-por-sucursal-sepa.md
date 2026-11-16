# SPEC 13 — Sucursales y precios por sucursal en la base SEPA

> **Estado:** Aprobado
> **Depende de:** [SPEC 08](08-base-sepa-supabase.md), [SPEC 09](09-actualizacion-diaria-sepa.md)
> **Fecha:** 2026-11-15
> **Objetivo:** Guardar en Supabase las sucursales del SEPA con su ubicación y el precio de cada producto en cada sucursal, en un formato compacto que entre en el plan gratuito, para que la app pueda mostrar precios de comercios cercanos.

## Por qué existe esta spec

La base guarda un resumen por **EAN × bandera** a nivel nacional (spec 08). Alcanza para una referencia ("en Coto
sale $X"), pero no para responder **¿dónde lo consigo cerca y a cuánto?**: no hay sucursales, ni direcciones, ni
coordenadas, y el precio de una cadena no es uno solo.

Medido el 15/11/2026 sobre la carga del 14/11 (23 banderas, 2.683 sucursales, 240.642 pares EAN × bandera):

| Medida | Valor |
|---|---|
| Pares EAN × bandera con el mismo precio en todas las sucursales | 90.782 (38 %) |
| Pares con menos de 5 % entre el mínimo y el máximo | 112.330 (47 %) |
| Precios por sucursal (suma de `sepa_precios.sucursales`) | 14,28 millones |
| Tamaño actual de la base | 101 MB de 500 MB |

En más de la mitad de los casos el precio cambia según la sucursal (el pañal "Ultrasoft XXG" de 30 unidades, EAN `7790250042082`, va de $14.500 a $22.000
dentro de La Anónima), así que mostrar la mediana de la cadena como "precio del comercio de la esquina" sería
engañoso. Y 14 millones de filas no entran en el plan gratuito. Esta spec resuelve las dos cosas.

La API del portal preciosclaros.gob.ar, que da precios por sucursal, se volvió a probar el 15/11/2026 y sigue
caída (`remaining connection slots are reserved…`, igual que el 31/10): no se puede usar.

## Alcance

**Incluye:**

- Tabla `sepa_sucursales`: una fila por sucursal con nombre, dirección, localidad, provincia y coordenadas.
- Tabla `sepa_precios_sucursal`: una fila por EAN × bandera con los precios distintos y, por cada sucursal de la
  bandera, cuál de esos precios tiene.
- Función `sepa_precios_en_sucursales(eans, sucursales)` para que la app pida el precio de unos pocos productos en
  unas pocas sucursales.
- Cambios en el ETL (lectura de `sucursales.csv` completa, agregación, carga, resumen) y su migración.
- Medición de tamaño y de duración de la carga antes de darla por cerrada.

**Fuera de alcance:**

- Cualquier cambio en la app (specs 15 y 16).
- Promociones (`promo1` / `promo2`), horarios de atención de las sucursales.
- Historial de precios por sucursal.
- Comercios que no informan al SEPA (almacenes, verdulerías).

## Modelo de datos

Migración nueva en `supabase/migrations/`:

```sql
create table public.sepa_sucursales (
  id            text primary key,        -- '10-1-123' = comercio-bandera-sucursal (el mismo formato del portal)
  bandera       text not null references public.sepa_banderas on delete cascade,
  pos           smallint not null,       -- posición de la sucursal en sepa_precios_sucursal.indices (desde 1)
  nombre        text not null,
  tipo          text,                    -- Hipermercado, Supermercado, Autoservicio…
  direccion     text,                    -- calle + número, ya limpios
  barrio        text,
  localidad     text,
  provincia     text,                    -- código ISO del archivo: 'AR-C', 'AR-B'…
  lat           double precision,        -- null si la coordenada no es válida
  lng           double precision,
  actualizado   date not null,
  unique (bandera, pos)
);

create table public.sepa_precios_sucursal (
  ean           text not null,
  bandera       text not null,
  precios       numeric(12,2)[] not null,  -- precios de lista distintos, de menor a mayor
  indices       smallint[] not null,       -- un elemento por sucursal de la bandera, en el orden de pos:
                                           --   posición (desde 1) en precios; 0 = la sucursal no informa el producto
  primary key (ean, bandera),
  foreign key (ean, bandera) references public.sepa_precios on delete cascade
);
```

Ejemplo: una bandera con 4 sucursales (pos 1 a 4) y un producto a $1.000 en las sucursales 1 y 3, $1.200 en la 4
y sin informar en la 2 → `precios = {1000.00, 1200.00}`, `indices = {1, 0, 1, 2}`.

Permisos y RLS iguales a las tablas de la spec 08: `revoke all`, `grant select` a `anon` y `authenticated`, RLS con
política "lectura pública".

```sql
-- Precio de cada producto en cada sucursal pedida. Sin fila si la sucursal no lo informa.
create function public.sepa_precios_en_sucursales(p_eans text[], p_sucursales text[])
returns table (ean text, sucursal text, precio numeric)
language sql stable security invoker set search_path = ''
as $$
  select p.ean, s.id, p.precios[p.indices[s.pos]]
  from public.sepa_sucursales s
  join public.sepa_precios_sucursal p on p.bandera = s.bandera
  where s.id = any(p_sucursales[1:40])
    and p.ean = any(p_eans[1:20])
    and p.indices[s.pos] > 0
$$;
grant execute on function public.sepa_precios_en_sucursales(text[], text[]) to anon, authenticated;
```

## Reglas

- **Por qué arreglos:** una fila por precio y sucursal serían 14,28 millones de filas (del orden de 1 GB con
  índices). Con un arreglo por EAN × bandera son las mismas 240 mil filas de hoy. El arreglo `indices` tiene un
  `smallint` por sucursal de la bandera: sumando `precios de la bandera × sucursales de la bandera` son ~22,5
  millones de elementos, **~45 MB sin comprimir**, y Postgres comprime los arreglos largos (TOAST), donde los
  valores se repiten. Es una estimación: el paso 1 la mide.
- **`pos`** se asigna en cada carga de la bandera, ordenando sus sucursales por `id_sucursal`. Sucursales y precios de
  una bandera se reemplazan **juntos, en la misma transacción** de la carga: nunca queda un arreglo apuntando a
  posiciones de otra carga.
- **Bandera ausente** en el archivo del día: conserva sus sucursales y sus arreglos hasta 14 días, igual que sus
  precios (regla de la spec 08). Al borrarse la bandera, el `on delete cascade` se lleva todo.
- **Coordenadas válidas:** latitud entre −56 y −21 y longitud entre −74 y −53 (Argentina), y distintas de 0. Si no,
  `lat` y `lng` quedan en `null`: la sucursal se guarda igual, pero no aparece por cercanía. El resumen informa
  cuántas quedaron sin coordenadas.
- **Limpieza de texto:** `trim`, espacios repetidos a uno, formato título para nombre, dirección, barrio y
  localidad (`AV RIVADAVIA 5000` → `Av Rivadavia 5000`). `direccion` = calle + número; sin calle, `null`. Los
  caracteres rotos en origen (`Aut�noma`) se dejan como vienen.
- **Precios:** los mismos valores ya validados que alimentan `sepa_precios` (precio de lista, mismas reglas de
  descarte de la spec 08). Para cada EAN × bandera, `precios[1]` = `sepa_precios.minimo` y el último =
  `sepa_precios.maximo`.
- **Límites de la función:** hasta 20 EAN y 40 sucursales por llamada (lo que se pase de más se ignora), para que
  nadie baje la base entera con una sola consulta.
- **Freno de tamaño:** si después de la primera carga la base supera **300 MB**, la spec no se cierra y se aplica
  el plan B (ver *Riesgos*).
- El freno del 50 %, el bloqueo de sesión, el chequeo previo y la regla de 3 días de las specs 08 y 09 no cambian.

## ETL

| Archivo | Cambio |
|---|---|
| `read-zip.ts` | `SUCURSAL_COLUMNS` suma nombre, tipo, calle, número, barrio, localidad, provincia, latitud y longitud (los nombres exactos se confirman contra el archivo en el paso 1) |
| `clean.ts` | `cleanBranchText`, `parseCoordinate` y `validCoordinates`, puras y con tests |
| `aggregate.ts` | Cada precio se guarda con la sucursal que lo informa; salida nueva `sucursales` y `preciosSucursal` (`precios` + `indices`) |
| `load.ts` | Tablas temporales y carga de las dos tablas nuevas dentro de la transacción existente |
| `summary.ts` / `etl.ts` | Sucursales cargadas, sin coordenadas, y tamaño de las tablas nuevas en el resumen y en `--dry-run` |

## Plan de implementación

1. **Medir antes de cambiar.** Con `--file` sobre un ZIP ya bajado, un script descartable cuenta: columnas reales de
   `sucursales.csv`, sucursales con coordenadas inválidas, y precios distintos por EAN × bandera (promedio y
   máximo). Verificar: los números entran en la estimación de 45 MB.
2. **Limpieza + tests** (`clean.ts`): texto, coordenadas (coma decimal, saltos de línea de Comodín, 0, fuera de rango).
3. **Agregación + tests** (`aggregate.ts`): el ejemplo de 4 sucursales de esta spec, una sucursal sin productos,
   un producto con un único precio, sucursal desconocida descartada.
4. **Migración.** `npx supabase db push --linked`. Verificar: tablas, permisos y función, sin avisos nuevos de los
   asesores de seguridad y rendimiento de Supabase.
5. **Carga** (`load.ts`) y test de la carga. Verificar con `sepa_chicos.zip` (el ZIP de prueba de la spec 08).
6. **Carga real** con `--force` en local. Verificar: tamaño de la base, duración total, y la función contra el
   archivo: 5 productos × 5 sucursales elegidos a mano coinciden con `productos.csv`.
7. **Workflow.** Verificar: una ejecución de *Actions → SEPA* termina dentro de los 30 minutos de `timeout-minutes`.
8. **Documentación.** `CLAUDE.md` (tablas, ETL, números), feature 07.

## Criterios de aceptación

- [ ] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.
- [ ] `sepa_sucursales` tiene una fila por sucursal del archivo (2.683 el 14/11) y `count(*)` por bandera coincide con `sepa_banderas.sucursales`.
- [ ] Toda sucursal con coordenadas está dentro del rango de Argentina; el resumen informa cuántas quedaron sin coordenadas.
- [ ] Para todo EAN × bandera: `precios[1] = minimo`, el último `= maximo`, `cardinality(indices)` = sucursales de la bandera y la cantidad de índices mayores a 0 = `sepa_precios.sucursales`.
- [ ] `sepa_precios_en_sucursales` devuelve, para 5 productos × 5 sucursales elegidos a mano, el mismo precio que `productos.csv`.
- [ ] Con 30 EAN y 60 sucursales la función responde solo por los primeros 20 y 40.
- [ ] La clave publishable puede leer las dos tablas y ejecutar la función; no puede escribir.
- [ ] La base queda por debajo de 300 MB y la carga completa en GitHub Actions por debajo de 25 minutos.
- [ ] Una segunda carga del mismo archivo con `--force` deja las mismas filas (sin duplicados ni posiciones corridas).

## Decisiones

- **Sí:** precio por sucursal y no "mediana de la cadena + sucursal más cercana". El 62 % de los pares EAN × bandera tiene más de un precio; la mediana no es el precio de ninguna sucursal en particular.
- **Sí:** arreglos por EAN × bandera. Misma cantidad de filas que hoy y decenas de MB, contra 14 millones de filas.
- **Sí:** tabla aparte de `sepa_precios`. La consulta de referencia por cadena (spec 12) no carga con los arreglos, y si el tamaño se va de las manos se puede vaciar sin tocar lo que ya funciona.
- **Sí:** una función con tope en lugar de leer la tabla directo. La app necesita 20 productos × 40 sucursales, no arreglos de 971 elementos por fila (DIA).
- **Sí:** `id` de sucursal `comercio-bandera-sucursal`. Es el formato del portal y sirve como identificador estable del comercio en el carrito (spec 14).
- **No:** PostGIS. Con 2.683 sucursales la distancia se calcula en el navegador (spec 15); la base no necesita saber dónde está el usuario.
- **No:** la API del portal. Sigue caída.
- **No:** agregar por provincia o localidad. Serían 2 millones de filas y seguiría sin ser el precio de una sucursal.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El tamaño real supera la estimación | El paso 1 mide antes de implementar. Plan B: guardar arreglos solo para los productos presentes en 3 o más banderas (40.546 de 76.712), o solo para CABA y Buenos Aires |
| La carga pasa de ~13 a más de 25 minutos | Cargar los arreglos con `COPY` en lugar de `insert` por lotes; subir `timeout-minutes` |
| Memoria del ETL (DIA: 4.472 productos × 971 sucursales) | Arreglos tipados por producto en lugar de objetos; se sigue procesando un comercio por vez |
| Coordenadas mal cargadas pero dentro del país | No se pueden detectar; la app muestra la dirección junto a la distancia |
| Una sucursal cambia de `pos` entre cargas | `pos` y arreglos se escriben juntos en la misma transacción; criterio de aceptación específico |

## Lo que **no** incluye esta spec

- Cambios en la app.
- Promociones y horarios.
- Historial por sucursal.
- Comercios fuera del SEPA.
