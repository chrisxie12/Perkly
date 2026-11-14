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
select plan(16);

select tests.create_user('ama@example.com', 'Ama Kwarteng', 'student') as ama \gset
select tests.create_user('kofi@example.com', 'Kofi Mensah') as kofi \gset
select tests.create_user('boss@example.com', 'Esi Boss') as boss \gset
insert into public.platform_staff (user_id, role) values (:'boss', 'super_admin');

-- Sign-up trigger
select is((select full_name from public.profiles where id = :'ama'), 'Ama Kwarteng', 'sign-up creates a profile with the full name');
select is((select first_name from public.profiles where id = :'ama'), 'Ama', 'first name is derived from the full name');
select is((select signup_intent from public.profiles where id = :'ama'), 'student', 'sign-up intent is stored');

-- Profile isolation
select tests.as_user(:'ama');
select results_eq($$ select id from public.profiles $$, array[:'ama'::uuid], 'a user sees only their own profile');
select lives_ok($$ update public.profiles set full_name = 'Ama K. Kwarteng' where id = auth.uid() $$, 'a user can rename themselves');
select throws_ok($$ update public.profiles set is_suspended = false where id = auth.uid() $$, '42501', null,
  'a user cannot change their suspension flag');
update public.profiles set full_name = 'Hacked' where id = :'kofi';
select tests.as_postgres();
select is((select full_name from public.profiles where id = :'kofi'), 'Kofi Mensah', 'a user cannot rename someone else');

select tests.as_anon();
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anonymous visitors cannot read profiles');
select tests.as_postgres();

-- Staff privileges need two-factor
select tests.as_user(:'boss', 'aal1');
select is(private.is_staff('admin'), false, 'staff privileges do not apply without two-factor');
select throws_ok(format('select public.set_platform_role(%L, %L)', :'kofi', 'support'), 'P0001', 'forbidden',
  'a super admin without two-factor cannot grant roles');
select tests.as_postgres();

select tests.as_user(:'boss', 'aal2');
select is(private.is_staff('admin'), true, 'a super admin with two-factor counts as admin');
select lives_ok(format('select public.set_platform_role(%L, %L)', :'kofi', 'support'), 'a super admin with two-factor can grant a role');
select tests.as_postgres();
select is((select role::text from public.platform_staff where user_id = :'kofi'), 'support', 'the role was granted');
select is((select count(*)::int from public.audit_logs where action = 'platform.role_changed' and entity_id = :'kofi'), 1, 'the change is audited');

select tests.as_user(:'ama', 'aal2');
select throws_ok(format('select public.set_platform_role(%L, %L)', :'ama', 'super_admin'), 'P0001', 'forbidden',
  'a non-staff user cannot grant roles, even to themselves');
select throws_ok(format('select public.set_account_suspension(%L, true, %L)', :'kofi', 'spam'), 'P0001', 'forbidden',
  'a non-staff user cannot suspend accounts');
select tests.as_postgres();

select * from finish();
rollback;
