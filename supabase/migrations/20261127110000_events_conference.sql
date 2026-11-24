-- Events & Conferences, PR A part 3: conference sessions (multi-day agenda), speakers, sponsors
-- and partners, session registration with the clash rule, and duplicating an event.

create table public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.campus_events (post_id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 140),
  description text check (description is null or char_length(description) <= 2000),
  kind text not null default 'talk' check (kind in ('keynote', 'talk', 'panel', 'workshop', 'break', 'networking', 'other')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  room text check (room is null or char_length(btrim(room)) between 1 and 120),
  capacity int check (capacity is null or capacity between 1 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_sessions_times check (ends_at > starts_at and ends_at <= starts_at + interval '24 hours')
);
create index event_sessions_post on public.event_sessions (post_id, starts_at);
create trigger event_sessions_updated_at before update on public.event_sessions
  for each row execute function private.set_updated_at();

create table public.event_session_registrations (
  session_id uuid not null references public.event_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.campus_events (post_id) on delete cascade,
  status text not null default 'registered' check (status in ('registered', 'cancelled')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  primary key (session_id, user_id)
);
create index event_session_registrations_user on public.event_session_registrations (user_id, post_id) where status = 'registered';

create table public.event_speakers (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.campus_events (post_id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  title text check (title is null or char_length(btrim(title)) between 2 and 120),
  organisation text check (organisation is null or char_length(btrim(organisation)) between 2 and 120),
  bio text check (bio is null or char_length(bio) <= 2000),
  photo_path text check (photo_path is null or photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/post/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  keynote boolean not null default false,
  position smallint not null default 100 check (position between 0 and 1000),
  created_at timestamptz not null default now()
);
create index event_speakers_post on public.event_speakers (post_id, position);

create table public.event_session_speakers (
  session_id uuid not null references public.event_sessions (id) on delete cascade,
  speaker_id uuid not null references public.event_speakers (id) on delete cascade,
  role text not null default 'speaker' check (role in ('speaker', 'moderator', 'host')),
  primary key (session_id, speaker_id)
);

create table public.event_sponsors (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.campus_events (post_id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  tier text not null default 'partner' check (tier in ('headline', 'gold', 'silver', 'bronze', 'partner', 'media')),
  logo_path text check (logo_path is null or logo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/post/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  url text check (url is null or (url ~ '^https://[^\s]+$' and char_length(url) <= 500)),
  position smallint not null default 100 check (position between 0 and 1000),
  created_at timestamptz not null default now()
);
create index event_sponsors_post on public.event_sponsors (post_id, position);

alter table public.event_sessions enable row level security;
alter table public.event_session_registrations enable row level security;
alter table public.event_speakers enable row level security;
alter table public.event_session_speakers enable row level security;
alter table public.event_sponsors enable row level security;
revoke all on public.event_sessions, public.event_session_registrations, public.event_speakers,
  public.event_session_speakers, public.event_sponsors from public, anon, authenticated;

-- A cancelled or rejected event registration drops its session places.
create function private.event_rsvp_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('cancelled', 'rejected') and old.status is distinct from new.status then
    update public.event_session_registrations set status = 'cancelled', cancelled_at = now()
     where post_id = new.post_id and user_id = new.user_id and status = 'registered';
  end if;
  return new;
end;
$$;
create trigger event_rsvps_sessions after update of status on public.event_rsvps
  for each row execute function private.event_rsvp_sessions();

-- Organisers: sessions -------------------------------------------------------------------------------

-- Sessions sit inside the event's own times. Changing a session's time, room or removing it tells
-- the students registered for it.
create function public.save_event_session(p_post_id uuid, p_session_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.campus_events;
  v_before public.event_sessions;
  v_after public.event_sessions;
  v_row record;
begin
  if not private.event_can_manage(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_event from public.campus_events where post_id = p_post_id for update;
  if v_event.lifecycle in ('cancelled', 'completed', 'archived') then raise exception 'event_closed' using errcode = 'P0001'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'session_invalid' using errcode = 'P0001'; end if;
  begin
    if p_session_id is null then
      insert into public.event_sessions (post_id, title, description, kind, starts_at, ends_at, room, capacity)
      values (p_post_id, btrim(p_data ->> 'title'), private.payload_text(p_data, 'description'), coalesce(p_data ->> 'kind', 'talk'),
              (p_data ->> 'starts_at')::timestamptz, (p_data ->> 'ends_at')::timestamptz, private.payload_text(p_data, 'room'),
              (p_data ->> 'capacity')::int)
      returning * into v_after;
    else
      select * into v_before from public.event_sessions where id = p_session_id and post_id = p_post_id for update;
      if v_before.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
      update public.event_sessions s set
        title = coalesce(nullif(btrim(p_data ->> 'title'), ''), s.title),
        description = case when p_data ? 'description' then private.payload_text(p_data, 'description') else s.description end,
        kind = coalesce(p_data ->> 'kind', s.kind),
        starts_at = coalesce((p_data ->> 'starts_at')::timestamptz, s.starts_at),
        ends_at = coalesce((p_data ->> 'ends_at')::timestamptz, s.ends_at),
        room = case when p_data ? 'room' then private.payload_text(p_data, 'room') else s.room end,
        capacity = case when p_data ? 'capacity' then (p_data ->> 'capacity')::int else s.capacity end
      where s.id = p_session_id
      returning * into v_after;
    end if;
  exception when check_violation or not_null_violation or invalid_text_representation or datetime_field_overflow then
    raise exception 'session_invalid' using errcode = 'P0001';
  end;
  if v_after.starts_at < v_event.starts_at or v_after.ends_at > coalesce(v_event.ends_at, v_event.starts_at + interval '3 hours') then
    raise exception 'session_outside_event' using errcode = 'P0001';
  end if;
  if v_after.capacity is not null and v_after.capacity <
     (select count(*) from public.event_session_registrations where session_id = v_after.id and status = 'registered') then
    raise exception 'capacity_below_going' using errcode = 'P0001';
  end if;
  if v_before.id is not null and (v_before.starts_at, v_before.ends_at, v_before.room) is distinct from (v_after.starts_at, v_after.ends_at, v_after.room) then
    for v_row in select user_id from public.event_session_registrations where session_id = v_after.id and status = 'registered' loop
      perform private.notify_event(v_row.user_id, p_post_id, 'campus.event_agenda_changed',
        'Agenda change: ' || v_after.title,
        to_char(v_after.starts_at at time zone v_event.timezone, 'Dy DD Mon, HH24:MI') || coalesce(', ' || v_after.room, '')
        || ' (' || private.event_title(p_post_id) || ')');
    end loop;
  end if;
  perform private.event_audit(p_post_id, case when p_session_id is null then 'event.session_added' else 'event.session_updated' end,
    to_jsonb(v_before), to_jsonb(v_after));
  return v_after.id;
end;
$$;

create function public.delete_event_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_session public.event_sessions; v_row record;
begin
  select * into v_session from public.event_sessions where id = p_session_id;
  if v_session.id is null or not private.event_can_manage(v_session.post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  for v_row in select user_id from public.event_session_registrations where session_id = p_session_id and status = 'registered' loop
    perform private.notify_event(v_row.user_id, v_session.post_id, 'campus.event_agenda_changed', 'Session removed: ' || v_session.title,
      'This session is no longer part of ' || private.event_title(v_session.post_id) || '.');
  end loop;
  perform private.event_audit(v_session.post_id, 'event.session_removed', to_jsonb(v_session));
  delete from public.event_sessions where id = p_session_id;
end;
$$;

-- Organisers: speakers and sponsors ---------------------------------------------------------------

create function public.save_event_speaker(p_post_id uuid, p_speaker_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_event public.campus_events;
begin
  if not private.event_can_manage(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_event from public.campus_events where post_id = p_post_id;
  if private.payload_text(p_data, 'photo_path') is not null and split_part(p_data ->> 'photo_path', '/', 1) <> v_event.institution_id::text then
    raise exception 'speaker_invalid' using errcode = 'P0001';
  end if;
  begin
    if p_speaker_id is null then
      if (select count(*) from public.event_speakers where post_id = p_post_id) >= 200 then raise exception 'too_many' using errcode = 'P0001'; end if;
      insert into public.event_speakers (post_id, name, title, organisation, bio, photo_path, keynote, position)
      values (p_post_id, btrim(p_data ->> 'name'), private.payload_text(p_data, 'title'), private.payload_text(p_data, 'organisation'),
              private.payload_text(p_data, 'bio'), private.payload_text(p_data, 'photo_path'),
              coalesce((p_data ->> 'keynote')::boolean, false), coalesce((p_data ->> 'position')::int, 100))
      returning id into v_id;
    else
      update public.event_speakers s set
        name = coalesce(nullif(btrim(p_data ->> 'name'), ''), s.name),
        title = case when p_data ? 'title' then private.payload_text(p_data, 'title') else s.title end,
        organisation = case when p_data ? 'organisation' then private.payload_text(p_data, 'organisation') else s.organisation end,
        bio = case when p_data ? 'bio' then private.payload_text(p_data, 'bio') else s.bio end,
        photo_path = case when p_data ? 'photo_path' then private.payload_text(p_data, 'photo_path') else s.photo_path end,
        keynote = coalesce((p_data ->> 'keynote')::boolean, s.keynote),
        position = coalesce((p_data ->> 'position')::int, s.position)
      where s.id = p_speaker_id and s.post_id = p_post_id
      returning id into v_id;
      if v_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
    end if;
  exception when check_violation or not_null_violation or invalid_text_representation then
    raise exception 'speaker_invalid' using errcode = 'P0001';
  end;
  perform private.event_audit(p_post_id, 'event.speaker_saved', null, jsonb_build_object('speaker', v_id, 'name', p_data ->> 'name'));
  return v_id;
end;
$$;

create function public.delete_event_speaker(p_speaker_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_post uuid;
begin
  select post_id into v_post from public.event_speakers where id = p_speaker_id;
  if v_post is null or not private.event_can_manage(v_post) then raise exception 'not_found' using errcode = 'P0001'; end if;
  delete from public.event_speakers where id = p_speaker_id;
  perform private.event_audit(v_post, 'event.speaker_removed', null, null, jsonb_build_object('speaker', p_speaker_id));
end;
$$;

-- Who speaks in a session: [{speaker_id, role}], replaced as a set.
create function public.set_session_speakers(p_session_id uuid, p_speakers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_post uuid; v_s jsonb;
begin
  select post_id into v_post from public.event_sessions where id = p_session_id;
  if v_post is null or not private.event_can_manage(v_post) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_speakers is null or jsonb_typeof(p_speakers) <> 'array' or jsonb_array_length(p_speakers) > 20 then
    raise exception 'speakers_invalid' using errcode = 'P0001';
  end if;
  delete from public.event_session_speakers where session_id = p_session_id;
  for v_s in select * from jsonb_array_elements(p_speakers) loop
    if not exists (select 1 from public.event_speakers where id = (v_s ->> 'speaker_id')::uuid and post_id = v_post) then
      raise exception 'speakers_invalid' using errcode = 'P0001';
    end if;
    insert into public.event_session_speakers (session_id, speaker_id, role)
    values (p_session_id, (v_s ->> 'speaker_id')::uuid, coalesce(v_s ->> 'role', 'speaker'))
    on conflict do nothing;
  end loop;
exception when invalid_text_representation or check_violation then
  raise exception 'speakers_invalid' using errcode = 'P0001';
end;
$$;

create function public.save_event_sponsor(p_post_id uuid, p_sponsor_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_event public.campus_events;
begin
  if not private.event_can_manage(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_event from public.campus_events where post_id = p_post_id;
  if private.payload_text(p_data, 'logo_path') is not null and split_part(p_data ->> 'logo_path', '/', 1) <> v_event.institution_id::text then
    raise exception 'sponsor_invalid' using errcode = 'P0001';
  end if;
  begin
    if p_sponsor_id is null then
      if (select count(*) from public.event_sponsors where post_id = p_post_id) >= 100 then raise exception 'too_many' using errcode = 'P0001'; end if;
      insert into public.event_sponsors (post_id, name, tier, logo_path, url, position)
      values (p_post_id, btrim(p_data ->> 'name'), coalesce(p_data ->> 'tier', 'partner'), private.payload_text(p_data, 'logo_path'),
              private.payload_text(p_data, 'url'), coalesce((p_data ->> 'position')::int, 100))
      returning id into v_id;
    else
      update public.event_sponsors s set
        name = coalesce(nullif(btrim(p_data ->> 'name'), ''), s.name),
        tier = coalesce(p_data ->> 'tier', s.tier),
        logo_path = case when p_data ? 'logo_path' then private.payload_text(p_data, 'logo_path') else s.logo_path end,
        url = case when p_data ? 'url' then private.payload_text(p_data, 'url') else s.url end,
        position = coalesce((p_data ->> 'position')::int, s.position)
      where s.id = p_sponsor_id and s.post_id = p_post_id
      returning id into v_id;
      if v_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
    end if;
  exception when check_violation or not_null_violation or invalid_text_representation then
    raise exception 'sponsor_invalid' using errcode = 'P0001';
  end;
  perform private.event_audit(p_post_id, 'event.sponsor_saved', null, jsonb_build_object('sponsor', v_id, 'name', p_data ->> 'name'));
  return v_id;
end;
$$;

create function public.delete_event_sponsor(p_sponsor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_post uuid;
begin
  select post_id into v_post from public.event_sponsors where id = p_sponsor_id;
  if v_post is null or not private.event_can_manage(v_post) then raise exception 'not_found' using errcode = 'P0001'; end if;
  delete from public.event_sponsors where id = p_sponsor_id;
  perform private.event_audit(v_post, 'event.sponsor_removed', null, null, jsonb_build_object('sponsor', p_sponsor_id));
end;
$$;

-- Students: session registration -------------------------------------------------------------------

-- Only students with a place at the event, only when the event uses session registration. The
-- session row is locked so the last seat goes once; with the clash rule on, a student can't hold
-- two sessions that overlap.
create function public.register_for_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.event_sessions;
  v_event public.campus_events;
begin
  perform private.campus_require();
  select * into v_session from public.event_sessions where id = p_session_id for update;
  if v_session.id is null or not private.event_visible(v_session.post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_event from public.campus_events where post_id = v_session.post_id;
  if not v_event.session_registration then raise exception 'sessions_not_bookable' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.event_rsvps where post_id = v_session.post_id and user_id = v_uid and status in ('confirmed', 'attended')) then
    raise exception 'register_for_event_first' using errcode = 'P0001';
  end if;
  if v_session.ends_at <= now() or v_event.lifecycle <> 'published' then raise exception 'session_over' using errcode = 'P0001'; end if;
  if exists (select 1 from public.event_session_registrations where session_id = p_session_id and user_id = v_uid and status = 'registered') then
    return jsonb_build_object('session_id', p_session_id, 'status', 'registered');
  end if;
  perform private.check_rate_limit('events.session', 60, interval '1 hour');
  if v_session.capacity is not null
     and (select count(*) from public.event_session_registrations where session_id = p_session_id and status = 'registered') >= v_session.capacity then
    raise exception 'session_full' using errcode = 'P0001';
  end if;
  if v_event.sessions_no_clash and exists (
       select 1 from public.event_session_registrations r
       join public.event_sessions s on s.id = r.session_id
       where r.user_id = v_uid and r.post_id = v_session.post_id and r.status = 'registered'
         and s.id <> p_session_id and s.starts_at < v_session.ends_at and s.ends_at > v_session.starts_at) then
    raise exception 'session_clash' using errcode = 'P0001';
  end if;
  insert into public.event_session_registrations (session_id, user_id, post_id)
  values (p_session_id, v_uid, v_session.post_id)
  on conflict (session_id, user_id) do update set status = 'registered', cancelled_at = null, created_at = now();
  return jsonb_build_object('session_id', p_session_id, 'status', 'registered');
end;
$$;

create function public.cancel_session_registration(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  update public.event_session_registrations set status = 'cancelled', cancelled_at = now()
   where session_id = p_session_id and user_id = (select auth.uid()) and status = 'registered';
  return jsonb_build_object('session_id', p_session_id, 'status', 'cancelled');
end;
$$;

-- The event page, now with the agenda, speakers and sponsors.
create or replace function public.event_page(p_post_id uuid)
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
    'sessions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'description', s.description, 'kind', s.kind, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
        'room', s.room, 'capacity', s.capacity,
        'spaces_left', case when s.capacity is not null then greatest(s.capacity -
            (select count(*) from public.event_session_registrations r where r.session_id = s.id and r.status = 'registered'), 0) end,
        'mine', exists (select 1 from public.event_session_registrations r
                        where r.session_id = s.id and r.user_id = (select auth.uid()) and r.status = 'registered'),
        'speakers', coalesce((select jsonb_agg(jsonb_build_object('id', sp.id, 'name', sp.name, 'role', ss.role) order by sp.position, sp.name)
                              from public.event_session_speakers ss join public.event_speakers sp on sp.id = ss.speaker_id
                              where ss.session_id = s.id), '[]'::jsonb))
        order by s.starts_at, s.title) from public.event_sessions s where s.post_id = p.id), '[]'::jsonb),
    'speakers', coalesce((select jsonb_agg(jsonb_build_object('id', sp.id, 'name', sp.name, 'title', sp.title,
        'organisation', sp.organisation, 'bio', sp.bio, 'photo_path', sp.photo_path, 'keynote', sp.keynote)
        order by sp.keynote desc, sp.position, sp.name) from public.event_speakers sp where sp.post_id = p.id), '[]'::jsonb),
    'sponsors', coalesce((select jsonb_agg(jsonb_build_object('id', so.id, 'name', so.name, 'tier', so.tier,
        'logo_path', so.logo_path, 'url', so.url)
        order by array_position(array['headline', 'gold', 'silver', 'bronze', 'partner', 'media'], so.tier), so.position, so.name)
        from public.event_sponsors so where so.post_id = p.id), '[]'::jsonb),
    'can_manage', private.event_can_manage(p.id),
    'can_scan', private.event_can_scan(p.id))
  from public.campus_posts p
  join public.campus_organisations o on o.id = p.organisation_id
  join public.institutions i on i.id = p.institution_id
  where p.id = p_post_id
    and (private.event_visible(p.id) or private.event_can_manage(p.id) or private.is_staff('support'))
    and exists (select 1 from public.campus_events e where e.post_id = p.id);
$$;

-- Duplicate an event as a new draft: details, questions, audience, speakers, sessions (and who
-- speaks in them) and sponsors. Registrations, tickets and history are not copied.
create function public.duplicate_event(p_post_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.campus_posts;
  v_new uuid;
  v_map jsonb := '{}'::jsonb;
  v_sp record;
  v_ns uuid;
  v_s record;
begin
  if not private.event_can_manage(p_post_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_post from public.campus_posts where id = p_post_id;
  perform private.check_rate_limit('events.create', 30, interval '1 day');
  insert into public.campus_posts (institution_id, organisation_id, author_id, kind, title, body, link_url, video_url, visibility, status)
  values (v_post.institution_id, v_post.organisation_id, (select auth.uid()), v_post.kind,
          left('Copy of ' || v_post.title, 140), v_post.body, v_post.link_url, v_post.video_url, v_post.visibility, 'draft')
  returning id into v_new;
  insert into public.campus_events (post_id, institution_id, starts_at, ends_at, venue, capacity, rsvp_open, normal_price_pesewas,
    student_price_pesewas, lifecycle, category_id, event_type, format, timezone, registration_opens_at, registration_closes_at,
    venue_address, campus_id, city, map_lat, map_lng, venue_instructions, online_platform, online_link, online_instructions,
    online_link_lead_minutes, approval_required, waitlist_enabled, cancellation_allowed, cancel_until_hours, audience,
    session_registration, sessions_no_clash, theme, summary, poster_path, featured, contact_name, contact_email, contact_phone,
    remind_7d, remind_24h, remind_1h, created_by)
  select v_new, institution_id, starts_at, ends_at, venue, capacity, rsvp_open, normal_price_pesewas,
    student_price_pesewas, 'draft', category_id, event_type, format, timezone, registration_opens_at, registration_closes_at,
    venue_address, campus_id, city, map_lat, map_lng, venue_instructions, online_platform, online_link, online_instructions,
    online_link_lead_minutes, approval_required, waitlist_enabled, cancellation_allowed, cancel_until_hours, audience,
    session_registration, sessions_no_clash, theme, summary, poster_path, false, contact_name, contact_email, contact_phone,
    remind_7d, remind_24h, remind_1h, (select auth.uid())
  from public.campus_events where post_id = p_post_id;
  insert into public.event_questions (post_id, position, prompt, kind, required)
  select v_new, position, prompt, kind, required from public.event_questions where post_id = p_post_id;
  insert into public.event_audiences (post_id, kind, institution_id, campus_id, organisation_id)
  select v_new, kind, institution_id, campus_id, organisation_id from public.event_audiences where post_id = p_post_id;
  for v_sp in select * from public.event_speakers where post_id = p_post_id loop
    insert into public.event_speakers (post_id, name, title, organisation, bio, photo_path, keynote, position)
    values (v_new, v_sp.name, v_sp.title, v_sp.organisation, v_sp.bio, v_sp.photo_path, v_sp.keynote, v_sp.position)
    returning id into v_ns;
    v_map := v_map || jsonb_build_object(v_sp.id::text, v_ns);
  end loop;
  for v_s in select * from public.event_sessions where post_id = p_post_id loop
    insert into public.event_sessions (post_id, title, description, kind, starts_at, ends_at, room, capacity)
    values (v_new, v_s.title, v_s.description, v_s.kind, v_s.starts_at, v_s.ends_at, v_s.room, v_s.capacity)
    returning id into v_ns;
    insert into public.event_session_speakers (session_id, speaker_id, role)
    select v_ns, (v_map ->> ss.speaker_id::text)::uuid, ss.role from public.event_session_speakers ss where ss.session_id = v_s.id;
  end loop;
  insert into public.event_sponsors (post_id, name, tier, logo_path, url, position)
  select v_new, name, tier, logo_path, url, position from public.event_sponsors where post_id = p_post_id;
  perform private.event_audit(v_new, 'event.duplicated', null, null, jsonb_build_object('from', p_post_id));
  return v_new;
end;
$$;

revoke execute on all functions in schema private from public;
revoke execute on function
  public.save_event_session(uuid, uuid, jsonb), public.delete_event_session(uuid), public.save_event_speaker(uuid, uuid, jsonb),
  public.delete_event_speaker(uuid), public.set_session_speakers(uuid, jsonb), public.save_event_sponsor(uuid, uuid, jsonb),
  public.delete_event_sponsor(uuid), public.register_for_session(uuid), public.cancel_session_registration(uuid),
  public.duplicate_event(uuid)
  from public, anon, service_role;
grant execute on function
  public.save_event_session(uuid, uuid, jsonb), public.delete_event_session(uuid), public.save_event_speaker(uuid, uuid, jsonb),
  public.delete_event_speaker(uuid), public.set_session_speakers(uuid, jsonb), public.save_event_sponsor(uuid, uuid, jsonb),
  public.delete_event_sponsor(uuid), public.register_for_session(uuid), public.cancel_session_registration(uuid),
  public.duplicate_event(uuid)
  to authenticated;
