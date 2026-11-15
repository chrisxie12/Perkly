-- Perqly admins can approve or reject any institution's students.
-- Before: Perqly staff could review only institutions that delegated review to
-- Perqly under a signed agreement (decision D14). The founder decided on
-- 2026-11-15 that platform admins (with two-factor) may always decide. Perqly
-- reviewers below admin still need delegation. Every decision stays in the audit
-- log with the reviewer's name, exactly as before.

create or replace function private.can_review_institution(p_institution_id uuid)
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
      or (select private.is_staff('admin'))
      or (
        (select private.is_staff('reviewer'))
        and exists (select 1 from public.institutions where id = p_institution_id and review_mode = 'delegated')
      );
$$;

-- Routing: admins see the Institution area for every institution.
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
      where exists (select 1 from public.platform_staff s where s.user_id = p.id)
        and (i.review_mode = 'delegated'
             or (select s.role from public.platform_staff s where s.user_id = p.id) in ('admin', 'super_admin'))
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

revoke execute on all functions in schema private from public;
grant execute on function private.can_review_institution(uuid) to authenticated;
