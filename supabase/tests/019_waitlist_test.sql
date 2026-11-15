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
select plan(10);

select tests.create_user('support@perqly.example', 'Perqly Support') as sup \gset
select tests.create_user('ama@student.example', 'Ama Mensah') as s1 \gset
insert into public.platform_staff (user_id, role) values (:'sup', 'support');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select lives_ok($$select public.join_waitlist('  Kofi@Example.com ', 'hero')$$, 'a visitor can join');
select lives_ok($$select public.join_waitlist('kofi@example.com', 'final')$$, 'joining twice is quietly accepted');
select throws_ok($$select public.join_waitlist('not-an-email', 'hero')$$, 'P0001', 'email_invalid', 'bad emails are refused');
select lives_ok($$select public.join_waitlist('KOFI@example.com', 'hero')$$, 'a third try is still fine');
select throws_ok($$select public.join_waitlist('kofi@example.com', 'hero')$$, 'P0001', 'rate_limited', 'the same email is limited to 3 tries a day');
select throws_ok($$select count(*) from public.waitlist$$, '42501', null, 'visitors cannot read the list');
reset role;

select is((select count(*)::int from public.waitlist), 1, 'one entry, stored once');
select is((select email::text || ':' || source from public.waitlist), 'kofi@example.com:hero', 'email is normalised, first source kept');

select tests.as_user(:'s1', 'aal2');
select is((select count(*)::int from public.waitlist), 0, 'students cannot read the list');
select tests.as_user(:'sup', 'aal2');
select is((select count(*)::int from public.waitlist), 1, 'support staff can read it');

select * from finish();
rollback;
