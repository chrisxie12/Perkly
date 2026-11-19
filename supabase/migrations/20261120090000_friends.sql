-- Friends (student to student), spec: founder request 19 Nov 2026.
--
-- * Students find classmates by NAME, only verified students at the SAME school, and only
--   people who switched "Let classmates find me" on. Off by default.
-- * Friend requests need the other student to accept. Either side can remove or block.
-- * "Show my activity to friends" (off by default) lets friends see deals a student used,
--   shops they saved and events they're going to.
-- * Friends can share a deal with each other and chat. Students can report another student;
--   support staff (two-factor) review reports.
-- * Nothing here touches shop chat, redemptions or verification. Every table is reached only
--   through the functions below, except friend_messages, which participants may read (live updates).

-- Tables --------------------------------------------------------------------------------
create table public.student_social_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  findable boolean not null default false,
  share_activity boolean not null default false,
  updated_at timestamptz not null default now()
);

-- One row per pair, stored with the smaller id first.
create table public.friendships (
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (user_a, user_b),
  constraint friendships_order check (user_a < user_b),
  constraint friendships_requester check (requested_by in (user_a, user_b))
);
create index friendships_b on public.friendships (user_b);

create table public.student_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint student_blocks_not_self check (blocker_id <> blocked_id)
);
create index student_blocks_blocked on public.student_blocks (blocked_id);

create table public.deal_shares (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  offer_id uuid not null references public.offers (id) on delete cascade,
  note text check (note is null or char_length(note) between 1 and 140),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index deal_shares_recipient on public.deal_shares (recipient_id, created_at desc);

create table public.friend_chats (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_preview text check (last_message_preview is null or char_length(last_message_preview) <= 140),
  last_sender uuid references public.profiles (id) on delete set null,
  a_read_at timestamptz not null default now(),
  b_read_at timestamptz not null default now(),
  unique (user_a, user_b),
  constraint friend_chats_order check (user_a < user_b)
);
create index friend_chats_b on public.friend_chats (user_b, last_message_at desc);

create table public.friend_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.friend_chats (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default clock_timestamp()
);
create index friend_messages_chat on public.friend_messages (chat_id, created_at desc);

create table public.student_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  reported_id uuid references public.profiles (id) on delete set null,
  chat_id uuid references public.friend_chats (id) on delete set null,
  reason text not null check (reason in ('harassment', 'spam', 'fake_profile', 'inappropriate', 'other')),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  staff_note text check (staff_note is null or char_length(staff_note) <= 500),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index student_reports_status on public.student_reports (status, created_at desc);

alter table public.student_social_settings enable row level security;
alter table public.friendships enable row level security;
alter table public.student_blocks enable row level security;
alter table public.deal_shares enable row level security;
alter table public.friend_chats enable row level security;
alter table public.friend_messages enable row level security;
alter table public.student_reports enable row level security;
revoke all on table public.student_social_settings, public.friendships, public.student_blocks, public.deal_shares,
  public.friend_chats, public.friend_messages, public.student_reports from anon, authenticated, service_role;
grant select on table public.friend_messages to authenticated;

-- Helpers ---------------------------------------------------------------------------------
create function private.student_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.first_name), ''), 'Student')
  from public.profiles p where p.id = p_user_id;
$$;

create function private.student_institution(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select institution_id from public.student_profiles where user_id = p_user_id;
$$;

create function private.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.student_blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a));
$$;

create function private.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships
    where user_a = least(p_a, p_b) and user_b = greatest(p_a, p_b) and status = 'accepted')
    and not private.is_blocked_between(p_a, p_b);
$$;

-- Verified students at the same school: the only pairs that can connect.
create function private.can_connect(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_a <> p_b
     and coalesce(private.student_state(p_a) = 'verified', false)
     and coalesce(private.student_state(p_b) = 'verified', false)
     and private.student_institution(p_a) is not distinct from private.student_institution(p_b)
     and private.student_institution(p_a) is not null
     and not private.is_blocked_between(p_a, p_b);
$$;

create function private.shares_activity(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select share_activity from public.student_social_settings where user_id = p_user_id), false);
$$;

create function private.friend_chat_member(p_chat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friend_chats c
    where c.id = p_chat_id and (select auth.uid()) in (c.user_a, c.user_b));
$$;
revoke execute on function private.friend_chat_member(uuid) from public, anon;
grant execute on function private.friend_chat_member(uuid) to authenticated;

create policy "people in a friend chat read its messages" on public.friend_messages
  for select to authenticated
  using ((select private.friend_chat_member(chat_id)));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.friend_messages;
  end if;
end;
$$;

-- Settings ----------------------------------------------------------------------------------
create function public.get_social_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'findable', coalesce(s.findable, false),
    'share_activity', coalesce(s.share_activity, false))
  from (select (select auth.uid()) as uid) me
  left join public.student_social_settings s on s.user_id = me.uid
  where me.uid is not null;
$$;

create function public.set_social_settings(p_findable boolean, p_share_activity boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_findable is null or p_share_activity is null then raise exception 'settings_invalid' using errcode = 'P0001'; end if;
  if (p_findable or p_share_activity) then perform private.require_verified_student(); end if;
  insert into public.student_social_settings (user_id, findable, share_activity)
  values (v_uid, p_findable, p_share_activity)
  on conflict (user_id) do update
    set findable = excluded.findable, share_activity = excluded.share_activity, updated_at = now();
end;
$$;

-- Finding classmates ------------------------------------------------------------------------
create function public.search_classmates(p_query text)
returns table (user_id uuid, name text, programme text, level text, relation text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_q text := btrim(coalesce(p_query, ''));
  v_inst uuid;
begin
  perform private.require_verified_student();
  if char_length(v_q) < 2 or char_length(v_q) > 60 then raise exception 'query_invalid' using errcode = 'P0001'; end if;
  v_inst := private.student_institution(v_uid);
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  return query
  select sp.user_id,
         private.student_name(sp.user_id),
         sp.programme,
         sp.level,
         case
           when f.status = 'accepted' then 'friends'
           when f.status = 'pending' and f.requested_by = v_uid then 'requested'
           when f.status = 'pending' then 'incoming'
           else 'none'
         end
  from public.student_profiles sp
  join public.profiles p on p.id = sp.user_id
  join public.student_social_settings s on s.user_id = sp.user_id and s.findable
  left join public.friendships f on f.user_a = least(v_uid, sp.user_id) and f.user_b = greatest(v_uid, sp.user_id)
  where sp.institution_id = v_inst
    and sp.user_id <> v_uid
    and private.student_state(sp.user_id) = 'verified'
    and not private.is_blocked_between(v_uid, sp.user_id)
    and (p.full_name ilike '%' || v_q || '%' or p.first_name ilike '%' || v_q || '%')
  order by private.student_name(sp.user_id)
  limit 20;
end;
$$;

-- Requests ---------------------------------------------------------------------------------
create function public.send_friend_request(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.friendships;
begin
  perform private.require_verified_student();
  if p_user_id is null or not private.can_connect(v_uid, p_user_id) then
    raise exception 'student_not_found' using errcode = 'P0001';
  end if;
  select * into v_row from public.friendships
   where user_a = least(v_uid, p_user_id) and user_b = greatest(v_uid, p_user_id) for update;
  if found then
    if v_row.status = 'accepted' then return 'friends'; end if;
    if v_row.requested_by = v_uid then return 'requested'; end if;
    -- They already asked you: sending back accepts.
    update public.friendships set status = 'accepted', responded_at = now()
     where user_a = v_row.user_a and user_b = v_row.user_b;
    perform private.notify(p_user_id, 'friend.accepted', private.student_name(v_uid) || ' accepted your friend request',
      null, '/student/friends');
    return 'friends';
  end if;
  if not coalesce((select findable from public.student_social_settings where user_id = p_user_id), false) then
    raise exception 'student_not_found' using errcode = 'P0001';
  end if;
  perform private.check_rate_limit('friends.request', 30, interval '1 day', v_uid::text);
  insert into public.friendships (user_a, user_b, requested_by, status)
  values (least(v_uid, p_user_id), greatest(v_uid, p_user_id), v_uid, 'pending');
  perform private.notify(p_user_id, 'friend.request', private.student_name(v_uid) || ' sent you a friend request',
    null, '/student/friends');
  return 'requested';
end;
$$;

create function public.respond_friend_request(p_user_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.friendships;
begin
  perform private.require_verified_student();
  select * into v_row from public.friendships
   where user_a = least(v_uid, p_user_id) and user_b = greatest(v_uid, p_user_id) for update;
  if not found or v_row.status <> 'pending' or v_row.requested_by = v_uid then
    raise exception 'request_not_found' using errcode = 'P0001';
  end if;
  if coalesce(p_accept, false) then
    if not private.can_connect(v_uid, p_user_id) then raise exception 'student_not_found' using errcode = 'P0001'; end if;
    update public.friendships set status = 'accepted', responded_at = now()
     where user_a = v_row.user_a and user_b = v_row.user_b;
    perform private.notify(p_user_id, 'friend.accepted', private.student_name(v_uid) || ' accepted your friend request',
      null, '/student/friends');
  else
    delete from public.friendships where user_a = v_row.user_a and user_b = v_row.user_b;
  end if;
end;
$$;

-- Cancels your own request, declines theirs, or ends a friendship.
create function public.remove_friend(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  delete from public.friendships where user_a = least(v_uid, p_user_id) and user_b = greatest(v_uid, p_user_id);
end;
$$;

create function public.block_student(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_user_id is null or p_user_id = v_uid or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'student_not_found' using errcode = 'P0001';
  end if;
  insert into public.student_blocks (blocker_id, blocked_id) values (v_uid, p_user_id) on conflict do nothing;
  delete from public.friendships where user_a = least(v_uid, p_user_id) and user_b = greatest(v_uid, p_user_id);
end;
$$;

create function public.unblock_student(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  delete from public.student_blocks where blocker_id = (select auth.uid()) and blocked_id = p_user_id;
end;
$$;

create function public.list_friends()
returns table (user_id uuid, name text, programme text, level text, since timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, private.student_name(o.id), sp.programme, sp.level, coalesce(f.responded_at, f.created_at)
  from public.friendships f
  cross join lateral (select case when f.user_a = (select auth.uid()) then f.user_b else f.user_a end as id) o
  left join public.student_profiles sp on sp.user_id = o.id
  where (select auth.uid()) in (f.user_a, f.user_b)
    and f.status = 'accepted'
    and not private.is_blocked_between(f.user_a, f.user_b)
  order by 2
  limit 500;
$$;

create function public.list_friend_requests()
returns table (user_id uuid, name text, programme text, direction text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, private.student_name(o.id), sp.programme,
         case when f.requested_by = (select auth.uid()) then 'outgoing' else 'incoming' end,
         f.created_at
  from public.friendships f
  cross join lateral (select case when f.user_a = (select auth.uid()) then f.user_b else f.user_a end as id) o
  left join public.student_profiles sp on sp.user_id = o.id
  where (select auth.uid()) in (f.user_a, f.user_b)
    and f.status = 'pending'
    and not private.is_blocked_between(f.user_a, f.user_b)
  order by f.created_at desc
  limit 200;
$$;

create function public.list_blocked_students()
returns table (user_id uuid, name text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked_id, private.student_name(b.blocked_id), b.created_at
  from public.student_blocks b
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc;
$$;

create function public.count_friend_requests()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.friendships f
  where (select auth.uid()) in (f.user_a, f.user_b) and f.status = 'pending' and f.requested_by <> (select auth.uid())
    and not private.is_blocked_between(f.user_a, f.user_b);
$$;

-- Activity (only from friends who chose to share it) ---------------------------------------
-- Friends who used this deal, or saved its shop.
create function public.friends_on_offer(p_offer_id uuid)
returns table (user_id uuid, name text, kind text)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (select user_id from public.list_friends())
  select distinct on (m.user_id) m.user_id, private.student_name(m.user_id),
         case when exists (select 1 from public.redemptions r where r.student_id = m.user_id and r.offer_id = p_offer_id)
              then 'used' else 'saved' end
  from mine m
  where private.shares_activity(m.user_id)
    and (exists (select 1 from public.redemptions r where r.student_id = m.user_id and r.offer_id = p_offer_id)
         or exists (select 1 from public.favourites fv join public.offers o on o.merchant_id = fv.merchant_id
                    where o.id = p_offer_id and fv.student_id = m.user_id))
  limit 10;
$$;

create function public.friends_going(p_post_id uuid)
returns table (user_id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (select user_id from public.list_friends())
  select m.user_id, private.student_name(m.user_id)
  from mine m
  join public.event_rsvps r on r.user_id = m.user_id and r.post_id = p_post_id
  where private.shares_activity(m.user_id)
  limit 20;
$$;

-- Sharing deals ------------------------------------------------------------------------------
create function public.share_deal(p_user_id uuid, p_offer_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
  v_title text;
begin
  perform private.require_verified_student();
  if not private.are_friends(v_uid, p_user_id) or not private.can_connect(v_uid, p_user_id) then
    raise exception 'not_friends' using errcode = 'P0001';
  end if;
  if v_note is not null and char_length(v_note) > 140 then raise exception 'note_invalid' using errcode = 'P0001'; end if;
  if not private.offer_is_live(p_offer_id, private.student_institution(p_user_id)) then
    raise exception 'offer_not_found' using errcode = 'P0001';
  end if;
  perform private.check_rate_limit('friends.share', 30, interval '1 hour', v_uid::text);
  insert into public.deal_shares (sender_id, recipient_id, offer_id, note)
  values (v_uid, p_user_id, p_offer_id, v_note)
  returning id into v_id;
  select coalesce(m.display_name, 'a shop') into v_title
    from public.offers o join public.merchants m on m.id = o.merchant_id where o.id = p_offer_id;
  perform private.notify(p_user_id, 'friend.share', private.student_name(v_uid) || ' shared a deal at ' || v_title,
    v_note, '/student/offers/' || p_offer_id);
  return v_id;
end;
$$;

create function public.list_shared_deals()
returns table (id uuid, offer_id uuid, offer_title text, merchant_name text, sender_id uuid, sender_name text,
  note text, created_at timestamptz, seen boolean, live boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.offer_id, coalesce(o.title, sv.name, pr.name, 'Student deal'), m.display_name, s.sender_id, private.student_name(s.sender_id), s.note, s.created_at,
         s.seen_at is not null, private.offer_is_live(s.offer_id, private.student_institution(s.recipient_id))
  from public.deal_shares s
  join public.offers o on o.id = s.offer_id
  join public.merchants m on m.id = o.merchant_id
  left join public.services sv on sv.id = o.service_id
  left join public.products pr on pr.id = o.product_id
  where s.recipient_id = (select auth.uid())
    and not private.is_blocked_between(s.sender_id, s.recipient_id)
  order by s.created_at desc
  limit 50;
$$;

create function public.mark_shared_deals_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.deal_shares set seen_at = now() where recipient_id = (select auth.uid()) and seen_at is null;
$$;

-- Friend chat -------------------------------------------------------------------------------
create function public.start_friend_chat(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  perform private.require_verified_student();
  if not private.are_friends(v_uid, p_user_id) then raise exception 'not_friends' using errcode = 'P0001'; end if;
  insert into public.friend_chats (user_a, user_b) values (least(v_uid, p_user_id), greatest(v_uid, p_user_id))
  on conflict (user_a, user_b) do nothing;
  select id into v_id from public.friend_chats where user_a = least(v_uid, p_user_id) and user_b = greatest(v_uid, p_user_id);
  return v_id;
end;
$$;

create function public.send_friend_message(p_chat_id uuid, p_body text)
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
  if char_length(v_body) not between 1 and 1000 then raise exception 'message_invalid' using errcode = 'P0001'; end if;
  perform private.check_rate_limit('friends.chat', 20, interval '1 minute', v_uid::text);

  insert into public.friend_messages (chat_id, sender_id, body) values (p_chat_id, v_uid, v_body) returning id into v_id;
  update public.friend_chats
     set last_message_at = clock_timestamp(), last_message_preview = left(v_body, 140), last_sender = v_uid,
         a_read_at = case when user_a = v_uid then clock_timestamp() else a_read_at end,
         b_read_at = case when user_b = v_uid then clock_timestamp() else b_read_at end
   where id = p_chat_id;

  if v_chat.last_message_at is null or v_chat.last_sender is distinct from v_uid
     or v_chat.last_message_at < now() - interval '10 minutes' then
    perform private.notify(v_other, 'friendchat.message', 'Message from ' || private.student_name(v_uid),
      left(v_body, 140), '/student/friends/chat/' || p_chat_id);
  end if;
  return v_id;
end;
$$;

create function public.mark_friend_chat_read(p_chat_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.friend_chats
     set a_read_at = case when user_a = (select auth.uid()) then clock_timestamp() else a_read_at end,
         b_read_at = case when user_b = (select auth.uid()) then clock_timestamp() else b_read_at end
   where id = p_chat_id and (select auth.uid()) in (user_a, user_b);
$$;

create function public.list_friend_chats()
returns table (id uuid, friend_id uuid, friend_name text, last_message_at timestamptz, last_message_preview text,
  last_from_me boolean, unread int, can_send boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, o.id, private.student_name(o.id), c.last_message_at, c.last_message_preview,
         c.last_sender = (select auth.uid()),
         (select count(*)::int from public.friend_messages x
           where x.chat_id = c.id and x.sender_id is distinct from (select auth.uid())
             and x.created_at > case when c.user_a = (select auth.uid()) then c.a_read_at else c.b_read_at end),
         private.are_friends(c.user_a, c.user_b)
  from public.friend_chats c
  cross join lateral (select case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end as id) o
  where (select auth.uid()) in (c.user_a, c.user_b)
    and c.last_message_at is not null
    and not private.is_blocked_between(c.user_a, c.user_b)
  order by c.last_message_at desc
  limit 200;
$$;

create function public.get_friend_chat(p_chat_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'friend_id', o.id, 'friend_name', private.student_name(o.id),
    'can_send', private.are_friends(c.user_a, c.user_b),
    'blocked', private.is_blocked_between(c.user_a, c.user_b))
  from public.friend_chats c
  cross join lateral (select case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end as id) o
  where c.id = p_chat_id and (select auth.uid()) in (c.user_a, c.user_b);
$$;

create function public.count_unread_friend_chats()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.list_friend_chats() where unread > 0;
$$;

-- Reports -------------------------------------------------------------------------------------
create function public.report_student(p_user_id uuid, p_reason text, p_note text default null, p_chat_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_user_id is null or p_user_id = v_uid or not exists (select 1 from public.student_profiles where user_id = p_user_id) then
    raise exception 'student_not_found' using errcode = 'P0001';
  end if;
  if p_reason is null or p_reason not in ('harassment', 'spam', 'fake_profile', 'inappropriate', 'other') then
    raise exception 'reason_invalid' using errcode = 'P0001';
  end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'note_invalid' using errcode = 'P0001'; end if;
  if p_chat_id is not null and not exists (
       select 1 from public.friend_chats c
       where c.id = p_chat_id and v_uid in (c.user_a, c.user_b) and p_user_id in (c.user_a, c.user_b)) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  perform private.check_rate_limit('friends.report', 10, interval '1 day', v_uid::text);
  insert into public.student_reports (reporter_id, reported_id, chat_id, reason, note)
  values (v_uid, p_user_id, p_chat_id, p_reason, v_note)
  returning id into v_id;
  perform private.write_audit('student_report.opened', 'student', 'student_report', v_id,
    p_after => jsonb_build_object('reason', p_reason, 'reported_id', p_user_id));
  perform private.notify_staff('support', 'review.student_report', 'New report about a student',
    null, '/admin/student-reports/' || v_id);
  return v_id;
end;
$$;

create function public.list_student_reports(p_status text default 'open')
returns table (id uuid, reason text, note text, status text, created_at timestamptz,
  reporter_id uuid, reporter_name text, reported_id uuid, reported_name text, has_chat boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff('support')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return query
  select r.id, r.reason, r.note, r.status, r.created_at,
         r.reporter_id, private.student_name(r.reporter_id), r.reported_id, private.student_name(r.reported_id),
         r.chat_id is not null
  from public.student_reports r
  where p_status is null or r.status = p_status
  order by r.created_at desc
  limit 200;
end;
$$;

-- One report, with the last 50 messages of the chat it came from (if any), for support staff.
create function public.get_student_report(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_r public.student_reports;
begin
  if not (select private.is_staff('support')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into v_r from public.student_reports where id = p_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', v_r.id, 'reason', v_r.reason, 'note', v_r.note, 'status', v_r.status, 'staff_note', v_r.staff_note,
    'created_at', v_r.created_at, 'handled_at', v_r.handled_at,
    'reporter_id', v_r.reporter_id, 'reporter_name', private.student_name(v_r.reporter_id),
    'reported_id', v_r.reported_id, 'reported_name', private.student_name(v_r.reported_id),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('from_reported', x.sender_id = v_r.reported_id, 'body', x.body, 'at', x.created_at)
                       order by x.created_at)
      from (select * from public.friend_messages m where m.chat_id = v_r.chat_id order by m.created_at desc limit 50) x
    ), '[]'::jsonb));
end;
$$;

create function public.set_student_report_status(p_id uuid, p_status text, p_staff_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.student_reports;
  v_note text := nullif(btrim(coalesce(p_staff_note, '')), '');
begin
  if not (select private.is_staff('support')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_status is null or p_status not in ('open', 'resolved', 'dismissed') then raise exception 'status_invalid' using errcode = 'P0001'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'note_invalid' using errcode = 'P0001'; end if;
  select * into v_r from public.student_reports where id = p_id for update;
  if not found then raise exception 'report_not_found' using errcode = 'P0001'; end if;
  update public.student_reports
     set status = p_status, staff_note = coalesce(v_note, staff_note),
         handled_by = case when p_status = 'open' then null else (select auth.uid()) end,
         handled_at = case when p_status = 'open' then null else now() end
   where id = p_id;
  perform private.write_audit('student_report.' || p_status, 'staff:support', 'student_report', p_id,
    jsonb_build_object('status', v_r.status), jsonb_build_object('status', p_status));
end;
$$;

-- Notification settings get a "Friends" category. Friend chat counts as Messages.
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
    when 'friendchat' then 'messages'
    when 'friend' then 'friends'
    when 'booking' then 'bookings'
    when 'campus' then 'campus'
    else 'account'
  end;
$$;

alter table public.notification_preferences drop constraint notification_preferences_category_check;
alter table public.notification_preferences add constraint notification_preferences_category_check
  check (category in ('verification', 'deals', 'redemptions', 'business', 'review', 'messages', 'friends', 'bookings', 'campus', 'account'));

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
  from unnest(array['verification', 'deals', 'redemptions', 'business', 'review', 'messages', 'friends', 'bookings', 'campus', 'account']) as c (category)
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
  if p_category not in ('verification', 'deals', 'redemptions', 'business', 'review', 'messages', 'friends', 'bookings', 'campus', 'account')
     or p_push is null or p_email is null then
    raise exception 'preference_invalid' using errcode = 'P0001';
  end if;
  insert into public.notification_preferences (user_id, category, push, email)
  values (v_uid, p_category, p_push, p_email)
  on conflict (user_id, category) do update set push = excluded.push, email = excluded.email, updated_at = now();
end;
$$;

-- Grants ---------------------------------------------------------------------------------------
revoke execute on function private.student_name(uuid), private.student_institution(uuid), private.is_blocked_between(uuid, uuid),
  private.are_friends(uuid, uuid), private.can_connect(uuid, uuid), private.shares_activity(uuid) from public, anon, authenticated;

revoke execute on function
  public.get_social_settings(), public.set_social_settings(boolean, boolean), public.search_classmates(text),
  public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean), public.remove_friend(uuid),
  public.block_student(uuid), public.unblock_student(uuid), public.list_friends(), public.list_friend_requests(),
  public.list_blocked_students(), public.count_friend_requests(), public.friends_on_offer(uuid), public.friends_going(uuid),
  public.share_deal(uuid, uuid, text), public.list_shared_deals(), public.mark_shared_deals_seen(),
  public.start_friend_chat(uuid), public.send_friend_message(uuid, text), public.mark_friend_chat_read(uuid),
  public.list_friend_chats(), public.get_friend_chat(uuid), public.count_unread_friend_chats(),
  public.report_student(uuid, text, text, uuid), public.list_student_reports(text), public.get_student_report(uuid),
  public.set_student_report_status(uuid, text, text)
from public, anon;
grant execute on function
  public.get_social_settings(), public.set_social_settings(boolean, boolean), public.search_classmates(text),
  public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean), public.remove_friend(uuid),
  public.block_student(uuid), public.unblock_student(uuid), public.list_friends(), public.list_friend_requests(),
  public.list_blocked_students(), public.count_friend_requests(), public.friends_on_offer(uuid), public.friends_going(uuid),
  public.share_deal(uuid, uuid, text), public.list_shared_deals(), public.mark_shared_deals_seen(),
  public.start_friend_chat(uuid), public.send_friend_message(uuid, text), public.mark_friend_chat_read(uuid),
  public.list_friend_chats(), public.get_friend_chat(uuid), public.count_unread_friend_chats(),
  public.report_student(uuid, text, text, uuid), public.list_student_reports(text), public.get_student_report(uuid),
  public.set_student_report_status(uuid, text, text)
to authenticated;
