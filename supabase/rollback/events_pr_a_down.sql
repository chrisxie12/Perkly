-- ROLLBACK for Events & Conferences PR A (migrations 20261127090000 to 20261127120000).
--
-- NOT a migration and never run automatically. For staging, or an emergency in production, and
-- only with the owner's approval, after a backup. It puts back the old function bodies and drops
-- only what PR A added. Data created by the new features is lost: registrations that aren't
-- confirmed or attended (pending, waitlisted, cancelled, rejected, no-show) are deleted so the old
-- functions, which treat every row as "going", stay correct; waitlists, answers, sessions,
-- speakers, sponsors, door helpers and the Perqly organisations go too. Existing events, their
-- confirmed RSVPs and every ticket (id, code, status, check-in) are kept.
begin;

-- New triggers first.
drop trigger if exists campus_events_changed on public.campus_events;
drop trigger if exists event_rsvps_sessions on public.event_rsvps;
drop trigger if exists event_tickets_secret on public.event_tickets;
drop trigger if exists event_rsvps_updated_at on public.event_rsvps;
drop trigger if exists organisation_members_perqly on public.organisation_members;

-- Rows the old model can't represent.
delete from public.event_rsvps where status not in ('confirmed', 'attended');

-- Old function bodies (latest definitions before 20261127).

-- from 20261118100000_campus_events.sql
create or replace function private.event_over(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select coalesce(e.ends_at, e.starts_at + interval '3 hours') <= now()
                   from public.campus_events e where e.post_id = p_post_id), true);
$$;


-- from 20261121090000_event_tickets.sql
create or replace function private.event_json(p_post_id uuid, p_viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'starts_at', e.starts_at, 'ends_at', e.ends_at, 'venue', e.venue, 'capacity', e.capacity, 'rsvp_open', e.rsvp_open,
    'going', (select count(*) from public.event_rsvps r where r.post_id = e.post_id),
    'i_am_going', exists (select 1 from public.event_rsvps r where r.post_id = e.post_id and r.user_id = p_viewer),
    'over', private.event_over(e.post_id),
    'ticketed', e.normal_price_pesewas is not null,
    'normal_price', e.normal_price_pesewas,
    'student_price', e.student_price_pesewas,
    'my_ticket', (select private.ticket_json(t) from public.event_tickets t
                  where t.post_id = e.post_id and t.user_id = p_viewer and t.status <> 'cancelled'))
  from public.campus_events e where e.post_id = p_post_id;
$$;


-- from 20261121090000_event_tickets.sql
create or replace function private.new_ticket_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    select string_agg(substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1), '')
      into v_code from generate_series(1, 8);
    exit when not exists (select 1 from public.event_tickets where code = v_code);
  end loop;
  return v_code;
end;
$$;


-- from 20261121090000_event_tickets.sql
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
          and private.can_edit_post(t.post_id));
$$;


-- from 20261117090000_campus_organisations_posts.sql
create or replace function private.campus_staff_run(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_kind in ('faculty', 'department', 'administration');
$$;


-- from 20261118100000_campus_events.sql
create or replace function public.set_event_details(p_post_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_venue text,
                                         p_capacity int default null, p_rsvp_open boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_post public.campus_posts;
begin
  perform private.campus_require();
  select * into v_post from public.campus_posts where id = p_post_id for update;
  if v_post.id is null or not private.can_edit_post(p_post_id) then raise exception 'post_not_found' using errcode = 'P0001'; end if;
  if v_post.is_emergency then raise exception 'event_not_allowed' using errcode = 'P0001'; end if;
  if p_starts_at is null or p_starts_at > now() + interval '365 days' then raise exception 'event_invalid' using errcode = 'P0001'; end if;
  if p_capacity is not null and p_capacity < (select count(*) from public.event_rsvps where post_id = p_post_id) then
    raise exception 'capacity_below_going' using errcode = 'P0001';
  end if;
  begin
    insert into public.campus_events (post_id, institution_id, starts_at, ends_at, venue, capacity, rsvp_open)
    values (v_post.id, v_post.institution_id, p_starts_at, p_ends_at, btrim(p_venue), p_capacity, coalesce(p_rsvp_open, true))
    on conflict (post_id) do update
      set starts_at = excluded.starts_at, ends_at = excluded.ends_at, venue = excluded.venue,
          capacity = excluded.capacity, rsvp_open = excluded.rsvp_open;
  exception when check_violation or not_null_violation then
    raise exception 'event_invalid' using errcode = 'P0001';
  end;
end;
$$;


-- from 20261118100000_campus_events.sql
create or replace function public.remove_event_details(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.campus_require();
  if not private.can_edit_post(p_post_id) then raise exception 'post_not_found' using errcode = 'P0001'; end if;
  delete from public.campus_events where post_id = p_post_id;
end;
$$;


-- from 20261121090000_event_tickets.sql
create or replace function public.set_rsvp(p_post_id uuid, p_going boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_event public.campus_events;
begin
  perform private.campus_require();
  if not private.can_read_post(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  -- Lock the event so two students can't both take the last place.
  select * into v_event from public.campus_events where post_id = p_post_id for update;
  if v_event.post_id is null then raise exception 'event_not_found' using errcode = 'P0001'; end if;
  if p_going then
    if v_event.normal_price_pesewas is not null then raise exception 'ticket_required' using errcode = 'P0001'; end if;
    if private.event_over(p_post_id) then raise exception 'event_over' using errcode = 'P0001'; end if;
    if not v_event.rsvp_open then raise exception 'rsvp_closed' using errcode = 'P0001'; end if;
    if exists (select 1 from public.event_rsvps where post_id = p_post_id and user_id = (select auth.uid())) then
      return private.event_json(p_post_id, (select auth.uid()));
    end if;
    perform private.check_rate_limit('campus.rsvp', 60, interval '1 hour');
    if v_event.capacity is not null and (select count(*) from public.event_rsvps where post_id = p_post_id) >= v_event.capacity then
      raise exception 'event_full' using errcode = 'P0001';
    end if;
    insert into public.event_rsvps (post_id, institution_id, user_id)
    values (p_post_id, v_event.institution_id, (select auth.uid()));
  else
    if exists (select 1 from public.event_tickets
               where post_id = p_post_id and user_id = (select auth.uid()) and status = 'checked_in') then
      raise exception 'already_checked_in' using errcode = 'P0001';
    end if;
    update public.event_tickets set status = 'cancelled', cancelled_at = now()
     where post_id = p_post_id and user_id = (select auth.uid()) and status = 'active';
    delete from public.event_rsvps where post_id = p_post_id and user_id = (select auth.uid());
  end if;
  return private.event_json(p_post_id, (select auth.uid()));
end;
$$;


-- from 20261121090000_event_tickets.sql
create or replace function public.take_event_ticket(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.campus_events;
  v_ticket public.event_tickets;
begin
  perform private.campus_require();
  if not private.can_read_post(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  -- Lock the event so two students can't both take the last place.
  select * into v_event from public.campus_events where post_id = p_post_id for update;
  if v_event.post_id is null then raise exception 'event_not_found' using errcode = 'P0001'; end if;
  if v_event.normal_price_pesewas is null then raise exception 'not_ticketed' using errcode = 'P0001'; end if;
  select * into v_ticket from public.event_tickets
   where post_id = p_post_id and user_id = (select auth.uid()) and status <> 'cancelled';
  if v_ticket.id is not null then return private.event_json(p_post_id, (select auth.uid())); end if;
  if private.event_over(p_post_id) then raise exception 'event_over' using errcode = 'P0001'; end if;
  if not v_event.rsvp_open then raise exception 'rsvp_closed' using errcode = 'P0001'; end if;
  perform private.check_rate_limit('campus.rsvp', 60, interval '1 hour');
  if not exists (select 1 from public.event_rsvps where post_id = p_post_id and user_id = (select auth.uid()))
     and v_event.capacity is not null
     and (select count(*) from public.event_rsvps where post_id = p_post_id) >= v_event.capacity then
    raise exception 'event_full' using errcode = 'P0001';
  end if;
  insert into public.event_rsvps (post_id, institution_id, user_id)
  values (p_post_id, v_event.institution_id, (select auth.uid()))
  on conflict do nothing;
  insert into public.event_tickets (post_id, institution_id, user_id, code, normal_price_pesewas, student_price_pesewas)
  values (p_post_id, v_event.institution_id, (select auth.uid()), private.new_ticket_code(),
          v_event.normal_price_pesewas, v_event.student_price_pesewas);
  return private.event_json(p_post_id, (select auth.uid()));
end;
$$;


-- from 20261118100000_campus_events.sql
create or replace function public.event_detail(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.event_json(p_post_id, (select auth.uid()))
  where private.can_read_post(p_post_id) or private.can_edit_post(p_post_id) or private.is_staff('support');
$$;


-- from 20261118100000_campus_events.sql
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
    and not private.event_over(e.post_id)
    and private.can_read_post(e.post_id);
$$;


-- from 20261121090000_event_tickets.sql
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
    and private.can_read_post(e.post_id);
$$;


-- from 20261121090000_event_tickets.sql
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
begin
  perform private.campus_require();
  if not private.can_edit_post(p_post_id) then raise exception 'post_not_found' using errcode = 'P0001'; end if;
  if not private.door_open(p_post_id) then raise exception 'door_closed' using errcode = 'P0001'; end if;
  select * into v_ticket from public.event_tickets
   where post_id = p_post_id and code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_ticket.id is null or v_ticket.status = 'cancelled' then raise exception 'ticket_not_found' using errcode = 'P0001'; end if;
  select * into v_profile from public.profiles where id = v_ticket.user_id;
  return private.ticket_json(v_ticket) || jsonb_build_object(
    'name', coalesce(v_profile.full_name, v_profile.first_name, 'Student'),
    'photo_path', case when private.pass_photo_owner(v_profile.avatar_path) = v_ticket.user_id then v_profile.avatar_path end,
    'still_verified', private.student_verified_at(v_ticket.user_id, v_ticket.institution_id));
end;
$$;


-- from 20261121090000_event_tickets.sql
create or replace function public.door_check_in(p_post_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_ticket public.event_tickets;
begin
  perform private.campus_require();
  if not private.can_edit_post(p_post_id) then raise exception 'post_not_found' using errcode = 'P0001'; end if;
  if not private.door_open(p_post_id) then raise exception 'door_closed' using errcode = 'P0001'; end if;
  select * into v_ticket from public.event_tickets
   where post_id = p_post_id and code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
   for update;
  if v_ticket.id is null or v_ticket.status = 'cancelled' then raise exception 'ticket_not_found' using errcode = 'P0001'; end if;
  if v_ticket.status = 'checked_in' then raise exception 'already_checked_in' using errcode = 'P0001'; end if;
  if not private.student_verified_at(v_ticket.user_id, v_ticket.institution_id) then
    raise exception 'not_verified' using errcode = 'P0001';
  end if;
  update public.event_tickets
     set status = 'checked_in', checked_in_at = now(), checked_in_by = (select auth.uid())
   where id = v_ticket.id
   returning * into v_ticket;
  return private.ticket_json(v_ticket);
end;
$$;


-- from 20261121090000_event_tickets.sql
create or replace function public.event_ticket_stats(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'active', count(*) filter (where t.status = 'active'),
    'checked_in', count(*) filter (where t.status = 'checked_in'),
    'door_open', private.door_open(p_post_id))
  from public.event_tickets t
  where t.post_id = p_post_id and private.can_edit_post(p_post_id);
$$;


-- from 20261118140000_campus_reminders.sql
create or replace function public.queue_event_reminders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_status text := private.campus_delivery_status();
begin
  if not private.campus_switch('campus.posts_enabled') then return 0; end if;
  with due as (
    select r.post_id, r.user_id, e.starts_at, e.venue, p.title
    from public.event_rsvps r
    join public.campus_events e on e.post_id = r.post_id
    join public.campus_posts p on p.id = r.post_id
    where r.reminded_at is null
      and e.starts_at between now() + interval '22 hours' and now() + interval '46 hours'
      and private.post_is_live(r.post_id)
      and private.student_state(r.user_id) = 'verified'
    for update of r skip locked
  ), sent as (
    insert into public.notifications (user_id, kind, title, body, link, push_status, email_status)
    select d.user_id, 'campus.event_reminder', left('Reminder: ' || d.title, 140),
           left(to_char(d.starts_at at time zone 'UTC', 'Dy DD Mon, HH24:MI') || ', ' || d.venue, 500),
           '/student/campus/posts/' || d.post_id, v_status, v_status
    from due d
    returning 1
  ), marked as (
    update public.event_rsvps r set reminded_at = now()
    from due d where r.post_id = d.post_id and r.user_id = d.user_id
    returning 1
  )
  select count(*)::int into v_count from marked;
  return v_count;
end;
$$;


-- from 20261120090000_friends.sql
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
  join public.event_rsvps r on r.user_id = m.user_id and r.post_id = p_post_id
  where private.shares_activity(m.user_id)
  limit 20;
$$;


-- New functions.
drop function if exists public.queue_due_event_reminders(), public.send_event_announcement(uuid, text, text),
  public.manage_events_list(jsonb), public.admin_events_overview(), public.event_analytics(uuid),
  public.event_attendees(uuid, text), public.event_attendee_export(uuid),
  public.save_event_session(uuid, uuid, jsonb), public.delete_event_session(uuid), public.save_event_speaker(uuid, uuid, jsonb),
  public.delete_event_speaker(uuid), public.set_session_speakers(uuid, jsonb), public.save_event_sponsor(uuid, uuid, jsonb),
  public.delete_event_sponsor(uuid), public.register_for_session(uuid), public.cancel_session_registration(uuid),
  public.duplicate_event(uuid), public.register_for_event(uuid, jsonb), public.cancel_event_registration(uuid),
  public.decide_event_registration(uuid, uuid, boolean, text), public.door_search_attendees(uuid, text),
  public.door_check_in_attendee(uuid, uuid), public.my_scannable_events(), public.event_categories(),
  public.admin_save_event_category(text, text, int, boolean), public.admin_perqly_organisation(uuid),
  public.save_event(uuid, uuid, jsonb), public.publish_event(uuid), public.unpublish_event(uuid),
  public.cancel_event(uuid, text), public.reschedule_event(uuid, timestamptz, timestamptz, timestamptz),
  public.complete_event(uuid, boolean), public.archive_event(uuid), public.delete_event(uuid),
  public.set_event_questions(uuid, jsonb), public.set_event_audience(uuid, text, jsonb),
  public.set_event_door_helper(uuid, uuid, boolean), public.event_page(uuid),
  public.discover_events(jsonb, timestamptz, uuid), public.my_event_registrations(text);
drop function if exists private.queue_reminders(text, interval, interval), private.event_changed(), private.event_counts(uuid),
  private.event_rsvp_sessions(), private.event_taken(uuid), private.event_can_manage(uuid), private.event_can_see_people(uuid),
  private.event_can_scan(uuid), private.event_eligible(uuid, uuid), private.event_visible(uuid), private.event_status(uuid),
  private.notify_event(uuid, uuid, text, text, text), private.event_title(uuid), private.event_when(uuid),
  private.event_actor_context(uuid), private.event_audit(uuid, text, jsonb, jsonb, jsonb), private.issue_ticket(uuid, uuid),
  private.void_ticket(uuid, uuid), private.promote_waitlist(uuid), private.clean_event_answers(uuid, jsonb),
  private.register_for_event(uuid, jsonb), private.cancel_registration(uuid, uuid, boolean),
  private.find_event_ticket(uuid, text, boolean), private.check_in(uuid, public.event_tickets),
  private.payload_time(jsonb, text), private.payload_text(jsonb, text), private.event_post_kind(text),
  private.event_publishable(uuid), private.ticket_secret(uuid), private.ticket_secret_hash(text),
  private.event_ticket_secret(), private.guard_perqly_members();

-- New tables.
drop table if exists public.event_reminders_sent, public.event_session_speakers, public.event_session_registrations,
  public.event_sessions, public.event_speakers, public.event_sponsors, public.event_staff, public.event_questions,
  public.event_audiences;

-- New columns (tickets keep id, code, status and check-in).
drop index if exists public.event_tickets_secret;
alter table public.event_tickets drop column if exists secret_hash;
alter table public.event_rsvps drop constraint if exists event_rsvps_waitlisted;
drop index if exists public.event_rsvps_status, public.event_rsvps_waitlist;
alter table public.event_rsvps drop column if exists status, drop column if exists answers, drop column if exists waitlisted_at,
  drop column if exists decided_at, drop column if exists decided_by, drop column if exists decision_note,
  drop column if exists cancelled_at, drop column if exists updated_at;
drop index if exists public.campus_events_lifecycle, public.campus_events_category;
-- Online events (no venue) can't exist in the old model; they become drafts' venue "Online".
update public.campus_events set venue = 'Online' where venue is null;
alter table public.campus_events drop constraint if exists campus_events_venue_needed;
alter table public.campus_events alter column venue set not null;
alter table public.campus_events drop constraint if exists campus_events_times;
-- The old 14-day limit can only come back if no event is longer.
alter table public.campus_events add constraint campus_events_times
  check (ends_at is null or (ends_at > starts_at and ends_at <= starts_at + interval '366 days'));
alter table public.campus_events
  drop constraint if exists campus_events_campus_fk, drop constraint if exists campus_events_registration_window,
  drop constraint if exists campus_events_cancelled, drop constraint if exists campus_events_map,
  drop column if exists lifecycle, drop column if exists category_id, drop column if exists event_type, drop column if exists format,
  drop column if exists timezone, drop column if exists registration_opens_at, drop column if exists registration_closes_at,
  drop column if exists venue_address, drop column if exists campus_id, drop column if exists city, drop column if exists map_lat,
  drop column if exists map_lng, drop column if exists venue_instructions, drop column if exists online_platform,
  drop column if exists online_link, drop column if exists online_instructions, drop column if exists online_link_lead_minutes,
  drop column if exists approval_required, drop column if exists waitlist_enabled, drop column if exists cancellation_allowed,
  drop column if exists cancel_until_hours, drop column if exists audience, drop column if exists session_registration,
  drop column if exists sessions_no_clash, drop column if exists theme, drop column if exists summary, drop column if exists poster_path,
  drop column if exists featured, drop column if exists contact_name, drop column if exists contact_email, drop column if exists contact_phone,
  drop column if exists remind_7d, drop column if exists remind_24h, drop column if exists remind_1h, drop column if exists published_at,
  drop column if exists cancelled_at, drop column if exists cancel_reason, drop column if exists rescheduled_at,
  drop column if exists previous_starts_at, drop column if exists completed_at, drop column if exists archived_at,
  drop column if exists created_by;
drop table if exists public.event_categories;
delete from private.app_settings where key = 'events.ticket_qr_key';

-- Perqly organisations: archived (their posts stay readable to staff), then the old kinds.
update public.campus_organisations set kind = 'association', status = 'archived' where kind = 'perqly';
alter table public.campus_organisations drop constraint campus_organisations_kind_check;
alter table public.campus_organisations add constraint campus_organisations_kind_check
  check (kind in ('src', 'faculty', 'department', 'hall', 'club', 'society', 'association', 'administration'));

revoke execute on all functions in schema private from public;
commit;
