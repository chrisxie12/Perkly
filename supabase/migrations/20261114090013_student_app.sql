-- Student app (prototype design, real data): distance from the student's campus to
-- each deal's nearest branch, and the savings summary for the Savings tab.

-- Great-circle distance in metres.
create function private.distance_m(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision)
returns int
language sql
immutable
set search_path = ''
as $$
  select case when p_lat1 is null or p_lng1 is null or p_lat2 is null or p_lng2 is null then null
    else round(2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2), 2)
      + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2))))::int end;
$$;

-- Where the caller studies: their campus if it has a location, otherwise their
-- institution's only located campus. Null when unknown.
create function private.my_campus()
returns table (campus_id uuid, name text, latitude double precision, longitude double precision)
language sql
stable
security definer
set search_path = ''
as $$
  with sp as (select institution_id, campus_id from public.student_profiles where user_id = (select auth.uid())),
  own as (
    select c.id, c.name, c.latitude, c.longitude from public.campuses c, sp
    where c.id = sp.campus_id and c.latitude is not null
  ),
  only_one as (
    select c.id, c.name, c.latitude, c.longitude from public.campuses c, sp
    where c.institution_id = sp.institution_id and c.is_active and c.latitude is not null
      and (select count(*) from public.campuses c2 where c2.institution_id = sp.institution_id and c2.is_active and c2.latitude is not null) = 1
  )
  select * from own union all select * from only_one where not exists (select 1 from own) limit 1;
$$;

-- Deals for the student app: list_offers plus the nearest branch where the offer
-- applies and its distance from the student's campus (null if either location is missing).
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
  is_favourite boolean, branch_name text, branch_area text, opening_hours text, distance_m int, campus_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (select * from private.my_campus())
  select o.offer_id, o.title, o.item_name, o.merchant_id, o.merchant_slug, o.merchant_name, o.category_slug, o.category_name, o.category_icon,
         o.regular_price, o.discount_amount, o.final_price, o.discount_type, o.discount_value, o.per_student_limit, o.per_student_period,
         o.is_favourite, nb.name, nb.area, nb.opening_hours, nb.dist, (select name from c)
  from public.list_offers(p_query, p_category, p_merchant_id, p_limit, 0) o
  left join lateral (
    select b.name, b.area, b.opening_hours,
           private.distance_m((select latitude from c), (select longitude from c), b.latitude, b.longitude) as dist
    from public.merchant_branches b
    where b.merchant_id = o.merchant_id and b.is_active
      and (not exists (select 1 from public.offer_branches ob where ob.offer_id = o.offer_id)
           or exists (select 1 from public.offer_branches ob where ob.offer_id = o.offer_id and ob.branch_id = b.id))
    order by private.distance_m((select latitude from c), (select longitude from c), b.latitude, b.longitude) nulls last, b.name
    limit 1
  ) nb on true;
$$;

-- The Savings tab: totals, shops, best single saving and the last six months
-- (Africa/Accra calendar). Voided redemptions are left out.
create function public.my_savings_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with r as (
    select * from public.redemptions where student_id = (select auth.uid()) and voided_at is null
  ), months as (
    select generate_series(date_trunc('month', now() at time zone 'Africa/Accra') - interval '5 months',
                           date_trunc('month', now() at time zone 'Africa/Accra'), interval '1 month') as m
  )
  select jsonb_build_object(
    'total_saved', coalesce((select sum(discount_amount) from r), 0),
    'redemptions', (select count(*) from r),
    'shops', (select count(distinct merchant_id) from r),
    'best', (select max(discount_amount) from r),
    'first_at', (select min(redeemed_at) from r),
    'by_month', (select jsonb_agg(jsonb_build_object(
                   'month', to_char(months.m, 'YYYY-MM'),
                   'saved', coalesce((select sum(discount_amount) from r
                                      where date_trunc('month', r.redeemed_at at time zone 'Africa/Accra') = months.m), 0))
                 order by months.m) from months)
  )
  where (select auth.uid()) is not null;
$$;

revoke execute on function public.list_deals(text, text, uuid, int), public.my_savings_summary() from public, anon;
grant execute on function public.list_deals(text, text, uuid, int), public.my_savings_summary() to authenticated;

revoke execute on all functions in schema private from public;
