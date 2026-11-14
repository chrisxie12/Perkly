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
select plan(10);

select has_extension('pgcrypto', 'pgcrypto is installed');
select has_extension('citext', 'citext is installed');
select has_extension('pg_trgm', 'pg_trgm is installed');

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every table in public has row level security enabled'
);

select is(
  (select value #>> '{}' from private.app_settings where key = 'redemption.select_window_seconds'),
  '300', 'item selection window is 5 minutes (decision D5)'
);
select is(
  (select value #>> '{}' from private.app_settings where key = 'redemption.confirm_window_seconds'),
  '600', 'confirmation window is 10 minutes (decision D5)'
);

-- Rate limiting
select lives_ok($$ select private.check_rate_limit('test.action', 2, interval '1 minute', 'subject-1') $$, 'first attempt allowed');
select lives_ok($$ select private.check_rate_limit('test.action', 2, interval '1 minute', 'subject-1') $$, 'second attempt allowed');
select throws_ok($$ select private.check_rate_limit('test.action', 2, interval '1 minute', 'subject-1') $$,
  'P0001', 'rate_limited', 'third attempt inside the window is refused');

-- Audit log is append-only, even for the table owner
select private.write_audit('test.event', 'system', 'test', gen_random_uuid());
select throws_ok($$ update public.audit_logs set action = 'test.changed' $$, '42501', 'audit_logs is append-only',
  'audit rows cannot be updated');

select * from finish();
rollback;
