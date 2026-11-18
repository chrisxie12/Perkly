-- Campus C3: events and RSVPs.
-- Any Campus post except an emergency notice can carry event details (when and
-- where, and an optional capacity). Verified students of the school RSVP. Organisers
-- see how many are going, not who. Nothing here sends notifications.
-- Tables are reached only through the functions below (no direct grants).

create table public.campus_events (
  post_id uuid primary key,
  institution_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue text not null check (char_length(btrim(venue)) between 2 and 160),
  capacity int check (capacity is null or capacity between 1 and 100000),
  rsvp_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_events_post_fk foreign key (post_id, institution_id)
    references public.campus_posts (id, institution_id) on delete cascade,
  constraint campus_events_times check (ends_at is null or (ends_at > starts_at and ends_at <= starts_at + interval '14 days'))
);
create index campus_events_upcoming on public.campus_events (institution_id, starts_at, post_id);
create trigger campus_events_updated_at before update on public.campus_events
  for each row execute function private.set_updated_at();

create table public.event_rsvps (
  post_id uuid not null,
  institution_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id),
  constraint event_rsvps_event_fk foreign key (post_id) references public.campus_events (post_id) on delete cascade,
  constraint event_rsvps_post_fk foreign key (post_id, institution_id)
    references public.campus_posts (id, institution_id) on delete cascade
);
create index event_rsvps_user on public.event_rsvps (user_id, created_at desc);

alter table public.campus_events enable row level security;
alter table public.event_rsvps enable row level security;
revoke all on public.campus_events, public.event_rsvps from public, anon, authenticated;

-- When does an event stop accepting RSVPs and drop off the upcoming list?
create function private.event_over(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select coalesce(e.ends_at, e.starts_at + interval '3 hours') <= now()
                   from public.campus_events e where e.post_id = p_post_id), true);
$$;

create function private.event_json(p_post_id uuid, p_viewer uuid)
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
    'over', private.event_over(e.post_id))
  from public.campus_events e where e.post_id = p_post_id;
$$;

-- Editors ------------------------------------------------------------------------------------

create function public.set_event_details(p_post_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_venue text,
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

create function public.remove_event_details(p_post_id uuid)
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

-- Students -----------------------------------------------------------------------------------

create function public.set_rsvp(p_post_id uuid, p_going boolean)
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
    delete from public.event_rsvps where post_id = p_post_id and user_id = (select auth.uid());
  end if;
  return private.event_json(p_post_id, (select auth.uid()));
end;
$$;

-- Reads --------------------------------------------------------------------------------------

-- Event details for one post: readers of the post, its editors, and Perqly support.
create function public.event_detail(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.event_json(p_post_id, (select auth.uid()))
  where private.can_read_post(p_post_id) or private.can_edit_post(p_post_id) or private.is_staff('support');
$$;

-- Upcoming events at the caller's school, soonest first. Keyset on (starts_at, post id).
create function public.upcoming_events(p_after_at timestamptz default null, p_after_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.campus_post_json(x.post_id, (select auth.uid()))
                            || jsonb_build_object('event', private.event_json(x.post_id, (select auth.uid())))
                            order by x.starts_at, x.post_id), '[]'::jsonb)
  from (
    select e.post_id, e.starts_at
    from public.campus_events e
    where coalesce(e.ends_at, e.starts_at + interval '3 hours') > now()
      and private.can_read_post(e.post_id)
      and (p_after_at is null or (e.starts_at, e.post_id) > (p_after_at, p_after_id))
    order by e.starts_at, e.post_id
    limit 30
  ) x;
$$;

-- Events the caller is going to that haven't finished.
create function public.my_events()
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

-- Grants ---------------------------------------------------------------------------------------

revoke execute on function private.event_over(uuid), private.event_json(uuid, uuid),
  public.set_event_details(uuid, timestamptz, timestamptz, text, int, boolean), public.remove_event_details(uuid),
  public.set_rsvp(uuid, boolean), public.event_detail(uuid), public.upcoming_events(timestamptz, uuid), public.my_events()
  from public, anon, authenticated, service_role;

grant execute on function
  public.set_event_details(uuid, timestamptz, timestamptz, text, int, boolean), public.remove_event_details(uuid),
  public.set_rsvp(uuid, boolean), public.event_detail(uuid), public.upcoming_events(timestamptz, uuid), public.my_events()
  to authenticated;
