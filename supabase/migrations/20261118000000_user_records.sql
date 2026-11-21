-- Datos de cada usuario: productos, precios, carrito, compras y calculadora, sincronizados desde la app (spec 21)

-- Un registro de la app por fila, con su JSON tal cual lo guarda localStorage. Los borrados se marcan (deleted) para
-- que lleguen a los otros dispositivos; borrar la cuenta borra todas sus filas (on delete cascade)
create table public.user_records (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  collection  text        not null check (collection in ('products', 'prices', 'cart', 'purchases', 'settings')),
  id          text        not null,
  data        jsonb,                                -- null si está borrado
  deleted     boolean     not null default false,
  modified_at timestamptz not null,                 -- reloj del dispositivo: decide quién gana (último cambio)
  synced_at   timestamptz not null default now(),   -- reloj del servidor: cursor para bajar cambios
  primary key (user_id, collection, id),
  check (deleted or data is not null)
);

create index user_records_user_synced on public.user_records (user_id, synced_at);

-- Permisos explícitos: anon no ve nada; authenticated, solo sus filas (RLS). Sin delete: los borrados se marcan
revoke all on public.user_records from anon, authenticated;
grant select, insert, update on public.user_records to authenticated;

alter table public.user_records enable row level security;

create policy "propias: leer" on public.user_records for select to authenticated
  using (user_id = (select auth.uid()));
create policy "propias: crear" on public.user_records for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "propias: modificar" on public.user_records for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- synced_at lo pone el servidor; un cambio más viejo que el guardado (llegó tarde de otro dispositivo) no lo pisa
create function public.user_records_touch() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.modified_at < old.modified_at then
    return old;
  end if;
  new.synced_at := now();
  return new;
end;
$$;

create trigger user_records_touch
  before insert or update on public.user_records
  for each row execute function public.user_records_touch();

-- Borrar mi cuenta: borra el usuario de auth.users y, en cascada, todas sus filas
create function public.delete_my_account() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sin sesión';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
