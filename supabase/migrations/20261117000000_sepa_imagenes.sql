-- Imagen de cada producto del SEPA, buscada por EAN en Open Food Facts y en el portal Precios Claros (spec 17)

-- Una fila por EAN revisado. Sin clave foránea a sepa_productos: un producto puede faltar del catálogo unos días
-- y la imagen no tiene que perderse por eso
create table public.sepa_imagenes (
  ean        text primary key check (ean ~ '^[0-9]{13}$'),
  url        text,                    -- null = se buscó y no hay
  fuente     text check (fuente in ('off', 'preciosclaros')),
  revisado   date not null            -- no se vuelve a revisar hasta pasados 90 días
);

-- Permisos explícitos, como las demás tablas sepa_*
revoke all on public.sepa_imagenes from anon, authenticated;
grant select on public.sepa_imagenes to anon, authenticated;

alter table public.sepa_imagenes enable row level security;

create policy "lectura pública" on public.sepa_imagenes for select to anon, authenticated using (true);
