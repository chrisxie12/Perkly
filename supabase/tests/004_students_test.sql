begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

-- Test helpers (rolled back with the transaction) -------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;
create function tests.create_user(p_email text, p_name text default 'Test User', p_intent text default null)
returns uuid language sql as $$
  insert into auth.users (id, email, raw_user_meta_data)
  values (gen_random_uuid(), p_email, jsonb_strip_nulls(jsonb_build_object('full_name', p_name, 'signup_intent', p_intent)))
  returning id;
$$;
create function tests.as_user(p_id uuid, p_aal text default 'aal1')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end;
$$;
create function tests.as_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end;
$$;
create function tests.as_postgres()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;
grant execute on all functions in schema tests to anon, authenticated;
-- -------------------------------------------------------------------------
grant usage on schema tests to service_role;
grant execute on all functions in schema tests to service_role;
select plan(52);

select id as gctu from public.institutions where slug = 'gctu' \gset
insert into public.institutions (slug, name, short_name, status) values ('other-u', 'Other University', 'OU', 'active') returning id as other \gset
insert into public.institution_email_domains (institution_id, domain) values (:'gctu', 'st.gctu.example');

select tests.create_user('ama.personal@gmail.example', 'Ama Kwarteng', 'student') as ama \gset
select tests.create_user('kofi.personal@yahoo.example', 'Kofi Mensah', 'student') as kofi \gset
select tests.create_user('yaa.personal@gmail.example', 'Yaa Asantewaa', 'student') as yaa \gset
select tests.create_user('reviewer@gctu.example', 'Gctu Reviewer') as greviewer \gset
select tests.create_user('admin@gctu.example', 'Gctu Admin') as gadmin \gset
select tests.create_user('reviewer@other.example', 'Other Reviewer') as oreviewer \gset
select tests.create_user('selfie.reviewer@gctu.example', 'Student Reviewer') as selfrev \gset
insert into public.institution_reviewers (institution_id, user_id, role) values
  (:'gctu', :'greviewer', 'reviewer'), (:'gctu', :'gadmin', 'admin'), (:'other', :'oreviewer', 'reviewer'), (:'gctu', :'selfrev', 'reviewer');

-- 1. Register with a personal email only ------------------------------------
select is((select email from auth.users where id = :'ama'), 'ama.personal@gmail.example', 'a student signs up with a personal email');
select tests.as_user(:'ama');
select is(public.get_student_benefit_access() ->> 'state', 'unverified', 'a new account starts unverified');
select lives_ok(format('select public.upsert_student_profile(%L, null, %L, %L, 2027::smallint)', :'gctu', 'BSc Computer Science', '300'),
  'a student profile needs no institutional email');
select is((select institutional_email::text from public.student_profiles where user_id = auth.uid()), null, 'no institutional email is stored unless added');

-- 2. Apply without an institutional email ------------------------------------
select public.start_verification_application() as ama_app \gset
select is(public.start_verification_application(), :'ama_app'::uuid, 'starting again returns the same open application (no duplicates)');
select lives_ok(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'verification-documents', :'ama' || '/' || :'ama_app' || '/id-card.webp'),
  'a student can upload ID evidence to their own application folder');
insert into storage.objects (bucket_id, name) values ('verification-documents', :'ama' || '/' || :'ama_app' || '/selfie.webp');
select throws_ok(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'verification-documents', :'kofi' || '/' || :'ama_app' || '/id-card.webp'),
  '42501', null, 'a student cannot upload into another student''s folder');
select throws_ok(format('select public.submit_verification_application(%L, %L, %L, %L)', :'ama_app', 'GCTU/2023/0001', :'ama' || '/' || :'ama_app' || '/id-card.webp', null),
  'P0001', 'selfie_missing', 'an application needs the supporting evidence');
select lives_ok(format('select public.submit_verification_application(%L, %L, %L, %L, false)', :'ama_app', 'GCTU/2023/0001',
  :'ama' || '/' || :'ama_app' || '/id-card.webp', :'ama' || '/' || :'ama_app' || '/selfie.webp'),
  'a student can submit an application without an institutional email');
select is(public.get_my_student_status() ->> 'state', 'pending', 'the student is pending after submitting');
select throws_ok($$ insert into public.student_verifications (student_id, institution_id) select auth.uid(), institution_id from public.student_profiles where user_id = auth.uid() $$,
  '42501', null, 'students cannot create applications directly');

-- 3. Students cannot change their own status or approve themselves -------------
select throws_ok($$ update public.student_profiles set verification_status = 'verified' where user_id = auth.uid() $$, '42501', null,
  'a student cannot change their own verification status');
select throws_ok(format('select public.decide_verification(%L, %L)', :'ama_app', 'approve'), 'P0001', 'forbidden',
  'a student cannot approve their own application');
select throws_ok($$ select private.require_verified_student() $$, 'P0001', 'not_verified', 'a pending student cannot book or redeem');
select is((public.get_student_benefit_access() ->> 'allowed')::boolean, false, 'benefit access is refused while pending');
select tests.as_postgres();

-- 4. Optional institutional email: stored separately, never verifies --------------
select tests.as_user(:'kofi');
select public.upsert_student_profile(:'gctu', null, 'BSc Accounting', '200', 2028::smallint);
select lives_ok($$ select public.set_institutional_email('Kofi.Mensah@st.gctu.example') $$, 'a student can add an institutional email');
select tests.as_postgres();
select is((select institutional_email::text from public.student_profiles where user_id = :'kofi'), 'kofi.mensah@st.gctu.example', 'it is stored on the student profile');
select is((select email from auth.users where id = :'kofi'), 'kofi.personal@yahoo.example', 'the sign-in email is unchanged');

select tests.as_user(:'kofi');
select throws_ok(format('select public.issue_institutional_email_code(%L)', :'kofi'), '42501', null,
  'students cannot generate their own confirmation code');
select tests.as_postgres();
set local role service_role;
select (public.issue_institutional_email_code(:'kofi') ->> 'code') as kofi_code \gset
select tests.as_postgres();
select tests.as_user(:'kofi');
select is(public.confirm_institutional_email_code('000000' || ''), :'kofi_code' = '000000', 'a wrong code is not accepted');
select is(public.confirm_institutional_email_code(:'kofi_code'), true, 'the emailed code confirms the institutional email');
select isnt((select institutional_email_verified_at from public.student_profiles where user_id = auth.uid()), null, 'the confirmation is recorded');
select is(public.get_my_student_status() ->> 'state', 'unverified', 'a confirmed institutional email does not verify the student');
select throws_ok($$ select private.require_verified_student() $$, 'P0001', 'not_verified', 'an institutional email alone cannot unlock booking or redemption');
select lives_ok($$ select public.set_institutional_email(null) $$, 'a student can remove their institutional email');
select is((select institutional_email_verified_at from public.student_profiles where user_id = auth.uid()), null, 'removing it clears its confirmation');
select public.set_institutional_email('kofi.mensah@st.gctu.example');
select public.start_verification_application() as kofi_app \gset
insert into storage.objects (bucket_id, name) values ('verification-documents', :'kofi' || '/' || :'kofi_app' || '/id-card.webp'), ('verification-documents', :'kofi' || '/' || :'kofi_app' || '/selfie.webp');
select public.submit_verification_application(:'kofi_app', 'GCTU/2024/0042', :'kofi' || '/' || :'kofi_app' || '/id-card.webp', :'kofi' || '/' || :'kofi_app' || '/selfie.webp', true);
select tests.as_postgres();
select is((select institutional_email::text || ' listed=' || institutional_email_domain_listed from public.student_verifications where id = :'kofi_app'),
  'kofi.mensah@st.gctu.example listed=true', 'an optional institutional email travels with the application for the reviewer');

-- 5. Reviewers from another institution see and decide nothing -------------------
select tests.as_user(:'oreviewer');
select is_empty($$ select id from public.student_verifications $$, 'another institution''s reviewer cannot see GCTU applications');
select is_empty($$ select name from storage.objects where bucket_id = 'verification-documents' $$, 'nor GCTU students'' documents');
select throws_ok(format('select public.decide_verification(%L, %L)', :'ama_app', 'approve'), 'P0001', 'forbidden',
  'a reviewer cannot approve a student from another institution');
select throws_ok(format('select public.get_verification_document_paths(%L)', :'ama_app'), 'P0001', 'forbidden',
  'nor get document links for them');
select tests.as_postgres();

-- 6. MFA still required for institution admins --------------------------------
select tests.as_user(:'gadmin', 'aal1');
select throws_ok(format('select public.decide_verification(%L, %L)', :'ama_app', 'approve'), 'P0001', 'forbidden',
  'an institution admin without two-factor cannot decide');
select tests.as_postgres();

-- 7. A reviewer who is also a student cannot review their own application ------
select tests.as_user(:'selfrev');
select public.upsert_student_profile(:'gctu');
select public.start_verification_application() as self_app \gset
insert into storage.objects (bucket_id, name) values ('verification-documents', :'selfrev' || '/' || :'self_app' || '/id-card.webp'), ('verification-documents', :'selfrev' || '/' || :'self_app' || '/selfie.webp');
select public.submit_verification_application(:'self_app', 'GCTU/2022/0777', :'selfrev' || '/' || :'self_app' || '/id-card.webp', :'selfrev' || '/' || :'self_app' || '/selfie.webp');
select throws_ok(format('select public.decide_verification(%L, %L)', :'self_app', 'approve'), 'P0001', 'cannot_review_own',
  'a reviewer cannot approve their own application');
select tests.as_postgres();

-- 8. The GCTU reviewer decides --------------------------------------------------
select tests.as_user(:'greviewer');
select is(jsonb_typeof(public.get_verification_document_paths(:'ama_app') -> 'id_card'), 'string', 'the institution''s reviewer can get the documents');
select is((select count(*)::int from storage.objects where name like :'ama' || '/%'), 2, 'storage lets the reviewer read the documents');
select throws_ok(format('select public.decide_verification(%L, %L)', :'kofi_app', 'reject'), 'P0001', 'reason_required', 'a rejection needs a reason');
select lives_ok(format('select public.decide_verification(%L, %L, null, %L)', :'kofi_app', 'request_resubmission', 'Your ID photo is blurred. Please retake it.'),
  'a reviewer can ask for resubmission');
select lives_ok(format('select public.decide_verification(%L, %L)', :'ama_app', 'approve'), 'a reviewer can approve their institution''s student');
select tests.as_postgres();

select tests.as_user(:'ama');
select is(public.get_my_student_status() ->> 'state', 'verified', 'the approved student is verified');
select lives_ok($$ select private.require_verified_student() $$, 'an approved student passes the booking and redemption gate');
select is((public.get_student_benefit_access() ->> 'allowed')::boolean, true, 'an approved student can access student benefits');
select tests.as_postgres();

select tests.as_user(:'kofi');
select lives_ok(format('insert into storage.objects (bucket_id, name) values (%L, %L) on conflict (bucket_id, name) do nothing', 'verification-documents', :'kofi' || '/' || :'kofi_app' || '/id-card.jpg'),
  'after a resubmission request the student can upload new evidence');
select lives_ok(format('select public.submit_verification_application(%L, %L, %L, %L, true)', :'kofi_app', 'GCTU/2024/0042', :'kofi' || '/' || :'kofi_app' || '/id-card.jpg', :'kofi' || '/' || :'kofi_app' || '/selfie.webp'),
  'and resubmit the same application');
select tests.as_postgres();

-- 9. One account per student ID; rejection and resubmission path -----------------
select tests.as_user(:'yaa');
select public.upsert_student_profile(:'gctu');
select public.start_verification_application() as yaa_app \gset
insert into storage.objects (bucket_id, name) values ('verification-documents', :'yaa' || '/' || :'yaa_app' || '/id-card.webp'), ('verification-documents', :'yaa' || '/' || :'yaa_app' || '/selfie.webp');
select public.submit_verification_application(:'yaa_app', 'gctu-2023-0001', :'yaa' || '/' || :'yaa_app' || '/id-card.webp', :'yaa' || '/' || :'yaa_app' || '/selfie.webp');
select tests.as_postgres();
select tests.as_user(:'greviewer');
select throws_ok(format('select public.decide_verification(%L, %L)', :'yaa_app', 'approve'), 'P0001', 'student_id_in_use',
  'a student ID already verified on another account cannot be approved again');
select lives_ok(format('select public.decide_verification(%L, %L, %L)', :'yaa_app', 'reject', 'duplicate_account'), 'the reviewer can reject with a reason');
select tests.as_postgres();
select tests.as_user(:'yaa');
select is(public.get_my_student_status() #>> '{application,decision_reason}', 'duplicate_account', 'the student sees the rejection reason');
select is(public.get_my_student_status() ->> 'state', 'unverified', 'a rejected student is unverified and can apply again');
select isnt(public.start_verification_application(), :'yaa_app'::uuid, 'a new application can be started after a rejection');
select ok(not (public.get_my_student_status() #> '{application}' ? 'decided_by'), 'students never see who reviewed them');
select tests.as_postgres();

-- 10. Audit and expiry -----------------------------------------------------------
select is((select decided_by from public.student_verifications where id = :'ama_app'), :'greviewer'::uuid, 'the reviewer''s identity is recorded');
select ok(not exists (select 1 from public.audit_logs where (coalesce(before, '{}') || coalesce(after, '{}') || metadata)::text ~* 'GCTU/20|selfie\.|id-card'),
  'the audit log holds no student ID numbers or document paths');

update public.student_profiles set verified_until = now() - interval '1 day' where user_id = :'ama';
select tests.as_user(:'ama');
select throws_ok($$ select private.require_verified_student() $$, 'P0001', 'verification_expired', 'an expired verification no longer unlocks benefits');
select tests.as_postgres();

select * from finish();
rollback;
