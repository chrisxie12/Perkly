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
select plan(19);
-- These tests create practice institutions as listed; the accreditation guard has its own tests (020).
select set_config('perqly.seed_pilot', 'on', true);

select id as gctu from public.institutions where slug = 'gctu' \gset
insert into public.institutions (slug, name, short_name, status) values ('closed-u', 'Closed University', 'CU', 'inactive') returning id as closed \gset
insert into public.institutions (slug, name, short_name, status) values ('other-u', 'Other University', 'OU', 'active') returning id as other \gset

select tests.create_user('admin@gctu.example', 'Gctu Admin') as gadmin \gset
select tests.create_user('reviewer@gctu.example', 'Gctu Reviewer') as greviewer \gset
select tests.create_user('reviewer@other.example', 'Other Reviewer') as oreviewer \gset
select tests.create_user('student@example.com', 'A Student') as student \gset
insert into public.institution_reviewers (institution_id, user_id, role) values (:'gctu', :'gadmin', 'admin');
insert into public.institution_reviewers (institution_id, user_id, role) values (:'other', :'oreviewer', 'reviewer');

select is((select status::text from public.institutions where slug = 'gctu'), 'pilot', 'GCTU is seeded as a pilot institution');

select tests.as_anon();
select set_eq($$ select slug from public.institutions $$, array['gctu', 'other-u'], 'anonymous visitors see only pilot and active institutions');
select throws_ok($$ insert into public.institutions (slug, name, short_name) values ('x-u', 'X University', 'XU') $$, '42501', null,
  'anonymous visitors cannot create institutions');
select tests.as_postgres();

select tests.as_user(:'student');
select throws_ok($$ update public.institutions set status = 'active' $$, '42501', null, 'students cannot change institutions');
select is_empty($$ select id from public.institution_reviewers $$, 'students cannot see reviewer appointments');
select throws_ok(format('select public.appoint_institution_reviewer(%L, %L)', :'gctu', :'student'), 'P0001', 'forbidden',
  'students cannot appoint reviewers');
select tests.as_postgres();

-- Institution admin without two-factor
select tests.as_user(:'gadmin', 'aal1');
select throws_ok(format('select public.appoint_institution_reviewer(%L, %L)', :'gctu', :'greviewer'), 'P0001', 'forbidden',
  'an institution admin needs two-factor to appoint reviewers');
select tests.as_postgres();

-- Institution admin with two-factor
select tests.as_user(:'gadmin', 'aal2');
select lives_ok(format('select public.appoint_institution_reviewer(%L, %L)', :'gctu', :'greviewer'), 'an institution admin can appoint a reviewer');
select throws_ok(format('select public.appoint_institution_reviewer(%L, %L, %L)', :'gctu', :'student', 'admin'), 'P0001', 'forbidden',
  'an institution admin cannot appoint another admin');
select throws_ok(format('select public.appoint_institution_reviewer(%L, %L)', :'other', :'student'), 'P0001', 'forbidden',
  'an institution admin cannot appoint reviewers at another institution');
select tests.as_postgres();

-- Isolation between institutions
select tests.as_user(:'greviewer');
select set_eq($$ select institution_id from public.institution_reviewers $$, array[:'gctu'::uuid, :'gctu'::uuid],
  'a GCTU reviewer sees only GCTU appointments');
select is((public.get_my_context() -> 'institution_roles' -> 0 ->> 'short_name'), 'GCTU', 'get_my_context reports the reviewer role');
select tests.as_postgres();

select tests.as_user(:'oreviewer');
select is_empty(format('select id from public.institution_reviewers where institution_id = %L', :'gctu'),
  'another institution''s reviewer cannot see GCTU appointments');
select tests.as_postgres();

select is((select count(*)::int from public.audit_logs where action = 'institution.reviewer_appointed' and institution_id = :'gctu'), 1,
  'the appointment is audited against GCTU');

-- Removing reviewers
select id as oreviewer_row from public.institution_reviewers where user_id = :'oreviewer' \gset
select id as greviewer_row from public.institution_reviewers where user_id = :'greviewer' \gset
select tests.as_user(:'gadmin', 'aal2');
select throws_ok(format('select public.remove_institution_reviewer(%L)', :'oreviewer_row'), 'P0001', 'forbidden',
  'an institution admin cannot remove another institution''s reviewer');
select lives_ok(format('select public.remove_institution_reviewer(%L)', :'greviewer_row'), 'an institution admin can remove their own reviewer');
select tests.as_postgres();

-- Platform admins manage institutions only with two-factor
select tests.create_user('ops@perqly.example', 'Perqly Ops') as ops \gset
insert into public.platform_staff (user_id, role) values (:'ops', 'admin');
select tests.as_user(:'ops', 'aal1');
select throws_ok($$ select public.upsert_institution('new-u', 'New University', 'NU', 'inactive') $$, 'P0001', 'forbidden',
  'a platform admin without two-factor cannot create institutions');
select tests.as_postgres();
select tests.as_user(:'ops', 'aal2');
select lives_ok($$ select public.upsert_institution('new-u', 'New University', 'NU', 'inactive') $$, 'a platform admin with two-factor can create an institution');
select throws_ok($$ select public.upsert_institution('new-u', 'New University', 'NU', 'active', 'delegated') $$, '23514', null,
  'delegated review requires the agreement date');
select tests.as_postgres();

select * from finish();
rollback;
