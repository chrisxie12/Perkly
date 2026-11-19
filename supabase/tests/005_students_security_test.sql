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
select plan(44);
-- These tests create practice institutions as listed; the accreditation guard has its own tests (020).
select set_config('perqly.seed_pilot', 'on', true);

-- Fixture: GCTU and another institution, two students with submitted applications.
select id as gctu from public.institutions where slug = 'gctu' \gset
insert into public.institutions (slug, name, short_name, status) values ('other-u', 'Other University', 'OU', 'active') returning id as other \gset
select tests.create_user('ama@personal.example', 'Ama Kwarteng') as ama \gset
select tests.create_user('esi@personal.example', 'Esi Owusu') as esi \gset
select tests.create_user('bystander@personal.example', 'Kojo Bystander') as bystander \gset
select tests.create_user('reviewer@gctu.example', 'Gctu Reviewer') as greviewer \gset
select tests.create_user('reviewer@other.example', 'Other Reviewer') as oreviewer \gset
select tests.create_user('support@perqly.example', 'Perqly Support') as support \gset
insert into public.institution_reviewers (institution_id, user_id, role) values (:'gctu', :'greviewer', 'reviewer'), (:'other', :'oreviewer', 'reviewer');
insert into public.platform_staff (user_id, role) values (:'support', 'support');

select tests.as_user(:'ama');
select public.upsert_student_profile(:'gctu');
select public.start_verification_application() as ama_app \gset
insert into storage.objects (bucket_id, name) values ('verification-documents', :'ama' || '/' || :'ama_app' || '/id-card.webp'), ('verification-documents', :'ama' || '/' || :'ama_app' || '/selfie.webp');
select public.submit_verification_application(:'ama_app', 'GCTU/2023/0001', :'ama' || '/' || :'ama_app' || '/id-card.webp', :'ama' || '/' || :'ama_app' || '/selfie.webp');
select tests.as_postgres();

-- 1. HMAC pepper: decoded to bytea, private, and required ------------------------
select is((select value #>> '{}' from private.app_settings where key = 'verification.student_id_pepper') ~ '^[0-9a-f]{64}$', true,
  'the pepper is 32 random bytes stored as hex');
select is(private.student_id_hash(:'gctu', 'gctu-2023 0001'),
  encode(extensions.hmac(convert_to(:'gctu' || ':GCTU20230001', 'UTF8'),
    decode((select value #>> '{}' from private.app_settings where key = 'verification.student_id_pepper'), 'hex'), 'sha256'), 'hex'),
  'the hash is HMAC-SHA256 keyed with the decoded pepper bytes, over the normalised number');
select is(private.student_id_hash(:'gctu', 'GCTU/2023/0001'), private.student_id_hash(:'gctu', 'gctu 2023-0001'),
  'formatting differences in the student ID give the same hash');
select isnt(private.student_id_hash(:'gctu', 'GCTU/2023/0001'), private.student_id_hash(:'other', 'GCTU/2023/0001'),
  'the same number at another institution gives a different hash');
select throws_ok(format('select private.student_id_hash(%L, %L)', :'gctu', ' / - '), 'P0001', 'student_id_invalid',
  'an empty student ID cannot be hashed');

select tests.as_user(:'ama');
select throws_ok($$ select value from private.app_settings $$, '42501', null, 'students cannot read the pepper');
select throws_ok(format('select private.student_id_hash(%L, %L)', :'gctu', 'x123'), '42501', null, 'students cannot call the hash function');
select throws_ok(format('select private.student_state(%L)', :'esi'), '42501', null, 'students cannot look up another user''s verification state');
select throws_ok($$ select * from private.institutional_email_codes $$, '42501', null, 'students cannot read confirmation codes');
select tests.as_postgres();
set local role service_role;
select throws_ok($$ select value from private.app_settings $$, '42501', null, 'even the service role cannot read the pepper directly');
select tests.as_postgres();

-- 2. Malformed storage paths are refused cleanly (no cast errors) ---------------
select is_empty($$ select * from private.verification_document_parts('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz/also-bad/id-card.webp') $$,
  'a non-UUID folder returns no parts instead of raising');
select is_empty($$ select * from private.verification_document_parts(null) $$, 'a null name returns no parts');
select is((select count(*)::int from private.verification_document_parts(:'ama' || '/' || :'ama_app' || '/selfie.webp')), 1, 'a well-formed path parses');
select tests.as_user(:'esi');
select public.upsert_student_profile(:'gctu');
select public.start_verification_application() as esi_app \gset
select throws_ok(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'verification-documents', 'not-a-uuid/' || :'esi_app' || '/id-card.webp'), '42501', null,
  'a malformed student folder is refused by policy');
select throws_ok(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'verification-documents', :'esi' || '/' || :'esi_app' || '/id-card.exe'), '42501', null,
  'a disallowed file type is refused');
select throws_ok(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'verification-documents', :'esi' || '/' || :'esi_app' || '/x/id-card.webp'), '42501', null,
  'an extra folder level is refused');
select throws_ok(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'verification-documents', upper(:'esi') || '/' || :'esi_app' || '/id-card.webp'), '42501', null,
  'an upper-case copy of the student''s own folder is refused');
select throws_ok(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'verification-documents', :'esi' || '/' || :'ama_app' || '/id-card.webp'), '42501', null,
  'a student cannot write into another student''s application folder under their own name');
select lives_ok(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'verification-documents', :'esi' || '/' || :'esi_app' || '/id-card.jpg'),
  'the correct path is accepted');
select tests.as_postgres();

-- 3. Applicants' profiles are not exposed ----------------------------------------
select tests.as_user(:'bystander');
select is_empty(format('select id from public.profiles where id in (%L, %L)', :'ama', :'esi'), 'an unrelated signed-in user cannot read applicants'' profiles');
select is_empty($$ select user_id from public.student_profiles $$, 'nor their student profiles');
select is_empty(format('select * from public.get_verification_applicant_names(array[%L]::uuid[])', :'ama_app'), 'nor their names through the function');
select tests.as_postgres();

select tests.as_user(:'greviewer');
select is_empty(format('select id from public.profiles where id = %L', :'ama'), 'reviewers do not read applicants'' full profile rows');
select is_empty($$ select user_id from public.student_profiles $$, 'reviewers do not read student_profiles (the application has the snapshot)');
select is((select full_name from public.get_verification_applicant_names(array[:'ama_app']::uuid[])), 'Ama Kwarteng', 'reviewers get only the applicant''s name');
select is_empty(format('select * from public.get_verification_applicant_names(array[%L]::uuid[])', :'esi_app'), 'but not for a draft application');
select tests.as_postgres();

select tests.as_user(:'oreviewer');
select is_empty(format('select * from public.get_verification_applicant_names(array[%L]::uuid[])', :'ama_app'), 'another institution''s reviewer gets no names');
select tests.as_postgres();

-- 4. Document reads require an audited view, and stop when documents are deleted ---
select tests.as_user(:'greviewer');
select is((select count(*)::int from storage.objects where name like :'ama' || '/%'), 0, 'a reviewer cannot read documents without first recording a view');
select public.get_verification_document_paths(:'ama_app');
select is((select count(*)::int from storage.objects where name like :'ama' || '/%'), 2, 'after the audited view the reviewer can read them');
select tests.as_postgres();
select is((select count(*)::int from public.audit_logs where action = 'verification.documents_viewed' and entity_id = :'ama_app' and actor_id = :'greviewer'), 1, 'the view was audited');

update public.student_verifications set documents_deleted_at = now() where id = :'ama_app';
select tests.as_user(:'greviewer');
select is((select count(*)::int from storage.objects where name like :'ama' || '/%'), 0, 'once documents_deleted_at is set, reviewers cannot read them');
select is(public.get_verification_document_paths(:'ama_app') -> 'id_card', 'null'::jsonb, 'and no paths are returned');
select tests.as_postgres();
select tests.as_user(:'ama');
select is((select count(*)::int from storage.objects where name like :'ama' || '/%'), 0, 'nor can the student');
select tests.as_postgres();
update public.student_verifications set documents_deleted_at = null where id = :'ama_app';

-- 5. Staff separation: suspended staff lose all staff access -----------------------
select tests.as_user(:'support', 'aal2');
select is((select count(*)::int from public.student_verifications), 2, 'support (with two-factor) can look up applications for account support');
select is_empty(format('select name from storage.objects where name like %L', :'ama' || '/%'), 'but cannot open verification documents');
select throws_ok(format('select public.decide_verification(%L, %L)', :'ama_app', 'approve'), 'P0001', 'forbidden',
  'and cannot decide applications for an institution that has not delegated review');
select tests.as_postgres();
update public.profiles set is_suspended = true where id = :'support';
select tests.as_user(:'support', 'aal2');
select is(private.is_staff('reviewer'), false, 'a suspended staff account has no staff powers');
select is_empty($$ select id from public.student_verifications $$, 'and can no longer read applications');
select tests.as_postgres();

-- 6. Academic year end on a short month --------------------------------------------
update public.institutions set academic_year_end_month = 6, academic_year_end_day = 31 where id = :'gctu';
select tests.as_user(:'greviewer');
select public.decide_verification(:'ama_app', 'approve');
select tests.as_postgres();
select is(to_char((select verified_until from public.student_profiles where user_id = :'ama'), 'MM-DD'), '06-30',
  '31 June falls back to 30 June instead of failing or shortening to the 28th');

-- 7. A missing pepper stops approvals instead of silently skipping the duplicate check
select tests.as_user(:'esi');
insert into storage.objects (bucket_id, name) values ('verification-documents', :'esi' || '/' || :'esi_app' || '/selfie.webp');
select public.submit_verification_application(:'esi_app', 'GCTU/2024/0099', :'esi' || '/' || :'esi_app' || '/id-card.jpg', :'esi' || '/' || :'esi_app' || '/selfie.webp');
select tests.as_postgres();
delete from private.app_settings where key = 'verification.student_id_pepper';
select tests.as_user(:'greviewer');
select throws_ok(format('select public.decide_verification(%L, %L)', :'esi_app', 'approve'), 'P0001', 'student_id_pepper_missing',
  'without the pepper, approval fails loudly');
select tests.as_postgres();
select is((select student_id_hash from public.student_profiles where user_id = :'esi'), null, 'and no account is left verified without a hash');

-- 8. No internal helper is executable by PUBLIC or anonymous visitors -------------
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
$$, 'no private function is executable by PUBLIC');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute')
    and p.proname not in ('institution_role', 'institution_is_listed')
$$, 'anonymous visitors can execute only the two helpers that public RLS policies use');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute')
    and p.proname not like 'pgtap%' and p.proowner = (select oid from pg_roles where rolname = current_user)
    and p.oid not in (select objid from pg_depend where deptype = 'e')
    and p.proname <> 'join_waitlist' -- the landing page's waitlist form (migration 0020), rate-limited
    -- Campus C1 public pages (decision record, detail 5): live public content only, no names.
    and p.proname not in ('campus_enabled', 'public_post', 'public_organisation')
$$, 'anonymous visitors cannot execute any Perqly function in public except the waitlist and Campus public pages');

select * from finish();
rollback;
