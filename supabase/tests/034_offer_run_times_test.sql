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
select set_config('perqly.seed_pilot', 'on', true);

select id as gctu from public.institutions where slug = 'gctu' \gset
select id as beauty from public.merchant_categories where slug = 'beauty' \gset
select tests.create_user('owner@times.example', 'Abena Owner') as owner \gset
select tests.create_user('admin@times.example', 'Perqly Admin') as padmin \gset
select tests.create_user('ama@times.example', 'Ama Mensah') as s1 \gset
select tests.create_user('other@times.example', 'Other Owner') as other \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin');
select tests.as_user(:'s1'); select public.upsert_student_profile(:'gctu');
select tests.as_postgres(); select tests.verify(:'s1');

select tests.as_user(:'owner', 'aal2');
select public.register_merchant('Timed Barbers', :'beauty') as m \gset
select public.upsert_merchant_branch(:'m', null, 'Tesano', null, null, 'Accra', null, 5.6145, -0.2310) as b1 \gset
select public.upsert_catalogue_item(:'m', 'service', null, 'Haircut', 80) as cut \gset
select public.upsert_offer(:'m', null, 'service', :'cut', 'percentage', 20, 'Show your pass') as o1 \gset
select public.sign_merchant_agreement(:'m', 1, 'Abena Owner', 'Owner', 'Timed Barbers Ltd', true);
select public.submit_merchant_for_review(:'m');
select tests.as_user(:'padmin', 'aal2'); select public.decide_merchant(:'m', 'approve');
select tests.as_user(:'owner', 'aal2'); select public.submit_offer(:'o1');
select tests.as_user(:'padmin', 'aal2'); select public.moderate_offer(:'o1', 'approve');
select tests.as_postgres();
select token as t1 from public.merchant_qr_codes where branch_id = :'b1' and status = 'active' \gset

-- Every day by default ------------------------------------------------------------------------
select is((select run_days from public.offers where id = :'o1'), null::smallint[], 'a new deal runs every day');
select ok(private.offer_running_now(:'o1'), 'so it is running now');

-- Days and times, checked at fixed moments (Ghana time = UTC) --------------------------------
select tests.as_user(:'owner', 'aal2');
select lives_ok(format('select public.set_offer_run_times(%L, %L, %L, %L)', :'o1', '{4,2,2}', '14:00', '17:00'),
  'the owner sets Tuesday and Thursday, 2 to 5 pm, on a live deal');
select is((select run_days from public.offers where id = :'o1'), '{2,4}'::smallint[], 'days are stored sorted, without repeats');
select is((select status::text from public.offers where id = :'o1'), 'active', 'changing the times keeps the deal live');
select ok(private.offer_runs_at(:'o1', '2026-11-24 15:00+00'), 'Tuesday 3 pm: on');
select ok(private.offer_runs_at(:'o1', '2026-11-26 14:00+00'), 'Thursday 2 pm: on, from the start time');
select ok(not private.offer_runs_at(:'o1', '2026-11-24 17:00+00'), 'Tuesday 5 pm: off, the end time is not included');
select ok(not private.offer_runs_at(:'o1', '2026-11-24 13:59+00'), 'Tuesday 1:59 pm: off');
select ok(not private.offer_runs_at(:'o1', '2026-11-25 15:00+00'), 'Wednesday 3 pm: off');

select lives_ok(format('select public.set_offer_run_times(%L, %L, null, null)', :'o1', '{6,7}'), 'weekends, all day');
select ok(private.offer_runs_at(:'o1', '2026-11-28 00:30+00'), 'Saturday just after midnight: on');
select ok(not private.offer_runs_at(:'o1', '2026-11-27 23:59+00'), 'Friday night: off');

select lives_ok(format('select public.set_offer_run_times(%L, %L, null, null)', :'o1', '{1,2,3,4,5,6,7}'), 'all seven days');
select is((select run_days from public.offers where id = :'o1'), null::smallint[], 'is saved as every day');

select throws_ok(format('select public.set_offer_run_times(%L, %L, null, null)', :'o1', '{0,8}'), 'P0001', 'run_days_invalid', 'days must be 1 to 7');
select throws_ok(format('select public.set_offer_run_times(%L, %L, null, null)', :'o1', '{}'), 'P0001', 'run_days_invalid', 'at least one day');
select throws_ok(format('select public.set_offer_run_times(%L, null, %L, %L)', :'o1', '17:00', '14:00'), 'P0001', 'run_times_invalid', 'the end comes after the start');
select throws_ok(format('select public.set_offer_run_times(%L, null, %L, null)', :'o1', '14:00'), 'P0001', 'run_times_invalid', 'a start needs an end');
select tests.as_user(:'other', 'aal2');
select throws_ok(format('select public.set_offer_run_times(%L, null, null, null)', :'o1'), 'P0001', 'forbidden', 'other people cannot change the times');

-- Redeeming follows the times ---------------------------------------------------------------
select tests.as_postgres();
select extract(isodow from now() at time zone 'Africa/Accra')::int as today \gset
update public.offers set run_days = array[(:today % 7) + 1]::smallint[] where id = :'o1';
select ok(not private.offer_running_now(:'o1'), 'set to run only tomorrow, it is not running now');
select tests.as_user(:'s1');
select is(public.open_redemption_session(:'t1', null, gen_random_uuid()) ->> 'error', 'no_eligible_offers', 'so a student cannot redeem it now');
select is((select count(*)::int from public.offer_run_times(array[:'o1']::uuid[]) where not running_now), 1, 'the app sees its times and that it is not on now');
select tests.as_postgres();
update public.offers set run_days = array[:today]::smallint[] where id = :'o1';
select tests.as_user(:'s1');
select is(public.open_redemption_session(:'t1', null, gen_random_uuid()) ->> 'ok', 'true', 'on its day, the student can redeem');

select * from finish();
rollback;
