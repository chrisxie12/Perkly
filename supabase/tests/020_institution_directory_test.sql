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
select plan(20);

select tests.create_user('admin@perqly.example', 'Platform Admin') as padmin \gset
select tests.create_user('ama@student.example', 'Ama Mensah') as s1 \gset
select tests.create_user('kofi@student.example', 'Kofi Boateng') as s2 \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin');
select id as ug from public.institutions where slug = 'ug' \gset

-- Seed --------------------------------------------------------------------------------------
select is((select count(*)::int from public.institutions where region = 'Greater Accra' and slug <> 'gctu'), 18, '18 Greater Accra institutions seeded besides GCTU');
select is((select count(*)::int from public.institutions where slug <> 'gctu' and (status <> 'inactive' or accreditation_status <> 'unverified')), 0,
  'every newly seeded institution is hidden and unverified');
select set_eq($$select name from public.campuses where institution_id = (select id from public.institutions where slug = 'ug')$$,
  array['Legon', 'Korle-Bu', 'Accra City'], 'UG has Legon, Korle-Bu and Accra City');
select is((select name from public.campuses where institution_id = :'ug' and is_primary), 'Legon', 'Legon is UG''s primary campus');
select is((select count(*)::int from public.institutions where logo_status = 'official' and logo_path not like 'bundled/%'), 0,
  'no uploaded logo is marked official until one is uploaded');

-- Students only see listed institutions ------------------------------------------------------
select tests.as_user(:'s1');
select is((select count(*)::int from public.institutions where slug = 'ug'), 0, 'students cannot see a hidden institution');
select is((select count(*)::int from public.campuses where institution_id = :'ug'), 0, 'or its campuses');
select throws_ok(format('select public.admin_update_institution_directory(%L, %L, null, null, null, null, %L, null)', :'ug', 'public', 'confirmed'),
  'P0001', 'forbidden', 'students cannot record accreditation');

-- Listing needs a confirmed accreditation check ---------------------------------------------
select tests.as_user(:'padmin', 'aal2');
select throws_ok($$select public.upsert_institution('ug', 'University of Ghana', 'UG', 'active')$$, 'P0001', 'accreditation_unconfirmed',
  'an unverified institution cannot be listed');
select lives_ok(format('select public.admin_update_institution_directory(%L, %L, %L, %L, %L, %L, %L, %L)', :'ug', 'public', 'https://www.ug.edu.gh',
  'Accra', 'Greater Accra', 'https://lawlibrary.ug.edu.gh/node/38', 'confirmed', 'Checked on the GTEC list'), 'an admin records the check');
select is((select accreditation_checked_at from public.institutions where id = :'ug'), current_date, 'with the date it was checked');
select lives_ok($$select public.upsert_institution('ug', 'University of Ghana', 'UG', 'active')$$, 'then it can be listed');
select tests.as_postgres();
select throws_ok($$insert into public.institutions (slug, name, short_name) values ('ug-2', '  university of ghana ', 'UG2')$$, '23505', null,
  'the same institution cannot be added twice');
select tests.as_user(:'padmin', 'aal2');

-- Campuses --------------------------------------------------------------------------------
select id as korlebu from public.campuses where institution_id = :'ug' and name = 'Korle-Bu' \gset
select public.admin_set_primary_campus(:'korlebu');
select is((select name from public.campuses where institution_id = :'ug' and is_primary), 'Korle-Bu', 'an admin can change the primary campus, and there is only one');

-- Logos -----------------------------------------------------------------------------------
select (:'ug' || '/logo-1794730000000.svg') as logo \gset
insert into storage.objects (bucket_id, name) values ('institution-logos', :'logo');
select throws_ok(format('select public.admin_set_institution_logo(%L, %L, null)', :'ug', :'logo'), 'P0001', 'logo_source_required',
  'a logo needs the official source it came from');
select public.admin_set_institution_logo(:'ug', :'logo', 'https://www.ug.edu.gh/');
select is((select logo_status from public.institutions where id = :'ug'), 'official', 'with a source it is marked official');
select tests.as_user(:'s1');
select throws_ok(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'institution-logos', :'ug' || '/logo-1794730000001.png'),
  '42501', null, 'students cannot upload logos');

-- Requests ----------------------------------------------------------------------------------
select public.request_institution('Accra College of Medicine', null, 'Accra') as req \gset
select is((select count(*)::int from public.institution_requests), 1, 'a student can ask for an institution and see the request');
select is((select status from public.institutions where name ilike 'Accra College of Medicine'), null, 'a request never lists the institution');
select tests.as_user(:'s2');
select is((select count(*)::int from public.institution_requests), 0, 'other students cannot see it');

select * from finish();
rollback;
