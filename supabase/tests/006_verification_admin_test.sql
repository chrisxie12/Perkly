begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

-- Test helpers (rolled back with the transaction) -------------------------
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
create function tests.as_service()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
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
-- -------------------------------------------------------------------------
select plan(44);
-- These tests create practice institutions as listed; the accreditation guard has its own tests (020).
select set_config('perqly.seed_pilot', 'on', true);

select id as gctu from public.institutions where slug = 'gctu' \gset
insert into public.institutions (slug, name, short_name, status) values ('test-u', 'Test University', 'TU', 'pilot') returning id as testu \gset
select tests.create_user('admin@perqly.example', 'Platform Admin') as padmin \gset
select tests.create_user('Bystander@Personal.example', 'Kojo Bystander') as bystander \gset
select tests.create_user('newreviewer@test.example', 'New Reviewer') as newrev \gset
select tests.create_user('iadmin@test.example', 'Institution Admin') as iadmin \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin');
insert into public.institution_reviewers (institution_id, user_id, role) values (:'testu', :'iadmin', 'admin');

-- 1. Email domains ---------------------------------------------------------------
select tests.as_user(:'bystander', 'aal2');
select throws_ok(format('select public.admin_set_institution_domain(%L, %L)', :'testu', 'st.test.example'), 'P0001', 'forbidden',
  'a non-staff user cannot add domains');
select tests.as_user(:'padmin', 'aal1');
select throws_ok(format('select public.admin_set_institution_domain(%L, %L)', :'testu', 'st.test.example'), 'P0001', 'forbidden',
  'a platform admin without two-factor cannot add domains');
select tests.as_user(:'padmin', 'aal2');
select public.admin_set_institution_domain(:'testu', '  St.Test.Example ') as dom \gset
select tests.as_postgres();
select is((select domain::text || ':' || is_active from public.institution_email_domains where id = :'dom'), 'st.test.example:true',
  'a platform admin with two-factor adds a domain, normalised to lower case');
select is((select count(*)::int from public.audit_logs where action = 'institution.domain_added' and entity_id = :'dom' and actor_id = :'padmin'), 1,
  'adding a domain is audited with the admin as actor');
select tests.as_user(:'padmin', 'aal2');
select throws_ok(format('select public.admin_set_institution_domain(%L, %L)', :'testu', 'not a domain'), 'P0001', 'domain_invalid',
  'an invalid domain is refused');
select throws_ok(format('select public.admin_set_institution_domain(%L, %L)', :'gctu', 'st.test.example'), 'P0001', 'domain_in_use',
  'a domain already used by another institution is refused');
select throws_ok(format('select public.admin_set_institution_domain(%L, %L)', gen_random_uuid(), 'x.example'), 'P0001', 'institution_not_found',
  'an unknown institution is refused');
select is(public.admin_set_institution_domain(:'testu', 'st.test.example', false), :'dom'::uuid,
  'deactivating an existing domain updates the same row');
select tests.as_postgres();
select is((select is_active from public.institution_email_domains where id = :'dom'), false, 'the domain is now inactive');
select is((select count(*)::int from public.audit_logs where action = 'institution.domain_updated' and entity_id = :'dom'), 1,
  'deactivating is audited');

-- 2. Campuses --------------------------------------------------------------------
select tests.as_user(:'padmin', 'aal2');
select public.admin_upsert_campus(:'testu', null, 'Main Campus', 'ga-123-4567', 5.6, -0.2) as campus \gset
select tests.as_postgres();
select is((select name || ':' || digital_address from public.campuses where id = :'campus'), 'Main Campus:GA-123-4567',
  'a campus is created with its digital address upper-cased');
select tests.as_user(:'padmin', 'aal2');
select throws_ok(format('select public.admin_upsert_campus(%L, null, %L)', :'testu', 'Main Campus'), 'P0001', 'campus_name_in_use',
  'two campuses of one institution cannot share a name');
select throws_ok(format('select public.admin_upsert_campus(%L, null, %L, %L)', :'testu', 'City Campus', 'nowhere'), 'P0001', 'digital_address_invalid',
  'an invalid GhanaPost digital address is refused');
select throws_ok(format('select public.admin_upsert_campus(%L, null, %L, null, 5.6)', :'testu', 'City Campus'), 'P0001', 'location_invalid',
  'a latitude without a longitude is refused');
select throws_ok(format('select public.admin_upsert_campus(%L, null, %L)', :'testu', 'x'), 'P0001', 'campus_name_invalid',
  'a one-letter campus name is refused');
select throws_ok(format('select public.admin_upsert_campus(%L, %L, %L)', :'gctu', :'campus', 'Moved'), 'P0001', 'campus_not_found',
  'a campus cannot be edited through another institution');
select is(public.admin_upsert_campus(:'testu', :'campus', 'Main Campus', null, null, null, false), :'campus'::uuid,
  'an existing campus is updated in place');
select tests.as_postgres();
select is((select is_active::text || ':' || coalesce(digital_address, 'none') from public.campuses where id = :'campus'), 'false:none',
  'the campus is deactivated and its address cleared');
select tests.as_user(:'iadmin', 'aal2');
select throws_ok(format('select public.admin_upsert_campus(%L, null, %L)', :'testu', 'City Campus'), 'P0001', 'forbidden',
  'an institution admin cannot edit campuses (platform admins only)');

-- 3. Appointing reviewers by email -----------------------------------------------
select tests.as_user(:'bystander', 'aal2');
select throws_ok(format('select public.appoint_institution_reviewer_by_email(%L, %L)', :'testu', 'nobody@nowhere.example'), 'P0001', 'forbidden',
  'a non-admin is refused before any lookup, so they cannot test whether an email has an account');
select tests.as_user(:'iadmin', 'aal1');
select throws_ok(format('select public.appoint_institution_reviewer_by_email(%L, %L)', :'testu', 'newreviewer@test.example'), 'P0001', 'forbidden',
  'an institution admin without two-factor cannot appoint');
select tests.as_user(:'iadmin', 'aal2');
select throws_ok(format('select public.appoint_institution_reviewer_by_email(%L, %L, %L)', :'testu', 'newreviewer@test.example', 'admin'), 'P0001', 'forbidden',
  'an institution admin cannot appoint another admin');
select throws_ok(format('select public.appoint_institution_reviewer_by_email(%L, %L)', :'gctu', 'newreviewer@test.example'), 'P0001', 'forbidden',
  'an institution admin cannot appoint at another institution');
select lives_ok(format('select public.appoint_institution_reviewer_by_email(%L, %L)', :'testu', 'NewReviewer@Test.Example'),
  'an institution admin with two-factor appoints a reviewer, matching the email case-insensitively');
select tests.as_user(:'padmin', 'aal2');
select throws_ok(format('select public.appoint_institution_reviewer_by_email(%L, %L)', :'testu', 'nobody@nowhere.example'), 'P0001', 'user_not_found',
  'an email with no account is reported as not found');
select lives_ok(format('select public.appoint_institution_reviewer_by_email(%L, %L, %L)', :'testu', 'bystander@personal.example', 'admin'),
  'a platform admin can appoint an institution admin');
select tests.as_postgres();
select is((select string_agg(p.full_name || ':' || r.role, ',' order by p.full_name) from public.institution_reviewers r join public.profiles p on p.id = r.user_id
           where r.institution_id = :'testu' and r.status = 'active'),
  'Institution Admin:admin,Kojo Bystander:admin,New Reviewer:reviewer', 'the appointments are recorded with the right roles');
select is((select count(*)::int from public.audit_logs where action = 'institution.reviewer_appointed' and institution_id = :'testu'), 2,
  'each appointment is audited');

-- 4. Document retention and decision notices --------------------------------------
select tests.create_user('ama@personal.example', 'Ama Kwarteng') as ama \gset
select tests.create_user('esi@personal.example', 'Esi Owusu') as esi \gset
select tests.create_user('yaw@personal.example', 'Yaw Mensah') as yaw \gset
select tests.create_user('afua@personal.example', 'Afua Boateng') as afua \gset

-- Ama: approved 31 days ago (due). Esi: rejected 10 days ago (not due).
-- Yaw: still submitted (open, never due). Afua: withdrawn 40 days ago (due).
select tests.as_user(:'ama');
select public.upsert_student_profile(:'testu');
select public.start_verification_application() as ama_app \gset
insert into storage.objects (bucket_id, name) values ('verification-documents', :'ama' || '/' || :'ama_app' || '/id-card.webp'), ('verification-documents', :'ama' || '/' || :'ama_app' || '/selfie.webp');
select public.submit_verification_application(:'ama_app', 'TU/0001', :'ama' || '/' || :'ama_app' || '/id-card.webp', :'ama' || '/' || :'ama_app' || '/selfie.webp');
select tests.as_user(:'esi');
select public.upsert_student_profile(:'testu');
select public.start_verification_application() as esi_app \gset
insert into storage.objects (bucket_id, name) values ('verification-documents', :'esi' || '/' || :'esi_app' || '/id-card.webp'), ('verification-documents', :'esi' || '/' || :'esi_app' || '/selfie.webp');
select public.submit_verification_application(:'esi_app', 'TU/0002', :'esi' || '/' || :'esi_app' || '/id-card.webp', :'esi' || '/' || :'esi_app' || '/selfie.webp');
select tests.as_user(:'yaw');
select public.upsert_student_profile(:'testu');
select public.start_verification_application() as yaw_app \gset
insert into storage.objects (bucket_id, name) values ('verification-documents', :'yaw' || '/' || :'yaw_app' || '/id-card.webp'), ('verification-documents', :'yaw' || '/' || :'yaw_app' || '/selfie.webp');
select public.submit_verification_application(:'yaw_app', 'TU/0003', :'yaw' || '/' || :'yaw_app' || '/id-card.webp', :'yaw' || '/' || :'yaw_app' || '/selfie.webp');
select tests.as_user(:'afua');
select public.upsert_student_profile(:'testu');
select public.start_verification_application() as afua_app \gset
select public.withdraw_verification_application(:'afua_app');

select tests.as_user(:'newrev');
select public.decide_verification(:'ama_app', 'approve');
select public.decide_verification(:'esi_app', 'reject', 'not_enrolled');
select tests.as_postgres();

alter table public.student_verifications disable trigger student_verifications_updated_at;
update public.student_verifications set decided_at = now() - interval '31 days' where id = :'ama_app';
update public.student_verifications set decided_at = now() - interval '10 days' where id = :'esi_app';
update public.student_verifications set submitted_at = now() - interval '60 days', updated_at = now() - interval '60 days' where id = :'yaw_app';
update public.student_verifications set updated_at = now() - interval '40 days' where id = :'afua_app';
alter table public.student_verifications enable trigger student_verifications_updated_at;

select tests.as_user(:'padmin', 'aal2');
select throws_ok('select * from public.list_verification_documents_due()', '42501', null,
  'signed-in users, even platform admins, cannot list documents due for deletion');
select throws_ok(format('select public.mark_verification_documents_deleted(array[%L]::uuid[])', :'ama_app'), '42501', null,
  'signed-in users cannot mark documents deleted');
select throws_ok(format('select public.get_verification_notice(%L)', :'ama_app'), '42501', null,
  'signed-in users cannot read decision notices (they hold the student''s email)');
select tests.as_postgres();
select is(has_function_privilege('anon', 'public.list_verification_documents_due(int)', 'execute'), false, 'anon cannot list documents due');

select tests.as_service();
select is((select array_agg(application_id order by application_id) from public.list_verification_documents_due()),
  (select array_agg(id order by id) from (values (:'ama_app'::uuid), (:'afua_app'::uuid)) as t(id)),
  'only closed applications past 30 days are due: approved and withdrawn, not recent or open ones');
select is(public.mark_verification_documents_deleted(array[:'ama_app', :'esi_app', :'yaw_app']::uuid[]), 1,
  'marking rechecks eligibility: only the due application is marked');
select tests.as_postgres();
select is((select (documents_deleted_at is not null)::text || ':' || coalesce(id_card_path, 'null') || ':' || coalesce(selfie_path, 'null') || ':' || coalesce(student_id_number, 'null')
           from public.student_verifications where id = :'ama_app'),
  'true:null:null:null', 'paths are cleared and the student ID number is redacted');
select is((select student_id_number from public.student_verifications where id = :'esi_app'), 'TU/0002', 'applications not yet due keep their details');
select isnt((select student_id_hash from public.student_profiles where user_id = :'ama'), null,
  'the keyed hash stays on the profile, so the one-account-per-student-ID rule still holds');
select is((select actor_context from public.audit_logs where action = 'verification.documents_deleted' and entity_id = :'ama_app'), 'system:retention',
  'the deletion is audited as a system action');
select tests.as_service();
select is(public.mark_verification_documents_deleted(array[:'ama_app']::uuid[]), 0, 'marking twice does nothing');
select is((select count(*)::int from public.list_verification_documents_due()), 1, 'after marking, only the withdrawn application is still due');

select is(public.get_verification_notice(:'ama_app') ->> 'email', 'ama@personal.example', 'the notice carries the student''s email for the server');
select is((select (n ->> 'status') || ':' || (n ->> 'institution_short_name') || ':' || ((n ->> 'verified_until') is not null)::text
           from (select public.get_verification_notice(:'ama_app') as n) s), 'approved:TU:true',
  'the notice has the decision, institution and verified-until date');
select is(public.get_verification_notice(:'esi_app') ->> 'decision_reason', 'not_enrolled', 'a rejection notice carries the reason');
select is(public.get_verification_notice(:'yaw_app'), null, 'there is no notice for an undecided application');

select * from finish();
rollback;
