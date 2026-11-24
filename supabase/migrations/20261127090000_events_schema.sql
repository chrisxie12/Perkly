-- Events & Conferences, PR A part 1: the tables and columns, and the backfill of existing rows.
--
-- Events stay Campus events: a campus_posts row (title, description, images, organisation,
-- school) with a campus_events row beside it. Registrations stay event_rsvps and tickets stay
-- event_tickets. This file only adds: nothing existing is dropped, renamed or deleted.
-- docs/EVENTS.md has the decisions; the functions come in 20261127100000 onwards.

-- Perqly's own organisation at a school ---------------------------------------------------------
-- 'administration' is the school's own administration (needs an agreement, shows "University
-- official"), so Perqly-run events get their own kind. It has no members: only Perqly admins act
-- for it (can_publish already lets them), so no organisation powers are handed to anyone.

alter table public.campus_organisations drop constraint campus_organisations_kind_check;
alter table public.campus_organisations add constraint campus_organisations_kind_check
  check (kind in ('src', 'faculty', 'department', 'hall', 'club', 'society', 'association', 'administration', 'perqly'));

create or replace function private.campus_staff_run(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_kind in ('faculty', 'department', 'administration', 'perqly');
$$;

create function private.guard_perqly_members()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.campus_organisations o where o.id = new.organisation_id and o.kind = 'perqly') then
    raise exception 'perqly_has_no_members' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_perqly_members() from public, anon, authenticated;
create trigger organisation_members_perqly before insert or update on public.organisation_members
  for each row execute function private.guard_perqly_members();

-- Categories ------------------------------------------------------------------------------------

create table public.event_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(btrim(name)) between 2 and 40),
  position smallint not null default 100 check (position between 0 and 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger event_categories_updated_at before update on public.event_categories
  for each row execute function private.set_updated_at();
alter table public.event_categories enable row level security;
revoke all on public.event_categories from public, anon, authenticated;

insert into public.event_categories (slug, name, position) values
  ('technology', 'Technology', 10), ('business', 'Business', 20), ('education', 'Education', 30),
  ('career', 'Career', 40), ('entrepreneurship', 'Entrepreneurship', 50), ('networking', 'Networking', 60),
  ('entertainment', 'Entertainment', 70), ('social', 'Social', 80), ('sports', 'Sports', 90),
  ('leadership', 'Leadership', 100), ('innovation', 'Innovation', 110), ('health-wellness', 'Health and wellness', 120),
  ('other', 'Other', 999);

-- Events ------------------------------------------------------------------------------------------

alter table public.campus_events
  -- Lifecycle is stored; "registration open", "full", "happening now" are worked out on read.
  add column lifecycle text not null default 'published'
    check (lifecycle in ('draft', 'published', 'cancelled', 'completed', 'archived')),
  add column category_id uuid references public.event_categories (id),
  add column event_type text not null default 'event'
    check (event_type in ('event', 'conference', 'summit', 'workshop', 'bootcamp', 'seminar', 'panel', 'career_fair',
                          'networking', 'competition', 'exhibition', 'other')),
  add column format text not null default 'physical' check (format in ('physical', 'online', 'hybrid')),
  add column timezone text not null default 'Africa/Accra' check (timezone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){1,2}$|^UTC$'),
  add column registration_opens_at timestamptz,
  add column registration_closes_at timestamptz,
  -- Where (physical and hybrid). venue stays the short name every screen already shows.
  add column venue_address text check (venue_address is null or char_length(btrim(venue_address)) between 2 and 300),
  add column campus_id uuid,
  add column city text check (city is null or char_length(btrim(city)) between 2 and 80),
  add column map_lat numeric(9, 6) check (map_lat is null or map_lat between -90 and 90),
  add column map_lng numeric(9, 6) check (map_lng is null or map_lng between -180 and 180),
  add column venue_instructions text check (venue_instructions is null or char_length(venue_instructions) <= 1000),
  -- Online (online and hybrid). The link is private: only confirmed registrants get it.
  add column online_platform text check (online_platform is null or char_length(btrim(online_platform)) between 2 and 60),
  add column online_link text check (online_link is null or (online_link ~ '^https://[^\s]+$' and char_length(online_link) <= 500)),
  add column online_instructions text check (online_instructions is null or char_length(online_instructions) <= 1000),
  add column online_link_lead_minutes int not null default 60 check (online_link_lead_minutes between 0 and 10080),
  -- Registration.
  add column approval_required boolean not null default false,
  add column waitlist_enabled boolean not null default false,
  add column cancellation_allowed boolean not null default true,
  add column cancel_until_hours int not null default 0 check (cancel_until_hours between 0 and 720),
  add column audience text not null default 'school' check (audience in ('school', 'listed', 'all_verified')),
  add column session_registration boolean not null default false,
  add column sessions_no_clash boolean not null default true,
  -- Presentation.
  add column theme text check (theme is null or char_length(btrim(theme)) between 2 and 200),
  add column summary text check (summary is null or char_length(btrim(summary)) between 2 and 280),
  add column poster_path text check (poster_path is null or poster_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/post/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  add column featured boolean not null default false,
  add column contact_name text check (contact_name is null or char_length(btrim(contact_name)) between 2 and 120),
  add column contact_email extensions.citext check (contact_email is null or (char_length(contact_email) <= 254 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  add column contact_phone text check (contact_phone is null or contact_phone ~ '^\+?[0-9][0-9 ]{6,19}$'),
  -- Reminders (each can be switched off per event).
  add column remind_7d boolean not null default true,
  add column remind_24h boolean not null default true,
  add column remind_1h boolean not null default true,
  -- History.
  add column published_at timestamptz,
  add column cancelled_at timestamptz,
  add column cancel_reason text check (cancel_reason is null or char_length(btrim(cancel_reason)) between 3 and 500),
  add column rescheduled_at timestamptz,
  add column previous_starts_at timestamptz,
  add column completed_at timestamptz,
  add column archived_at timestamptz,
  add column created_by uuid references public.profiles (id) on delete set null,
  add constraint campus_events_campus_fk foreign key (campus_id, institution_id) references public.campuses (id, institution_id),
  add constraint campus_events_registration_window check (
    registration_opens_at is null or registration_closes_at is null or registration_opens_at < registration_closes_at),
  add constraint campus_events_cancelled check (lifecycle <> 'cancelled' or cancelled_at is not null),
  add constraint campus_events_map check ((map_lat is null) = (map_lng is null));

-- No more 14-day limit: conferences, bootcamps and multi-week programmes. End after start, and a
-- sanity cap of a year so a typo can't make an event that never ends.
alter table public.campus_events drop constraint campus_events_times;
alter table public.campus_events add constraint campus_events_times
  check (ends_at is null or (ends_at > starts_at and ends_at <= starts_at + interval '366 days'));

-- Online-only events need no venue.
alter table public.campus_events alter column venue drop not null;
alter table public.campus_events add constraint campus_events_venue_needed check (format = 'online' or venue is not null);

create index campus_events_lifecycle on public.campus_events (lifecycle, starts_at);
create index campus_events_category on public.campus_events (category_id) where category_id is not null;

-- Who else may attend, beyond the event's own school ('listed' audience).
create table public.event_audiences (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.campus_events (post_id) on delete cascade,
  kind text not null check (kind in ('institution', 'campus', 'organisation')),
  institution_id uuid references public.institutions (id),
  campus_id uuid references public.campuses (id),
  organisation_id uuid references public.campus_organisations (id),
  created_at timestamptz not null default now(),
  constraint event_audiences_target check (
    (kind = 'institution' and institution_id is not null and campus_id is null and organisation_id is null)
    or (kind = 'campus' and campus_id is not null and institution_id is null and organisation_id is null)
    or (kind = 'organisation' and organisation_id is not null and institution_id is null and campus_id is null))
);
create unique index event_audiences_once on public.event_audiences (post_id, kind, coalesce(institution_id, campus_id, organisation_id));

-- Up to five questions a student answers when registering.
create table public.event_questions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.campus_events (post_id) on delete cascade,
  position smallint not null check (position between 1 and 5),
  prompt text not null check (char_length(btrim(prompt)) between 3 and 200),
  kind text not null default 'text' check (kind in ('text', 'yes_no')),
  required boolean not null default false,
  created_at timestamptz not null default now(),
  unique (post_id, position)
);

-- Door helpers: may scan tickets for one event, nothing else.
create table public.event_staff (
  post_id uuid not null references public.campus_events (post_id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'door' check (role in ('door')),
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index event_staff_user on public.event_staff (user_id);

alter table public.event_audiences enable row level security;
alter table public.event_questions enable row level security;
alter table public.event_staff enable row level security;
revoke all on public.event_audiences, public.event_questions, public.event_staff from public, anon, authenticated;

-- Registrations (event_rsvps) ---------------------------------------------------------------------
-- One row per student per event, kept for good: cancelling sets the status instead of deleting.

alter table public.event_rsvps
  add column status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'waitlisted', 'cancelled', 'rejected', 'attended', 'no_show')),
  add column answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 6000),
  add column waitlisted_at timestamptz,
  add column decided_at timestamptz,
  add column decided_by uuid references public.profiles (id) on delete set null,
  add column decision_note text check (decision_note is null or char_length(btrim(decision_note)) between 2 and 300),
  add column cancelled_at timestamptz,
  add column updated_at timestamptz not null default now(),
  add constraint event_rsvps_waitlisted check (status <> 'waitlisted' or waitlisted_at is not null);
create index event_rsvps_status on public.event_rsvps (post_id, status);
create index event_rsvps_waitlist on public.event_rsvps (post_id, waitlisted_at, user_id) where status = 'waitlisted';
create trigger event_rsvps_updated_at before update on public.event_rsvps
  for each row execute function private.set_updated_at();

-- Ticket secrets ----------------------------------------------------------------------------------
-- The QR holds a 128-bit secret derived from the ticket with a per-database key (made here, never
-- in git, like the student-ID pepper). The table stores only its SHA-256 hash, and the door finds
-- tickets by that hash. Codes are now made with a cryptographic generator.

insert into private.app_settings (key, value)
values ('events.ticket_qr_key', to_jsonb(encode(extensions.gen_random_bytes(32), 'hex')))
on conflict (key) do nothing;

create function private.ticket_secret(p_ticket_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_key text := (select value #>> '{}' from private.app_settings where key = 'events.ticket_qr_key');
begin
  if v_key is null or v_key !~ '^[0-9a-f]{64}$' then raise exception 'ticket_key_missing' using errcode = 'P0001'; end if;
  -- First 16 bytes of HMAC-SHA256(key, ticket id), as 32 hex characters.
  return encode(substring(extensions.hmac(convert_to(p_ticket_id::text, 'UTF8'), decode(v_key, 'hex'), 'sha256') from 1 for 16), 'hex');
end;
$$;

create function private.ticket_secret_hash(p_secret text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.digest(convert_to(lower(btrim(coalesce(p_secret, ''))), 'UTF8'), 'sha256');
$$;

create or replace function private.new_ticket_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
begin
  loop
    v_bytes := extensions.gen_random_bytes(8);
    select string_agg(substr(v_chars, 1 + (get_byte(v_bytes, i) % 32), 1), '' order by i)
      into v_code from generate_series(0, 7) i;
    exit when not exists (select 1 from public.event_tickets where code = v_code);
  end loop;
  return v_code;
end;
$$;

alter table public.event_tickets add column secret_hash bytea;

create function private.event_ticket_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.secret_hash := private.ticket_secret_hash(private.ticket_secret(new.id));
  return new;
end;
$$;
create trigger event_tickets_secret before insert on public.event_tickets
  for each row execute function private.event_ticket_secret();

revoke execute on function private.ticket_secret(uuid), private.ticket_secret_hash(text), private.event_ticket_secret()
  from public, anon, authenticated, service_role;

-- Backfill ----------------------------------------------------------------------------------------
-- Existing events keep their times, venue and capacity; RSVPs and tickets keep their ids, codes,
-- statuses and times. Nothing is deleted.

update public.campus_events e
   set lifecycle = case p.status when 'draft' then 'draft' when 'removed' then 'archived' else 'published' end,
       published_at = case when p.status in ('published', 'hidden') then p.publish_at end,
       archived_at = case when p.status = 'removed' then coalesce(p.removed_at, now()) end,
       created_by = p.author_id,
       category_id = (select id from public.event_categories where slug = 'other')
  from public.campus_posts p
 where p.id = e.post_id;

update public.event_rsvps r
   set status = 'attended'
 where exists (select 1 from public.event_tickets t
               where t.post_id = r.post_id and t.user_id = r.user_id and t.status = 'checked_in');

update public.event_tickets set secret_hash = private.ticket_secret_hash(private.ticket_secret(id)) where secret_hash is null;
alter table public.event_tickets alter column secret_hash set not null;
create unique index event_tickets_secret on public.event_tickets (secret_hash);
