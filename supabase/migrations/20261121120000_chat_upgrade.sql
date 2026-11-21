-- Chat upgrade, for both business chats (conversations/messages) and friend chats
-- (friend_chats/friend_messages):
--   * replies: a message can quote an earlier message from the same chat
--   * photos: one photo per message, in the private "chat-photos" bucket, readable only by
--     the people in that chat; a message can be a photo with no text
--   * reactions: one emoji per person per message, from a fixed set; removing one sets it
--     to null (an UPDATE, which live updates filter by row security; deletes are not)
--   * seen: chats' read markers are sent live to the people in them, and the chat details
--     include when the other side last read it
--   * typing: short-lived "typing" signals on private Realtime channels that only the
--     people in the chat may join (nothing is stored)
-- Photo paths: <shop|friend>/<chat id>/<uploader id>/<random id>.<webp|jpg|png>

-- Columns ------------------------------------------------------------------------------------

alter table public.messages
  add column reply_to uuid references public.messages (id) on delete set null,
  add column photo_path text check (photo_path is null or char_length(photo_path) <= 200),
  drop constraint messages_body_check,
  add constraint messages_body_check check (
    char_length(body) <= 1000 and (char_length(body) >= 1 or photo_path is not null));

alter table public.friend_messages
  add column reply_to uuid references public.friend_messages (id) on delete set null,
  add column photo_path text check (photo_path is null or char_length(photo_path) <= 200),
  drop constraint friend_messages_body_check,
  add constraint friend_messages_body_check check (
    char_length(body) <= 1000 and (char_length(body) >= 1 or photo_path is not null));

-- Reactions ----------------------------------------------------------------------------------

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🙏')),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table public.friend_message_reactions (
  message_id uuid not null references public.friend_messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🙏')),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_reactions enable row level security;
alter table public.friend_message_reactions enable row level security;
revoke all on table public.message_reactions, public.friend_message_reactions from anon, authenticated, service_role;
grant select on table public.message_reactions, public.friend_message_reactions to authenticated;

create policy "people in a chat read its reactions" on public.message_reactions
  for select to authenticated
  using (exists (select 1 from public.messages m
                 where m.id = message_id and (select private.chat_side(m.conversation_id)) is not null));
create policy "people in a friend chat read its reactions" on public.friend_message_reactions
  for select to authenticated
  using (exists (select 1 from public.friend_messages m
                 where m.id = message_id and (select private.friend_chat_member(m.chat_id))));

-- Friend chats become readable by the two people in them (for live "seen").
grant select on table public.friend_chats to authenticated;
create policy "people in a friend chat read it" on public.friend_chats
  for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.message_reactions, public.friend_message_reactions,
      public.conversations, public.friend_chats;
  end if;
end;
$$;

-- Photos -------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-photos', 'chat-photos', false, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- The chat a photo path belongs to: kind and chat id, or nulls if the path isn't one.
create function private.chat_photo_parts(p_name text, out kind text, out chat_id uuid, out uploader uuid)
language sql
immutable
set search_path = ''
as $$
  select m[1], m[2]::uuid, m[3]::uuid
  from regexp_match(coalesce(p_name, ''),
    '^(shop|friend)/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/[0-9a-f-]{36}\.(webp|jpg|png)$') as m;
$$;

-- Anyone in the chat may see its photos.
create function private.can_read_chat_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p.kind
           when 'shop' then private.chat_side(p.chat_id) is not null
           when 'friend' then private.friend_chat_member(p.chat_id)
           else false end
  from private.chat_photo_parts(p_name) p;
$$;

-- Only someone who may send in the chat may upload, into their own folder.
create function private.can_write_chat_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p.uploader = (select auth.uid())
     and case p.kind
           when 'shop' then exists (
             select 1 from public.conversations c
             where c.id = p.chat_id
               and (private.chat_side(c.id) = 'merchant' or (private.chat_side(c.id) = 'student' and c.blocked_at is null)))
           when 'friend' then exists (
             select 1 from public.friend_chats c
             where c.id = p.chat_id and (select auth.uid()) in (c.user_a, c.user_b) and private.are_friends(c.user_a, c.user_b))
           else false end
  from private.chat_photo_parts(p_name) p;
$$;

revoke execute on function private.chat_photo_parts(text), private.can_read_chat_photo(text), private.can_write_chat_photo(text)
  from public, anon;
grant execute on function private.can_read_chat_photo(text), private.can_write_chat_photo(text) to authenticated;

create policy "people in a chat upload photos to it" on storage.objects
  for insert to authenticated with check (bucket_id = 'chat-photos' and (select private.can_write_chat_photo(name)));
create policy "people in a chat see its photos" on storage.objects
  for select to authenticated using (bucket_id = 'chat-photos' and (select private.can_read_chat_photo(name)));

-- A photo sent with a message must be one the sender uploaded to this chat.
create function private.check_chat_photo(p_kind text, p_chat_id uuid, p_path text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare p record;
begin
  if p_path is null then return; end if;
  select * into p from private.chat_photo_parts(p_path);
  if p.kind is distinct from p_kind or p.chat_id is distinct from p_chat_id or p.uploader is distinct from (select auth.uid())
     or not exists (select 1 from storage.objects o where o.bucket_id = 'chat-photos' and o.name = p_path) then
    raise exception 'photo_invalid' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function private.check_chat_photo(text, uuid, text) from public, anon, authenticated;

-- Typing channels ------------------------------------------------------------------------------
-- Topics: chat:shop:<conversation id> and chat:friend:<chat id>.

create function private.can_use_chat_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case m[1]
           when 'shop' then private.chat_side(m[2]::uuid) is not null
           when 'friend' then private.friend_chat_member(m[2]::uuid)
           else false end
  from regexp_match(coalesce(p_topic, ''), '^chat:(shop|friend):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$') as m;
$$;
revoke execute on function private.can_use_chat_topic(text) from public, anon;
grant execute on function private.can_use_chat_topic(text) to authenticated;

do $$
begin
  if to_regclass('realtime.messages') is not null and to_regprocedure('realtime.topic()') is not null then
    execute $p$
      create policy "chat members receive typing signals" on realtime.messages
        for select to authenticated
        using (realtime.messages.extension = 'broadcast' and (select private.can_use_chat_topic(realtime.topic())))
    $p$;
    execute $p$
      create policy "chat members send typing signals" on realtime.messages
        for insert to authenticated
        with check (realtime.messages.extension = 'broadcast' and (select private.can_use_chat_topic(realtime.topic())))
    $p$;
  end if;
end;
$$;

-- Sending ----------------------------------------------------------------------------------------

drop function public.send_message(uuid, text);
create function public.send_message(p_conversation_id uuid, p_body text, p_reply_to uuid default null, p_photo_path text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_side text := private.chat_side(p_conversation_id);
  v_body text := btrim(coalesce(p_body, ''));
  v_preview text;
  v_conv public.conversations;
  v_shop text;
  v_name text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if v_side is null then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if char_length(v_body) > 1000 or (char_length(v_body) = 0 and p_photo_path is null) then
    raise exception 'message_invalid' using errcode = 'P0001';
  end if;
  select * into v_conv from public.conversations where id = p_conversation_id for update;
  if v_side = 'student' and v_conv.blocked_at is not null then raise exception 'chat_blocked' using errcode = 'P0001'; end if;
  if v_side = 'student' and not private.merchant_is_listed(v_conv.merchant_id) then
    raise exception 'merchant_not_found' using errcode = 'P0001';
  end if;
  if p_reply_to is not null and not exists (select 1 from public.messages where id = p_reply_to and conversation_id = p_conversation_id) then
    raise exception 'reply_invalid' using errcode = 'P0001';
  end if;
  perform private.check_chat_photo('shop', p_conversation_id, p_photo_path);
  perform private.check_rate_limit('chat.send', 20, interval '1 minute', v_uid::text);

  insert into public.messages (conversation_id, sender_id, sender_side, body, reply_to, photo_path)
  values (p_conversation_id, v_uid, v_side, v_body, p_reply_to, p_photo_path)
  returning id into v_id;

  v_preview := case when v_body = '' then 'Photo' else left(v_body, 140) end;
  update public.conversations
     set last_message_at = clock_timestamp(),
         last_message_preview = v_preview,
         last_sender = v_side,
         student_read_at = case when v_side = 'student' then clock_timestamp() else student_read_at end,
         merchant_read_at = case when v_side = 'merchant' then clock_timestamp() else merchant_read_at end
   where id = p_conversation_id;

  select display_name into v_shop from public.merchants where id = v_conv.merchant_id;
  if v_side = 'student' then
    select coalesce(nullif(btrim(first_name), ''), 'A student') into v_name from public.profiles where id = v_uid;
    perform private.notify_chat(mu.user_id, 'Message from ' || coalesce(v_name, 'a student'),
      case when v_body = '' then 'Sent a photo' else left(v_body, 140) end, '/merchant/messages/' || p_conversation_id)
    from public.merchant_users mu
    where mu.merchant_id = v_conv.merchant_id and mu.status = 'active' and mu.role in ('owner', 'manager') and mu.user_id <> v_uid;
  else
    perform private.notify_chat(v_conv.student_id, coalesce(v_shop, 'A business') || ' replied',
      case when v_body = '' then 'Sent a photo' else left(v_body, 140) end, '/student/messages/' || p_conversation_id);
  end if;
  return v_id;
end;
$$;

drop function public.send_friend_message(uuid, text);
create function public.send_friend_message(p_chat_id uuid, p_body text, p_reply_to uuid default null, p_photo_path text default null)
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
begin
  perform private.require_verified_student();
  select * into v_chat from public.friend_chats where id = p_chat_id for update;
  if not found or v_uid not in (v_chat.user_a, v_chat.user_b) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  v_other := case when v_chat.user_a = v_uid then v_chat.user_b else v_chat.user_a end;
  if not private.are_friends(v_uid, v_other) then raise exception 'not_friends' using errcode = 'P0001'; end if;
  if char_length(v_body) > 1000 or (char_length(v_body) = 0 and p_photo_path is null) then
    raise exception 'message_invalid' using errcode = 'P0001';
  end if;
  if p_reply_to is not null and not exists (select 1 from public.friend_messages where id = p_reply_to and chat_id = p_chat_id) then
    raise exception 'reply_invalid' using errcode = 'P0001';
  end if;
  perform private.check_chat_photo('friend', p_chat_id, p_photo_path);
  perform private.check_rate_limit('friends.chat', 20, interval '1 minute', v_uid::text);

  insert into public.friend_messages (chat_id, sender_id, body, reply_to, photo_path)
  values (p_chat_id, v_uid, v_body, p_reply_to, p_photo_path)
  returning id into v_id;
  update public.friend_chats
     set last_message_at = clock_timestamp(),
         last_message_preview = case when v_body = '' then 'Photo' else left(v_body, 140) end,
         last_sender = v_uid,
         a_read_at = case when user_a = v_uid then clock_timestamp() else a_read_at end,
         b_read_at = case when user_b = v_uid then clock_timestamp() else b_read_at end
   where id = p_chat_id;

  if v_chat.last_message_at is null or v_chat.last_sender is distinct from v_uid
     or v_chat.last_message_at < now() - interval '10 minutes' then
    perform private.notify(v_other, 'friendchat.message', 'Message from ' || private.student_name(v_uid),
      case when v_body = '' then 'Sent a photo' else left(v_body, 140) end, '/student/friends/chat/' || p_chat_id);
  end if;
  return v_id;
end;
$$;

-- Reactions: one per person per message; null removes it.
create function public.react_to_message(p_message_id uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_conv uuid;
begin
  select conversation_id into v_conv from public.messages where id = p_message_id;
  if v_conv is null or private.chat_side(v_conv) is null then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_emoji is not null and p_emoji not in ('👍', '❤️', '😂', '😮', '😢', '🙏') then
    raise exception 'reaction_invalid' using errcode = 'P0001';
  end if;
  perform private.check_rate_limit('chat.react', 60, interval '1 minute', (select auth.uid())::text);
  insert into public.message_reactions (message_id, user_id, emoji) values (p_message_id, (select auth.uid()), p_emoji)
  on conflict (message_id, user_id) do update set emoji = excluded.emoji, updated_at = now();
end;
$$;

create function public.react_to_friend_message(p_message_id uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_chat public.friend_chats;
begin
  perform private.require_verified_student();
  select c.* into v_chat from public.friend_messages m join public.friend_chats c on c.id = m.chat_id where m.id = p_message_id;
  if v_chat.id is null or (select auth.uid()) not in (v_chat.user_a, v_chat.user_b) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if not private.are_friends(v_chat.user_a, v_chat.user_b) then raise exception 'not_friends' using errcode = 'P0001'; end if;
  if p_emoji is not null and p_emoji not in ('👍', '❤️', '😂', '😮', '😢', '🙏') then
    raise exception 'reaction_invalid' using errcode = 'P0001';
  end if;
  perform private.check_rate_limit('chat.react', 60, interval '1 minute', (select auth.uid())::text);
  insert into public.friend_message_reactions (message_id, user_id, emoji) values (p_message_id, (select auth.uid()), p_emoji)
  on conflict (message_id, user_id) do update set emoji = excluded.emoji, updated_at = now();
end;
$$;

-- Chat details now say when the other side last read the chat ("Seen").
create or replace function public.get_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_side text := private.chat_side(p_conversation_id);
begin
  if v_side is null then return null; end if;
  return (
    select jsonb_build_object(
      'id', c.id, 'side', v_side, 'merchant_id', m.id, 'merchant_name', m.display_name, 'merchant_slug', m.slug,
      'merchant_phone', m.phone, 'merchant_whatsapp', m.whatsapp,
      'student_name', case when v_side = 'merchant'
                           then coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.first_name), ''), 'Student') end,
      'blocked', c.blocked_at is not null,
      'other_read_at', case when v_side = 'student' then c.merchant_read_at else c.student_read_at end)
    from public.conversations c
    join public.merchants m on m.id = c.merchant_id
    join public.profiles p on p.id = c.student_id
    where c.id = p_conversation_id);
end;
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
    'other_read_at', case when c.user_a = (select auth.uid()) then c.b_read_at else c.a_read_at end)
  from public.friend_chats c
  cross join lateral (select case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end as id) o
  where c.id = p_chat_id and (select auth.uid()) in (c.user_a, c.user_b);
$$;

revoke execute on function public.send_message(uuid, text, uuid, text), public.send_friend_message(uuid, text, uuid, text),
  public.react_to_message(uuid, text), public.react_to_friend_message(uuid, text) from public, anon;
grant execute on function public.send_message(uuid, text, uuid, text), public.send_friend_message(uuid, text, uuid, text),
  public.react_to_message(uuid, text), public.react_to_friend_message(uuid, text) to authenticated;
