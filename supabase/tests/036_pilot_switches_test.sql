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
create function tests.verify(p_user uuid, p_until interval default interval '1 year')
returns void language sql as $$
  update public.student_profiles
     set verification_status = 'verified', verified_at = now() - interval '2 years', verified_until = now() + p_until
   where user_id = p_user;
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;
select no_plan();

select tests.create_user('ama@switch.example', 'Ama Mensah') as s1 \gset
select tests.create_user('admin@switch.example', 'Perqly Admin') as padmin \gset
select tests.create_user('boss@switch.example', 'Perqly Boss') as boss \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin'), (:'boss', 'super_admin');

select tests.as_user(:'s1');
select is(public.feature_switches(), '{"friends": false, "bookings": false, "campus": false}'::jsonb, 'the pilot starts with Friends, Bookings and Campus off');
select throws_ok(format('select public.admin_set_feature_switch(%L, true)', 'pilot.friends_enabled'), 'P0001', 'forbidden', 'students cannot switch features');

select tests.as_user(:'padmin', 'aal2');
select throws_ok(format('select public.admin_set_feature_switch(%L, true)', 'pilot.friends_enabled'), 'P0001', 'forbidden', 'nor can admins below super admin');

select tests.as_user(:'boss', 'aal2');
select lives_ok(format('select public.admin_set_feature_switch(%L, true)', 'pilot.bookings_enabled'), 'a super admin switches Bookings on');
select is((public.feature_switches() ->> 'bookings')::boolean, true, 'and everyone sees it on');
select throws_ok(format('select public.admin_set_feature_switch(%L, true)', 'billing.enabled'), 'P0001', 'setting_not_tunable', 'only the pilot switches can be changed here');
select tests.as_postgres();
select ok(exists (select 1 from public.audit_logs where action = 'platform.setting_changed'), 'the change is in the audit log');

select * from finish();
rollback;
