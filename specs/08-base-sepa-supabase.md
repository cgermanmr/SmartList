# SPEC 08 — Base de precios SEPA en Supabase

> **Estado:** Borrador
> **Depende de:** —
> **Fecha:** 2026-10-31
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

- Migración SQL versionada en `supabase/migrations/` con las tablas `sepa_banderas`, `sepa_productos`,
  `sepa_precios` y `sepa_cargas`, índices y RLS (lectura pública solo de las tres primeras).
- Script `scripts/sepa/etl.ts` (Node 24, TypeScript sin compilar) que:
  descarga el ZIP del día (o lee uno local) → lo recorre en streaming → limpia → agrega → carga en una transacción.
- Modo `--dry-run`: hace todo menos escribir en la base e imprime las estadísticas.
- Funciones puras de limpieza y agregación con tests de Vitest.
- `src/lib/gtin.ts` (validar y normalizar códigos de barras), compartido con la app en las specs siguientes.
- `.env.example` con las variables nuevas.

**Fuera de alcance:**

- Ejecución automática diaria (spec 09).
- Historial de precios SEPA (cada carga reemplaza a la anterior; ver *Decisiones*).
- Detalle por sucursal o por provincia.
- Cualquier cambio en la UI.

## Fuente

Dataset CKAN `sepa-precios` en `datos.produccion.gob.ar` (detalle en el feature 06):

- `GET https://datos.produccion.gob.ar/api/3/action/package_show?id=sepa-precios` → `result.resources[]`.
  Los ZIP diarios tienen `format: "ZIP"` y `name` = día de la semana. Se elige el de `last_modified` más reciente.
- ZIP externo → carpeta `YYYY-MM-DD/` → un ZIP por comercio → `comercio.csv`, `sucursales.csv`, `productos.csv`.
- CSV con `|`, UTF-8 (a veces con BOM), campos con relleno de espacios, última línea `Última actualización: <ISO>`.

## Modelo de datos

### Migración — `supabase/migrations/20261031000000_sepa.sql`

```sql
create extension if not exists pg_trgm;

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
  banderas      integer not null,        -- en cuántas banderas aparece
  actualizado   date not null
);
create index sepa_productos_descripcion_trgm on public.sepa_productos
  using gin (descripcion gin_trgm_ops);

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
  filas_precios     integer,
  detalle           text
);

alter table public.sepa_banderas  enable row level security;
alter table public.sepa_productos enable row level security;
alter table public.sepa_precios   enable row level security;
alter table public.sepa_cargas    enable row level security;

create policy "lectura pública" on public.sepa_banderas  for select to anon, authenticated using (true);
create policy "lectura pública" on public.sepa_productos for select to anon, authenticated using (true);
create policy "lectura pública" on public.sepa_precios   for select to anon, authenticated using (true);
-- sepa_cargas sin políticas: solo la conexión del ETL (rol postgres) la lee y escribe
```

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

**Se descarta, y se anota en `omitidos`:**

- Un ZIP interno vacío o que no se puede abrir (el 30/10 pasó con `comercio-sepa-36`).
- Un comercio cuyo pie de `productos.csv` tiene **más de 7 días** de antigüedad respecto de la fecha del archivo
  (Unicoop informaba precios del 11/06/2025). Se usa el pie de `productos.csv` y **no** el campo
  `comercio_ultima_actualizacion`: Changomás tiene ahí 2021-04-03 pero sus precios son del día.

**Se descarta sin anotar:**

- Filas con `productos_ean` ≠ `1`: `id_producto` es un código interno de la cadena, no un código de barras
  (~170 mil filas el 30/10, sobre todo de Coto y Carrefour).
- Filas cuyo `id_producto` no tiene 13 dígitos o no pasa el dígito verificador (`isValidGtin`).
- Filas con precio de lista vacío o `<= 0` (70 filas de California el 30/10).
- Filas de una sucursal que no está en `sucursales.csv` del mismo comercio.

**Agregados:**

- `sepa_precios`: por `(ean, id_comercio-id_bandera)`: mínimo, mediana y máximo de `productos_precio_lista` entre
  sucursales, y cantidad de sucursales.
- `sepa_banderas.sucursales`: filas de `sucursales.csv` de esa bandera.
- `sepa_productos.descripcion` y `marca`: el valor más frecuente entre todas las filas del EAN (a igual cantidad,
  el primero en orden alfabético). Se colapsan espacios repetidos.
- `sepa_productos.cantidad` / `unidad` (presentación): cada fila propone una con esta regla, y gana la más
  frecuente entre todas las filas del EAN:
  1. Si `productos_unidad_medida_presentacion` es de peso o volumen → `cantidad_presentacion × factor`
     (DIA: `500 GR` → `500 g`).
  2. Si no, y `productos_unidad_medida_referencia` es de peso o volumen → `cantidad_referencia × factor`
     (Carrefour: presentación `1 UNI`, referencia `40 GRM` → `40 g`).
  3. Si no, y ambas son unidades → `cantidad_presentacion` en `u` (huevos `6 EA` → `6 u`).
  4. Si no → la fila no propone presentación. Cantidad `0` o no numérica → tampoco.
- `sepa_productos.banderas`: cantidad de banderas con precio para ese EAN.

**Carga (una transacción):**

1. Si ya hay una carga `ok` con la misma `fecha_archivo`, terminar sin hacer nada (salvo `--force`).
2. **Freno de seguridad:** si las filas de precios a cargar son menos del 50 % de la última carga `ok`, abortar
   con estado `error` sin tocar las tablas.
3. Cargar en tablas temporales (`create temp table … on commit drop`) con `INSERT` multi-fila en lotes de 1000.
4. `upsert` de `sepa_banderas` y `sepa_productos` (`on conflict … do update`).
5. Para cada bandera cargada: `upsert` de sus precios y `delete` de sus precios con `actualizado` anterior a la
   fecha del archivo (productos que dejó de informar).
6. Las banderas **no** cargadas hoy (ZIP roto, comercio desactualizado) conservan sus precios anteriores; se
   borran recién cuando su `actualizado` tiene más de 14 días.
7. Borrar `sepa_productos` sin ningún precio.
8. Registrar la ejecución en `sepa_cargas` (también cuando falla o se omite).

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
  "sepa:etl": "node --env-file-if-exists=.env.local scripts/sepa/etl.ts"
}
```

Uso: `npm run sepa:etl` · `npm run sepa:etl -- --file ruta/sepa_viernes.zip` · `npm run sepa:etl -- --dry-run` ·
`npm run sepa:etl -- --force`.

## Plan de implementación

1. **Dependencias y configuración.** `npm i -D fflate pg @types/pg supabase`. En `tsconfig.json`:
   `"allowImportingTsExtensions": true` (los scripts importan con extensión `.ts` porque Node los ejecuta sin
   compilar). En `vitest.config.mts`: sumar `scripts/**/*.test.ts` a `include`. Crear `.env.example`.
   Verificar: `npm run lint`, `npm test` y `npm run build` siguen pasando.
2. **`src/lib/gtin.ts` + tests.** `isValidGtin(code)` (8, 12, 13 o 14 dígitos, dígito verificador GS1) y
   `toGtin13(code)` (EAN-8 y UPC-A se completan con ceros a la izquierda; un GTIN-14 que empieza con `0` pierde
   ese cero; cualquier otro caso → `null`). Verificar: tests con `7793704000911`, `77956262`, `012345678905`.
3. **Limpieza + tests** (`scripts/sepa/clean.ts`). Verificar: tests con líneas reales del archivo del 30/10
   (copiadas en el test), cada unidad de la tabla, pies con y sin tilde, precios `04210.00`, `0`, `""`.
4. **Agregación + tests** (`scripts/sepa/aggregate.ts`). Verificar: test con un comercio de juguete con 2 banderas,
   3 sucursales, un EAN con descripciones distintas y uno con presentación Carrefour (`1 UNI` / `40 GRM`).
5. **Lectura del ZIP** (`scripts/sepa/read-zip.ts`): ZIP externo y ZIP internos con `fflate` en streaming,
   líneas con `TextDecoderStream`, sin cargar ningún CSV entero en memoria (el de DIA pasa los 500 MB y supera el
   largo máximo de un string). Verificar: test con un ZIP anidado armado en el test con `zipSync`, incluido un
   ZIP interno vacío.
6. **`--dry-run` sobre el archivo real.** Usar primero el archivo de referencia del 30/10/2026 con el que se
   relevaron los números de esta spec, guardado fuera del repo en `D:\apps\archivos-sepa\sepa_viernes.zip`
   (`npm run sepa:etl -- --dry-run --file D:\apps\archivos-sepa\sepa_viernes.zip`). Verificar: algo menos de
   243.734 precios (EAN × bandera): ese es el conteo bruto del relevamiento, con Unicoop y con las filas sin EAN
   real todavía incluidas. Además, ~75 mil productos,
   Unicoop (`comercio-sepa-47`) y el ZIP vacío (`comercio-sepa-36`) en `omitidos`, y presentación en al menos el
   90 % de los productos. Después repetir con el ZIP del día. Anotar los números reales en esta spec.
7. **Migración.** `npx supabase login` → `npx supabase link --project-ref <ref>` → `npx supabase db push`.
   Verificar: las 4 tablas en el dashboard, con RLS activo.
8. **Carga.** `scripts/sepa/load.ts` con `pg` y la transacción de *Reglas*. Verificar: primera carga completa;
   segunda ejecución con el mismo archivo termina como "omitida"; con `--force` vuelve a cargar sin duplicar.
9. **Tamaño.** `select pg_size_pretty(pg_database_size('postgres'))` y el tamaño de cada tabla. Verificar: la base
   entera ocupa menos de 150 MB. Anotar los valores (los necesita la decisión de historial).
10. **Documentación.** `CLAUDE.md`: árbol con `supabase/` y `scripts/sepa/`, script `sepa:etl`, variables de
    entorno, sección de la base SEPA. Feature 06 → *En curso*.

## Criterios de aceptación

- [ ] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings; el build no necesita ninguna variable de entorno.
- [ ] `npm run sepa:etl -- --dry-run` termina sin conexión a la base e imprime: fecha del archivo, banderas cargadas, omitidos con motivo, filas leídas y filas de precios.
- [ ] Ningún CSV se carga entero en memoria; el proceso termina con menos de 2 GB de RAM.
- [ ] Después de una carga, `select count(*) from sepa_precios` coincide con lo informado por el script.
- [ ] Un EAN con presentación al estilo Carrefour (`1 UNI` / referencia `40 GRM`) queda con `cantidad = 40`, `unidad = 'g'`.
- [ ] Ningún `ean` de `sepa_productos` falla `isValidGtin`.
- [ ] Con la clave publishable/anon (`curl …/rest/v1/sepa_precios?limit=1`) se leen precios; `sepa_cargas` devuelve vacío o error; cualquier `insert` es rechazado.
- [ ] Repetir la carga del mismo archivo no cambia la cantidad de filas.
- [ ] Si se simula un archivo con la mitad de los precios, la carga aborta, deja estado `error` y las tablas quedan como estaban.
- [ ] Una bandera ausente en el archivo del día conserva sus precios con su `actualizado` anterior.
- [ ] La app funciona igual que antes (no se tocó la UI).

## Decisiones

- **Sí:** agregar por EAN × bandera a nivel nacional. 244 mil filas en lugar de 14 millones; por provincia serían 2 millones.
- **Sí:** mediana además de mínimo y máximo. La misma cadena tiene precios distintos por sucursal y la mediana no se deja llevar por una sucursal con un error de carga.
- **Sí:** solo precio de lista. Las promos traen leyendas en texto libre (`2x1`, `70 % 2da`) que piden su propio análisis.
- **Sí:** guardar el EAN en GTIN-13 (13 dígitos). Así viene en el SEPA, y la app normaliza a lo mismo lo que lee el escáner (spec 11).
- **Sí:** Node con TypeScript sin compilar (Node 24) en lugar de Python. Un solo lenguaje en el repo, los tests en Vitest y `gtin.ts` compartido con la app.
- **Sí:** `fflate` para los ZIP. Lee en streaming, no tiene dependencias y sirve también para armar los ZIP de prueba.
- **Sí:** `pg` contra el Session pooler en lugar de la API REST. Permite una transacción única (no queda la base a medio cargar) y la API REST con la clave secreta no aporta nada para un proceso batch.
- **Sí:** migraciones con la CLI de Supabase en `supabase/migrations/`. Quedan versionadas y la Fase 2 sigue el mismo camino.
- **Sí:** lectura pública con RLS y sin login. Son datos abiertos (CC-BY-4.0); escribir solo puede la conexión del ETL.
- **No (por ahora):** historial. Una foto semanal del agregado (~244 mil filas) llenaría el plan gratuito en meses. Se decide en otra spec con el tamaño medido en el paso 9.
- **No:** usar la API del portal preciosclaros.gob.ar. No es oficial y el 31/10/2026 fallaba en todas las llamadas.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Cambia el formato del ZIP o de los CSV | El parser valida encabezados; si faltan columnas, aborta con `error` sin tocar las tablas |
| Un día viene incompleto | Freno del 50 %; las banderas faltantes conservan sus precios hasta 14 días |
| Precios absurdos por errores de carga de las cadenas | La mediana los amortigua; el mínimo y el máximo se muestran como rango, no como referencia |
| Presentaciones mal informadas | Gana la más frecuente entre todas las filas del EAN; si ninguna sirve, queda `null` |
| Se filtra `SUPABASE_DB_URL` | Solo en `.env.local` (ignorado) y en secrets de GitHub; nunca con prefijo `NEXT_PUBLIC_` |
| Límite de 500 MB del plan gratuito | Medición obligatoria en el paso 9 |

## Lo que **no** incluye esta spec

- Ejecución automática (spec 09).
- Historial de precios SEPA.
- Precios por sucursal o provincia.
- Promociones.
- Cambios en la app (specs 10–12).
