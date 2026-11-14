-- Perqly migration 0005: finishing roadmap step 1.3.
--
-- 1. Admin tools for institutions: email domains, campuses, and appointing
--    reviewers by email address (the app never sees other users' emails).
-- 2. The 30-day retention job for verification documents. Supabase Storage
--    files can only be deleted through the Storage API, so a server job lists
--    what is due, deletes the files, then marks the applications here.
-- 3. A service-role-only lookup the server uses to email a student about a
--    decision, so reviewers never get the student's email address.

insert into private.app_settings (key, value)
values ('verification.document_retention_days', '30')
on conflict (key) do nothing;

-- 1. Institution administration ------------------------------------------------

-- Appoint by email. Same permissions as appoint_institution_reviewer(), checked
-- before the lookup so nobody else can use this to test whether an email has an account.
create function public.appoint_institution_reviewer_by_email(
  p_institution_id uuid,
  p_email text,
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
  v_user_id uuid;
begin
  if not (v_is_platform_admin or (v_is_institution_admin and p_role = 'reviewer')) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_email is null or char_length(btrim(p_email)) not between 3 and 254 then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;

  select u.id into v_user_id from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
  if v_user_id is null then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;

  return public.appoint_institution_reviewer(p_institution_id, v_user_id, p_role);
end;
$$;

-- Add, re-activate or deactivate an email domain. A domain belongs to one institution.
create function public.admin_set_institution_domain(p_institution_id uuid, p_domain text, p_is_active boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text := lower(btrim(coalesce(p_domain, '')));
  v_row public.institution_email_domains;
  v_id uuid;
begin
  if not (select private.is_staff('admin')) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.institutions where id = p_institution_id) then
    raise exception 'institution_not_found' using errcode = 'P0001';
  end if;
  if v_domain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' or char_length(v_domain) > 253 then
    raise exception 'domain_invalid' using errcode = 'P0001';
  end if;

  select * into v_row from public.institution_email_domains where domain = v_domain::extensions.citext for update;
  if v_row.id is not null and v_row.institution_id <> p_institution_id then
    raise exception 'domain_in_use' using errcode = 'P0001';
  end if;

  if v_row.id is not null then
    update public.institution_email_domains set is_active = coalesce(p_is_active, true) where id = v_row.id returning id into v_id;
  else
    insert into public.institution_email_domains (institution_id, domain, is_active)
    values (p_institution_id, v_domain, coalesce(p_is_active, true))
    returning id into v_id;
  end if;

  perform private.write_audit(case when v_row.id is null then 'institution.domain_added' else 'institution.domain_updated' end,
    'platform:admin', 'institution_email_domain', v_id,
    case when v_row.id is null then null else jsonb_build_object('is_active', v_row.is_active) end,
    jsonb_build_object('domain', v_domain, 'is_active', coalesce(p_is_active, true)), '{}'::jsonb, p_institution_id);
  return v_id;
end;
$$;

-- Create (p_campus_id null) or update a campus.
create function public.admin_upsert_campus(
  p_institution_id uuid,
  p_campus_id uuid,
  p_name text,
  p_digital_address text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_id uuid;
  v_address text := nullif(upper(btrim(coalesce(p_digital_address, ''))), '');
begin
  if not (select private.is_staff('admin')) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.institutions where id = p_institution_id) then
    raise exception 'institution_not_found' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 120 then
    raise exception 'campus_name_invalid' using errcode = 'P0001';
  end if;
  if v_address is not null and v_address !~ '^[A-Z]{2}-?[0-9]{3,4}-?[0-9]{3,4}$' then
    raise exception 'digital_address_invalid' using errcode = 'P0001';
  end if;
  if (p_latitude is null) <> (p_longitude is null)
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'location_invalid' using errcode = 'P0001';
  end if;

  begin
    if p_campus_id is null then
      insert into public.campuses (institution_id, name, digital_address, latitude, longitude, is_active)
      values (p_institution_id, btrim(p_name), v_address, p_latitude, p_longitude, coalesce(p_is_active, true))
      returning id into v_id;
    else
      select to_jsonb(c) into v_before from public.campuses c
      where id = p_campus_id and institution_id = p_institution_id for update;
      if v_before is null then
        raise exception 'campus_not_found' using errcode = 'P0001';
      end if;
      update public.campuses
      set name = btrim(p_name), digital_address = v_address, latitude = p_latitude, longitude = p_longitude,
          is_active = coalesce(p_is_active, true)
      where id = p_campus_id
      returning id into v_id;
    end if;
  exception when unique_violation then
    raise exception 'campus_name_in_use' using errcode = 'P0001';
  end;

  select to_jsonb(c) into v_after from public.campuses c where id = v_id;
  perform private.write_audit(case when v_before is null then 'institution.campus_added' else 'institution.campus_updated' end,
    'platform:admin', 'campus', v_id, v_before, v_after, '{}'::jsonb, p_institution_id);
  return v_id;
end;
$$;

-- 2. Document retention ----------------------------------------------------------

-- Closed applications whose documents are due for deletion. Open ones (draft,
-- submitted, resubmission_requested) are never touched: the student may still
-- need their photos.
create function public.list_verification_documents_due(p_limit int default 100)
returns table (application_id uuid, student_id uuid, institution_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.student_id, v.institution_id
  from public.student_verifications v
  where v.documents_deleted_at is null
    and v.status in ('approved', 'rejected', 'withdrawn')
    and coalesce(v.decided_at, v.updated_at)
        < now() - make_interval(days => (select private.setting_int('verification.document_retention_days', 30)))
  order by coalesce(v.decided_at, v.updated_at)
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

-- Called after the files are gone. Rechecks eligibility, clears the paths,
-- redacts the student ID number (the keyed hash on the profile stays for the
-- one-account-per-student-ID rule) and audits each application.
create function public.mark_verification_documents_deleted(p_application_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count int := 0;
begin
  if p_application_ids is null or cardinality(p_application_ids) = 0 then
    return 0;
  end if;
  if cardinality(p_application_ids) > 500 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;

  for v_row in
    update public.student_verifications v
    set documents_deleted_at = now(), id_card_path = null, selfie_path = null, student_id_number = null
    where v.id = any (p_application_ids)
      and v.documents_deleted_at is null
      and v.status in ('approved', 'rejected', 'withdrawn')
      and coalesce(v.decided_at, v.updated_at)
          < now() - make_interval(days => (select private.setting_int('verification.document_retention_days', 30)))
    returning v.id, v.institution_id
  loop
    v_count := v_count + 1;
    perform private.write_audit('verification.documents_deleted', 'system:retention', 'student_verification', v_row.id,
      null, null, jsonb_build_object('reason', 'retention'), v_row.institution_id);
  end loop;
  return v_count;
end;
$$;

-- 3. Decision notifications -----------------------------------------------------

-- Everything the server needs to email the student about a decided application.
-- Service role only: reviewers never receive the student's email address.
create function public.get_verification_notice(p_application_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'email', u.email,
    'first_name', p.first_name,
    'status', v.status,
    'decision_reason', v.decision_reason,
    'reviewer_note', v.reviewer_note,
    'institution_short_name', i.short_name,
    'verified_until', sp.verified_until
  )
  from public.student_verifications v
  join auth.users u on u.id = v.student_id
  join public.profiles p on p.id = v.student_id
  join public.institutions i on i.id = v.institution_id
  join public.student_profiles sp on sp.user_id = v.student_id
  where v.id = p_application_id
    and v.status in ('approved', 'rejected', 'resubmission_requested');
$$;

-- Grants --------------------------------------------------------------------------
revoke execute on function
  public.appoint_institution_reviewer_by_email(uuid, text, public.institution_reviewer_role),
  public.admin_set_institution_domain(uuid, text, boolean),
  public.admin_upsert_campus(uuid, uuid, text, text, double precision, double precision, boolean),
  public.list_verification_documents_due(int),
  public.mark_verification_documents_deleted(uuid[]),
  public.get_verification_notice(uuid)
  from public, anon, authenticated, service_role;

grant execute on function
  public.appoint_institution_reviewer_by_email(uuid, text, public.institution_reviewer_role),
  public.admin_set_institution_domain(uuid, text, boolean),
  public.admin_upsert_campus(uuid, uuid, text, text, double precision, double precision, boolean)
  to authenticated;

grant execute on function
  public.list_verification_documents_due(int),
  public.mark_verification_documents_deleted(uuid[]),
  public.get_verification_notice(uuid)
  to service_role;
