-- Ratings from real visits, plus the small lookups the redesigned deals screen
-- needs: when a deal went live (sort by "New"), branch locations (map) and the
-- student's campus location ("you are here").

-- Ratings ------------------------------------------------------------------------------
-- Only a student with a completed redemption at the business can rate it; one
-- rating per student per business, which they can change or remove.
create table public.merchant_reviews (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_by uuid references public.profiles (id) on delete set null,
  unique (merchant_id, student_id)
);
create index merchant_reviews_merchant on public.merchant_reviews (merchant_id, created_at desc) where hidden_at is null;
alter table public.merchant_reviews enable row level security;
revoke all on table public.merchant_reviews from anon, authenticated, service_role;
create policy "students read their own ratings" on public.merchant_reviews
  for select to authenticated using (student_id = (select auth.uid()));
grant select on table public.merchant_reviews to authenticated;

create function private.has_visited(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.redemption_sessions s
    where s.merchant_id = p_merchant_id and s.student_id = (select auth.uid()) and s.status = 'completed');
$$;
revoke execute on function private.has_visited(uuid) from public, anon;
grant execute on function private.has_visited(uuid) to authenticated;

create function public.submit_merchant_review(p_merchant_id uuid, p_rating int, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_new boolean;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'rating_invalid' using errcode = 'P0001'; end if;
  if v_comment is not null and char_length(v_comment) > 500 then raise exception 'comment_too_long' using errcode = 'P0001'; end if;
  if not private.merchant_is_listed(p_merchant_id) then raise exception 'merchant_not_found' using errcode = 'P0001'; end if;
  if not private.has_visited(p_merchant_id) then raise exception 'visit_required' using errcode = 'P0001'; end if;
  perform private.check_rate_limit('review.submit', 10, interval '1 hour', v_uid::text);

  v_new := not exists (select 1 from public.merchant_reviews where merchant_id = p_merchant_id and student_id = v_uid);
  insert into public.merchant_reviews (merchant_id, student_id, rating, comment)
  values (p_merchant_id, v_uid, p_rating, v_comment)
  on conflict (merchant_id, student_id) do update
    set rating = excluded.rating, comment = excluded.comment, updated_at = now();

  if v_new then
    perform private.notify_business_team(p_merchant_id, 'merchant.review',
      'New rating: ' || p_rating || ' out of 5',
      coalesce(left(v_comment, 140), 'A student rated your business after a visit.'), '/merchant/reviews');
  end if;
end;
$$;

create function public.delete_my_review(p_merchant_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.merchant_reviews where merchant_id = p_merchant_id and student_id = (select auth.uid());
$$;

-- Whether the signed-in student may rate this business, and their current rating.
create function public.get_my_review(p_merchant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'can_review', private.has_visited(p_merchant_id),
    'rating', r.rating, 'comment', r.comment, 'hidden', r.hidden_at is not null)
  from (select 1) x
  left join public.merchant_reviews r on r.merchant_id = p_merchant_id and r.student_id = (select auth.uid())
  where (select auth.uid()) is not null;
$$;

-- Average and count of visible ratings, for listed businesses.
create function public.merchant_ratings(p_merchant_ids uuid[])
returns table (merchant_id uuid, rating numeric, reviews int)
language sql
stable
security definer
set search_path = ''
as $$
  select r.merchant_id, round(avg(r.rating)::numeric, 1), count(*)::int
  from public.merchant_reviews r
  join public.merchants m on m.id = r.merchant_id and m.status = 'approved'
  where (select auth.uid()) is not null
    and r.hidden_at is null
    and r.merchant_id = any ((coalesce(p_merchant_ids, '{}'::uuid[]))[1:200])
  group by r.merchant_id;
$$;

-- Recent ratings with comments: for students on a listed business, for its own
-- owners and managers, and for Perqly support (who can hide abusive ones).
create function public.list_merchant_reviews(p_merchant_id uuid, p_limit int default 30)
returns table (id uuid, author text, rating smallint, comment text, created_at timestamptz, hidden boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff boolean := private.is_staff('support');
  v_team boolean := private.can_manage_merchant(p_merchant_id);
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not (v_staff or v_team or private.merchant_is_listed(p_merchant_id)) then
    raise exception 'merchant_not_found' using errcode = 'P0001';
  end if;
  return query
  select r.id,
         coalesce(nullif(btrim(p.first_name), ''), 'Student')
           || coalesce(' ' || left(nullif(btrim(split_part(btrim(p.full_name), ' ', 2)), ''), 1) || '.', ''),
         r.rating, r.comment, r.updated_at, r.hidden_at is not null
  from public.merchant_reviews r
  join public.profiles p on p.id = r.student_id
  where r.merchant_id = p_merchant_id and (r.hidden_at is null or v_staff)
  order by r.updated_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

create function public.staff_set_review_hidden(p_review_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.merchant_reviews;
begin
  if not private.is_staff('support') then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into v_review from public.merchant_reviews where id = p_review_id;
  if not found then raise exception 'review_not_found' using errcode = 'P0001'; end if;
  update public.merchant_reviews
     set hidden_at = case when p_hidden then now() end, hidden_by = case when p_hidden then (select auth.uid()) end
   where id = p_review_id;
  perform private.write_audit(case when p_hidden then 'review.hidden' else 'review.restored' end, 'platform:staff',
    'merchant_review', p_review_id, null, null, '{}'::jsonb, null, v_review.merchant_id);
end;
$$;

-- Deal screen lookups -----------------------------------------------------------------
create function public.offer_published_dates(p_offer_ids uuid[])
returns table (offer_id uuid, published_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, greatest(coalesce(o.published_at, o.starts_at), o.starts_at)
  from public.offers o
  where (select auth.uid()) is not null
    and o.status = 'active'
    and o.id = any ((coalesce(p_offer_ids, '{}'::uuid[]))[1:200]);
$$;

create function public.branch_locations(p_branch_ids uuid[])
returns table (branch_id uuid, latitude double precision, longitude double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.latitude, b.longitude
  from public.merchant_branches b
  join public.merchants m on m.id = b.merchant_id and m.status = 'approved'
  where (select auth.uid()) is not null
    and b.is_active and b.latitude is not null and b.longitude is not null
    and b.id = any ((coalesce(p_branch_ids, '{}'::uuid[]))[1:300]);
$$;

create function public.my_campus_location()
returns table (name text, latitude double precision, longitude double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select c.name, c.latitude, c.longitude from private.my_campus() c where c.latitude is not null;
$$;

revoke execute on function public.submit_merchant_review(uuid, int, text), public.delete_my_review(uuid),
  public.get_my_review(uuid), public.merchant_ratings(uuid[]), public.list_merchant_reviews(uuid, int),
  public.staff_set_review_hidden(uuid, boolean), public.offer_published_dates(uuid[]), public.branch_locations(uuid[]),
  public.my_campus_location() from public, anon;
grant execute on function public.submit_merchant_review(uuid, int, text), public.delete_my_review(uuid),
  public.get_my_review(uuid), public.merchant_ratings(uuid[]), public.list_merchant_reviews(uuid, int),
  public.staff_set_review_hidden(uuid, boolean), public.offer_published_dates(uuid[]), public.branch_locations(uuid[]),
  public.my_campus_location() to authenticated;
