begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;
create function tests.create_user(p_email text, p_name text default 'Test User')
returns uuid language sql as $$
  insert into auth.users (id, email, raw_user_meta_data)
  values (gen_random_uuid(), p_email, jsonb_build_object('full_name', p_name))
  returning id;
$$;
create function tests.as_user(p_id uuid, p_aal text default 'aal1')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end;
$$;
create function tests.as_postgres()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;
create function tests.verify(p_user uuid, p_until interval default interval '1 year')
returns void language sql as $$
  update public.student_profiles
     set verification_status = 'verified', verified_at = now() - interval '2 years', verified_until = now() + p_until
   where user_id = p_user;
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;
select no_plan();
-- These tests create practice institutions as listed; the accreditation guard has its own tests (020).
select set_config('perqly.seed_pilot', 'on', true);


select id as gctu from public.institutions where slug = 'gctu' \gset
select id as beauty from public.merchant_categories where slug = 'beauty' \gset
select tests.create_user('owner@book.example', 'Abena Owner') as owner \gset
select tests.create_user('cashier@book.example', 'Esi Cashier') as cashier \gset
select tests.create_user('other@book.example', 'Other Owner') as other \gset
select tests.create_user('admin@perqly.example', 'Perqly Admin') as padmin \gset
select tests.create_user('ama@student.example', 'Ama Mensah') as s1 \gset
select tests.create_user('kojo@student.example', 'Kojo Boateng') as s2 \gset
select tests.create_user('new@student.example', 'New Student') as s3 \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin');
select tests.as_user(:'s1'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s2'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s3'); select public.upsert_student_profile(:'gctu');
select tests.as_postgres();
select tests.verify(:'s1'); select tests.verify(:'s2');

select tests.as_user(:'owner', 'aal2');
select public.register_merchant('Book A Cut', :'beauty') as m \gset
select public.upsert_merchant_branch(:'m', null, 'Tesano', null, null, 'Accra', null, 5.6145, -0.2310) as b1 \gset
select public.upsert_merchant_branch(:'m', null, 'Madina') as b2 \gset
select public.add_merchant_user(:'m', 'cashier@book.example', 'cashier', array[:'b1']::uuid[]);
select public.upsert_catalogue_item(:'m', 'service', null, 'Haircut', 80, null, 60) as cut \gset
select public.upsert_catalogue_item(:'m', 'service', null, 'Walk-in shave', 30) as shave \gset
select public.upsert_offer(:'m', null, 'service', :'cut', 'percentage', 20, 'Show your pass') as o1 \gset
select public.sign_merchant_agreement(:'m', 1, 'Abena Owner', 'Owner', 'Book A Cut Ltd', true);
select public.submit_merchant_for_review(:'m');
select tests.as_user(:'padmin', 'aal2'); select public.decide_merchant(:'m', 'approve');
select tests.as_user(:'owner', 'aal2'); select public.submit_offer(:'o1');
select tests.as_user(:'padmin', 'aal2'); select public.moderate_offer(:'o1', 'approve');

select ((current_date + 2) + time '10:00') at time zone 'UTC' as t10 \gset
select ((current_date + 2) + time '11:00') at time zone 'UTC' as t11 \gset
select ((current_date + 2) + time '09:00') at time zone 'UTC' as t09 \gset
select ((current_date + 2) + time '10:30') at time zone 'UTC' as t1030 \gset

-- 1. Privileges -----------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.get_available_slots(uuid, uuid, date, date)', 'execute'), 'anon cannot read slots');
select ok(not has_function_privilege('anon', 'public.request_booking(uuid, uuid, timestamptz, uuid, text, uuid)', 'execute'), 'anon cannot book');
select ok(not has_function_privilege('authenticated', 'public.close_stale_bookings()', 'execute'), 'only the daily job closes stale bookings');
select ok(has_function_privilege('service_role', 'public.close_stale_bookings()', 'execute'), 'the daily job can');
select ok(not has_table_privilege('authenticated', 'public.bookings', 'insert'), 'no direct booking writes');
select ok(not has_table_privilege('authenticated', 'public.branch_availability_rules', 'select'), 'hours are read through functions');

-- 2. Set-up -----------------------------------------------------------------------------------
select tests.as_user(:'cashier', 'aal2');
select throws_ok(format('select public.set_service_bookable(%L, true)', :'cut'), 'P0001', 'forbidden', 'cashiers cannot change what is bookable');
select tests.as_user(:'other', 'aal2');
select throws_ok(format('select public.booking_setup(%L)', :'m'), 'P0001', 'forbidden', 'other shops cannot see the set-up');
select tests.as_user(:'owner', 'aal2');
select lives_ok(format('select public.set_service_bookable(%L, true)', :'cut'), 'the owner makes the haircut bookable');
select throws_ok(format('select public.save_availability_rule(null, %L, %L, 1, ''12:00'', ''09:00'', 60)', :'b1', :'cut'), 'P0001', 'hours_invalid',
  'closing must be after opening');
select throws_ok(format('select public.save_availability_rule(null, %L, %L, 1, ''09:00'', ''12:00'', 2)', :'b1', :'cut'), 'P0001', 'hours_invalid',
  'slots are at least 5 minutes');
select public.save_availability_rule(null, :'b1', :'cut', w, '09:00', '12:00', 60, 1) from generate_series(0, 6) w;
select is(jsonb_array_length(public.booking_setup(:'m') -> 'rules'), 7, 'hours are saved for every day');
select tests.as_postgres();
select is((select count(*)::int from public.audit_logs where action = 'service.bookable'), 1, 'making a service bookable is audited');

-- 3. Slots ------------------------------------------------------------------------------------
select tests.as_user(:'s3');
select is((select count(*)::int from public.get_available_slots(:'b1', :'cut', current_date + 2, current_date + 2)), 3,
  'any signed-in student sees free slots (09:00, 10:00, 11:00)');
select is((select count(*)::int from public.get_available_slots(:'b2', :'cut', current_date + 2, current_date + 2)), 0, 'a branch without hours has none');
select is((select count(*)::int from public.get_available_slots(:'b1', :'shave', current_date + 2, current_date + 2)), 0, 'a walk-in service has none');
select throws_ok(format('select * from public.get_available_slots(%L, %L, current_date, current_date + 40)', :'b1', :'cut'), 'P0001', 'date_invalid',
  'at most a month at a time');
select is(jsonb_array_length(public.bookable_services(:'m')), 1, 'only the haircut is listed as bookable');
select is(public.bookable_services(:'m') -> 0 -> 'branches' -> 0 ->> 'name', 'Tesano', 'with the branch that has hours');
select throws_ok(format('select public.request_booking(%L, %L, %L, null, null, gen_random_uuid())', :'b1', :'cut', :'t10'), 'P0001', 'not_verified',
  'unverified students cannot book');
select tests.as_user(:'owner', 'aal2');
select public.add_availability_exception(:'b1', null, current_date + 2, true, null, null, 'Holiday') as ex1 \gset
select tests.as_user(:'s1');
select is((select count(*)::int from public.get_available_slots(:'b1', :'cut', current_date + 2, current_date + 2)), 0, 'a closed day has no slots');
select tests.as_user(:'owner', 'aal2'); select public.delete_availability_exception(:'ex1');
select public.add_availability_exception(:'b1', :'cut', current_date + 2, false, '10:00', '12:00', 'Late start') as ex2 \gset
select tests.as_user(:'s1');
select is((select count(*)::int from public.get_available_slots(:'b1', :'cut', current_date + 2, current_date + 2)), 2, 'replacement hours change the slots');
select tests.as_user(:'owner', 'aal2'); select public.delete_availability_exception(:'ex2');

-- 4. Requests and capacity --------------------------------------------------------------------
select tests.as_user(:'s1');
select throws_ok(format('select public.request_booking(%L, %L, %L, null, null, gen_random_uuid())', :'b1', :'cut', :'t1030'), 'P0001', 'slot_unavailable',
  'only real slot times can be booked');
select throws_ok(format('select public.request_booking(%L, %L, %L, null, null, gen_random_uuid())', :'b1', :'shave', :'t10'), 'P0001', 'not_bookable',
  'walk-in services cannot be booked');
select gen_random_uuid() as req1 \gset
select public.request_booking(:'b1', :'cut', :'t10', :'o1', 'Short on the sides', :'req1') as bk1 \gset
select is(public.request_booking(:'b1', :'cut', :'t10', :'o1', 'Short on the sides', :'req1'), :'bk1'::uuid, 'the same request returns the same booking');
select is((select count(*)::int from public.get_available_slots(:'b1', :'cut', current_date + 2, current_date + 2) where starts_at = :'t10'), 0,
  'a pending request takes the place');
select tests.as_user(:'s2');
select throws_ok(format('select public.request_booking(%L, %L, %L, null, null, gen_random_uuid())', :'b1', :'cut', :'t10'), 'P0001', 'slot_unavailable',
  'a full slot is refused');
select is((select count(*)::int from public.bookings), 0, 'students cannot read each other''s bookings');
select tests.as_user(:'s1');
select is((select count(*)::int from public.bookings), 1, 'a student reads their own');
select is(public.my_bookings() -> 0 ->> 'status', 'pending', 'and sees it pending');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where kind = 'booking.requested' and user_id in (:'owner', :'cashier')), 2,
  'the owner and the branch cashier are told');
select is((select category from public.notifications where kind = 'booking.requested' limit 1), 'bookings', 'in the Bookings category');
update private.app_settings set value = '1' where key = 'booking.max_open_per_student';
select tests.as_user(:'s1');
select throws_ok(format('select public.request_booking(%L, %L, %L, null, null, gen_random_uuid())', :'b1', :'cut', :'t11'), 'P0001', 'too_many_bookings',
  'the open-booking limit applies');
select tests.as_postgres(); update private.app_settings set value = '5' where key = 'booking.max_open_per_student';

-- 5. The shop answers -------------------------------------------------------------------------
select tests.as_user(:'other', 'aal2');
select throws_ok(format('select public.respond_to_booking(%L, ''confirm'')', :'bk1'), 'P0001', 'not_found', 'other shops cannot answer');
select throws_ok(format('select public.merchant_bookings(%L)', :'m'), 'P0001', 'forbidden', 'or list our bookings');
select tests.as_user(:'cashier', 'aal2');
select is(jsonb_array_length(public.merchant_bookings(:'m')), 1, 'the branch cashier sees the request');
select is(public.merchant_bookings(:'m') -> 0 ->> 'student_name', 'Ama Mensah', 'with the student''s name');
select throws_ok(format('select public.respond_to_booking(%L, ''propose'', %L)', :'bk1', :'t1030'), 'P0001', 'slot_unavailable',
  'a proposed time must be a free slot');
select lives_ok(format('select public.respond_to_booking(%L, ''propose'', %L, %L)', :'bk1', :'t11', 'Can you come at 11?'), 'the cashier proposes 11:00');
select tests.as_user(:'s2');
select throws_ok(format('select public.request_booking(%L, %L, %L, null, null, gen_random_uuid())', :'b1', :'cut', :'t11'), 'P0001', 'slot_unavailable',
  'a proposed time is held');
select is((select count(*)::int from public.get_available_slots(:'b1', :'cut', current_date + 2, current_date + 2) where starts_at = :'t10'), 1,
  'the original time is free again');
select tests.as_user(:'s1');
select is(public.my_bookings() -> 0 ->> 'status', 'reschedule_requested', 'the student sees the proposal');
select lives_ok(format('select public.respond_to_reschedule(%L, true)', :'bk1'), 'and accepts it');
select is((select status::text || ' ' || (starts_at = :'t11'::timestamptz)::text from public.bookings where id = :'bk1'), 'confirmed true',
  'the booking is confirmed at the new time');
select throws_ok(format('select public.respond_to_reschedule(%L, true)', :'bk1'), 'P0001', 'booking_not_open', 'accepting twice is refused');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'s1' and kind = 'booking.proposed'), 1, 'the student was told about the proposal');

-- Reject and cancel paths
select tests.as_user(:'s2');
select public.request_booking(:'b1', :'cut', :'t10', null, null, gen_random_uuid()) as bk2 \gset
select tests.as_user(:'owner', 'aal2');
select lives_ok(format('select public.respond_to_booking(%L, ''reject'', null, %L)', :'bk2', 'Fully booked'), 'the owner rejects a request');
select is((select status::text || ' ' || cancelled_by_party::text from public.bookings where id = :'bk2'), 'cancelled merchant', 'a rejection is a cancellation by the shop');
select tests.as_user(:'s2');
select public.request_booking(:'b1', :'cut', :'t09', null, null, gen_random_uuid()) as bk3 \gset
select lives_ok(format('select public.cancel_booking(%L, %L)', :'bk3', 'Changed my mind'), 'a student cancels');
select throws_ok(format('select public.cancel_booking(%L)', :'bk3'), 'P0001', 'booking_not_open', 'cancelling twice is refused');
select tests.as_user(:'s1');
select throws_ok(format('select public.cancel_booking(%L)', :'bk2'), 'P0001', 'not_found', 'students cannot cancel others'' bookings');

-- 6. Outcomes ---------------------------------------------------------------------------------
select tests.as_user(:'owner', 'aal2');
select throws_ok(format('select public.mark_booking(%L, ''no_show'')', :'bk1'), 'P0001', 'too_early', 'no-show only after the time');
select tests.as_postgres();
update public.bookings set starts_at = now() - interval '1 hour', ends_at = now() where id = :'bk1';
select tests.as_user(:'owner', 'aal2');
select throws_ok(format('select public.mark_booking(%L, ''sold'')', :'bk1'), 'P0001', 'action_invalid', 'unknown outcomes are refused');

-- A redemption of the haircut deal at that branch completes it.
select tests.as_postgres();
select token as t1 from public.merchant_qr_codes where branch_id = :'b1' and status = 'active' \gset
select tests.as_user(:'s1');
select (public.open_redemption_session(:'t1', null, gen_random_uuid(), '{"lat": 5.6146, "lng": -0.2311, "accuracy_m": 20}') ->> 'session_id') as sess \gset
select public.select_redemption_item(:'sess', :'o1');
select tests.as_user(:'cashier', 'aal2'); select public.merchant_confirm_redemption(:'sess', 64);
select tests.as_user(:'s1'); select public.student_confirm_redemption(:'sess');
select tests.as_postgres();
select is((select status::text || ' ' || (redemption_id is not null)::text from public.bookings where id = :'bk1'), 'completed true',
  'redeeming the booked deal completes the booking');

-- Stale requests close
select tests.as_user(:'s2');
select public.request_booking(:'b1', :'cut', :'t10', null, null, gen_random_uuid()) as bk4 \gset
select tests.as_postgres();
update public.bookings set starts_at = now() - interval '10 minutes', ends_at = now() + interval '50 minutes' where id = :'bk4';
select tests.as_user(:'s2');
select is((select b ->> 'status' from jsonb_array_elements(public.my_bookings()) b where b ->> 'id' = :'bk4'), 'expired', 'an unanswered past request shows as expired');
select tests.as_postgres();
set local role service_role;
select is(public.close_stale_bookings(), 1, 'the daily job closes it');
reset role;
select is((select status::text || ' ' || cancelled_by_party::text from public.bookings where id = :'bk4'), 'cancelled system', 'as cancelled by the system');

-- Account deletion
delete from auth.users where id = :'s2';
select is((select count(*)::int from public.bookings where student_id = :'s2'), 0, 'deleting an account removes its bookings');

select * from finish();
rollback;
