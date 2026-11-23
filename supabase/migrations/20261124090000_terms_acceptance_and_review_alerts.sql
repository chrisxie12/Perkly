-- Open GCTU registration, stage 1 (founder decision 2026-11-23).
--
-- 1. Record which version of the Terms of use and Privacy notice each account
--    accepted, and when. Two nullable columns on profiles; no new table. Students
--    can't write them directly: the existing column-level update grant on profiles
--    (full_name, first_name, avatar_path) is unchanged, so only accept_terms() writes
--    them.
-- 2. Tell Perqly admins when a student sends a verification application, so the
--    "within 2 working days" promise can be kept. Uses the existing notifications
--    pipeline (private.notify); one notification per admin per submission.
--
-- Nothing here changes a row-level security policy or a verification gate.

alter table public.profiles
  add column terms_version text check (terms_version is null or terms_version ~ '^[A-Za-z0-9.-]{1,40}$'),
  add column terms_accepted_at timestamptz,
  add constraint profiles_terms_accepted_together check ((terms_version is null) = (terms_accepted_at is null));
comment on column public.profiles.terms_version is 'Version of the Terms of use and Privacy notice the person accepted. Written only by accept_terms().';
comment on column public.profiles.terms_accepted_at is 'When terms_version was accepted.';

create function public.accept_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_old text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_version is null or p_version !~ '^[A-Za-z0-9.-]{1,40}$' then
    raise exception 'version_invalid' using errcode = 'P0001';
  end if;
  select terms_version into v_old from public.profiles where id = v_uid;
  if not found then raise exception 'profile_required' using errcode = 'P0001'; end if;
  if v_old is not distinct from p_version then return; end if;

  update public.profiles
     set terms_version = p_version, terms_accepted_at = now()
   where id = v_uid;

  perform private.write_audit('account.terms_accepted', 'self', 'profile', v_uid,
    jsonb_build_object('terms_version', v_old), jsonb_build_object('terms_version', p_version));
end;
$$;
revoke execute on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

-- Review alerts -----------------------------------------------------------------------
create function private.alert_admins_of_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify(
    s.user_id,
    'verification.application_received',
    'New student verification to review',
    coalesce(i.short_name, i.name) || ' student sent an application. Students are told to expect a decision within 2 working days.',
    '/institution/requests/' || new.id)
  from public.platform_staff s
  join public.profiles p on p.id = s.user_id and not p.is_suspended
  cross join public.institutions i
  where i.id = new.institution_id
    and s.role >= 'admin'
    and s.user_id <> new.student_id;
  return null;
end;
$$;
revoke execute on function private.alert_admins_of_application() from public, anon, authenticated;

create trigger student_verifications_alert_admins
  after update of status on public.student_verifications
  for each row
  when (new.status = 'submitted' and old.status is distinct from 'submitted')
  execute function private.alert_admins_of_application();
