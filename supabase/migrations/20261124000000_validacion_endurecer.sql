-- Validación (spec 23), revisión de seguridad:
--  1. pending_validations ignora un size fuera de rango: uno enorme hacía fallar la consulta de todo el grupo
--  2. Cada voto guarda la huella del precio votado (EAN, monto, fecha y comercio): si el autor cambia cualquiera de
--     esos datos (por ejemplo, con "Cambiar vínculo"), el voto deja de contar
--  3. vote_price recibe la huella del precio que vio quien vota: si el autor lo cambió mientras tanto, price_changed
--
-- Cambian los argumentos de vote_price y las columnas de group_prices y pending_validations: drop y create, con los
-- mismos permisos. fingerprint va al final: la app anterior lee por nombre y la ignora (pero no puede votar)

-- Los votos de antes quedan con la huella vacía, que no coincide con ninguna: dejan de contar
alter table public.price_votes add column fingerprint text not null default '';
alter table public.price_votes alter column fingerprint drop default;

-- ── Ayudas internas ──────────────────────────────────────────

-- Huella de lo que se vota. El monto va en centavos (3200 y 3200.0 son el mismo); el jsonb como texto tiene siempre el
-- mismo orden de claves. El case asegura que el cast solo corre sobre un número de JSON
create function public.group_price_fingerprint(p_ean text, p_data jsonb) returns text
  language sql
  stable
  set search_path = ''
as $$
  select md5(jsonb_build_array(
    p_ean,
    case when jsonb_typeof(p_data->'amount') = 'number' then round((p_data->>'amount')::numeric, 2)::text end,
    p_data->>'date',
    p_data->>'store',
    p_data->>'barrio',
    p_data->'storeRef'
  )::text)
$$;

-- Los votos sobre esa huella, con el apodo actual de quien votó, en orden de voto. Nunca el mail
create function public.price_votes_json(p_owner uuid, p_price_id text, p_fingerprint text) returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('voterId', v.voter_id, 'member', m.nickname, 'verdict', v.verdict,
                                               'amount', v.amount, 'seen', v.seen, 'at', v.created_at)
                            order by v.created_at, v.voter_id), '[]'::jsonb)
  from public.price_votes v
  join public.group_members m on m.group_id = v.group_id and m.user_id = v.voter_id
  where v.owner_id = p_owner and v.price_id = p_price_id and v.fingerprint = p_fingerprint
$$;

revoke execute on function public.group_price_fingerprint(text, jsonb), public.price_votes_json(uuid, text, text)
  from public, anon, authenticated;

-- ── Votar ────────────────────────────────────────────────────

drop function public.vote_price(uuid, text, text, double precision);

-- Igual que antes, con la huella del precio que vio quien vota (la de group_prices o pending_validations)
create function public.vote_price(p_owner uuid, p_price_id text, p_fingerprint text, p_verdict text,
                                  p_seen double precision default null)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_group uuid := public.group_current(false);
  v_amount double precision;
  v_fingerprint text;
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

  select (pr.data->>'amount')::double precision, public.group_price_fingerprint(prod.data->>'ean', pr.data)
    into v_amount, v_fingerprint
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
  if p_fingerprint is distinct from v_fingerprint then
    raise exception 'price_changed';
  end if;

  insert into public.price_votes (group_id, owner_id, price_id, voter_id, verdict, amount, seen, fingerprint)
    values (v_group, p_owner, p_price_id, auth.uid(), p_verdict, v_amount, p_seen, v_fingerprint)
  on conflict (owner_id, price_id, voter_id) do update
    set group_id = excluded.group_id, verdict = excluded.verdict, amount = excluded.amount, seen = excluded.seen,
        fingerprint = excluded.fingerprint, created_at = now();
end;
$$;

-- ── Precios del grupo con sus votos ──────────────────────────

drop function public.group_prices(text[]);

create function public.group_prices(p_eans text[])
  returns table (ean text, amount double precision, date text, store text, barrio text, store_ref jsonb,
                 member text, member_id uuid, price_id text, product_name text, votes jsonb, fingerprint text)
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
         public.price_votes_json(mates.user_id, pr.id, f.fingerprint), f.fingerprint
  from mates
  cross join wanted
  join public.user_records prod
    on prod.user_id = mates.user_id and prod.collection = 'products' and not prod.deleted
   and prod.data->>'ean' = any (wanted.eans)
  join public.user_records pr
    on pr.user_id = mates.user_id and pr.collection = 'prices' and not pr.deleted
   and pr.data->>'productId' = prod.id
  cross join lateral (select public.group_price_fingerprint(prod.data->>'ean', pr.data) as fingerprint) f
  where public.group_price_visible(pr.data, 60)
$$;

-- ── Por validar ──────────────────────────────────────────────

drop function public.pending_validations();

create function public.pending_validations()
  returns table (ean text, amount double precision, date text, store text, barrio text, store_ref jsonb,
                 member text, member_id uuid, price_id text, product_name text, votes jsonb,
                 brand text, size double precision, size_unit text, fingerprint text)
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
         public.price_votes_json(r.user_id, r.id, f.fingerprint),
         r.product->>'brand',
         -- Los case anidados aseguran el orden: el cast a double precision falla con uno enorme o casi 0
         case when jsonb_typeof(r.product->'size') = 'number' then
           case when (r.product->>'size')::numeric between 0.001 and 1000000000
                then (r.product->>'size')::double precision end
         end,
         r.product->>'sizeUnit',
         f.fingerprint
  from recent r
  cross join lateral (select public.group_price_fingerprint(r.product->>'ean', r.data) as fingerprint) f
  order by r.data->>'date' desc, r.id
$$;

-- ── El autor: votos sobre sus precios ────────────────────────

-- Mismas columnas: solo los votos sobre el precio como está ahora en la cuenta
create or replace function public.my_price_votes(p_price_ids text[])
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
  join public.user_records pr
    on pr.user_id = v.owner_id and pr.collection = 'prices' and pr.id = v.price_id and not pr.deleted
  join public.user_records prod
    on prod.user_id = v.owner_id and prod.collection = 'products' and not prod.deleted
   and prod.id = pr.data->>'productId'
  where v.fingerprint = public.group_price_fingerprint(prod.data->>'ean', pr.data)
  order by v.price_id, v.created_at, v.voter_id
$$;

-- Ya no la usa nadie
drop function public.price_votes_json(uuid, text);

revoke execute on function
  public.vote_price(uuid, text, text, text, double precision), public.group_prices(text[]),
  public.pending_validations()
  from public, anon;
grant execute on function
  public.vote_price(uuid, text, text, text, double precision), public.group_prices(text[]),
  public.pending_validations()
  to authenticated;
