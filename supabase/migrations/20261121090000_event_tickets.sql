-- Campus: discounted event tickets, paid at the door.
-- An organiser can give an event a normal ticket price and a lower student price.
-- A verified student of the school takes a ticket in Perqly and gets a code (shown
-- as a QR). No money moves through Perqly: the student pays the student price at the
-- door, and the organiser looks the code up, sees the student's photo and name, and
-- checks them in. Taking a ticket also counts the student as going, so places and the
-- going count work as before. Free events keep plain RSVPs.
-- Amounts are in pesewas. Tables are reached only through the functions below.

alter table public.campus_events
  add column normal_price_pesewas int,
  add column student_price_pesewas int,
  add constraint campus_events_ticket_prices check (
    (normal_price_pesewas is null and student_price_pesewas is null)
    or (normal_price_pesewas between 100 and 10000000
        and student_price_pesewas >= 0 and student_price_pesewas < normal_price_pesewas));

create table public.event_tickets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  institution_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  normal_price_pesewas int not null,
  student_price_pesewas int not null,
  status text not null default 'active' check (status in ('active', 'checked_in', 'cancelled')),
  created_at timestamptz not null default now(),
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  constraint event_tickets_event_fk foreign key (post_id) references public.campus_events (post_id) on delete cascade,
  constraint event_tickets_post_fk foreign key (post_id, institution_id)
    references public.campus_posts (id, institution_id) on delete cascade,
  constraint event_tickets_checked_in check ((status = 'checked_in') = (checked_in_at is not null))
);
-- One live ticket per student per event; cancelled ones stay as history.
create unique index event_tickets_one_per_student on public.event_tickets (post_id, user_id) where status <> 'cancelled';
create index event_tickets_user on public.event_tickets (user_id, created_at desc);

alter table public.event_tickets enable row level security;
revoke all on public.event_tickets from public, anon, authenticated;

-- Helpers ------------------------------------------------------------------------------------

create function private.new_ticket_code()
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

create function private.ticket_json(p_ticket public.event_tickets)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_ticket.id is null then null else jsonb_build_object(
    'id', p_ticket.id, 'code', p_ticket.code, 'status', p_ticket.status,
    'normal_price', p_ticket.normal_price_pesewas, 'student_price', p_ticket.student_price_pesewas,
    'created_at', p_ticket.created_at, 'checked_in_at', p_ticket.checked_in_at) end;
$$;

-- Doors open 24 hours before the start and close when the event is over.
create function private.door_open(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.campus_events e
                 where e.post_id = p_post_id and e.starts_at <= now() + interval '24 hours')
     and not private.event_over(p_post_id);
$$;

-- Event details now carry the prices and the viewer's own ticket.
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

-- Organisers -----------------------------------------------------------------------------------

-- Set (or clear, with nulls) an event's ticket prices. Tickets already taken keep the
-- prices they were taken at. Prices can't be cleared while live tickets exist.
create function public.set_event_tickets(p_post_id uuid, p_normal_price int, p_student_price int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.campus_require();
  if not private.can_edit_post(p_post_id) then raise exception 'post_not_found' using errcode = 'P0001'; end if;
  perform 1 from public.campus_events where post_id = p_post_id for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0001'; end if;
  if p_normal_price is null and exists (select 1 from public.event_tickets where post_id = p_post_id and status <> 'cancelled') then
    raise exception 'tickets_exist' using errcode = 'P0001';
  end if;
  if (p_normal_price is null) <> (p_student_price is null) then raise exception 'prices_invalid' using errcode = 'P0001'; end if;
  begin
    update public.campus_events
       set normal_price_pesewas = p_normal_price, student_price_pesewas = p_student_price
     where post_id = p_post_id;
  exception when check_violation then
    raise exception 'prices_invalid' using errcode = 'P0001';
  end;
end;
$$;

-- Ticket numbers for an event: editors see counts, not who.
create function public.event_ticket_stats(p_post_id uuid)
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

-- Look a ticket up at the door. Only the event's editors, only while doors are open.
-- Shows who the ticket belongs to so the organiser can match the face.
create function public.door_lookup_ticket(p_post_id uuid, p_code text)
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

create function public.door_check_in(p_post_id uuid, p_code text)
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

-- Students -----------------------------------------------------------------------------------

-- Take a ticket for a ticketed event. Taking it again returns the same ticket.
create function public.take_event_ticket(p_post_id uuid)
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

-- RSVPs: ticketed events need a ticket; saying "not going" also cancels the ticket,
-- unless the student has already been checked in.
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

-- The caller's tickets for events that haven't finished, soonest first.
create function public.my_tickets()
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

-- Pass photos: organisers may also see the photo of a student holding a live ticket
-- to their event, while doors are open (as branch staff do for a live pass).
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

-- Grants ---------------------------------------------------------------------------------------

revoke execute on function private.new_ticket_code(), private.ticket_json(public.event_tickets), private.door_open(uuid),
  public.set_event_tickets(uuid, int, int), public.event_ticket_stats(uuid), public.door_lookup_ticket(uuid, text),
  public.door_check_in(uuid, text), public.take_event_ticket(uuid), public.my_tickets()
  from public, anon, authenticated, service_role;

grant execute on function
  public.set_event_tickets(uuid, int, int), public.event_ticket_stats(uuid), public.door_lookup_ticket(uuid, text),
  public.door_check_in(uuid, text), public.take_event_ticket(uuid), public.my_tickets()
  to authenticated;
