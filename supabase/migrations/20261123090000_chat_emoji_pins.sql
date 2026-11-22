-- Chat: any emoji as a reaction, and pinned messages.
--
-- Reactions were limited to six. Now any single emoji works (the quick bar shows seven,
-- and "more" opens the full set). The database still checks it's an emoji: short, with
-- no letters, digits, spaces or ASCII punctuation.
-- Pins: anyone in a chat can pin a message for both people; the chat shows the latest pin.

create function private.is_emoji(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- No ASCII at all (letters, digits, spaces, punctuation, markup) and no letters from any
  -- script. Character classes alone aren't enough: some collations count emoji as punctuation.
  select p is not null and char_length(p) between 1 and 16 and p !~ '[\x01-\x7F]' and p !~ '[[:alpha:]]';
$$;
revoke execute on function private.is_emoji(text) from public, anon;
grant execute on function private.is_emoji(text) to authenticated;

alter table public.message_reactions drop constraint message_reactions_emoji_check,
  add constraint message_reactions_emoji_check check (emoji is null or private.is_emoji(emoji));
alter table public.friend_message_reactions drop constraint friend_message_reactions_emoji_check,
  add constraint friend_message_reactions_emoji_check check (emoji is null or private.is_emoji(emoji));

create or replace function public.react_to_message(p_message_id uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_conv uuid;
begin
  select conversation_id into v_conv from public.messages where id = p_message_id;
  if v_conv is null or private.chat_side(v_conv) is null then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_emoji is not null and not private.is_emoji(p_emoji) then
    raise exception 'reaction_invalid' using errcode = 'P0001';
  end if;
  perform private.check_rate_limit('chat.react', 60, interval '1 minute', (select auth.uid())::text);
  insert into public.message_reactions (message_id, user_id, emoji) values (p_message_id, (select auth.uid()), p_emoji)
  on conflict (message_id, user_id) do update set emoji = excluded.emoji, updated_at = now();
end;
$$;

create or replace function public.react_to_friend_message(p_message_id uuid, p_emoji text)
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
  if p_emoji is not null and not private.is_emoji(p_emoji) then
    raise exception 'reaction_invalid' using errcode = 'P0001';
  end if;
  perform private.check_rate_limit('chat.react', 60, interval '1 minute', (select auth.uid())::text);
  insert into public.friend_message_reactions (message_id, user_id, emoji) values (p_message_id, (select auth.uid()), p_emoji)
  on conflict (message_id, user_id) do update set emoji = excluded.emoji, updated_at = now();
end;
$$;


alter table public.messages
  add column pinned_at timestamptz,
  add column pinned_by uuid references public.profiles (id) on delete set null;
alter table public.friend_messages
  add column pinned_at timestamptz,
  add column pinned_by uuid references public.profiles (id) on delete set null;

-- Pin or unpin a message, for everyone in the chat.
create function public.pin_message(p_kind text, p_message_id uuid, p_pin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_chat uuid;
begin
  if p_kind = 'shop' then
    select conversation_id into v_chat from public.messages where id = p_message_id;
  elsif p_kind = 'friend' then
    select chat_id into v_chat from public.friend_messages where id = p_message_id;
  end if;
  if v_chat is null or p_pin is null or not private.can_use_chat_topic('chat:' || p_kind || ':' || v_chat) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  perform private.check_rate_limit('chat.react', 60, interval '1 minute', (select auth.uid())::text);
  if p_kind = 'shop' then
    update public.messages set pinned_at = case when p_pin then now() end, pinned_by = case when p_pin then (select auth.uid()) end
    where id = p_message_id;
  else
    update public.friend_messages set pinned_at = case when p_pin then now() end, pinned_by = case when p_pin then (select auth.uid()) end
    where id = p_message_id;
  end if;
end;
$$;

revoke execute on function public.pin_message(text, uuid, boolean) from public, anon;
grant execute on function public.pin_message(text, uuid, boolean) to authenticated;
