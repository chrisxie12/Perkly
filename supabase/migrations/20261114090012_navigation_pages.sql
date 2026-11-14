-- Data for the pages the role navigation adds: institution overview and student
-- list, Perqly staff management, platform settings and reports.

-- Institution overview: one row per institution the caller can review.
create function public.institution_overview()
returns table (
  institution_id uuid, short_name text, name text, via text, waiting int, oldest_waiting_at timestamptz,
  decided_7d int, verified int, expiring_30d int
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.institution_id, r.short_name, r.name, r.via,
         (select count(*)::int from public.student_verifications v where v.institution_id = r.institution_id and v.status = 'submitted'),
         (select min(v.submitted_at) from public.student_verifications v where v.institution_id = r.institution_id and v.status = 'submitted'),
         (select count(*)::int from public.student_verifications v
           where v.institution_id = r.institution_id and v.decided_at > now() - interval '7 days'),
         (select count(*)::int from public.student_profiles sp
           where sp.institution_id = r.institution_id and sp.verification_status = 'verified' and sp.verified_until > now()),
         (select count(*)::int from public.student_profiles sp
           where sp.institution_id = r.institution_id and sp.verification_status = 'verified'
             and sp.verified_until > now() and sp.verified_until <= now() + interval '30 days')
  from public.my_reviewable_institutions() r;
$$;

-- Students an institution has verified (currently verified or lapsed), for its
-- reviewers. Names and study details only: no contact details, no documents.
create function public.institution_students(p_institution_id uuid, p_query text default null, p_state text default 'verified')
returns table (
  student_id uuid, full_name text, programme text, level text, grad_year smallint, campus text,
  state text, verified_at timestamptz, verified_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not (select private.can_review_institution(p_institution_id)) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_state not in ('verified', 'expired', 'all') then raise exception 'state_invalid' using errcode = 'P0001'; end if;
  return query
    select sp.user_id, p.full_name, sp.programme, sp.level, sp.grad_year, c.name,
           case when sp.verification_status = 'verified' and sp.verified_until > now() then 'verified' else 'expired' end,
           sp.verified_at, sp.verified_until
    from public.student_profiles sp
    join public.profiles p on p.id = sp.user_id
    left join public.campuses c on c.id = sp.campus_id
    where sp.institution_id = p_institution_id
      and sp.verified_at is not null
      and (p_state = 'all'
           or (p_state = 'verified' and sp.verification_status = 'verified' and sp.verified_until > now())
           or (p_state = 'expired' and not (sp.verification_status = 'verified' and sp.verified_until > now())))
      and (v_q is null or p.full_name ilike '%' || replace(replace(v_q, '%', ''), '_', '\_') || '%'
           or sp.programme ilike '%' || replace(replace(v_q, '%', ''), '_', '\_') || '%')
    order by p.full_name
    limit 300;
end;
$$;

-- Perqly staff -----------------------------------------------------------------------
create function public.admin_list_staff()
returns table (user_id uuid, email text, full_name text, role public.platform_role, granted_by_name text, since timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return query
    select s.user_id, u.email::text, p.full_name, s.role, g.full_name, s.created_at
    from public.platform_staff s
    join public.profiles p on p.id = s.user_id
    join auth.users u on u.id = s.user_id
    left join public.profiles g on g.id = s.granted_by
    order by s.role desc, p.full_name;
end;
$$;

-- Super admins grant, change or remove a role by email. set_platform_role does the
-- authorisation, the self-change guard and the audit.
create function public.admin_set_platform_role_by_email(p_email text, p_role public.platform_role)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid;
begin
  if not (select private.is_staff('super_admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(coalesce(p_email, '')));
  if v_user is null then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  perform public.set_platform_role(v_user, p_role);
  return v_user;
end;
$$;

-- Platform settings ------------------------------------------------------------------
-- Only tunable numeric limits are listed; secrets such as the student ID pepper never are.
create function private.is_tunable_setting(p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_key ~ '^(redemption|qr|booking)\.[a-z_]+$'
      or p_key in ('verification.otp_max_per_hour', 'verification.document_retention_days');
$$;

create function public.admin_list_settings()
returns table (key text, value int, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return query
    select s.key, (s.value #>> '{}')::int, s.updated_at
    from private.app_settings s
    where private.is_tunable_setting(s.key) and jsonb_typeof(s.value) = 'number'
    order by s.key;
end;
$$;

create function public.admin_set_setting(p_key text, p_value int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_before jsonb;
begin
  if not (select private.is_staff('super_admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if not private.is_tunable_setting(p_key) then raise exception 'setting_not_tunable' using errcode = 'P0001'; end if;
  if p_value is null or p_value < 1 or p_value > 100000 then raise exception 'value_out_of_range' using errcode = 'P0001'; end if;
  select value into v_before from private.app_settings where key = p_key for update;
  if v_before is null then raise exception 'setting_not_found' using errcode = 'P0001'; end if;
  update private.app_settings set value = to_jsonb(p_value), updated_by = (select auth.uid()) where key = p_key;
  perform private.write_audit('platform.setting_changed', 'platform:super_admin', 'app_setting', null,
    jsonb_build_object('key', p_key, 'value', v_before), jsonb_build_object('key', p_key, 'value', p_value));
end;
$$;

-- Reports ----------------------------------------------------------------------------
create function public.admin_report(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_since timestamptz;
begin
  if not (select private.is_staff('support')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_days not in (7, 30, 90, 365) then raise exception 'period_invalid' using errcode = 'P0001'; end if;
  v_since := now() - make_interval(days => p_days);
  return jsonb_build_object(
    'days', p_days,
    'since', v_since,
    'totals', (select jsonb_build_object('redemptions', count(*), 'students', count(distinct student_id), 'businesses', count(distinct merchant_id),
                                         'saved', coalesce(sum(discount_amount), 0), 'student_sales', coalesce(sum(final_price), 0))
               from public.redemptions where voided_at is null and redeemed_at >= v_since),
    'voided', (select count(*) from public.redemptions where voided_at is not null and redeemed_at >= v_since),
    'new_students_verified', (select count(*) from public.student_verifications where status = 'approved' and decided_at >= v_since),
    'new_businesses', (select count(*) from public.merchants where approved_at >= v_since),
    'by_institution', coalesce((
      select jsonb_agg(jsonb_build_object('name', i.short_name, 'redemptions', x.n, 'students', x.s, 'saved', x.saved) order by x.n desc)
      from (select institution_id, count(*) as n, count(distinct student_id) as s, sum(discount_amount) as saved
            from public.redemptions where voided_at is null and redeemed_at >= v_since group by institution_id) x
      join public.institutions i on i.id = x.institution_id), '[]'::jsonb),
    'by_business', coalesce((
      select jsonb_agg(jsonb_build_object('name', m.display_name, 'redemptions', x.n, 'students', x.s, 'saved', x.saved) order by x.n desc)
      from (select merchant_id, count(*) as n, count(distinct student_id) as s, sum(discount_amount) as saved
            from public.redemptions where voided_at is null and redeemed_at >= v_since group by merchant_id order by count(*) desc limit 50) x
      join public.merchants m on m.id = x.merchant_id), '[]'::jsonb),
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object('name', c.name, 'redemptions', x.n, 'saved', x.saved) order by x.n desc)
      from (select m.category_id, count(*) as n, sum(r.discount_amount) as saved
            from public.redemptions r join public.merchants m on m.id = r.merchant_id
            where r.voided_at is null and r.redeemed_at >= v_since group by m.category_id) x
      join public.merchant_categories c on c.id = x.category_id), '[]'::jsonb),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d, 'redemptions', n, 'saved', saved) order by d)
      from (select (redeemed_at at time zone 'Africa/Accra')::date as d, count(*) as n, sum(discount_amount) as saved
            from public.redemptions where voided_at is null and redeemed_at >= v_since group by 1) x), '[]'::jsonb)
  );
end;
$$;

revoke execute on function
  public.institution_overview(), public.institution_students(uuid, text, text), public.admin_list_staff(),
  public.admin_set_platform_role_by_email(text, public.platform_role), public.admin_list_settings(), public.admin_set_setting(text, int),
  public.admin_report(int)
  from public, anon;
grant execute on function
  public.institution_overview(), public.institution_students(uuid, text, text), public.admin_list_staff(),
  public.admin_set_platform_role_by_email(text, public.platform_role), public.admin_list_settings(), public.admin_set_setting(text, int),
  public.admin_report(int)
  to authenticated;

revoke execute on all functions in schema private from public;
