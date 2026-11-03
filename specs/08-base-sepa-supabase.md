# SPEC 08 — Base de precios SEPA en Supabase

> **Estado:** Implementado
> **Depende de:** —
> **Fecha:** 2026-11-01
> **Objetivo:** Crear en Supabase las tablas con los precios de referencia del SEPA (Precios Claros) resumidos por producto y cadena, y un script que baja el archivo oficial del día, lo limpia, lo agrega y lo carga.

Origen: [`docs/features/06-precios-sepa.md`](../docs/features/06-precios-sepa.md).

## Por qué existe esta spec

El SEPA publica cada día ~14 millones de precios (~325 MB comprimidos). No se puede bajar desde el navegador ni
guardar entero en el plan gratuito de Supabase (500 MB). Resumido por **producto (EAN) × bandera** son ~244 mil
filas: alcanza para responder "¿cuánto sale esto en cada cadena?" y entra con holgura.

Esta spec deja la base cargada y un comando para recargarla a mano. La [spec 09](09-actualizacion-diaria-sepa.md)
lo automatiza; las specs [10](10-productos-con-codigo-de-barras.md), [11](11-lector-codigo-de-barras.md) y
[12](12-precio-de-referencia-sepa.md) lo usan desde la app.

## Alcance

**Incluye:**

- Proyecto de la CLI de Supabase (`supabase/config.toml`) y la migración SQL versionada en `supabase/migrations/`
  con las tablas `sepa_banderas`, `sepa_productos`, `sepa_precios` y `sepa_cargas`, índices y RLS (lectura pública
  solo de las tres primeras).
- Script `scripts/sepa/etl.ts` (Node 24, TypeScript sin compilar) que:
  descarga el ZIP del día a un archivo temporal (o lee uno local) → lo recorre en streaming → limpia → agrega →
  carga en una transacción.
- Modo `--dry-run`: hace todo menos conectarse a la base e imprime las estadísticas.
- Funciones puras de limpieza y agregación con tests de Vitest.
- `src/lib/gtin.ts` (validar y normalizar códigos de barras), compartido con la app en las specs siguientes.
- `.env.example` con las variables nuevas.
- `.mcp.json` versionado (MCP de Supabase del proyecto, sin secretos).

**Fuera de alcance:**

- Ejecución automática diaria (spec 09), incluidos los reintentos de descarga.
- Historial de precios SEPA (cada carga reemplaza a la anterior; ver *Decisiones*).
- Detalle por sucursal o por provincia.
- Cualquier cambio en la UI.

## Fuente

Dataset CKAN `sepa-precios` en `datos.produccion.gob.ar` (detalle en el feature 06):

- `GET https://datos.produccion.gob.ar/api/3/action/package_show?id=sepa-precios` → `result.resources[]`.
  Los ZIP diarios tienen `format: "ZIP"` y `name` = día de la semana. Se elige el de `last_modified` más reciente.
- Sin `--file`, el ZIP se baja a `os.tmpdir()` y se procesa por el mismo camino que `--file`. El temporal se borra
  al terminar, también si hay error.
- ZIP externo → carpeta `YYYY-MM-DD/` → un ZIP por comercio → `comercio.csv`, `sucursales.csv`, `productos.csv`.
- **Fecha del archivo** = el nombre de la carpeta `YYYY-MM-DD/` del ZIP externo.
- CSV con `|`, UTF-8 (a veces con BOM), campos con relleno de espacios, última línea `Última actualización: <ISO>`.

## Modelo de datos

### Migración — `supabase/migrations/20261031000000_sepa.sql`

```sql
-- En el esquema extensions, como el resto de las extensiones del proyecto (el asesor marca las que están en public)
create extension if not exists pg_trgm with schema extensions;

-- Una fila por bandera (cadena) del archivo: "Hipermercado Carrefour", "Disco", "Coto"…
create table public.sepa_banderas (
  id            text primary key,        -- '10-1' = id_comercio-id_bandera
  comercio_id   integer not null,
  bandera_id    integer not null,
  nombre        text not null,           -- comercio_bandera_nombre
  razon_social  text not null,
  sucursales    integer not null,        -- sucursales informadas en la última carga
  actualizado   date not null            -- fecha del archivo SEPA de la última carga de esta bandera
);

-- Una fila por producto con EAN real
create table public.sepa_productos (
  ean           text primary key check (ean ~ '^[0-9]{13}$'),
  descripcion   text not null,
  marca         text,
  cantidad      numeric(12,3),           -- presentación normalizada: 500
  unidad        text check (unidad in ('g', 'ml', 'u')),
  banderas      integer not null,        -- precios en sepa_precios para este EAN (se recalcula en cada carga)
  actualizado   date not null
);
create index sepa_productos_descripcion_trgm on public.sepa_productos
  using gin (descripcion extensions.gin_trgm_ops);

-- Precio resumido por producto y bandera (precio de lista, sin promos)
create table public.sepa_precios (
  ean           text not null references public.sepa_productos on delete cascade,
  bandera       text not null references public.sepa_banderas on delete cascade,
  minimo        numeric(12,2) not null,
  mediana       numeric(12,2) not null,
  maximo        numeric(12,2) not null,
  sucursales    integer not null,        -- sucursales que informan el producto
  actualizado   date not null,
  primary key (ean, bandera)
);

-- Registro de cada ejecución del ETL (privada)
create table public.sepa_cargas (
  id                bigint generated always as identity primary key,
  fecha_archivo     date not null,
  inicio            timestamptz not null,
  fin               timestamptz,
  estado            text not null check (estado in ('ok', 'error', 'omitida')),
  banderas_ok       integer,
  omitidos          jsonb,               -- [{ "archivo": "...", "motivo": "zip roto" }, …]
  filas_leidas      bigint,
  filas_precios     integer,             -- pares EAN × bandera del archivo
  detalle           text
);

-- Permisos explícitos: no dependen de los permisos por defecto del proyecto (que Supabase va a quitar)
revoke all on public.sepa_banderas, public.sepa_productos, public.sepa_precios, public.sepa_cargas
  from anon, authenticated;
grant select on public.sepa_banderas, public.sepa_productos, public.sepa_precios to anon, authenticated;

alter table public.sepa_banderas  enable row level security;
alter table public.sepa_productos enable row level security;
alter table public.sepa_precios   enable row level security;
alter table public.sepa_cargas    enable row level security;

create policy "lectura pública" on public.sepa_banderas  for select to anon, authenticated using (true);
create policy "lectura pública" on public.sepa_productos for select to anon, authenticated using (true);
create policy "lectura pública" on public.sepa_precios   for select to anon, authenticated using (true);
-- sepa_cargas sin políticas: solo la conexión del ETL (rol postgres) la lee y escribe
```

### Archivos del ETL — `scripts/sepa/`

| Archivo | Contenido |
|---|---|
| `etl.ts` | Punto de entrada: argumentos (`--file`, `--dry-run`, `--force`), descarga, orquestación, estadísticas, código de salida |
| `clean.ts` | Funciones puras de limpieza (tabla de abajo) |
| `aggregate.ts` | Agregación por comercio y acumulado de productos |
| `read-zip.ts` | Lectura en streaming del ZIP externo, los ZIP internos y las líneas de cada CSV |
| `load.ts` | Transacción de carga con `pg` |
| `*.test.ts` | Tests de Vitest junto a cada módulo |

Los scripts y `src/lib/gtin.ts` importan con ruta relativa y extensión `.ts` (Node no resuelve el alias `@/`) y
usan solo sintaxis de TypeScript que Node puede borrar (sin `enum`, `namespace` ni propiedades en el constructor).

### Limpieza — `scripts/sepa/clean.ts` (funciones puras)

| Función | Regla |
|---|---|
| `parseLine(line)` | `split('|')` + `trim()` de cada campo; `null` si la línea es el pie (`Última actualización` / `Ultima actualizacion`, con o sin tilde o con `�`) o le faltan columnas |
| `parseFooterDate(text)` | Fecha del pie de `productos.csv` (`2026-10-30T09:19:16-03:00` o `-0300`) → `YYYY-MM-DD` |
| `parsePrice(text)` | `"04210.00"` → `4210`; `null` si no es número o es `<= 0` |
| `normalizeUnit(text)` | Mapea a `{ factor, unit }` con `unit` ∈ `g` / `ml` / `u`, o `null` si no se reconoce (ver tabla) |
| `presentation(row)` | Presentación del producto según la fila (ver *Reglas*) → `{ cantidad, unidad }` o `null` |
| `median(values)` | Mediana; con cantidad par, promedio de los dos centrales |

Tabla de unidades (se compara en mayúsculas y sin punto final):

| Entrada | Salida |
|---|---|
| `G`, `GR`, `GRS`, `GRM`, `GRAMOS` | `g` × 1 |
| `KG`, `KGM`, `KGR`, `KILO` | `g` × 1000 |
| `ML`, `CC`, `CM3`, `CMQ` | `ml` × 1 |
| `L`, `LT`, `LTR`, `LITRO` | `ml` × 1000 |
| `U`, `UN`, `UNI`, `UD`, `UNIDA`, `UNIDAD`, `EA`, `CU`, `PC` | `u` × 1 |
| Cualquier otra (`CM`, `MT`, vacío…) | `null` |

### Agregación — `scripts/sepa/aggregate.ts`

Se procesa **un comercio por vez** (cada ZIP interno), así la memoria queda acotada por el comercio más grande
(DIA: ~4,2 millones de filas).

## Reglas

**Se descarta el comercio entero, y se anota en `omitidos` con su motivo:**

- Un ZIP interno vacío o que no se puede abrir (el 30/10 pasó con `comercio-sepa-36`) → `zip roto`.
- Un `comercio.csv`, `sucursales.csv` o `productos.csv` faltante o sin las columnas esperadas → `encabezados inválidos`.
- Un `productos.csv` sin pie con fecha → `sin fecha de actualización`.
- Un comercio cuyo pie de `productos.csv` tiene **más de 7 días** de antigüedad respecto de la fecha del archivo
  (Unicoop informaba precios del 11/06/2025) → `desactualizado`. Se usa el pie de `productos.csv` y **no** el campo
  `comercio_ultima_actualizacion`: Changomás tiene ahí 2021-04-03 pero sus precios son del día.

**Registros partidos en varias líneas:** una línea con menos columnas que el encabezado se junta con las siguientes
(separadas por un espacio) hasta completar las columnas. En el `sucursales.csv` de Comodín (`comercio-sepa-6`), la
latitud y la longitud traen saltos de línea adentro y sin esto se reconoce 1 sucursal de 26. Si al juntar las líneas
se pasa de columnas, el pedazo anterior se descarta y la línea se lee sola; el pie también descarta el pedazo pendiente.

**Se descarta la fila sin anotar:**

- Filas con `productos_ean` ≠ `1`: `id_producto` es un código interno de la cadena, no un código de barras
  (~170 mil filas el 30/10, sobre todo de Coto y Carrefour).
- Filas cuyo `id_producto` no tiene 13 dígitos o no pasa el dígito verificador (`isValidGtin`).
- Filas con precio de lista vacío o `<= 0` (70 filas de California el 30/10).
- Filas de una sucursal que no está en `sucursales.csv` del mismo comercio.

**Agregados:**

- `sepa_precios`: por `(ean, id_comercio-id_bandera)`: mínimo, mediana y máximo de `productos_precio_lista` entre
  sucursales, y cantidad de sucursales.
- `sepa_banderas.sucursales`: filas de `sucursales.csv` de esa bandera.
- Una bandera de `comercio.csv` sin ningún precio válido no se carga (el 30/10: Topsy, Bomba, Maxi Comodín y
  SuperChangomas `11-1` y `11-3`, sin sucursales). Si tenía precios de una carga anterior, se trata como ausente
  (regla 7 de la carga).
- `sepa_productos.descripcion` y `marca`: el valor más frecuente entre todas las filas del EAN en el archivo (a igual
  cantidad, el primero en orden alfabético). Se colapsan espacios repetidos.
- `sepa_productos.cantidad` / `unidad` (presentación): cada fila propone una con esta regla, y gana la más
  frecuente entre todas las filas del EAN:
  1. Si `productos_unidad_medida_presentacion` es de peso o volumen → `cantidad_presentacion × factor`
     (DIA: `500 GR` → `500 g`).
  2. Si no, y `productos_unidad_medida_referencia` es de peso o volumen → `cantidad_referencia × factor`
     (Carrefour: presentación `1 UNI`, referencia `40 GRM` → `40 g`).
  3. Si no, y ambas son unidades → `cantidad_presentacion` en `u` (huevos `6 EA` → `6 u`).
  4. Si no → la fila no propone presentación. Cantidad `0` o no numérica → tampoco.
- `sepa_productos.banderas`: no lo calcula el script; se recalcula en SQL al final de la carga (paso 9).

**Carga (`load.ts`, una transacción):**

1. Si la fecha del archivo es **anterior** a la de la última carga `ok`, terminar como `omitida` con motivo
   "archivo anterior a la última carga" (salvo `--force`).
2. Si ya hay una carga `ok` con la misma `fecha_archivo`, terminar como `omitida` sin tocar las tablas (salvo `--force`).
3. **Freno de seguridad:** si las filas de precios del archivo son menos del 50 % de `filas_precios` de la última
   carga `ok`, abortar con estado `error` sin tocar las tablas. `--force` **no** saltea el freno. Sin carga `ok`
   previa no hay freno.
4. Cargar en tablas temporales (`create temp table … on commit drop`) con `INSERT` multi-fila en lotes de 1000.
5. `upsert` de `sepa_banderas` y `sepa_productos` (`on conflict … do update`).
6. Para cada bandera cargada: `upsert` de sus precios y `delete` de sus precios cuyo `ean` no está en la tabla
   temporal (productos que dejó de informar).
7. Las banderas **no** cargadas hoy (ZIP roto, comercio desactualizado) conservan sus precios anteriores. Cuando su
   `actualizado` tiene más de 14 días respecto de la fecha del archivo, se borra la fila de `sepa_banderas` y el
   `on delete cascade` se lleva sus precios.
8. Borrar `sepa_productos` sin ningún precio.
9. Recalcular `sepa_productos.banderas` = cantidad de filas de `sepa_precios` por `ean`.
10. Registrar la ejecución en `sepa_cargas`. Si la transacción falla, se hace `rollback` y el registro `error` se
    escribe después, fuera de ella. Las `omitida` también se registran.

**Salida del script:** estado `ok` u `omitida` → código 0; `error` → código 1. Con `--dry-run` no hay conexión ni
registro: solo se imprimen las estadísticas.

## Configuración

| Variable | Dónde | Uso |
|---|---|---|
| `SUPABASE_DB_URL` | `.env.local` (y secret de GitHub en la spec 09) | Cadena del **Session pooler** de Supabase (*Connect → Session pooler*, puerto 5432). La conexión directa es solo IPv6 y GitHub Actions no la alcanza |

`.env.example` (versionado):

```bash
# App (specs 10–12): Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<clave publishable / anon>

# ETL SEPA (specs 08–09): Connect → Session pooler. Nunca con prefijo NEXT_PUBLIC_
SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

`package.json`:

```json
"scripts": {
  "sepa:etl": "node --env-file-if-exists=.env.local --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/sepa/etl.ts"
}
```

Uso: `npm run sepa:etl` · `npm run sepa:etl -- --file ruta/sepa_viernes.zip` · `npm run sepa:etl -- --dry-run` ·
`npm run sepa:etl -- --force`.

`--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`: Node avisa en cada ejecución que el `package.json` no declara
`"type": "module"`. En lugar de cambiar el tipo de todo el paquete por un script, el aviso se apaga solo para este.

Proyecto de Supabase: `bjzeknajhrbtormkuunj` (`https://bjzeknajhrbtormkuunj.supabase.co`), vacío al 01/11/2026.

Conexión cifrada y verificada: `load.ts` conecta con `ssl: { ca }` usando `supabase/prod-ca-2021.crt` (*Supabase
Root 2021 CA*, se baja de *Project Settings → Database → SSL Configuration*, vence en 2031). Es un certificado
público y se versiona; sin él, `pg` rechaza la cadena del pooler (`SELF_SIGNED_CERT_IN_CHAIN`).

## Plan de implementación

1. **Dependencias y configuración.** `npm i -D fflate pg @types/pg supabase`. En `tsconfig.json`:
   `"allowImportingTsExtensions": true` (los scripts importan con extensión `.ts` porque Node los ejecuta sin
   compilar) y `"erasableSyntaxOnly": true` (que `tsc` rechace la sintaxis que Node no puede borrar). En
   `vitest.config.mts`: sumar `scripts/**/*.test.ts` a `include`. Script `sepa:etl` en `package.json`. Crear
   `.env.example`. Versionar `.mcp.json`. Verificar: `npm run lint`, `npm test` y `npm run build` siguen pasando.
2. **`src/lib/gtin.ts` + tests.** `isValidGtin(code)` (8, 12, 13 o 14 dígitos, dígito verificador GS1) y
   `toGtin13(code)` (EAN-8 y UPC-A se completan con ceros a la izquierda; un GTIN-14 que empieza con `0` pierde
   ese cero; cualquier otro caso → `null`). Verificar: tests con `7793704000911`, `77956262`, `012345678905`.
3. **Limpieza + tests** (`scripts/sepa/clean.ts`). Verificar: tests con líneas reales del archivo del 30/10
   (copiadas en el test), cada unidad de la tabla, pies con y sin tilde, precios `04210.00`, `0`, `""`.
4. **Agregación + tests** (`scripts/sepa/aggregate.ts`). Verificar: test con un comercio de juguete con 2 banderas,
   3 sucursales, un EAN con descripciones distintas y uno con presentación Carrefour (`1 UNI` / `40 GRM`).
5. **Lectura del ZIP** (`scripts/sepa/read-zip.ts`): ZIP externo y ZIP internos con `fflate` en streaming,
   líneas con `TextDecoderStream`, sin cargar ningún CSV entero en memoria (el de DIA pasa los 500 MB y supera el
   largo máximo de un string). Validación de encabezados por comercio. Verificar: test con un ZIP anidado armado en
   el test con `zipSync`, incluidos un ZIP interno vacío y uno con una columna faltante (ambos en `omitidos`).
6. **`etl.ts` con `--dry-run` sobre el archivo real.** Argumentos, descarga a temporal y estadísticas. Usar primero
   el archivo de referencia del 30/10/2026 con el que se relevaron los números de esta spec, guardado fuera del
   repo en `D:\apps\archivos-sepa\sepa_viernes.zip`
   (`npm run sepa:etl -- --dry-run --file D:\apps\archivos-sepa\sepa_viernes.zip`). Verificar: algo menos de
   243.734 precios (EAN × bandera): ese es el conteo bruto del relevamiento, con Unicoop y con las filas sin EAN
   real todavía incluidas. Además, ~75 mil productos, Unicoop (`comercio-sepa-47`) y el ZIP vacío
   (`comercio-sepa-36`) en `omitidos`, y presentación en al menos el 90 % de los productos. Después repetir sin
   `--file` (descarga el ZIP del día). Anotar los números reales en esta spec.
7. **Migración.** `npx supabase init` (crea `supabase/config.toml`) → `npx supabase login` →
   `npx supabase link --project-ref bjzeknajhrbtormkuunj` → `npx supabase db push`. Verificar: las 4 tablas en el
   dashboard, con RLS activo, y la migración en el historial (`npx supabase migration list`).
8. **Carga.** `scripts/sepa/load.ts` con `pg` y la transacción de *Reglas*, conectado desde `etl.ts`. Armar a mano
   con 7-Zip, en `D:\apps\archivos-sepa\`, dos copias del archivo del 30/10: `sepa_sin_dia.zip` (sin el ZIP de DIA)
   y `sepa_chicos.zip` (solo comercios chicos, menos del 50 % de los precios). Verificar en este orden:
   1. Primera carga completa con `sepa_viernes.zip`.
   2. Segunda ejecución con el mismo archivo → `omitida`.
   3. Con `--force` → vuelve a cargar y la cantidad de filas no cambia.
   4. `sepa_chicos.zip --force` → `error` por el freno; las tablas quedan como estaban.
   5. `sepa_sin_dia.zip --force` → `ok`; los precios de DIA siguen con la misma cantidad y el mismo `actualizado`.
   6. `sepa_viernes.zip --force` para dejar la base completa.
   7. Si ya se cargó el ZIP del día, `sepa_viernes.zip` sin `--force` → `omitida` por archivo anterior.
9. **Tamaño.** `select pg_size_pretty(pg_database_size('postgres'))` y el tamaño de cada tabla. Verificar: la base
   entera ocupa menos de 150 MB. Anotar los valores (los necesita la decisión de historial).
10. **Documentación.** `CLAUDE.md`: árbol con `supabase/`, `scripts/sepa/` y `.mcp.json`, script `sepa:etl`,
    variables de entorno, sección de la base SEPA. Feature 06 → *En curso*.

### Números reales del `--dry-run` (paso 6)

| | 30/10/2026 (`sepa_viernes.zip`) | 02/11/2026 (descarga, `sepa_lunes.zip`)¹ |
|---|---|---|
| Comercios leídos / omitidos | 12 / 2 | 14 / 2 |
| Omitidos | `comercio-sepa-47` (Unicoop) `desactualizado`; `comercio-sepa-36` `zip roto` | Los mismos dos |
| Banderas cargadas | 20 | 26 |
| Filas leídas (válidas) | 14.258.002 (14.005.055) | 14.289.616 (14.014.246) |
| Filas de precios (EAN × bandera) | 231.371 | 232.124 |
| Productos | 72.290 | 73.443 |
| Con presentación / con marca | 98,7 % / 99,9 % | 95,9 % / 99,8 % |
| Duración / pico de memoria | 103 s / 660 MB | 169 s (con descarga) / 598 MB |

¹ Medido antes de sumar los registros partidos y la exclusión de banderas sin precios. Con esas dos reglas, el 30/10
pasó de 24 a 20 banderas y de 230.654 a 231.371 precios (Comodín: de 717 a 18.642 filas válidas y de 1 a 23
sucursales, más las 3 de Maxi Comodín).

El 02/11 aparecen comercios que no estaban el 30/10 (`comercio-sepa-3` Deheza, `-4` Estación Lima, `-8` Mariano Max)
y falta `comercio-sepa-20` (La Agrícola). El temporal de la descarga no quedó en disco.

### Tamaño medido (paso 9)

Medido el 03/11/2026, con la carga del 02/11 sobre la del 30/10 (La Agrícola conserva sus precios por la regla 7):

| Tabla | Filas | Datos | Índices | Total |
|---|---|---|---|---|
| `sepa_precios` | 236.058 | 34 MB | 18 MB (clave primaria) | 52 MB |
| `sepa_productos` | 75.216 | 15 MB | 21 MB (16 MB trigramas + 4,6 MB clave primaria) | 36 MB |
| `sepa_banderas` | 23 | 8 kB | 16 kB | 64 kB |
| `sepa_cargas` | 8 | 8 kB | 16 kB | 32 kB |
| **Base entera** (`pg_database_size`) | | | | **98 MB** |

Las tablas SEPA suman 88 MB; los 10 MB restantes son del sistema (esquemas `auth`, `storage`, catálogo). Hasta los
500 MB del plan gratuito quedan ~400 MB. Una copia semanal de `sepa_precios` tal como está (~52 MB con su índice)
los llenaría en unas 8 semanas. Por eso el historial (spec futura) guarda el catálogo entero solo por tres semanas;
las compras de cada usuario se conservan completas (ver [feature 06](../docs/features/06-precios-sepa.md)).

## Criterios de aceptación

- [x] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings; el build no necesita ninguna variable de entorno.
- [x] `npm run sepa:etl -- --dry-run` termina sin conexión a la base e imprime: fecha del archivo, banderas cargadas, omitidos con motivo, filas leídas y filas de precios.
- [x] Sin `--file`, el ZIP se baja a un temporal y el temporal no queda en disco al terminar (con éxito o con error).
- [x] Ningún CSV se carga entero en memoria; el proceso termina con menos de 2 GB de RAM.
- [x] Un comercio con una columna faltante queda en `omitidos` con motivo `encabezados inválidos` y los demás se cargan.
- [x] Después de una carga, `select count(*) from sepa_precios` coincide con lo informado por el script.
- [x] Un EAN con presentación al estilo Carrefour (`1 UNI` / referencia `40 GRM`) queda con `cantidad = 40`, `unidad = 'g'`.
- [x] Ningún `ean` de `sepa_productos` falla `isValidGtin`.
- [x] `sepa_productos.banderas` coincide con `count(*)` de `sepa_precios` por `ean` en todos los productos.
- [x] Con la clave publishable/anon (`curl …/rest/v1/sepa_precios?limit=1`) se leen precios; `sepa_cargas` devuelve vacío o error; cualquier `insert` es rechazado.
- [x] Repetir la carga del mismo archivo termina como `omitida`; con `--force`, no cambia la cantidad de filas.
- [x] Cargar un archivo anterior a la última carga `ok` sin `--force` termina como `omitida`.
- [x] `sepa_chicos.zip --force` aborta por el freno, deja estado `error` y las tablas quedan como estaban.
- [x] Después de `sepa_sin_dia.zip --force`, las banderas de DIA conservan la misma cantidad de precios y el mismo `actualizado`.
- [x] El script sale con código 0 en `ok` y `omitida`, y con código 1 en `error`.
- [x] La app funciona igual que antes (no se tocó la UI).

## Decisiones

- **Sí:** agregar por EAN × bandera a nivel nacional. 244 mil filas en lugar de 14 millones; por provincia serían 2 millones.
- **Sí:** mediana además de mínimo y máximo. La misma cadena tiene precios distintos por sucursal y la mediana no se deja llevar por una sucursal con un error de carga.
- **Sí:** solo precio de lista. Las promos traen leyendas en texto libre (`2x1`, `70 % 2da`) que piden su propio análisis.
- **Sí:** guardar el EAN en GTIN-13 (13 dígitos). Así viene en el SEPA, y la app normaliza a lo mismo lo que lee el escáner (spec 11).
- **Sí:** Node con TypeScript sin compilar (Node 24) en lugar de Python. Un solo lenguaje en el repo, los tests en Vitest y `gtin.ts` compartido con la app.
- **Sí:** `fflate` para los ZIP. Lee en streaming, no tiene dependencias y sirve también para armar los ZIP de prueba.
- **Sí:** bajar el ZIP a un archivo temporal antes de procesarlo. Un corte de red no deja el proceso a medias, la descarga y el procesamiento siguen un solo camino (el de `--file`) y los reintentos de la spec 09 quedan simples.
- **No:** procesar el ZIP en streaming directo desde la red. Un corte a mitad obliga a empezar de cero.
- **Sí:** `pg` contra el Session pooler en lugar de la API REST. Permite una transacción única (no queda la base a medio cargar) y la API REST con la clave secreta no aporta nada para un proceso batch.
- **Sí:** migraciones con la CLI de Supabase en `supabase/migrations/`. El historial de la base queda alineado con los archivos del repo y la Fase 2 sigue el mismo camino.
- **Sí:** permisos explícitos en la migración (`revoke all` a `anon` y `authenticated`, `grant select` en las tres tablas públicas). El proyecto hoy da todos los permisos por defecto a cada tabla nueva y Supabase anunció que los va a quitar: así la lectura pública no depende de eso y `sepa_cargas` queda cerrada también por permisos, no solo por RLS.
- **Sí:** `pg_trgm` en el esquema `extensions`. Es donde están las demás extensiones del proyecto y evita la advertencia `extension_in_public` del asesor.
- **Sí:** SSL verificando contra la autoridad certificante de Supabase (`supabase/prod-ca-2021.crt`). Cifra la conexión y comprueba que el servidor sea el del proyecto; `rejectUnauthorized: false` cifraría sin comprobar a quién se le manda la contraseña.
- **Sí:** `fin` de `sepa_cargas` con `clock_timestamp()`. Dentro de la transacción `now()` devuelve la hora de inicio y la duración registrada saldría en cero.
- **No:** aplicar la migración con el MCP de Supabase (`apply_migration`). Registra su propia versión y un `db push` posterior puede chocar. El MCP queda para consultar e inspeccionar.
- **Sí:** versionar `.mcp.json`. No tiene secretos (el `project_ref` ya es público en la URL de la API) y quien clone el repo tiene el MCP configurado.
- **Sí:** encabezados inválidos omiten solo ese comercio. Una cadena que cambia su formato no frena la actualización de las demás; si cambian todas, el freno del 50 % aborta la carga.
- **No:** abortar toda la carga por los encabezados de un comercio.
- **Sí:** borrar los precios que una bandera dejó de informar comparando contra la tabla temporal. Funciona igual con `--force` sobre un archivo de la misma fecha, donde comparar por `actualizado` no borra nada.
- **Sí:** las banderas ausentes más de 14 días se borran enteras (fila y precios por cascada). No quedan cadenas sin precios en la base.
- **Sí:** recalcular `sepa_productos.banderas` en SQL. Siempre coincide con los precios de la base, incluidos los conservados de banderas ausentes.
- **Sí:** un archivo anterior a la última carga `ok` se omite salvo `--force`. Evita pisar precios nuevos con viejos por error.
- **Sí:** `--force` saltea las reglas de fecha pero no el freno del 50 %. El freno protege de un archivo incompleto, que es justo lo que no se puede forzar sin querer.
- **Sí:** verificar el freno y la conservación de banderas con ZIP recortados a mano. No suma código que solo sirve para probar.
- **No:** flag `--exclude` ni tests de integración contra Postgres (Supabase local con Docker). El primero es código solo de prueba; los segundos suman Docker al flujo y no entran en el CI actual.
- **Sí:** lectura pública con RLS y sin login. Son datos abiertos (CC-BY-4.0); escribir solo puede la conexión del ETL.
- **No (por ahora):** historial. Una foto semanal del agregado (~244 mil filas) llenaría el plan gratuito en meses. Se decide en otra spec con el tamaño medido en el paso 9.
- **No:** usar la API del portal preciosclaros.gob.ar. No es oficial y el 31/10/2026 fallaba en todas las llamadas.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Cambia el formato del ZIP o de los CSV | El parser valida encabezados por comercio y omite los que no cumplen; si cambian todos, el freno del 50 % aborta con `error` sin tocar las tablas |
| Un día viene incompleto | Freno del 50 %; las banderas faltantes conservan sus precios hasta 14 días |
| Precios absurdos por errores de carga de las cadenas | La mediana los amortigua; el mínimo y el máximo se muestran como rango, no como referencia |
| Presentaciones mal informadas | Gana la más frecuente entre todas las filas del EAN; si ninguna sirve, queda `null` |
| Se filtra `SUPABASE_DB_URL` | Solo en `.env.local` (ignorado) y en secrets de GitHub; nunca con prefijo `NEXT_PUBLIC_` |
| Límite de 500 MB del plan gratuito | Medición obligatoria en el paso 9 |
| Se carga por error un archivo viejo | Se omite si es anterior a la última carga `ok`, salvo `--force` |
| El temporal de 325 MB queda en disco | Se borra en un `finally`, también si hay error |

## Lo que **no** incluye esta spec

- Ejecución automática ni reintentos de descarga (spec 09).
- Historial de precios SEPA.
- Precios por sucursal o provincia.
- Promociones.
- Cambios en la app (specs 10–12).
