-- Perqly migration 0001: extensions, private schema, shared helpers, audit log,
-- rate limiting and app settings.
-- Spec: docs/PERQLY_DATABASE_ARCHITECTURE.md sections 2, 4 and 5.10.

-- Extensions --------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Private schema: helper functions and internal tables. Not exposed by the
-- Data API. API roles get USAGE so RLS policies can call the helpers, and
-- EXECUTE only on the helpers that policies need.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;
alter default privileges in schema private revoke execute on functions from public;

-- Functions created in public are not callable by the API roles unless a
-- migration grants it explicitly.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- updated_at trigger -------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- App settings (private) ---------------------------------------------------
create table private.app_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_.]{2,80}$'),
  value jsonb not null,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger app_settings_updated_at before update on private.app_settings
  for each row execute function private.set_updated_at();

create function private.setting_int(p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::int from private.app_settings where key = p_key), p_default);
$$;

insert into private.app_settings (key, value) values
  ('redemption.select_window_seconds', '300'),
  ('redemption.confirm_window_seconds', '600'),
  ('redemption.max_sessions_per_hour', '10'),
  ('qr.max_scans_per_minute', '6'),
  ('qr.max_short_code_attempts_per_10_min', '5'),
  ('booking.max_open_per_student', '5'),
  ('verification.otp_max_per_hour', '3');

-- Rate limiting (private) --------------------------------------------------
create table private.rate_limit_events (
  id bigint generated always as identity primary key,
  subject text not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_lookup on private.rate_limit_events (subject, action, created_at);

-- Raises 'rate_limited' when the subject (default: the caller) has already done
-- `p_action` p_max times inside p_window; otherwise records the attempt.
create function private.check_rate_limit(p_action text, p_max int, p_window interval, p_subject text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject text := coalesce(p_subject, (select auth.uid())::text, 'anonymous');
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_subject || ':' || p_action, 0));
  select count(*) into v_count
  from private.rate_limit_events
  where subject = v_subject and action = p_action and created_at > now() - p_window;
  if v_count >= p_max then
    raise exception 'rate_limited' using errcode = 'P0001', hint = 'Too many attempts. Try again later.';
  end if;
  insert into private.rate_limit_events (subject, action) values (v_subject, p_action);
end;
$$;

-- Audit log ----------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  actor_context text not null,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text not null,
  entity_id uuid,
  institution_id uuid,
  merchant_id uuid,
  before jsonb,
  after jsonb,
  metadata jsonb not null default '{}'::jsonb
);
create index audit_logs_entity on public.audit_logs (entity_type, entity_id, occurred_at);
create index audit_logs_actor on public.audit_logs (actor_id, occurred_at);
create index audit_logs_institution on public.audit_logs (institution_id, occurred_at) where institution_id is not null;
create index audit_logs_merchant on public.audit_logs (merchant_id, occurred_at) where merchant_id is not null;

alter table public.audit_logs enable row level security;
revoke all on table public.audit_logs from anon, authenticated, service_role;
-- Read policies are added with the roles that may read (identity, institutions, merchants).

create function private.audit_logs_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function private.audit_logs_append_only();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function private.audit_logs_append_only();

-- The only way rows enter audit_logs.
create function private.write_audit(
  p_action text,
  p_actor_context text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb default null,
  p_after jsonb default null,
  p_metadata jsonb default '{}'::jsonb,
  p_institution_id uuid default null,
  p_merchant_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, actor_context, action, entity_type, entity_id, institution_id, merchant_id, before, after, metadata)
  values ((select auth.uid()), p_actor_context, p_action, p_entity_type, p_entity_id, p_institution_id, p_merchant_id, p_before, p_after, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- Lock down: none of these internal functions is callable by API roles.
revoke execute on all functions in schema private from public, anon, authenticated, service_role;
