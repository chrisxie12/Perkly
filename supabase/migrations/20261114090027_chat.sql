-- In-app chat between a student and a business (text only).
-- A student starts the conversation from a listed business; the business's
-- owners and managers reply. Shops can block a student from writing again.
-- Messages are read with RLS (and Realtime); every write goes through functions.

-- Notifications get a "Messages" category ---------------------------------------
create or replace function private.notification_category(p_kind text)
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
    when 'chat' then 'messages'
    else 'account'
  end;
$$;

alter table public.notification_preferences drop constraint notification_preferences_category_check;
alter table public.notification_preferences add constraint notification_preferences_category_check
  check (category in ('verification', 'deals', 'redemptions', 'business', 'review', 'messages', 'account'));

create or replace function public.get_my_notification_preferences()
returns table (category text, push boolean, email boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.category,
         private.wants_notification((select auth.uid()), c.category, 'push'),
         private.wants_notification((select auth.uid()), c.category, 'email')
  from unnest(array['verification', 'deals', 'redemptions', 'business', 'review', 'messages', 'account']) as c (category)
  where (select auth.uid()) is not null;
$$;

create or replace function public.set_notification_preference(p_category text, p_push boolean, p_email boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_category not in ('verification', 'deals', 'redemptions', 'business', 'review', 'messages', 'account')
     or p_push is null or p_email is null then
    raise exception 'preference_invalid' using errcode = 'P0001';
  end if;
  insert into public.notification_preferences (user_id, category, push, email)
  values (v_uid, p_category, p_push, p_email)
  on conflict (user_id, category) do update set push = excluded.push, email = excluded.email, updated_at = now();
end;
$$;

-- Tables ------------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_preview text check (last_message_preview is null or char_length(last_message_preview) <= 140),
  last_sender text check (last_sender in ('student', 'merchant')),
  student_read_at timestamptz not null default now(),
  merchant_read_at timestamptz not null default now(),
  blocked_at timestamptz,
  unique (merchant_id, student_id)
);
create index conversations_student on public.conversations (student_id, last_message_at desc);
create index conversations_merchant on public.conversations (merchant_id, last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  sender_side text not null check (sender_side in ('student', 'merchant')),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default clock_timestamp()
);
create index messages_conversation on public.messages (conversation_id, created_at desc);

-- Who can see a conversation: the student in it, or the business's owners and managers.
create function private.chat_side(p_conversation_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when c.student_id = (select auth.uid()) then 'student'
           when (select private.can_manage_merchant(c.merchant_id)) then 'merchant'
         end
  from public.conversations c
  where c.id = p_conversation_id;
$$;
revoke execute on function private.chat_side(uuid) from public, anon;
grant execute on function private.chat_side(uuid) to authenticated;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
revoke all on table public.conversations, public.messages from anon, authenticated, service_role;
grant select on table public.conversations, public.messages to authenticated;

create policy "people in a chat read it" on public.conversations
  for select to authenticated
  using (student_id = (select auth.uid()) or (select private.can_manage_merchant(merchant_id)));
create policy "people in a chat read its messages" on public.messages
  for select to authenticated
  using ((select private.chat_side(conversation_id)) is not null);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

-- Functions -----------------------------------------------------------------------------
-- A student opens (or reopens) their chat with a listed business.
create function public.start_conversation(p_merchant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.student_profiles where user_id = v_uid) then
    raise exception 'not_a_student' using errcode = 'P0001';
  end if;
  if not private.merchant_is_listed(p_merchant_id) then
    raise exception 'merchant_not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.merchant_users where merchant_id = p_merchant_id and user_id = v_uid and status = 'active') then
    raise exception 'own_business' using errcode = 'P0001';
  end if;
  insert into public.conversations (merchant_id, student_id)
  values (p_merchant_id, v_uid)
  on conflict (merchant_id, student_id) do nothing;
  select id into v_id from public.conversations where merchant_id = p_merchant_id and student_id = v_uid;
  return v_id;
end;
$$;

create function public.send_message(p_conversation_id uuid, p_body text)
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

  -- One notification per burst: only when the other side spoke last, or after a quiet spell.
  if v_conv.last_message_at is null or v_conv.last_sender is distinct from v_side
     or v_conv.last_message_at < now() - interval '10 minutes' then
    select display_name into v_shop from public.merchants where id = v_conv.merchant_id;
    if v_side = 'student' then
      select coalesce(nullif(btrim(first_name), ''), 'A student') into v_name from public.profiles where id = v_uid;
      perform private.notify_business_team(v_conv.merchant_id, 'chat.message', 'Message from ' || coalesce(v_name, 'a student'),
        left(v_body, 140), '/merchant/messages/' || p_conversation_id);
    else
      perform private.notify(v_conv.student_id, 'chat.message', coalesce(v_shop, 'A business') || ' replied',
        left(v_body, 140), '/student/messages/' || p_conversation_id);
    end if;
  end if;
  return v_id;
end;
$$;

create function public.mark_conversation_read(p_conversation_id uuid)
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
end;
$$;

-- The business stops (or allows again) a student writing to it.
create function public.set_conversation_blocked(p_conversation_id uuid, p_blocked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversations;
begin
  if private.chat_side(p_conversation_id) is distinct from 'merchant' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  select * into v_conv from public.conversations where id = p_conversation_id;
  update public.conversations set blocked_at = case when p_blocked then now() end where id = p_conversation_id;
  perform private.write_audit(case when p_blocked then 'chat.blocked' else 'chat.unblocked' end,
    'merchant:' || private.merchant_role(v_conv.merchant_id)::text, 'conversation', p_conversation_id, null, null, '{}'::jsonb, null, v_conv.merchant_id);
end;
$$;

create function public.list_my_conversations()
returns table (
  id uuid, merchant_id uuid, merchant_name text, merchant_slug text,
  last_message_at timestamptz, last_message_preview text, last_sender text, unread int, blocked boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, m.id, m.display_name, m.slug, c.last_message_at, c.last_message_preview, c.last_sender,
         (select count(*)::int from public.messages x
           where x.conversation_id = c.id and x.sender_side = 'merchant' and x.created_at > c.student_read_at),
         c.blocked_at is not null
  from public.conversations c
  join public.merchants m on m.id = c.merchant_id
  where c.student_id = (select auth.uid()) and c.last_message_at is not null
  order by c.last_message_at desc
  limit 200;
$$;

create function public.list_merchant_conversations(p_merchant_id uuid)
returns table (
  id uuid, student_name text, last_message_at timestamptz, last_message_preview text, last_sender text,
  unread int, blocked boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_merchant(p_merchant_id) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return query
  select c.id, coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.first_name), ''), 'Student'),
         c.last_message_at, c.last_message_preview, c.last_sender,
         (select count(*)::int from public.messages x
           where x.conversation_id = c.id and x.sender_side = 'student' and x.created_at > c.merchant_read_at),
         c.blocked_at is not null
  from public.conversations c
  join public.profiles p on p.id = c.student_id
  where c.merchant_id = p_merchant_id and c.last_message_at is not null
  order by c.last_message_at desc
  limit 200;
end;
$$;

-- Header for a chat screen: who the other side is, and whether writing is allowed.
create function public.get_conversation(p_conversation_id uuid)
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
      'blocked', c.blocked_at is not null)
    from public.conversations c
    join public.merchants m on m.id = c.merchant_id
    join public.profiles p on p.id = c.student_id
    where c.id = p_conversation_id);
end;
$$;

-- Unread chats, for badges.
create function public.count_unread_chats(p_merchant_id uuid default null)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.conversations c
  where case when p_merchant_id is null
             then c.student_id = (select auth.uid()) and c.last_sender = 'merchant' and c.last_message_at > c.student_read_at
             else c.merchant_id = p_merchant_id and (select private.can_manage_merchant(p_merchant_id))
                  and c.last_sender = 'student' and c.last_message_at > c.merchant_read_at
        end;
$$;

revoke execute on function public.start_conversation(uuid), public.send_message(uuid, text),
  public.mark_conversation_read(uuid), public.set_conversation_blocked(uuid, boolean),
  public.list_my_conversations(), public.list_merchant_conversations(uuid), public.get_conversation(uuid),
  public.count_unread_chats(uuid) from public, anon;
grant execute on function public.start_conversation(uuid), public.send_message(uuid, text),
  public.mark_conversation_read(uuid), public.set_conversation_blocked(uuid, boolean),
  public.list_my_conversations(), public.list_merchant_conversations(uuid), public.get_conversation(uuid),
  public.count_unread_chats(uuid) to authenticated;
