-- Perqly migration 0003: institutions, email domains, campuses, institution reviewers.
-- Spec: docs/PERQLY_DATABASE_ARCHITECTURE.md section 5.2.

create type public.institution_status as enum ('pilot', 'active', 'inactive');
create type public.review_mode as enum ('institution', 'delegated');
create type public.institution_reviewer_role as enum ('reviewer', 'admin');
create type public.membership_status as enum ('invited', 'active', 'removed');

-- Institutions -------------------------------------------------------------
create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,64}$'),
  name text not null check (char_length(btrim(name)) between 3 and 160),
  short_name text not null check (char_length(btrim(short_name)) between 2 and 20),
  status public.institution_status not null default 'inactive',
  review_mode public.review_mode not null default 'institution',
  review_delegated_at date,
  academic_year_end_month smallint check (academic_year_end_month between 1 and 12),
  academic_year_end_day smallint check (academic_year_end_day between 1 and 31),
  logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institutions_year_end_pair check ((academic_year_end_month is null) = (academic_year_end_day is null)),
  constraint institutions_delegation_recorded check (review_mode = 'institution' or review_delegated_at is not null)
);
comment on column public.institutions.review_delegated_at is 'Date of the signed agreement that lets Perqly reviewers decide; required for delegated review.';
create trigger institutions_updated_at before update on public.institutions
  for each row execute function private.set_updated_at();

create table public.institution_email_domains (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  domain extensions.citext not null unique check (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index institution_email_domains_institution on public.institution_email_domains (institution_id);
create trigger institution_email_domains_updated_at before update on public.institution_email_domains
  for each row execute function private.set_updated_at();

create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  digital_address text check (digital_address is null or digital_address ~ '^[A-Z]{2}-?[0-9]{3,4}-?[0-9]{3,4}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campuses_location_pair check ((latitude is null) = (longitude is null)),
  unique (institution_id, name)
);
create index campuses_institution on public.campuses (institution_id);
create trigger campuses_updated_at before update on public.campuses
  for each row execute function private.set_updated_at();

create table public.institution_reviewers (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.institution_reviewer_role not null default 'reviewer',
  status public.membership_status not null default 'active',
  appointed_by uuid references public.profiles (id) on delete set null,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, user_id)
);
create index institution_reviewers_user on public.institution_reviewers (user_id) where status = 'active';
create index institution_reviewers_appointed_by on public.institution_reviewers (appointed_by);
create trigger institution_reviewers_updated_at before update on public.institution_reviewers
  for each row execute function private.set_updated_at();

-- Helpers ------------------------------------------------------------------
-- The caller's active role at an institution, or null.
create function private.institution_role(p_institution_id uuid)
returns public.institution_reviewer_role
language sql
stable
security definer
set search_path = ''
as $$
  select r.role
  from public.institution_reviewers r
  join public.profiles p on p.id = r.user_id
  where r.institution_id = p_institution_id
    and r.user_id = (select auth.uid())
    and r.status = 'active'
    and not p.is_suspended;
$$;

-- True when the institution is shown to the public (sign-up, listings).
create function private.institution_is_listed(p_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.institutions where id = p_institution_id and status in ('pilot', 'active'));
$$;

grant execute on function private.institution_role(uuid), private.institution_is_listed(uuid) to anon, authenticated;

-- RLS and grants -----------------------------------------------------------
alter table public.institutions enable row level security;
alter table public.institution_email_domains enable row level security;
alter table public.campuses enable row level security;
alter table public.institution_reviewers enable row level security;

revoke all on table public.institutions, public.institution_email_domains, public.campuses, public.institution_reviewers
  from anon, authenticated, service_role;
grant select on table public.institutions, public.campuses to anon, authenticated;
grant select on table public.institution_email_domains, public.institution_reviewers to authenticated;

create policy "everyone reads listed institutions" on public.institutions
  for select to anon, authenticated
  using (status in ('pilot', 'active'));
create policy "institution staff read their institution" on public.institutions
  for select to authenticated
  using ((select private.institution_role(id)) is not null);
create policy "platform staff read all institutions" on public.institutions
  for select to authenticated
  using ((select private.is_staff('reviewer')));

create policy "signed-in users read active domains of listed institutions" on public.institution_email_domains
  for select to authenticated
  using (is_active and (select private.institution_is_listed(institution_id)));
create policy "institution staff read their domains" on public.institution_email_domains
  for select to authenticated
  using ((select private.institution_role(institution_id)) is not null);
create policy "platform staff read all domains" on public.institution_email_domains
  for select to authenticated
  using ((select private.is_staff('reviewer')));

create policy "everyone reads active campuses of listed institutions" on public.campuses
  for select to anon, authenticated
  using (is_active and (select private.institution_is_listed(institution_id)));
create policy "platform staff read all campuses" on public.campuses
  for select to authenticated
  using ((select private.is_staff('reviewer')));

create policy "reviewers read their institution's reviewers" on public.institution_reviewers
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.institution_role(institution_id)) is not null);
create policy "platform staff read all reviewers" on public.institution_reviewers
  for select to authenticated
  using ((select private.is_staff('support')));

create policy "institution admins read their institution's audit rows" on public.audit_logs
  for select to authenticated
  using (institution_id is not null and coalesce((select private.institution_role(institution_id)) = 'admin', false) and (select private.has_mfa()));

-- Functions ----------------------------------------------------------------
-- Create or update an institution. Platform admins only, with two-factor.
create function public.upsert_institution(
  p_slug text,
  p_name text,
  p_short_name text,
  p_status public.institution_status,
  p_review_mode public.review_mode default 'institution',
  p_review_delegated_at date default null,
  p_academic_year_end_month smallint default null,
  p_academic_year_end_day smallint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if not (select private.is_staff('admin')) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select id, to_jsonb(i) into v_id, v_before from public.institutions i where slug = lower(p_slug) for update;

  if v_id is null then
    insert into public.institutions (slug, name, short_name, status, review_mode, review_delegated_at, academic_year_end_month, academic_year_end_day)
    values (lower(p_slug), btrim(p_name), btrim(p_short_name), p_status, p_review_mode, p_review_delegated_at, p_academic_year_end_month, p_academic_year_end_day)
    returning id into v_id;
  else
    update public.institutions
    set name = btrim(p_name), short_name = btrim(p_short_name), status = p_status, review_mode = p_review_mode,
        review_delegated_at = p_review_delegated_at,
        academic_year_end_month = p_academic_year_end_month, academic_year_end_day = p_academic_year_end_day
    where id = v_id;
  end if;

  select to_jsonb(i) into v_after from public.institutions i where id = v_id;
  perform private.write_audit(case when v_before is null then 'institution.created' else 'institution.updated' end,
    'platform:admin', 'institution', v_id, v_before, v_after, '{}'::jsonb, v_id);
  return v_id;
end;
$$;

-- Appoint (or re-activate) a reviewer or institution admin.
-- Platform admins can appoint either role; institution admins can appoint reviewers only. Two-factor required.
create function public.appoint_institution_reviewer(
  p_institution_id uuid,
  p_user_id uuid,
  p_role public.institution_reviewer_role default 'reviewer'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_platform_admin boolean := (select private.is_staff('admin'));
  v_is_institution_admin boolean := coalesce((select private.institution_role(p_institution_id)) = 'admin', false) and (select private.has_mfa());
  v_id uuid;
begin
  if not (v_is_platform_admin or (v_is_institution_admin and p_role = 'reviewer')) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.institutions where id = p_institution_id) then
    raise exception 'institution_not_found' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and not is_suspended) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;

  insert into public.institution_reviewers (institution_id, user_id, role, status, appointed_by)
  values (p_institution_id, p_user_id, p_role, 'active', (select auth.uid()))
  on conflict (institution_id, user_id)
    do update set role = excluded.role, status = 'active', appointed_by = excluded.appointed_by, removed_at = null
  returning id into v_id;

  perform private.write_audit('institution.reviewer_appointed',
    case when v_is_platform_admin then 'platform:admin' else 'institution:admin' end,
    'institution_reviewer', v_id, null, jsonb_build_object('user_id', p_user_id, 'role', p_role), '{}'::jsonb, p_institution_id);
  return v_id;
end;
$$;

-- Remove a reviewer. Platform admins can remove anyone; institution admins can remove reviewers (not admins).
create function public.remove_institution_reviewer(p_reviewer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.institution_reviewers;
  v_is_platform_admin boolean := (select private.is_staff('admin'));
begin
  select * into v_row from public.institution_reviewers where id = p_reviewer_id for update;
  if not found then
    raise exception 'reviewer_not_found' using errcode = 'P0001';
  end if;
  if not (v_is_platform_admin
          or (coalesce((select private.institution_role(v_row.institution_id)) = 'admin', false) and (select private.has_mfa())
              and v_row.role = 'reviewer' and v_row.user_id <> (select auth.uid()))) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  update public.institution_reviewers set status = 'removed', removed_at = now() where id = p_reviewer_id;

  perform private.write_audit('institution.reviewer_removed',
    case when v_is_platform_admin then 'platform:admin' else 'institution:admin' end,
    'institution_reviewer', p_reviewer_id, jsonb_build_object('status', v_row.status), jsonb_build_object('status', 'removed'),
    '{}'::jsonb, v_row.institution_id);
end;
$$;

-- Everything the app needs to route a signed-in user, in one call.
create function public.get_my_context()
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
    ), '[]'::jsonb)
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;

revoke execute on function
  public.upsert_institution(text, text, text, public.institution_status, public.review_mode, date, smallint, smallint),
  public.appoint_institution_reviewer(uuid, uuid, public.institution_reviewer_role),
  public.remove_institution_reviewer(uuid),
  public.get_my_context()
  from public, anon;
grant execute on function
  public.upsert_institution(text, text, text, public.institution_status, public.review_mode, date, smallint, smallint),
  public.appoint_institution_reviewer(uuid, uuid, public.institution_reviewer_role),
  public.remove_institution_reviewer(uuid),
  public.get_my_context()
  to authenticated;
