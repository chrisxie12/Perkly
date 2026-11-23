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


select tests.create_user('ama@img.example', 'Ama Mensah') as student \gset
select tests.create_user('admin@img.example', 'Perqly Admin') as padmin \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin');
select id as gh from public.student_resources where slug = 'github-student-developer-pack' \gset
select id as aws from public.student_resources where slug = 'aws-educate' \gset
select :'gh' || '/' || gen_random_uuid() || '.webp' as logo \gset
select :'gh' || '/' || gen_random_uuid() || '.jpg' as cover \gset

select is((select public from storage.buckets where id = 'resource-images'), true, 'resource images are public, like shop photos');

-- Uploading -----------------------------------------------------------------------------------
select tests.as_user(:'student');
select throws_ok(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'resource-images', :'logo'), '42501', null,
  'students cannot upload resource images');
select tests.as_postgres();
select tests.as_user(:'padmin');
select throws_ok(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'resource-images', :'logo'), '42501', null,
  'admins without two-factor cannot upload');
select tests.as_postgres();
select tests.as_user(:'padmin', 'aal2');
select throws_ok(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'resource-images', 'stray/logo.webp'), '42501', null,
  'images must sit in a resource folder');
select lives_ok(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'resource-images', :'logo'), 'an admin uploads a logo');
select lives_ok(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'resource-images', :'cover'), 'an admin uploads a cover');

-- Attaching ----------------------------------------------------------------------------------
select throws_ok(format('select public.admin_set_student_resource_image(%L, %L, %L)', :'aws', 'logo', :'logo'), 'P0001', 'image_invalid',
  'an image cannot be attached to a different resource');
select throws_ok(format('select public.admin_set_student_resource_image(%L, %L, %L)', :'gh', 'logo', :'gh' || '/' || gen_random_uuid() || '.webp'),
  'P0001', 'image_invalid', 'an image that was never uploaded is refused');
select throws_ok(format('select public.admin_set_student_resource_image(%L, %L, %L)', :'gh', 'banner', :'logo'), 'P0001', 'kind_invalid',
  'only logo and cover are allowed');
select is(public.admin_set_student_resource_image(:'gh', 'logo', :'logo'), null, 'attaching a first logo returns no old path');
select public.admin_set_student_resource_image(:'gh', 'cover', :'cover');
select public.admin_set_student_resource_status(:'gh', 'published');
select tests.as_postgres();
select is((select count(*)::int from public.audit_logs where action = 'resource.image_changed' and entity_id = :'gh'), 2, 'image changes are audit-logged');

select tests.as_user(:'student');
select is(public.get_student_resource('github-student-developer-pack') ->> 'logo_path', :'logo', 'students get the logo path');
select is(public.get_student_resource('github-student-developer-pack') ->> 'cover_path', :'cover', 'students get the cover path');
select throws_ok(format('select public.admin_set_student_resource_image(%L, %L, null)', :'gh', 'logo'), 'P0001', 'forbidden',
  'students cannot change images');
select tests.as_postgres();

select tests.as_user(:'padmin', 'aal2');
select is(public.admin_set_student_resource_image(:'gh', 'logo', null), :'logo', 'clearing the logo returns the old path to remove');
select tests.as_postgres();
select is((select logo_path from public.student_resources where id = :'gh'), null, 'the logo is cleared');

select * from finish();
rollback;
