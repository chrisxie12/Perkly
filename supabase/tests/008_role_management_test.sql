begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create schema tests;
grant usage on schema tests to anon, authenticated;
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
grant execute on all functions in schema tests to anon, authenticated;
select plan(17);
-- These tests create practice institutions as listed; the accreditation guard has its own tests (020).
select set_config('perqly.seed_pilot', 'on', true);

select id as gctu from public.institutions where slug = 'gctu' \gset
insert into public.institutions (slug, name, short_name, status) values ('test-u', 'Test University', 'TU', 'pilot') returning id as testu \gset
insert into public.institutions (slug, name, short_name, status, review_mode, review_delegated_at)
values ('deleg-u', 'Delegated University', 'DU', 'pilot', 'delegated', '2026-11-01') returning id as delegu \gset
select tests.create_user('rev@gctu.example', 'Gctu Reviewer') as grev \gset
select tests.create_user('admin@tu.example', 'Tu Admin') as tadmin \gset
select tests.create_user('prev@perqly.example', 'Perqly Reviewer') as prev \gset
select tests.create_user('support@perqly.example', 'Perqly Support') as psupport \gset
select tests.create_user('student@personal.example', 'Plain Student') as student \gset
insert into public.institution_reviewers (institution_id, user_id, role) values (:'gctu', :'grev', 'reviewer'), (:'testu', :'tadmin', 'admin');
insert into public.platform_staff (user_id, role) values (:'prev', 'reviewer'), (:'psupport', 'support');

-- 1. my_reviewable_institutions() matches who can decide -----------------------
select tests.as_user(:'grev');
select is((select string_agg(short_name || ':' || via, ',') from public.my_reviewable_institutions()), 'GCTU:institution',
  'an institution reviewer can review only their own institution');
select tests.as_user(:'tadmin', 'aal1');
select is((select count(*)::int from public.my_reviewable_institutions()), 0, 'an institution admin without two-factor can review nothing yet');
select tests.as_user(:'tadmin', 'aal2');
select is((select string_agg(short_name, ',') from public.my_reviewable_institutions()), 'TU', 'with two-factor, the institution admin can review their institution');
select tests.as_user(:'prev', 'aal2');
select is((select string_agg(short_name || ':' || via, ',') from public.my_reviewable_institutions()), 'DU:delegated',
  'a Perqly reviewer with two-factor reviews only delegated institutions');
select tests.as_user(:'prev', 'aal1');
select is((select count(*)::int from public.my_reviewable_institutions()), 0, 'a Perqly reviewer without two-factor reviews nothing');
select tests.as_user(:'psupport', 'aal2');
select is((select string_agg(short_name, ',') from public.my_reviewable_institutions()), 'DU',
  'support staff, who can read every application, can still only review delegated institutions');
select tests.as_user(:'student');
select is((select count(*)::int from public.my_reviewable_institutions()), 0, 'a student reviews nothing');

-- 2. get_my_context() lists delegated institutions for staff routing ------------
select tests.as_user(:'prev', 'aal1');
select is((public.get_my_context() -> 'delegated_institutions' -> 0 ->> 'short_name'), 'DU',
  'staff see delegated institutions in their context even before two-factor, so they can be sent to set it up');
select tests.as_user(:'student');
select is(jsonb_array_length(public.get_my_context() -> 'delegated_institutions'), 0, 'non-staff get no delegated institutions');
select is((public.get_my_context() ->> 'user_id'), :'student', 'get_my_context still returns the caller');

-- 3. get_institution_reviewers() ----------------------------------------------
select tests.as_user(:'tadmin', 'aal2');
select is((select string_agg(full_name || ':' || role, ',') from public.get_institution_reviewers(:'testu')), 'Tu Admin:admin',
  'an institution admin with two-factor sees their reviewers with names');
select throws_ok(format('select * from public.get_institution_reviewers(%L)', :'gctu'), 'P0001', 'forbidden',
  'an institution admin cannot list another institution''s reviewers');
select tests.as_user(:'tadmin', 'aal1');
select throws_ok(format('select * from public.get_institution_reviewers(%L)', :'testu'), 'P0001', 'forbidden',
  'without two-factor, an institution admin cannot list reviewers');
select tests.as_user(:'grev');
select throws_ok(format('select * from public.get_institution_reviewers(%L)', :'gctu'), 'P0001', 'forbidden',
  'a plain reviewer cannot list other reviewers'' names');
select tests.as_user(:'psupport', 'aal2');
select is((select count(*)::int from public.get_institution_reviewers(:'gctu')), 1, 'Perqly support can list any institution''s reviewers');
select tests.as_postgres();
select is(has_function_privilege('anon', 'public.get_institution_reviewers(uuid)', 'execute'), false, 'anon cannot list reviewers');
select is(has_function_privilege('anon', 'public.my_reviewable_institutions()', 'execute'), false, 'anon cannot call my_reviewable_institutions');

select * from finish();
rollback;
