-- Account deletion, done by the database instead of by hand (Android spec, section B).
--
-- Before this, an admin marked a request "completed" and then ran SQL from the
-- runbook, which missed chats, photos, ratings, tickets, push devices and more,
-- and nothing told anyone a request was waiting. Now:
--   * admins are told when a request arrives, and again on day 20 if it is still open;
--   * an admin (aal2) previews what will go, then completes it in one transaction;
--   * the files the person left in Storage are queued and removed by the daily job;
--   * "completed" can no longer be set without the deletion actually running.
--
-- What is kept, and why: completed redemptions, redemption sessions and bookings
-- are the business's and Perqly's record of discounts given. They stay attached to
-- the profile row, which is emptied (no name, phone or photo) and can't sign in.

-- Columns --------------------------------------------------------------------------------

alter table public.profiles add column deleted_at timestamptz;

alter table public.account_deletion_requests
  add column source text not null default 'app' check (source in ('app', 'email')),
  add column reminded_at timestamptz;

-- A deleted profile stays empty and closed: it can't be restored or refilled.
create function private.keep_deleted_profile_closed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is null or not new.is_suspended
     or new.full_name is not null or new.first_name is not null or new.phone is not null or new.avatar_path is not null then
    raise exception 'account_deleted' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function private.keep_deleted_profile_closed() from public, anon, authenticated;

create trigger profiles_keep_deleted_closed
  before update on public.profiles
  for each row
  when (old.deleted_at is not null)
  execute function private.keep_deleted_profile_closed();

-- Files to remove from Storage (done by the daily job) ----------------------------------

create table public.account_media_purge (
  bucket text not null check (bucket in ('pass-photos', 'chat-photos', 'verification-documents')),
  path text not null check (char_length(path) between 3 and 400),
  request_id uuid references public.account_deletion_requests (id) on delete set null,
  claimed_at timestamptz,
  attempts int not null default 0 check (attempts >= 0),
  last_error text check (last_error is null or char_length(last_error) <= 300),
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (bucket, path)
);
create index account_media_purge_due on public.account_media_purge (created_at) where purged_at is null;
create index account_media_purge_request on public.account_media_purge (request_id);
alter table public.account_media_purge enable row level security;
revoke all on table public.account_media_purge from anon, authenticated, service_role;

-- Alerts ---------------------------------------------------------------------------------

create function private.alert_admins_of_deletion_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify(
    s.user_id,
    'account.deletion_requested',
    'New account deletion request',
    'Someone asked for their account to be deleted. It must be done within 30 days.',
    '/admin/users')
  from public.platform_staff s
  join public.profiles p on p.id = s.user_id and not p.is_suspended
  where s.role >= 'admin'
    and s.user_id <> new.user_id;
  return null;
end;
$$;
revoke execute on function private.alert_admins_of_deletion_request() from public, anon, authenticated;

create trigger account_deletion_requests_alert_admins
  after insert on public.account_deletion_requests
  for each row
  when (new.status = 'open')
  execute function private.alert_admins_of_deletion_request();

-- Daily: requests open for 20 days or more get one reminder to every admin.
create function public.remind_overdue_account_deletions()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_count int;
begin
  with due as (
    update public.account_deletion_requests
       set reminded_at = now()
     where status = 'open' and reminded_at is null and created_at <= now() - interval '20 days'
    returning id, created_at)
  select count(*) into v_count from due;
  if v_count > 0 then
    perform private.notify(
      s.user_id,
      'account.deletion_overdue',
      'Account deletion requests waiting',
      v_count || ' deletion request' || case when v_count = 1 then ' has' else 's have' end
        || ' been open for 20 days. Each must be done within 30 days of the request.',
      '/admin/users')
    from public.platform_staff s
    join public.profiles p on p.id = s.user_id and not p.is_suspended
    where s.role >= 'admin';
  end if;
  return v_count;
end;
$$;

-- Requests by email ----------------------------------------------------------------------

-- For someone who emailed from their account's address: support records it so the
-- 30 days are tracked like any other request.
create function public.admin_open_deletion_request(p_user_id uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id and deleted_at is null) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  select id into v_id from public.account_deletion_requests where user_id = p_user_id and status = 'open';
  if v_id is not null then return v_id; end if;
  insert into public.account_deletion_requests (user_id, note, source)
  values (p_user_id, left(btrim(p_note), 500), 'email')
  returning id into v_id;
  perform private.write_audit('account.deletion_requested', 'platform:admin', 'profile', p_user_id, null, null,
    jsonb_build_object('request_id', v_id, 'source', 'email'));
  return v_id;
end;
$$;

-- What stops a deletion ------------------------------------------------------------------

-- Things a person has to hand over first, so a business or club is never left without anyone.
create function private.account_deletion_blockers(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
    case when exists (select 1 from public.platform_staff where user_id = p_user) then 'platform_staff' end,
    case when exists (select 1 from public.merchant_users
                      where user_id = p_user and role = 'owner' and status = 'active') then 'business_owner' end,
    case when exists (select 1 from public.organisation_members m
                      where m.user_id = p_user and m.role = 'owner' and m.status = 'active'
                        and not exists (select 1 from public.organisation_members o
                                        where o.organisation_id = m.organisation_id and o.user_id <> p_user
                                          and o.role = 'owner' and o.status = 'active')) then 'last_club_owner' end
  ], null);
$$;
revoke execute on function private.account_deletion_blockers(uuid) from public, anon, authenticated;

-- The Storage files that belong to the person, or to chats that are deleted with them.
create function private.account_deletion_files(p_user uuid)
returns table (bucket text, path text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name
  from storage.objects o
  where (o.bucket_id = 'pass-photos' and private.pass_photo_owner(o.name) = p_user)
     or (o.bucket_id = 'verification-documents' and o.name like p_user::text || '/%')
     or (o.bucket_id = 'chat-photos' and (
           (select x.uploader from private.chat_photo_parts(o.name) x) = p_user
        or exists (select 1 from private.chat_photo_parts(o.name) x
                   where (x.kind = 'shop' and x.chat_id in (select c.id from public.conversations c where c.student_id = p_user))
                      or (x.kind = 'friend' and x.chat_id in (select f.id from public.friend_chats f where p_user in (f.user_a, f.user_b))))))
  union
  select 'pass-photos', p.avatar_path from public.profiles p where p.id = p_user and p.avatar_path is not null
  union
  select 'verification-documents', v.id_card_path from public.student_verifications v
   where v.student_id = p_user and v.id_card_path is not null and v.documents_deleted_at is null
  union
  select 'verification-documents', v.selfie_path from public.student_verifications v
   where v.student_id = p_user and v.selfie_path is not null and v.documents_deleted_at is null
  union
  select 'chat-photos', m.photo_path from public.messages m
   join public.conversations c on c.id = m.conversation_id
   where c.student_id = p_user and m.photo_path is not null
  union
  select 'chat-photos', m.photo_path from public.friend_messages m
   join public.friend_chats f on f.id = m.chat_id
   where p_user in (f.user_a, f.user_b) and m.photo_path is not null;
$$;
revoke execute on function private.account_deletion_files(uuid) from public, anon, authenticated;

-- Preview --------------------------------------------------------------------------------

create function public.admin_preview_account_deletion(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_user uuid;
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select user_id into v_user from public.account_deletion_requests where id = p_request_id and status = 'open';
  if v_user is null then raise exception 'request_not_open' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'blockers', to_jsonb(private.account_deletion_blockers(v_user)),
    'deleted', jsonb_build_object(
      'shop_chats', (select count(*) from public.conversations where student_id = v_user),
      'friend_chats', (select count(*) from public.friend_chats where v_user in (user_a, user_b)),
      'friends', (select count(*) from public.friendships where v_user in (user_a, user_b)),
      'ratings', (select count(*) from public.merchant_reviews where student_id = v_user),
      'saved_businesses', (select count(*) from public.favourites where student_id = v_user),
      'event_tickets', (select count(*) from public.event_tickets where user_id = v_user and checked_in_at is null),
      'event_rsvps', (select count(*) from public.event_rsvps where user_id = v_user),
      'campus_comments', (select count(*) from public.post_comments where author_id = v_user),
      'push_devices', (select count(*) from public.push_subscriptions where user_id = v_user),
      'files', (select count(*) from private.account_deletion_files(v_user))),
    'kept', jsonb_build_object(
      'redemptions', (select count(*) from public.redemptions where student_id = v_user),
      'bookings', (select count(*) from public.bookings where student_id = v_user),
      'campus_posts', (select count(*) from public.campus_posts where author_id = v_user)));
end;
$$;

-- Complete -------------------------------------------------------------------------------

-- Runs the whole deletion in one transaction. Returns the account's email (so the
-- app can send the confirmation, once, after this commits) and counts only.
create function public.admin_complete_account_deletion(p_request_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_email text;
  v_blockers text[];
  v_files int;
  v_n int;
  v_counts jsonb := '{}'::jsonb;
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'reason_required' using errcode = 'P0001'; end if;

  select user_id into v_user from public.account_deletion_requests
   where id = p_request_id and status = 'open'
   for update;
  if v_user is null then raise exception 'request_not_open' using errcode = 'P0001'; end if;
  if v_user = (select auth.uid()) then raise exception 'cannot_delete_self' using errcode = 'P0001'; end if;

  v_blockers := private.account_deletion_blockers(v_user);
  if cardinality(v_blockers) > 0 then
    raise exception 'deletion_blocked' using errcode = 'P0001', detail = array_to_string(v_blockers, ',');
  end if;

  select email into v_email from auth.users where id = v_user;

  -- 1. Files first, while the rows that point at them still exist.
  insert into public.account_media_purge (bucket, path, request_id)
  select f.bucket, f.path, p_request_id from private.account_deletion_files(v_user) f
  on conflict (bucket, path) do update set purged_at = null, attempts = 0, last_error = null, claimed_at = null,
    request_id = excluded.request_id;
  get diagnostics v_files = row_count;

  -- 2. Chats: the whole shop chat goes, with the business's side (decision 3).
  delete from public.conversations where student_id = v_user;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('shop_chats', v_n);
  delete from public.friend_chats where v_user in (user_a, user_b);
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('friend_chats', v_n);
  delete from public.message_reactions where user_id = v_user;
  delete from public.friend_message_reactions where user_id = v_user;
  delete from public.chat_prefs where user_id = v_user;

  -- 3. Friends and sharing.
  delete from public.friendships where v_user in (user_a, user_b);
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('friends', v_n);
  delete from public.student_blocks where v_user in (blocker_id, blocked_id);
  delete from public.deal_shares where v_user in (sender_id, recipient_id);
  delete from public.student_social_settings where user_id = v_user;

  -- 4. Shops: ratings and saved businesses. Bookings stay, without the student's note.
  delete from public.merchant_reviews where student_id = v_user;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('ratings', v_n);
  delete from public.favourites where student_id = v_user;
  update public.bookings set student_note = null where student_id = v_user and student_note is not null;
  delete from public.student_savings where student_id = v_user;

  -- 5. Campus. Tickets already scanned at the door stay as an anonymous attendance record.
  delete from public.event_tickets where user_id = v_user and checked_in_at is null;
  delete from public.event_rsvps where user_id = v_user;
  delete from public.organisation_follows where user_id = v_user;
  delete from public.post_likes where user_id = v_user;
  delete from public.post_saves where user_id = v_user;
  delete from public.post_comments where author_id = v_user;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('campus_comments', v_n);
  update public.organisation_members set status = 'removed' where user_id = v_user and status = 'active';

  -- 6. Roles that aren't ownership.
  update public.merchant_users set status = 'removed', removed_at = now() where user_id = v_user and status <> 'removed';
  update public.institution_reviewers set status = 'removed', removed_at = now() where user_id = v_user and status <> 'removed';

  -- 7. Reports they made stay for moderators, without who made them.
  update public.chat_reports set reporter_id = null where reporter_id = v_user;
  update public.student_reports set reporter_id = null where reporter_id = v_user;
  update public.content_reports set reporter_id = null where reporter_id = v_user;
  update public.review_reports set reporter_id = null where reporter_id = v_user;
  update public.disputes set opened_by = null where opened_by = v_user;

  -- 8. Student record and verification applications (their photos are queued above).
  delete from public.student_profiles where user_id = v_user;
  delete from public.institution_requests where requested_by = v_user;

  -- 9. Devices and notifications, last, so nothing above can leave a new one behind.
  delete from public.push_subscriptions where user_id = v_user;
  delete from public.notification_preferences where user_id = v_user;
  delete from public.notifications where user_id = v_user;

  -- 10. The profile stays (redemptions point at it) but holds nothing about the person.
  update public.profiles
     set full_name = null, first_name = null, avatar_path = null, phone = null,
         is_suspended = true, suspended_reason = 'Account deleted', deleted_at = now()
   where id = v_user;

  -- 11. Sign-in: unusable address, banned, all sessions and second factors gone.
  update auth.users
     set email = 'deleted+' || v_user || '@invalid.perqly', phone = null,
         raw_user_meta_data = '{}'::jsonb, banned_until = 'infinity'
   where id = v_user;
  delete from auth.mfa_factors where user_id = v_user;
  delete from auth.sessions where user_id = v_user;
  delete from auth.identities where user_id = v_user;

  update public.account_deletion_requests
     set status = 'completed', handled_by = (select auth.uid()), handled_note = left(btrim(p_note), 500), handled_at = now(),
         note = null
   where id = p_request_id;

  v_counts := v_counts || jsonb_build_object('files_queued', v_files);
  perform private.write_audit('account.deletion_completed', 'platform:admin', 'profile', v_user, null, null,
    jsonb_build_object('request_id', p_request_id) || v_counts);

  return jsonb_build_object('email', v_email, 'counts', v_counts);
end;
$$;

-- "Completed" now only comes from the function above; this one only declines.
create or replace function public.resolve_account_deletion(p_request_id uuid, p_status text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid;
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_status = 'completed' then raise exception 'use_complete_deletion' using errcode = 'P0001'; end if;
  if p_status is distinct from 'declined' then raise exception 'status_invalid' using errcode = 'P0001'; end if;
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

-- Storage clean-up (service role only; called by the daily job) --------------------------

create function public.claim_account_media_due(p_limit int default 100)
returns table (bucket text, path text)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select q.bucket, q.path from public.account_media_purge q
    where q.purged_at is null and q.attempts < 7
      and (q.claimed_at is null or q.claimed_at < now() - interval '15 minutes')
    order by q.created_at
    limit least(greatest(coalesce(p_limit, 100), 1), 200)
    for update skip locked)
  update public.account_media_purge q set claimed_at = now()
  from due where q.bucket = due.bucket and q.path = due.path
  returning q.bucket, q.path;
$$;

create function public.mark_account_media_purged(p_bucket text, p_paths text[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_count int;
begin
  update public.account_media_purge set purged_at = now(), claimed_at = null
   where bucket = p_bucket and path = any (coalesce(p_paths, '{}')) and purged_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.mark_account_media_failed(p_bucket text, p_path text, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.account_media_purge
     set attempts = attempts + 1, claimed_at = null, last_error = left(coalesce(p_error, 'unknown'), 300)
   where bucket = p_bucket and path = p_path and purged_at is null;
$$;

-- Grants ---------------------------------------------------------------------------------

revoke execute on function public.admin_open_deletion_request(uuid, text), public.admin_preview_account_deletion(uuid),
  public.admin_complete_account_deletion(uuid, text), public.resolve_account_deletion(uuid, text, text),
  public.remind_overdue_account_deletions(), public.claim_account_media_due(int),
  public.mark_account_media_purged(text, text[]), public.mark_account_media_failed(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_open_deletion_request(uuid, text), public.admin_preview_account_deletion(uuid),
  public.admin_complete_account_deletion(uuid, text), public.resolve_account_deletion(uuid, text, text)
  to authenticated;
grant execute on function public.remind_overdue_account_deletions(), public.claim_account_media_due(int),
  public.mark_account_media_purged(text, text[]), public.mark_account_media_failed(text, text, text)
  to service_role;
