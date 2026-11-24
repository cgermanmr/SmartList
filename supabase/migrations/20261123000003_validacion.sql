-- Validación de precios del grupo (spec 23): los integrantes dicen "Está bien" (ok) o "No coincide" (no) a los
-- precios de los demás. Cada voto guarda el monto del precio cuando se votó, tomado de user_records: si el autor lo
-- cambia, el voto deja de contar. El estado (Validado, Dudoso) lo calcula la app con los votos que devuelven estas
-- funciones

create table public.price_votes (
  group_id   uuid             not null,
  owner_id   uuid             not null,   -- autor del precio
  price_id   text             not null,   -- id del precio en user_records (collection = 'prices')
  voter_id   uuid             not null,
  verdict    text             not null check (verdict in ('ok', 'no')),
  amount     double precision not null,   -- monto votado, tomado de user_records
  seen       double precision check (seen > 0 and seen < 1e9),  -- "¿Cuánto viste?"
  created_at timestamptz      not null default now(),
  primary key (owner_id, price_id, voter_id),
  check (voter_id <> owner_id),
  check (seen is null or verdict = 'no'),
  -- Salir, ser sacado o borrar la cuenta borra los votos propios y los votos sobre los precios propios
  foreign key (group_id, owner_id) references public.group_members (group_id, user_id) on delete cascade,
  foreign key (group_id, voter_id) references public.group_members (group_id, user_id) on delete cascade
);
create index price_votes_voter on public.price_votes (group_id, voter_id);

-- Sin permisos directos, como groups y group_members: todo pasa por las funciones de abajo
revoke all on public.price_votes from anon, authenticated;
alter table public.price_votes enable row level security;

-- ── Ayudas internas ──────────────────────────────────────────

-- Un precio que el grupo puede ver: monto en rango (el case asegura que el cast solo corre sobre un número de JSON) y
-- fecha ISO de los últimos p_days días, no en el futuro (como group_prices de la spec 22)
create function public.group_price_visible(p_data jsonb, p_days int) returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select case when jsonb_typeof(p_data->'amount') = 'number'
              then (p_data->>'amount')::numeric between 0.01 and 1000000000
              else false end
     and p_data->>'date' > to_char((now() - make_interval(days => p_days)) at time zone 'UTC',
                                   'YYYY-MM-DD"T"HH24:MI:SS')
     and p_data->>'date' < to_char((now() + interval '1 day') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
$$;

-- Con comercio: storeRef con nombre o, en un precio de antes de la spec 26, store
create function public.group_price_has_store(p_data jsonb) returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select coalesce(btrim(p_data->'storeRef'->>'name'), '') <> '' or coalesce(btrim(p_data->>'store'), '') <> ''
$$;

-- Los votos de un precio con el apodo actual de quien votó, en orden de voto (todos son de integrantes actuales:
-- las claves foráneas borran los de quien ya no está). Nunca el mail
create function public.price_votes_json(p_owner uuid, p_price_id text) returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('voterId', v.voter_id, 'member', m.nickname, 'verdict', v.verdict,
                                               'amount', v.amount, 'seen', v.seen, 'at', v.created_at)
                            order by v.created_at, v.voter_id), '[]'::jsonb)
  from public.price_votes v
  join public.group_members m on m.group_id = v.group_id and m.user_id = v.voter_id
  where v.owner_id = p_owner and v.price_id = p_price_id
$$;

revoke execute on function public.group_price_visible(jsonb, int), public.group_price_has_store(jsonb),
  public.price_votes_json(uuid, text) from public, anon, authenticated;

-- ── Votar ────────────────────────────────────────────────────

-- El autor tiene que ser otro integrante del mismo grupo con share_prices, y el precio uno que el grupo ve: no
-- borrado, de un producto suyo con EAN, con comercio y de los últimos 60 días. Si no, price_not_found (no dice cuál
-- de las condiciones falló). El monto se toma de user_records: la app no lo manda
create function public.vote_price(p_owner uuid, p_price_id text, p_verdict text, p_seen double precision default null)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_group uuid := public.group_current(false);
  v_amount double precision;
begin
  if p_owner = auth.uid() then
    raise exception 'own_price';
  end if;
  if p_verdict is null or p_verdict not in ('ok', 'no') then
    raise exception 'invalid_verdict';
  end if;
  if p_seen is not null and (p_verdict <> 'no' or not (p_seen >= 0.01 and p_seen < 1000000000)) then
    raise exception 'invalid_amount';
  end if;

  select (pr.data->>'amount')::double precision into v_amount
  from public.group_members owner
  join public.user_records pr
    on pr.user_id = owner.user_id and pr.collection = 'prices' and pr.id = p_price_id and not pr.deleted
  join public.user_records prod
    on prod.user_id = owner.user_id and prod.collection = 'products' and not prod.deleted
   and prod.id = pr.data->>'productId'
  where owner.group_id = v_group and owner.user_id = p_owner and owner.share_prices
    and coalesce(prod.data->>'ean', '') <> ''
    and public.group_price_has_store(pr.data)
    and public.group_price_visible(pr.data, 60);
  if v_amount is null then
    raise exception 'price_not_found';
  end if;

  insert into public.price_votes (group_id, owner_id, price_id, voter_id, verdict, amount, seen)
    values (v_group, p_owner, p_price_id, auth.uid(), p_verdict, v_amount, p_seen)
  on conflict (owner_id, price_id, voter_id) do update
    set group_id = excluded.group_id, verdict = excluded.verdict, amount = excluded.amount, seen = excluded.seen,
        created_at = now();
end;
$$;

create function public.unvote_price(p_owner uuid, p_price_id text) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  delete from public.price_votes where owner_id = p_owner and price_id = p_price_id and voter_id = auth.uid();
end;
$$;

-- ── Precios del grupo con sus votos ──────────────────────────
-- Igual que en la spec 22 (con el endurecimiento de 20261123000002), con tres columnas más al final: la app de la
-- spec 22 lee por nombre y las ignora. Cambia el tipo de retorno: drop y create, con los mismos permisos
drop function public.group_prices(text[]);

create function public.group_prices(p_eans text[])
  returns table (ean text, amount double precision, date text, store text, barrio text, store_ref jsonb,
                 member text, member_id uuid, price_id text, product_name text, votes jsonb)
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
         pr.data->>'barrio', pr.data->'storeRef', mates.nickname, mates.user_id, pr.id, prod.data->>'name',
         public.price_votes_json(mates.user_id, pr.id)
  from mates
  cross join wanted
  join public.user_records prod
    on prod.user_id = mates.user_id and prod.collection = 'products' and not prod.deleted
   and prod.data->>'ean' = any (wanted.eans)
  join public.user_records pr
    on pr.user_id = mates.user_id and pr.collection = 'prices' and not pr.deleted
   and pr.data->>'productId' = prod.id
  where public.group_price_visible(pr.data, 60)
$$;

-- ── Por validar ──────────────────────────────────────────────
-- Los precios de los demás integrantes con share_prices, de productos con EAN y con comercio, de los últimos 14
-- días, con sus votos y los datos del producto. Hasta 200, del más nuevo al más viejo. El filtro de lo ya votado y
-- lo validado lo hace la app, con la misma regla que el resto de las pantallas
create function public.pending_validations()
  returns table (ean text, amount double precision, date text, store text, barrio text, store_ref jsonb,
                 member text, member_id uuid, price_id text, product_name text, votes jsonb,
                 brand text, size double precision, size_unit text)
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
  recent as (
    select mates.user_id, mates.nickname, prod.data as product, pr.id, pr.data
    from mates
    join public.user_records pr
      on pr.user_id = mates.user_id and pr.collection = 'prices' and not pr.deleted
    join public.user_records prod
      on prod.user_id = mates.user_id and prod.collection = 'products' and not prod.deleted
     and prod.id = pr.data->>'productId'
    where coalesce(prod.data->>'ean', '') <> ''
      and public.group_price_has_store(pr.data)
      and public.group_price_visible(pr.data, 14)
    order by pr.data->>'date' desc, pr.id
    limit 200
  )
  select r.product->>'ean', (r.data->>'amount')::double precision, r.data->>'date', r.data->>'store',
         r.data->>'barrio', r.data->'storeRef', r.nickname, r.user_id, r.id, r.product->>'name',
         public.price_votes_json(r.user_id, r.id),
         r.product->>'brand',
         case when jsonb_typeof(r.product->'size') = 'number' then (r.product->>'size')::double precision end,
         r.product->>'sizeUnit'
  from recent r
  order by r.data->>'date' desc, r.id
$$;

-- ── El autor: votos sobre sus precios ────────────────────────
-- Hasta 100 id de precios propios; los votos de los integrantes actuales con su apodo (nunca el mail)
create function public.my_price_votes(p_price_ids text[])
  returns table (price_id text, voter_id uuid, member text, verdict text, amount double precision,
                 seen double precision, at timestamptz)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with wanted as (
    select array_agg(i) as ids from (select i from unnest(p_price_ids) as i limit 100) as first100
  )
  select v.price_id, v.voter_id, m.nickname, v.verdict, v.amount, v.seen, v.created_at
  from wanted
  join public.price_votes v on v.owner_id = auth.uid() and v.price_id = any (wanted.ids)
  join public.group_members m on m.group_id = v.group_id and m.user_id = v.voter_id
  order by v.price_id, v.created_at, v.voter_id
$$;

revoke execute on function
  public.vote_price(uuid, text, text, double precision), public.unvote_price(uuid, text),
  public.group_prices(text[]), public.pending_validations(), public.my_price_votes(text[])
  from public, anon;
grant execute on function
  public.vote_price(uuid, text, text, double precision), public.unvote_price(uuid, text),
  public.group_prices(text[]), public.pending_validations(), public.my_price_votes(text[])
  to authenticated;
