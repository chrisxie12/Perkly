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

select tests.create_user('ama@res.example', 'Ama Mensah') as student \gset
select tests.create_user('admin@res.example', 'Perqly Admin') as padmin \gset
select tests.create_user('support@res.example', 'Perqly Support') as psupport \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin'), (:'psupport', 'support');

-- 1. The researched entries arrive pending and hidden ----------------------------------------
select ok((select count(*) from public.student_resources) >= 30, 'at least 30 researched resources are loaded');
select is((select count(*)::int from public.student_resources where status <> 'pending'), 0, 'every researched resource starts pending');
select is((select count(*)::int from public.student_resources where eligibility = 'confirmed' and checked_on is null), 0,
  'no resource is confirmed without a checked date');
select is((select count(*)::int from public.student_resources where official_url !~ '^https://'), 0, 'every official link is https');
select is((select count(distinct category)::int from public.student_resources), 9, 'all nine categories have resources');

select tests.as_user(:'student');
select is(jsonb_array_length(public.list_student_resources()), 0, 'students see nothing until a resource is approved');
select is(public.get_student_resource('github-student-developer-pack'), null, 'a pending resource cannot be opened');
select throws_ok($$ select count(*) from public.student_resources $$, '42501', null, 'students cannot read the table directly');
select throws_ok($$ select public.admin_list_student_resources() $$, 'P0001', 'forbidden', 'students cannot use the admin list');
select tests.as_postgres();

select tests.as_anon();
select throws_ok($$ select public.list_student_resources() $$, '42501', null, 'signed-out visitors cannot list resources');
select tests.as_postgres();

-- 2. Admin rights need the admin role and two-factor ------------------------------------------
select id as gh from public.student_resources where slug = 'github-student-developer-pack' \gset
select tests.as_user(:'padmin');
select throws_ok(format('select public.admin_set_student_resource_status(%L, %L)', :'gh', 'published'), 'P0001', 'forbidden',
  'an admin without two-factor cannot approve');
select tests.as_postgres();
select tests.as_user(:'psupport', 'aal2');
select throws_ok(format('select public.admin_set_student_resource_status(%L, %L)', :'gh', 'published'), 'P0001', 'forbidden',
  'support staff cannot approve');
select tests.as_postgres();

select tests.as_user(:'padmin', 'aal2');
select ok(jsonb_array_length(public.admin_list_student_resources('pending')) >= 30, 'admins see the pending queue');
select lives_ok(format('select public.admin_set_student_resource_status(%L, %L)', :'gh', 'published'), 'an admin approves a resource');
select tests.as_postgres();
select ok((select published_at is not null from public.student_resources where id = :'gh'), 'approving records when it was published');
select is((select count(*)::int from public.audit_logs where action = 'resource.published' and entity_id = :'gh'), 1, 'approval is audit-logged');

-- 3. Students see published resources, with search and filters --------------------------------
select tests.as_user(:'student');
select is(jsonb_array_length(public.list_student_resources()), 1, 'students see the published resource');
select is(public.get_student_resource('github-student-developer-pack') ->> 'name', 'GitHub Student Developer Pack', 'students open its detail');
select is(jsonb_array_length(public.list_student_resources('github')), 1, 'search finds it by name');
select is(jsonb_array_length(public.list_student_resources('nothing-like-this')), 0, 'search can find nothing');
select is(jsonb_array_length(public.list_student_resources(null, 'design_creativity')), 0, 'category filter excludes other categories');
select is(jsonb_array_length(public.list_student_resources(null, 'developer_tools', 'confirmed')), 1, 'confirmed filter keeps confirmed ones');
select is(jsonb_array_length(public.list_student_resources(null, null, 'ghana')), 0, 'Available in Ghana filter excludes international-only ones');
select throws_ok($$ select public.list_student_resources(null, null, 'bogus') $$, 'P0001', 'filter_invalid', 'unknown filters are refused');
select tests.as_postgres();

-- 4. Create, edit, feature and archive ---------------------------------------------------------
select tests.as_user(:'padmin', 'aal2');
select throws_ok($$ select public.admin_save_student_resource(null, 'test-resource', 'Test resource', 'Test provider',
  'ai_productivity', 'free_forever', null, 'A short summary for a test.', null, array['One benefit'], null,
  'confirmed', 'international', false, false, false, false, null, 'https://example.com', null, null) $$,
  'P0001', 'checked_on_required', 'confirmed eligibility needs a checked date');
select throws_ok($$ select public.admin_save_student_resource(null, 'test-resource', 'Test resource', 'Test provider',
  'ai_productivity', 'free_forever', null, 'A short summary for a test.', null, array['One benefit'], null,
  'needs_verification', 'international', false, false, false, false, null, 'http://example.com', null, null) $$,
  '23514', null, 'links must be https');
select public.admin_save_student_resource(null, 'test-resource', 'Test resource', 'Test provider',
  'ai_productivity', 'free_forever', null, 'A short summary for a test.', null, array['One benefit', '  '], null,
  'needs_verification', 'international', false, false, false, false, null, 'https://example.com', null, null) as tr \gset
select tests.as_postgres();
select is((select status::text from public.student_resources where id = :'tr'), 'draft', 'a new resource starts as a draft');
select is((select benefits from public.student_resources where id = :'tr'), array['One benefit'], 'blank benefit lines are dropped');
select tests.as_user(:'padmin', 'aal2');
select throws_ok($$ select public.admin_save_student_resource(null, 'test-resource', 'Another', 'Test provider',
  'ai_productivity', 'free_forever', null, 'A short summary for a test.', null, '{}', null,
  'needs_verification', 'international', false, false, false, false, null, 'https://example.com', null, null) $$,
  'P0001', 'slug_taken', 'slugs are unique');
select throws_ok(format('select public.admin_set_student_resource_featured(%L, true)', :'tr'), 'P0001', 'not_published', 'only published resources can be featured');
select lives_ok(format('select public.admin_set_student_resource_featured(%L, true)', :'gh'), 'a published resource can be featured');
select lives_ok(format('select public.admin_set_student_resource_status(%L, %L)', :'gh', 'archived'), 'an admin archives a resource');
select tests.as_postgres();
select is((select featured from public.student_resources where id = :'gh'), false, 'archiving clears featured');

select tests.as_user(:'student');
select is(jsonb_array_length(public.list_student_resources()), 0, 'archived resources disappear for students');
select tests.as_postgres();

select * from finish();
rollback;
