-- Grupos (spec 22), revisión de seguridad:
--  1. Sacar a alguien cambia el link: con el anterior podía volver a entrar
--  2. group_prices ignora montos fuera de rango (uno enorme hacía fallar la consulta de todo el grupo), fechas en el
--     futuro (quedarían siempre como el último precio) y toma como mucho 20 EAN aunque llegue un arreglo de 2 dimensiones
--  3. Las salidas simultáneas se ordenan con el bloqueo del grupo: si no, dos salidas a la vez podían dejar un grupo
--     vacío o sin administrador. join_group bloquea los dos grupos en orden para no trabarse con otra unión

-- ── Trigger: con el grupo bloqueado ──────────────────────────
-- Cada consulta de abajo ve lo que confirmó la transacción que tenía el bloqueo (read committed)
create or replace function public.group_members_after_delete() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform 1 from public.groups where id = old.group_id for update;
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

-- ── Unirse: los dos grupos bloqueados en orden de id ─────────
create or replace function public.join_group(p_code text, p_nickname text, p_leave boolean default false) returns uuid
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
  select id into v_group from public.groups where invite_code = p_code;
  if v_group is null then
    raise exception 'invalid_code';
  end if;
  select group_id into v_current from public.group_members where user_id = auth.uid();
  if v_current = v_group then
    return v_group;
  end if;
  if v_current is not null and not p_leave then
    raise exception 'already_in_group';
  end if;
  -- El bloqueo ordena las uniones simultáneas (límite de 20) y las salidas del grupo actual
  perform 1 from public.groups where id in (v_group, v_current) order by id for update;
  -- Con el bloqueo, el código pudo haber cambiado o el grupo pudo haberse borrado
  if not exists (select 1 from public.groups where id = v_group and invite_code = p_code) then
    raise exception 'invalid_code';
  end if;
  if v_current is not null then
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

-- ── Sacar: también cambia el link ────────────────────────────
create or replace function public.remove_member(p_user_id uuid) returns void
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
  perform 1 from public.groups where id = v_group for update;
  delete from public.group_members where group_id = v_group and user_id = p_user_id;
  if found then
    update public.groups set invite_code = public.group_new_invite_code() where id = v_group;
  end if;
end;
$$;

-- ── Precios: montos y fechas con sentido, hasta 20 EAN ───────
create or replace function public.group_prices(p_eans text[])
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
  ),
  wanted as (
    select array_agg(e) as eans from (select e from unnest(p_eans) as e limit 20) as first20
  )
  select prod.data->>'ean', (pr.data->>'amount')::double precision, pr.data->>'date', pr.data->>'store',
         pr.data->>'barrio', pr.data->'storeRef', mates.nickname, mates.user_id
  from mates
  cross join wanted
  join public.user_records prod
    on prod.user_id = mates.user_id and prod.collection = 'products' and not prod.deleted
   and prod.data->>'ean' = any (wanted.eans)
  join public.user_records pr
    on pr.user_id = mates.user_id and pr.collection = 'prices' and not pr.deleted
   and pr.data->>'productId' = prod.id
  -- El case asegura que el cast a numeric solo corre sobre un número de JSON (nunca falla)
  where case when jsonb_typeof(pr.data->'amount') = 'number'
             then (pr.data->>'amount')::numeric between 0.01 and 1000000000
             else false end
    and pr.data->>'date' > to_char((now() - interval '60 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
    and pr.data->>'date' < to_char((now() + interval '1 day') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
$$;
