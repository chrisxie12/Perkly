-- Phase 6: administration and launch readiness.
-- User lookup, platform and merchant analytics, redemption flags, the audit log
-- viewer, personal data export and account deletion requests.

-- Account deletion requests -------------------------------------------------------------
-- Deletion is handled by Perqly support, not automatically: completed redemptions
-- are kept (anonymised) as the merchant's and Perqly's record of discounts given.
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'completed', 'declined')),
  handled_by uuid references public.profiles (id),
  handled_note text check (handled_note is null or char_length(handled_note) <= 500),
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint account_deletion_handled check ((status = 'open') = (handled_at is null))
);
create unique index account_deletion_one_open on public.account_deletion_requests (user_id) where status = 'open';
create index account_deletion_handled_by on public.account_deletion_requests (handled_by);
alter table public.account_deletion_requests enable row level security;
revoke all on table public.account_deletion_requests from anon, authenticated, service_role;
grant select on table public.account_deletion_requests to authenticated;
create policy "users read their deletion requests" on public.account_deletion_requests
  for select to authenticated using (user_id = (select auth.uid()));
create policy "support reads deletion requests" on public.account_deletion_requests
  for select to authenticated using ((select private.is_staff('support')));

create function public.request_account_deletion(p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  select id into v_id from public.account_deletion_requests where user_id = (select auth.uid()) and status = 'open';
  if v_id is not null then return v_id; end if;
  perform private.check_rate_limit('account.deletion_request', 3, interval '1 day');
  insert into public.account_deletion_requests (user_id, note) values ((select auth.uid()), nullif(left(btrim(coalesce(p_note, '')), 500), ''))
  returning id into v_id;
  perform private.write_audit('account.deletion_requested', 'self', 'profile', (select auth.uid()), null, null, jsonb_build_object('request_id', v_id));
  return v_id;
end;
$$;

create function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.account_deletion_requests set status = 'declined', handled_at = now(), handled_note = 'Cancelled by the user'
   where user_id = (select auth.uid()) and status = 'open';
  if found then
    perform private.write_audit('account.deletion_cancelled', 'self', 'profile', (select auth.uid()));
  end if;
end;
$$;

create function public.resolve_account_deletion(p_request_id uuid, p_status text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid;
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_status not in ('completed', 'declined') then raise exception 'status_invalid' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  update public.account_deletion_requests
     set status = p_status, handled_by = (select auth.uid()), handled_note = left(btrim(p_note), 500), handled_at = now()
   where id = p_request_id and status = 'open'
   returning user_id into v_user;
  if v_user is null then raise exception 'request_not_open' using errcode = 'P0001'; end if;
  perform private.write_audit('account.deletion_' || p_status, 'platform:admin', 'profile', v_user, null, null,
    jsonb_build_object('request_id', p_request_id));
end;
$$;

-- Personal data export ------------------------------------------------------------------
-- Everything Perqly holds about the caller, minus internal secrets (the student ID
-- hash) and document storage paths.
create function public.export_my_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid)
  select jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('email', u.email, 'created_at', u.created_at) from auth.users u, me where u.id = me.uid),
    'profile', (select to_jsonb(p) - 'id' from public.profiles p, me where p.id = me.uid),
    'student_profile', (select to_jsonb(sp) - array['user_id', 'student_id_hash', 'current_verification_id'] from public.student_profiles sp, me where sp.user_id = me.uid),
    'verification_applications', coalesce((select jsonb_agg(jsonb_build_object('status', v.status, 'created_at', v.created_at, 'submitted_at', v.submitted_at,
                                                                              'decided_at', v.decided_at, 'decision_reason', v.decision_reason) order by v.created_at)
                                           from public.student_verifications v, me where v.student_id = me.uid), '[]'::jsonb),
    'saved_businesses', coalesce((select jsonb_agg(jsonb_build_object('business', m.display_name, 'saved_at', f.created_at))
                                  from public.favourites f join public.merchants m on m.id = f.merchant_id, me where f.student_id = me.uid), '[]'::jsonb),
    'redemptions', coalesce((select jsonb_agg(jsonb_build_object('reference', r.transaction_ref, 'business', m.display_name, 'item', r.item_name,
                                                                'regular_price', r.regular_price, 'discount', r.discount_amount, 'student_price', r.final_price,
                                                                'redeemed_at', r.redeemed_at, 'voided', r.voided_at is not null) order by r.redeemed_at)
                             from public.redemptions r join public.merchants m on m.id = r.merchant_id, me where r.student_id = me.uid), '[]'::jsonb),
    'savings', (select to_jsonb(s) - 'student_id' from public.student_savings s, me where s.student_id = me.uid),
    'business_memberships', coalesce((select jsonb_agg(jsonb_build_object('business', m.display_name, 'role', mu.role, 'status', mu.status, 'since', mu.created_at))
                                      from public.merchant_users mu join public.merchants m on m.id = mu.merchant_id, me where mu.user_id = me.uid), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(jsonb_build_object('title', n.title, 'body', n.body, 'created_at', n.created_at, 'read_at', n.read_at) order by n.created_at)
                               from public.notifications n, me where n.user_id = me.uid), '[]'::jsonb),
    'deletion_requests', coalesce((select jsonb_agg(jsonb_build_object('status', d.status, 'created_at', d.created_at, 'handled_at', d.handled_at))
                                   from public.account_deletion_requests d, me where d.user_id = me.uid), '[]'::jsonb)
  )
  where (select auth.uid()) is not null;
$$;

-- Users (support) -----------------------------------------------------------------------
create function public.admin_find_users(p_query text)
returns table (
  user_id uuid, email text, full_name text, is_suspended boolean, suspended_reason text, created_at timestamptz,
  platform_role public.platform_role, institution text, verification_status text, business_roles int, redemptions int
)
language plpgsql
security definer
set search_path = ''
as $$
declare v_q text := btrim(coalesce(p_query, ''));
begin
  if not (select private.is_staff('support')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if char_length(v_q) < 3 then return; end if;
  v_q := replace(replace(v_q, '%', ''), '_', '\_');
  return query
    select p.id, u.email::text, p.full_name, p.is_suspended, p.suspended_reason, p.created_at, ps.role, i.short_name,
           sp.verification_status::text,
           (select count(*)::int from public.merchant_users mu where mu.user_id = p.id and mu.status = 'active'),
           (select count(*)::int from public.redemptions r where r.student_id = p.id and r.voided_at is null)
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.platform_staff ps on ps.user_id = p.id
    left join public.student_profiles sp on sp.user_id = p.id
    left join public.institutions i on i.id = sp.institution_id
    where u.email ilike '%' || v_q || '%' or p.full_name ilike '%' || v_q || '%' or p.id::text = v_q
    order by p.created_at desc
    limit 50;
end;
$$;

-- Analytics -----------------------------------------------------------------------------
create function public.admin_platform_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff('support')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'students', (select count(*) from public.student_profiles),
    'students_verified', (select count(*) from public.student_profiles where verification_status = 'verified' and verified_until > now()),
    'applications_waiting', (select count(*) from public.student_verifications where status = 'submitted'),
    'merchants_live', (select count(*) from public.merchants where status = 'approved'),
    'merchants_waiting', (select count(*) from public.merchants where status = 'pending_review'),
    'offers_live', (select count(*) from public.offers o where o.status = 'active' and o.starts_at <= now() and (o.ends_at is null or o.ends_at > now())),
    'offers_waiting', (select count(*) from public.offers where status = 'pending_review'),
    'redemptions_7d', (select count(*) from public.redemptions where voided_at is null and redeemed_at > now() - interval '7 days'),
    'redemptions_30d', (select count(*) from public.redemptions where voided_at is null and redeemed_at > now() - interval '30 days'),
    'saved_30d', (select coalesce(sum(discount_amount), 0) from public.redemptions where voided_at is null and redeemed_at > now() - interval '30 days'),
    'saved_all', (select coalesce(sum(discount_amount), 0) from public.redemptions where voided_at is null),
    'deletion_requests_open', (select count(*) from public.account_deletion_requests where status = 'open'),
    'by_institution', coalesce((
      select jsonb_agg(jsonb_build_object('institution', i.short_name, 'redemptions', x.n, 'saved', x.saved) order by x.n desc)
      from (select institution_id, count(*) as n, sum(discount_amount) as saved from public.redemptions
            where voided_at is null and redeemed_at > now() - interval '30 days' group by institution_id) x
      join public.institutions i on i.id = x.institution_id), '[]'::jsonb)
  );
end;
$$;

-- Patterns worth a look (spec section 8): repeated sessions the merchant confirmed but
-- the student never completed, and confirmations where the phone reported it was far away.
create function public.admin_redemption_flags()
returns table (kind text, student_id uuid, student_name text, merchant_id uuid, merchant_name text, occurrences int, last_seen timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff('support')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return query
    select 'confirmed_not_completed'::text, s.student_id, p.full_name, s.merchant_id, m.display_name, count(*)::int, max(s.merchant_confirmed_at)
    from public.redemption_sessions s
    join public.profiles p on p.id = s.student_id
    join public.merchants m on m.id = s.merchant_id
    where s.merchant_confirmed_at > now() - interval '30 days' and s.completed_at is null and s.status in ('expired', 'cancelled')
    group by s.student_id, p.full_name, s.merchant_id, m.display_name
    having count(*) >= 2
    union all
    select 'far_from_branch'::text, s.student_id, p.full_name, s.merchant_id, m.display_name, count(*)::int, max(s.merchant_confirmed_at)
    from public.redemption_sessions s
    join public.profiles p on p.id = s.student_id
    join public.merchants m on m.id = s.merchant_id
    where s.merchant_confirmed_at > now() - interval '30 days' and s.location_signal = 'far'
    group by s.student_id, p.full_name, s.merchant_id, m.display_name
    order by 6 desc, 7 desc
    limit 100;
end;
$$;

create function public.merchant_metrics(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_merchant(p_merchant_id)) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'redemptions_7d', (select count(*) from public.redemptions where merchant_id = p_merchant_id and voided_at is null and redeemed_at > now() - interval '7 days'),
    'redemptions_30d', (select count(*) from public.redemptions where merchant_id = p_merchant_id and voided_at is null and redeemed_at > now() - interval '30 days'),
    'students_30d', (select count(distinct student_id) from public.redemptions where merchant_id = p_merchant_id and voided_at is null and redeemed_at > now() - interval '30 days'),
    'discounts_30d', (select coalesce(sum(discount_amount), 0) from public.redemptions where merchant_id = p_merchant_id and voided_at is null and redeemed_at > now() - interval '30 days'),
    'student_sales_30d', (select coalesce(sum(final_price), 0) from public.redemptions where merchant_id = p_merchant_id and voided_at is null and redeemed_at > now() - interval '30 days'),
    'saves', (select count(*) from public.favourites where merchant_id = p_merchant_id),
    'confirmed_not_completed_30d', (select count(*) from public.redemption_sessions where merchant_id = p_merchant_id and merchant_confirmed_at > now() - interval '30 days'
                                      and completed_at is null and status in ('expired', 'cancelled')),
    'top_offers', coalesce((
      select jsonb_agg(jsonb_build_object('offer_id', x.offer_id, 'title', coalesce(o.title, x.item_name), 'redemptions', x.n) order by x.n desc)
      from (select offer_id, max(item_name) as item_name, count(*) as n from public.redemptions
            where merchant_id = p_merchant_id and voided_at is null and redeemed_at > now() - interval '30 days'
            group by offer_id order by count(*) desc limit 5) x
      join public.offers o on o.id = x.offer_id), '[]'::jsonb),
    'by_branch', coalesce((
      select jsonb_agg(jsonb_build_object('branch', b.name, 'redemptions', x.n) order by x.n desc)
      from (select branch_id, count(*) as n from public.redemptions
            where merchant_id = p_merchant_id and voided_at is null and redeemed_at > now() - interval '30 days' group by branch_id) x
      join public.merchant_branches b on b.id = x.branch_id), '[]'::jsonb)
  );
end;
$$;

-- Audit log viewer (admins) --------------------------------------------------------------
create function public.admin_audit_log(p_action_prefix text default null, p_entity_id uuid default null, p_before_id bigint default null, p_limit int default 100)
returns table (
  id bigint, occurred_at timestamptz, actor_name text, actor_email text, actor_context text, action text, entity_type text, entity_id uuid,
  merchant_id uuid, institution_id uuid, before jsonb, after jsonb, metadata jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return query
    select a.id, a.occurred_at, p.full_name, u.email::text, a.actor_context, a.action, a.entity_type, a.entity_id, a.merchant_id, a.institution_id,
           a.before, a.after, a.metadata
    from public.audit_logs a
    left join public.profiles p on p.id = a.actor_id
    left join auth.users u on u.id = a.actor_id
    where (p_action_prefix is null or a.action like replace(replace(p_action_prefix, '%', ''), '_', '\_') || '%')
      and (p_entity_id is null or a.entity_id = p_entity_id or a.merchant_id = p_entity_id or a.institution_id = p_entity_id or a.actor_id = p_entity_id)
      and (p_before_id is null or a.id < p_before_id)
    order by a.id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

-- Unread notification count, for the account bar.
create function public.unread_notification_count()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.notifications where user_id = (select auth.uid()) and read_at is null;
$$;

-- Grants -------------------------------------------------------------------------------
revoke execute on function
  public.request_account_deletion(text), public.cancel_account_deletion(), public.resolve_account_deletion(uuid, text, text),
  public.export_my_data(), public.admin_find_users(text), public.admin_platform_metrics(), public.admin_redemption_flags(),
  public.merchant_metrics(uuid), public.admin_audit_log(text, uuid, bigint, int), public.unread_notification_count()
  from public, anon;
grant execute on function
  public.request_account_deletion(text), public.cancel_account_deletion(), public.resolve_account_deletion(uuid, text, text),
  public.export_my_data(), public.admin_find_users(text), public.admin_platform_metrics(), public.admin_redemption_flags(),
  public.merchant_metrics(uuid), public.admin_audit_log(text, uuid, bigint, int), public.unread_notification_count()
  to authenticated;

revoke execute on all functions in schema private from public;
