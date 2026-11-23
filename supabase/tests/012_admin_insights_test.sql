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
select plan(21);

select id as gctu from public.institutions where slug = 'gctu' \gset
select id as food from public.merchant_categories where slug = 'food' \gset
select tests.create_user('ama@student.example', 'Ama Mensah') as s1 \gset
select tests.create_user('kojo@student.example', 'Kojo Boateng') as s2 \gset
select tests.create_user('owner@shop.example', 'Abena Owner') as owner \gset
select tests.create_user('admin@perqly.example', 'Perqly Admin') as padmin \gset
select tests.create_user('support@perqly.example', 'Perqly Support') as psupport \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin'), (:'psupport', 'support');
select tests.as_user(:'s1'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'owner', 'aal2');
select public.register_merchant('Chop Bar', :'food') as m \gset
select public.upsert_merchant_branch(:'m', null, 'Tesano') as b1 \gset

-- 1. Export --------------------------------------------------------------------------
select tests.as_user(:'s1');
select is(public.export_my_data() #>> '{account,email}', 'ama@student.example', 'the export includes the account email');
select ok(not (public.export_my_data() -> 'student_profile' ? 'student_id_hash'), 'the export leaves out the student ID hash');
select is(jsonb_typeof(public.export_my_data() -> 'redemptions'), 'array', 'the export lists redemptions');
select tests.as_user(:'s2');
select is(public.export_my_data() #>> '{account,email}', 'kojo@student.example', 'each user exports only their own data');

-- 2. Deletion requests --------------------------------------------------------------
select tests.as_user(:'s1');
select public.request_account_deletion('Leaving school') as req \gset
select is(public.request_account_deletion(), :'req'::uuid, 'a second request returns the open one');
select is((select count(*)::int from public.account_deletion_requests), 1, 'the student sees their own request');
select tests.as_user(:'s2');
select is((select count(*)::int from public.account_deletion_requests), 0, 'other users cannot see it');
select throws_ok(format('select public.resolve_account_deletion(%L, %L, %L)', :'req', 'completed', 'Done by support'), 'P0001', 'forbidden', 'students cannot resolve requests');
select tests.as_user(:'padmin', 'aal2');
select throws_ok(format('select public.resolve_account_deletion(%L, %L, %L)', :'req', 'declined', 'x'), 'P0001', 'reason_required', 'resolving needs a note');
select lives_ok(format('select public.resolve_account_deletion(%L, %L, %L)', :'req', 'declined', 'Duplicate of an earlier request'), 'an admin declines a request');
select throws_ok(format('select public.resolve_account_deletion(%L, %L, %L)', :'req', 'declined', 'Declined twice'), 'P0001', 'request_not_open', 'a handled request cannot be resolved again');
select tests.as_postgres();
select is((select count(*)::int from public.audit_logs where action like 'account.deletion_%'), 2, 'requests and resolutions are audited');

-- 3. Users, metrics, audit ---------------------------------------------------------
select tests.as_user(:'psupport', 'aal1');
select throws_ok('select * from public.admin_find_users(''ama'')', 'P0001', 'forbidden', 'support needs two-factor');
select tests.as_user(:'psupport', 'aal2');
select is((select email from public.admin_find_users('ama@')), 'ama@student.example', 'support finds a user by email');
select is((select count(*)::int from public.admin_find_users('a')), 0, 'very short searches return nothing');
select is((public.admin_platform_metrics() ->> 'students')::int, 1, 'support sees platform counts');
select throws_ok('select * from public.admin_audit_log()', 'P0001', 'forbidden', 'only admins read the audit log');
select tests.as_user(:'padmin', 'aal2');
select ok((select count(*) from public.admin_audit_log('merchant.')) >= 1, 'admins filter the audit log by action');
select tests.as_user(:'s1');
select throws_ok(format('select public.merchant_metrics(%L)', :'m'), 'P0001', 'forbidden', 'students cannot read business analytics');
select tests.as_user(:'owner', 'aal2');
select is((public.merchant_metrics(:'m') ->> 'redemptions_30d')::int, 0, 'the owner reads their analytics');
select tests.as_user(:'s1');
select is(public.unread_notification_count(), 0, 'the unread count starts at zero');

select * from finish();
rollback;
