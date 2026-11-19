-- Appointment bookings (product spec §6, database architecture §5.7).
-- A service can be marked bookable. Managers set weekly hours per branch and service
-- (slot length, places per slot) and closed days. Verified students request a slot;
-- the shop confirms, rejects or proposes another time; the student accepts or declines.
-- A booking never counts as a redemption. When the student redeems a deal on that
-- service at that branch around the booking time, the booking is marked completed.
-- Every write goes through the functions below.

create type public.booking_status as enum ('pending', 'confirmed', 'reschedule_requested', 'cancelled', 'completed', 'no_show');
create type public.booking_party as enum ('student', 'merchant', 'system');

alter table public.services add column is_bookable boolean not null default false;

-- Availability -------------------------------------------------------------------------

create table public.branch_availability_rules (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  branch_id uuid not null references public.merchant_branches (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_minutes int not null check (slot_minutes between 5 and 480),
  capacity int not null default 1 check (capacity between 1 and 50),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_availability_rules_times check (end_time > start_time)
);
create index branch_availability_rules_lookup on public.branch_availability_rules (branch_id, service_id, weekday) where is_active;
create trigger branch_availability_rules_updated_at before update on public.branch_availability_rules
  for each row execute function private.set_updated_at();

create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  branch_id uuid not null references public.merchant_branches (id) on delete cascade,
  service_id uuid references public.services (id) on delete cascade,
  date date not null,
  is_closed boolean not null default true,
  start_time time,
  end_time time,
  reason text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  constraint availability_exceptions_hours check (
    (is_closed and start_time is null and end_time is null)
    or (not is_closed and start_time is not null and end_time is not null and end_time > start_time))
);
create index availability_exceptions_lookup on public.availability_exceptions (branch_id, date);

-- Bookings ---------------------------------------------------------------------------------

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  branch_id uuid not null references public.merchant_branches (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete restrict,
  offer_id uuid references public.offers (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.booking_status not null default 'pending',
  proposed_starts_at timestamptz,
  proposed_ends_at timestamptz,
  student_note text check (student_note is null or char_length(student_note) <= 500),
  merchant_note text check (merchant_note is null or char_length(merchant_note) <= 500),
  confirmed_at timestamptz,
  completed_at timestamptz,
  no_show_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancelled_by_party public.booking_party,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  redemption_id uuid references public.redemptions (id) on delete set null,
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, client_request_id),
  constraint bookings_times check (ends_at > starts_at),
  constraint bookings_proposed check (
    (status = 'reschedule_requested') = (proposed_starts_at is not null)
    and (proposed_starts_at is null) = (proposed_ends_at is null)),
  constraint bookings_cancelled check ((status = 'cancelled') = (cancelled_at is not null and cancelled_by_party is not null))
);
create index bookings_slots on public.bookings (branch_id, service_id, starts_at) where status in ('pending', 'confirmed', 'reschedule_requested');
create index bookings_student on public.bookings (student_id, starts_at desc);
create index bookings_merchant on public.bookings (merchant_id, status, starts_at);
create trigger bookings_updated_at before update on public.bookings for each row execute function private.set_updated_at();

alter table public.branch_availability_rules enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.bookings enable row level security;
revoke all on public.branch_availability_rules, public.availability_exceptions, public.bookings from anon, authenticated, service_role;
grant select on public.bookings to authenticated;
create policy "students read their bookings; shops read their branches' bookings" on public.bookings
  for select to authenticated
  using (student_id = (select auth.uid()) or (select private.can_operate_branch(branch_id)) or (select private.is_staff('support')));

-- Helpers ----------------------------------------------------------------------------------

-- Every slot (open or full) for a branch and service between two dates, Ghana time (UTC).
-- A closed day for the branch, or for this service, removes the day. A day with
-- replacement hours uses them with each rule's slot length and places.
create function private.booking_slots(p_branch_id uuid, p_service_id uuid, p_from date, p_to date)
returns table (starts_at timestamptz, ends_at timestamptz, capacity int, taken int)
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  ), windows as (
    select dy.day, r.slot_minutes, r.capacity,
           coalesce(ex.start_time, r.start_time) as start_time,
           coalesce(ex.end_time, r.end_time) as end_time
    from days dy
    join public.branch_availability_rules r
      on r.branch_id = p_branch_id and r.service_id = p_service_id and r.is_active
     and r.weekday = extract(dow from dy.day)
    left join lateral (
      select e.start_time, e.end_time from public.availability_exceptions e
      where e.branch_id = p_branch_id and e.date = dy.day and not e.is_closed
        and (e.service_id is null or e.service_id = p_service_id)
      order by e.service_id nulls last limit 1
    ) ex on true
    where not exists (
      select 1 from public.availability_exceptions e
      where e.branch_id = p_branch_id and e.date = dy.day and e.is_closed
        and (e.service_id is null or e.service_id = p_service_id))
  ), slots as (
    select (w.day + w.start_time + make_interval(mins => n * w.slot_minutes)) at time zone 'UTC' as starts_at,
           w.slot_minutes, w.capacity
    from windows w
    cross join lateral generate_series(0, floor(extract(epoch from (w.end_time - w.start_time)) / 60 / w.slot_minutes)::int - 1) n
  )
  select s.starts_at, s.starts_at + make_interval(mins => s.slot_minutes), max(s.capacity),
         (select count(*)::int from public.bookings b
          where b.branch_id = p_branch_id and b.service_id = p_service_id
            and ((b.status in ('pending', 'confirmed') and b.starts_at = s.starts_at)
                 or (b.status = 'reschedule_requested' and b.proposed_starts_at = s.starts_at)))
  from slots s
  group by s.starts_at, s.slot_minutes;
$$;

create function private.booking_bookable(p_branch_id uuid, p_service_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.services s
    join public.merchant_branches b on b.merchant_id = s.merchant_id
    where s.id = p_service_id and b.id = p_branch_id and s.is_active and s.is_bookable and b.is_active
      and private.merchant_is_listed(s.merchant_id));
$$;

-- The slot at exactly this time, if it exists and has a free place.
create function private.booking_free_slot(p_branch_id uuid, p_service_id uuid, p_starts_at timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select s.ends_at
  from private.booking_slots(p_branch_id, p_service_id, (p_starts_at at time zone 'UTC')::date, (p_starts_at at time zone 'UTC')::date) s
  where s.starts_at = p_starts_at and s.taken < s.capacity and s.starts_at > now();
$$;

create function private.lock_booking_slot(p_branch_id uuid, p_service_id uuid, p_starts_at timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(p_branch_id::text || p_service_id::text || p_starts_at::text, 0));
$$;

-- Pending and reschedule requests whose time has passed count as cancelled by the system.
create function private.booking_effective_status(p_status public.booking_status, p_starts_at timestamptz, p_proposed timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_status = 'pending' and p_starts_at <= now() then 'expired'
    when p_status = 'reschedule_requested' and p_proposed <= now() then 'expired'
    else p_status::text
  end;
$$;

create function private.booking_link(p_booking public.bookings, p_for text)
returns text
language sql
stable
set search_path = ''
as $$
  select case p_for when 'student' then '/student/bookings' else '/merchant/bookings' end;
$$;

create function private.require_booking_manager(p_merchant_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_merchant(p_merchant_id)) then raise exception 'forbidden' using errcode = 'P0001'; end if;
end;
$$;

-- Shop set-up (owners and managers) ------------------------------------------------------------

create function public.set_service_bookable(p_service_id uuid, p_bookable boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_merchant uuid;
begin
  select merchant_id into v_merchant from public.services where id = p_service_id;
  if v_merchant is null then raise exception 'service_not_found' using errcode = 'P0001'; end if;
  perform private.require_booking_manager(v_merchant);
  update public.services set is_bookable = coalesce(p_bookable, false) where id = p_service_id;
  perform private.write_audit('service.bookable', 'merchant', 'service', p_service_id,
    p_after => jsonb_build_object('bookable', coalesce(p_bookable, false)), p_merchant_id => v_merchant);
end;
$$;

create function public.save_availability_rule(p_rule_id uuid, p_branch_id uuid, p_service_id uuid, p_weekday int,
                                              p_start time, p_end time, p_slot_minutes int, p_capacity int default 1,
                                              p_is_active boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant uuid;
  v_id uuid;
begin
  select s.merchant_id into v_merchant from public.services s
  join public.merchant_branches b on b.merchant_id = s.merchant_id
  where s.id = p_service_id and b.id = p_branch_id;
  if v_merchant is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.require_booking_manager(v_merchant);
  begin
    if p_rule_id is null then
      insert into public.branch_availability_rules (merchant_id, branch_id, service_id, weekday, start_time, end_time, slot_minutes, capacity, is_active)
      values (v_merchant, p_branch_id, p_service_id, p_weekday, p_start, p_end, p_slot_minutes, coalesce(p_capacity, 1), coalesce(p_is_active, true))
      returning id into v_id;
    else
      update public.branch_availability_rules
      set branch_id = p_branch_id, service_id = p_service_id, weekday = p_weekday, start_time = p_start, end_time = p_end,
          slot_minutes = p_slot_minutes, capacity = coalesce(p_capacity, 1), is_active = coalesce(p_is_active, true)
      where id = p_rule_id and merchant_id = v_merchant
      returning id into v_id;
      if v_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
    end if;
  exception when check_violation or not_null_violation then
    raise exception 'hours_invalid' using errcode = 'P0001';
  end;
  return v_id;
end;
$$;

create function public.delete_availability_rule(p_rule_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_merchant uuid;
begin
  select merchant_id into v_merchant from public.branch_availability_rules where id = p_rule_id;
  if v_merchant is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.require_booking_manager(v_merchant);
  delete from public.branch_availability_rules where id = p_rule_id;
end;
$$;

create function public.add_availability_exception(p_branch_id uuid, p_service_id uuid, p_date date, p_is_closed boolean,
                                                  p_start time default null, p_end time default null, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant uuid;
  v_id uuid;
begin
  select merchant_id into v_merchant from public.merchant_branches where id = p_branch_id;
  if v_merchant is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.require_booking_manager(v_merchant);
  if p_service_id is not null and not exists (select 1 from public.services where id = p_service_id and merchant_id = v_merchant) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_date is null or p_date < current_date or p_date > current_date + 365 then raise exception 'date_invalid' using errcode = 'P0001'; end if;
  begin
    insert into public.availability_exceptions (merchant_id, branch_id, service_id, date, is_closed, start_time, end_time, reason)
    values (v_merchant, p_branch_id, p_service_id, p_date, coalesce(p_is_closed, true),
            case when coalesce(p_is_closed, true) then null else p_start end,
            case when coalesce(p_is_closed, true) then null else p_end end, nullif(btrim(p_reason), ''))
    returning id into v_id;
  exception when check_violation then
    raise exception 'hours_invalid' using errcode = 'P0001';
  end;
  return v_id;
end;
$$;

create function public.delete_availability_exception(p_exception_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_merchant uuid;
begin
  select merchant_id into v_merchant from public.availability_exceptions where id = p_exception_id;
  if v_merchant is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.require_booking_manager(v_merchant);
  delete from public.availability_exceptions where id = p_exception_id;
end;
$$;

-- Students ---------------------------------------------------------------------------------------

create function public.get_available_slots(p_branch_id uuid, p_service_id uuid, p_from date, p_to date)
returns table (starts_at timestamptz, ends_at timestamptz, places_left int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not private.booking_bookable(p_branch_id, p_service_id) then return; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 31 then raise exception 'date_invalid' using errcode = 'P0001'; end if;
  return query
    select s.starts_at, s.ends_at, s.capacity - s.taken
    from private.booking_slots(p_branch_id, p_service_id, greatest(p_from, current_date), p_to) s
    where s.starts_at > now() and s.taken < s.capacity
    order by s.starts_at;
end;
$$;

create function public.request_booking(p_branch_id uuid, p_service_id uuid, p_starts_at timestamptz, p_offer_id uuid,
                                       p_note text, p_client_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_merchant uuid;
  v_ends timestamptz;
  v_id uuid;
  v_service text;
begin
  perform private.require_verified_student();
  if p_client_request_id is null then raise exception 'request_invalid' using errcode = 'P0001'; end if;
  select id into v_id from public.bookings where student_id = v_uid and client_request_id = p_client_request_id;
  if v_id is not null then return v_id; end if;
  if not private.booking_bookable(p_branch_id, p_service_id) then raise exception 'not_bookable' using errcode = 'P0001'; end if;
  select merchant_id, name into v_merchant, v_service from public.services where id = p_service_id;
  if p_offer_id is not null and not exists (
    select 1 from public.offers o where o.id = p_offer_id and o.service_id = p_service_id
      and private.offer_redeemable_at(p_offer_id, p_branch_id, private.my_institution())) then
    raise exception 'offer_not_available' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'note_too_long' using errcode = 'P0001'; end if;
  if (select count(*) from public.bookings
      where student_id = v_uid and status in ('pending', 'confirmed', 'reschedule_requested') and starts_at > now())
     >= private.setting_int('booking.max_open_per_student', 5) then
    raise exception 'too_many_bookings' using errcode = 'P0001';
  end if;
  perform private.check_rate_limit('booking.request', 20, interval '1 day');
  perform private.lock_booking_slot(p_branch_id, p_service_id, p_starts_at);
  v_ends := private.booking_free_slot(p_branch_id, p_service_id, p_starts_at);
  if v_ends is null then raise exception 'slot_unavailable' using errcode = 'P0001'; end if;
  insert into public.bookings (student_id, merchant_id, branch_id, service_id, offer_id, starts_at, ends_at, student_note, client_request_id)
  values (v_uid, v_merchant, p_branch_id, p_service_id, p_offer_id, p_starts_at, v_ends, nullif(btrim(p_note), ''), p_client_request_id)
  returning id into v_id;
  perform private.write_audit('booking.requested', 'student', 'booking', v_id, p_merchant_id => v_merchant);
  perform private.notify_business_team(v_merchant, 'booking.requested', 'New booking request',
    v_service || ' on ' || to_char(p_starts_at at time zone 'UTC', 'Dy DD Mon, HH24:MI'), '/merchant/bookings');
  perform private.notify(mu.user_id, 'booking.requested', 'New booking request',
    v_service || ' on ' || to_char(p_starts_at at time zone 'UTC', 'Dy DD Mon, HH24:MI'), '/merchant/bookings')
  from public.merchant_users mu
  join public.merchant_user_branches mub on mub.merchant_user_id = mu.id
  where mu.merchant_id = v_merchant and mu.status = 'active' and mu.role = 'cashier' and mub.branch_id = p_branch_id;
  return v_id;
end;
$$;

create function public.respond_to_reschedule(p_booking_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.bookings;
  v_ends timestamptz;
begin
  select * into v_b from public.bookings where id = p_booking_id and student_id = (select auth.uid()) for update;
  if v_b.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_b.status <> 'reschedule_requested' then raise exception 'booking_not_open' using errcode = 'P0001'; end if;
  if p_accept then
    if v_b.proposed_starts_at <= now() then raise exception 'slot_unavailable' using errcode = 'P0001'; end if;
    perform private.lock_booking_slot(v_b.branch_id, v_b.service_id, v_b.proposed_starts_at);
    update public.bookings set status = 'confirmed', starts_at = proposed_starts_at, ends_at = proposed_ends_at,
      proposed_starts_at = null, proposed_ends_at = null, confirmed_at = now()
    where id = v_b.id;
    perform private.write_audit('booking.reschedule_accepted', 'student', 'booking', v_b.id, p_merchant_id => v_b.merchant_id);
    perform private.notify_business_team(v_b.merchant_id, 'booking.rescheduled', 'New time accepted',
      'A student accepted the time you proposed.', '/merchant/bookings');
  else
    update public.bookings set status = 'cancelled', proposed_starts_at = null, proposed_ends_at = null,
      cancelled_at = now(), cancelled_by = (select auth.uid()), cancelled_by_party = 'student', cancel_reason = 'Declined the new time'
    where id = v_b.id;
    perform private.write_audit('booking.reschedule_declined', 'student', 'booking', v_b.id, p_merchant_id => v_b.merchant_id);
    perform private.notify_business_team(v_b.merchant_id, 'booking.cancelled', 'Booking cancelled',
      'A student declined the time you proposed.', '/merchant/bookings');
  end if;
end;
$$;

-- Shops ------------------------------------------------------------------------------------------

create function public.respond_to_booking(p_booking_id uuid, p_action text, p_proposed_starts_at timestamptz default null,
                                          p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.bookings;
  v_ends timestamptz;
  v_service text;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.id is null or not (select private.can_operate_branch(v_b.branch_id)) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_b.status <> 'pending' or v_b.starts_at <= now() then raise exception 'booking_not_open' using errcode = 'P0001'; end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'note_too_long' using errcode = 'P0001'; end if;
  select name into v_service from public.services where id = v_b.service_id;
  case p_action
    when 'confirm' then
      update public.bookings set status = 'confirmed', confirmed_at = now(), merchant_note = coalesce(nullif(btrim(p_note), ''), merchant_note)
      where id = v_b.id;
      perform private.notify(v_b.student_id, 'booking.confirmed', 'Booking confirmed',
        v_service || ' on ' || to_char(v_b.starts_at at time zone 'UTC', 'Dy DD Mon, HH24:MI'), '/student/bookings');
    when 'reject' then
      update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = (select auth.uid()),
        cancelled_by_party = 'merchant', cancel_reason = coalesce(nullif(btrim(p_note), ''), 'Not available'),
        merchant_note = nullif(btrim(p_note), '')
      where id = v_b.id;
      perform private.notify(v_b.student_id, 'booking.rejected', 'Booking not accepted',
        v_service || ': the shop couldn''t take this booking.', '/student/bookings');
    when 'propose' then
      if p_proposed_starts_at is null or p_proposed_starts_at = v_b.starts_at then raise exception 'slot_unavailable' using errcode = 'P0001'; end if;
      perform private.lock_booking_slot(v_b.branch_id, v_b.service_id, p_proposed_starts_at);
      v_ends := private.booking_free_slot(v_b.branch_id, v_b.service_id, p_proposed_starts_at);
      if v_ends is null then raise exception 'slot_unavailable' using errcode = 'P0001'; end if;
      update public.bookings set status = 'reschedule_requested', proposed_starts_at = p_proposed_starts_at,
        proposed_ends_at = v_ends, merchant_note = nullif(btrim(p_note), '')
      where id = v_b.id;
      perform private.notify(v_b.student_id, 'booking.proposed', 'The shop proposed another time',
        v_service || ': ' || to_char(p_proposed_starts_at at time zone 'UTC', 'Dy DD Mon, HH24:MI') || '. Accept or decline it.', '/student/bookings');
    else
      raise exception 'action_invalid' using errcode = 'P0001';
  end case;
  perform private.write_audit('booking.' || p_action, 'merchant', 'booking', v_b.id, p_merchant_id => v_b.merchant_id);
end;
$$;

create function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.bookings;
  v_party public.booking_party;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_b.student_id = (select auth.uid()) then v_party := 'student';
  elsif (select private.can_operate_branch(v_b.branch_id)) then v_party := 'merchant';
  else raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_b.status not in ('pending', 'confirmed', 'reschedule_requested') then raise exception 'booking_not_open' using errcode = 'P0001'; end if;
  if char_length(coalesce(p_reason, '')) > 500 then raise exception 'note_too_long' using errcode = 'P0001'; end if;
  update public.bookings set status = 'cancelled', proposed_starts_at = null, proposed_ends_at = null, cancelled_at = now(),
    cancelled_by = (select auth.uid()), cancelled_by_party = v_party, cancel_reason = nullif(btrim(p_reason), '')
  where id = v_b.id;
  perform private.write_audit('booking.cancelled', v_party::text, 'booking', v_b.id, p_merchant_id => v_b.merchant_id);
  if v_party = 'student' then
    perform private.notify_business_team(v_b.merchant_id, 'booking.cancelled', 'Booking cancelled',
      'A student cancelled their booking for ' || to_char(v_b.starts_at at time zone 'UTC', 'Dy DD Mon, HH24:MI') || '.', '/merchant/bookings');
  else
    perform private.notify(v_b.student_id, 'booking.cancelled', 'Booking cancelled',
      'The shop cancelled your booking for ' || to_char(v_b.starts_at at time zone 'UTC', 'Dy DD Mon, HH24:MI') || '.', '/student/bookings');
  end if;
end;
$$;

create function public.mark_booking(p_booking_id uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_b public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.id is null or not (select private.can_operate_branch(v_b.branch_id)) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_b.status <> 'confirmed' then raise exception 'booking_not_open' using errcode = 'P0001'; end if;
  case p_outcome
    when 'completed' then
      if v_b.starts_at > now() then raise exception 'too_early' using errcode = 'P0001'; end if;
      update public.bookings set status = 'completed', completed_at = now() where id = v_b.id;
    when 'no_show' then
      if v_b.starts_at + interval '30 minutes' > now() then raise exception 'too_early' using errcode = 'P0001'; end if;
      update public.bookings set status = 'no_show', no_show_at = now() where id = v_b.id;
    else
      raise exception 'action_invalid' using errcode = 'P0001';
  end case;
  perform private.write_audit('booking.' || p_outcome, 'merchant', 'booking', v_b.id, p_merchant_id => v_b.merchant_id);
end;
$$;

-- A redemption of a deal on the booked service, at that branch, from 2 hours before
-- to 12 hours after the booked time, completes the booking. Added as a trigger so
-- finalize_redemption() itself is unchanged.
create function private.complete_booking_on_redemption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bookings b
  set status = 'completed', completed_at = now(), redemption_id = new.id
  where b.id = (
    select b2.id from public.bookings b2
    join public.offers o on o.id = new.offer_id and o.service_id = b2.service_id
    where b2.student_id = new.student_id and b2.branch_id = new.branch_id and b2.status = 'confirmed'
      and new.redeemed_at between b2.starts_at - interval '2 hours' and b2.starts_at + interval '12 hours'
    order by abs(extract(epoch from (b2.starts_at - new.redeemed_at)))
    limit 1);
  return new;
end;
$$;
create trigger redemptions_complete_booking after insert on public.redemptions
  for each row execute function private.complete_booking_on_redemption();

-- Daily: requests whose time passed without an answer are cancelled by the system.
create function public.close_stale_bookings()
returns int
language sql
security definer
set search_path = ''
as $$
  with closed as (
    update public.bookings
    set status = 'cancelled', proposed_starts_at = null, proposed_ends_at = null, cancelled_at = now(),
        cancelled_by_party = 'system', cancel_reason = 'Not answered before the booked time'
    where (status = 'pending' and starts_at <= now())
       or (status = 'reschedule_requested' and proposed_starts_at <= now())
    returning id
  )
  select count(*)::int from closed;
$$;

-- Reads -----------------------------------------------------------------------------------------

create function private.booking_json(p_b public.bookings)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_b.id, 'status', private.booking_effective_status(p_b.status, p_b.starts_at, p_b.proposed_starts_at),
    'starts_at', p_b.starts_at, 'ends_at', p_b.ends_at,
    'proposed_starts_at', p_b.proposed_starts_at, 'proposed_ends_at', p_b.proposed_ends_at,
    'student_note', p_b.student_note, 'merchant_note', p_b.merchant_note,
    'cancelled_by_party', p_b.cancelled_by_party, 'cancel_reason', p_b.cancel_reason,
    'merchant', jsonb_build_object('id', m.id, 'name', m.display_name, 'slug', m.slug),
    'branch', jsonb_build_object('id', br.id, 'name', br.name, 'area', br.area),
    'service', jsonb_build_object('id', s.id, 'name', s.name, 'duration_minutes', s.duration_minutes),
    'offer', case when o.id is null then null else jsonb_build_object('id', o.id, 'title', o.title) end,
    'redeemed', p_b.redemption_id is not null,
    'created_at', p_b.created_at)
  from public.merchants m, public.merchant_branches br, public.services s
  left join public.offers o on o.id = p_b.offer_id
  where m.id = p_b.merchant_id and br.id = p_b.branch_id and s.id = p_b.service_id;
$$;

create function public.my_bookings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.booking_json(b) order by
           (b.status in ('pending', 'confirmed', 'reschedule_requested') and b.starts_at > now()) desc,
           case when b.starts_at > now() then b.starts_at end asc, b.starts_at desc), '[]'::jsonb)
  from (select * from public.bookings where student_id = (select auth.uid()) order by starts_at desc limit 100) b;
$$;

create function public.merchant_bookings(p_merchant_id uuid, p_scope text default 'upcoming')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.merchant_role(p_merchant_id) is null then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(private.booking_json(b) || jsonb_build_object('student_name', p.full_name)
                     order by case when p_scope = 'past' then null else b.starts_at end asc, b.starts_at desc)
    from (
      select * from public.bookings x
      where x.merchant_id = p_merchant_id and private.can_operate_branch(x.branch_id)
        and case when p_scope = 'past'
                 then x.starts_at <= now() or x.status in ('cancelled', 'completed', 'no_show')
                 else x.status in ('pending', 'confirmed', 'reschedule_requested')
                      and coalesce(x.proposed_starts_at, x.starts_at) > now() - interval '1 day' end
      order by x.starts_at desc limit 200
    ) b
    join public.profiles p on p.id = b.student_id), '[]'::jsonb);
end;
$$;

-- Set-up page for owners and managers: services, branches, weekly hours, closed days.
create function public.booking_setup(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_booking_manager(p_merchant_id);
  return jsonb_build_object(
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'duration_minutes', s.duration_minutes,
                                                             'is_bookable', s.is_bookable) order by s.name)
                          from public.services s where s.merchant_id = p_merchant_id and s.is_active), '[]'::jsonb),
    'branches', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.name)
                          from public.merchant_branches b where b.merchant_id = p_merchant_id and b.is_active), '[]'::jsonb),
    'rules', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'branch_id', r.branch_id, 'service_id', r.service_id,
                                                          'weekday', r.weekday, 'start_time', to_char(r.start_time, 'HH24:MI'),
                                                          'end_time', to_char(r.end_time, 'HH24:MI'), 'slot_minutes', r.slot_minutes,
                                                          'capacity', r.capacity, 'is_active', r.is_active)
                                       order by r.branch_id, r.service_id, r.weekday, r.start_time)
                       from public.branch_availability_rules r where r.merchant_id = p_merchant_id), '[]'::jsonb),
    'exceptions', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'branch_id', e.branch_id, 'service_id', e.service_id,
                                                               'date', e.date, 'is_closed', e.is_closed,
                                                               'start_time', to_char(e.start_time, 'HH24:MI'),
                                                               'end_time', to_char(e.end_time, 'HH24:MI'), 'reason', e.reason)
                                            order by e.date)
                            from public.availability_exceptions e where e.merchant_id = p_merchant_id and e.date >= current_date), '[]'::jsonb));
end;
$$;

-- What a student can book at a shop: bookable services with at least one branch that has hours.
create function public.bookable_services(p_merchant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'name', s.name, 'duration_minutes', s.duration_minutes, 'regular_price', s.regular_price,
           'branches', (select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'area', b.area) order by b.name)
                        from public.merchant_branches b
                        where b.merchant_id = s.merchant_id and b.is_active
                          and exists (select 1 from public.branch_availability_rules r
                                      where r.branch_id = b.id and r.service_id = s.id and r.is_active)))
         order by s.name), '[]'::jsonb)
  from public.services s
  where s.merchant_id = p_merchant_id and s.is_active and s.is_bookable
    and (select auth.uid()) is not null
    and private.merchant_is_listed(p_merchant_id)
    and exists (select 1 from public.branch_availability_rules r join public.merchant_branches b on b.id = r.branch_id
                where r.service_id = s.id and r.is_active and b.is_active);
$$;

-- Grants -----------------------------------------------------------------------------------------

revoke execute on function
  private.booking_slots(uuid, uuid, date, date), private.booking_bookable(uuid, uuid),
  private.booking_free_slot(uuid, uuid, timestamptz), private.lock_booking_slot(uuid, uuid, timestamptz),
  private.booking_effective_status(public.booking_status, timestamptz, timestamptz), private.booking_link(public.bookings, text),
  private.require_booking_manager(uuid), private.complete_booking_on_redemption(), private.booking_json(public.bookings),
  public.set_service_bookable(uuid, boolean),
  public.save_availability_rule(uuid, uuid, uuid, int, time, time, int, int, boolean), public.delete_availability_rule(uuid),
  public.add_availability_exception(uuid, uuid, date, boolean, time, time, text), public.delete_availability_exception(uuid),
  public.get_available_slots(uuid, uuid, date, date),
  public.request_booking(uuid, uuid, timestamptz, uuid, text, uuid), public.respond_to_reschedule(uuid, boolean),
  public.respond_to_booking(uuid, text, timestamptz, text), public.cancel_booking(uuid, text), public.mark_booking(uuid, text),
  public.close_stale_bookings(), public.my_bookings(), public.merchant_bookings(uuid, text), public.booking_setup(uuid),
  public.bookable_services(uuid)
  from public, anon, authenticated, service_role;

grant execute on function
  public.set_service_bookable(uuid, boolean),
  public.save_availability_rule(uuid, uuid, uuid, int, time, time, int, int, boolean), public.delete_availability_rule(uuid),
  public.add_availability_exception(uuid, uuid, date, boolean, time, time, text), public.delete_availability_exception(uuid),
  public.get_available_slots(uuid, uuid, date, date),
  public.request_booking(uuid, uuid, timestamptz, uuid, text, uuid), public.respond_to_reschedule(uuid, boolean),
  public.respond_to_booking(uuid, text, timestamptz, text), public.cancel_booking(uuid, text), public.mark_booking(uuid, text),
  public.my_bookings(), public.merchant_bookings(uuid, text), public.booking_setup(uuid), public.bookable_services(uuid)
  to authenticated;
grant execute on function public.close_stale_bookings() to service_role;
-- The RLS policy above calls these as the signed-in user.
grant execute on function private.can_operate_branch(uuid) to authenticated;
