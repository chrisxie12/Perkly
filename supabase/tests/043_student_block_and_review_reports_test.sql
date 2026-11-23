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
create function tests.verify(p_user uuid)
returns void language sql as $$
  update public.student_profiles
     set verification_status = 'verified', verified_at = now(), verified_until = now() + interval '1 year'
   where user_id = p_user;
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;
select no_plan();
select set_config('perqly.seed_pilot', 'on', true);
select id as gctu from public.institutions where slug = 'gctu' \gset
select id as food from public.merchant_categories where slug = 'food' \gset
select tests.create_user('owner@mod.example', 'Abena Owner') as owner \gset
select tests.create_user('admin@mod.example', 'Perqly Admin') as padmin \gset
select tests.create_user('ama@mod.example', 'Ama Mensah') as ama \gset
select tests.create_user('kojo@mod.example', 'Kojo Boateng') as kojo \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin');
select tests.as_user(:'ama'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'kojo'); select public.upsert_student_profile(:'gctu');
select tests.as_postgres(); select tests.verify(:'ama'); select tests.verify(:'kojo');

select tests.as_user(:'owner', 'aal2');
select public.register_merchant('Moderation Chop Bar', :'food') as m \gset
select public.upsert_merchant_branch(:'m', null, 'Tesano', null, 'Tesano', 'Accra', null, 5.6150, -0.2320) as b \gset
select public.sign_merchant_agreement(:'m', 1, 'Abena Owner', 'Owner', 'Moderation Chop Ltd', true);
select public.submit_merchant_for_review(:'m');
select tests.as_user(:'padmin', 'aal2'); select public.decide_merchant(:'m', 'approve');

-- Ama's footprint: a shop chat with a photo from each side, a rating, a saved shop,
-- a friend, a push device, a pass photo and a verification photo.
select tests.as_user(:'ama');
select public.start_conversation(:'m') as c \gset

select tests.as_user(:'ama');
select public.start_conversation(:'m') as c \gset
select public.send_message(:'c', 'Hello');
select tests.as_user(:'kojo');
select public.start_conversation(:'m') as c2 \gset

-- 1. A student blocks the business ------------------------------------------------------
select tests.as_user(:'owner', 'aal2');
select throws_ok(format('select public.student_set_business_blocked(%L, true)', :'c'), 'P0001', 'forbidden',
  'the business cannot use the student block');
select tests.as_user(:'kojo');
select throws_ok(format('select public.student_set_business_blocked(%L, true)', :'c'), 'P0001', 'forbidden',
  'another student cannot block someone else''s chat');
select tests.as_user(:'ama');
select lives_ok(format('select public.student_set_business_blocked(%L, true)', :'c'), 'the student blocks the business');
select is((public.get_conversation(:'c') ->> 'blocked_by_student')::boolean, true, 'the chat says so to the student');
select tests.as_user(:'owner', 'aal2');
select is((public.get_conversation(:'c') ->> 'blocked_by_student')::boolean, true, 'and to the business');
select tests.as_postgres(); delete from public.notifications where user_id = :'ama';
select tests.as_user(:'owner', 'aal2');
select throws_ok(format('select public.send_message(%L, %L)', :'c', 'Are you there?'), 'P0001', 'chat_blocked_by_student',
  'the business cannot message a student who blocked it');
select ok(not private.can_write_chat_photo('shop/' || :'c' || '/' || :'owner' || '/' || gen_random_uuid() || '.webp'),
  'or upload a photo to that chat');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'ama'), 0, 'and the student gets nothing');
select tests.as_user(:'ama');
select throws_ok(format('select public.send_message(%L, %L)', :'c', 'Hi again'), 'P0001', 'chat_blocked_by_you',
  'the student unblocks before writing again');
select tests.as_user(:'owner', 'aal2');
select lives_ok(format('select public.send_message(%L, %L)', :'c2', 'Hello Kojo'), 'other chats with the business still work');
select tests.as_user(:'ama');
select lives_ok(format('select public.student_set_business_blocked(%L, false)', :'c'), 'the student unblocks');
select tests.as_user(:'owner', 'aal2');
select lives_ok(format('select public.send_message(%L, %L)', :'c', 'Thanks for coming back'), 'and the business can reply again');
select tests.as_postgres();
select is((select count(*)::int from public.audit_logs where action in ('chat.student_blocked', 'chat.student_unblocked')), 2,
  'blocking and unblocking are audited');

-- 2. Reporting a rating -----------------------------------------------------------------
insert into public.merchant_reviews (merchant_id, student_id, rating, comment) values (:'m', :'kojo', 1, 'Rude staff') returning id as rev \gset
select tests.as_user(:'kojo');
select throws_ok(format('select public.report_review(%L, %L)', :'rev', 'rude'), 'P0001', 'own_review', 'you cannot report your own rating');
select tests.as_user(:'ama');
select throws_ok(format('select public.report_review(%L, %L)', :'rev', 'nonsense'), 'P0001', 'report_invalid', 'the reason must be one of the list');
select public.report_review(:'rev', 'false', 'This never happened') as rep \gset
select is(public.report_review(:'rev', 'false'), :'rep'::uuid, 'reporting twice keeps one open report');
select tests.as_user(:'owner', 'aal2');
select public.report_review(:'rev', 'personal', 'Names my cashier') as rep2 \gset
select tests.as_postgres();
select is((select reporter_side from public.review_reports where id = :'rep2'), 'business', 'the business''s report is marked as theirs');
select is((select reporter_side from public.review_reports where id = :'rep'), 'student', 'and a student''s as a student''s');
select ok(exists (select 1 from public.audit_logs where action = 'review.reported' and entity_id = :'rep'), 'reports are audited');

select tests.as_user(:'ama');
select throws_ok('select public.admin_review_reports()', 'P0001', 'forbidden', 'students cannot see the queue');
select throws_ok('select count(*) from public.review_reports', '42501', null, 'or read reports directly');
select throws_ok(format('select public.admin_resolve_review_report(%L, true)', :'rep'), 'P0001', 'forbidden', 'or resolve one');

select tests.as_user(:'padmin', 'aal2');
select is(jsonb_array_length(public.admin_review_reports()), 2, 'support sees both reports');
select is((public.admin_review_reports() -> 0 ->> 'comment'), 'Rude staff', 'with the rating''s text');
select lives_ok(format('select public.admin_resolve_review_report(%L, true)', :'rep'), 'support hides the rating');
select tests.as_postgres();
select isnt((select hidden_at from public.merchant_reviews where id = :'rev'), null, 'the rating is hidden');
select is((select count(*)::int from public.review_reports where review_id = :'rev' and status = 'hidden'), 2,
  'every open report on it is closed');
select tests.as_user(:'ama');
select throws_ok(format('select public.report_review(%L, %L)', :'rev', 'rude'), 'P0001', 'review_not_found', 'a hidden rating cannot be reported');
select tests.as_user(:'padmin', 'aal2');
select throws_ok(format('select public.admin_resolve_review_report(%L, false)', :'rep'), 'P0001', 'report_not_open', 'a handled report stays handled');

-- Keeping a rating
select tests.as_postgres();
insert into public.merchant_reviews (merchant_id, student_id, rating, comment) values (:'m', :'ama', 4, 'Good food') returning id as rev2 \gset
select tests.as_user(:'owner', 'aal2');
select public.report_review(:'rev2', 'spam') as rep3 \gset
select tests.as_user(:'padmin', 'aal2');
select public.admin_resolve_review_report(:'rep3', false);
select tests.as_postgres();
select is((select hidden_at from public.merchant_reviews where id = :'rev2'), null, 'a kept rating stays visible');
select is((select status from public.review_reports where id = :'rep3'), 'kept', 'and the report is marked kept');

select * from finish();
rollback;
