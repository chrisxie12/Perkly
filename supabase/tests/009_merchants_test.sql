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
select plan(42);

select id as food from public.merchant_categories where slug = 'food' \gset
select tests.create_user('owner@shop.example', 'Abena Owner') as owner \gset
select tests.create_user('manager@shop.example', 'Kwame Manager') as manager \gset
select tests.create_user('cashier@shop.example', 'Esi Cashier') as cashier \gset
select tests.create_user('student@personal.example', 'Ama Student') as student \gset
select tests.create_user('admin@perqly.example', 'Perqly Admin') as padmin \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin');

-- 1. Registration -------------------------------------------------------------------
select tests.as_user(:'owner');
select public.register_merchant('Fresh Fade Barbers', :'food', '024 123 4567', 'hello@freshfade.example', 'Cuts near campus') as m \gset
select is((select status::text from public.merchants where id = :'m'), 'draft', 'a new business starts as a draft');
select is((select role::text from public.merchant_users where merchant_id = :'m' and user_id = :'owner'), 'owner', 'the person who registers becomes the owner');
select ok((select slug from public.merchants where id = :'m') ~ '^fresh-fade-barbers-[0-9a-f]{4}$', 'the slug comes from the name');
select throws_ok(format('select public.register_merchant(%L, %L)', 'X Shop', gen_random_uuid()), 'P0001', 'category_invalid', 'an unknown category is refused');
select tests.as_user(:'student');
select is((select count(*)::int from public.merchants where id = :'m'), 0, 'other users cannot see a draft business');
select tests.as_postgres();
select is((select count(*)::int from public.audit_logs where action = 'merchant.registered' and merchant_id = :'m'), 1, 'registration is audited');

-- 2. Owner needs two-factor; profile and branches ---------------------------------
select tests.as_user(:'owner', 'aal1');
select throws_ok(format('select public.update_merchant_profile(%L, %L, %L)', :'m', 'Fresh Fade', :'food'), 'P0001', 'forbidden',
  'the owner needs two-factor to change the business');
select tests.as_user(:'owner', 'aal2');
select lives_ok(format('select public.update_merchant_profile(%L, %L, %L, null, %L)', :'m', 'Fresh Fade', :'food', 'Fades and trims'),
  'with two-factor the owner updates the profile');
select throws_ok(format('select public.submit_merchant_for_review(%L)', :'m'), 'P0001', 'branch_required', 'a business needs a branch before review');
select public.upsert_merchant_branch(:'m', null, 'Tesano', 'Opposite GCTU main gate', 'Tesano', 'Accra', 'ga-123-4567', 5.6145, -0.2310) as b1 \gset
select public.upsert_merchant_branch(:'m', null, 'Madina', null, 'Madina') as b2 \gset
select throws_ok(format('select public.upsert_merchant_branch(%L, null, %L)', :'m', 'Tesano'), 'P0001', 'branch_name_in_use', 'branch names are unique per business');
select throws_ok(format('select public.upsert_merchant_branch(%L, null, %L, null, null, %L, %L)', :'m', 'Lapaz', 'Accra', 'nowhere'), 'P0001',
  'digital_address_invalid', 'an invalid GhanaPost address is refused');
select is((select digital_address from public.merchant_branches where id = :'b1'), 'GA-123-4567', 'the digital address is upper-cased');

-- 3. Team --------------------------------------------------------------------------
select public.add_merchant_user(:'m', 'Manager@Shop.Example', 'manager') as mgr_member \gset
select throws_ok(format('select public.add_merchant_user(%L, %L, %L)', :'m', 'cashier@shop.example', 'cashier'), 'P0001', 'branch_required',
  'a cashier must be assigned to at least one branch');
select throws_ok(format('select public.add_merchant_user(%L, %L, %L)', :'m', 'nobody@nowhere.example', 'manager'), 'P0001', 'user_not_found',
  'an email with no account is refused');
select throws_ok(format('select public.add_merchant_user(%L, %L, %L)', :'m', 'owner@shop.example', 'manager'), 'P0001', 'already_owner',
  'the owner cannot be added as a manager');
select tests.as_user(:'manager');
select throws_ok(format('select public.add_merchant_user(%L, %L, %L)', :'m', 'student@personal.example', 'manager'), 'P0001', 'forbidden',
  'a manager cannot add another manager');
select throws_ok(format('select public.add_merchant_user(%L, %L, %L, array[%L]::uuid[])', :'m', 'cashier@shop.example', 'cashier', gen_random_uuid()),
  'P0001', 'branch_not_found', 'a cashier cannot be assigned to another business''s branch');
select public.add_merchant_user(:'m', 'cashier@shop.example', 'cashier', array[:'b1']::uuid[]) as cashier_member \gset
select is((select string_agg(full_name || ':' || role, ',' order by role) from public.get_merchant_team(:'m')),
  'Abena Owner:owner,Kwame Manager:manager,Esi Cashier:cashier', 'managers see the team with names');
select tests.as_user(:'cashier');
select throws_ok(format('select * from public.get_merchant_team(%L)', :'m'), 'P0001', 'forbidden', 'a cashier cannot list the team');
select throws_ok(format('select public.upsert_merchant_branch(%L, null, %L)', :'m', 'Lapaz'), 'P0001', 'forbidden', 'a cashier cannot add branches');
select is(private.can_operate_branch(:'b1'), true, 'a cashier operates their assigned branch');
select is(private.can_operate_branch(:'b2'), false, 'a cashier cannot operate other branches');
select tests.as_user(:'manager');
select is(private.can_operate_branch(:'b2'), true, 'a manager operates every branch');
select throws_ok(format('select public.submit_merchant_for_review(%L)', :'m'), 'P0001', 'forbidden', 'only the owner submits for review');

-- 4. Review ------------------------------------------------------------------------
select tests.as_user(:'owner', 'aal2');
select lives_ok(format('select public.submit_merchant_for_review(%L)', :'m'), 'the owner submits with a branch in place');
select throws_ok(format('select public.submit_merchant_for_review(%L)', :'m'), 'P0001', 'merchant_not_editable', 'it cannot be submitted twice');
select throws_ok(format('select public.decide_merchant(%L, %L)', :'m', 'approve'), 'P0001', 'forbidden', 'the owner cannot approve their own business');
select tests.as_user(:'padmin', 'aal1');
select throws_ok(format('select public.decide_merchant(%L, %L)', :'m', 'approve'), 'P0001', 'forbidden', 'an admin needs two-factor to decide');
select tests.as_user(:'padmin', 'aal2');
select throws_ok(format('select public.decide_merchant(%L, %L)', :'m', 'reject'), 'P0001', 'reason_required', 'a rejection needs a reason');
select lives_ok(format('select public.decide_merchant(%L, %L)', :'m', 'approve'), 'an admin with two-factor approves');
select throws_ok(format('select public.decide_merchant(%L, %L)', :'m', 'approve'), 'P0001', 'invalid_transition', 'an approved business cannot be approved again');
select tests.as_user(:'student');
select is((select count(*)::int from public.merchants where id = :'m'), 1, 'students see the approved business');
select is((select count(*)::int from public.merchant_branches where merchant_id = :'m'), 2, 'and its active branches');
select tests.as_user(:'owner', 'aal2');
select public.upsert_merchant_branch(:'m', :'b2', 'Madina', null, 'Madina', 'Accra', null, null, null, null, null, false);
select tests.as_user(:'student');
select is((select count(*)::int from public.merchant_branches where merchant_id = :'m'), 1, 'a deactivated branch is hidden from students');
select is((select count(*)::int from public.merchant_users where merchant_id = :'m'), 0, 'students cannot see the business''s team');

-- 5. Suspension and removal --------------------------------------------------------
select tests.as_user(:'padmin', 'aal2');
select lives_ok(format('select public.decide_merchant(%L, %L, %L)', :'m', 'suspend', 'Complaints under review'), 'an admin suspends with a reason');
select tests.as_user(:'student');
select is((select count(*)::int from public.merchants where id = :'m'), 0, 'a suspended business disappears for students');
select tests.as_user(:'owner', 'aal2');
select throws_ok(format('select public.update_merchant_profile(%L, %L, %L)', :'m', 'Renamed', :'food'), 'P0001', 'merchant_suspended',
  'a suspended business cannot be edited');
select lives_ok(format('select public.remove_merchant_user(%L)', :'cashier_member'), 'the owner removes the cashier');
select tests.as_user(:'cashier');
select is(private.can_operate_branch(:'b1'), false, 'a removed cashier can no longer operate the branch');
select is(jsonb_array_length(public.get_my_context() -> 'merchant_roles'), 0, 'and has no merchant role in their context');
select tests.as_user(:'owner');
select is((public.get_my_context() -> 'merchant_roles' -> 0 ->> 'role'), 'owner', 'the owner''s context lists their business');

select * from finish();
rollback;
