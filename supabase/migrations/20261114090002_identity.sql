-- Perqly migration 0002: profiles, platform staff and role helpers.
-- Spec: docs/PERQLY_DATABASE_ARCHITECTURE.md sections 4 and 5.1.

create type public.platform_role as enum ('reviewer', 'support', 'admin', 'super_admin');

-- Profiles -----------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (full_name is null or char_length(btrim(full_name)) between 2 and 120),
  first_name text check (first_name is null or char_length(btrim(first_name)) between 1 and 60),
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 300),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  signup_intent text check (signup_intent in ('student', 'merchant')),
  is_suspended boolean not null default false,
  suspended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.profiles.signup_intent is 'What the user said they are at sign-up; used only to route the first sign-in.';
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated, service_role;
grant select on table public.profiles to authenticated;
-- Users may change only these columns of their own row; everything else goes through functions.
grant update (full_name, first_name, avatar_path) on table public.profiles to authenticated;

-- Create a profile for every new auth user.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text := nullif(btrim(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120)), '');
  v_intent text := new.raw_user_meta_data ->> 'signup_intent';
begin
  if v_full_name is not null and char_length(v_full_name) < 2 then
    v_full_name := null;
  end if;
  insert into public.profiles (id, full_name, first_name, signup_intent)
  values (
    new.id,
    v_full_name,
    nullif(left(split_part(coalesce(v_full_name, ''), ' ', 1), 60), ''),
    case when v_intent in ('student', 'merchant') then v_intent end
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Platform staff -----------------------------------------------------------
create table public.platform_staff (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role public.platform_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index platform_staff_granted_by on public.platform_staff (granted_by);
create trigger platform_staff_updated_at before update on public.platform_staff
  for each row execute function private.set_updated_at();

alter table public.platform_staff enable row level security;
revoke all on table public.platform_staff from anon, authenticated, service_role;
grant select on table public.platform_staff to authenticated;

-- Role helpers -------------------------------------------------------------
-- True when the current session has passed two-factor authentication.
create function private.has_mfa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2';
$$;

-- The caller's platform role, whether or not they passed two-factor.
create function private.platform_role()
returns public.platform_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.platform_staff where user_id = (select auth.uid());
$$;

-- True when the caller is staff at or above p_min AND has passed two-factor.
-- Staff privileges never apply to an aal1 session.
create function private.is_staff(p_min public.platform_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.platform_role()) >= p_min, false) and (select private.has_mfa());
$$;

-- True when the caller's profile is suspended.
create function private.is_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_suspended from public.profiles where id = (select auth.uid())), false);
$$;

grant execute on function private.has_mfa(), private.platform_role(), private.is_staff(public.platform_role), private.is_suspended()
  to authenticated;

-- Policies -----------------------------------------------------------------
create policy "users read their own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "support reads all profiles" on public.profiles
  for select to authenticated
  using ((select private.is_staff('support')));

create policy "users update their own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and not is_suspended)
  with check (id = (select auth.uid()));

create policy "staff read their own staff row" on public.platform_staff
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "admins read all staff rows" on public.platform_staff
  for select to authenticated
  using ((select private.is_staff('admin')));

create policy "admins read the audit log" on public.audit_logs
  for select to authenticated
  using ((select private.is_staff('admin')));
grant select on table public.audit_logs to authenticated;

-- Functions ----------------------------------------------------------------
-- Grant, change or remove (p_role null) a platform role. Super admins only, with two-factor.
create function public.set_platform_role(p_user_id uuid, p_role public.platform_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.platform_role;
begin
  if not (select private.is_staff('super_admin')) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'cannot_change_own_role' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;

  select role into v_before from public.platform_staff where user_id = p_user_id;

  if p_role is null then
    delete from public.platform_staff where user_id = p_user_id;
  else
    insert into public.platform_staff (user_id, role, granted_by)
    values (p_user_id, p_role, (select auth.uid()))
    on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by;
  end if;

  perform private.write_audit('platform.role_changed', 'platform:super_admin', 'profile', p_user_id,
    jsonb_build_object('role', v_before), jsonb_build_object('role', p_role));
end;
$$;

-- Suspend or restore an account. Admins only, with two-factor.
create function public.set_account_suspension(p_user_id uuid, p_suspended boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before boolean;
begin
  if not (select private.is_staff('admin')) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'cannot_suspend_self' using errcode = 'P0001';
  end if;
  if p_suspended and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  select is_suspended into v_before from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;

  update public.profiles
  set is_suspended = p_suspended,
      suspended_reason = case when p_suspended then btrim(p_reason) end
  where id = p_user_id;

  perform private.write_audit(case when p_suspended then 'account.suspended' else 'account.restored' end,
    'platform:admin', 'profile', p_user_id,
    jsonb_build_object('is_suspended', v_before), jsonb_build_object('is_suspended', p_suspended),
    jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

revoke execute on function public.set_platform_role(uuid, public.platform_role), public.set_account_suspension(uuid, boolean, text) from public, anon;
grant execute on function public.set_platform_role(uuid, public.platform_role), public.set_account_suspension(uuid, boolean, text) to authenticated;
revoke execute on function private.handle_new_user() from public, anon, authenticated, service_role;
