-- Structured weekly opening hours per branch, so the student app can say
-- "Open, until 9pm" from real data. Days without a row are closed.
-- weekday: ISO, 1 = Monday ... 7 = Sunday. Times are Africa/Accra local.
-- A closing time at or before the opening time means it closes after midnight.

create table public.merchant_branch_hours (
  branch_id uuid not null references public.merchant_branches (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  opens time not null,
  closes time not null,
  primary key (branch_id, weekday),
  constraint merchant_branch_hours_not_empty check (opens <> closes)
);
alter table public.merchant_branch_hours enable row level security;
revoke all on table public.merchant_branch_hours from anon, authenticated, service_role;
grant select on table public.merchant_branch_hours to authenticated;
create policy "merchant users read their branch hours" on public.merchant_branch_hours
  for select to authenticated using (exists (
    select 1 from public.merchant_branches b where b.id = branch_id and (select private.merchant_role(b.merchant_id)) is not null));
create policy "support reads branch hours" on public.merchant_branch_hours
  for select to authenticated using ((select private.is_staff('support')));

create function public.set_branch_hours(p_branch_id uuid, p_hours jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant uuid;
  v_row jsonb;
begin
  select merchant_id into v_merchant from public.merchant_branches where id = p_branch_id;
  if v_merchant is null or not (select private.can_manage_merchant(v_merchant)) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_hours, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_hours, '[]'::jsonb)) > 7 then
    raise exception 'hours_invalid' using errcode = 'P0001';
  end if;
  delete from public.merchant_branch_hours where branch_id = p_branch_id;
  for v_row in select * from jsonb_array_elements(coalesce(p_hours, '[]'::jsonb)) loop
    begin
      insert into public.merchant_branch_hours (branch_id, weekday, opens, closes)
      values (p_branch_id, (v_row ->> 'weekday')::smallint, (v_row ->> 'opens')::time, (v_row ->> 'closes')::time);
    exception when others then
      raise exception 'hours_invalid' using errcode = 'P0001';
    end;
  end loop;
  perform private.write_audit('merchant.branch_hours_set', 'merchant', 'merchant_branch', p_branch_id, null, p_hours, '{}'::jsonb, null, v_merchant);
end;
$$;

-- Whether a branch is open now, until when, and when it next opens.
create function private.branch_open_state(p_branch_id uuid)
returns table (has_hours boolean, open_now boolean, open_until time, opens_next text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_local timestamp := now() at time zone 'Africa/Accra';
  v_dow smallint := extract(isodow from v_local)::smallint;
  v_prev smallint := case when v_dow = 1 then 7 else v_dow - 1 end;
  v_t time := v_local::time;
  r record;
  i int;
  d smallint;
begin
  if not exists (select 1 from public.merchant_branch_hours where branch_id = p_branch_id) then
    return query select false, null::boolean, null::time, null::text;
    return;
  end if;
  -- Today's span.
  select * into r from public.merchant_branch_hours where branch_id = p_branch_id and weekday = v_dow;
  if found and ((r.closes > r.opens and v_t >= r.opens and v_t < r.closes) or (r.closes <= r.opens and v_t >= r.opens)) then
    return query select true, true, r.closes, null::text;
    return;
  end if;
  -- Yesterday's span running past midnight.
  select * into r from public.merchant_branch_hours where branch_id = p_branch_id and weekday = v_prev;
  if found and r.closes <= r.opens and v_t < r.closes then
    return query select true, true, r.closes, null::text;
    return;
  end if;
  -- Next opening: later today, then the following days.
  select * into r from public.merchant_branch_hours where branch_id = p_branch_id and weekday = v_dow and opens > v_t;
  if found then
    return query select true, false, null::time, 'today ' || to_char(r.opens, 'HH24:MI');
    return;
  end if;
  for i in 1..7 loop
    d := ((v_dow - 1 + i) % 7) + 1;
    select * into r from public.merchant_branch_hours where branch_id = p_branch_id and weekday = d;
    if found then
      return query select true, false, null::time,
        (case when i = 1 then 'tomorrow' else (array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[d] end) || ' ' || to_char(r.opens, 'HH24:MI');
      return;
    end if;
  end loop;
  return query select true, false, null::time, null::text;
end;
$$;

-- list_deals gains the nearest branch's open state.
drop function public.list_deals(text, text, uuid, int);
create function public.list_deals(
  p_query text default null,
  p_category text default null,
  p_merchant_id uuid default null,
  p_limit int default 60
)
returns table (
  offer_id uuid, title text, item_name text, merchant_id uuid, merchant_slug text, merchant_name text,
  category_slug text, category_name text, category_icon text, regular_price numeric, discount_amount numeric, final_price numeric,
  discount_type public.discount_type, discount_value numeric, per_student_limit int, per_student_period public.limit_period,
  is_favourite boolean, branch_id uuid, branch_name text, branch_area text, opening_hours text, distance_m int, campus_name text,
  has_hours boolean, open_now boolean, open_until time, opens_next text
)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (select * from private.my_campus())
  select o.offer_id, o.title, o.item_name, o.merchant_id, o.merchant_slug, o.merchant_name, o.category_slug, o.category_name, o.category_icon,
         o.regular_price, o.discount_amount, o.final_price, o.discount_type, o.discount_value, o.per_student_limit, o.per_student_period,
         o.is_favourite, nb.id, nb.name, nb.area, nb.opening_hours, nb.dist, (select name from c),
         st.has_hours, st.open_now, st.open_until, st.opens_next
  from public.list_offers(p_query, p_category, p_merchant_id, p_limit, 0) o
  left join lateral (
    select b.id, b.name, b.area, b.opening_hours,
           private.distance_m((select latitude from c), (select longitude from c), b.latitude, b.longitude) as dist
    from public.merchant_branches b
    where b.merchant_id = o.merchant_id and b.is_active
      and (not exists (select 1 from public.offer_branches ob where ob.offer_id = o.offer_id)
           or exists (select 1 from public.offer_branches ob where ob.offer_id = o.offer_id and ob.branch_id = b.id))
    order by private.distance_m((select latitude from c), (select longitude from c), b.latitude, b.longitude) nulls last, b.name
    limit 1
  ) nb on true
  left join lateral private.branch_open_state(nb.id) st on true;
$$;

-- Hours of the branches on a student-visible offer or business page.
create function public.branch_hours_for(p_branch_ids uuid[])
returns table (branch_id uuid, weekday smallint, opens time, closes time, open_now boolean, open_until time, opens_next text)
language sql
stable
security definer
set search_path = ''
as $$
  select h.branch_id, h.weekday, h.opens, h.closes, st.open_now, st.open_until, st.opens_next
  from public.merchant_branch_hours h
  join public.merchant_branches b on b.id = h.branch_id and b.is_active
  join public.merchants m on m.id = b.merchant_id and m.status = 'approved'
  left join lateral private.branch_open_state(h.branch_id) st on true
  where h.branch_id = any (coalesce(p_branch_ids, '{}')) and (select auth.uid()) is not null
  order by h.branch_id, h.weekday;
$$;

revoke execute on function public.set_branch_hours(uuid, jsonb), public.list_deals(text, text, uuid, int), public.branch_hours_for(uuid[]) from public, anon;
grant execute on function public.set_branch_hours(uuid, jsonb), public.list_deals(text, text, uuid, int), public.branch_hours_for(uuid[]) to authenticated;

revoke execute on all functions in schema private from public;
