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
select plan(13);

select id as gctu from public.institutions where slug = 'gctu' \gset
select id as beauty from public.merchant_categories where slug = 'beauty' \gset
delete from public.campuses where institution_id = :'gctu';
insert into public.campuses (institution_id, name, latitude, longitude) values (:'gctu', 'Tesano', 5.6140, -0.2330) returning id as campus \gset
select tests.create_user('owner@shop.example', 'Abena Owner') as owner \gset
select tests.create_user('admin@perqly.example', 'Perqly Admin') as padmin \gset
select tests.create_user('ama@student.example', 'Ama Mensah') as s1 \gset
select tests.create_user('kofi@student.example', 'Kofi Boateng') as s2 \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin');
select tests.as_user(:'s1'); select public.upsert_student_profile(:'gctu', :'campus');
select tests.as_user(:'s2'); select public.upsert_student_profile(:'gctu');
select tests.as_postgres(); select tests.verify(:'s1');

select tests.as_user(:'owner', 'aal2');
select public.register_merchant('Fresh Fade Barbers', :'beauty') as m \gset
select public.upsert_merchant_branch(:'m', null, 'Far branch', null, 'Madina', 'Accra', null, 5.6800, -0.1650);
select public.upsert_merchant_branch(:'m', null, 'Near branch', null, 'Tesano', 'Accra', null, 5.6150, -0.2320, null, 'Mon–Sat 8am–9pm');
select public.upsert_catalogue_item(:'m', 'service', null, 'Haircut', 80) as cut \gset
select public.sign_merchant_agreement(:'m', 1, 'Abena Owner', 'Owner', 'Fresh Fade Ltd', true);
select public.submit_merchant_for_review(:'m');
select tests.as_user(:'padmin', 'aal2'); select public.decide_merchant(:'m', 'approve');
select tests.as_user(:'owner', 'aal2');
select public.upsert_offer(:'m', null, 'service', :'cut', 'fixed_price', 64, 'Show your pass') as o1 \gset
select public.submit_offer(:'o1');
select tests.as_user(:'padmin', 'aal2'); select public.moderate_offer(:'o1', 'approve');

select tests.as_user(:'s1');
select is((select branch_name from public.list_deals()), 'Near branch', 'the nearest branch to the student''s campus is shown');
select ok((select distance_m between 100 and 200 from public.list_deals()), 'the distance from campus is in metres');
select is((select campus_name from public.list_deals()), 'Tesano', 'the campus used is named');
select is((select opening_hours from public.list_deals()), 'Mon–Sat 8am–9pm', 'the branch''s hours come along');
select tests.as_user(:'s2');
select is((select branch_name from public.list_deals()), 'Near branch', 'a student without a campus still gets their institution''s only campus');

-- Opening hours: open every day 00:00 to 23:59 means open now; a closed week means closed.
select tests.as_user(:'owner', 'aal2');
select (select id from public.merchant_branches where name = 'Near branch') as near \gset
select public.set_branch_hours(:'near', (select jsonb_agg(jsonb_build_object('weekday', d, 'opens', '00:00', 'closes', '23:59')) from generate_series(1, 7) d));
select tests.as_user(:'s1');
select is((select open_now from public.list_deals()), true, 'a branch open all day shows as open now');
select ok((select open_until = '23:59' from public.list_deals()), 'with its closing time');
select tests.as_user(:'owner', 'aal2');
select throws_ok(format('select public.set_branch_hours(%L, %L)', :'near', '[{"weekday": 9, "opens": "08:00", "closes": "20:00"}]'), 'P0001', 'hours_invalid', 'bad days are refused');
select public.set_branch_hours(:'near', '[]');
select tests.as_user(:'s1');
select is((select has_hours from public.list_deals()), false, 'with no hours set, the app says nothing about opening');
select tests.as_user(:'s2');
select throws_ok(format('select public.set_branch_hours(%L, %L)', :'near', '[]'), 'P0001', 'forbidden', 'students cannot set hours');

-- Savings summary from real redemptions only.
select tests.as_user(:'s1');
select is((public.my_savings_summary() ->> 'redemptions')::int, 0, 'no redemptions yet');
select is(jsonb_array_length(public.my_savings_summary() -> 'by_month'), 6, 'six months are listed, even when empty');
select tests.as_postgres();
select is(public.my_savings_summary(), null, 'signed-out callers get nothing');

select * from finish();
rollback;
