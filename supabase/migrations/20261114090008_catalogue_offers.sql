-- Perqly migration 0008: catalogue, offers and the student marketplace (roadmap step 1.5).
--
-- Offers point to exactly one priced catalogue item (decision D2). Prices are
-- calculated only in private.price_offer(); the app never sends or computes a
-- price that gets recorded. Students read offers only through functions that
-- apply every visibility rule: approved merchant, active offer within its
-- dates, a valid price, an open branch, and the student's institution scope.
-- Unverified students can browse (decision D1); redeeming is checked in 0009.

create type public.offer_status as enum ('draft', 'pending_review', 'active', 'paused', 'expired', 'rejected', 'archived');
create type public.discount_type as enum ('percentage', 'fixed_amount', 'fixed_price');
create type public.limit_period as enum ('day', 'week', 'month', 'offer_lifetime');
create type public.institution_scope as enum ('all', 'selected');

-- Catalogue -------------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text check (description is null or char_length(description) <= 1000),
  duration_minutes int check (duration_minutes is null or duration_minutes between 5 and 480),
  regular_price numeric(12, 2) not null check (regular_price > 0 and regular_price < 1000000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_merchant on public.services (merchant_id);
create trigger services_updated_at before update on public.services for each row execute function private.set_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text check (description is null or char_length(description) <= 1000),
  sku text check (sku is null or char_length(sku) between 1 and 60),
  regular_price numeric(12, 2) not null check (regular_price > 0 and regular_price < 1000000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_merchant on public.products (merchant_id);
create unique index products_sku_per_merchant on public.products (merchant_id, sku) where sku is not null;
create trigger products_updated_at before update on public.products for each row execute function private.set_updated_at();

-- Offers ----------------------------------------------------------------------------
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  service_id uuid references public.services (id) on delete restrict,
  product_id uuid references public.products (id) on delete restrict,
  title text check (title is null or char_length(btrim(title)) between 3 and 80),
  description text check (description is null or char_length(description) <= 1000),
  conditions text not null check (char_length(btrim(conditions)) between 3 and 500),
  discount_type public.discount_type not null,
  discount_value numeric(12, 2) not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status public.offer_status not null default 'draft',
  status_reason text check (status_reason is null or char_length(status_reason) <= 500),
  per_student_limit int not null default 1 check (per_student_limit between 1 and 100),
  per_student_period public.limit_period not null default 'month',
  total_cap int check (total_cap is null or total_cap >= 1),
  redemption_count int not null default 0 check (redemption_count >= 0),
  institution_scope public.institution_scope not null default 'all',
  published_at timestamptz,
  created_by uuid not null references public.profiles (id),
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(description, '')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offers_one_item check ((service_id is null) <> (product_id is null)),
  constraint offers_percentage check (discount_type <> 'percentage' or discount_value between 1 and 90),
  constraint offers_fixed_positive check (discount_type = 'percentage' or discount_value > 0),
  constraint offers_dates check (ends_at is null or ends_at > starts_at)
);
create index offers_merchant_status on public.offers (merchant_id, status);
create index offers_live on public.offers (status, starts_at, ends_at) where status = 'active';
create index offers_service on public.offers (service_id);
create index offers_product on public.offers (product_id);
create index offers_created_by on public.offers (created_by);
create index offers_search on public.offers using gin (search_vector);
create trigger offers_updated_at before update on public.offers for each row execute function private.set_updated_at();

create table public.offer_branches (
  offer_id uuid not null references public.offers (id) on delete cascade,
  branch_id uuid not null references public.merchant_branches (id) on delete cascade,
  primary key (offer_id, branch_id)
);
create index offer_branches_branch on public.offer_branches (branch_id);

create table public.offer_institutions (
  offer_id uuid not null references public.offers (id) on delete cascade,
  institution_id uuid not null references public.institutions (id) on delete cascade,
  primary key (offer_id, institution_id)
);
create index offer_institutions_institution on public.offer_institutions (institution_id);

create table public.favourites (
  student_id uuid not null references public.profiles (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, merchant_id)
);
create index favourites_merchant on public.favourites (merchant_id);

-- Pricing: the only place a price is calculated --------------------------------------
-- No row = the offer can't be priced (a fixed value no longer below the item's price).
create function private.price_offer(p_offer_id uuid)
returns table (regular_price numeric, discount_amount numeric, final_price numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with item as (
    select o.discount_type, o.discount_value, coalesce(s.regular_price, p.regular_price) as rp
    from public.offers o
    left join public.services s on s.id = o.service_id
    left join public.products p on p.id = o.product_id
    where o.id = p_offer_id
  ), priced as (
    select rp,
           case discount_type
             when 'percentage' then round(rp * discount_value / 100, 2)
             when 'fixed_amount' then discount_value
             else rp - discount_value
           end as da
    from item
  )
  select rp, da, rp - da from priced where da > 0 and da < rp;
$$;

-- The caller's institution, for offer scope (null if they haven't chosen one).
create function private.my_institution()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select institution_id from public.student_profiles where user_id = (select auth.uid());
$$;

-- Whether an offer is live and visible to students of an institution, right now.
create function private.offer_is_live(p_offer_id uuid, p_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.offers o
    join public.merchants m on m.id = o.merchant_id and m.status = 'approved'
    left join public.services s on s.id = o.service_id
    left join public.products p on p.id = o.product_id
    where o.id = p_offer_id
      and o.status = 'active' and o.starts_at <= now() and (o.ends_at is null or o.ends_at > now())
      and (o.total_cap is null or o.redemption_count < o.total_cap)
      and coalesce(s.is_active, p.is_active)
      and (o.institution_scope = 'all'
           or (p_institution_id is not null
               and exists (select 1 from public.offer_institutions oi where oi.offer_id = o.id and oi.institution_id = p_institution_id)))
      and exists (
        select 1 from public.merchant_branches b
        where b.merchant_id = o.merchant_id and b.is_active
          and (not exists (select 1 from public.offer_branches ob where ob.offer_id = o.id)
               or exists (select 1 from public.offer_branches ob where ob.offer_id = o.id and ob.branch_id = b.id)))
      and exists (select 1 from private.price_offer(o.id))
  );
$$;

grant execute on function private.price_offer(uuid), private.my_institution(), private.offer_is_live(uuid, uuid) to authenticated;

-- Row-level security ------------------------------------------------------------------
alter table public.services enable row level security;
alter table public.products enable row level security;
alter table public.offers enable row level security;
alter table public.offer_branches enable row level security;
alter table public.offer_institutions enable row level security;
alter table public.favourites enable row level security;

revoke all on table public.services, public.products, public.offers, public.offer_branches, public.offer_institutions, public.favourites
  from anon, authenticated, service_role;
grant select on table public.services, public.products, public.offers, public.offer_branches, public.offer_institutions to authenticated;
grant select, insert, delete on table public.favourites to authenticated;

-- Merchant teams and Perqly support read the catalogue and offers directly;
-- students read them only through the listing functions below.
create policy "merchant users read their services" on public.services
  for select to authenticated using ((select private.merchant_role(merchant_id)) is not null);
create policy "support reads all services" on public.services
  for select to authenticated using ((select private.is_staff('support')));
create policy "merchant users read their products" on public.products
  for select to authenticated using ((select private.merchant_role(merchant_id)) is not null);
create policy "support reads all products" on public.products
  for select to authenticated using ((select private.is_staff('support')));
create policy "merchant users read their offers" on public.offers
  for select to authenticated using ((select private.merchant_role(merchant_id)) is not null);
create policy "support reads all offers" on public.offers
  for select to authenticated using ((select private.is_staff('support')));
create policy "merchant users read their offer branches" on public.offer_branches
  for select to authenticated using (exists (select 1 from public.offers o where o.id = offer_id and (select private.merchant_role(o.merchant_id)) is not null));
create policy "support reads offer branches" on public.offer_branches
  for select to authenticated using ((select private.is_staff('support')));
create policy "merchant users read their offer institutions" on public.offer_institutions
  for select to authenticated using (exists (select 1 from public.offers o where o.id = offer_id and (select private.merchant_role(o.merchant_id)) is not null));
create policy "support reads offer institutions" on public.offer_institutions
  for select to authenticated using ((select private.is_staff('support')));

create policy "students read their favourites" on public.favourites
  for select to authenticated using (student_id = (select auth.uid()));
create policy "students add favourites of live businesses" on public.favourites
  for insert to authenticated with check (student_id = (select auth.uid()) and (select private.merchant_is_listed(merchant_id)));
create policy "students remove their favourites" on public.favourites
  for delete to authenticated using (student_id = (select auth.uid()));

-- Catalogue functions -----------------------------------------------------------------
create function public.upsert_catalogue_item(
  p_merchant_id uuid,
  p_kind text,
  p_item_id uuid,
  p_name text,
  p_regular_price numeric,
  p_description text default null,
  p_duration_minutes int default null,
  p_sku text default null,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (select private.can_manage_merchant(p_merchant_id)) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if exists (select 1 from public.merchants where id = p_merchant_id and status = 'suspended') then
    raise exception 'merchant_suspended' using errcode = 'P0001';
  end if;
  if p_kind not in ('service', 'product') then raise exception 'item_kind_invalid' using errcode = 'P0001'; end if;
  if p_regular_price is null or p_regular_price <= 0 or p_regular_price >= 1000000 then raise exception 'price_invalid' using errcode = 'P0001'; end if;

  begin
    if p_kind = 'service' then
      if p_item_id is null then
        insert into public.services (merchant_id, name, description, duration_minutes, regular_price, is_active)
        values (p_merchant_id, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), p_duration_minutes, round(p_regular_price, 2), coalesce(p_is_active, true))
        returning id into v_id;
      else
        update public.services set name = btrim(p_name), description = nullif(btrim(coalesce(p_description, '')), ''),
          duration_minutes = p_duration_minutes, regular_price = round(p_regular_price, 2), is_active = coalesce(p_is_active, true)
        where id = p_item_id and merchant_id = p_merchant_id returning id into v_id;
      end if;
    else
      if p_item_id is null then
        insert into public.products (merchant_id, name, description, sku, regular_price, is_active)
        values (p_merchant_id, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), nullif(btrim(coalesce(p_sku, '')), ''), round(p_regular_price, 2), coalesce(p_is_active, true))
        returning id into v_id;
      else
        update public.products set name = btrim(p_name), description = nullif(btrim(coalesce(p_description, '')), ''),
          sku = nullif(btrim(coalesce(p_sku, '')), ''), regular_price = round(p_regular_price, 2), is_active = coalesce(p_is_active, true)
        where id = p_item_id and merchant_id = p_merchant_id returning id into v_id;
      end if;
    end if;
  exception
    when unique_violation then raise exception 'sku_in_use' using errcode = 'P0001';
    when check_violation then raise exception 'item_invalid' using errcode = 'P0001';
  end;
  if v_id is null then raise exception 'item_not_found' using errcode = 'P0001'; end if;

  perform private.write_audit(case when p_item_id is null then 'catalogue.item_added' else 'catalogue.item_updated' end,
    'merchant:manager', p_kind, v_id, null, jsonb_build_object('name', btrim(p_name), 'regular_price', round(p_regular_price, 2)),
    '{}'::jsonb, null, p_merchant_id);
  return v_id;
end;
$$;

-- Offer functions ---------------------------------------------------------------------
-- Create or edit an offer. Only drafts, rejected and paused offers can be edited;
-- editing sends it back to draft so it is submitted again.
create function public.upsert_offer(
  p_merchant_id uuid,
  p_offer_id uuid,
  p_item_kind text,
  p_item_id uuid,
  p_discount_type public.discount_type,
  p_discount_value numeric,
  p_conditions text,
  p_title text default null,
  p_description text default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_per_student_limit int default 1,
  p_per_student_period public.limit_period default 'month',
  p_total_cap int default null,
  p_institution_ids uuid[] default '{}',
  p_branch_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.offers;
  v_price numeric;
  v_id uuid;
  v_scope public.institution_scope := case when coalesce(cardinality(p_institution_ids), 0) > 0 then 'selected' else 'all' end;
begin
  if not (select private.can_manage_merchant(p_merchant_id)) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if exists (select 1 from public.merchants where id = p_merchant_id and status = 'suspended') then
    raise exception 'merchant_suspended' using errcode = 'P0001';
  end if;

  if p_item_kind = 'service' then
    select regular_price into v_price from public.services where id = p_item_id and merchant_id = p_merchant_id;
  elsif p_item_kind = 'product' then
    select regular_price into v_price from public.products where id = p_item_id and merchant_id = p_merchant_id;
  end if;
  if v_price is null then raise exception 'item_not_found' using errcode = 'P0001'; end if;

  if p_discount_type = 'percentage' and (p_discount_value is null or p_discount_value < 1 or p_discount_value > 90) then
    raise exception 'discount_invalid' using errcode = 'P0001';
  end if;
  if p_discount_type <> 'percentage' and (p_discount_value is null or p_discount_value <= 0 or p_discount_value >= v_price) then
    raise exception 'discount_not_below_price' using errcode = 'P0001';
  end if;
  if p_ends_at is not null and p_ends_at <= coalesce(p_starts_at, now()) then raise exception 'dates_invalid' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(coalesce(p_branch_ids, '{}')) b(id)
             where not exists (select 1 from public.merchant_branches where id = b.id and merchant_id = p_merchant_id)) then
    raise exception 'branch_not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(coalesce(p_institution_ids, '{}')) i(id)
             where not exists (select 1 from public.institutions where id = i.id)) then
    raise exception 'institution_not_found' using errcode = 'P0001';
  end if;

  begin
    if p_offer_id is null then
      insert into public.offers (merchant_id, service_id, product_id, title, description, conditions, discount_type, discount_value,
                                 starts_at, ends_at, per_student_limit, per_student_period, total_cap, institution_scope, created_by)
      values (p_merchant_id, case when p_item_kind = 'service' then p_item_id end, case when p_item_kind = 'product' then p_item_id end,
              nullif(btrim(coalesce(p_title, '')), ''), nullif(btrim(coalesce(p_description, '')), ''), btrim(p_conditions),
              p_discount_type, round(p_discount_value, 2), coalesce(p_starts_at, now()), p_ends_at, coalesce(p_per_student_limit, 1),
              coalesce(p_per_student_period, 'month'), p_total_cap, v_scope, (select auth.uid()))
      returning id into v_id;
    else
      select * into v_existing from public.offers where id = p_offer_id and merchant_id = p_merchant_id for update;
      if v_existing.id is null then raise exception 'offer_not_found' using errcode = 'P0001'; end if;
      if v_existing.status not in ('draft', 'rejected', 'paused') then raise exception 'offer_not_editable' using errcode = 'P0001'; end if;
      if p_total_cap is not null and p_total_cap < v_existing.redemption_count then raise exception 'cap_below_used' using errcode = 'P0001'; end if;
      update public.offers
      set service_id = case when p_item_kind = 'service' then p_item_id end, product_id = case when p_item_kind = 'product' then p_item_id end,
          title = nullif(btrim(coalesce(p_title, '')), ''), description = nullif(btrim(coalesce(p_description, '')), ''), conditions = btrim(p_conditions),
          discount_type = p_discount_type, discount_value = round(p_discount_value, 2), starts_at = coalesce(p_starts_at, v_existing.starts_at),
          ends_at = p_ends_at, per_student_limit = coalesce(p_per_student_limit, 1), per_student_period = coalesce(p_per_student_period, 'month'),
          total_cap = p_total_cap, institution_scope = v_scope, status = 'draft', status_reason = null
      where id = p_offer_id
      returning id into v_id;
    end if;
  exception when check_violation then raise exception 'offer_invalid' using errcode = 'P0001';
  end;

  delete from public.offer_branches where offer_id = v_id;
  insert into public.offer_branches (offer_id, branch_id) select v_id, b from unnest(coalesce(p_branch_ids, '{}')) b;
  delete from public.offer_institutions where offer_id = v_id;
  insert into public.offer_institutions (offer_id, institution_id) select v_id, i from unnest(coalesce(p_institution_ids, '{}')) i;

  perform private.write_audit(case when p_offer_id is null then 'offer.created' else 'offer.updated' end, 'merchant:manager', 'offer', v_id,
    case when v_existing.id is null then null else jsonb_build_object('status', v_existing.status, 'discount_type', v_existing.discount_type, 'discount_value', v_existing.discount_value) end,
    jsonb_build_object('status', 'draft', 'discount_type', p_discount_type, 'discount_value', round(p_discount_value, 2)), '{}'::jsonb, null, p_merchant_id);
  return v_id;
end;
$$;

-- Submit a draft. A merchant's first 3 offers are reviewed by Perqly; later ones go live at once.
create function public.submit_offer(p_offer_id uuid)
returns public.offer_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers;
  v_new public.offer_status;
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if v_offer.id is null or not (select private.can_manage_merchant(v_offer.merchant_id)) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if v_offer.status not in ('draft', 'rejected') then raise exception 'offer_not_editable' using errcode = 'P0001'; end if;
  if not (select private.merchant_is_listed(v_offer.merchant_id)) then raise exception 'merchant_not_approved' using errcode = 'P0001'; end if;
  if not exists (select 1 from private.price_offer(p_offer_id)) then raise exception 'discount_not_below_price' using errcode = 'P0001'; end if;

  v_new := case when (select count(*) from public.offers where merchant_id = v_offer.merchant_id and published_at is not null) >= 3
                then 'active' else 'pending_review' end;
  update public.offers
  set status = v_new, status_reason = null, published_at = case when v_new = 'active' then coalesce(published_at, now()) else published_at end
  where id = p_offer_id;
  perform private.write_audit('offer.submitted', 'merchant:manager', 'offer', p_offer_id, jsonb_build_object('status', v_offer.status),
    jsonb_build_object('status', v_new), '{}'::jsonb, null, v_offer.merchant_id);
  return v_new;
end;
$$;

-- Merchant status changes: pause, resume, archive.
create function public.set_offer_state(p_offer_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers;
  v_new public.offer_status;
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if v_offer.id is null or not (select private.can_manage_merchant(v_offer.merchant_id)) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  v_new := case
    when p_action = 'pause' and v_offer.status = 'active' then 'paused'
    when p_action = 'resume' and v_offer.status = 'paused' then 'active'
    when p_action = 'archive' and v_offer.status <> 'archived' then 'archived'
  end::public.offer_status;
  if v_new is null then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  if v_new = 'active' and not (select private.merchant_is_listed(v_offer.merchant_id)) then raise exception 'merchant_not_approved' using errcode = 'P0001'; end if;
  update public.offers set status = v_new where id = p_offer_id;
  perform private.write_audit('offer.' || case p_action when 'pause' then 'paused' when 'resume' then 'resumed' else 'archived' end,
    'merchant:manager', 'offer', p_offer_id, jsonb_build_object('status', v_offer.status), jsonb_build_object('status', v_new), '{}'::jsonb, null, v_offer.merchant_id);
end;
$$;

-- Perqly moderation: approve or reject offers in review, or take down a live one.
create function public.moderate_offer(p_offer_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers;
  v_new public.offer_status;
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into v_offer from public.offers where id = p_offer_id for update;
  if v_offer.id is null then raise exception 'offer_not_found' using errcode = 'P0001'; end if;
  if p_decision in ('reject', 'takedown') and char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  v_new := case
    when p_decision = 'approve' and v_offer.status = 'pending_review' then 'active'
    when p_decision = 'reject' and v_offer.status = 'pending_review' then 'rejected'
    when p_decision = 'takedown' and v_offer.status in ('active', 'paused') then 'rejected'
  end::public.offer_status;
  if v_new is null then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  update public.offers
  set status = v_new, status_reason = case when v_new = 'rejected' then btrim(p_reason) else null end,
      published_at = case when v_new = 'active' then coalesce(published_at, now()) else published_at end
  where id = p_offer_id;
  perform private.write_audit('offer.' || case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'taken_down' end,
    'platform:admin', 'offer', p_offer_id, jsonb_build_object('status', v_offer.status),
    jsonb_build_object('status', v_new, 'reason', nullif(btrim(coalesce(p_reason, '')), '')), '{}'::jsonb, null, v_offer.merchant_id);
end;
$$;

-- Marketplace (students) ----------------------------------------------------------------
create function public.list_offers(
  p_query text default null,
  p_category text default null,
  p_merchant_id uuid default null,
  p_limit int default 40,
  p_offset int default 0
)
returns table (
  offer_id uuid, title text, item_name text, item_kind text, merchant_id uuid, merchant_slug text, merchant_name text,
  category_slug text, category_name text, category_icon text, regular_price numeric, discount_amount numeric, final_price numeric,
  discount_type public.discount_type, discount_value numeric, ends_at timestamptz, per_student_limit int,
  per_student_period public.limit_period, is_favourite boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid, (select private.my_institution()) as inst),
  q as (select nullif(btrim(coalesce(p_query, '')), '') as text)
  select o.id, coalesce(o.title, coalesce(s.name, p.name)), coalesce(s.name, p.name), case when s.id is not null then 'service' else 'product' end,
         m.id, m.slug, m.display_name, c.slug, c.name, c.icon, pr.regular_price, pr.discount_amount, pr.final_price,
         o.discount_type, o.discount_value, o.ends_at, o.per_student_limit, o.per_student_period,
         exists (select 1 from public.favourites f, me where f.student_id = me.uid and f.merchant_id = m.id)
  from public.offers o
  join public.merchants m on m.id = o.merchant_id
  join public.merchant_categories c on c.id = m.category_id
  left join public.services s on s.id = o.service_id
  left join public.products p on p.id = o.product_id
  cross join lateral private.price_offer(o.id) pr
  cross join me cross join q
  where (select auth.uid()) is not null
    and private.offer_is_live(o.id, me.inst)
    and (p_category is null or c.slug = p_category)
    and (p_merchant_id is null or m.id = p_merchant_id)
    and (q.text is null
         or o.search_vector @@ plainto_tsquery('simple', q.text)
         or m.search_vector @@ plainto_tsquery('simple', q.text)
         or coalesce(s.name, p.name) ilike '%' || replace(replace(q.text, '%', ''), '_', '') || '%'
         or m.display_name ilike '%' || replace(replace(q.text, '%', ''), '_', '') || '%')
  order by (o.discount_type = 'percentage') desc, pr.discount_amount desc, o.published_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
$$;

-- One offer with where it can be used. Null if it isn't live for the caller.
create function public.get_offer(p_offer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'offer_id', o.id, 'title', coalesce(o.title, coalesce(s.name, p.name)), 'item_name', coalesce(s.name, p.name),
    'item_kind', case when s.id is not null then 'service' else 'product' end, 'item_description', coalesce(s.description, p.description),
    'duration_minutes', s.duration_minutes, 'description', o.description, 'conditions', o.conditions,
    'discount_type', o.discount_type, 'discount_value', o.discount_value,
    'regular_price', pr.regular_price, 'discount_amount', pr.discount_amount, 'final_price', pr.final_price,
    'starts_at', o.starts_at, 'ends_at', o.ends_at, 'per_student_limit', o.per_student_limit, 'per_student_period', o.per_student_period,
    'merchant', jsonb_build_object('id', m.id, 'slug', m.slug, 'display_name', m.display_name, 'category', c.name, 'phone', m.phone),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'address', concat_ws(', ', b.address_line, b.area, b.city),
                                          'digital_address', b.digital_address, 'opening_hours', b.opening_hours,
                                          'latitude', b.latitude, 'longitude', b.longitude) order by b.name)
      from public.merchant_branches b
      where b.merchant_id = m.id and b.is_active
        and (not exists (select 1 from public.offer_branches ob where ob.offer_id = o.id)
             or exists (select 1 from public.offer_branches ob where ob.offer_id = o.id and ob.branch_id = b.id))), '[]'::jsonb),
    'is_favourite', exists (select 1 from public.favourites f where f.student_id = (select auth.uid()) and f.merchant_id = m.id)
  )
  from public.offers o
  join public.merchants m on m.id = o.merchant_id
  join public.merchant_categories c on c.id = m.category_id
  left join public.services s on s.id = o.service_id
  left join public.products p on p.id = o.product_id
  cross join lateral private.price_offer(o.id) pr
  where o.id = p_offer_id and (select auth.uid()) is not null and private.offer_is_live(o.id, (select private.my_institution()));
$$;

-- A live business's public page data. Null if it isn't approved.
create function public.get_merchant_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id, 'slug', m.slug, 'display_name', m.display_name, 'description', m.description, 'phone', m.phone,
    'email', m.email, 'website', m.website, 'category', c.name, 'category_icon', c.icon,
    'is_favourite', exists (select 1 from public.favourites f where f.student_id = (select auth.uid()) and f.merchant_id = m.id),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'address', concat_ws(', ', b.address_line, b.area, b.city),
                                          'digital_address', b.digital_address, 'opening_hours', b.opening_hours, 'phone', b.phone,
                                          'latitude', b.latitude, 'longitude', b.longitude) order by b.name)
      from public.merchant_branches b where b.merchant_id = m.id and b.is_active), '[]'::jsonb)
  )
  from public.merchants m join public.merchant_categories c on c.id = m.category_id
  where m.slug = p_slug and m.status = 'approved' and (select auth.uid()) is not null;
$$;

-- The caller's favourite businesses that are still live.
create function public.list_favourite_merchants()
returns table (merchant_id uuid, slug text, display_name text, category_name text, category_icon text, live_offers bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.slug, m.display_name, c.name, c.icon,
         (select count(*) from public.offers o where o.merchant_id = m.id and private.offer_is_live(o.id, (select private.my_institution())))
  from public.favourites f
  join public.merchants m on m.id = f.merchant_id and m.status = 'approved'
  join public.merchant_categories c on c.id = m.category_id
  where f.student_id = (select auth.uid())
  order by f.created_at desc;
$$;

-- Job: mark offers past their end date as expired (the listing already hides them).
create function public.expire_offers()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.offers set status = 'expired' where status in ('active', 'paused') and ends_at is not null and ends_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Grants ----------------------------------------------------------------------------
revoke execute on function
  public.upsert_catalogue_item(uuid, text, uuid, text, numeric, text, int, text, boolean),
  public.upsert_offer(uuid, uuid, text, uuid, public.discount_type, numeric, text, text, text, timestamptz, timestamptz, int, public.limit_period, int, uuid[], uuid[]),
  public.submit_offer(uuid),
  public.set_offer_state(uuid, text),
  public.moderate_offer(uuid, text, text),
  public.list_offers(text, text, uuid, int, int),
  public.get_offer(uuid),
  public.get_merchant_page(text),
  public.list_favourite_merchants(),
  public.expire_offers()
  from public, anon, authenticated, service_role;
grant execute on function
  public.upsert_catalogue_item(uuid, text, uuid, text, numeric, text, int, text, boolean),
  public.upsert_offer(uuid, uuid, text, uuid, public.discount_type, numeric, text, text, text, timestamptz, timestamptz, int, public.limit_period, int, uuid[], uuid[]),
  public.submit_offer(uuid),
  public.set_offer_state(uuid, text),
  public.moderate_offer(uuid, text, text),
  public.list_offers(text, text, uuid, int, int),
  public.get_offer(uuid),
  public.get_merchant_page(text),
  public.list_favourite_merchants()
  to authenticated;
grant execute on function public.expire_offers() to service_role;

revoke execute on all functions in schema private from public;
