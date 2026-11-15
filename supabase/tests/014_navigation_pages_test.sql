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
grant execute on all functions in schema tests to anon, authenticated, service_role;
select plan(18);
-- These tests create practice institutions as listed; the accreditation guard has its own tests (020).
select set_config('perqly.seed_pilot', 'on', true);

select id as gctu from public.institutions where slug = 'gctu' \gset
insert into public.institutions (slug, name, short_name, status) values ('test-u', 'Test University', 'TU', 'pilot') returning id as testu \gset
select tests.create_user('reviewer@gctu.example', 'Gctu Reviewer') as reviewer \gset
select tests.create_user('ama@student.example', 'Ama Mensah') as s1 \gset
select tests.create_user('kofi@student.example', 'Kofi Tu') as s2 \gset
select tests.create_user('super@perqly.example', 'Super Admin') as psuper \gset
select tests.create_user('admin@perqly.example', 'Perqly Admin') as padmin \gset
select tests.create_user('new@perqly.example', 'New Staff') as pnew \gset
insert into public.platform_staff (user_id, role) values (:'psuper', 'super_admin'), (:'padmin', 'admin');
insert into public.institution_reviewers (institution_id, user_id, role, status) values (:'gctu', :'reviewer', 'reviewer', 'active');
select tests.as_user(:'s1'); select public.upsert_student_profile(:'gctu', null, 'BSc IT', 'Level 300');
select tests.as_user(:'s2'); select public.upsert_student_profile(:'testu');
select tests.as_postgres();
update public.student_profiles set verification_status = 'verified', verified_at = now(), verified_until = now() + interval '10 days' where user_id in (:'s1', :'s2');

-- 1. Institution pages --------------------------------------------------------------
select tests.as_user(:'reviewer');
select is((select count(*)::int from public.institution_overview()), 1, 'a reviewer sees an overview row for their institution only');
select is((select verified || '/' || expiring_30d from public.institution_overview()), '1/1', 'the overview counts verified and soon-expiring students');
select is((select full_name || '/' || programme from public.institution_students(:'gctu')), 'Ama Mensah/BSc IT', 'a reviewer lists their verified students');
select is((select count(*)::int from public.institution_students(:'gctu', 'bsc')), 1, 'the list can be searched by programme');
select is((select count(*)::int from public.institution_students(:'gctu', null, 'expired')), 0, 'and filtered to expired students');
select throws_ok(format('select * from public.institution_students(%L)', :'testu'), 'P0001', 'forbidden', 'another institution''s students are refused');
select tests.as_user(:'s1');
select is((select count(*)::int from public.institution_overview()), 0, 'students see no overview');
select throws_ok(format('select * from public.institution_students(%L)', :'gctu'), 'P0001', 'forbidden', 'students cannot list students');

-- 2. Staff ---------------------------------------------------------------------------
select tests.as_user(:'padmin', 'aal2');
select is((select count(*)::int from public.admin_list_staff()), 2, 'admins list the staff');
select throws_ok(format('select public.admin_set_platform_role_by_email(%L, %L)', 'new@perqly.example', 'support'), 'P0001', 'forbidden', 'admins cannot grant roles');
select tests.as_user(:'psuper', 'aal2');
select lives_ok(format('select public.admin_set_platform_role_by_email(%L, %L)', 'NEW@perqly.example', 'support'), 'a super admin grants a role by email');
select throws_ok(format('select public.admin_set_platform_role_by_email(%L, %L)', 'nobody@x.example', 'support'), 'P0001', 'user_not_found', 'an unknown email is refused');
select tests.as_postgres();
select is((select role::text from public.platform_staff where user_id = :'pnew'), 'support', 'the role is granted');

-- 3. Settings ------------------------------------------------------------------------
select tests.as_user(:'padmin', 'aal2');
select ok(not exists (select 1 from public.admin_list_settings() where key like '%pepper%'), 'secrets are never listed');
select ok(exists (select 1 from public.admin_list_settings() where key = 'qr.max_scans_per_minute'), 'tunable limits are listed');
select throws_ok(format('select public.admin_set_setting(%L, 8)', 'qr.max_scans_per_minute'), 'P0001', 'forbidden', 'admins cannot change settings');
select tests.as_user(:'psuper', 'aal2');
select throws_ok(format('select public.admin_set_setting(%L, 8)', 'verification.student_id_pepper'), 'P0001', 'setting_not_tunable', 'the pepper cannot be changed');
select public.admin_set_setting('qr.max_scans_per_minute', 8);
select tests.as_postgres();
select is(private.setting_int('qr.max_scans_per_minute', 6), 8, 'a super admin changes a limit, and it takes effect');

select * from finish();
rollback;
