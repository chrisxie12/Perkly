-- Disappearing messages in friend chats, like Snapchat.
--
-- Each friend chat has a setting either person can change; it applies to messages sent after
-- the change:
--   '24h'  (default) a message disappears 24 hours after it is sent;
--   '12h'  12 hours after it is sent;
--   'seen' once the other person has opened it and left the chat (an hour after opening at the
--          latest; seven days after sending if never opened).
-- A pinned message stays until it is unpinned. Messages disappear from the chat the moment they
-- expire (row security hides them); the daily cron then deletes the rows, queues their photos for
-- removal and blanks old chat notifications. Messages in a chat with an open report are kept until
-- support has handled it, so a report can still be looked into.

alter table public.friend_chats
  add column disappear text not null default '24h' check (disappear in ('24h', '12h', 'seen')),
  add column disappear_set_by uuid references public.profiles (id) on delete set null,
  add column disappear_set_at timestamptz;

alter table public.friend_messages
  add column once boolean not null default false,
  add column seen_at timestamptz,
  add column expires_at timestamptz;

-- Messages sent before this change get a day from now, so nothing vanishes the moment it ships.
update public.friend_messages set expires_at = now() + interval '24 hours' where expires_at is null;
alter table public.friend_messages alter column expires_at set not null;
create index friend_messages_expiry on public.friend_messages (expires_at) where pinned_at is null;

create function private.friend_message_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_mode text;
begin
  select disappear into v_mode from public.friend_chats where id = new.chat_id;
  new.once := v_mode = 'seen';
  new.seen_at := null;
  new.expires_at := new.created_at + case v_mode when '12h' then interval '12 hours'
                                                 when 'seen' then interval '7 days'
                                                 else interval '24 hours' end;
  return new;
end;
$$;
revoke execute on function private.friend_message_expiry() from public, anon, authenticated;

create trigger friend_messages_expiry before insert on public.friend_messages
  for each row execute function private.friend_message_expiry();

-- Only the functions below may move a message's expiry or mark it seen.
create function private.friend_message_keep_expiry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('perqly.friend_expiry', true) is distinct from 'on' then
    new.once := old.once;
    new.seen_at := old.seen_at;
    new.expires_at := old.expires_at;
  end if;
  return new;
end;
$$;
revoke execute on function private.friend_message_keep_expiry() from public, anon, authenticated;

create trigger friend_messages_keep_expiry before update on public.friend_messages
  for each row execute function private.friend_message_keep_expiry();

-- Expired messages are hidden at once, before the daily clean-up removes them.
drop policy "people in a friend chat read its messages" on public.friend_messages;
create policy "people in a friend chat read its messages" on public.friend_messages
  for select to authenticated
  using ((select private.friend_chat_member(chat_id)) and (pinned_at is not null or expires_at > now()));

-- Opening the chat: also marks "view once" messages as seen. They go when you leave the chat,
-- or an hour after you opened them if the app never says you left.
create or replace function public.mark_friend_chat_read(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  update public.friend_chats
     set a_read_at = case when user_a = v_uid then clock_timestamp() else a_read_at end,
         b_read_at = case when user_b = v_uid then clock_timestamp() else b_read_at end
   where id = p_chat_id and v_uid in (user_a, user_b);
  if not found then return; end if;
  perform set_config('perqly.friend_expiry', 'on', true);
  update public.friend_messages
     set seen_at = clock_timestamp(), expires_at = least(expires_at, clock_timestamp() + interval '1 hour')
   where chat_id = p_chat_id and once and seen_at is null
     and sender_id is distinct from v_uid and expires_at > now();
  perform set_config('perqly.friend_expiry', 'off', true);
end;
$$;

-- Leaving the chat: "view once" messages you have opened disappear now, for both of you.
create function public.leave_friend_chat(p_chat_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count int;
begin
  if not exists (select 1 from public.friend_chats where id = p_chat_id and v_uid in (user_a, user_b)) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  perform set_config('perqly.friend_expiry', 'on', true);
  update public.friend_messages
     set expires_at = now()
   where chat_id = p_chat_id and once and seen_at is not null
     and sender_id is distinct from v_uid and expires_at > now();
  get diagnostics v_count = row_count;
  perform set_config('perqly.friend_expiry', 'off', true);
  return v_count;
end;
$$;

-- Either friend can change the setting. It applies to messages sent from now on.
create function public.set_friend_chat_disappear(p_chat_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_chat public.friend_chats;
begin
  perform private.require_verified_student();
  if p_mode is null or p_mode not in ('24h', '12h', 'seen') then raise exception 'mode_invalid' using errcode = 'P0001'; end if;
  select * into v_chat from public.friend_chats where id = p_chat_id for update;
  if not found or v_uid not in (v_chat.user_a, v_chat.user_b) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if not private.are_friends(v_chat.user_a, v_chat.user_b) then raise exception 'not_friends' using errcode = 'P0001'; end if;
  if v_chat.disappear = p_mode then return; end if;
  perform private.check_rate_limit('friends.disappear', 10, interval '1 hour', v_uid::text);
  update public.friend_chats set disappear = p_mode, disappear_set_by = v_uid, disappear_set_at = clock_timestamp()
   where id = p_chat_id;
end;
$$;

-- Sending: unchanged, except a "view once" message never shows its words outside the chat.
create or replace function public.send_friend_message(p_chat_id uuid, p_body text, p_reply_to uuid default null, p_photo_path text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_chat public.friend_chats;
  v_other uuid;
  v_id uuid;
  v_preview text;
begin
  perform private.require_verified_student();
  select * into v_chat from public.friend_chats where id = p_chat_id for update;
  if not found or v_uid not in (v_chat.user_a, v_chat.user_b) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  v_other := case when v_chat.user_a = v_uid then v_chat.user_b else v_chat.user_a end;
  if not private.are_friends(v_uid, v_other) then raise exception 'not_friends' using errcode = 'P0001'; end if;
  if char_length(v_body) > 1000 or (char_length(v_body) = 0 and p_photo_path is null) then
    raise exception 'message_invalid' using errcode = 'P0001';
  end if;
  if p_reply_to is not null and not exists (
       select 1 from public.friend_messages
       where id = p_reply_to and chat_id = p_chat_id and (pinned_at is not null or expires_at > now())) then
    raise exception 'reply_invalid' using errcode = 'P0001';
  end if;
  perform private.check_chat_photo('friend', p_chat_id, p_photo_path);
  perform private.check_rate_limit('friends.chat', 20, interval '1 minute', v_uid::text);

  insert into public.friend_messages (chat_id, sender_id, body, reply_to, photo_path)
  values (p_chat_id, v_uid, v_body, p_reply_to, p_photo_path)
  returning id into v_id;
  v_preview := case when v_chat.disappear = 'seen' then 'New message'
                    when v_body = '' then 'Photo'
                    else left(v_body, 140) end;
  update public.friend_chats
     set last_message_at = clock_timestamp(),
         last_message_preview = v_preview,
         last_sender = v_uid,
         a_read_at = case when user_a = v_uid then clock_timestamp() else a_read_at end,
         b_read_at = case when user_b = v_uid then clock_timestamp() else b_read_at end
   where id = p_chat_id;

  if v_chat.last_message_at is null or v_chat.last_sender is distinct from v_uid
     or v_chat.last_message_at < now() - interval '10 minutes' then
    perform private.notify(v_other, 'friendchat.message', 'Message from ' || private.student_name(v_uid),
      case when v_chat.disappear = 'seen' then 'Sent you a message'
           when v_body = '' then 'Sent a photo'
           else left(v_body, 140) end,
      '/student/friends/chat/' || p_chat_id);
  end if;
  return v_id;
end;
$$;

-- The chat list shows the latest message still in the chat, and counts only those as unread.
create or replace function public.list_friend_chats()
returns table (id uuid, friend_id uuid, friend_name text, last_message_at timestamptz, last_message_preview text,
  last_from_me boolean, unread int, can_send boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, o.id, private.student_name(o.id), c.last_message_at,
         case when l.id is null then null
              when l.once then 'New message'
              when l.body = '' then 'Photo'
              else left(l.body, 140) end,
         c.last_sender = (select auth.uid()),
         (select count(*)::int from public.friend_messages x
           where x.chat_id = c.id and x.sender_id is distinct from (select auth.uid())
             and (x.pinned_at is not null or x.expires_at > now())
             and x.created_at > case when c.user_a = (select auth.uid()) then c.a_read_at else c.b_read_at end),
         private.are_friends(c.user_a, c.user_b)
  from public.friend_chats c
  cross join lateral (select case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end as id) o
  left join lateral (
    select m.id, m.body, m.once from public.friend_messages m
    where m.chat_id = c.id and (m.pinned_at is not null or m.expires_at > now())
    order by m.created_at desc limit 1) l on true
  where (select auth.uid()) in (c.user_a, c.user_b)
    and c.last_message_at is not null
    and not private.is_blocked_between(c.user_a, c.user_b)
  order by c.last_message_at desc
  limit 200;
$$;

create or replace function public.get_friend_chat(p_chat_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'friend_id', o.id, 'friend_name', private.student_name(o.id),
    'can_send', private.are_friends(c.user_a, c.user_b),
    'blocked', private.is_blocked_between(c.user_a, c.user_b),
    'other_read_at', case when c.user_a = (select auth.uid()) then c.b_read_at else c.a_read_at end,
    'disappear', c.disappear,
    'disappear_set_by_me', c.disappear_set_by = (select auth.uid()),
    'disappear_set_at', c.disappear_set_at)
  from public.friend_chats c
  cross join lateral (select case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end as id) o
  where c.id = p_chat_id and (select auth.uid()) in (c.user_a, c.user_b);
$$;

-- Daily clean-up (cron, service role). Returns how many messages were deleted.
create function public.purge_expired_friend_messages()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_count int;
begin
  with gone as (
    delete from public.friend_messages m
    where m.pinned_at is null and m.expires_at <= now()
      and not exists (select 1 from public.student_reports r where r.chat_id = m.chat_id and r.status = 'open')
    returning m.photo_path),
  photos as (
    insert into public.account_media_purge (bucket, path)
    select distinct 'chat-photos', g.photo_path from gone g where g.photo_path is not null
    on conflict (bucket, path) do nothing
    returning 1)
  select count(*) into v_count from gone;

  update public.friend_chats c set last_message_preview = null
   where c.last_message_preview is not null
     and not exists (select 1 from public.friend_messages m
                     where m.chat_id = c.id and (m.pinned_at is not null or m.expires_at > now()));
  -- Chat notifications quote the message; keep the words no longer than the messages themselves.
  update public.notifications set body = null
   where kind = 'friendchat.message' and body is not null and created_at < now() - interval '24 hours';
  return v_count;
end;
$$;

revoke execute on function public.leave_friend_chat(uuid), public.set_friend_chat_disappear(uuid, text),
  public.purge_expired_friend_messages() from public, anon, authenticated, service_role;
grant execute on function public.leave_friend_chat(uuid), public.set_friend_chat_disappear(uuid, text) to authenticated;
grant execute on function public.purge_expired_friend_messages() to service_role;
