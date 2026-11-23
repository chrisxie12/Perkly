-- Student Resources directory (founder request 2026-11-23).
--
-- An admin-managed list of legitimate free tools, student plans, learning, certifications,
-- internships and other opportunities students in Ghana can use, separate from merchant
-- deals. Perqly is not affiliated with any provider listed here.
--
-- Access:
--   * Signed-in users read PUBLISHED resources only (list_student_resources / get_student_resource).
--   * Perqly admins (two-factor) create, edit, approve, archive and feature resources through the
--     admin_* functions; every change is audit-logged. Nobody writes the table directly.
--   * Eligibility can only be "confirmed" when the date it was checked is recorded; anything else
--     is "needs_verification" and is shown to students as such.

create type public.resource_category as enum (
  'ai_productivity', 'developer_tools', 'learning_certifications', 'career_internships', 'design_creativity',
  'business_entrepreneurship', 'finance_student_services', 'entertainment_lifestyle', 'discounts_trials');
create type public.resource_offer_type as enum (
  'free_forever', 'free_for_students', 'free_trial', 'discounted', 'paid_exam', 'funded', 'loan');
create type public.resource_status as enum ('draft', 'pending', 'published', 'archived');
create type public.resource_eligibility as enum ('confirmed', 'needs_verification');
create type public.resource_availability as enum ('ghana', 'international', 'needs_verification');

-- Each benefit is one short line (a CHECK constraint can't hold a subquery, so it calls this).
create function private.resource_benefits_ok(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select array_position(p, null) is null
     and not exists (select 1 from unnest(p) b where char_length(btrim(b)) not between 2 and 160);
$$;
-- Only the table's own writes (through the admin functions below) need it.
revoke execute on function private.resource_benefits_ok(text[]) from public, anon, authenticated;

create table public.student_resources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 60),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  provider text not null check (char_length(btrim(provider)) between 2 and 80),
  category public.resource_category not null,
  offer_type public.resource_offer_type not null,
  offer_label text check (offer_label is null or char_length(btrim(offer_label)) between 2 and 40),
  summary text not null check (char_length(btrim(summary)) between 10 and 200),
  description text check (description is null or char_length(description) <= 2000),
  benefits text[] not null default '{}' check (cardinality(benefits) <= 8),
  requirements_note text check (requirements_note is null or char_length(requirements_note) <= 600),
  eligibility public.resource_eligibility not null default 'needs_verification',
  availability public.resource_availability not null default 'needs_verification',
  needs_school_email boolean not null default false,
  needs_student_proof boolean not null default false,
  needs_institution_listed boolean not null default false,
  needs_payment_card boolean not null default false,
  min_age smallint check (min_age is null or min_age between 10 and 99),
  official_url text not null check (official_url ~ '^https://[^\s]+$' and char_length(official_url) <= 500),
  source_url text check (source_url is null or (source_url ~ '^https://[^\s]+$' and char_length(source_url) <= 500)),
  checked_on date,
  featured boolean not null default false,
  status public.resource_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_resources_confirmed_needs_date check (eligibility <> 'confirmed' or checked_on is not null),
  constraint student_resources_published_date check (status <> 'published' or published_at is not null),
  constraint student_resources_benefit_length check (private.resource_benefits_ok(benefits))
);
comment on table public.student_resources is 'Admin-managed Student Resources directory. Perqly is not affiliated with the providers.';
create index student_resources_published on public.student_resources (status, category, published_at desc);
create index student_resources_created_by on public.student_resources (created_by);
create index student_resources_updated_by on public.student_resources (updated_by);
create trigger student_resources_updated_at before update on public.student_resources
  for each row execute function private.set_updated_at();

alter table public.student_resources enable row level security;
revoke all on table public.student_resources from anon, authenticated;
-- No direct table access for anyone in the app: reads and writes go through the functions below.

-- Reading (signed-in users, published only) ---------------------------------------------------
create function private.resource_json(r public.student_resources)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'slug', r.slug, 'name', r.name, 'provider', r.provider, 'category', r.category,
    'offer_type', r.offer_type, 'offer_label', r.offer_label, 'summary', r.summary, 'description', r.description,
    'benefits', to_jsonb(r.benefits), 'requirements_note', r.requirements_note, 'eligibility', r.eligibility,
    'availability', r.availability, 'needs_school_email', r.needs_school_email, 'needs_student_proof', r.needs_student_proof,
    'needs_institution_listed', r.needs_institution_listed, 'needs_payment_card', r.needs_payment_card, 'min_age', r.min_age,
    'official_url', r.official_url, 'source_url', r.source_url, 'checked_on', r.checked_on, 'featured', r.featured,
    'status', r.status, 'published_at', r.published_at, 'updated_at', r.updated_at);
$$;
revoke execute on function private.resource_json(public.student_resources) from public, anon, authenticated;

create function public.list_student_resources(
  p_query text default null,
  p_category public.resource_category default null,
  p_filter text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(left(coalesce(p_query, ''), 80)), '');
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_filter is not null and p_filter not in ('confirmed', 'no_school_email', 'ghana') then
    raise exception 'filter_invalid' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(private.resource_json(r) order by r.featured desc, r.published_at desc, r.name)
    from public.student_resources r
    where r.status = 'published'
      and (p_category is null or r.category = p_category)
      and (v_q is null
           or r.name ilike '%' || replace(replace(v_q, '%', ''), '_', '') || '%'
           or r.provider ilike '%' || replace(replace(v_q, '%', ''), '_', '') || '%'
           or r.summary ilike '%' || replace(replace(v_q, '%', ''), '_', '') || '%')
      and (p_filter is null
           or (p_filter = 'confirmed' and r.eligibility = 'confirmed')
           or (p_filter = 'no_school_email' and not r.needs_school_email)
           or (p_filter = 'ghana' and r.availability = 'ghana'))
  ), '[]'::jsonb);
end;
$$;

create function public.get_student_resource(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.resource_json(r)
  from public.student_resources r
  where r.slug = p_slug and r.status = 'published' and (select auth.uid()) is not null;
$$;

revoke execute on function public.list_student_resources(text, public.resource_category, text), public.get_student_resource(text) from public, anon;
grant execute on function public.list_student_resources(text, public.resource_category, text), public.get_student_resource(text) to authenticated;

-- Managing (Perqly admins with two-factor) ------------------------------------------------------
create function private.require_resource_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
end;
$$;
revoke execute on function private.require_resource_admin() from public, anon, authenticated;

create function public.admin_list_student_resources(p_status public.resource_status default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_resource_admin();
  return coalesce((
    select jsonb_agg(private.resource_json(r) order by
      case r.status when 'pending' then 0 when 'draft' then 1 when 'published' then 2 else 3 end, r.updated_at desc)
    from public.student_resources r
    where p_status is null or r.status = p_status
  ), '[]'::jsonb);
end;
$$;

create function public.admin_get_student_resource(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_resource_admin();
  return (select private.resource_json(r) from public.student_resources r where r.id = p_id);
end;
$$;

-- Creates (p_id null) or edits a resource. Editing a published resource keeps it published.
create function public.admin_save_student_resource(
  p_id uuid,
  p_slug text,
  p_name text,
  p_provider text,
  p_category public.resource_category,
  p_offer_type public.resource_offer_type,
  p_offer_label text,
  p_summary text,
  p_description text,
  p_benefits text[],
  p_requirements_note text,
  p_eligibility public.resource_eligibility,
  p_availability public.resource_availability,
  p_needs_school_email boolean,
  p_needs_student_proof boolean,
  p_needs_institution_listed boolean,
  p_needs_payment_card boolean,
  p_min_age smallint,
  p_official_url text,
  p_source_url text,
  p_checked_on date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_before jsonb;
  v_id uuid;
  v_benefits text[] := coalesce((select array_agg(btrim(b)) from unnest(coalesce(p_benefits, '{}')) b where btrim(b) <> ''), '{}');
begin
  perform private.require_resource_admin();
  if p_checked_on is not null and p_checked_on > current_date then raise exception 'checked_on_future' using errcode = 'P0001'; end if;
  if p_eligibility = 'confirmed' and p_checked_on is null then raise exception 'checked_on_required' using errcode = 'P0001'; end if;

  if p_id is null then
    insert into public.student_resources (
      slug, name, provider, category, offer_type, offer_label, summary, description, benefits, requirements_note,
      eligibility, availability, needs_school_email, needs_student_proof, needs_institution_listed, needs_payment_card,
      min_age, official_url, source_url, checked_on, status, created_by, updated_by)
    values (
      lower(btrim(p_slug)), btrim(p_name), btrim(p_provider), p_category, p_offer_type, nullif(btrim(p_offer_label), ''),
      btrim(p_summary), nullif(btrim(p_description), ''), v_benefits, nullif(btrim(p_requirements_note), ''),
      p_eligibility, p_availability, coalesce(p_needs_school_email, false), coalesce(p_needs_student_proof, false),
      coalesce(p_needs_institution_listed, false), coalesce(p_needs_payment_card, false), p_min_age,
      btrim(p_official_url), nullif(btrim(p_source_url), ''), p_checked_on, 'draft', v_uid, v_uid)
    returning id into v_id;
    perform private.write_audit('resource.created', 'platform:admin', 'student_resource', v_id, null,
      jsonb_build_object('slug', lower(btrim(p_slug)), 'status', 'draft'));
  else
    select private.resource_json(r) into v_before from public.student_resources r where r.id = p_id for update;
    if v_before is null then raise exception 'resource_not_found' using errcode = 'P0001'; end if;
    update public.student_resources set
      slug = lower(btrim(p_slug)), name = btrim(p_name), provider = btrim(p_provider), category = p_category,
      offer_type = p_offer_type, offer_label = nullif(btrim(p_offer_label), ''), summary = btrim(p_summary),
      description = nullif(btrim(p_description), ''), benefits = v_benefits, requirements_note = nullif(btrim(p_requirements_note), ''),
      eligibility = p_eligibility, availability = p_availability, needs_school_email = coalesce(p_needs_school_email, false),
      needs_student_proof = coalesce(p_needs_student_proof, false), needs_institution_listed = coalesce(p_needs_institution_listed, false),
      needs_payment_card = coalesce(p_needs_payment_card, false), min_age = p_min_age, official_url = btrim(p_official_url),
      source_url = nullif(btrim(p_source_url), ''), checked_on = p_checked_on, updated_by = v_uid
    where id = p_id;
    v_id := p_id;
    perform private.write_audit('resource.updated', 'platform:admin', 'student_resource', v_id,
      jsonb_build_object('slug', v_before ->> 'slug', 'eligibility', v_before ->> 'eligibility', 'checked_on', v_before ->> 'checked_on'),
      jsonb_build_object('slug', lower(btrim(p_slug)), 'eligibility', p_eligibility, 'checked_on', p_checked_on));
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'slug_taken' using errcode = 'P0001';
end;
$$;

-- Moves a resource through draft -> pending -> published (approve) -> archived, and back.
create function public.admin_set_student_resource_status(p_id uuid, p_status public.resource_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_old public.resource_status;
begin
  perform private.require_resource_admin();
  if p_status is null then raise exception 'status_invalid' using errcode = 'P0001'; end if;
  select status into v_old from public.student_resources where id = p_id for update;
  if v_old is null then raise exception 'resource_not_found' using errcode = 'P0001'; end if;
  if v_old = p_status then return; end if;
  update public.student_resources
     set status = p_status,
         published_at = case when p_status = 'published' then coalesce(published_at, now()) else published_at end,
         featured = case when p_status = 'published' then featured else false end,
         updated_by = (select auth.uid())
   where id = p_id;
  perform private.write_audit(
    case p_status when 'published' then 'resource.published' when 'archived' then 'resource.archived' else 'resource.status_changed' end,
    'platform:admin', 'student_resource', p_id, jsonb_build_object('status', v_old), jsonb_build_object('status', p_status));
end;
$$;

create function public.admin_set_student_resource_featured(p_id uuid, p_featured boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_status public.resource_status;
begin
  perform private.require_resource_admin();
  select status into v_status from public.student_resources where id = p_id for update;
  if v_status is null then raise exception 'resource_not_found' using errcode = 'P0001'; end if;
  if coalesce(p_featured, false) and v_status <> 'published' then raise exception 'not_published' using errcode = 'P0001'; end if;
  update public.student_resources set featured = coalesce(p_featured, false), updated_by = (select auth.uid()) where id = p_id;
  perform private.write_audit('resource.featured', 'platform:admin', 'student_resource', p_id, null,
    jsonb_build_object('featured', coalesce(p_featured, false)));
end;
$$;

revoke execute on function
  public.admin_list_student_resources(public.resource_status),
  public.admin_get_student_resource(uuid),
  public.admin_save_student_resource(uuid, text, text, text, public.resource_category, public.resource_offer_type, text, text, text, text[], text,
    public.resource_eligibility, public.resource_availability, boolean, boolean, boolean, boolean, smallint, text, text, date),
  public.admin_set_student_resource_status(uuid, public.resource_status),
  public.admin_set_student_resource_featured(uuid, boolean)
from public, anon;
grant execute on function
  public.admin_list_student_resources(public.resource_status),
  public.admin_get_student_resource(uuid),
  public.admin_save_student_resource(uuid, text, text, text, public.resource_category, public.resource_offer_type, text, text, text, text[], text,
    public.resource_eligibility, public.resource_availability, boolean, boolean, boolean, boolean, smallint, text, text, date),
  public.admin_set_student_resource_status(uuid, public.resource_status),
  public.admin_set_student_resource_featured(uuid, boolean)
to authenticated;
