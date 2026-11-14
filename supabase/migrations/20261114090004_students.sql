-- Perqly migration 0004: student profiles, optional institutional email,
-- verification applications, reviewer decisions, private documents and the
-- verified-student gate used by booking and redemption.
-- Spec: docs/PERQLY_DATABASE_ARCHITECTURE.md section 5.3; docs/PERQLY_PRODUCT_SPECIFICATION.md section 2.
--
-- Rules enforced here:
-- * Sign-in stays on the personal email in auth.users. The institutional email is
--   optional, stored separately, and never grants verification on its own.
-- * Verification needs an application (institution, student ID number, ID card
--   photo, selfie) approved by an authorised reviewer of that institution.
-- * Students can't change their own verification state or review their own application.

create type public.student_verification_state as enum ('unverified', 'pending', 'verified', 'expired', 'suspended');
create type public.verification_request_status as enum ('draft', 'submitted', 'approved', 'rejected', 'resubmission_requested', 'withdrawn');
create type public.decider_type as enum ('institution', 'perqly');

-- Student profiles ---------------------------------------------------------
create table public.student_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  institution_id uuid not null references public.institutions (id),
  campus_id uuid references public.campuses (id),
  programme text check (programme is null or char_length(btrim(programme)) between 2 and 120),
  level text check (level is null or char_length(btrim(level)) between 1 and 40),
  grad_year smallint check (grad_year is null or grad_year between 2000 and 2100),
  institutional_email extensions.citext check (
    institutional_email is null
    or (char_length(institutional_email) <= 254 and institutional_email ~ '^[^@\s]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')
  ),
  institutional_email_verified_at timestamptz,
  student_id_hash text,
  verification_status public.student_verification_state not null default 'unverified',
  verified_at timestamptz,
  verified_until timestamptz,
  current_verification_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_profiles_institutional_email_confirmation check (institutional_email_verified_at is null or institutional_email is not null),
  constraint student_profiles_verified_dates check (verification_status <> 'verified' or (verified_at is not null and verified_until is not null))
);
comment on column public.student_profiles.institutional_email is 'Optional. Separate from the sign-in email in auth.users. Never grants verification by itself.';
comment on column public.student_profiles.student_id_hash is 'HMAC of the institution and normalised student ID number; set on approval. The number itself is never stored here.';
create unique index student_profiles_one_account_per_student_id on public.student_profiles (institution_id, student_id_hash) where student_id_hash is not null;
create index student_profiles_institution_status on public.student_profiles (institution_id, verification_status);
create index student_profiles_campus on public.student_profiles (campus_id);
create trigger student_profiles_updated_at before update on public.student_profiles
  for each row execute function private.set_updated_at();

-- Codes that confirm a student controls their institutional email (private).
create table private.institutional_email_codes (
  student_id uuid primary key references public.student_profiles (user_id) on delete cascade,
  email extensions.citext not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0,
  created_at timestamptz not null default now()
);

-- Verification applications -------------------------------------------------
create table public.student_verifications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles (user_id) on delete cascade,
  institution_id uuid not null references public.institutions (id),
  student_id_number text check (student_id_number is null or student_id_number ~ '^[A-Za-z0-9/ .-]{3,40}$'),
  programme text,
  level text,
  grad_year smallint,
  institutional_email extensions.citext,
  institutional_email_confirmed boolean not null default false,
  institutional_email_domain_listed boolean not null default false,
  id_card_path text,
  selfie_path text,
  status public.verification_request_status not null default 'draft',
  submitted_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_by_type public.decider_type,
  decision_reason text,
  reviewer_note text check (reviewer_note is null or char_length(reviewer_note) <= 500),
  decided_at timestamptz,
  documents_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.student_verifications.institutional_email_confirmed is 'Snapshot: the student had confirmed the institutional email by code when they submitted. Informational only.';
comment on column public.student_verifications.institutional_email_domain_listed is 'Snapshot: the email domain is on the institution''s list. Informational only; a matching domain proves nothing on its own.';
create unique index student_verifications_one_open_per_student on public.student_verifications (student_id)
  where status in ('draft', 'submitted', 'resubmission_requested');
create index student_verifications_queue on public.student_verifications (institution_id, status, submitted_at);
create index student_verifications_student on public.student_verifications (student_id, created_at desc);
create index student_verifications_decided_by on public.student_verifications (decided_by);
create trigger student_verifications_updated_at before update on public.student_verifications
  for each row execute function private.set_updated_at();

alter table public.student_profiles
  add constraint student_profiles_current_verification_fk foreign key (current_verification_id) references public.student_verifications (id) on delete set null;
create index student_profiles_current_verification on public.student_profiles (current_verification_id);

-- Secret pepper for student ID hashes (private, generated per database).
insert into private.app_settings (key, value)
values ('verification.student_id_pepper', to_jsonb(encode(extensions.gen_random_bytes(32), 'hex')))
on conflict (key) do nothing;

-- Helpers ------------------------------------------------------------------
-- HMAC-SHA256 over "institution:NORMALISEDNUMBER", keyed with the 32-byte pepper
-- (stored hex-encoded, decoded to bytea here). Raises instead of returning null, so a
-- missing pepper or number can never silently disable the one-account-per-student-ID rule.
create function private.student_id_hash(p_institution_id uuid, p_number text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pepper_hex text := (select value #>> '{}' from private.app_settings where key = 'verification.student_id_pepper');
  v_normalised text := upper(regexp_replace(coalesce(p_number, ''), '[\s./-]', '', 'g'));
begin
  if v_pepper_hex is null or v_pepper_hex !~ '^[0-9a-f]{64}$' then
    raise exception 'student_id_pepper_missing' using errcode = 'P0001';
  end if;
  if p_institution_id is null or v_normalised = '' then
    raise exception 'student_id_invalid' using errcode = 'P0001';
  end if;
  return encode(
    extensions.hmac(convert_to(p_institution_id::text || ':' || v_normalised, 'UTF8'), decode(v_pepper_hex, 'hex'), 'sha256'),
    'hex');
end;
$$;

-- Fix-forward of migration 0002: a suspended staff account loses its staff powers.
-- Same signature, so existing grants and every policy that calls it are kept.
create or replace function private.is_staff(p_min public.platform_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.platform_role()) >= p_min, false)
     and (select private.has_mfa())
     and not (select private.is_suspended());
$$;

-- Can the caller review applications for this institution right now?
-- Reviewers: yes. Institution admins: only with two-factor. Perqly reviewers:
-- only where the institution has formally delegated review.
create function private.can_review_institution(p_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case (select private.institution_role(p_institution_id))
           when 'reviewer' then true
           when 'admin' then (select private.has_mfa())
           else false
         end
      or (
        (select private.is_staff('reviewer'))
        and exists (select 1 from public.institutions where id = p_institution_id and review_mode = 'delegated')
      );
$$;

-- The caller's effective verification state, accounting for expiry and suspension.
create function private.student_state(p_user_id uuid)
returns public.student_verification_state
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when p.is_suspended then 'suspended'::public.student_verification_state
           when sp.user_id is null then 'unverified'::public.student_verification_state
           when sp.verification_status = 'verified' and sp.verified_until <= now() then 'expired'::public.student_verification_state
           else sp.verification_status
         end
  from public.profiles p
  left join public.student_profiles sp on sp.user_id = p.id
  where p.id = p_user_id;
$$;

create function private.is_verified_student()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.student_state((select auth.uid()))) = 'verified', false);
$$;

-- The gate every booking and redemption function calls first (roadmap steps 1.6, 1.7).
create function private.require_verified_student()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state public.student_verification_state := (select private.student_state((select auth.uid())));
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  case v_state
    when 'verified' then return;
    when 'suspended' then raise exception 'account_suspended' using errcode = 'P0001';
    when 'expired' then raise exception 'verification_expired' using errcode = 'P0001';
    else raise exception 'not_verified' using errcode = 'P0001';
  end case;
end;
$$;

grant execute on function private.can_review_institution(uuid), private.is_verified_student() to authenticated;

-- RLS and grants -----------------------------------------------------------
alter table public.student_profiles enable row level security;
alter table public.student_verifications enable row level security;
revoke all on table public.student_profiles, public.student_verifications from anon, authenticated, service_role;
-- Reads only. Every change goes through the functions below.
grant select on table public.student_profiles, public.student_verifications to authenticated;

create policy "students read their own student profile" on public.student_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));
-- Reviewers don't read student_profiles: everything they need is on the application
-- (snapshot) and applicants' names come from get_verification_applicant_names().
create policy "support reads all student profiles" on public.student_profiles
  for select to authenticated
  using ((select private.is_staff('support')));

-- Students read their applications through get_my_student_status(), which hides the reviewer's identity.
create policy "reviewers read their institution's submitted applications" on public.student_verifications
  for select to authenticated
  using (status <> 'draft' and (select private.can_review_institution(institution_id)));
create policy "support reads all applications" on public.student_verifications
  for select to authenticated
  using ((select private.is_staff('support')));

-- No new policy on public.profiles: reviewers get applicants' names (and nothing else
-- from their profile) through get_verification_applicant_names() below.

-- Private document storage --------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification-documents', 'verification-documents', false, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Path rule: {student_id}/{application_id}/{id-card|selfie}.{webp|jpg|jpeg|png}
-- Returns no row for anything that isn't exactly that shape. Validation happens in
-- procedural order before any ::uuid cast, so malformed names can never raise a cast
-- error inside a storage policy (SQL gives no guarantee about WHERE vs SELECT order).
create function private.verification_document_parts(p_name text)
returns table (student_id uuid, application_id uuid, kind text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parts text[];
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if p_name is null or char_length(p_name) > 200 then
    return;
  end if;
  v_parts := string_to_array(p_name, '/');
  if coalesce(array_length(v_parts, 1), 0) <> 3
     or not coalesce(v_parts[1] ~ v_uuid, false)
     or not coalesce(v_parts[2] ~ v_uuid, false)
     or not coalesce(v_parts[3] ~ '^(id-card|selfie)\.(webp|jpg|jpeg|png)$', false) then
    return;
  end if;
  student_id := v_parts[1]::uuid;
  application_id := v_parts[2]::uuid;
  kind := split_part(v_parts[3], '.', 1);
  return next;
end;
$$;

-- Students may write only to their own open (draft or resubmission) application's folder.
create function private.can_write_verification_document(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.verification_document_parts(p_name) d
    join public.student_verifications v on v.id = d.application_id and v.student_id = d.student_id
    where d.student_id = (select auth.uid())
      and v.status in ('draft', 'resubmission_requested')
      and not (select private.is_suspended())
  );
$$;

-- Who may read a document (and so get a signed URL for it):
-- * the student who uploaded it; or
-- * an authorised reviewer of the application's institution, for a submitted or
--   decided application, and only within 10 minutes of an audited view recorded by
--   get_verification_document_paths(). Calling Storage directly can't skip the log.
-- Nobody, once documents_deleted_at is set.
create function private.can_read_verification_document(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.verification_document_parts(p_name) d
    join public.student_verifications v on v.id = d.application_id and v.student_id = d.student_id
    where v.documents_deleted_at is null
      and (
        d.student_id = (select auth.uid())
        or (
          v.status in ('submitted', 'approved', 'rejected', 'resubmission_requested')
          and (select private.can_review_institution(v.institution_id))
          and exists (
            select 1 from public.audit_logs a
            where a.entity_type = 'student_verification'
              and a.entity_id = v.id
              and a.action = 'verification.documents_viewed'
              and a.actor_id = (select auth.uid())
              and a.occurred_at > now() - interval '10 minutes'
          )
        )
      )
  );
$$;

grant execute on function private.verification_document_parts(text), private.can_write_verification_document(text), private.can_read_verification_document(text) to authenticated;

create policy "students upload their own verification documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'verification-documents' and (select private.can_write_verification_document(name)));
create policy "students replace their own verification documents" on storage.objects
  for update to authenticated
  using (bucket_id = 'verification-documents' and (select private.can_write_verification_document(name)))
  with check (bucket_id = 'verification-documents' and (select private.can_write_verification_document(name)));
create policy "students remove their own draft verification documents" on storage.objects
  for delete to authenticated
  using (bucket_id = 'verification-documents' and (select private.can_write_verification_document(name)));
create policy "students and authorised reviewers read verification documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'verification-documents' and (select private.can_read_verification_document(name)));

-- Student functions --------------------------------------------------------
create function public.upsert_student_profile(
  p_institution_id uuid,
  p_campus_id uuid default null,
  p_programme text default null,
  p_level text default null,
  p_grad_year smallint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_existing public.student_profiles;
  v_state public.student_verification_state;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if (select private.is_suspended()) then raise exception 'account_suspended' using errcode = 'P0001'; end if;
  if not (select private.institution_is_listed(p_institution_id)) then
    raise exception 'institution_unavailable' using errcode = 'P0001';
  end if;
  if p_campus_id is not null and not exists (
    select 1 from public.campuses where id = p_campus_id and institution_id = p_institution_id and is_active
  ) then
    raise exception 'campus_invalid' using errcode = 'P0001';
  end if;

  select * into v_existing from public.student_profiles where user_id = v_uid for update;
  v_state := (select private.student_state(v_uid));
  if v_existing.user_id is not null and v_existing.institution_id <> p_institution_id
     and (v_state in ('pending', 'verified') or exists (
       select 1 from public.student_verifications where student_id = v_uid and status in ('draft', 'submitted', 'resubmission_requested'))) then
    raise exception 'institution_locked' using errcode = 'P0001', hint = 'Withdraw your open application before changing school.';
  end if;

  insert into public.student_profiles (user_id, institution_id, campus_id, programme, level, grad_year)
  values (v_uid, p_institution_id, p_campus_id, nullif(btrim(p_programme), ''), nullif(btrim(p_level), ''), p_grad_year)
  on conflict (user_id) do update
    set institution_id = excluded.institution_id,
        campus_id = excluded.campus_id,
        programme = excluded.programme,
        level = excluded.level,
        grad_year = excluded.grad_year;
end;
$$;

-- Add, change or (with null or '') remove the optional institutional email.
-- Any change clears its confirmation. It never affects verification state.
create function public.set_institutional_email(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_current extensions.citext;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if (select private.is_suspended()) then raise exception 'account_suspended' using errcode = 'P0001'; end if;
  select institutional_email into v_current from public.student_profiles where user_id = v_uid for update;
  if not found then raise exception 'profile_required' using errcode = 'P0001'; end if;
  if v_email is not distinct from v_current::text then return; end if;

  perform private.check_rate_limit('student.institutional_email_change', 10, interval '1 day');
  update public.student_profiles
  set institutional_email = v_email, institutional_email_verified_at = null
  where user_id = v_uid;
  delete from private.institutional_email_codes where student_id = v_uid;
end;
$$;

-- Server only (service role): creates a 6-digit code for the student's
-- institutional email and returns it so the server can email it.
create function public.issue_institutional_email_code(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email extensions.citext;
  v_code text;
begin
  if exists (select 1 from public.profiles where id = p_user_id and is_suspended) then
    raise exception 'account_suspended' using errcode = 'P0001';
  end if;
  select institutional_email into v_email from public.student_profiles where user_id = p_user_id;
  if v_email is null then raise exception 'institutional_email_missing' using errcode = 'P0001'; end if;
  perform private.check_rate_limit('student.institutional_email_code', private.setting_int('verification.otp_max_per_hour', 3), interval '1 hour', p_user_id::text);

  v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into private.institutional_email_codes (student_id, email, code_hash, expires_at, attempts)
  values (p_user_id, v_email, encode(extensions.digest(v_code || ':' || p_user_id::text, 'sha256'), 'hex'), now() + interval '10 minutes', 0)
  on conflict (student_id) do update
    set email = excluded.email, code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = now();
  return jsonb_build_object('email', v_email, 'code', v_code);
end;
$$;

-- Confirms the institutional email with the emailed code. Returns false for a
-- wrong code (and counts the attempt). Does NOT verify the student.
create function public.confirm_institutional_email_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row private.institutional_email_codes;
  v_current extensions.citext;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if (select private.is_suspended()) then raise exception 'account_suspended' using errcode = 'P0001'; end if;
  select institutional_email into v_current from public.student_profiles where user_id = v_uid;
  select * into v_row from private.institutional_email_codes where student_id = v_uid for update;
  if v_row.student_id is null or v_row.email is distinct from v_current or v_row.expires_at <= now() or v_row.attempts >= 5 then
    raise exception 'code_invalid' using errcode = 'P0001', hint = 'Send a new code.';
  end if;
  if v_row.code_hash <> encode(extensions.digest(coalesce(btrim(p_code), '') || ':' || v_uid::text, 'sha256'), 'hex') then
    update private.institutional_email_codes set attempts = attempts + 1 where student_id = v_uid;
    return false;
  end if;
  update public.student_profiles set institutional_email_verified_at = now() where user_id = v_uid;
  delete from private.institutional_email_codes where student_id = v_uid;
  return true;
end;
$$;

-- Opens (or returns the already open) application for the caller's institution.
create function public.start_verification_application()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.student_profiles;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if (select private.is_suspended()) then raise exception 'account_suspended' using errcode = 'P0001'; end if;
  select * into v_profile from public.student_profiles where user_id = v_uid;
  if not found then raise exception 'profile_required' using errcode = 'P0001'; end if;

  select id into v_id from public.student_verifications
  where student_id = v_uid and status in ('draft', 'submitted', 'resubmission_requested');
  if v_id is not null then return v_id; end if;

  if (select private.student_state(v_uid)) = 'verified' and v_profile.verified_until > now() + interval '30 days' then
    raise exception 'already_verified' using errcode = 'P0001';
  end if;

  begin
    insert into public.student_verifications (student_id, institution_id)
    values (v_uid, v_profile.institution_id)
    returning id into v_id;
  exception when unique_violation then
    -- A concurrent call opened it first; return that one.
    select id into v_id from public.student_verifications
    where student_id = v_uid and status in ('draft', 'submitted', 'resubmission_requested');
  end;
  return v_id;
end;
$$;

create function public.submit_verification_application(
  p_application_id uuid,
  p_student_id_number text,
  p_id_card_path text,
  p_selfie_path text,
  p_include_institutional_email boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_app public.student_verifications;
  v_profile public.student_profiles;
  v_number text := btrim(coalesce(p_student_id_number, ''));
  v_prefix text;
  v_email extensions.citext;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if (select private.is_suspended()) then raise exception 'account_suspended' using errcode = 'P0001'; end if;

  select * into v_app from public.student_verifications where id = p_application_id for update;
  if not found or v_app.student_id <> v_uid then raise exception 'application_not_found' using errcode = 'P0001'; end if;
  if v_app.status not in ('draft', 'resubmission_requested') then raise exception 'application_not_editable' using errcode = 'P0001'; end if;
  perform private.check_rate_limit('student.verification_submit', 5, interval '1 day');

  if v_number !~ '^[A-Za-z0-9/ .-]{3,40}$' then raise exception 'student_id_invalid' using errcode = 'P0001'; end if;

  v_prefix := v_uid::text || '/' || p_application_id::text || '/';
  if p_id_card_path is null or left(p_id_card_path, length(v_prefix)) <> v_prefix
     or (select kind from private.verification_document_parts(p_id_card_path)) is distinct from 'id-card'
     or not exists (select 1 from storage.objects where bucket_id = 'verification-documents' and name = p_id_card_path) then
    raise exception 'id_card_missing' using errcode = 'P0001';
  end if;
  if p_selfie_path is null or left(p_selfie_path, length(v_prefix)) <> v_prefix
     or (select kind from private.verification_document_parts(p_selfie_path)) is distinct from 'selfie'
     or not exists (select 1 from storage.objects where bucket_id = 'verification-documents' and name = p_selfie_path) then
    raise exception 'selfie_missing' using errcode = 'P0001';
  end if;

  select * into v_profile from public.student_profiles where user_id = v_uid for update;
  if v_profile.institution_id <> v_app.institution_id then raise exception 'institution_changed' using errcode = 'P0001'; end if;
  v_email := case when p_include_institutional_email then v_profile.institutional_email end;

  update public.student_verifications
  set student_id_number = v_number,
      programme = v_profile.programme,
      level = v_profile.level,
      grad_year = v_profile.grad_year,
      institutional_email = v_email,
      institutional_email_confirmed = v_email is not null and v_profile.institutional_email_verified_at is not null,
      institutional_email_domain_listed = v_email is not null and exists (
        select 1 from public.institution_email_domains d
        where d.institution_id = v_app.institution_id and d.is_active and d.domain = split_part(v_email::text, '@', 2)),
      id_card_path = p_id_card_path,
      selfie_path = p_selfie_path,
      status = 'submitted',
      submitted_at = now(),
      reviewer_note = null
  where id = p_application_id;

  update public.student_profiles
  set current_verification_id = p_application_id,
      verification_status = case when verification_status = 'verified' and verified_until > now() then 'verified'::public.student_verification_state else 'pending'::public.student_verification_state end
  where user_id = v_uid;

  perform private.write_audit('verification.submitted', 'student', 'student_verification', p_application_id,
    null, jsonb_build_object('status', 'submitted'),
    jsonb_build_object('institutional_email_included', v_email is not null), v_app.institution_id);
end;
$$;

create function public.withdraw_verification_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_app public.student_verifications;
begin
  select * into v_app from public.student_verifications where id = p_application_id for update;
  if not found or v_app.student_id is distinct from v_uid then raise exception 'application_not_found' using errcode = 'P0001'; end if;
  if v_app.status not in ('draft', 'submitted', 'resubmission_requested') then raise exception 'application_not_editable' using errcode = 'P0001'; end if;

  update public.student_verifications set status = 'withdrawn' where id = p_application_id;
  update public.student_profiles
  set verification_status = case when verification_status = 'pending' then 'unverified'::public.student_verification_state else verification_status end
  where user_id = v_uid;
  perform private.write_audit('verification.withdrawn', 'student', 'student_verification', p_application_id,
    jsonb_build_object('status', v_app.status), jsonb_build_object('status', 'withdrawn'), '{}'::jsonb, v_app.institution_id);
end;
$$;

-- Reviewer decision: 'approve', 'reject' (with a reason code) or 'request_resubmission' (with a note).
create function public.decide_verification(
  p_application_id uuid,
  p_decision text,
  p_reason text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_app public.student_verifications;
  v_inst public.institutions;
  v_role public.institution_reviewer_role;
  v_decider public.decider_type;
  v_hash text;
  v_until timestamptz;
  v_year_end date;
  v_year int;
  v_month_start date;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  select * into v_app from public.student_verifications where id = p_application_id for update;
  if not found then raise exception 'application_not_found' using errcode = 'P0001'; end if;
  select * into v_inst from public.institutions where id = v_app.institution_id;

  if not (select private.can_review_institution(v_app.institution_id)) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_app.student_id = v_uid then
    raise exception 'cannot_review_own' using errcode = 'P0001';
  end if;
  if v_app.status <> 'submitted' then
    raise exception 'application_not_pending' using errcode = 'P0001';
  end if;

  v_role := (select private.institution_role(v_app.institution_id));
  v_decider := case when v_role is not null then 'institution'::public.decider_type else 'perqly'::public.decider_type end;

  if p_decision = 'approve' then
    if v_app.student_id_number is null or v_app.id_card_path is null or v_app.selfie_path is null then
      raise exception 'application_incomplete' using errcode = 'P0001';
    end if;
    v_hash := private.student_id_hash(v_app.institution_id, v_app.student_id_number);
    if exists (
      select 1 from public.student_profiles
      where institution_id = v_app.institution_id and student_id_hash = v_hash and user_id <> v_app.student_id
    ) then
      raise exception 'student_id_in_use' using errcode = 'P0001', hint = 'Another Perqly account already holds this student ID.';
    end if;

    if v_inst.academic_year_end_month is not null then
      -- The next academic year end at least 30 days away. Day 31 in a 30-day month
      -- (or 29 February in other years) falls back to that month's last day.
      v_year := extract(year from now())::int;
      loop
        v_month_start := make_date(v_year, v_inst.academic_year_end_month, 1);
        v_year_end := v_month_start + (least(v_inst.academic_year_end_day,
          extract(day from (v_month_start + interval '1 month' - interval '1 day'))::int) - 1);
        exit when v_year_end >= (now() + interval '30 days')::date;
        v_year := v_year + 1;
      end loop;
      v_until := v_year_end::timestamptz + interval '1 day' - interval '1 second';
    else
      v_until := now() + interval '1 year';
    end if;

    update public.student_verifications
    set status = 'approved', decided_by = v_uid, decided_by_type = v_decider, decided_at = now(),
        decision_reason = null, reviewer_note = v_note
    where id = p_application_id;
    begin
      update public.student_profiles
      set verification_status = 'verified', verified_at = now(), verified_until = v_until,
          student_id_hash = v_hash, current_verification_id = p_application_id
      where user_id = v_app.student_id;
    exception when unique_violation then
      -- Another reviewer approved the same student ID on another account at the same moment.
      raise exception 'student_id_in_use' using errcode = 'P0001', hint = 'Another Perqly account already holds this student ID.';
    end;

  elsif p_decision = 'reject' then
    if p_reason is null or p_reason not in ('not_enrolled', 'id_mismatch', 'photo_mismatch', 'unreadable_documents', 'duplicate_account', 'other') then
      raise exception 'reason_required' using errcode = 'P0001';
    end if;
    if p_reason = 'other' and v_note is null then raise exception 'note_required' using errcode = 'P0001'; end if;
    update public.student_verifications
    set status = 'rejected', decided_by = v_uid, decided_by_type = v_decider, decided_at = now(),
        decision_reason = p_reason, reviewer_note = v_note
    where id = p_application_id;
    update public.student_profiles
    set verification_status = case when verification_status = 'pending' then 'unverified'::public.student_verification_state else verification_status end
    where user_id = v_app.student_id;

  elsif p_decision = 'request_resubmission' then
    if v_note is null or char_length(v_note) < 5 then raise exception 'note_required' using errcode = 'P0001'; end if;
    update public.student_verifications
    set status = 'resubmission_requested', decided_by = v_uid, decided_by_type = v_decider, decided_at = now(),
        decision_reason = null, reviewer_note = v_note
    where id = p_application_id;

  else
    raise exception 'decision_invalid' using errcode = 'P0001';
  end if;

  -- No student ID number, email or document path goes into the audit log.
  perform private.write_audit(
    case p_decision when 'approve' then 'verification.approved' when 'reject' then 'verification.rejected' else 'verification.resubmission_requested' end,
    case when v_decider = 'institution' then 'institution:' || v_role::text else 'platform:reviewer' end,
    'student_verification', p_application_id,
    jsonb_build_object('status', v_app.status),
    jsonb_build_object('status', case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'resubmission_requested' end),
    jsonb_build_object('reason', p_reason),
    v_app.institution_id);
end;
$$;

-- Document paths for an authorised reviewer (the app then creates 5-minute signed
-- URLs, which Storage only issues to readers allowed by the policies above).
-- Every reviewer view is audited.
create function public.get_verification_document_paths(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.student_verifications;
begin
  select * into v_app from public.student_verifications where id = p_application_id;
  if not found then raise exception 'application_not_found' using errcode = 'P0001'; end if;
  if v_app.student_id = (select auth.uid()) then
    if v_app.documents_deleted_at is not null then
      return jsonb_build_object('id_card', null, 'selfie', null, 'deleted_at', v_app.documents_deleted_at);
    end if;
    return jsonb_build_object('id_card', v_app.id_card_path, 'selfie', v_app.selfie_path);
  end if;
  if v_app.status not in ('submitted', 'approved', 'rejected', 'resubmission_requested')
     or not (select private.can_review_institution(v_app.institution_id)) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_app.documents_deleted_at is not null then
    return jsonb_build_object('id_card', null, 'selfie', null, 'deleted_at', v_app.documents_deleted_at);
  end if;
  perform private.write_audit('verification.documents_viewed',
    case when (select private.institution_role(v_app.institution_id)) is not null then 'institution:reviewer' else 'platform:reviewer' end,
    'student_verification', p_application_id, null, null, '{}'::jsonb, v_app.institution_id);
  return jsonb_build_object('id_card', v_app.id_card_path, 'selfie', v_app.selfie_path);
end;
$$;

-- Applicants' names for the reviewer queue: only for applications the caller may
-- review, and only the name. Replaces any direct read of public.profiles.
create function public.get_verification_applicant_names(p_application_ids uuid[])
returns table (application_id uuid, student_id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.student_id, p.full_name
  from public.student_verifications v
  join public.profiles p on p.id = v.student_id
  where v.id = any (p_application_ids)
    and cardinality(p_application_ids) <= 500
    and v.status <> 'draft'
    and (select private.can_review_institution(v.institution_id));
$$;

-- Everything the student area needs about the caller's verification, without reviewer identities.
create function public.get_my_student_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'state', (select private.student_state((select auth.uid()))),
    'profile', (
      select jsonb_build_object(
        'institution_id', sp.institution_id,
        'institution_name', i.name,
        'institution_short_name', i.short_name,
        'campus_id', sp.campus_id,
        'programme', sp.programme,
        'level', sp.level,
        'grad_year', sp.grad_year,
        'institutional_email', sp.institutional_email,
        'institutional_email_confirmed', sp.institutional_email_verified_at is not null,
        'verified_until', sp.verified_until)
      from public.student_profiles sp join public.institutions i on i.id = sp.institution_id
      where sp.user_id = (select auth.uid())),
    'application', (
      select jsonb_build_object(
        'id', v.id,
        'status', v.status,
        'student_id_number', v.student_id_number,
        'id_card_path', v.id_card_path,
        'selfie_path', v.selfie_path,
        'institutional_email', v.institutional_email,
        'submitted_at', v.submitted_at,
        'decided_at', v.decided_at,
        'decision_reason', v.decision_reason,
        'reviewer_note', v.reviewer_note)
      from public.student_verifications v
      where v.student_id = (select auth.uid())
      order by v.created_at desc
      limit 1)
  );
$$;

-- For screens that show or hide Book and Scan.
create function public.get_student_benefit_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'allowed', coalesce((select private.student_state((select auth.uid()))) = 'verified', false),
    'state', coalesce((select private.student_state((select auth.uid())))::text, 'unverified'));
$$;

-- Job (service role / pg_cron): mark lapsed verifications as expired.
create function public.expire_student_verifications()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.student_profiles set verification_status = 'expired'
  where verification_status = 'verified' and verified_until <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Function grants ----------------------------------------------------------
revoke execute on function
  public.upsert_student_profile(uuid, uuid, text, text, smallint),
  public.set_institutional_email(text),
  public.issue_institutional_email_code(uuid),
  public.confirm_institutional_email_code(text),
  public.start_verification_application(),
  public.submit_verification_application(uuid, text, text, text, boolean),
  public.withdraw_verification_application(uuid),
  public.decide_verification(uuid, text, text, text),
  public.get_verification_document_paths(uuid),
  public.get_verification_applicant_names(uuid[]),
  public.get_my_student_status(),
  public.get_student_benefit_access(),
  public.expire_student_verifications()
  from public, anon, authenticated;

grant execute on function
  public.upsert_student_profile(uuid, uuid, text, text, smallint),
  public.set_institutional_email(text),
  public.confirm_institutional_email_code(text),
  public.start_verification_application(),
  public.submit_verification_application(uuid, text, text, text, boolean),
  public.withdraw_verification_application(uuid),
  public.decide_verification(uuid, text, text, text),
  public.get_verification_document_paths(uuid),
  public.get_verification_applicant_names(uuid[]),
  public.get_my_student_status(),
  public.get_student_benefit_access()
  to authenticated;

-- Server-only: the app calls these with the secret key after checking the user.
grant execute on function public.issue_institutional_email_code(uuid), public.expire_student_verifications() to service_role;

-- The gate is callable by signed-in users (it only ever checks the caller).
-- student_state(uuid) accepts any user id, so it stays internal to definer functions.
grant execute on function private.require_verified_student() to authenticated, service_role;
revoke execute on function private.student_state(uuid), private.student_id_hash(uuid, text) from public, anon, authenticated, service_role;

-- Postgres gives EXECUTE on every new function to PUBLIC. Migration 0001's
-- per-schema ALTER DEFAULT PRIVILEGES cannot remove that built-in default, so the
-- private helpers created in 0002–0004 were callable by PUBLIC. They are not reachable
-- through the Data API (the private schema isn't exposed), but close it anyway and
-- keep only the explicit grants above and in 0002/0003 (which RLS policies rely on).
revoke execute on all functions in schema private from public;
