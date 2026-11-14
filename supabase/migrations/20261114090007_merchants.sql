-- Perqly migration 0007: merchants (roadmap step 1.4).
--
-- Businesses register themselves (the person who registers becomes the owner),
-- add branches and a team, and submit for review. A Perqly admin approves,
-- rejects or suspends. Only approved merchants are visible to students.
--
-- Team members must already have a Perqly account; they are added by email,
-- like institution reviewers. Owners act with two-factor (docs/PERQLY_USER_FLOWS.md),
-- managers manage the business, cashiers confirm discounts at assigned branches only.

create type public.merchant_status as enum ('draft', 'pending_review', 'approved', 'rejected', 'suspended');
create type public.merchant_user_role as enum ('owner', 'manager', 'cashier');

-- Categories ------------------------------------------------------------------
create table public.merchant_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  icon text not null default 'store' check (icon ~ '^[a-z0-9-]{2,40}$'),
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.merchant_categories (slug, name, icon, sort_order) values
  ('food', 'Food and drink', 'utensils', 10),
  ('beauty', 'Hair and beauty', 'scissors', 20),
  ('printing', 'Printing and stationery', 'printer', 30),
  ('tech', 'Phones and tech', 'smartphone', 40),
  ('fashion', 'Fashion', 'shirt', 50),
  ('health', 'Health and pharmacy', 'heart-pulse', 60),
  ('fitness', 'Fitness and sport', 'dumbbell', 70),
  ('services', 'Services', 'wrench', 80)
on conflict (slug) do nothing;

-- Merchants -------------------------------------------------------------------
create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 80),
  legal_name text check (legal_name is null or char_length(btrim(legal_name)) between 2 and 160),
  category_id uuid not null references public.merchant_categories (id),
  description text check (description is null or char_length(description) <= 2000),
  phone text check (phone is null or phone ~ '^\+?[0-9 ]{9,16}$'),
  email extensions.citext check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  website text check (website is null or website ~ '^https://[^\s]{4,200}$'),
  status public.merchant_status not null default 'draft',
  status_reason text check (status_reason is null or char_length(status_reason) <= 500),
  submitted_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_by uuid not null references public.profiles (id),
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(display_name, '')), 'A') || setweight(to_tsvector('simple', coalesce(description, '')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index merchants_status on public.merchants (status);
create index merchants_category on public.merchants (category_id);
create index merchants_search on public.merchants using gin (search_vector);
create index merchants_approved_by on public.merchants (approved_by);
create index merchants_created_by on public.merchants (created_by);
create trigger merchants_updated_at before update on public.merchants
  for each row execute function private.set_updated_at();

create table public.merchant_users (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.merchant_user_role not null,
  status public.membership_status not null default 'active',
  invited_by uuid references public.profiles (id) on delete set null,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, user_id)
);
create unique index merchant_users_one_owner on public.merchant_users (merchant_id) where role = 'owner' and status = 'active';
create index merchant_users_user on public.merchant_users (user_id) where status = 'active';
create index merchant_users_invited_by on public.merchant_users (invited_by);
create trigger merchant_users_updated_at before update on public.merchant_users
  for each row execute function private.set_updated_at();

create table public.merchant_branches (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  address_line text check (address_line is null or char_length(address_line) <= 200),
  area text check (area is null or char_length(area) <= 80),
  city text not null default 'Accra' check (char_length(btrim(city)) between 2 and 80),
  digital_address text check (digital_address is null or digital_address ~ '^[A-Z]{2}-?[0-9]{3,4}-?[0-9]{3,4}$'),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  phone text check (phone is null or phone ~ '^\+?[0-9 ]{9,16}$'),
  opening_hours text check (opening_hours is null or char_length(opening_hours) <= 200),
  max_distance_m int not null default 300 check (max_distance_m between 50 and 5000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_branches_location_pair check ((latitude is null) = (longitude is null)),
  unique (merchant_id, name)
);
create index merchant_branches_merchant on public.merchant_branches (merchant_id);
create trigger merchant_branches_updated_at before update on public.merchant_branches
  for each row execute function private.set_updated_at();

create table public.merchant_user_branches (
  merchant_user_id uuid not null references public.merchant_users (id) on delete cascade,
  branch_id uuid not null references public.merchant_branches (id) on delete cascade,
  primary key (merchant_user_id, branch_id)
);
create index merchant_user_branches_branch on public.merchant_user_branches (branch_id);

-- Helpers -----------------------------------------------------------------------
create function private.merchant_role(p_merchant_id uuid)
returns public.merchant_user_role
language sql
stable
security definer
set search_path = ''
as $$
  select mu.role
  from public.merchant_users mu
  join public.profiles p on p.id = mu.user_id
  where mu.merchant_id = p_merchant_id and mu.user_id = (select auth.uid()) and mu.status = 'active' and not p.is_suspended;
$$;

-- Owners (with two-factor) and managers run the business.
create function private.can_manage_merchant(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case (select private.merchant_role(p_merchant_id))
           when 'owner' then (select private.has_mfa())
           when 'manager' then true
           else false
         end;
$$;

-- Who can confirm discounts at a branch: managers and owners of its merchant,
-- or a cashier assigned to that branch.
create function private.can_operate_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.merchant_branches b
    where b.id = p_branch_id
      and ((select private.can_manage_merchant(b.merchant_id))
           or exists (
             select 1 from public.merchant_users mu
             join public.merchant_user_branches mub on mub.merchant_user_id = mu.id
             join public.profiles p on p.id = mu.user_id
             where mu.merchant_id = b.merchant_id and mu.user_id = (select auth.uid()) and mu.status = 'active'
               and mu.role = 'cashier' and mub.branch_id = b.id and not p.is_suspended)));
$$;

create function private.merchant_is_listed(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.merchants where id = p_merchant_id and status = 'approved');
$$;

grant execute on function private.merchant_role(uuid), private.can_manage_merchant(uuid), private.can_operate_branch(uuid),
  private.merchant_is_listed(uuid) to authenticated;

-- Row-level security ------------------------------------------------------------
alter table public.merchant_categories enable row level security;
alter table public.merchants enable row level security;
alter table public.merchant_users enable row level security;
alter table public.merchant_branches enable row level security;
alter table public.merchant_user_branches enable row level security;

revoke all on table public.merchant_categories, public.merchants, public.merchant_users, public.merchant_branches,
  public.merchant_user_branches from anon, authenticated, service_role;
grant select on table public.merchant_categories to anon, authenticated;
grant select on table public.merchants, public.merchant_users, public.merchant_branches, public.merchant_user_branches to authenticated;

create policy "everyone reads active categories" on public.merchant_categories
  for select to anon, authenticated using (is_active);

create policy "signed-in users read approved merchants" on public.merchants
  for select to authenticated using (status = 'approved');
create policy "merchant users read their merchant" on public.merchants
  for select to authenticated using ((select private.merchant_role(id)) is not null);
create policy "support reads all merchants" on public.merchants
  for select to authenticated using ((select private.is_staff('support')));

create policy "merchant users read their team" on public.merchant_users
  for select to authenticated using (user_id = (select auth.uid()) or (select private.merchant_role(merchant_id)) is not null);
create policy "support reads all merchant users" on public.merchant_users
  for select to authenticated using ((select private.is_staff('support')));

create policy "signed-in users read active branches of approved merchants" on public.merchant_branches
  for select to authenticated using (is_active and (select private.merchant_is_listed(merchant_id)));
create policy "merchant users read their branches" on public.merchant_branches
  for select to authenticated using ((select private.merchant_role(merchant_id)) is not null);
create policy "support reads all branches" on public.merchant_branches
  for select to authenticated using ((select private.is_staff('support')));

create policy "merchant users read branch assignments" on public.merchant_user_branches
  for select to authenticated using (exists (
    select 1 from public.merchant_users mu where mu.id = merchant_user_id and (select private.merchant_role(mu.merchant_id)) is not null));
create policy "support reads branch assignments" on public.merchant_user_branches
  for select to authenticated using ((select private.is_staff('support')));

-- Functions -----------------------------------------------------------------------
-- A short URL slug from the name plus 4 random characters.
create function private.make_merchant_slug(p_name text)
returns text
language sql
volatile
set search_path = ''
as $$
  select left(trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g')), 60)
         || '-' || substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 4);
$$;

-- The caller registers a business and becomes its owner.
create function public.register_merchant(
  p_display_name text,
  p_category_id uuid,
  p_phone text default null,
  p_email text default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_slug text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if (select private.is_suspended()) then raise exception 'account_suspended' using errcode = 'P0001'; end if;
  if (select count(*) from public.merchant_users where user_id = v_uid and role = 'owner' and status = 'active') >= 3 then
    raise exception 'too_many_merchants' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.merchant_categories where id = p_category_id and is_active) then
    raise exception 'category_invalid' using errcode = 'P0001';
  end if;
  perform private.check_rate_limit('merchant.register', 5, interval '1 day');

  v_slug := private.make_merchant_slug(coalesce(p_display_name, ''));
  if v_slug !~ '^[a-z0-9-]{3,80}$' or v_slug like '-%' then v_slug := 'business' || v_slug; end if;

  insert into public.merchants (slug, display_name, category_id, phone, email, description, created_by)
  values (v_slug, btrim(p_display_name), p_category_id, nullif(btrim(coalesce(p_phone, '')), ''),
          nullif(btrim(coalesce(p_email, '')), ''), nullif(btrim(coalesce(p_description, '')), ''), v_uid)
  returning id into v_id;
  insert into public.merchant_users (merchant_id, user_id, role, invited_by) values (v_id, v_uid, 'owner', v_uid);

  perform private.write_audit('merchant.registered', 'merchant:owner', 'merchant', v_id, null,
    jsonb_build_object('display_name', btrim(p_display_name)), '{}'::jsonb, null, v_id);
  return v_id;
end;
$$;

create function public.update_merchant_profile(
  p_merchant_id uuid,
  p_display_name text,
  p_category_id uuid,
  p_legal_name text default null,
  p_description text default null,
  p_phone text default null,
  p_email text default null,
  p_website text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.merchants;
  v_after public.merchants;
begin
  if not (select private.can_manage_merchant(p_merchant_id)) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into v_before from public.merchants where id = p_merchant_id for update;
  if v_before.status = 'suspended' then raise exception 'merchant_suspended' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.merchant_categories where id = p_category_id and is_active) then
    raise exception 'category_invalid' using errcode = 'P0001';
  end if;

  update public.merchants
  set display_name = btrim(p_display_name), category_id = p_category_id,
      legal_name = nullif(btrim(coalesce(p_legal_name, '')), ''), description = nullif(btrim(coalesce(p_description, '')), ''),
      phone = nullif(btrim(coalesce(p_phone, '')), ''), email = nullif(btrim(coalesce(p_email, '')), ''),
      website = nullif(btrim(coalesce(p_website, '')), '')
  where id = p_merchant_id
  returning * into v_after;

  perform private.write_audit('merchant.profile_updated',
    case (select private.merchant_role(p_merchant_id)) when 'owner' then 'merchant:owner' else 'merchant:manager' end,
    'merchant', p_merchant_id,
    jsonb_build_object('display_name', v_before.display_name, 'description', v_before.description, 'phone', v_before.phone),
    jsonb_build_object('display_name', v_after.display_name, 'description', v_after.description, 'phone', v_after.phone),
    jsonb_build_object('status', v_after.status), null, p_merchant_id);
end;
$$;

-- Create (p_branch_id null) or update a branch.
create function public.upsert_merchant_branch(
  p_merchant_id uuid,
  p_branch_id uuid,
  p_name text,
  p_address_line text default null,
  p_area text default null,
  p_city text default 'Accra',
  p_digital_address text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_phone text default null,
  p_opening_hours text default null,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_address text := nullif(upper(btrim(coalesce(p_digital_address, ''))), '');
begin
  if not (select private.can_manage_merchant(p_merchant_id)) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if exists (select 1 from public.merchants where id = p_merchant_id and status = 'suspended') then
    raise exception 'merchant_suspended' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 120 then raise exception 'branch_name_invalid' using errcode = 'P0001'; end if;
  if v_address is not null and v_address !~ '^[A-Z]{2}-?[0-9]{3,4}-?[0-9]{3,4}$' then
    raise exception 'digital_address_invalid' using errcode = 'P0001';
  end if;
  if (p_latitude is null) <> (p_longitude is null) or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'location_invalid' using errcode = 'P0001';
  end if;

  begin
    if p_branch_id is null then
      insert into public.merchant_branches (merchant_id, name, address_line, area, city, digital_address, latitude, longitude, phone,
                                            opening_hours, is_active)
      values (p_merchant_id, btrim(p_name), nullif(btrim(coalesce(p_address_line, '')), ''), nullif(btrim(coalesce(p_area, '')), ''),
              coalesce(nullif(btrim(coalesce(p_city, '')), ''), 'Accra'), v_address, p_latitude, p_longitude,
              nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_opening_hours, '')), ''), coalesce(p_is_active, true))
      returning id into v_id;
    else
      update public.merchant_branches
      set name = btrim(p_name), address_line = nullif(btrim(coalesce(p_address_line, '')), ''), area = nullif(btrim(coalesce(p_area, '')), ''),
          city = coalesce(nullif(btrim(coalesce(p_city, '')), ''), 'Accra'), digital_address = v_address, latitude = p_latitude,
          longitude = p_longitude, phone = nullif(btrim(coalesce(p_phone, '')), ''),
          opening_hours = nullif(btrim(coalesce(p_opening_hours, '')), ''), is_active = coalesce(p_is_active, true)
      where id = p_branch_id and merchant_id = p_merchant_id
      returning id into v_id;
      if v_id is null then raise exception 'branch_not_found' using errcode = 'P0001'; end if;
    end if;
  exception
    when unique_violation then raise exception 'branch_name_in_use' using errcode = 'P0001';
    when check_violation then raise exception 'branch_invalid' using errcode = 'P0001';
  end;

  perform private.write_audit(case when p_branch_id is null then 'merchant.branch_added' else 'merchant.branch_updated' end,
    'merchant:manager', 'merchant_branch', v_id, null, jsonb_build_object('name', btrim(p_name), 'is_active', coalesce(p_is_active, true)),
    '{}'::jsonb, null, p_merchant_id);
  return v_id;
end;
$$;

-- Owner sends the business for Perqly review. Needs at least one active branch.
create function public.submit_merchant_for_review(p_merchant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.merchant_status;
begin
  if not (coalesce((select private.merchant_role(p_merchant_id)) = 'owner', false) and (select private.has_mfa())) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  select status into v_status from public.merchants where id = p_merchant_id for update;
  if v_status not in ('draft', 'rejected') then raise exception 'merchant_not_editable' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.merchant_branches where merchant_id = p_merchant_id and is_active) then
    raise exception 'branch_required' using errcode = 'P0001';
  end if;
  update public.merchants set status = 'pending_review', status_reason = null, submitted_at = now() where id = p_merchant_id;
  perform private.write_audit('merchant.submitted', 'merchant:owner', 'merchant', p_merchant_id,
    jsonb_build_object('status', v_status), jsonb_build_object('status', 'pending_review'), '{}'::jsonb, null, p_merchant_id);
end;
$$;

-- Perqly admin decision: approve, reject (with reason), suspend (with reason) or reinstate.
create function public.decide_merchant(p_merchant_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.merchant_status;
  v_new public.merchant_status;
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select status into v_status from public.merchants where id = p_merchant_id for update;
  if v_status is null then raise exception 'merchant_not_found' using errcode = 'P0001'; end if;
  if p_decision in ('reject', 'suspend') and char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  v_new := case
    when p_decision = 'approve' and v_status = 'pending_review' then 'approved'
    when p_decision = 'reject' and v_status = 'pending_review' then 'rejected'
    when p_decision = 'suspend' and v_status = 'approved' then 'suspended'
    when p_decision = 'reinstate' and v_status = 'suspended' then 'approved'
  end::public.merchant_status;
  if v_new is null then raise exception 'invalid_transition' using errcode = 'P0001'; end if;

  update public.merchants
  set status = v_new,
      status_reason = case when p_decision in ('reject', 'suspend') then btrim(p_reason) else null end,
      approved_by = case when p_decision = 'approve' then (select auth.uid()) else approved_by end,
      approved_at = case when p_decision = 'approve' then now() else approved_at end
  where id = p_merchant_id;

  perform private.write_audit('merchant.' || case p_decision when 'approve' then 'approved' when 'reject' then 'rejected'
                                                      when 'suspend' then 'suspended' else 'reinstated' end,
    'platform:admin', 'merchant', p_merchant_id, jsonb_build_object('status', v_status),
    jsonb_build_object('status', v_new, 'reason', nullif(btrim(coalesce(p_reason, '')), '')), '{}'::jsonb, null, p_merchant_id);
end;
$$;

-- Add (or re-activate) a manager or cashier by the email they use for Perqly.
-- Owners add managers and cashiers; managers add cashiers. Permission is checked before the lookup.
create function public.add_merchant_user(p_merchant_id uuid, p_email text, p_role public.merchant_user_role, p_branch_ids uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller public.merchant_user_role := (select private.merchant_role(p_merchant_id));
  v_user uuid;
  v_id uuid;
begin
  if not (select private.can_manage_merchant(p_merchant_id))
     or p_role = 'owner'
     or (v_caller = 'manager' and p_role <> 'cashier') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_role = 'cashier' and coalesce(cardinality(p_branch_ids), 0) = 0 then raise exception 'branch_required' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(coalesce(p_branch_ids, '{}')) b(id)
             where not exists (select 1 from public.merchant_branches where id = b.id and merchant_id = p_merchant_id)) then
    raise exception 'branch_not_found' using errcode = 'P0001';
  end if;
  perform private.check_rate_limit('merchant.add_user', 30, interval '1 hour');

  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, ''))) limit 1;
  if v_user is null or not exists (select 1 from public.profiles where id = v_user and not is_suspended) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.merchant_users where merchant_id = p_merchant_id and user_id = v_user and role = 'owner' and status = 'active') then
    raise exception 'already_owner' using errcode = 'P0001';
  end if;

  insert into public.merchant_users (merchant_id, user_id, role, status, invited_by)
  values (p_merchant_id, v_user, p_role, 'active', (select auth.uid()))
  on conflict (merchant_id, user_id) do update set role = excluded.role, status = 'active', invited_by = excluded.invited_by, removed_at = null
  returning id into v_id;

  delete from public.merchant_user_branches where merchant_user_id = v_id;
  if p_role = 'cashier' then
    insert into public.merchant_user_branches (merchant_user_id, branch_id) select v_id, b from unnest(p_branch_ids) b;
  end if;

  perform private.write_audit('merchant.user_added', 'merchant:' || v_caller::text, 'merchant_user', v_id, null,
    jsonb_build_object('user_id', v_user, 'role', p_role, 'branches', to_jsonb(coalesce(p_branch_ids, '{}'))), '{}'::jsonb, null, p_merchant_id);
  return v_id;
end;
$$;

create function public.remove_merchant_user(p_merchant_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.merchant_users;
  v_caller public.merchant_user_role;
begin
  select * into v_row from public.merchant_users where id = p_merchant_user_id for update;
  if v_row.id is null then raise exception 'member_not_found' using errcode = 'P0001'; end if;
  v_caller := (select private.merchant_role(v_row.merchant_id));
  if not (select private.can_manage_merchant(v_row.merchant_id)) or v_row.role = 'owner'
     or (v_caller = 'manager' and v_row.role <> 'cashier') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  update public.merchant_users set status = 'removed', removed_at = now() where id = p_merchant_user_id;
  delete from public.merchant_user_branches where merchant_user_id = p_merchant_user_id;
  perform private.write_audit('merchant.user_removed', 'merchant:' || v_caller::text, 'merchant_user', p_merchant_user_id,
    jsonb_build_object('role', v_row.role), jsonb_build_object('status', 'removed'), '{}'::jsonb, null, v_row.merchant_id);
end;
$$;

-- The team with names, for owners, managers and Perqly support.
create function public.get_merchant_team(p_merchant_id uuid)
returns table (member_id uuid, user_id uuid, full_name text, role public.merchant_user_role, branch_ids uuid[], created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not ((select private.can_manage_merchant(p_merchant_id)) or (select private.is_staff('support'))) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  return query
    select mu.id, mu.user_id, coalesce(p.full_name, 'Name not given'), mu.role,
           coalesce(array(select mub.branch_id from public.merchant_user_branches mub where mub.merchant_user_id = mu.id), '{}'),
           mu.created_at
    from public.merchant_users mu join public.profiles p on p.id = mu.user_id
    where mu.merchant_id = p_merchant_id and mu.status = 'active'
    order by mu.role, p.full_name;
end;
$$;

-- Routing context: add the caller's merchant memberships.
create or replace function public.get_my_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', p.id,
    'full_name', p.full_name,
    'first_name', p.first_name,
    'signup_intent', p.signup_intent,
    'is_suspended', p.is_suspended,
    'platform_role', (select s.role from public.platform_staff s where s.user_id = p.id),
    'aal', coalesce((select auth.jwt()) ->> 'aal', 'aal1'),
    'institution_roles', coalesce((
      select jsonb_agg(jsonb_build_object('institution_id', r.institution_id, 'short_name', i.short_name, 'role', r.role) order by i.short_name)
      from public.institution_reviewers r
      join public.institutions i on i.id = r.institution_id
      where r.user_id = p.id and r.status = 'active'
    ), '[]'::jsonb),
    'delegated_institutions', coalesce((
      select jsonb_agg(jsonb_build_object('institution_id', i.id, 'short_name', i.short_name) order by i.short_name)
      from public.institutions i
      where i.review_mode = 'delegated'
        and exists (select 1 from public.platform_staff s where s.user_id = p.id)
    ), '[]'::jsonb),
    'merchant_roles', coalesce((
      select jsonb_agg(jsonb_build_object('merchant_id', m.id, 'display_name', m.display_name, 'role', mu.role, 'status', m.status)
                       order by m.display_name)
      from public.merchant_users mu
      join public.merchants m on m.id = mu.merchant_id
      where mu.user_id = p.id and mu.status = 'active'
    ), '[]'::jsonb)
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;

-- Grants --------------------------------------------------------------------------
revoke execute on function
  public.register_merchant(text, uuid, text, text, text),
  public.update_merchant_profile(uuid, text, uuid, text, text, text, text, text),
  public.upsert_merchant_branch(uuid, uuid, text, text, text, text, text, double precision, double precision, text, text, boolean),
  public.submit_merchant_for_review(uuid),
  public.decide_merchant(uuid, text, text),
  public.add_merchant_user(uuid, text, public.merchant_user_role, uuid[]),
  public.remove_merchant_user(uuid),
  public.get_merchant_team(uuid)
  from public, anon, service_role;
grant execute on function
  public.register_merchant(text, uuid, text, text, text),
  public.update_merchant_profile(uuid, text, uuid, text, text, text, text, text),
  public.upsert_merchant_branch(uuid, uuid, text, text, text, text, text, double precision, double precision, text, text, boolean),
  public.submit_merchant_for_review(uuid),
  public.decide_merchant(uuid, text, text),
  public.add_merchant_user(uuid, text, public.merchant_user_role, uuid[]),
  public.remove_merchant_user(uuid),
  public.get_merchant_team(uuid)
  to authenticated;

revoke execute on all functions in schema private from public;
revoke execute on function private.make_merchant_slug(text) from anon, authenticated, service_role;
