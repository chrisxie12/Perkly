-- When a student price runs.
--
-- A business can run a deal every day (the default) or on chosen days and times, such as
-- Tuesdays and Thursdays from 14:00 to 17:00. Outside those times the deal stays visible,
-- labelled with its times, but can't be redeemed. Times are Ghana time (Africa/Accra).
--
-- run_days: ISO weekdays, 1 = Monday ... 7 = Sunday; null = every day.
-- run_from / run_until: a time range within the day; both null = all day.
-- Changing the times doesn't touch the price, so it works on a live offer without review.

alter table public.offers
  add column run_days smallint[],
  add column run_from time,
  add column run_until time,
  add constraint offers_run_days check (
    run_days is null
    or (cardinality(run_days) between 1 and 7 and run_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
  ),
  add constraint offers_run_times check (
    (run_from is null and run_until is null)
    or (run_from is not null and run_until is not null and run_until > run_from)
  );

-- Whether an offer's times include a moment (Ghana time).
create function private.offer_runs_at(p_offer_id uuid, p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.offers o
    cross join lateral (select p_at at time zone 'Africa/Accra' as t) g
    where o.id = p_offer_id
      and (o.run_days is null or extract(isodow from g.t)::smallint = any (o.run_days))
      and (o.run_from is null or (g.t::time >= o.run_from and g.t::time < o.run_until))
  );
$$;

create function private.offer_running_now(p_offer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.offer_runs_at(p_offer_id, now());
$$;

-- A deal can be redeemed only while it's running. (Visibility is unchanged: students still
-- see the deal and its times.)
create or replace function private.offer_redeemable_at(p_offer_id uuid, p_branch_id uuid, p_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.offer_is_live(p_offer_id, p_institution_id)
     and private.offer_running_now(p_offer_id)
     and exists (
       select 1 from public.offers o join public.merchant_branches b on b.merchant_id = o.merchant_id
       where o.id = p_offer_id and b.id = p_branch_id and b.is_active
         and (not exists (select 1 from public.offer_branches ob where ob.offer_id = o.id)
              or exists (select 1 from public.offer_branches ob where ob.offer_id = o.id and ob.branch_id = b.id)));
$$;

-- A booking that links a deal needs the deal to run at the booked time, not right now.
create or replace function public.request_booking(p_branch_id uuid, p_service_id uuid, p_starts_at timestamptz, p_offer_id uuid,
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
      and private.offer_is_live(p_offer_id, private.my_institution())
      and private.offer_runs_at(p_offer_id, p_starts_at)
      and exists (select 1 from public.merchant_branches b where b.id = p_branch_id and b.merchant_id = o.merchant_id and b.is_active
                  and (not exists (select 1 from public.offer_branches ob where ob.offer_id = o.id)
                       or exists (select 1 from public.offer_branches ob where ob.offer_id = o.id and ob.branch_id = b.id)))) then
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


-- Set when a deal runs. Owners and managers, any status but archived.
create function public.set_offer_run_times(p_offer_id uuid, p_days smallint[], p_from time, p_until time)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers;
  v_days smallint[];
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if v_offer.id is null or not (select private.can_manage_merchant(v_offer.merchant_id)) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_offer.status = 'archived' then raise exception 'offer_not_editable' using errcode = 'P0001'; end if;

  -- Sorted, without repeats; all seven days is the same as every day.
  select array_agg(distinct d order by d) into v_days from unnest(coalesce(p_days, '{}'::smallint[])) d;
  if p_days is not null and (v_days is null or not v_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]) then
    raise exception 'run_days_invalid' using errcode = 'P0001';
  end if;
  if cardinality(v_days) = 7 then v_days := null; end if;
  if (p_from is null) <> (p_until is null) or (p_from is not null and p_until <= p_from) then
    raise exception 'run_times_invalid' using errcode = 'P0001';
  end if;

  update public.offers set run_days = v_days, run_from = p_from, run_until = p_until where id = p_offer_id;
  perform private.write_audit('offer.run_times_set', 'merchant:manager', 'offer', p_offer_id,
    jsonb_build_object('days', v_offer.run_days, 'from', v_offer.run_from, 'until', v_offer.run_until),
    jsonb_build_object('days', v_days, 'from', p_from, 'until', p_until), '{}'::jsonb, null, v_offer.merchant_id);
end;
$$;

-- Run times of live deals, for the student app (like offer_published_dates).
create function public.offer_run_times(p_offer_ids uuid[])
returns table (offer_id uuid, run_days smallint[], run_from time, run_until time, running_now boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.run_days, o.run_from, o.run_until, private.offer_running_now(o.id)
  from public.offers o
  where (select auth.uid()) is not null
    and o.status = 'active'
    and o.id = any ((coalesce(p_offer_ids, '{}'::uuid[]))[1:200]);
$$;

revoke execute on function private.offer_runs_at(uuid, timestamptz), private.offer_running_now(uuid), public.set_offer_run_times(uuid, smallint[], time, time),
  public.offer_run_times(uuid[]) from public, anon;
grant execute on function private.offer_runs_at(uuid, timestamptz), private.offer_running_now(uuid) to authenticated;
grant execute on function public.set_offer_run_times(uuid, smallint[], time, time), public.offer_run_times(uuid[]) to authenticated;
