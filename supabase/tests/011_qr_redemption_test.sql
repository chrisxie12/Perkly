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
select plan(83);
-- These tests create practice institutions as listed; the accreditation guard has its own tests (020).
select set_config('perqly.seed_pilot', 'on', true);

select id as gctu from public.institutions where slug = 'gctu' \gset
insert into public.institutions (slug, name, short_name, status) values ('test-u', 'Test University', 'TU', 'pilot') returning id as testu \gset
select id as beauty from public.merchant_categories where slug = 'beauty' \gset
select tests.create_user('owner@shop.example', 'Abena Owner') as owner \gset
select tests.create_user('cashier@shop.example', 'Esi Cashier') as cashier \gset
select tests.create_user('cashier2@shop.example', 'Yaw Cashier') as cashier2 \gset
select tests.create_user('admin@perqly.example', 'Perqly Admin') as padmin \gset
select tests.create_user('ama@student.example', 'Ama Mensah') as s1 \gset
select tests.create_user('kojo@student.example', 'Kojo Boateng') as s2 \gset
select tests.create_user('new@student.example', 'New Student') as s3 \gset
select tests.create_user('old@student.example', 'Old Student') as s4 \gset
select tests.create_user('banned@student.example', 'Banned Student') as s5 \gset
select tests.create_user('guess@student.example', 'Guessing Student') as s6 \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin');
select tests.as_user(:'s1'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s2'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s3'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s4'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s5'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s6'); select public.upsert_student_profile(:'gctu');
select tests.as_postgres();
select tests.verify(:'s1'); select tests.verify(:'s2'); select tests.verify(:'s5');
select tests.verify(:'s4', interval '-1 day');
update public.profiles set is_suspended = true where id = :'s5';

-- Fixture: an approved barber with two branches, two cashiers and four offers.
select tests.as_user(:'owner', 'aal2');
select public.register_merchant('Fresh Fade Barbers', :'beauty') as m \gset
select public.upsert_merchant_branch(:'m', null, 'Tesano', null, null, 'Accra', null, 5.6145, -0.2310) as b1 \gset
select public.upsert_merchant_branch(:'m', null, 'Madina') as b2 \gset
select public.add_merchant_user(:'m', 'cashier@shop.example', 'cashier', array[:'b1']::uuid[]);
select public.add_merchant_user(:'m', 'cashier2@shop.example', 'cashier', array[:'b2']::uuid[]);
select public.upsert_catalogue_item(:'m', 'service', null, 'Haircut and beard trim', 80) as cut \gset
select public.upsert_catalogue_item(:'m', 'product', null, 'Printing, 50 pages', 30) as print \gset
select public.upsert_offer(:'m', null, 'service', :'cut', 'percentage', 20, 'Show your pass') as o1 \gset
select public.upsert_offer(:'m', null, 'product', :'print', 'fixed_price', 25, 'Show your pass', null, null, null, null, 5, 'day', 1) as o2 \gset
select public.upsert_offer(:'m', null, 'service', :'cut', 'fixed_amount', 10, 'Madina only', 'Madina special', null, null, null, 1, 'month', null,
  '{}'::uuid[], array[:'b2']::uuid[]) as o3 \gset
select public.upsert_offer(:'m', null, 'service', :'cut', 'fixed_amount', 5, 'TU only', 'TU special', null, null, null, 1, 'month', null,
  array[:'testu']::uuid[]) as o4 \gset
select tests.as_postgres();
select is((select count(*)::int from public.merchant_qr_codes where merchant_id = :'m'), 0, 'a business gets no codes before approval');
select tests.as_user(:'owner', 'aal2'); select public.sign_merchant_agreement(:'m', 1, 'Abena Owner', 'Owner', 'Fresh Fade Ltd', true);
select public.submit_merchant_for_review(:'m');
select tests.as_user(:'padmin', 'aal2'); select public.decide_merchant(:'m', 'approve');
select tests.as_user(:'owner', 'aal2');
select public.submit_offer(:'o1'); select public.submit_offer(:'o2'); select public.submit_offer(:'o3'); select public.submit_offer(:'o4');
select tests.as_user(:'padmin', 'aal2');
select public.moderate_offer(:'o1', 'approve'); select public.moderate_offer(:'o2', 'approve'); select public.moderate_offer(:'o3', 'approve');

-- 1. Codes --------------------------------------------------------------------------------
select tests.as_postgres();
select is((select count(*)::int from public.merchant_qr_codes where merchant_id = :'m' and status = 'active'), 2, 'approval issues one code per active branch');
select token as t1, short_code as c1, id as q1 from public.merchant_qr_codes where branch_id = :'b1' and status = 'active' \gset
select token as t2 from public.merchant_qr_codes where branch_id = :'b2' and status = 'active' \gset
select ok(:'t1' ~ '^[A-Za-z0-9_-]{22}$' and :'c1' ~ '^[0-9A-HJKMNP-TV-Z]{8}$', 'tokens are 22 base64url characters and short codes 8 Crockford characters');
select throws_ok(format('insert into public.merchant_qr_codes (branch_id, merchant_id, token, short_code) values (%L, %L, %L, %L)',
  :'b1', :'m', 'AAAAAAAAAAAAAAAAAAAAAA', 'ABCDEFGH'), '23505', null, 'a branch can have only one active code');
select tests.as_user(:'cashier');
select is((select count(*)::int from public.merchant_qr_codes), 0, 'cashiers cannot read the printable codes');
select throws_ok(format('select * from public.get_branch_codes(%L)', :'m'), 'P0001', 'forbidden', 'cashiers cannot list codes');
select tests.as_user(:'owner', 'aal2');
select is((select count(*)::int from public.get_branch_codes(:'m') where token is not null), 2, 'the owner sees both branch codes');

-- 2. Who can open a session -------------------------------------------------------------
select tests.as_user(:'s3');
select is(public.open_redemption_session(:'t1', null, gen_random_uuid()) ->> 'error', 'not_verified', 'an unverified student cannot open a session');
select tests.as_user(:'s4');
select is(public.open_redemption_session(:'t1', null, gen_random_uuid()) ->> 'error', 'verification_expired', 'an expired verification cannot open a session');
select tests.as_user(:'s5');
select is(public.open_redemption_session(:'t1', null, gen_random_uuid()) ->> 'error', 'account_suspended', 'a suspended student cannot open a session');
select tests.as_user(:'s1');
select is(public.open_redemption_session('AAAAAAAAAAAAAAAAAAAAAA', null, gen_random_uuid()) ->> 'error', 'qr_invalid', 'an unknown token is qr_invalid');
select is(public.open_redemption_session('not a token', null, gen_random_uuid()) ->> 'error', 'qr_invalid', 'a malformed token is qr_invalid');

-- 3. Opening, idempotency and resume ---------------------------------------------------
select '11111111-1111-4111-8111-111111111111' as req1 \gset
select (public.open_redemption_session(:'t1', null, :'req1', '{"lat": 5.6146, "lng": -0.2311, "accuracy_m": 20}') ->> 'session_id') as sess1 \gset
select tests.as_postgres();
select is((select status::text || '/' || location_signal from public.redemption_sessions where id = :'sess1'), 'open/near', 'a valid scan opens a session and records only a distance signal');
select tests.as_user(:'s1');
select is(public.open_redemption_session(:'t1', null, :'req1') ->> 'session_id', :'sess1', 'the same request returns the same session');
select is(public.open_redemption_session(null, lower(:'c1'), gen_random_uuid()) ->> 'session_id', :'sess1', 'a new scan at the same branch resumes the live session, by short code too');
select is(public.open_redemption_session(:'t2', null, gen_random_uuid()) ->> 'error', 'session_in_progress', 'a scan at another branch is refused while a session is live');
select is((public.get_redemption_session(:'sess1') -> 'offers') @> jsonb_build_array(jsonb_build_object('offer_id', :'o1')), true, 'the session lists the branch''s offers');

-- 4. Selecting: eligibility is re-checked and the server prices it ---------------------
select is(public.select_redemption_item(:'sess1', :'o3') ->> 'error', 'offer_unavailable', 'an offer for another branch cannot be selected');
select is(public.select_redemption_item(:'sess1', :'o4') ->> 'error', 'offer_unavailable', 'an offer for another institution cannot be selected');
select is(public.select_redemption_item(:'sess1', gen_random_uuid()) ->> 'error', 'offer_unavailable', 'an unknown offer cannot be selected');
select is(public.select_redemption_item(:'sess1', :'o1') ->> 'ok', 'true', 'a live offer can be selected');
select is((select regular_price || '/' || discount_amount || '/' || final_price || '/' || status from public.redemption_sessions where id = :'sess1'),
  '80.00/16.00/64.00/awaiting_merchant', 'the snapshot holds the server''s price');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('select_redemption_item', 'student_confirm_redemption', 'open_redemption_session')
    and pg_get_function_arguments(p.oid) ~ 'price'), 'student-side functions take no price parameter');

-- Pass photo: stored by the student, visible to the counter only during a live pass.
select tests.as_postgres();
insert into storage.objects (bucket_id, name, owner) values ('pass-photos', :'s1' || '/pass.webp', :'s1');
select tests.as_user(:'s1');
select lives_ok(format('select public.set_pass_photo(%L)', :'s1' || '/pass.webp'), 'a student records their own pass photo');
select throws_ok(format('select public.set_pass_photo(%L)', :'s2' || '/pass.webp'), 'P0001', 'path_invalid', 'nobody can point at another student''s photo');
select tests.as_user(:'cashier');
select is((select count(*)::int from public.counter_pass_photos(:'m')), 1, 'the counter gets the photo of a live pass');
select is((select count(*)::int from storage.objects where bucket_id = 'pass-photos'), 1, 'branch staff can read the photo while the pass is live');
select tests.as_user(:'cashier2');
select is((select count(*)::int from storage.objects where bucket_id = 'pass-photos'), 0, 'staff of another branch cannot');
select tests.as_user(:'s2');
select is((select count(*)::int from storage.objects where bucket_id = 'pass-photos'), 0, 'other students cannot');

-- 5. Counter and merchant confirmation -------------------------------------------------
select tests.as_user(:'cashier');
select is((select student_first_name || '/' || (pass_code ~ '^[0-9]{4}$')::text from public.list_counter_sessions(:'m') where session_id = :'sess1'), 'Ama/true',
  'the branch cashier sees the student''s first name and pass code');
select tests.as_user(:'cashier2');
select is((select count(*)::int from public.list_counter_sessions(:'m')), 0, 'a cashier of another branch sees nothing');
select is((select count(*)::int from public.redemption_sessions where id = :'sess1'), 0, 'and cannot read the session row');
select is(public.merchant_confirm_redemption(:'sess1', 64) ->> 'error', 'forbidden', 'a cashier of another branch cannot confirm');
select tests.as_user(:'s1');
select is(public.student_confirm_redemption(:'sess1') ->> 'error', 'awaiting_merchant', 'the student cannot confirm before the merchant');
select is(public.merchant_confirm_redemption(:'sess1', 64) ->> 'error', 'forbidden', 'a student cannot call the merchant functions');
select tests.as_user(:'cashier');
select is(public.merchant_confirm_redemption(:'sess1', 70) ->> 'error', 'session_changed', 'a stale price on the counter screen is refused');
select is(public.merchant_confirm_redemption(:'sess1', 64) ->> 'ok', 'true', 'the branch cashier confirms');
select is(public.merchant_confirm_redemption(:'sess1', 64) ->> 'already', 'true', 'a repeat confirmation by the same cashier is a no-op');
select tests.as_user(:'owner', 'aal2');
select is(public.merchant_confirm_redemption(:'sess1', 64) ->> 'error', 'already_confirmed', 'another staff member gets already_confirmed');
select tests.as_user(:'s1');
select is(public.select_redemption_item(:'sess1', :'o2') ->> 'error', 'session_locked', 'the item cannot change after the merchant confirms');

-- 6. Student confirmation finalises once ------------------------------------------------
select is(public.student_confirm_redemption(:'sess1') ->> 'ok', 'true', 'the student confirms');
select is(public.student_confirm_redemption(:'sess1') ->> 'already', 'true', 'a second confirmation changes nothing');
select tests.as_postgres();
select is((select count(*)::int from public.redemptions where session_id = :'sess1'), 1, 'exactly one redemption is written');
select is((select total_saved || '/' || total_spent_at_student_price || '/' || redemption_count from public.student_savings where student_id = :'s1'),
  '16.00/64.00/1', 'the student''s savings are updated');
select is((select redemption_count from public.offers where id = :'o1'), 1, 'the offer count goes up');
select is((select status::text from public.redemption_sessions where id = :'sess1'), 'completed', 'the session is completed');
select is((select count(*)::int from public.notifications where kind = 'redemption.completed'), 2, 'the student and the cashier are notified');
select is((select string_agg(action, ',' order by id) from public.audit_logs where entity_id in (:'sess1', (select id from public.redemptions where session_id = :'sess1'))),
  'redemption.session_opened,redemption.item_selected,redemption.merchant_confirmed,redemption.completed', 'each step is audited');
select ok(not exists (select 1 from public.audit_logs where (coalesce(metadata, '{}') || coalesce(after, '{}'))::text like '%' || :'t1' || '%'),
  'no audit row contains a token');

select tests.as_user(:'cashier');
select is((public.counter_today(:'m') ->> 'students')::int, 1, 'the counter counts today''s students');
select is((public.counter_today(:'m') -> 'recent' -> 0 ->> 'first_name'), 'Ama', 'today''s outcomes show first names only');
select tests.as_user(:'s1');
select throws_ok(format('select public.counter_today(%L)', :'m'), 'P0001', 'forbidden', 'students cannot read the counter');
select tests.as_postgres();

-- 7. Final states and immutability ------------------------------------------------------
select throws_ok(format('update public.redemption_sessions set status = %L where id = %L', 'open', :'sess1'), 'P0001', 'session_final',
  'a completed session cannot change state');
select throws_ok(format('update public.redemptions set final_price = 1 where session_id = %L', :'sess1'), 'P0001', 'redemptions_are_final',
  'a redemption''s amounts cannot change');
select throws_ok(format('delete from public.redemptions where session_id = %L', :'sess1'), 'P0001', 'redemptions_are_final', 'a redemption cannot be deleted');
select tests.as_user(:'s1');
select throws_ok(format('update public.redemptions set final_price = 1 where session_id = %L', :'sess1'), '42501', null, 'students cannot write redemptions');
select is(public.cancel_redemption_session(:'sess1') ->> 'error', 'session_locked', 'a completed session cannot be cancelled');

-- 8. Limits and the total cap ------------------------------------------------------------
select (public.open_redemption_session(:'t1', null, gen_random_uuid()) ->> 'session_id') as sess2 \gset
select is(public.select_redemption_item(:'sess2', :'o1') ->> 'error', 'limit_reached', 'the second use within the month is refused');
select is(public.select_redemption_item(:'sess2', :'o2') ->> 'ok', 'true', 'another offer can still be selected');
select tests.as_user(:'s2');
select (public.open_redemption_session(:'t1', null, gen_random_uuid()) ->> 'session_id') as sess3 \gset
select public.select_redemption_item(:'sess3', :'o2');
select tests.as_user(:'cashier');
select public.merchant_confirm_redemption(:'sess2', 25); select public.merchant_confirm_redemption(:'sess3', 25);
select tests.as_user(:'s1');
select is(public.student_confirm_redemption(:'sess2') ->> 'ok', 'true', 'the first student takes the last capped unit');
select tests.as_user(:'s2');
select is(public.student_confirm_redemption(:'sess3') ->> 'error', 'offer_unavailable', 'the second student is refused once the cap is reached');
select tests.as_postgres();
select is((select status::text || '/' || redemption_count from public.offers where id = :'o2'), 'expired/1', 'a capped offer ends when it is used up');

-- 9. Expiry -----------------------------------------------------------------------------
update public.redemption_sessions set expires_at = now() - interval '1 second' where id = :'sess3';
select tests.as_user(:'s2');
select is(public.student_confirm_redemption(:'sess3') ->> 'error', 'session_expired', 'a session past its time cannot be confirmed, before any job runs');
select tests.as_postgres();
select is((select status::text from public.redemption_sessions where id = :'sess3'), 'expired', 'and is marked expired');
select is(private.uses_in_period(:'s2', :'o2'), 1, 'a session the merchant confirmed but the student didn''t counts toward the limit');
select is((select count(*)::int from public.audit_logs where action = 'redemption.expired' and entity_id = :'sess3'), 1, 'that expiry is audited');

-- 10. Rejection --------------------------------------------------------------------------
select tests.as_user(:'s2');
select (public.open_redemption_session(:'t1', null, gen_random_uuid()) ->> 'session_id') as sess4 \gset
select public.select_redemption_item(:'sess4', :'o1');
select tests.as_user(:'cashier');
select is(public.merchant_reject_redemption(:'sess4', 'other') ->> 'error', 'reason_required', '"other" needs a note');
select is(public.merchant_reject_redemption(:'sess4', 'wrong_item') ->> 'ok', 'true', 'the cashier can decline with a reason');
select tests.as_user(:'s2');
select is(public.get_redemption_session(:'sess4') ->> 'status', 'rejected', 'the student sees the decline');
select tests.as_user(:'s1');
select is(public.get_redemption_session(:'sess4'), null, 'another student cannot read the session');

-- 11. Reissue ---------------------------------------------------------------------------
select tests.as_user(:'cashier');
select throws_ok(format('select public.reissue_branch_qr(%L, %L)', :'b1', 'Photo leaked'), 'P0001', 'forbidden', 'cashiers cannot reissue codes');
select tests.as_user(:'owner', 'aal2');
select public.reissue_branch_qr(:'b1', 'Photo leaked');
select tests.as_postgres();
select is((select max(version) from public.merchant_qr_codes where branch_id = :'b1' and status = 'active'), 2, 'reissue makes version 2');
select tests.as_user(:'s2');
select is(public.open_redemption_session(:'t1', null, gen_random_uuid()) ->> 'error', 'qr_invalid', 'the revoked code is refused like an unknown one');

-- 12. Rate limits -----------------------------------------------------------------------
select tests.as_user(:'s6');
select public.open_redemption_session(null, 'ZZZZZZZZ', gen_random_uuid()) from generate_series(1, 5);
select is(public.open_redemption_session(null, 'ZZZZZZZZ', gen_random_uuid()) ->> 'error', 'rate_limited', 'the sixth short-code attempt in 10 minutes is refused');

-- 13. Payment note and void -------------------------------------------------------------
select tests.as_postgres();
select id as r1 from public.redemptions where session_id = :'sess1' \gset
select tests.as_user(:'s1');
select throws_ok(format('select public.record_payment(%L, %L, %L)', :'r1', 'mtn_momo', 'paid'), 'P0001', 'forbidden', 'students cannot record payment');
select tests.as_user(:'cashier');
select lives_ok(format('select public.record_payment(%L, %L, %L)', :'r1', 'mtn_momo', 'paid'), 'the cashier records how the student paid');
select tests.as_user(:'padmin', 'aal2');
select lives_ok(format('select public.void_redemption(%L, %L)', :'r1', 'Dispute upheld'), 'support voids a redemption');
select throws_ok(format('select public.void_redemption(%L, %L)', :'r1', 'Dispute upheld'), 'P0001', 'redemption_voided', 'a redemption is voided once');
select tests.as_postgres();
select is((select total_saved || '/' || redemption_count from public.student_savings where student_id = :'s1'), '5.00/1', 'voiding restores the student''s savings');
select is((select redemption_count from public.offers where id = :'o1'), 0, 'and the offer count');
select is(private.uses_in_period(:'s1', :'o1'), 0, 'a voided redemption no longer counts toward the limit');

-- 14. Housekeeping ----------------------------------------------------------------------
update public.redemption_sessions set expires_at = now() - interval '1 second' where status in ('open', 'awaiting_merchant', 'awaiting_student');
set local role service_role;
select ok(public.expire_redemption_sessions() >= 0, 'the expiry job runs as the service role');
reset role;
select is((select count(*)::int from public.redemption_sessions where status in ('open', 'awaiting_merchant', 'awaiting_student')), 0, 'and leaves no stale live session');

select * from finish();
rollback;
