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
create function tests.as_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end;
$$;
grant execute on function tests.as_anon() to anon, authenticated, service_role;

select no_plan();
select set_config('perqly.seed_pilot', 'on', true);

select id as gctu from public.institutions where slug = 'gctu' \gset
select id as beauty from public.merchant_categories where slug = 'beauty' \gset
select tests.create_user('owner@preview.example', 'Abena Owner') as owner \gset
select tests.create_user('admin@preview.example', 'Perqly Admin') as padmin \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin');

select tests.as_user(:'owner', 'aal2');
select public.register_merchant('Preview Barbers', :'beauty') as m \gset
select public.upsert_merchant_branch(:'m', null, 'Tesano', null, null, 'Accra', null, 5.6145, -0.2310) as b1 \gset
select public.upsert_catalogue_item(:'m', 'service', null, 'Haircut', 80) as cut \gset
select public.upsert_offer(:'m', null, 'service', :'cut', 'percentage', 20, 'Show your pass') as o1 \gset
select public.upsert_offer(:'m', null, 'service', :'cut', 'percentage', 10, 'Draft only') as o2 \gset
select public.sign_merchant_agreement(:'m', 1, 'Abena Owner', 'Owner', 'Preview Barbers Ltd', true);
select public.submit_merchant_for_review(:'m');

-- Before approval, nothing is shown.
select tests.as_anon();
select is((select count(*)::int from public.deal_preview(:'o1')), 0, 'a business not yet approved shows nothing');

select tests.as_user(:'padmin', 'aal2'); select public.decide_merchant(:'m', 'approve');
select tests.as_user(:'owner', 'aal2'); select public.submit_offer(:'o1');
select tests.as_user(:'padmin', 'aal2'); select public.moderate_offer(:'o1', 'approve');

select tests.as_anon();
select is((select merchant_name from public.deal_preview(:'o1')), 'Preview Barbers', 'anyone with the link sees the shop name');
select is((select item from public.deal_preview(:'o1')), 'Haircut', 'the item');
select is((select final_price from public.deal_preview(:'o1')), 64.00::numeric, 'and the student price');
select is((select count(*)::int from public.deal_preview(:'o2')), 0, 'a draft deal shows nothing');
select is((select count(*)::int from public.deal_preview(gen_random_uuid())), 0, 'nor does a made-up link');

select tests.as_user(:'owner', 'aal2'); select public.set_offer_state(:'o1', 'pause');
select tests.as_anon();
select is((select count(*)::int from public.deal_preview(:'o1')), 0, 'a paused deal stops showing');

select * from finish();
rollback;
