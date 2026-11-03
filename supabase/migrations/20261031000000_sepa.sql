-- Base de precios SEPA (spec 08): banderas, productos con EAN, precios por EAN × bandera y registro de cargas

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
