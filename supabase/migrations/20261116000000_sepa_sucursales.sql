-- Sucursales del SEPA y precio de cada producto en cada sucursal (spec 13)

-- Una fila por sucursal; pos es su posición en los arreglos de sepa_precios_sucursal
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

-- Una fila por EAN × bandera: los precios distintos y, por cada sucursal de la bandera, cuál de ellos tiene
create table public.sepa_precios_sucursal (
  ean           text not null,
  bandera       text not null,
  precios       numeric(12,2)[] not null,  -- precios de lista distintos, de menor a mayor
  indices       smallint[] not null,       -- un elemento por sucursal de la bandera, en el orden de pos:
                                           --   posición (desde 1) en precios; 0 = la sucursal no informa el producto
  primary key (ean, bandera),
  foreign key (ean, bandera) references public.sepa_precios on delete cascade
);

-- Permisos explícitos, como las tablas de la spec 08
revoke all on public.sepa_sucursales, public.sepa_precios_sucursal from anon, authenticated;
grant select on public.sepa_sucursales, public.sepa_precios_sucursal to anon, authenticated;

alter table public.sepa_sucursales       enable row level security;
alter table public.sepa_precios_sucursal enable row level security;

create policy "lectura pública" on public.sepa_sucursales       for select to anon, authenticated using (true);
create policy "lectura pública" on public.sepa_precios_sucursal for select to anon, authenticated using (true);

-- Precio de cada producto en cada sucursal pedida. Sin fila si la sucursal no lo informa.
-- Hasta 20 EAN y 40 sucursales por llamada: lo que se pase de más se ignora.
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
revoke execute on function public.sepa_precios_en_sucursales(text[], text[]) from public;
grant execute on function public.sepa_precios_en_sucursales(text[], text[]) to anon, authenticated;
