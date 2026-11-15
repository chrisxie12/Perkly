begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

-- Phase 1 repair: a student can always get out of an open application.
create schema tests;
grant usage on schema tests to authenticated;
create function tests.create_user(p_email text, p_name text default 'Test User')
returns uuid language sql as $$
  insert into auth.users (id, email, raw_user_meta_data)
  values (gen_random_uuid(), p_email, jsonb_build_object('full_name', p_name))
  returning id;
$$;
create function tests.as_user(p_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
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
grant execute on all functions in schema tests to authenticated;
select plan(14);
-- These tests create practice institutions as listed; the accreditation guard has its own tests (020).
select set_config('perqly.seed_pilot', 'on', true);

select id as gctu from public.institutions where slug = 'gctu' \gset
insert into public.institutions (slug, name, short_name, status) values ('test-u', 'Test University', 'TU', 'pilot') returning id as testu \gset
select tests.create_user('kofi@personal.example', 'Kofi Draft') as kofi \gset
select tests.create_user('akos@personal.example', 'Akos Changes') as akos \gset
select tests.create_user('rev@test.example', 'Test Reviewer') as rev \gset
select tests.create_user('other@personal.example', 'Other Student') as other \gset
insert into public.institution_reviewers (institution_id, user_id, role) values (:'gctu', :'rev', 'reviewer');

-- 1. A draft (created by the first upload) locks the school, and withdrawing it unlocks it.
select tests.as_user(:'kofi');
select public.upsert_student_profile(:'gctu');
select public.start_verification_application() as kofi_draft \gset
select throws_ok(format('select public.upsert_student_profile(%L)', :'testu'), 'P0001', 'institution_locked',
  'a draft application locks the school');
select tests.as_user(:'other');
select throws_ok(format('select public.withdraw_verification_application(%L)', :'kofi_draft'), 'P0001', null,
  'another student cannot withdraw someone else''s draft');
select tests.as_user(:'kofi');
select lives_ok(format('select public.withdraw_verification_application(%L)', :'kofi_draft'), 'the student can withdraw their own draft');
select lives_ok(format('select public.upsert_student_profile(%L)', :'testu'), 'after withdrawing, the student can change school');
select is((public.get_my_student_status() -> 'profile' ->> 'institution_short_name'), 'TU', 'the profile now shows the new school');
select is((public.get_my_student_status() ->> 'state'), 'unverified', 'the student is back to unverified, not pending');
select isnt(public.start_verification_application(), :'kofi_draft'::uuid, 'a new application starts fresh at the new school');
select tests.as_postgres();
select is((select institution_id from public.student_verifications where student_id = :'kofi' and status = 'draft'), :'testu'::uuid,
  'the new draft belongs to the new school');

-- 2. Changes requested: the student can withdraw instead of resubmitting.
select tests.as_user(:'akos');
select public.upsert_student_profile(:'gctu');
select public.start_verification_application() as akos_app \gset
insert into storage.objects (bucket_id, name) values ('verification-documents', :'akos' || '/' || :'akos_app' || '/id-card.webp'), ('verification-documents', :'akos' || '/' || :'akos_app' || '/selfie.webp');
select public.submit_verification_application(:'akos_app', 'GCTU/9', :'akos' || '/' || :'akos_app' || '/id-card.webp', :'akos' || '/' || :'akos_app' || '/selfie.webp');
select tests.as_user(:'rev');
select public.decide_verification(:'akos_app', 'request_resubmission', null, 'Selfie is blurred');
select tests.as_user(:'akos');
select is((public.get_my_student_status() -> 'application' ->> 'status'), 'resubmission_requested', 'the reviewer asked for changes');
select throws_ok(format('select public.upsert_student_profile(%L)', :'testu'), 'P0001', 'institution_locked',
  'changes requested still locks the school');
select lives_ok(format('select public.withdraw_verification_application(%L)', :'akos_app'), 'the student can withdraw a changes-requested application');
select is((public.get_my_student_status() ->> 'state'), 'unverified', 'withdrawing clears the pending state');
select lives_ok(format('select public.upsert_student_profile(%L)', :'testu'), 'and the school can change');

-- 3. A decided application can't be withdrawn.
select tests.as_postgres();
update public.student_verifications set status = 'approved' where id = :'akos_app';
select tests.as_user(:'akos');
select throws_ok(format('select public.withdraw_verification_application(%L)', :'akos_app'), 'P0001', 'application_not_editable',
  'a decided application cannot be withdrawn');

select * from finish();
rollback;
