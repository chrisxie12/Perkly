-- Events & Conferences, PR A part 2: status, permissions, registration, waitlist, approval,
-- tickets, check-in and event management. Existing functions keep their names and arguments
-- (so today's screens keep working) and gain the new rules.

-- Helpers -----------------------------------------------------------------------------------------

-- When an event is over: its end, or 3 hours after the start when it has none. A cancelled,
-- completed or archived event is over too.
create or replace function private.event_over(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select e.lifecycle in ('cancelled', 'completed', 'archived')
                       or coalesce(e.ends_at, e.starts_at + interval '3 hours') <= now()
                   from public.campus_events e where e.post_id = p_post_id), true);
$$;

-- Places taken: confirmed and attended registrations.
create function private.event_taken(p_post_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.event_rsvps where post_id = p_post_id and status in ('confirmed', 'attended');
$$;

-- Organisers who edit the event: its organisation's owners, admins and editors (while Campus is
-- on), or a Perqly admin with two-factor (also before launch, for set-up).
create function private.event_can_manage(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_edit_post(p_post_id)
      or (private.is_staff('admin')
          and exists (select 1 from public.campus_posts p where p.id = p_post_id and p.status <> 'removed'));
$$;

-- Organisers who see who registered (approve, attendee list, export): owners and admins of the
-- organisation, or a Perqly admin. Editors and door helpers don't.
create function private.event_can_see_people(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff('admin')
      or exists (select 1 from public.campus_posts p
                 where p.id = p_post_id and p.status <> 'removed'
                   and private.organisation_is_live(p.organisation_id)
                   and coalesce(private.organisation_role(p.organisation_id), '') in ('owner', 'admin'));
$$;

-- Who may scan tickets: the event's editors (as today), its door helpers, and Perqly admins.
create function private.event_can_scan(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.event_can_manage(p_post_id)
      or (exists (select 1 from public.event_staff s where s.post_id = p_post_id and s.user_id = (select auth.uid()))
          and not private.is_suspended());
$$;

-- Is this student allowed to attend? Verified, and in the event's audience: its own school by
-- default; plus listed schools, campuses or organisation members; or every verified student.
create function private.event_eligible(p_post_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.student_state(p_user) = 'verified'
       and (private.student_verified_at(p_user, e.institution_id)
            or e.audience = 'all_verified'
            or (e.audience = 'listed' and exists (
                  select 1 from public.event_audiences a
                  left join public.student_profiles sp on sp.user_id = p_user
                  where a.post_id = e.post_id
                    and ((a.kind = 'institution' and a.institution_id = sp.institution_id)
                         or (a.kind = 'campus' and a.campus_id = sp.campus_id)
                         or (a.kind = 'organisation' and exists (
                               select 1 from public.organisation_members m
                               where m.organisation_id = a.organisation_id and m.user_id = p_user and m.status = 'active'))))))
    from public.campus_events e where e.post_id = p_post_id), false);
$$;

-- Can the caller see this event as a student? Campus on, post live, event not a draft or
-- archived, and the caller eligible.
create function private.event_visible(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and private.campus_switch('campus.posts_enabled')
     and private.post_is_live(p_post_id)
     and exists (select 1 from public.campus_events e
                 where e.post_id = p_post_id and e.lifecycle in ('published', 'cancelled', 'completed'))
     and private.event_eligible(p_post_id, (select auth.uid()));
$$;

-- The status every screen shows, worked out here and nowhere else.
--   status:       draft | published (registration not open yet) | registration_open | full |
--                 registration_closed | cancelled | completed | archived
--   phase:        upcoming | live | ended
create function private.event_status(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', case
      when e.lifecycle in ('draft', 'cancelled', 'archived') then e.lifecycle
      when e.lifecycle = 'completed' or x.ended then 'completed'
      when not e.rsvp_open or now() >= x.closes then 'registration_closed'
      when e.registration_opens_at is not null and now() < e.registration_opens_at then 'published'
      when e.capacity is not null and private.event_taken(e.post_id) >= e.capacity then 'full'
      else 'registration_open' end,
    'phase', case when x.ended or e.lifecycle in ('cancelled', 'completed', 'archived') then 'ended'
                  when now() >= e.starts_at then 'live' else 'upcoming' end,
    'registration_open', e.lifecycle = 'published' and e.rsvp_open and not x.ended and now() < x.closes
                         and (e.registration_opens_at is null or now() >= e.registration_opens_at),
    'registration_closes_at', x.closes)
  from public.campus_events e
  cross join lateral (select coalesce(e.ends_at, e.starts_at + interval '3 hours') <= now() as ended,
                             least(coalesce(e.registration_closes_at, 'infinity'::timestamptz),
                                   coalesce(e.ends_at, e.starts_at + interval '3 hours')) as closes) x
  where e.post_id = p_post_id;
$$;

-- Notifications about events follow the Campus switch and settings, like other Campus messages.
create function private.notify_event(p_user uuid, p_post_id uuid, p_kind text, p_title text, p_body text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, title, body, link, push_status, email_status)
  select p_user, p_kind, left(p_title, 140), left(p_body, 500), '/student/campus/posts/' || p_post_id,
         private.campus_delivery_status(), private.campus_delivery_status()
  where p_user is not null;
$$;

create function private.event_title(p_post_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select title from public.campus_posts where id = p_post_id;
$$;

-- When, in the event's own timezone, for messages.
create function private.event_when(p_post_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select to_char(e.starts_at at time zone e.timezone, 'Dy DD Mon, HH24:MI')
         || case when e.timezone <> 'Africa/Accra' then ' (' || e.timezone || ')' else '' end
         || coalesce(', ' || e.venue, case when e.format = 'online' then ', online' else '' end)
  from public.campus_events e where e.post_id = p_post_id;
$$;

create function private.event_actor_context(p_post_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce('organisation:' || private.organisation_role(p.organisation_id), case when private.is_staff('admin') then 'platform:admin' end, 'user')
  from public.campus_posts p where p.id = p_post_id;
$$;

create function private.event_audit(p_post_id uuid, p_action text, p_before jsonb default null, p_after jsonb default null,
                                    p_metadata jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.write_audit(p_action, private.event_actor_context(p_post_id), 'campus_event', p_post_id, p_before, p_after,
                             p_metadata, (select institution_id from public.campus_events where post_id = p_post_id));
$$;

-- JSON ------------------------------------------------------------------------------------------

-- Event details. Same keys as before (screens keep working) plus the new ones. The QR secret and
-- the online link go only to the viewer's own live registration.
create or replace function private.event_json(p_post_id uuid, p_viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'starts_at', e.starts_at, 'ends_at', e.ends_at, 'venue', e.venue, 'capacity', e.capacity, 'rsvp_open', e.rsvp_open,
    'going', private.event_taken(e.post_id),
    'i_am_going', coalesce(r.status in ('confirmed', 'attended'), false),
    'over', private.event_over(e.post_id),
    'ticketed', e.normal_price_pesewas is not null,
    'normal_price', e.normal_price_pesewas,
    'student_price', e.student_price_pesewas,
    'my_ticket', (select private.ticket_json(t) || jsonb_build_object('qr', 'PQT1:' || private.ticket_secret(t.id))
                  from public.event_tickets t
                  where t.post_id = e.post_id and t.user_id = p_viewer and t.status <> 'cancelled'),
    'lifecycle', e.lifecycle,
    'timezone', e.timezone,
    'event_type', e.event_type,
    'format', e.format,
    'category', (select jsonb_build_object('slug', c.slug, 'name', c.name) from public.event_categories c where c.id = e.category_id),
    'summary', e.summary,
    'theme', e.theme,
    'poster_path', e.poster_path,
    'featured', e.featured,
    'venue_address', e.venue_address,
    'city', e.city,
    'campus', (select c.name from public.campuses c where c.id = e.campus_id),
    'map', case when e.map_lat is not null then jsonb_build_object('lat', e.map_lat, 'lng', e.map_lng) end,
    'venue_instructions', e.venue_instructions,
    'online_platform', e.online_platform,
    'online_instructions', case when r.status in ('confirmed', 'attended') then e.online_instructions end,
    'online_link', case when r.status in ('confirmed', 'attended') and e.lifecycle = 'published'
                          and now() >= e.starts_at - make_interval(mins => e.online_link_lead_minutes)
                          and not private.event_over(e.post_id) then e.online_link end,
    'online_link_from', case when e.online_link is not null then e.starts_at - make_interval(mins => e.online_link_lead_minutes) end,
    'registration_opens_at', e.registration_opens_at,
    'registration_closes_at', e.registration_closes_at,
    'approval_required', e.approval_required,
    'waitlist_enabled', e.waitlist_enabled,
    'cancellation_allowed', e.cancellation_allowed,
    'cancel_until', case when e.cancellation_allowed and e.cancel_until_hours > 0
                         then e.starts_at - make_interval(hours => e.cancel_until_hours) end,
    'audience', e.audience,
    'session_registration', e.session_registration,
    'spaces_left', case when e.capacity is not null then greatest(e.capacity - private.event_taken(e.post_id), 0) end,
    'waitlist_count', (select count(*) from public.event_rsvps w where w.post_id = e.post_id and w.status = 'waitlisted'),
    'cancelled_at', e.cancelled_at, 'cancel_reason', e.cancel_reason,
    'rescheduled_at', e.rescheduled_at, 'previous_starts_at', e.previous_starts_at,
    'contact', case when coalesce(e.contact_name, e.contact_email::text, e.contact_phone) is not null
                    then jsonb_build_object('name', e.contact_name, 'email', e.contact_email, 'phone', e.contact_phone) end,
    'my_registration', case when r.user_id is not null then jsonb_build_object(
        'status', r.status, 'created_at', r.created_at, 'decision_note', r.decision_note,
        'waitlist_position', case when r.status = 'waitlisted' then
          (select count(*) from public.event_rsvps w where w.post_id = e.post_id and w.status = 'waitlisted'
             and (w.waitlisted_at, w.user_id) <= (r.waitlisted_at, r.user_id)) end) end)
    || private.event_status(e.post_id)
  from public.campus_events e
  left join public.event_rsvps r on r.post_id = e.post_id and r.user_id = p_viewer
  where e.post_id = p_post_id;
$$;

-- Tickets ----------------------------------------------------------------------------------------

-- A confirmed registration gets a ticket (free events too: it's what the door scans). Prices are
-- those at the time; free events record 0.
create function private.issue_ticket(p_post_id uuid, p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.event_tickets (post_id, institution_id, user_id, code, normal_price_pesewas, student_price_pesewas)
  select e.post_id, e.institution_id, p_user, private.new_ticket_code(),
         coalesce(e.normal_price_pesewas, 0), coalesce(e.student_price_pesewas, 0)
  from public.campus_events e
  where e.post_id = p_post_id
    and not exists (select 1 from public.event_tickets t where t.post_id = p_post_id and t.user_id = p_user and t.status <> 'cancelled');
$$;

create function private.void_ticket(p_post_id uuid, p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.event_tickets set status = 'cancelled', cancelled_at = now()
   where post_id = p_post_id and user_id = p_user and status = 'active';
$$;

-- Fill free places from the waitlist, first come first served (waitlisted_at, then user id).
-- The caller holds the event row lock.
create function private.promote_waitlist(p_post_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.campus_events;
  v_free int;
  v_count int := 0;
  v_next record;
begin
  select * into v_event from public.campus_events where post_id = p_post_id;
  if v_event.lifecycle <> 'published' or private.event_over(p_post_id) then return 0; end if;
  v_free := case when v_event.capacity is null then 2147483647 else v_event.capacity - private.event_taken(p_post_id) end;
  for v_next in
    select user_id from public.event_rsvps
    where post_id = p_post_id and status = 'waitlisted'
    order by waitlisted_at, user_id
    limit greatest(v_free, 0)
    for update
  loop
    if not private.event_eligible(p_post_id, v_next.user_id) then continue; end if;
    update public.event_rsvps set status = 'confirmed', decided_at = now()
     where post_id = p_post_id and user_id = v_next.user_id;
    perform private.issue_ticket(p_post_id, v_next.user_id);
    perform private.notify_event(v_next.user_id, p_post_id, 'campus.event_promoted',
      'You have a place: ' || private.event_title(p_post_id),
      'A place opened up and it''s yours. ' || private.event_when(p_post_id) || '. Your ticket is in My Events.');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Registration -----------------------------------------------------------------------------------

-- Check registration answers against the event's questions. Returns the cleaned answers.
create function private.clean_event_answers(p_post_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q record;
  v_out jsonb := '{}'::jsonb;
  v_val jsonb;
begin
  if p_answers is null then p_answers := '{}'::jsonb; end if;
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'answers_invalid' using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_object_keys(p_answers) k
             where not exists (select 1 from public.event_questions q where q.post_id = p_post_id and q.id::text = k)) then
    raise exception 'answers_invalid' using errcode = 'P0001';
  end if;
  for v_q in select * from public.event_questions where post_id = p_post_id order by position loop
    v_val := p_answers -> v_q.id::text;
    if v_val is null or v_val = 'null'::jsonb or (jsonb_typeof(v_val) = 'string' and btrim(v_val #>> '{}') = '') then
      if v_q.required then raise exception 'answer_required' using errcode = 'P0001'; end if;
      continue;
    end if;
    if v_q.kind = 'yes_no' then
      if jsonb_typeof(v_val) <> 'boolean' then raise exception 'answers_invalid' using errcode = 'P0001'; end if;
    elsif jsonb_typeof(v_val) <> 'string' or char_length(v_val #>> '{}') > 500 then
      raise exception 'answers_invalid' using errcode = 'P0001';
    else
      v_val := to_jsonb(btrim(v_val #>> '{}'));
    end if;
    v_out := v_out || jsonb_build_object(v_q.id::text, v_val);
  end loop;
  return v_out;
end;
$$;

-- Register the caller. Locks the event row so two students can't both take the last place.
create function private.register_for_event(p_post_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_event public.campus_events;
  v_row public.event_rsvps;
  v_status text;
  v_answers jsonb;
  v_state jsonb;
begin
  perform private.campus_require();
  if not private.event_visible(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_event from public.campus_events where post_id = p_post_id for update;
  if v_event.post_id is null then raise exception 'event_not_found' using errcode = 'P0001'; end if;

  select * into v_row from public.event_rsvps where post_id = p_post_id and user_id = v_uid;
  if v_row.status in ('pending', 'confirmed', 'waitlisted', 'attended') then
    return private.event_json(p_post_id, v_uid);
  end if;
  if v_row.status = 'rejected' then raise exception 'registration_rejected' using errcode = 'P0001'; end if;

  if v_event.lifecycle = 'cancelled' then raise exception 'event_cancelled' using errcode = 'P0001'; end if;
  if private.event_over(p_post_id) then raise exception 'event_over' using errcode = 'P0001'; end if;
  if not v_event.rsvp_open then raise exception 'rsvp_closed' using errcode = 'P0001'; end if;
  v_state := private.event_status(p_post_id);
  if v_event.registration_opens_at is not null and now() < v_event.registration_opens_at then
    raise exception 'registration_not_open' using errcode = 'P0001';
  end if;
  if not (v_state ->> 'registration_open')::boolean then raise exception 'registration_closed' using errcode = 'P0001'; end if;

  perform private.check_rate_limit('campus.rsvp', 60, interval '1 hour');
  v_answers := private.clean_event_answers(p_post_id, p_answers);

  if v_event.approval_required then
    v_status := 'pending';
  elsif v_event.capacity is null or private.event_taken(p_post_id) < v_event.capacity then
    v_status := 'confirmed';
  elsif v_event.waitlist_enabled then
    v_status := 'waitlisted';
  else
    raise exception 'event_full' using errcode = 'P0001';
  end if;

  insert into public.event_rsvps (post_id, institution_id, user_id, status, answers, waitlisted_at)
  values (p_post_id, v_event.institution_id, v_uid, v_status, v_answers, case when v_status = 'waitlisted' then clock_timestamp() end)
  on conflict (post_id, user_id) do update
    set status = excluded.status, answers = excluded.answers, waitlisted_at = excluded.waitlisted_at, created_at = now(),
        cancelled_at = null, decided_at = null, decided_by = null, decision_note = null, reminded_at = null;

  if v_status = 'confirmed' then
    perform private.issue_ticket(p_post_id, v_uid);
    perform private.notify_event(v_uid, p_post_id, 'campus.event_registered', 'You''re going: ' || private.event_title(p_post_id),
      private.event_when(p_post_id) || '. Your ticket is in My Events.');
  elsif v_status = 'pending' then
    perform private.notify_event(v_uid, p_post_id, 'campus.event_pending', 'Registration sent: ' || private.event_title(p_post_id),
      'The organisers will approve or decline it. We''ll tell you either way.');
  else
    perform private.notify_event(v_uid, p_post_id, 'campus.event_waitlisted', 'On the waitlist: ' || private.event_title(p_post_id),
      'The event is full. If a place opens up, the first person on the waitlist gets it, and we''ll tell you.');
  end if;
  return private.event_json(p_post_id, v_uid);
end;
$$;

-- Cancel a registration (the student's own, or by the system when the event is cancelled).
-- Attended registrations can't be cancelled. A freed place goes to the waitlist.
create function private.cancel_registration(p_post_id uuid, p_user uuid, p_by_student boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.campus_events;
  v_row public.event_rsvps;
begin
  select * into v_event from public.campus_events where post_id = p_post_id for update;
  select * into v_row from public.event_rsvps where post_id = p_post_id and user_id = p_user for update;
  if v_row.user_id is null or v_row.status in ('cancelled', 'rejected', 'no_show') then return; end if;
  if v_row.status = 'attended'
     or exists (select 1 from public.event_tickets where post_id = p_post_id and user_id = p_user and status = 'checked_in') then
    raise exception 'already_checked_in' using errcode = 'P0001';
  end if;
  if p_by_student and v_row.status = 'confirmed' then
    if not v_event.cancellation_allowed then raise exception 'cancel_not_allowed' using errcode = 'P0001'; end if;
    if v_event.cancel_until_hours > 0 and now() > v_event.starts_at - make_interval(hours => v_event.cancel_until_hours) then
      raise exception 'cancel_too_late' using errcode = 'P0001';
    end if;
  end if;
  update public.event_rsvps set status = 'cancelled', cancelled_at = now() where post_id = p_post_id and user_id = p_user;
  perform private.void_ticket(p_post_id, p_user);
  if v_row.status = 'confirmed' then perform private.promote_waitlist(p_post_id); end if;
end;
$$;

create function public.register_for_event(p_post_id uuid, p_answers jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_event public.campus_events;
begin
  select * into v_event from public.campus_events where post_id = p_post_id;
  if v_event.normal_price_pesewas is not null then
    -- Ticketed (pay at the door): same path; the ticket carries the prices.
    null;
  end if;
  return private.register_for_event(p_post_id, p_answers);
end;
$$;

create function public.cancel_event_registration(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.campus_require();
  if not private.event_visible(p_post_id)
     and not exists (select 1 from public.event_rsvps where post_id = p_post_id and user_id = (select auth.uid())) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform private.cancel_registration(p_post_id, (select auth.uid()), true);
  return private.event_json(p_post_id, (select auth.uid()));
end;
$$;

-- Old entry points, same arguments. Going = register (free events); not going = cancel.
create or replace function public.set_rsvp(p_post_id uuid, p_going boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_event public.campus_events;
begin
  perform private.campus_require();
  if not private.event_visible(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_event from public.campus_events where post_id = p_post_id;
  if v_event.post_id is null then raise exception 'event_not_found' using errcode = 'P0001'; end if;
  if p_going then
    if v_event.normal_price_pesewas is not null then raise exception 'ticket_required' using errcode = 'P0001'; end if;
    return private.register_for_event(p_post_id, '{}'::jsonb);
  end if;
  perform private.cancel_registration(p_post_id, (select auth.uid()), true);
  return private.event_json(p_post_id, (select auth.uid()));
end;
$$;

create or replace function public.take_event_ticket(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_event public.campus_events;
begin
  perform private.campus_require();
  if not private.event_visible(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_event from public.campus_events where post_id = p_post_id;
  if v_event.post_id is null then raise exception 'event_not_found' using errcode = 'P0001'; end if;
  if v_event.normal_price_pesewas is null then raise exception 'not_ticketed' using errcode = 'P0001'; end if;
  return private.register_for_event(p_post_id, '{}'::jsonb);
end;
$$;

-- Organisers approve or decline pending registrations.
create function public.decide_event_registration(p_post_id uuid, p_user_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.campus_events;
  v_row public.event_rsvps;
  v_status text;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not private.event_can_see_people(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_event from public.campus_events where post_id = p_post_id for update;
  select * into v_row from public.event_rsvps where post_id = p_post_id and user_id = p_user_id for update;
  if v_row.user_id is null or v_row.status <> 'pending' then raise exception 'not_pending' using errcode = 'P0001'; end if;
  if p_note is not null and char_length(btrim(p_note)) not between 2 and 300 then raise exception 'note_invalid' using errcode = 'P0001'; end if;

  if p_approve then
    if v_event.lifecycle <> 'published' or private.event_over(p_post_id) then raise exception 'event_closed' using errcode = 'P0001'; end if;
    if not private.event_eligible(p_post_id, p_user_id) then raise exception 'not_eligible' using errcode = 'P0001'; end if;
    if v_event.capacity is null or private.event_taken(p_post_id) < v_event.capacity then
      v_status := 'confirmed';
    elsif v_event.waitlist_enabled then
      v_status := 'waitlisted';
    else
      raise exception 'event_full' using errcode = 'P0001';
    end if;
  else
    v_status := 'rejected';
  end if;

  update public.event_rsvps
     set status = v_status, decided_at = now(), decided_by = (select auth.uid()), decision_note = nullif(btrim(p_note), ''),
         waitlisted_at = case when v_status = 'waitlisted' then clock_timestamp() else waitlisted_at end
   where post_id = p_post_id and user_id = p_user_id;

  if v_status = 'confirmed' then
    perform private.issue_ticket(p_post_id, p_user_id);
    perform private.notify_event(p_user_id, p_post_id, 'campus.event_approved', 'Approved: ' || private.event_title(p_post_id),
      private.event_when(p_post_id) || '. Your ticket is in My Events.');
  elsif v_status = 'waitlisted' then
    perform private.notify_event(p_user_id, p_post_id, 'campus.event_waitlisted', 'Approved, on the waitlist: ' || private.event_title(p_post_id),
      'You''re approved, but the event is full. If a place opens up, we''ll tell you.');
  else
    perform private.notify_event(p_user_id, p_post_id, 'campus.event_rejected', 'Not approved: ' || private.event_title(p_post_id),
      coalesce(btrim(p_note), 'The organisers couldn''t offer you a place this time.'));
  end if;
  perform private.event_audit(p_post_id, 'event.registration_' || case when p_approve then 'approved' else 'rejected' end,
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', v_status), jsonb_build_object('student', p_user_id));
  return jsonb_build_object('user_id', p_user_id, 'status', v_status);
end;
$$;

-- The door --------------------------------------------------------------------------------------

-- Doors open 24 hours before the start and close when the event is over (as before).
-- Find a ticket for this event from what was scanned or typed: the new QR ("PQT1:" + 32 hex)
-- or the 8-character code (old QRs and typing).
create function private.find_event_ticket(p_post_id uuid, p_value text, p_lock boolean)
returns public.event_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raw text := btrim(coalesce(p_value, ''));
  v_secret text := lower(substring(v_raw from '(?i)^(?:PQT1:)?([0-9a-f]{32})$'));
  v_ticket public.event_tickets;
begin
  if v_secret is not null then
    if p_lock then
      select * into v_ticket from public.event_tickets
       where post_id = p_post_id and secret_hash = private.ticket_secret_hash(v_secret) for update;
    else
      select * into v_ticket from public.event_tickets
       where post_id = p_post_id and secret_hash = private.ticket_secret_hash(v_secret);
    end if;
  else
    if p_lock then
      select * into v_ticket from public.event_tickets
       where post_id = p_post_id and code = upper(regexp_replace(v_raw, '[^A-Za-z0-9]', '', 'g')) for update;
    else
      select * into v_ticket from public.event_tickets
       where post_id = p_post_id and code = upper(regexp_replace(v_raw, '[^A-Za-z0-9]', '', 'g'));
    end if;
  end if;
  return v_ticket;
end;
$$;

create or replace function public.door_lookup_ticket(p_post_id uuid, p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ticket public.event_tickets;
  v_profile public.profiles;
  v_status text;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not private.event_can_scan(p_post_id) then raise exception 'post_not_found' using errcode = 'P0001'; end if;
  if not private.door_open(p_post_id) then raise exception 'door_closed' using errcode = 'P0001'; end if;
  v_ticket := private.find_event_ticket(p_post_id, p_code, false);
  if v_ticket.id is null or v_ticket.status = 'cancelled' then raise exception 'ticket_not_found' using errcode = 'P0001'; end if;
  select status into v_status from public.event_rsvps where post_id = p_post_id and user_id = v_ticket.user_id;
  if v_status in ('cancelled', 'rejected') then raise exception 'ticket_not_found' using errcode = 'P0001'; end if;
  select * into v_profile from public.profiles where id = v_ticket.user_id;
  return private.ticket_json(v_ticket) || jsonb_build_object(
    'name', coalesce(v_profile.full_name, v_profile.first_name, 'Student'),
    'photo_path', case when private.pass_photo_owner(v_profile.avatar_path) = v_ticket.user_id then v_profile.avatar_path end,
    'still_verified', private.event_eligible(p_post_id, v_ticket.user_id));
end;
$$;

-- Check in. Locks the ticket row, so two scanners can't both admit the same ticket: the second
-- sees already_checked_in. Cancelled or rejected registrations never get in.
create function private.check_in(p_post_id uuid, p_ticket public.event_tickets)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.event_tickets := p_ticket;
  v_status text;
begin
  if v_ticket.id is null or v_ticket.status = 'cancelled' then raise exception 'ticket_not_found' using errcode = 'P0001'; end if;
  select status into v_status from public.event_rsvps where post_id = p_post_id and user_id = v_ticket.user_id for update;
  if v_status is null or v_status in ('cancelled', 'rejected') then raise exception 'ticket_not_found' using errcode = 'P0001'; end if;
  if v_ticket.status = 'checked_in' then raise exception 'already_checked_in' using errcode = 'P0001'; end if;
  if not private.event_eligible(p_post_id, v_ticket.user_id) then raise exception 'not_verified' using errcode = 'P0001'; end if;
  update public.event_tickets
     set status = 'checked_in', checked_in_at = now(), checked_in_by = (select auth.uid())
   where id = v_ticket.id
   returning * into v_ticket;
  update public.event_rsvps set status = 'attended' where post_id = p_post_id and user_id = v_ticket.user_id;
  return private.ticket_json(v_ticket);
end;
$$;

create or replace function public.door_check_in(p_post_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not private.event_can_scan(p_post_id) then raise exception 'post_not_found' using errcode = 'P0001'; end if;
  if not private.door_open(p_post_id) then raise exception 'door_closed' using errcode = 'P0001'; end if;
  perform private.check_rate_limit('events.door', 1200, interval '1 hour');
  return private.check_in(p_post_id, private.find_event_ticket(p_post_id, p_code, true));
end;
$$;

-- Manual fallback: find a registered student by name and check them in by registration.
create function public.door_search_attendees(p_post_id uuid, p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_q text := btrim(coalesce(p_query, ''));
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not private.event_can_scan(p_post_id) then raise exception 'post_not_found' using errcode = 'P0001'; end if;
  if not private.door_open(p_post_id) then raise exception 'door_closed' using errcode = 'P0001'; end if;
  if char_length(v_q) < 2 or char_length(v_q) > 60 then raise exception 'query_invalid' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'name', coalesce(p.full_name, p.first_name, 'Student'),
                                        'status', r.status, 'code', t.code, 'checked_in_at', t.checked_in_at)
                     order by coalesce(p.full_name, p.first_name))
    from public.event_rsvps r
    join public.profiles p on p.id = r.user_id
    left join public.event_tickets t on t.post_id = r.post_id and t.user_id = r.user_id and t.status <> 'cancelled'
    where r.post_id = p_post_id and r.status in ('confirmed', 'attended')
      and (p.full_name ilike '%' || v_q || '%' or p.first_name ilike '%' || v_q || '%')
    limit 10), '[]'::jsonb);
end;
$$;

create function public.door_check_in_attendee(p_post_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_ticket public.event_tickets;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not private.event_can_scan(p_post_id) then raise exception 'post_not_found' using errcode = 'P0001'; end if;
  if not private.door_open(p_post_id) then raise exception 'door_closed' using errcode = 'P0001'; end if;
  perform private.check_rate_limit('events.door', 1200, interval '1 hour');
  select * into v_ticket from public.event_tickets
   where post_id = p_post_id and user_id = p_user_id and status <> 'cancelled' for update;
  return private.check_in(p_post_id, v_ticket) || jsonb_build_object('manual', true);
end;
$$;

-- Events the caller can scan now (doors open), for the scanner's event picker.
create function public.my_scannable_events()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('post_id', e.post_id, 'title', p.title, 'starts_at', e.starts_at,
                                               'ends_at', e.ends_at, 'venue', e.venue) order by e.starts_at), '[]'::jsonb)
  from public.campus_events e
  join public.campus_posts p on p.id = e.post_id
  where e.lifecycle = 'published'
    and private.door_open(e.post_id)
    and private.event_can_scan(e.post_id);
$$;

-- Ticket numbers: same keys as before, plus registration counts.
create or replace function public.event_ticket_stats(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'active', (select count(*) from public.event_tickets t where t.post_id = p_post_id and t.status = 'active'),
    'checked_in', (select count(*) from public.event_tickets t where t.post_id = p_post_id and t.status = 'checked_in'),
    'door_open', private.door_open(p_post_id),
    'pending', (select count(*) from public.event_rsvps r where r.post_id = p_post_id and r.status = 'pending'),
    'waitlisted', (select count(*) from public.event_rsvps r where r.post_id = p_post_id and r.status = 'waitlisted'),
    'confirmed', (select count(*) from public.event_rsvps r where r.post_id = p_post_id and r.status in ('confirmed', 'attended')))
  where private.event_can_scan(p_post_id);
$$;

-- Door helpers may see the photo of a student with a live ticket while doors are open.
create or replace function private.can_read_pass_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.pass_photo_owner(p_name) = (select auth.uid())
      or exists (
        select 1 from public.redemption_sessions s
        where s.student_id = private.pass_photo_owner(p_name)
          and s.status in ('awaiting_merchant', 'awaiting_student') and s.expires_at > now()
          and (select private.can_operate_branch(s.branch_id)))
      or exists (
        select 1 from public.event_tickets t
        where t.user_id = private.pass_photo_owner(p_name)
          and t.status in ('active', 'checked_in')
          and private.door_open(t.post_id)
          and private.event_can_scan(t.post_id));
$$;

-- Event management --------------------------------------------------------------------------------

create function public.event_categories()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'active', c.active)
                            order by c.position, c.name), '[]'::jsonb)
  from public.event_categories c
  where c.active or private.is_staff('admin');
$$;

create function public.admin_save_event_category(p_slug text, p_name text, p_position int default 100, p_active boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_staff('admin') then raise exception 'forbidden' using errcode = 'P0001'; end if;
  begin
    insert into public.event_categories (slug, name, position, active)
    values (lower(btrim(p_slug)), btrim(p_name), p_position, coalesce(p_active, true))
    on conflict (slug) do update set name = excluded.name, position = excluded.position, active = excluded.active;
  exception when check_violation or not_null_violation then
    raise exception 'category_invalid' using errcode = 'P0001';
  end;
  perform private.write_audit('event.category_saved', 'platform:admin', 'event_category',
    (select id from public.event_categories where slug = lower(btrim(p_slug))), null,
    jsonb_build_object('slug', p_slug, 'name', p_name, 'active', p_active));
end;
$$;

-- Perqly's own organisation at a school, made on first use. Perqly admins only.
create function public.admin_perqly_organisation(p_institution_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not private.is_staff('admin') then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select id into v_id from public.campus_organisations where institution_id = p_institution_id and kind = 'perqly';
  if v_id is not null then return v_id; end if;
  if not exists (select 1 from public.institutions where id = p_institution_id) then
    raise exception 'institution_not_found' using errcode = 'P0001';
  end if;
  insert into public.campus_organisations (institution_id, kind, name, slug, description, status, verified_by, verified_at, created_by)
  values (p_institution_id, 'perqly', 'Perqly',
          case when exists (select 1 from public.campus_organisations where institution_id = p_institution_id and slug = 'perqly')
               then 'perqly-events' else 'perqly' end,
          'Events run by the Perqly team.', 'verified', (select auth.uid()), now(), (select auth.uid()))
  returning id into v_id;
  perform private.write_audit('campus.organisation_created', 'platform:admin', 'campus_organisation', v_id, null,
    jsonb_build_object('kind', 'perqly'), '{}'::jsonb, p_institution_id);
  return v_id;
end;
$$;

-- Read a timestamptz from an event payload; null when absent.
create function private.payload_time(p_data jsonb, p_key text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_data ? p_key and jsonb_typeof(p_data -> p_key) = 'string' then return (p_data ->> p_key)::timestamptz; end if;
  return null;
exception when others then
  raise exception 'event_invalid' using errcode = 'P0001';
end;
$$;

create function private.payload_text(p_data jsonb, p_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(p_data ->> p_key), '');
$$;

-- The post kind an event type is filed under in the Campus feed.
create function private.event_post_kind(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type in ('conference', 'summit', 'workshop', 'bootcamp', 'seminar', 'panel', 'career_fair', 'networking') then 'workshop_seminar'
    when p_type in ('competition', 'exhibition') then 'entertainment'
    else 'campus_news' end;
$$;

-- Create (p_post_id null) or edit an event. Creates a draft post for the organisation. Times of a
-- published event change only through reschedule_event (it tells the people registered).
--   p_data keys: title, description, link_url, category (slug), event_type, format, timezone,
--   starts_at, ends_at, registration_opens_at, registration_closes_at, venue, venue_address,
--   campus_id, city, map_lat, map_lng, venue_instructions, online_platform, online_link,
--   online_instructions, online_link_lead_minutes, capacity, approval_required, waitlist_enabled,
--   cancellation_allowed, cancel_until_hours, session_registration, sessions_no_clash, theme,
--   summary, poster_path, featured, contact_name, contact_email, contact_phone, remind_7d,
--   remind_24h, remind_1h, rsvp_open.
create function public.save_event(p_post_id uuid, p_organisation_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org public.campus_organisations;
  v_post public.campus_posts;
  v_event public.campus_events;
  v_type text := coalesce(private.payload_text(p_data, 'event_type'), 'event');
  v_starts timestamptz := private.payload_time(p_data, 'starts_at');
  v_ends timestamptz := private.payload_time(p_data, 'ends_at');
  v_category uuid;
  v_before jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'event_invalid' using errcode = 'P0001'; end if;
  if private.payload_text(p_data, 'category') is not null then
    select id into v_category from public.event_categories where slug = p_data ->> 'category' and active;
    if v_category is null then raise exception 'category_invalid' using errcode = 'P0001'; end if;
  end if;

  if p_post_id is null then
    select * into v_org from public.campus_organisations where id = p_organisation_id;
    if v_org.id is null or not (private.can_publish(v_org.id) or private.is_staff('admin')) or v_org.status <> 'verified' then
      raise exception 'organisation_not_found' using errcode = 'P0001';
    end if;
    if v_starts is null then raise exception 'event_invalid' using errcode = 'P0001'; end if;
    perform private.check_rate_limit('events.create', 30, interval '1 day');
    begin
      insert into public.campus_posts (institution_id, organisation_id, author_id, kind, title, body, link_url, visibility, status)
      values (v_org.institution_id, v_org.id, v_uid, private.event_post_kind(v_type),
              btrim(coalesce(p_data ->> 'title', '')), btrim(coalesce(p_data ->> 'description', '')),
              private.payload_text(p_data, 'link_url'), 'school', 'draft')
      returning * into v_post;
      insert into public.campus_events (post_id, institution_id, starts_at, ends_at, venue, lifecycle, created_by)
      values (v_post.id, v_post.institution_id, v_starts, v_ends, private.payload_text(p_data, 'venue'), 'draft', v_uid);
    exception when check_violation or not_null_violation then
      raise exception 'event_invalid' using errcode = 'P0001';
    end;
  else
    if not private.event_can_manage(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
    select * into v_post from public.campus_posts where id = p_post_id for update;
    select * into v_event from public.campus_events where post_id = p_post_id for update;
    if v_event.post_id is null then raise exception 'event_not_found' using errcode = 'P0001'; end if;
    if v_event.lifecycle in ('cancelled', 'completed', 'archived') then raise exception 'event_closed' using errcode = 'P0001'; end if;
    if v_event.lifecycle = 'published'
       and ((p_data ? 'starts_at' and v_starts is distinct from v_event.starts_at)
            or (p_data ? 'ends_at' and v_ends is distinct from v_event.ends_at)) then
      raise exception 'use_reschedule' using errcode = 'P0001';
    end if;
    v_before := to_jsonb(v_event);
    begin
      update public.campus_posts
         set title = coalesce(nullif(btrim(p_data ->> 'title'), ''), title),
             body = coalesce(nullif(btrim(p_data ->> 'description'), ''), body),
             link_url = case when p_data ? 'link_url' then private.payload_text(p_data, 'link_url') else link_url end,
             kind = case when p_data ? 'event_type' then private.event_post_kind(v_type) else kind end
       where id = p_post_id;
      update public.campus_events
         set starts_at = case when p_data ? 'starts_at' then v_starts else starts_at end,
             ends_at = case when p_data ? 'ends_at' then v_ends else ends_at end,
             venue = case when p_data ? 'venue' then private.payload_text(p_data, 'venue') else venue end
       where post_id = p_post_id;
    exception when check_violation or not_null_violation then
      raise exception 'event_invalid' using errcode = 'P0001';
    end;
  end if;

  -- Everything else, for both create and edit: only the keys given change.
  begin
    update public.campus_events e set
      category_id = case when p_data ? 'category' then v_category else e.category_id end,
      event_type = case when p_data ? 'event_type' then v_type else e.event_type end,
      format = case when p_data ? 'format' then p_data ->> 'format' else e.format end,
      timezone = case when p_data ? 'timezone' then coalesce(private.payload_text(p_data, 'timezone'), 'Africa/Accra') else e.timezone end,
      registration_opens_at = case when p_data ? 'registration_opens_at' then private.payload_time(p_data, 'registration_opens_at') else e.registration_opens_at end,
      registration_closes_at = case when p_data ? 'registration_closes_at' then private.payload_time(p_data, 'registration_closes_at') else e.registration_closes_at end,
      venue_address = case when p_data ? 'venue_address' then private.payload_text(p_data, 'venue_address') else e.venue_address end,
      campus_id = case when p_data ? 'campus_id' then (p_data ->> 'campus_id')::uuid else e.campus_id end,
      city = case when p_data ? 'city' then private.payload_text(p_data, 'city') else e.city end,
      map_lat = case when p_data ? 'map_lat' then (p_data ->> 'map_lat')::numeric else e.map_lat end,
      map_lng = case when p_data ? 'map_lng' then (p_data ->> 'map_lng')::numeric else e.map_lng end,
      venue_instructions = case when p_data ? 'venue_instructions' then private.payload_text(p_data, 'venue_instructions') else e.venue_instructions end,
      online_platform = case when p_data ? 'online_platform' then private.payload_text(p_data, 'online_platform') else e.online_platform end,
      online_link = case when p_data ? 'online_link' then private.payload_text(p_data, 'online_link') else e.online_link end,
      online_instructions = case when p_data ? 'online_instructions' then private.payload_text(p_data, 'online_instructions') else e.online_instructions end,
      online_link_lead_minutes = case when p_data ? 'online_link_lead_minutes' then (p_data ->> 'online_link_lead_minutes')::int else e.online_link_lead_minutes end,
      capacity = case when p_data ? 'capacity' then (p_data ->> 'capacity')::int else e.capacity end,
      approval_required = case when p_data ? 'approval_required' then (p_data ->> 'approval_required')::boolean else e.approval_required end,
      waitlist_enabled = case when p_data ? 'waitlist_enabled' then (p_data ->> 'waitlist_enabled')::boolean else e.waitlist_enabled end,
      cancellation_allowed = case when p_data ? 'cancellation_allowed' then (p_data ->> 'cancellation_allowed')::boolean else e.cancellation_allowed end,
      cancel_until_hours = case when p_data ? 'cancel_until_hours' then (p_data ->> 'cancel_until_hours')::int else e.cancel_until_hours end,
      session_registration = case when p_data ? 'session_registration' then (p_data ->> 'session_registration')::boolean else e.session_registration end,
      sessions_no_clash = case when p_data ? 'sessions_no_clash' then (p_data ->> 'sessions_no_clash')::boolean else e.sessions_no_clash end,
      theme = case when p_data ? 'theme' then private.payload_text(p_data, 'theme') else e.theme end,
      summary = case when p_data ? 'summary' then private.payload_text(p_data, 'summary') else e.summary end,
      poster_path = case when p_data ? 'poster_path' then private.payload_text(p_data, 'poster_path') else e.poster_path end,
      featured = case when p_data ? 'featured' and private.is_staff('admin') then (p_data ->> 'featured')::boolean else e.featured end,
      contact_name = case when p_data ? 'contact_name' then private.payload_text(p_data, 'contact_name') else e.contact_name end,
      contact_email = case when p_data ? 'contact_email' then private.payload_text(p_data, 'contact_email') else e.contact_email end,
      contact_phone = case when p_data ? 'contact_phone' then private.payload_text(p_data, 'contact_phone') else e.contact_phone end,
      remind_7d = case when p_data ? 'remind_7d' then (p_data ->> 'remind_7d')::boolean else e.remind_7d end,
      remind_24h = case when p_data ? 'remind_24h' then (p_data ->> 'remind_24h')::boolean else e.remind_24h end,
      remind_1h = case when p_data ? 'remind_1h' then (p_data ->> 'remind_1h')::boolean else e.remind_1h end,
      rsvp_open = case when p_data ? 'rsvp_open' then (p_data ->> 'rsvp_open')::boolean else e.rsvp_open end
    where e.post_id = coalesce(p_post_id, v_post.id)
    returning * into v_event;
  exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range
                 or foreign_key_violation or datetime_field_overflow then
    raise exception 'event_invalid' using errcode = 'P0001';
  end;

  -- The timezone must be one Postgres knows.
  perform now() at time zone v_event.timezone;
  -- Poster images must belong to this school and organisation.
  if v_event.poster_path is not null and split_part(v_event.poster_path, '/', 1) <> v_event.institution_id::text then
    raise exception 'event_invalid' using errcode = 'P0001';
  end if;
  if v_event.capacity is not null and v_event.capacity < private.event_taken(v_event.post_id) then
    raise exception 'capacity_below_going' using errcode = 'P0001';
  end if;
  if v_event.campus_id is not null and not exists (select 1 from public.campuses where id = v_event.campus_id and institution_id = v_event.institution_id) then
    raise exception 'event_invalid' using errcode = 'P0001';
  end if;
  -- More places may free the waitlist.
  perform private.promote_waitlist(v_event.post_id);

  perform private.event_audit(v_event.post_id, case when p_post_id is null then 'event.created' else 'event.updated' end,
    v_before, to_jsonb(v_event) - 'online_link');
  return v_event.post_id;
exception when invalid_parameter_value then
  raise exception 'timezone_invalid' using errcode = 'P0001';
end;
$$;

-- What must be true before an event goes live (and stays live after edits).
create function private.event_publishable(p_post_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when e.starts_at <= now() then 'starts_in_past'
    when e.ends_at is not null and e.ends_at <= e.starts_at then 'ends_before_start'
    when e.registration_closes_at is not null and e.registration_closes_at > coalesce(e.ends_at, e.starts_at + interval '3 hours') then 'registration_after_end'
    when e.registration_opens_at is not null and e.registration_opens_at >= coalesce(e.registration_closes_at, coalesce(e.ends_at, e.starts_at + interval '3 hours')) then 'registration_window_invalid'
    when e.format in ('physical', 'hybrid') and e.venue is null then 'venue_required'
    when e.format in ('online', 'hybrid') and e.online_link is null then 'online_link_required'
    when e.category_id is null then 'category_required'
    when char_length(p.body) < 10 then 'description_required'
    else null end
  from public.campus_events e join public.campus_posts p on p.id = e.post_id
  where e.post_id = p_post_id;
$$;

create function public.publish_event(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.campus_events;
  v_problem text;
begin
  if not private.event_can_manage(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_event from public.campus_events where post_id = p_post_id for update;
  if v_event.lifecycle <> 'draft' then raise exception 'not_draft' using errcode = 'P0001'; end if;
  v_problem := private.event_publishable(p_post_id);
  if v_problem is not null then raise exception '%', v_problem using errcode = 'P0001'; end if;
  update public.campus_posts set status = 'published', publish_at = coalesce(publish_at, now()) where id = p_post_id;
  update public.campus_events set lifecycle = 'published', published_at = coalesce(published_at, now()) where post_id = p_post_id;
  perform private.notify_campus(p_post_id);
  perform private.event_audit(p_post_id, 'event.published');
  return private.event_status(p_post_id);
end;
$$;

-- Back to draft: only while nobody holds a place, a request or a waitlist spot.
create function public.unpublish_event(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.event_can_manage(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform 1 from public.campus_events where post_id = p_post_id and lifecycle = 'published' for update;
  if not found then raise exception 'not_published' using errcode = 'P0001'; end if;
  if exists (select 1 from public.event_rsvps where post_id = p_post_id and status in ('pending', 'confirmed', 'waitlisted', 'attended')) then
    raise exception 'registrations_exist' using errcode = 'P0001';
  end if;
  update public.campus_posts set status = 'draft' where id = p_post_id;
  update public.campus_events set lifecycle = 'draft' where post_id = p_post_id;
  perform private.event_audit(p_post_id, 'event.unpublished');
  return private.event_status(p_post_id);
end;
$$;

-- Cancel: the event stays visible as cancelled; live registrations become cancelled (kept as
-- history), tickets are voided, and everyone who held a place, a request or a waitlist spot is told.
create function public.cancel_event(p_post_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.campus_events;
  v_row record;
begin
  if not private.event_can_manage(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 500 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  select * into v_event from public.campus_events where post_id = p_post_id for update;
  if v_event.lifecycle not in ('draft', 'published') then raise exception 'event_closed' using errcode = 'P0001'; end if;
  update public.campus_events set lifecycle = 'cancelled', cancelled_at = now(), cancel_reason = btrim(p_reason)
   where post_id = p_post_id;
  for v_row in select user_id, status from public.event_rsvps
               where post_id = p_post_id and status in ('pending', 'confirmed', 'waitlisted') for update loop
    update public.event_rsvps set status = 'cancelled', cancelled_at = now() where post_id = p_post_id and user_id = v_row.user_id;
    perform private.void_ticket(p_post_id, v_row.user_id);
    perform private.notify_event(v_row.user_id, p_post_id, 'campus.event_cancelled', 'Cancelled: ' || private.event_title(p_post_id),
      btrim(p_reason));
  end loop;
  perform private.event_audit(p_post_id, 'event.cancelled', jsonb_build_object('lifecycle', v_event.lifecycle),
    jsonb_build_object('lifecycle', 'cancelled', 'reason', btrim(p_reason)));
  return private.event_status(p_post_id);
end;
$$;

-- New times. Everyone holding a place, a request or a waitlist spot is told, and reminders start
-- again for the new time.
create function public.reschedule_event(p_post_id uuid, p_starts_at timestamptz, p_ends_at timestamptz default null,
                                        p_registration_closes_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.campus_events;
  v_row record;
begin
  if not private.event_can_manage(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_event from public.campus_events where post_id = p_post_id for update;
  if v_event.lifecycle not in ('draft', 'published') then raise exception 'event_closed' using errcode = 'P0001'; end if;
  if p_starts_at is null or p_starts_at <= now() then raise exception 'starts_in_past' using errcode = 'P0001'; end if;
  if p_ends_at is not null and p_ends_at <= p_starts_at then raise exception 'ends_before_start' using errcode = 'P0001'; end if;
  if p_registration_closes_at is not null and p_registration_closes_at > coalesce(p_ends_at, p_starts_at + interval '3 hours') then
    raise exception 'registration_after_end' using errcode = 'P0001';
  end if;
  begin
    update public.campus_events
       set previous_starts_at = starts_at, starts_at = p_starts_at, ends_at = p_ends_at,
           registration_closes_at = coalesce(p_registration_closes_at, registration_closes_at),
           rescheduled_at = case when lifecycle = 'published' then now() else rescheduled_at end
     where post_id = p_post_id
     returning * into v_event;
  exception when check_violation then
    raise exception 'event_invalid' using errcode = 'P0001';
  end;
  if v_event.registration_closes_at is not null and v_event.registration_closes_at > coalesce(v_event.ends_at, v_event.starts_at + interval '3 hours') then
    raise exception 'registration_after_end' using errcode = 'P0001';
  end if;
  update public.event_rsvps set reminded_at = null where post_id = p_post_id;
  if v_event.lifecycle = 'published' then
    for v_row in select user_id from public.event_rsvps where post_id = p_post_id and status in ('pending', 'confirmed', 'waitlisted') loop
      perform private.notify_event(v_row.user_id, p_post_id, 'campus.event_rescheduled', 'New time: ' || private.event_title(p_post_id),
        'Now ' || private.event_when(p_post_id) || '. Your registration still stands.');
    end loop;
  end if;
  perform private.event_audit(p_post_id, 'event.rescheduled', jsonb_build_object('starts_at', v_event.previous_starts_at),
    jsonb_build_object('starts_at', p_starts_at, 'ends_at', p_ends_at));
  return private.event_json(p_post_id, (select auth.uid()));
end;
$$;

-- Completed: after it has started. Optionally mark confirmed people who never checked in as no-shows
-- (only worth doing when the door scanned tickets).
create function public.complete_event(p_post_id uuid, p_mark_no_shows boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.event_can_manage(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform 1 from public.campus_events where post_id = p_post_id and lifecycle = 'published' and starts_at <= now() for update;
  if not found then raise exception 'cannot_complete' using errcode = 'P0001'; end if;
  update public.campus_events set lifecycle = 'completed', completed_at = now() where post_id = p_post_id;
  update public.event_rsvps set status = 'cancelled', cancelled_at = now()
   where post_id = p_post_id and status in ('pending', 'waitlisted');
  if p_mark_no_shows then
    update public.event_rsvps set status = 'no_show' where post_id = p_post_id and status = 'confirmed';
  end if;
  perform private.event_audit(p_post_id, 'event.completed', null, jsonb_build_object('no_shows_marked', p_mark_no_shows));
  return private.event_status(p_post_id);
end;
$$;

-- Archived: hidden from students and lists; kept with all its registrations.
create function public.archive_event(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_event public.campus_events;
begin
  if not private.event_can_manage(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_event from public.campus_events where post_id = p_post_id for update;
  if v_event.lifecycle = 'archived' then return private.event_status(p_post_id); end if;
  if v_event.lifecycle = 'published' and not private.event_over(p_post_id) then
    raise exception 'cancel_first' using errcode = 'P0001';
  end if;
  update public.campus_events set lifecycle = 'archived', archived_at = now() where post_id = p_post_id;
  perform private.event_audit(p_post_id, 'event.archived', jsonb_build_object('lifecycle', v_event.lifecycle), jsonb_build_object('lifecycle', 'archived'));
  return private.event_status(p_post_id);
end;
$$;

-- Delete: only a draft nobody ever registered for. The post is removed (the usual way).
create function public.delete_event(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.event_can_manage(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform 1 from public.campus_events where post_id = p_post_id and lifecycle = 'draft' for update;
  if not found then raise exception 'not_draft' using errcode = 'P0001'; end if;
  if exists (select 1 from public.event_rsvps where post_id = p_post_id)
     or exists (select 1 from public.event_tickets where post_id = p_post_id) then
    raise exception 'registrations_exist' using errcode = 'P0001';
  end if;
  perform private.event_audit(p_post_id, 'event.deleted');
  delete from public.campus_events where post_id = p_post_id;
  update public.campus_posts set status = 'removed', removed_at = now() where id = p_post_id;
end;
$$;

-- The old organiser form, same arguments. No 14-day limit; a published event's new time is a
-- reschedule (people are told); closed events can't change.
create or replace function public.set_event_details(p_post_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_venue text,
                                                    p_capacity int default null, p_rsvp_open boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.campus_posts;
  v_event public.campus_events;
begin
  perform private.campus_require();
  select * into v_post from public.campus_posts where id = p_post_id for update;
  if v_post.id is null or not private.can_edit_post(p_post_id) then raise exception 'post_not_found' using errcode = 'P0001'; end if;
  if v_post.is_emergency then raise exception 'event_not_allowed' using errcode = 'P0001'; end if;
  if p_starts_at is null or p_starts_at > now() + interval '366 days'
     or (p_ends_at is not null and (p_ends_at <= p_starts_at or p_ends_at > p_starts_at + interval '366 days')) then
    raise exception 'event_invalid' using errcode = 'P0001';
  end if;
  if p_capacity is not null and p_capacity < private.event_taken(p_post_id) then
    raise exception 'capacity_below_going' using errcode = 'P0001';
  end if;
  select * into v_event from public.campus_events where post_id = p_post_id for update;
  if v_event.lifecycle in ('cancelled', 'completed', 'archived') then raise exception 'event_closed' using errcode = 'P0001'; end if;
  if v_event.post_id is not null and v_event.lifecycle = 'published' and p_starts_at is distinct from v_event.starts_at then
    perform public.reschedule_event(p_post_id, p_starts_at, p_ends_at);
  end if;
  begin
    insert into public.campus_events (post_id, institution_id, starts_at, ends_at, venue, capacity, rsvp_open, lifecycle,
                                      published_at, created_by, category_id)
    values (v_post.id, v_post.institution_id, p_starts_at, p_ends_at, btrim(p_venue), p_capacity, coalesce(p_rsvp_open, true),
            case when v_post.status = 'draft' then 'draft' else 'published' end,
            case when v_post.status <> 'draft' then now() end, (select auth.uid()),
            (select id from public.event_categories where slug = 'other'))
    on conflict (post_id) do update
      set starts_at = excluded.starts_at, ends_at = excluded.ends_at, venue = excluded.venue,
          capacity = excluded.capacity, rsvp_open = excluded.rsvp_open;
  exception when check_violation or not_null_violation then
    raise exception 'event_invalid' using errcode = 'P0001';
  end;
  perform private.promote_waitlist(p_post_id);
end;
$$;

-- Removing event details is refused once anyone has registered: cancel the event instead, so
-- registrations and tickets are never deleted.
create or replace function public.remove_event_details(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.campus_require();
  if not private.can_edit_post(p_post_id) then raise exception 'post_not_found' using errcode = 'P0001'; end if;
  if exists (select 1 from public.event_rsvps where post_id = p_post_id)
     or exists (select 1 from public.event_tickets where post_id = p_post_id) then
    raise exception 'registrations_exist' using errcode = 'P0001';
  end if;
  delete from public.campus_events where post_id = p_post_id;
end;
$$;

-- Registration questions, replaced as a set while nobody has registered yet.
create function public.set_event_questions(p_post_id uuid, p_questions jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_q jsonb; v_i int := 0;
begin
  if not private.event_can_manage(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform 1 from public.campus_events where post_id = p_post_id for update;
  if exists (select 1 from public.event_rsvps where post_id = p_post_id) then raise exception 'registrations_exist' using errcode = 'P0001'; end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) > 5 then
    raise exception 'questions_invalid' using errcode = 'P0001';
  end if;
  delete from public.event_questions where post_id = p_post_id;
  begin
    for v_q in select * from jsonb_array_elements(p_questions) loop
      v_i := v_i + 1;
      insert into public.event_questions (post_id, position, prompt, kind, required)
      values (p_post_id, v_i, btrim(v_q ->> 'prompt'), coalesce(v_q ->> 'kind', 'text'), coalesce((v_q ->> 'required')::boolean, false));
    end loop;
  exception when check_violation or not_null_violation or invalid_text_representation then
    raise exception 'questions_invalid' using errcode = 'P0001';
  end;
  perform private.event_audit(p_post_id, 'event.questions_set', null, p_questions);
end;
$$;

-- Who may attend. 'school' (default); 'listed' adds schools, campuses or organisations; and
-- 'all_verified' is every verified Perqly student. Reaching beyond the event's own school is for
-- Perqly admins; organisers may list campuses and organisations of their own school.
create function public.set_event_audience(p_post_id uuid, p_audience text, p_targets jsonb default '[]'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.campus_events;
  v_t jsonb;
  v_staff boolean := private.is_staff('admin');
begin
  if not private.event_can_manage(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_event from public.campus_events where post_id = p_post_id for update;
  if p_audience not in ('school', 'listed', 'all_verified') then raise exception 'audience_invalid' using errcode = 'P0001'; end if;
  if p_audience = 'all_verified' and not v_staff then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_targets is null or jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) > 50 then
    raise exception 'audience_invalid' using errcode = 'P0001';
  end if;
  delete from public.event_audiences where post_id = p_post_id;
  if p_audience = 'listed' then
    for v_t in select * from jsonb_array_elements(p_targets) loop
      if v_t ->> 'kind' = 'institution' then
        if not v_staff and (v_t ->> 'id')::uuid <> v_event.institution_id then raise exception 'forbidden' using errcode = 'P0001'; end if;
        insert into public.event_audiences (post_id, kind, institution_id) values (p_post_id, 'institution', (v_t ->> 'id')::uuid);
      elsif v_t ->> 'kind' = 'campus' then
        if not v_staff and not exists (select 1 from public.campuses where id = (v_t ->> 'id')::uuid and institution_id = v_event.institution_id) then
          raise exception 'forbidden' using errcode = 'P0001';
        end if;
        insert into public.event_audiences (post_id, kind, campus_id) values (p_post_id, 'campus', (v_t ->> 'id')::uuid);
      elsif v_t ->> 'kind' = 'organisation' then
        if not v_staff and not exists (select 1 from public.campus_organisations where id = (v_t ->> 'id')::uuid and institution_id = v_event.institution_id) then
          raise exception 'forbidden' using errcode = 'P0001';
        end if;
        insert into public.event_audiences (post_id, kind, organisation_id) values (p_post_id, 'organisation', (v_t ->> 'id')::uuid);
      else
        raise exception 'audience_invalid' using errcode = 'P0001';
      end if;
    end loop;
  end if;
  update public.campus_events set audience = p_audience where post_id = p_post_id;
  perform private.event_audit(p_post_id, 'event.audience_set', jsonb_build_object('audience', v_event.audience),
    jsonb_build_object('audience', p_audience, 'targets', p_targets));
exception when invalid_text_representation or foreign_key_violation or unique_violation then
  raise exception 'audience_invalid' using errcode = 'P0001';
end;
$$;

-- Door helpers: owners and admins of the organisation (or Perqly admins) add verified students of
-- the event's school, or members of the organisation, to scan tickets for this one event.
create function public.set_event_door_helper(p_post_id uuid, p_user_id uuid, p_add boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_event public.campus_events; v_org uuid;
begin
  if not private.event_can_see_people(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_event from public.campus_events where post_id = p_post_id;
  select organisation_id into v_org from public.campus_posts where id = p_post_id;
  if p_add then
    if not (private.student_verified_at(p_user_id, v_event.institution_id)
            or exists (select 1 from public.organisation_members m where m.organisation_id = v_org and m.user_id = p_user_id and m.status = 'active')) then
      raise exception 'helper_not_allowed' using errcode = 'P0001';
    end if;
    insert into public.event_staff (post_id, user_id, added_by) values (p_post_id, p_user_id, (select auth.uid()))
    on conflict do nothing;
  else
    delete from public.event_staff where post_id = p_post_id and user_id = p_user_id;
  end if;
  perform private.event_audit(p_post_id, case when p_add then 'event.helper_added' else 'event.helper_removed' end,
    null, null, jsonb_build_object('user', p_user_id));
end;
$$;

-- Reads -------------------------------------------------------------------------------------------

-- Event details for one post: eligible students, its managers and scanners, and Perqly support.
create or replace function public.event_detail(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.event_json(p_post_id, (select auth.uid()))
  where private.can_read_post(p_post_id) or private.event_visible(p_post_id) or private.event_can_manage(p_post_id)
     or private.event_can_scan(p_post_id) or private.is_staff('support');
$$;

-- An event's page: post, event, questions (sessions, speakers and sponsors come in 20261127110000).
create function public.event_page(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'post', jsonb_build_object('id', p.id, 'title', p.title, 'body', p.body, 'link_url', p.link_url, 'status', p.status,
                               'organisation', jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'kind', o.kind,
                                                                  'badge', private.organisation_badge(o.id), 'logo_path', o.logo_path),
                               'institution', jsonb_build_object('id', i.id, 'name', i.name, 'short_name', i.short_name)),
    'event', private.event_json(p.id, (select auth.uid())),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'prompt', q.prompt, 'kind', q.kind, 'required', q.required)
                                            order by q.position) from public.event_questions q where q.post_id = p.id), '[]'::jsonb),
    'can_manage', private.event_can_manage(p.id),
    'can_scan', private.event_can_scan(p.id))
  from public.campus_posts p
  join public.campus_organisations o on o.id = p.organisation_id
  join public.institutions i on i.id = p.institution_id
  where p.id = p_post_id
    and (private.event_visible(p.id) or private.event_can_manage(p.id) or private.is_staff('support'))
    and exists (select 1 from public.campus_events e where e.post_id = p.id);
$$;

-- Discovery: events the caller may attend, soonest first. Filters (all optional): q, category,
-- event_type, format, from, to, price ('free' | 'paid'), institution_id, featured, include_past.
-- Keyset paging on (starts_at, post id).
create function public.discover_events(p_filters jsonb default '{}'::jsonb, p_after_at timestamptz default null, p_after_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.card order by x.starts_at, x.post_id), '[]'::jsonb)
  from (
    select e.post_id, e.starts_at,
           jsonb_build_object('post_id', p.id, 'title', p.title, 'organisation', o.name, 'institution', i.short_name)
             || jsonb_build_object('event', private.event_json(e.post_id, (select auth.uid()))) as card
    from public.campus_events e
    join public.campus_posts p on p.id = e.post_id
    join public.campus_organisations o on o.id = p.organisation_id
    join public.institutions i on i.id = e.institution_id
    left join public.event_categories c on c.id = e.category_id
    where e.lifecycle in ('published', 'cancelled')
      and (coalesce((p_filters ->> 'include_past')::boolean, false) or coalesce(e.ends_at, e.starts_at + interval '3 hours') > now())
      and private.event_visible(e.post_id)
      and (p_filters ->> 'q' is null or p.title ilike '%' || left(p_filters ->> 'q', 60) || '%')
      and (p_filters ->> 'category' is null or c.slug = p_filters ->> 'category')
      and (p_filters ->> 'event_type' is null or e.event_type = p_filters ->> 'event_type')
      and (p_filters ->> 'format' is null or e.format = p_filters ->> 'format')
      and (p_filters ->> 'from' is null or e.starts_at >= (p_filters ->> 'from')::timestamptz)
      and (p_filters ->> 'to' is null or e.starts_at < (p_filters ->> 'to')::timestamptz)
      and (p_filters ->> 'price' is null
           or (p_filters ->> 'price' = 'free' and coalesce(e.student_price_pesewas, 0) = 0)
           or (p_filters ->> 'price' = 'paid' and coalesce(e.student_price_pesewas, 0) > 0))
      and (p_filters ->> 'institution_id' is null or e.institution_id = (p_filters ->> 'institution_id')::uuid)
      and (p_filters ->> 'featured' is null or e.featured = (p_filters ->> 'featured')::boolean)
      and (p_after_at is null or (e.starts_at, e.post_id) > (p_after_at, p_after_id))
    order by e.starts_at, e.post_id
    limit 30
  ) x;
$$;

-- My Events by tab: upcoming | pending | waitlisted | attended | cancelled.
create function public.my_event_registrations(p_tab text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('post_id', p.id, 'title', p.title, 'organisation', o.name)
                            || jsonb_build_object('event', private.event_json(e.post_id, (select auth.uid())))
                            order by case when p_tab in ('attended', 'cancelled') then -extract(epoch from e.starts_at)
                                          else extract(epoch from e.starts_at) end), '[]'::jsonb)
  from public.event_rsvps r
  join public.campus_events e on e.post_id = r.post_id
  join public.campus_posts p on p.id = r.post_id
  join public.campus_organisations o on o.id = p.organisation_id
  where r.user_id = (select auth.uid())
    and e.lifecycle <> 'archived' and e.lifecycle <> 'draft'
    and case p_tab
          when 'upcoming' then r.status = 'confirmed' and e.lifecycle = 'published' and not private.event_over(e.post_id)
          when 'pending' then r.status = 'pending' and not private.event_over(e.post_id)
          when 'waitlisted' then r.status = 'waitlisted' and not private.event_over(e.post_id)
          when 'attended' then r.status = 'attended'
          when 'cancelled' then r.status in ('cancelled', 'rejected', 'no_show')
          else false end;
$$;

-- Old lists, same results but counting only live registrations.
create or replace function public.my_events()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.campus_post_json(e.post_id, (select auth.uid()))
                            || jsonb_build_object('event', private.event_json(e.post_id, (select auth.uid())))
                            order by e.starts_at, e.post_id), '[]'::jsonb)
  from public.event_rsvps r
  join public.campus_events e on e.post_id = r.post_id
  where r.user_id = (select auth.uid())
    and r.status in ('confirmed', 'attended')
    and not private.event_over(e.post_id)
    and (private.can_read_post(e.post_id) or private.event_visible(e.post_id));
$$;

create or replace function public.my_tickets()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.campus_post_json(e.post_id, (select auth.uid()))
                            || jsonb_build_object('event', private.event_json(e.post_id, (select auth.uid())))
                            order by e.starts_at, e.post_id), '[]'::jsonb)
  from public.event_tickets t
  join public.campus_events e on e.post_id = t.post_id
  where t.user_id = (select auth.uid())
    and t.status <> 'cancelled'
    and not private.event_over(e.post_id)
    and (private.can_read_post(e.post_id) or private.event_visible(e.post_id));
$$;

-- Friends going: confirmed or attended only.
create or replace function public.friends_going(p_post_id uuid)
returns table (user_id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (select user_id from public.list_friends())
  select m.user_id, private.student_name(m.user_id)
  from mine m
  join public.event_rsvps r on r.user_id = m.user_id and r.post_id = p_post_id and r.status in ('confirmed', 'attended')
  where private.shares_activity(m.user_id)
  limit 20;
$$;

-- Grants ------------------------------------------------------------------------------------------

revoke execute on all functions in schema private from public;

revoke execute on function
  public.register_for_event(uuid, jsonb), public.cancel_event_registration(uuid),
  public.decide_event_registration(uuid, uuid, boolean, text), public.door_search_attendees(uuid, text),
  public.door_check_in_attendee(uuid, uuid), public.my_scannable_events(), public.event_categories(),
  public.admin_save_event_category(text, text, int, boolean), public.admin_perqly_organisation(uuid),
  public.save_event(uuid, uuid, jsonb), public.publish_event(uuid), public.unpublish_event(uuid),
  public.cancel_event(uuid, text), public.reschedule_event(uuid, timestamptz, timestamptz, timestamptz),
  public.complete_event(uuid, boolean), public.archive_event(uuid), public.delete_event(uuid),
  public.set_event_questions(uuid, jsonb), public.set_event_audience(uuid, text, jsonb),
  public.set_event_door_helper(uuid, uuid, boolean), public.event_page(uuid),
  public.discover_events(jsonb, timestamptz, uuid), public.my_event_registrations(text)
  from public, anon, service_role;

grant execute on function
  public.register_for_event(uuid, jsonb), public.cancel_event_registration(uuid),
  public.decide_event_registration(uuid, uuid, boolean, text), public.door_search_attendees(uuid, text),
  public.door_check_in_attendee(uuid, uuid), public.my_scannable_events(), public.event_categories(),
  public.admin_save_event_category(text, text, int, boolean), public.admin_perqly_organisation(uuid),
  public.save_event(uuid, uuid, jsonb), public.publish_event(uuid), public.unpublish_event(uuid),
  public.cancel_event(uuid, text), public.reschedule_event(uuid, timestamptz, timestamptz, timestamptz),
  public.complete_event(uuid, boolean), public.archive_event(uuid), public.delete_event(uuid),
  public.set_event_questions(uuid, jsonb), public.set_event_audience(uuid, text, jsonb),
  public.set_event_door_helper(uuid, uuid, boolean), public.event_page(uuid),
  public.discover_events(jsonb, timestamptz, uuid), public.my_event_registrations(text)
  to authenticated;
