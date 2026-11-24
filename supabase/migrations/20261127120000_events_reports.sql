-- Events & Conferences, PR A part 4: event lists and analytics for admins and organisers, the
-- attendee list and CSV export rows, announcements, change notices, and reminders at 7 days,
-- 24 hours and 1 hour that never go out twice.

-- Reminders ---------------------------------------------------------------------------------------

create table public.event_reminders_sent (
  post_id uuid not null references public.campus_events (post_id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('7d', '24h', '1h')),
  sent_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);
alter table public.event_reminders_sent enable row level security;
revoke all on public.event_reminders_sent from public, anon, authenticated;

-- Reminders the old daily job already sent count as the 24-hour one.
insert into public.event_reminders_sent (post_id, user_id, kind, sent_at)
select post_id, user_id, '24h', reminded_at from public.event_rsvps where reminded_at is not null
on conflict do nothing;

-- Queue the due reminders of one kind. Only confirmed students still eligible, only published
-- events (never cancelled ones), only when that reminder is switched on for the event, and only
-- for students who registered before the reminder's moment (no "starts in 7 days" right after
-- registering 3 days before). The sent table makes each reminder once only.
create function private.queue_reminders(p_kind text, p_from interval, p_to interval)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_status text := private.campus_delivery_status();
  v_lead interval := case p_kind when '7d' then interval '7 days' when '24h' then interval '24 hours' else interval '1 hour' end;
begin
  with due as (
    select r.post_id, r.user_id
    from public.event_rsvps r
    join public.campus_events e on e.post_id = r.post_id
    where r.status = 'confirmed'
      and e.lifecycle = 'published'
      and e.starts_at > now() + p_from and e.starts_at <= now() + p_to
      and r.created_at <= e.starts_at - v_lead
      and case p_kind when '7d' then e.remind_7d when '24h' then e.remind_24h else e.remind_1h end
      and private.post_is_live(r.post_id)
      and private.event_eligible(r.post_id, r.user_id)
    for update of r skip locked
  ), sent as (
    insert into public.event_reminders_sent (post_id, user_id, kind)
    select post_id, user_id, p_kind from due
    on conflict do nothing
    returning post_id, user_id
  ), notified as (
    insert into public.notifications (user_id, kind, title, body, link, push_status, email_status)
    select s.user_id, 'campus.event_reminder',
           left(case p_kind when '7d' then 'In a week: ' when '24h' then 'Reminder: ' else 'Starting soon: ' end
                || private.event_title(s.post_id), 140),
           left(private.event_when(s.post_id), 500),
           '/student/campus/posts/' || s.post_id, v_status, v_status
    from sent s
    returning 1
  ), marked as (
    update public.event_rsvps r set reminded_at = now()
    from sent s where p_kind = '24h' and r.post_id = s.post_id and r.user_id = s.user_id
    returning 1
  )
  select count(*)::int into v_count from notified;
  return v_count;
end;
$$;

-- Every 10 minutes (pg_cron, PR D): 7 days, 24 hours and 1 hour before.
create function public.queue_due_event_reminders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.campus_switch('campus.posts_enabled') then return 0; end if;
  return private.queue_reminders('7d', interval '24 hours', interval '7 days')
       + private.queue_reminders('24h', interval '1 hour', interval '24 hours')
       + private.queue_reminders('1h', interval '0 seconds', interval '1 hour');
end;
$$;

-- Daily (the existing cron): the 24-hour reminder for events 22 to 46 hours away, as before, and
-- the 7-day one. Shares the sent table with the frequent job, so nothing goes twice.
create or replace function public.queue_event_reminders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.campus_switch('campus.posts_enabled') then return 0; end if;
  return private.queue_reminders('24h', interval '22 hours', interval '46 hours')
       + private.queue_reminders('7d', interval '6 days', interval '7 days');
end;
$$;

-- Change notices ----------------------------------------------------------------------------------

-- A published event's place changing tells everyone holding a place, a request or a waitlist spot.
-- A new start time clears sent reminders so they go again for the new time.
create function private.event_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_row record;
begin
  if new.starts_at is distinct from old.starts_at then
    delete from public.event_reminders_sent where post_id = new.post_id;
  end if;
  if new.lifecycle = 'published' and old.lifecycle = 'published'
     and ((new.venue, new.venue_address, new.format) is distinct from (old.venue, old.venue_address, old.format)) then
    for v_row in select user_id from public.event_rsvps where post_id = new.post_id and status in ('pending', 'confirmed', 'waitlisted') loop
      perform private.notify_event(v_row.user_id, new.post_id, 'campus.event_venue_changed', 'New place: ' || private.event_title(new.post_id),
        coalesce('Now at ' || new.venue || coalesce(', ' || new.venue_address, '') || '.',
                 case when new.format = 'online' then 'Now online. The link appears in My Events before it starts.' end,
                 'The venue has changed.'));
    end loop;
  end if;
  return new;
end;
$$;
create trigger campus_events_changed after update on public.campus_events
  for each row execute function private.event_changed();

-- Announcements from organisers to everyone holding a place, a request or a waitlist spot.
create function public.send_event_announcement(p_post_id uuid, p_title text, p_body text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_count int;
begin
  if not private.event_can_manage(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 3 and 100
     or p_body is null or char_length(btrim(p_body)) not between 3 and 500 then
    raise exception 'announcement_invalid' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.campus_events where post_id = p_post_id and lifecycle = 'published') then
    raise exception 'not_published' using errcode = 'P0001';
  end if;
  perform private.check_rate_limit('events.announce', 5, interval '1 day', p_post_id::text);
  insert into public.notifications (user_id, kind, title, body, link, push_status, email_status)
  select r.user_id, 'campus.event_announcement', left(private.event_title(p_post_id) || ': ' || btrim(p_title), 140),
         left(btrim(p_body), 500), '/student/campus/posts/' || p_post_id,
         private.campus_delivery_status(), private.campus_delivery_status()
  from public.event_rsvps r
  where r.post_id = p_post_id and r.status in ('pending', 'confirmed', 'waitlisted', 'attended');
  get diagnostics v_count = row_count;
  perform private.event_audit(p_post_id, 'event.announced', null, jsonb_build_object('title', btrim(p_title)),
    jsonb_build_object('recipients', v_count));
  return v_count;
end;
$$;

-- Lists and analytics ------------------------------------------------------------------------------

-- Counts for one event (no names). Anyone who can scan it.
create function private.event_counts(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'pending', count(*) filter (where r.status = 'pending'),
    'confirmed', count(*) filter (where r.status = 'confirmed'),
    'waitlisted', count(*) filter (where r.status = 'waitlisted'),
    'cancelled', count(*) filter (where r.status = 'cancelled'),
    'rejected', count(*) filter (where r.status = 'rejected'),
    'attended', count(*) filter (where r.status = 'attended'),
    'no_show', count(*) filter (where r.status = 'no_show'),
    'registrations', count(*))
  from public.event_rsvps r where r.post_id = p_post_id;
$$;

-- Events the caller manages (Perqly admins: all; organisers: their organisations'), with counts.
-- Filters (optional): q, institution_id, category, lifecycle, status, from, to. Sort: starts_at
-- (default, soonest first), created, registrations.
create function public.manage_events_list(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.card order by
      case when coalesce(p_filters ->> 'sort', 'starts_at') = 'starts_at' then x.starts_at end,
      case when p_filters ->> 'sort' = 'created' then x.created_at end desc,
      case when p_filters ->> 'sort' = 'registrations' then x.regs end desc,
      x.starts_at), '[]'::jsonb)
  from (
    select e.starts_at, p.created_at, (private.event_counts(e.post_id) ->> 'registrations')::int as regs,
           jsonb_build_object('post_id', e.post_id, 'title', p.title, 'organisation', o.name, 'organisation_id', o.id,
                              'institution', i.short_name, 'institution_id', i.id, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
                              'timezone', e.timezone, 'lifecycle', e.lifecycle, 'event_type', e.event_type, 'format', e.format,
                              'category', c.name, 'capacity', e.capacity, 'featured', e.featured,
                              'counts', private.event_counts(e.post_id), 'can_see_people', private.event_can_see_people(e.post_id))
             || private.event_status(e.post_id) as card
    from public.campus_events e
    join public.campus_posts p on p.id = e.post_id
    join public.campus_organisations o on o.id = p.organisation_id
    join public.institutions i on i.id = e.institution_id
    left join public.event_categories c on c.id = e.category_id
    where p.status <> 'removed'
      and private.event_can_manage(e.post_id)
      and (p_filters ->> 'q' is null or p.title ilike '%' || left(p_filters ->> 'q', 60) || '%')
      and (p_filters ->> 'institution_id' is null or e.institution_id = (p_filters ->> 'institution_id')::uuid)
      and (p_filters ->> 'category' is null or c.slug = p_filters ->> 'category')
      and (p_filters ->> 'lifecycle' is null or e.lifecycle = p_filters ->> 'lifecycle')
      and (p_filters ->> 'status' is null or private.event_status(e.post_id) ->> 'status' = p_filters ->> 'status')
      and (p_filters ->> 'from' is null or e.starts_at >= (p_filters ->> 'from')::timestamptz)
      and (p_filters ->> 'to' is null or e.starts_at < (p_filters ->> 'to')::timestamptz)
    limit 300
  ) x;
$$;

-- The admin overview cards. Perqly admins only. Attendance rate counts only events that have
-- ended and had check-ins, so events nobody scanned don't drag it down.
create function public.admin_events_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff('admin') then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return (
    with ev as (
      select e.*, private.event_status(e.post_id) ->> 'status' as status
      from public.campus_events e join public.campus_posts p on p.id = e.post_id where p.status <> 'removed'),
    regs as (select r.* from public.event_rsvps r join ev on ev.post_id = r.post_id),
    scanned as (select ev.post_id from ev
                where coalesce(ev.ends_at, ev.starts_at + interval '3 hours') <= now()
                  and exists (select 1 from public.event_tickets t where t.post_id = ev.post_id and t.status = 'checked_in'))
    select jsonb_build_object(
      'total', (select count(*) from ev),
      'upcoming', (select count(*) from ev where ev.lifecycle = 'published' and ev.starts_at > now()),
      'published', (select count(*) from ev where ev.lifecycle = 'published'),
      'draft', (select count(*) from ev where ev.lifecycle = 'draft'),
      'completed', (select count(*) from ev where ev.status = 'completed'),
      'cancelled', (select count(*) from ev where ev.lifecycle = 'cancelled'),
      'registrations', (select count(*) from regs),
      'confirmed', (select count(*) from regs where regs.status in ('confirmed', 'attended')),
      'attendees', (select count(*) from regs where regs.status = 'attended'),
      'attendance_rate', (select case when count(*) filter (where r.status in ('confirmed', 'attended', 'no_show')) = 0 then null
                                      else round(count(*) filter (where r.status = 'attended')::numeric
                                                 / count(*) filter (where r.status in ('confirmed', 'attended', 'no_show')), 3) end
                          from public.event_rsvps r where r.post_id in (select post_id from scanned)),
      'next_7_days', coalesce((select jsonb_agg(jsonb_build_object('post_id', ev.post_id, 'title', p.title, 'starts_at', ev.starts_at,
                                                                   'status', ev.status, 'taken', private.event_taken(ev.post_id),
                                                                   'capacity', ev.capacity) order by ev.starts_at)
                               from ev join public.campus_posts p on p.id = ev.post_id
                               where ev.lifecycle = 'published' and ev.starts_at > now() and ev.starts_at <= now() + interval '7 days'), '[]'::jsonb))
  );
end;
$$;

-- One event's analytics: counts, check-ins, attendance rate, capacity use, and daily registration
-- and check-in trends (in the event's timezone). Anyone who can scan sees counts; never names.
create function public.event_analytics(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_event public.campus_events;
begin
  if not private.event_can_scan(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_event from public.campus_events where post_id = p_post_id;
  return private.event_counts(p_post_id) || jsonb_build_object(
    'checked_in', (select count(*) from public.event_tickets t where t.post_id = p_post_id and t.status = 'checked_in'),
    'capacity', v_event.capacity,
    'capacity_used', case when v_event.capacity is not null then round(private.event_taken(p_post_id)::numeric / v_event.capacity, 3) end,
    'attendance_rate', (select case when count(*) filter (where r.status in ('confirmed', 'attended', 'no_show')) = 0
                                         or not private.event_over(p_post_id) then null
                                    else round(count(*) filter (where r.status = 'attended')::numeric
                                               / count(*) filter (where r.status in ('confirmed', 'attended', 'no_show')), 3) end
                        from public.event_rsvps r where r.post_id = p_post_id),
    'registrations_by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'count', n) order by d) from (
        select (r.created_at at time zone v_event.timezone)::date as d, count(*) as n
        from public.event_rsvps r where r.post_id = p_post_id group by 1) z), '[]'::jsonb),
    'check_ins_by_hour', coalesce((select jsonb_agg(jsonb_build_object('hour', h, 'count', n) order by h) from (
        select date_trunc('hour', t.checked_in_at at time zone v_event.timezone) as h, count(*) as n
        from public.event_tickets t where t.post_id = p_post_id and t.checked_in_at is not null group by 1) z), '[]'::jsonb));
end;
$$;

-- The attendee list: owners and admins of the organisation and Perqly admins only. Names, school
-- and the event's own answers; never contact details or verification data.
create function public.event_attendees(p_post_id uuid, p_status text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.event_can_see_people(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'user_id', r.user_id, 'name', coalesce(p.full_name, p.first_name, 'Student'), 'institution', i.short_name,
        'status', r.status, 'registered_at', r.created_at, 'waitlisted_at', r.waitlisted_at, 'decided_at', r.decided_at,
        'answers', r.answers, 'ticket_code', t.code, 'checked_in_at', t.checked_in_at)
      order by case r.status when 'pending' then 0 when 'waitlisted' then 1 else 2 end, r.waitlisted_at, r.created_at)
    from public.event_rsvps r
    join public.profiles p on p.id = r.user_id
    left join public.student_profiles sp on sp.user_id = r.user_id
    left join public.institutions i on i.id = sp.institution_id
    left join public.event_tickets t on t.post_id = r.post_id and t.user_id = r.user_id and t.status <> 'cancelled'
    where r.post_id = p_post_id and (p_status is null or r.status = p_status)), '[]'::jsonb);
end;
$$;

-- Rows for the CSV export (the app builds the file). Same people as the list; each export is
-- recorded in the audit log and limited to 20 an hour.
create function public.event_attendee_export(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_rows jsonb;
begin
  if not private.event_can_see_people(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.check_rate_limit('events.export', 20, interval '1 hour');
  v_rows := jsonb_build_object(
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'prompt', q.prompt) order by q.position)
                           from public.event_questions q where q.post_id = p_post_id), '[]'::jsonb),
    'rows', public.event_attendees(p_post_id, null));
  perform private.event_audit(p_post_id, 'event.exported', null, null,
    jsonb_build_object('rows', jsonb_array_length(v_rows -> 'rows')));
  return v_rows;
end;
$$;

revoke execute on all functions in schema private from public;
revoke execute on function public.queue_due_event_reminders(), public.send_event_announcement(uuid, text, text),
  public.manage_events_list(jsonb), public.admin_events_overview(), public.event_analytics(uuid),
  public.event_attendees(uuid, text), public.event_attendee_export(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.queue_due_event_reminders() to service_role;
grant execute on function public.send_event_announcement(uuid, text, text), public.manage_events_list(jsonb),
  public.admin_events_overview(), public.event_analytics(uuid), public.event_attendees(uuid, text),
  public.event_attendee_export(uuid)
  to authenticated;
