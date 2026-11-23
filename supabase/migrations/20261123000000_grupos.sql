-- Grupos y precios compartidos (spec 22): un grupo a la vez por usuario, hasta 20 integrantes, y los precios de
-- productos con código de barras de los demás integrantes leídos a pedido de user_records (sin copias)

create table public.groups (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null check (char_length(name) between 1 and 40),
  invite_code text        not null unique,
  created_at  timestamptz not null default now()
);

create table public.group_members (
  group_id     uuid        not null references public.groups (id) on delete cascade,
  user_id      uuid        not null unique references auth.users (id) on delete cascade,  -- un grupo a la vez
  nickname     text        not null check (char_length(nickname) between 1 and 30),
  role         text        not null check (role in ('admin', 'member')),
  share_prices boolean     not null default true,
  joined_at    timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Sin permisos directos: todo pasa por las funciones de abajo (security definer), que validan con auth.uid().
-- Así las reglas quedan en un solo lugar y nunca se expone el mail ni otras colecciones de user_records
revoke all on public.groups, public.group_members from anon, authenticated;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

-- Para group_prices: productos por EAN y precios por producto de cada integrante
create index user_records_products_ean on public.user_records (user_id, (data->>'ean'))
  where collection = 'products' and not deleted;
create index user_records_prices_product on public.user_records (user_id, (data->>'productId'))
  where collection = 'prices' and not deleted;

-- ── Ayudas internas ──────────────────────────────────────────

-- Código de invitación: 12 caracteres url-safe (9 bytes al azar en base64)
create function public.group_new_invite_code() returns text
  language sql
  volatile
  set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_')
$$;

create function public.group_valid_text(p_text text, p_max int) returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select coalesce(char_length(btrim(p_text)), 0) between 1 and p_max
$$;

-- Grupo del que llama y su rol; levanta not_in_group (o not_admin si se pide administrador)
create function public.group_current(p_admin boolean) returns uuid
  language plpgsql
  stable
  set search_path = ''
as $$
declare
  v_group uuid;
  v_role text;
begin
  select group_id, role into v_group, v_role from public.group_members where user_id = auth.uid();
  if v_group is null then
    raise exception 'not_in_group';
  end if;
  if p_admin and v_role <> 'admin' then
    raise exception 'not_admin';
  end if;
  return v_group;
end;
$$;

revoke execute on function public.group_new_invite_code(), public.group_valid_text(text, int),
  public.group_current(boolean) from public, anon, authenticated;

-- ── Administrador al salir ───────────────────────────────────

-- Al salir (o al borrar la cuenta) quien administra, el rol pasa al integrante más antiguo; sin nadie, se borra el grupo
create function public.group_members_after_delete() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not exists (select 1 from public.group_members where group_id = old.group_id) then
    delete from public.groups where id = old.group_id;
  elsif not exists (select 1 from public.group_members where group_id = old.group_id and role = 'admin') then
    update public.group_members set role = 'admin'
    where group_id = old.group_id
      and user_id = (select user_id from public.group_members where group_id = old.group_id
                     order by joined_at, user_id limit 1);
  end if;
  return null;
end;
$$;

create trigger group_members_after_delete
  after delete on public.group_members
  for each row execute function public.group_members_after_delete();

-- ── Funciones de la app ──────────────────────────────────────

create function public.create_group(p_name text, p_nickname text) returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_group uuid;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión';
  end if;
  if not public.group_valid_text(p_name, 40) or not public.group_valid_text(p_nickname, 30) then
    raise exception 'invalid_name';
  end if;
  if exists (select 1 from public.group_members where user_id = auth.uid()) then
    raise exception 'already_in_group';
  end if;
  insert into public.groups (name, invite_code) values (btrim(p_name), public.group_new_invite_code())
    returning id into v_group;
  insert into public.group_members (group_id, user_id, nickname, role)
    values (v_group, auth.uid(), btrim(p_nickname), 'admin');
  return v_group;
exception
  when unique_violation then
    raise exception 'already_in_group';
end;
$$;

-- Nombre y cantidad de integrantes de una invitación; también sin sesión (no expone nada más)
create function public.group_preview(p_code text) returns table (name text, members int)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select g.name, (select count(*)::int from public.group_members m where m.group_id = g.id)
  from public.groups g
  where g.invite_code = p_code
$$;

-- Unirse con el link. Con p_leave, sale antes del grupo actual en la misma transacción: si el nuevo está completo
-- o el código no sirve, no sale de ninguno
create function public.join_group(p_code text, p_nickname text, p_leave boolean default false) returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_group uuid;
  v_current uuid;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión';
  end if;
  if not public.group_valid_text(p_nickname, 30) then
    raise exception 'invalid_name';
  end if;
  -- El bloqueo del grupo ordena las uniones simultáneas para respetar el límite
  select id into v_group from public.groups where invite_code = p_code for update;
  if v_group is null then
    raise exception 'invalid_code';
  end if;
  select group_id into v_current from public.group_members where user_id = auth.uid();
  if v_current = v_group then
    return v_group;
  end if;
  if v_current is not null then
    if not p_leave then
      raise exception 'already_in_group';
    end if;
    delete from public.group_members where user_id = auth.uid();
  end if;
  if (select count(*) from public.group_members where group_id = v_group) >= 20 then
    raise exception 'group_full';
  end if;
  insert into public.group_members (group_id, user_id, nickname, role)
    values (v_group, auth.uid(), btrim(p_nickname), 'member');
  return v_group;
exception
  when unique_violation then
    raise exception 'already_in_group';
end;
$$;

-- El grupo del que llama con sus integrantes (sin mails), o null
create function public.my_group() returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'inviteCode', g.invite_code,
    'role', me.role,
    'sharePrices', me.share_prices,
    'nickname', me.nickname,
    'members', (
      select jsonb_agg(jsonb_build_object('userId', m.user_id, 'nickname', m.nickname, 'role', m.role,
                                          'joinedAt', m.joined_at) order by m.joined_at, m.user_id)
      from public.group_members m
      where m.group_id = g.id
    )
  )
  from public.group_members me
  join public.groups g on g.id = me.group_id
  where me.user_id = auth.uid()
$$;

create function public.rename_group(p_name text) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_group uuid := public.group_current(true);
begin
  if not public.group_valid_text(p_name, 40) then
    raise exception 'invalid_name';
  end if;
  update public.groups set name = btrim(p_name) where id = v_group;
end;
$$;

create function public.regenerate_invite() returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_group uuid := public.group_current(true);
  v_code text;
begin
  update public.groups set invite_code = public.group_new_invite_code()
    where id = v_group
    returning invite_code into v_code;
  return v_code;
end;
$$;

create function public.remove_member(p_user_id uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_group uuid := public.group_current(true);
begin
  if p_user_id = auth.uid() then
    raise exception 'invalid_member';
  end if;
  delete from public.group_members where group_id = v_group and user_id = p_user_id;
end;
$$;

create function public.set_nickname(p_nickname text) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform public.group_current(false);
  if not public.group_valid_text(p_nickname, 30) then
    raise exception 'invalid_name';
  end if;
  update public.group_members set nickname = btrim(p_nickname) where user_id = auth.uid();
end;
$$;

create function public.set_share_prices(p_share boolean) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform public.group_current(false);
  update public.group_members set share_prices = coalesce(p_share, true) where user_id = auth.uid();
end;
$$;

create function public.leave_group() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  delete from public.group_members where user_id = auth.uid();
end;
$$;

-- Precios de los otros integrantes con share_prices para hasta 20 EAN, de los últimos 60 días: el precio (fila de
-- prices no borrada) de un producto del mismo integrante con ese EAN. Las fechas son ISO en UTC (toISOString), así
-- que se comparan como texto sin convertir (un valor raro no rompe la consulta)
create function public.group_prices(p_eans text[])
  returns table (ean text, amount double precision, date text, store text, barrio text, store_ref jsonb,
                 member text, member_id uuid)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with mates as (
    select m.user_id, m.nickname
    from public.group_members me
    join public.group_members m on m.group_id = me.group_id
    where me.user_id = auth.uid() and m.user_id <> me.user_id and m.share_prices
  )
  select prod.data->>'ean', (pr.data->>'amount')::double precision, pr.data->>'date', pr.data->>'store',
         pr.data->>'barrio', pr.data->'storeRef', mates.nickname, mates.user_id
  from mates
  join public.user_records prod
    on prod.user_id = mates.user_id and prod.collection = 'products' and not prod.deleted
   and prod.data->>'ean' = any (p_eans[1:20])
  join public.user_records pr
    on pr.user_id = mates.user_id and pr.collection = 'prices' and not pr.deleted
   and pr.data->>'productId' = prod.id
  where jsonb_typeof(pr.data->'amount') = 'number'
    and pr.data->>'date' > to_char((now() - interval '60 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
$$;

revoke execute on function
  public.create_group(text, text), public.group_preview(text), public.join_group(text, text, boolean),
  public.my_group(), public.rename_group(text), public.regenerate_invite(), public.remove_member(uuid),
  public.set_nickname(text), public.set_share_prices(boolean), public.leave_group(), public.group_prices(text[])
  from public, anon;
grant execute on function
  public.create_group(text, text), public.join_group(text, text, boolean), public.my_group(),
  public.rename_group(text), public.regenerate_invite(), public.remove_member(uuid), public.set_nickname(text),
  public.set_share_prices(boolean), public.leave_group(), public.group_prices(text[])
  to authenticated;
grant execute on function public.group_preview(text) to anon, authenticated;
