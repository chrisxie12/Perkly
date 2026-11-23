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
grant execute on all functions in schema tests to anon, authenticated, service_role;
select no_plan();
select set_config('perqly.seed_pilot', 'on', true);
select id as gctu from public.institutions where slug = 'gctu' \gset
select tests.create_user('ama@open.example', 'Ama Mensah') as ama \gset
select tests.create_user('kofi@open.example', 'Kofi Asare') as kofi \gset
select tests.create_user('admin@open.example', 'Perqly Admin') as padmin \gset
select tests.create_user('boss@open.example', 'Perqly Super') as psuper \gset
select tests.create_user('rev@open.example', 'Perqly Reviewer') as previewer \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin'), (:'psuper', 'super_admin'), (:'previewer', 'reviewer');

-- 1. Terms acceptance ------------------------------------------------------------------
select tests.as_anon();
select throws_ok($$ select public.accept_terms('2026-11-24') $$, '42501', null, 'signed-out visitors cannot record acceptance');
select tests.as_postgres();

select tests.as_user(:'ama');
select is((select terms_version from public.profiles where id = :'ama'), null, 'a new account has no accepted terms yet');
select throws_ok($$ select public.accept_terms('bad version!') $$, 'P0001', 'version_invalid', 'the version must be a simple label');
select lives_ok($$ select public.accept_terms('2026-11-24-draft') $$, 'a signed-in person records acceptance');
select is((select terms_version from public.profiles where id = :'ama'), '2026-11-24-draft', 'the accepted version is stored');
select ok((select terms_accepted_at from public.profiles where id = :'ama') is not null, 'the acceptance time is stored');
select throws_ok(format('update public.profiles set terms_version = %L where id = %L', 'forged', :'ama'), '42501', null,
  'a person cannot write the accepted version directly');
select tests.as_postgres();
select is((select count(*)::int from public.audit_logs where action = 'account.terms_accepted' and entity_id = :'ama'), 1, 'acceptance is audit-logged');
select is((select count(*)::int from public.profiles where id = :'kofi' and terms_version is not null), 0, 'accepting changes only the caller''s own row');

select tests.as_user(:'ama');
select public.accept_terms('2026-11-24-draft');
select tests.as_postgres();
select is((select count(*)::int from public.audit_logs where action = 'account.terms_accepted' and entity_id = :'ama'), 1, 'accepting the same version again changes nothing');

-- 2. Admins hear about new applications -----------------------------------------------
select tests.as_user(:'ama');
select public.upsert_student_profile(:'gctu');
select public.start_verification_application() as ama_app \gset
select tests.as_postgres();
select is((select count(*)::int from public.notifications where kind = 'verification.application_received'), 0, 'a draft application alerts nobody');

select tests.as_user(:'ama');
insert into storage.objects (bucket_id, name) values ('verification-documents', :'ama' || '/' || :'ama_app' || '/id-card.webp'),
  ('verification-documents', :'ama' || '/' || :'ama_app' || '/selfie.webp');
select public.submit_verification_application(:'ama_app', 'GCTU/2025/0101', :'ama' || '/' || :'ama_app' || '/id-card.webp', :'ama' || '/' || :'ama_app' || '/selfie.webp', false);
select tests.as_postgres();

select set_eq(
  format($$ select user_id from public.notifications where kind = 'verification.application_received' $$),
  format($$ values (%L::uuid), (%L::uuid) $$, :'padmin', :'psuper'),
  'submitting alerts each Perqly admin and super admin, once');
select is((select count(*)::int from public.notifications where kind = 'verification.application_received' and user_id in (:'ama', :'previewer')), 0,
  'the student and staff below admin are not alerted');
select is((select link from public.notifications where kind = 'verification.application_received' and user_id = :'padmin'), '/institution/requests/' || :'ama_app',
  'the alert links straight to the application');
select ok(not exists (select 1 from public.notifications where kind = 'verification.application_received' and (title || coalesce(body, '')) ~* 'GCTU/20|selfie|id-card'),
  'the alert holds no student ID number or document path');

-- Asked to resubmit, then sent again: one more alert.
select tests.as_user(:'padmin', 'aal2');
select public.decide_verification(:'ama_app', 'request_resubmission', null, 'Please retake the selfie in good light.');
select tests.as_postgres();
select tests.as_user(:'ama');
select public.submit_verification_application(:'ama_app', 'GCTU/2025/0101', :'ama' || '/' || :'ama_app' || '/id-card.webp', :'ama' || '/' || :'ama_app' || '/selfie.webp', false);
select tests.as_postgres();
select is((select count(*)::int from public.notifications where kind = 'verification.application_received' and user_id = :'padmin'), 2,
  'a resubmitted application alerts admins again');

-- 3. Gates are unchanged ----------------------------------------------------------------
select tests.as_user(:'ama');
select throws_ok($$ select private.require_verified_student() $$, 'P0001', 'not_verified', 'accepting terms and applying do not unlock benefits');
select tests.as_postgres();

select * from finish();
rollback;
