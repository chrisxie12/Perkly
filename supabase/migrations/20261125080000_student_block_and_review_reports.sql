-- Moderation gaps found for the Android release (spec section E):
--   1. a student can block a business in a shop chat (only businesses could block before);
--   2. anyone who can see a rating can report it, and support has a queue to hide it.

-- 1. Students block a business ------------------------------------------------------------

alter table public.conversations add column student_blocked_at timestamptz;

create function public.student_set_business_blocked(p_conversation_id uuid, p_blocked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_conv public.conversations;
begin
  if private.chat_side(p_conversation_id) is distinct from 'student' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  select * into v_conv from public.conversations where id = p_conversation_id for update;
  if (v_conv.student_blocked_at is not null) = coalesce(p_blocked, false) then return; end if;
  update public.conversations set student_blocked_at = case when p_blocked then now() end where id = p_conversation_id;
  perform private.write_audit(case when p_blocked then 'chat.student_blocked' else 'chat.student_unblocked' end,
    'self', 'conversation', p_conversation_id, null, null, '{}'::jsonb, null, v_conv.merchant_id);
end;
$$;
revoke execute on function public.student_set_business_blocked(uuid, boolean) from public, anon;
grant execute on function public.student_set_business_blocked(uuid, boolean) to authenticated;

-- Sending: a business can't message a student who blocked it, and the student unblocks to write again.
create or replace function public.send_message(p_conversation_id uuid, p_body text, p_reply_to uuid default null, p_photo_path text default null)
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
  if v_conv.student_blocked_at is not null then
    raise exception '%', case when v_side = 'student' then 'chat_blocked_by_you' else 'chat_blocked_by_student' end using errcode = 'P0001';
  end if;
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

-- Photos: same rule as sending.
create or replace function private.can_write_chat_photo(p_name text)
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
             where c.id = p.chat_id and c.student_blocked_at is null
               and (private.chat_side(c.id) = 'merchant' or (private.chat_side(c.id) = 'student' and c.blocked_at is null)))
           when 'friend' then exists (
             select 1 from public.friend_chats c
             where c.id = p.chat_id and (select auth.uid()) in (c.user_a, c.user_b) and private.are_friends(c.user_a, c.user_b))
           else false end
  from private.chat_photo_parts(p_name) p;
$$;

-- The chat screen needs to know, on both sides.
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
      'blocked_by_student', c.student_blocked_at is not null,
      'other_read_at', case when v_side = 'student' then c.merchant_read_at else c.student_read_at end)
    from public.conversations c
    join public.merchants m on m.id = c.merchant_id
    join public.profiles p on p.id = c.student_id
    where c.id = p_conversation_id);
end;
$$;

-- 2. Reporting ratings ---------------------------------------------------------------------

create table public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.merchant_reviews (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  reporter_id uuid references public.profiles (id) on delete set null,
  reporter_side text not null check (reporter_side in ('student', 'business')),
  reason text not null check (reason in ('spam', 'rude', 'false', 'personal', 'other')),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'hidden', 'kept')),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint review_reports_handled check ((status = 'open') = (handled_at is null))
);
create unique index review_reports_one_open on public.review_reports (review_id, reporter_id) where status = 'open';
create index review_reports_open on public.review_reports (created_at) where status = 'open';
create index review_reports_merchant on public.review_reports (merchant_id);
create index review_reports_reporter on public.review_reports (reporter_id);
create index review_reports_handled_by on public.review_reports (handled_by);
alter table public.review_reports enable row level security;
revoke all on table public.review_reports from anon, authenticated, service_role;

create function public.report_review(p_review_id uuid, p_reason text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_review public.merchant_reviews;
  v_side text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_reason is null or p_reason not in ('spam', 'rude', 'false', 'personal', 'other') or char_length(coalesce(p_note, '')) > 500 then
    raise exception 'report_invalid' using errcode = 'P0001';
  end if;
  select * into v_review from public.merchant_reviews where id = p_review_id;
  -- Only a rating the person can see: visible on a listed shop, or their own business's.
  if not found or v_review.hidden_at is not null then raise exception 'review_not_found' using errcode = 'P0001'; end if;
  if v_review.student_id = v_uid then raise exception 'own_review' using errcode = 'P0001'; end if;
  if private.can_manage_merchant(v_review.merchant_id) then v_side := 'business';
  elsif private.merchant_is_listed(v_review.merchant_id) then v_side := 'student';
  else raise exception 'review_not_found' using errcode = 'P0001';
  end if;

  select id into v_id from public.review_reports where review_id = p_review_id and reporter_id = v_uid and status = 'open';
  if v_id is not null then return v_id; end if;
  perform private.check_rate_limit('review.report', 10, interval '1 day', v_uid::text);

  insert into public.review_reports (review_id, merchant_id, reporter_id, reporter_side, reason, note)
  values (p_review_id, v_review.merchant_id, v_uid, v_side, p_reason, nullif(left(btrim(coalesce(p_note, '')), 500), ''))
  returning id into v_id;
  perform private.write_audit('review.reported', 'self', 'review_report', v_id, null,
    jsonb_build_object('review_id', p_review_id, 'reason', p_reason, 'side', v_side), '{}'::jsonb, null, v_review.merchant_id);
  return v_id;
end;
$$;

-- Support's queue: open reports first, one row per report, with the rating as it stands now.
create function public.admin_review_reports()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff('support')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'review_id', r.review_id, 'reason', r.reason, 'note', r.note, 'status', r.status,
             'reporter_side', r.reporter_side, 'created_at', r.created_at,
             'business', m.display_name, 'merchant_slug', m.slug,
             'rating', v.rating, 'comment', v.comment, 'review_hidden', v.hidden_at is not null)
           order by (r.status = 'open') desc, r.created_at desc)
    from (select * from public.review_reports order by (status = 'open') desc, created_at desc limit 200) r
    join public.merchant_reviews v on v.id = r.review_id
    join public.merchants m on m.id = r.merchant_id), '[]'::jsonb);
end;
$$;

-- Hide the rating (closing every open report on it) or keep it.
create function public.admin_resolve_review_report(p_id uuid, p_hide boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_review uuid;
begin
  if not (select private.is_staff('support')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select review_id into v_review from public.review_reports where id = p_id and status = 'open' for update;
  if v_review is null then raise exception 'report_not_open' using errcode = 'P0001'; end if;
  if p_hide then
    perform public.staff_set_review_hidden(v_review, true);
    update public.review_reports set status = 'hidden', handled_by = (select auth.uid()), handled_at = now()
     where review_id = v_review and status = 'open';
  else
    update public.review_reports set status = 'kept', handled_by = (select auth.uid()), handled_at = now()
     where id = p_id;
  end if;
  perform private.write_audit(case when p_hide then 'review.report_hidden' else 'review.report_kept' end,
    'platform:support', 'review_report', p_id, null, null);
end;
$$;

revoke execute on function public.report_review(uuid, text, text), public.admin_review_reports(),
  public.admin_resolve_review_report(uuid, boolean) from public, anon;
grant execute on function public.report_review(uuid, text, text), public.admin_review_reports(),
  public.admin_resolve_review_report(uuid, boolean) to authenticated;

-- The rating list says which one is the viewer's own, so the screen doesn't offer to report it.
drop function public.list_merchant_reviews(uuid, int);
create function public.list_merchant_reviews(p_merchant_id uuid, p_limit int default 30)
returns table (id uuid, author text, rating smallint, comment text, created_at timestamptz, hidden boolean, mine boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff boolean := private.is_staff('support');
  v_team boolean := private.can_manage_merchant(p_merchant_id);
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not (v_staff or v_team or private.merchant_is_listed(p_merchant_id)) then
    raise exception 'merchant_not_found' using errcode = 'P0001';
  end if;
  return query
  select r.id,
         coalesce(nullif(btrim(p.first_name), ''), 'Student')
           || coalesce(' ' || left(nullif(btrim(split_part(btrim(p.full_name), ' ', 2)), ''), 1) || '.', ''),
         r.rating, r.comment, r.updated_at, r.hidden_at is not null, r.student_id = (select auth.uid())
  from public.merchant_reviews r
  join public.profiles p on p.id = r.student_id
  where r.merchant_id = p_merchant_id and (r.hidden_at is null or v_staff)
  order by r.updated_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;
revoke execute on function public.list_merchant_reviews(uuid, int) from public, anon;
grant execute on function public.list_merchant_reviews(uuid, int) to authenticated;
