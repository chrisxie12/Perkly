-- Perqly migration 0006: role-specific access for review and reviewer management.
--
-- 1. my_reviewable_institutions(): the institutions the caller can decide for
--    right now, from private.can_review_institution() (the same rule
--    decide_verification() uses). The app filters queues with it, so nobody is
--    shown applications they can't act on (support staff can read every
--    application through RLS, but can only decide for delegated institutions).
-- 2. get_my_context() also lists delegated institutions for platform staff, so
--    the app can route Perqly reviewers to the review area and ask for
--    two-factor first (can_review_institution() needs it for staff).
-- 3. get_institution_reviewers(): reviewers with names for institution admins
--    (two-factor) and Perqly support or above. Institution reviewers can't read
--    other people's profiles, so names come only from here.

create function public.my_reviewable_institutions()
returns table (institution_id uuid, short_name text, name text, via text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.short_name, i.name,
         case when (select private.institution_role(i.id)) is not null then 'institution' else 'delegated' end
  from public.institutions i
  where (select private.can_review_institution(i.id))
  order by i.short_name;
$$;

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
    -- Routing only: whether this person may review delegated institutions once
    -- signed in with two-factor. The database still checks every decision.
    'delegated_institutions', coalesce((
      select jsonb_agg(jsonb_build_object('institution_id', i.id, 'short_name', i.short_name) order by i.short_name)
      from public.institutions i
      where i.review_mode = 'delegated'
        and exists (select 1 from public.platform_staff s where s.user_id = p.id)
    ), '[]'::jsonb)
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;

create function public.get_institution_reviewers(p_institution_id uuid)
returns table (reviewer_id uuid, user_id uuid, full_name text, role public.institution_reviewer_role, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not ((select private.is_staff('support'))
          or (coalesce((select private.institution_role(p_institution_id)) = 'admin', false) and (select private.has_mfa()))) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  return query
    select r.id, r.user_id, coalesce(p.full_name, 'Name not given'), r.role, r.created_at
    from public.institution_reviewers r
    join public.profiles p on p.id = r.user_id
    where r.institution_id = p_institution_id and r.status = 'active'
    order by r.role desc, p.full_name;
end;
$$;

revoke execute on function
  public.my_reviewable_institutions(),
  public.get_institution_reviewers(uuid)
  from public, anon, service_role;
grant execute on function
  public.my_reviewable_institutions(),
  public.get_institution_reviewers(uuid)
  to authenticated;
-- get_my_context() keeps its grants from migration 0003 (create or replace preserves them).
