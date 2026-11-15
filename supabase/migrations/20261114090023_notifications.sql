-- Notifications: the events that create them, each person's settings, phone
-- (web push) subscriptions, and the delivery queue the app works through.
--
-- In-app notifications are always created. Push and email are delivered by the
-- app server (src/lib/notifications/dispatch.ts) according to each person's
-- settings; this database only records what is pending and what was sent.

-- Categories --------------------------------------------------------------------------
create function private.notification_category(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case split_part(p_kind, '.', 1)
    when 'verification' then 'verification'
    when 'deal' then 'deals'
    when 'redemption' then 'redemptions'
    when 'merchant' then 'business'
    when 'offer' then 'business'
    when 'team' then 'business'
    when 'review' then 'review'
    else 'account'
  end;
$$;

alter table public.notifications
  add column category text generated always as (private.notification_category(kind)) stored,
  add column push_status text not null default 'pending' check (push_status in ('pending', 'processing', 'sent', 'skipped', 'failed')),
  add column email_status text not null default 'pending' check (email_status in ('pending', 'processing', 'sent', 'skipped', 'failed'));

-- Nothing created before this migration is pushed or emailed.
update public.notifications set push_status = 'skipped', email_status = 'skipped';

create index notifications_delivery_pending on public.notifications (created_at)
  where push_status = 'pending' or email_status = 'pending';

-- Live bell: the app listens for new rows (row-level security still applies).
grant select on table public.notifications to authenticated;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- Settings ----------------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('verification', 'deals', 'redemptions', 'business', 'review', 'account')),
  push boolean not null,
  email boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);
alter table public.notification_preferences enable row level security;
revoke all on table public.notification_preferences from anon, authenticated, service_role;
create policy "users read their notification settings" on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));
grant select on table public.notification_preferences to authenticated;

-- Defaults when someone hasn't chosen: push on for everything; email only for
-- verification decisions (they were already emailed before these settings existed).
create function private.wants_notification(p_user uuid, p_category text, p_channel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case p_channel when 'push' then push else email end
       from public.notification_preferences where user_id = p_user and category = p_category),
    case p_channel when 'push' then true else p_category = 'verification' end);
$$;

create function public.get_my_notification_preferences()
returns table (category text, push boolean, email boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.category,
         private.wants_notification((select auth.uid()), c.category, 'push'),
         private.wants_notification((select auth.uid()), c.category, 'email')
  from unnest(array['verification', 'deals', 'redemptions', 'business', 'review', 'account']) as c (category)
  where (select auth.uid()) is not null;
$$;

create function public.set_notification_preference(p_category text, p_push boolean, p_email boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_category not in ('verification', 'deals', 'redemptions', 'business', 'review', 'account') or p_push is null or p_email is null then
    raise exception 'preference_invalid' using errcode = 'P0001';
  end if;
  insert into public.notification_preferences (user_id, category, push, email)
  values (v_uid, p_category, p_push, p_email)
  on conflict (user_id, category) do update set push = excluded.push, email = excluded.email, updated_at = now();
end;
$$;

-- Phone notifications (web push) ------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 10 and 100),
  device_label text check (device_label is null or char_length(device_label) <= 120),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated, service_role;
-- No direct access: the functions below are the only way in.

-- Saves this device for the signed-in person. A device that was signed in as
-- someone else moves to the new person, so pushes never reach a previous user.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_device_label text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000
     or char_length(coalesce(p_p256dh, '')) not between 20 and 200 or char_length(coalesce(p_auth, '')) not between 10 and 100 then
    raise exception 'subscription_invalid' using errcode = 'P0001';
  end if;
  perform private.check_rate_limit('push.subscribe', 20, interval '1 hour', v_uid::text);
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device_label)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(nullif(btrim(coalesce(p_device_label, '')), ''), 120))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        device_label = excluded.device_label, created_at = now();
end;
$$;

create function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

create function public.count_my_push_devices()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.push_subscriptions where user_id = (select auth.uid());
$$;

-- Delivery queue (server only) --------------------------------------------------------
-- Hands the app server up to p_limit notifications to deliver, with what each
-- person wants and where to send it. Rows older than a day are dropped: a late
-- push is worse than none.
create function public.claim_notification_deliveries(p_limit int default 100)
returns table (
  id uuid, user_id uuid, kind text, category text, title text, body text, link text,
  send_push boolean, send_email boolean, email text, subscriptions jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_subs jsonb;
  v_push boolean;
  v_email boolean;
  v_address text;
begin
  update public.notifications n
     set push_status = case when n.push_status = 'pending' then 'skipped' else n.push_status end,
         email_status = case when n.email_status = 'pending' then 'skipped' else n.email_status end
   where (n.push_status = 'pending' or n.email_status = 'pending') and n.created_at < now() - interval '1 day';

  for r in
    select n.* from public.notifications n
     where n.push_status = 'pending' or n.email_status = 'pending'
     order by n.created_at
     limit least(greatest(coalesce(p_limit, 100), 1), 500)
     for update skip locked
  loop
    select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
      into v_subs from public.push_subscriptions s where s.user_id = r.user_id;
    select u.email into v_address from auth.users u where u.id = r.user_id;

    v_push := r.push_status = 'pending' and jsonb_array_length(v_subs) > 0
              and private.wants_notification(r.user_id, r.category, 'push');
    -- Verification decisions have their own, fuller email (sent by the review action).
    v_email := r.email_status = 'pending' and v_address is not null
               and r.kind not in ('verification.approved', 'verification.rejected', 'verification.resubmission')
               and private.wants_notification(r.user_id, r.category, 'email');

    update public.notifications n
       set push_status = case when r.push_status <> 'pending' then n.push_status when v_push then 'processing' else 'skipped' end,
           email_status = case when r.email_status <> 'pending' then n.email_status when v_email then 'processing' else 'skipped' end
     where n.id = r.id;

    if v_push or v_email then
      id := r.id; user_id := r.user_id; kind := r.kind; category := r.category; title := r.title; body := r.body; link := r.link;
      send_push := v_push; send_email := v_email;
      email := case when v_email then v_address end;
      subscriptions := case when v_push then v_subs else '[]'::jsonb end;
      return next;
    end if;
  end loop;
end;
$$;

create function public.finish_notification_delivery(p_id uuid, p_push text, p_email text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
     set push_status = case when push_status = 'processing' and p_push in ('sent', 'failed', 'skipped') then p_push else push_status end,
         email_status = case when email_status = 'processing' and p_email in ('sent', 'failed', 'skipped') then p_email else email_status end
   where id = p_id;
$$;

-- A push service said this device is gone (unsubscribed, app removed).
create function public.forget_push_endpoint(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

create function public.mark_push_endpoint_used(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.push_subscriptions set last_used_at = now() where endpoint = p_endpoint;
$$;

-- Creating notifications --------------------------------------------------------------
create function private.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select p_user, p_kind, left(p_title, 140), left(p_body, 500), p_link
  where p_user is not null;
$$;

create function private.notify_business_team(p_merchant uuid, p_kind text, p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.notify(mu.user_id, p_kind, p_title, p_body, p_link)
  from public.merchant_users mu
  where mu.merchant_id = p_merchant and mu.status = 'active' and mu.role in ('owner', 'manager');
$$;

create function private.notify_staff(p_min public.platform_role, p_kind text, p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.notify(ps.user_id, p_kind, p_title, p_body, p_link)
  from public.platform_staff ps
  where ps.role >= p_min;
$$;

-- Student verification
create function private.on_verification_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inst text;
begin
  select short_name into v_inst from public.institutions where id = new.institution_id;

  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    perform private.notify_staff('reviewer', 'review.student', 'New student to review',
      coalesce(v_inst, 'A student') || ' student sent their verification.', '/institution/reviews');
    perform private.notify(r.user_id, 'review.student', 'New student to review',
      coalesce(v_inst, 'A student') || ' student sent their verification.', '/institution/reviews')
    from public.institution_reviewers r
    where r.institution_id = new.institution_id and r.status = 'active'
      and not exists (select 1 from public.platform_staff ps where ps.user_id = r.user_id and ps.role >= 'reviewer');
  end if;

  if tg_op = 'UPDATE' and old.status = 'submitted' and new.status <> old.status then
    if new.status = 'approved' then
      perform private.notify(new.student_id, 'verification.approved', 'You''re verified',
        'Your student pass is ready. Show it at any Perqly business to get your discount.', '/student/me');
    elsif new.status = 'rejected' then
      perform private.notify(new.student_id, 'verification.rejected', 'Your verification wasn''t approved',
        case new.decision_reason
          when 'not_enrolled' then 'We couldn''t confirm that you''re currently enrolled.'
          when 'id_mismatch' then 'The student ID number didn''t match the one on your student ID card.'
          when 'photo_mismatch' then 'The selfie didn''t match the photo on the student ID.'
          when 'unreadable_documents' then 'The photos were too hard to read.'
          when 'duplicate_account' then 'This student ID is already verified on another Perqly account.'
          else coalesce(new.reviewer_note, 'See what to do next.')
        end, '/student/verify');
    elsif new.status = 'resubmission_requested' then
      perform private.notify(new.student_id, 'verification.resubmission', 'Perqly needs something else from you',
        coalesce(new.reviewer_note, 'Open your verification to see what to change.'), '/student/verify');
    end if;
  end if;
  return null;
end;
$$;
create trigger notify_verification_change after insert or update of status on public.student_verifications
  for each row execute function private.on_verification_change();

create function private.on_student_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.verification_status = 'verified' and new.verification_status = 'expired' then
    perform private.notify(new.user_id, 'verification.expired', 'Your student verification has expired',
      'Verify again to keep getting student discounts.', '/student/verify');
  end if;
  return null;
end;
$$;
create trigger notify_student_expiry after update of verification_status on public.student_profiles
  for each row execute function private.on_student_expiry();

-- Called by the daily job: a reminder 14 days before verification runs out, once per verification.
create function public.notify_expiring_verifications()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  insert into public.notifications (user_id, kind, title, body, link)
  select sp.user_id, 'verification.expiring', 'Your student verification ends soon',
         'It ends on ' || to_char(sp.verified_until at time zone 'Africa/Accra', 'FMDD FMMonth YYYY') || '. Verify again so your discounts don''t stop.',
         '/student/verify'
  from public.student_profiles sp
  where sp.verification_status = 'verified'
    and sp.verified_until > now() and sp.verified_until <= now() + interval '14 days'
    and not exists (
      select 1 from public.notifications n
      where n.user_id = sp.user_id and n.kind = 'verification.expiring' and n.created_at >= coalesce(sp.verified_at, '-infinity'));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Businesses
create function private.on_merchant_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then return null; end if;
  if new.status = 'pending_review' then
    perform private.notify_staff('admin', 'review.merchant', 'New business to review', new.display_name || ' applied to join Perqly.',
      '/admin/merchants/' || new.id);
  elsif new.status = 'approved' and old.status = 'pending_review' then
    perform private.notify_business_team(new.id, 'merchant.approved', new.display_name || ' is approved',
      'You can now publish deals for students.', '/merchant');
  elsif new.status = 'rejected' then
    perform private.notify_business_team(new.id, 'merchant.rejected', new.display_name || ' wasn''t approved',
      coalesce(new.status_reason, 'See your business page for details.'), '/merchant/business');
  elsif new.status = 'suspended' then
    perform private.notify_business_team(new.id, 'merchant.suspended', new.display_name || ' is suspended',
      coalesce(new.status_reason, 'Students can''t see your deals for now.'), '/merchant');
  elsif new.status = 'approved' and old.status = 'suspended' then
    perform private.notify_business_team(new.id, 'merchant.reinstated', new.display_name || ' is back on Perqly',
      'Your deals are visible to students again.', '/merchant');
  end if;
  return null;
end;
$$;
create trigger notify_merchant_change after update of status on public.merchants
  for each row execute function private.on_merchant_change();

-- Deals
create function private.on_offer_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchants;
  v_title text;
begin
  select * into v_merchant from public.merchants where id = new.merchant_id;
  v_title := coalesce(new.title,
    (select name from public.services where id = new.service_id),
    (select name from public.products where id = new.product_id), 'Your deal');

  if new.status is distinct from old.status then
    if new.status = 'pending_review' then
      perform private.notify_staff('admin', 'review.offer', 'New deal to review', v_merchant.display_name || ': ' || v_title, '/admin/offers');
    elsif new.status = 'active' and old.status = 'pending_review' then
      perform private.notify_business_team(new.merchant_id, 'offer.approved', 'Deal approved', v_title || ' is live for students.',
        '/merchant/offers/' || new.id);
    elsif new.status = 'rejected' and old.status = 'pending_review' then
      perform private.notify_business_team(new.merchant_id, 'offer.rejected', 'Deal not approved',
        v_title || ': ' || coalesce(new.status_reason, 'see the deal for details.'), '/merchant/offers/' || new.id);
    elsif new.status = 'rejected' and old.status in ('active', 'paused') then
      perform private.notify_business_team(new.merchant_id, 'offer.taken_down', 'Deal taken down',
        v_title || ': ' || coalesce(new.status_reason, 'see the deal for details.'), '/merchant/offers/' || new.id);
    end if;
  end if;

  -- First time a deal goes live: tell students who saved this business.
  if old.published_at is null and new.published_at is not null and new.status = 'active' and v_merchant.status = 'approved' then
    perform private.notify(f.student_id, 'deal.new', 'New deal at ' || v_merchant.display_name, v_title, '/student/offers/' || new.id)
    from public.favourites f
    where f.merchant_id = new.merchant_id;
  end if;
  return null;
end;
$$;
create trigger notify_offer_change after update of status, published_at on public.offers
  for each row execute function private.on_offer_change();

-- Teams
create function private.on_team_member_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and new.invited_by is not null and new.invited_by <> new.user_id
     and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    perform private.notify(new.user_id, 'team.added',
      'You''ve joined ' || (select display_name from public.merchants where id = new.merchant_id),
      'You were added as ' || case new.role when 'owner' then 'the owner' when 'manager' then 'a manager' else 'a cashier' end || '.',
      '/merchant');
  end if;
  return null;
end;
$$;
create trigger notify_team_member_added after insert or update of status on public.merchant_users
  for each row execute function private.on_team_member_added();

create function private.on_reviewer_appointed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    perform private.notify(new.user_id, 'account.reviewer',
      'You''re now a reviewer for ' || (select short_name from public.institutions where id = new.institution_id),
      'You can review student verifications.', '/institution');
  end if;
  return null;
end;
$$;
create trigger notify_reviewer_appointed after insert or update of status on public.institution_reviewers
  for each row execute function private.on_reviewer_appointed();

-- Institution requests
create function private.on_institution_request_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.notify_staff('admin', 'review.institution_request', 'New school request', new.institution_name,
      '/admin/institutions/requests');
  elsif new.status <> old.status and new.status = 'added' then
    perform private.notify(new.requested_by, 'account.institution_added', new.institution_name || ' is on Perqly',
      'You''ll be able to choose it on your profile once it opens to students.', '/student/profile');
  elsif new.status <> old.status and new.status = 'declined' then
    perform private.notify(new.requested_by, 'account.institution_declined', 'We couldn''t add ' || new.institution_name,
      coalesce(new.admin_note, 'It isn''t on the GTEC list of accredited institutions.'), '/student/profile');
  end if;
  return null;
end;
$$;
create trigger notify_institution_request after insert or update of status on public.institution_requests
  for each row execute function private.on_institution_request_change();

-- Verification decision email respects the person's email setting.
create or replace function public.get_verification_notice(p_application_id uuid)
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
    'verified_until', sp.verified_until,
    'email_wanted', private.wants_notification(v.student_id, 'verification', 'email')
  )
  from public.student_verifications v
  join auth.users u on u.id = v.student_id
  join public.profiles p on p.id = v.student_id
  join public.institutions i on i.id = v.institution_id
  join public.student_profiles sp on sp.user_id = v.student_id
  where v.id = p_application_id
    and v.status in ('approved', 'rejected', 'resubmission_requested');
$$;

-- Grants ------------------------------------------------------------------------------
revoke execute on function
  public.get_my_notification_preferences(), public.set_notification_preference(text, boolean, boolean),
  public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text), public.count_my_push_devices(),
  public.claim_notification_deliveries(int), public.finish_notification_delivery(uuid, text, text),
  public.forget_push_endpoint(text), public.mark_push_endpoint_used(text), public.notify_expiring_verifications()
from public, anon;
grant execute on function
  public.get_my_notification_preferences(), public.set_notification_preference(text, boolean, boolean),
  public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text), public.count_my_push_devices()
to authenticated;
revoke execute on function
  public.claim_notification_deliveries(int), public.finish_notification_delivery(uuid, text, text),
  public.forget_push_endpoint(text), public.mark_push_endpoint_used(text), public.notify_expiring_verifications()
from authenticated;
grant execute on function
  public.claim_notification_deliveries(int), public.finish_notification_delivery(uuid, text, text),
  public.forget_push_endpoint(text), public.mark_push_endpoint_used(text), public.notify_expiring_verifications()
to service_role;

revoke execute on all functions in schema private from public;
