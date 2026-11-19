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
select tests.create_user('owner@d.example', 'Abena Owner') as owner \gset
select tests.create_user('cashier@d.example', 'Esi Cashier') as cashier \gset
select tests.create_user('other@d.example', 'Other Owner') as other \gset
select tests.create_user('admin@perqly.example', 'Perqly Admin') as padmin \gset
select tests.create_user('support@perqly.example', 'Perqly Support') as psupport \gset
select tests.create_user('ama@student.example', 'Ama Mensah') as s1 \gset
select tests.create_user('kojo@student.example', 'Kojo Boateng') as s2 \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin'), (:'psupport', 'support');
select tests.as_user(:'s1'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s2'); select public.upsert_student_profile(:'gctu');
select tests.as_postgres(); select tests.verify(:'s1'); select tests.verify(:'s2');

select tests.as_user(:'owner', 'aal2');
select public.register_merchant('Problem Cuts', :'beauty') as m \gset
select public.upsert_merchant_branch(:'m', null, 'Tesano', null, null, 'Accra', null, 5.6145, -0.2310) as b1 \gset
select public.add_merchant_user(:'m', 'cashier@d.example', 'cashier', array[:'b1']::uuid[]);
select public.upsert_catalogue_item(:'m', 'service', null, 'Haircut', 80) as cut \gset
select public.upsert_offer(:'m', null, 'service', :'cut', 'percentage', 20, 'Show your pass') as o1 \gset
select public.sign_merchant_agreement(:'m', 1, 'Abena Owner', 'Owner', 'Problem Cuts Ltd', true);
select public.submit_merchant_for_review(:'m');
select tests.as_user(:'padmin', 'aal2'); select public.decide_merchant(:'m', 'approve');
select tests.as_user(:'owner', 'aal2'); select public.submit_offer(:'o1');
select tests.as_user(:'padmin', 'aal2'); select public.moderate_offer(:'o1', 'approve');
select tests.as_postgres();
select token as t1 from public.merchant_qr_codes where branch_id = :'b1' and status = 'active' \gset
select tests.as_user(:'s1');
select (public.open_redemption_session(:'t1', null, gen_random_uuid(), '{"lat": 5.6146, "lng": -0.2311, "accuracy_m": 20}') ->> 'session_id') as sess \gset
select public.select_redemption_item(:'sess', :'o1');
select tests.as_user(:'cashier', 'aal2'); select public.merchant_confirm_redemption(:'sess', 64);
select tests.as_user(:'s1'); select public.student_confirm_redemption(:'sess');
select tests.as_postgres();
select id as red from public.redemptions where session_id = :'sess' \gset

-- 1. Privileges ---------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.open_dispute(uuid, uuid, text, text)', 'execute'), 'anon cannot report problems');
select ok(not has_table_privilege('authenticated', 'public.disputes', 'select'), 'cases are read through functions only');
select ok(not has_function_privilege('authenticated', 'private.dispute_json(public.disputes, boolean)', 'execute'), 'the case view is internal');

-- 2. Opening ------------------------------------------------------------------------------------
select tests.as_user(:'s2');
select throws_ok(format('select public.open_dispute(%L, null, ''wrong_price'', %L)', :'red', 'They charged me full price.'), 'P0001', 'not_found',
  'students cannot report on someone else''s redemption');
select tests.as_user(:'s1');
select throws_ok(format('select public.open_dispute(%L, null, ''not_a_student'', %L)', :'red', 'Something went wrong here.'), 'P0001', 'reason_invalid',
  'students can''t pick a shop-only reason');
select throws_ok(format('select public.open_dispute(%L, null, ''wrong_price'', %L)', :'red', 'short'), 'P0001', 'details_invalid', 'a few words of detail are needed');
select throws_ok(format('select public.open_dispute(null, null, ''other'', %L)', 'Something went wrong here.'), 'P0001', 'subject_required', 'a case is about something');
select public.open_dispute(:'red', null, 'wrong_price', 'The cashier charged me GHS 80, not 64.') as d1 \gset
select throws_ok(format('select public.open_dispute(%L, null, ''other'', %L)', :'red', 'Reporting the same thing again.'), 'P0001', 'dispute_already_open',
  'one open case per side');
select is(jsonb_array_length(public.my_disputes()), 1, 'the student sees their case');
select is(public.my_disputes() -> 0 -> 'redemption' ->> 'transaction_ref', (select transaction_ref from public.redemptions where id = :'red'), 'with the redemption');
select tests.as_user(:'other', 'aal2');
select throws_ok(format('select public.open_dispute(%L, null, ''other'', %L)', :'red', 'Not our redemption at all.'), 'P0001', 'not_found',
  'another business cannot report on it');
select tests.as_user(:'cashier', 'aal2');
select public.open_dispute(:'red', null, 'left_without_paying', 'The student left before paying GHS 64.') as d2 \gset
select is(jsonb_array_length(public.my_disputes(:'m')), 1, 'the cashier sees the case they opened');
select tests.as_user(:'owner', 'aal2');
select is(jsonb_array_length(public.my_disputes(:'m')), 1, 'the owner sees the business''s cases');
select is(public.get_dispute(:'d1'), null, 'but not the student''s case');
select tests.as_user(:'s2');
select is(public.get_dispute(:'d1'), null, 'other students see nothing');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where kind = 'review.dispute' and user_id = :'psupport'), 2, 'support is told about each case');
select is((select count(*)::int from public.audit_logs where action = 'dispute.opened'), 2, 'opening is audited');

-- 3. Support -----------------------------------------------------------------------------------
select tests.as_user(:'s1');
select throws_ok('select public.list_disputes()', 'P0001', 'forbidden', 'students cannot list cases');
select tests.as_user(:'psupport', 'aal1');
select throws_ok('select public.list_disputes()', 'P0001', 'forbidden', 'support needs two-factor');
select tests.as_user(:'psupport', 'aal2');
select is(jsonb_array_length(public.list_disputes('open')), 2, 'support lists open cases');
select is(public.get_dispute(:'d1') ->> 'opened_by_name', 'Ama Mensah', 'support sees who opened it');
select lives_ok(format('select public.add_dispute_note(%L, %L, true)', :'d1', 'Checked CCTV request with the shop.'), 'support writes an internal note');
select lives_ok(format('select public.add_dispute_note(%L, %L)', :'d1', 'We are looking into it. Do you have a receipt?'), 'and a reply');
select lives_ok(format('select public.set_dispute_status(%L, ''investigating'')', :'d1'), 'and starts investigating');
select throws_ok(format('select public.set_dispute_status(%L, ''resolved'')', :'d1'), 'P0001', 'resolution_required', 'resolving needs a reason');
select tests.as_user(:'s1');
select is(jsonb_array_length(public.get_dispute(:'d1') -> 'events'), 3, 'the student sees opening, the reply and the status (not the internal note)');
select is(public.get_dispute(:'d1') ->> 'opened_by_name', null, 'and no staff details');
select lives_ok(format('select public.add_dispute_note(%L, %L)', :'d1', 'Yes, I have a MoMo receipt for GHS 80.'), 'the student replies');
select throws_ok(format('select public.add_dispute_note(%L, %L, true)', :'d1', 'sneaky'), 'P0001', 'forbidden', 'students can''t write internal notes');
select throws_ok(format('select public.set_dispute_status(%L, ''resolved'', %L)', :'d1', 'I resolve it myself'), 'P0001', 'forbidden', 'or close the case');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'s1' and kind = 'account.dispute'), 1, 'the student was told support replied');
select is((select count(*)::int from public.notifications where user_id = :'psupport' and kind = 'review.dispute'), 3, 'support''s assignee is told about the student''s reply');
select tests.as_user(:'psupport', 'aal2');
select public.void_redemption(:'red', 'Overcharged; refund agreed with the shop.');
select lives_ok(format('select public.set_dispute_status(%L, ''resolved'', %L)', :'d1', 'The shop refunded GHS 16 and the redemption was voided.'), 'support resolves it');
select lives_ok(format('select public.set_dispute_status(%L, ''dismissed'', %L)', :'d2', 'The student paid; the shop confirmed.'), 'and dismisses the other');
select tests.as_user(:'s1');
select is(public.get_dispute(:'d1') ->> 'status', 'resolved', 'the student sees it resolved');
select is((public.get_dispute(:'d1') -> 'redemption' ->> 'voided'), 'true', 'with the redemption voided');
select throws_ok(format('select public.add_dispute_note(%L, %L)', :'d1', 'thanks'), 'P0001', 'dispute_closed', 'closed cases take no more notes');
select tests.as_postgres();
select is((select count(*)::int from public.audit_logs where action in ('dispute.resolved', 'dispute.dismissed', 'dispute.investigating')), 3,
  'status changes are audited');

-- 4. Bookings and deletion ------------------------------------------------------------------------
select tests.as_user(:'owner', 'aal2'); select public.set_service_bookable(:'cut', true);
select public.save_availability_rule(null, :'b1', :'cut', w, '09:00', '12:00', 60, 1) from generate_series(0, 6) w;
select tests.as_user(:'s2');
select public.request_booking(:'b1', :'cut', ((current_date + 2) + time '10:00') at time zone 'UTC', null, null, gen_random_uuid()) as bk \gset
select lives_ok(format('select public.open_dispute(null, %L, ''booking_problem'', %L)', :'bk', 'The shop never answered my request.'), 'a booking can be reported');
select tests.as_postgres();
delete from auth.users where id = :'s2';
select is((select count(*)::int from public.disputes where opened_by_party = 'student' and opened_by is null and status = 'open'), 1,
  'a deleted student''s case stays for support, without the person');

select * from finish();
rollback;
