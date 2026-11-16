-- Chat notifications behave like a messaging app: every message notifies,
-- except while an unread notification for the same chat from the last two
-- minutes is still waiting; reading a chat clears its notifications.

create function private.notify_chat(p_user uuid, p_title text, p_body text, p_link text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.notifications
    where user_id = p_user and kind = 'chat.message' and link = p_link and read_at is null
      and created_at > now() - interval '2 minutes'
  ) then
    return;
  end if;
  perform private.notify(p_user, 'chat.message', p_title, p_body, p_link);
end;
$$;
revoke execute on function private.notify_chat(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.send_message(p_conversation_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_side text := private.chat_side(p_conversation_id);
  v_body text := btrim(coalesce(p_body, ''));
  v_conv public.conversations;
  v_shop text;
  v_name text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if v_side is null then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if char_length(v_body) not between 1 and 1000 then raise exception 'message_invalid' using errcode = 'P0001'; end if;
  select * into v_conv from public.conversations where id = p_conversation_id for update;
  if v_side = 'student' and v_conv.blocked_at is not null then raise exception 'chat_blocked' using errcode = 'P0001'; end if;
  if v_side = 'student' and not private.merchant_is_listed(v_conv.merchant_id) then
    raise exception 'merchant_not_found' using errcode = 'P0001';
  end if;
  perform private.check_rate_limit('chat.send', 20, interval '1 minute', v_uid::text);

  insert into public.messages (conversation_id, sender_id, sender_side, body)
  values (p_conversation_id, v_uid, v_side, v_body)
  returning id into v_id;

  update public.conversations
     set last_message_at = clock_timestamp(),
         last_message_preview = left(v_body, 140),
         last_sender = v_side,
         student_read_at = case when v_side = 'student' then clock_timestamp() else student_read_at end,
         merchant_read_at = case when v_side = 'merchant' then clock_timestamp() else merchant_read_at end
   where id = p_conversation_id;

  -- Every message notifies, except while an unread notification for this chat
  -- from the last two minutes is still waiting (no floods from quick bursts).
  select display_name into v_shop from public.merchants where id = v_conv.merchant_id;
  if v_side = 'student' then
    select coalesce(nullif(btrim(first_name), ''), 'A student') into v_name from public.profiles where id = v_uid;
    perform private.notify_chat(mu.user_id, 'Message from ' || coalesce(v_name, 'a student'), left(v_body, 140),
      '/merchant/messages/' || p_conversation_id)
    from public.merchant_users mu
    where mu.merchant_id = v_conv.merchant_id and mu.status = 'active' and mu.role in ('owner', 'manager') and mu.user_id <> v_uid;
  else
    perform private.notify_chat(v_conv.student_id, coalesce(v_shop, 'A business') || ' replied', left(v_body, 140),
      '/student/messages/' || p_conversation_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_side text := private.chat_side(p_conversation_id);
begin
  if v_side is null then raise exception 'forbidden' using errcode = 'P0001'; end if;
  update public.conversations
     set student_read_at = case when v_side = 'student' then clock_timestamp() else student_read_at end,
         merchant_read_at = case when v_side = 'merchant' then clock_timestamp() else merchant_read_at end
   where id = p_conversation_id;
  -- Reading the chat clears its notifications too.
  update public.notifications
     set read_at = now()
   where user_id = (select auth.uid()) and kind = 'chat.message' and read_at is null
     and link in ('/student/messages/' || p_conversation_id, '/merchant/messages/' || p_conversation_id);
end;
$$;
