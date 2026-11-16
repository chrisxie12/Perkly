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
select plan(19);

select id as gctu from public.institutions where slug = 'gctu' \gset
select id as food from public.merchant_categories where slug = 'food' \gset
select tests.create_user('owner@rate.example', 'Abena Owner') as owner \gset
select tests.create_user('admin@perqly.example', 'Perqly Admin') as padmin \gset
select tests.create_user('ama@student.example', 'Ama Mensah') as s1 \gset
select tests.create_user('yaw@student.example', 'Yaw Boateng') as s2 \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin');
select tests.as_user(:'s1'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s2'); select public.upsert_student_profile(:'gctu');

select tests.as_user(:'owner', 'aal2');
select public.register_merchant('Rate Me Kitchen', :'food') as m \gset
select public.upsert_merchant_branch(:'m', null, 'Tesano', null, 'Tesano', 'Accra', null, 5.6150, -0.2320) as b \gset
select public.sign_merchant_agreement(:'m', 1, 'Abena Owner', 'Owner', 'Rate Me Ltd', true);
select public.submit_merchant_for_review(:'m');
select tests.as_user(:'padmin', 'aal2'); select public.decide_merchant(:'m', 'approve');

select tests.as_user(:'owner', 'aal2');
select public.upsert_catalogue_item(:'m', 'service', null, 'Jollof and chicken', 50) as item \gset
select public.upsert_offer(:'m', null, 'service', :'item', 'percentage', 20, 'Show your pass') as o1 \gset

-- Ama visited; Yaw didn't.
select tests.as_postgres();
select id as qr from public.merchant_qr_codes where branch_id = :'b' and status = 'active' \gset
insert into public.redemption_sessions (public_ref, student_id, client_request_id, qr_code_id, branch_id, merchant_id, institution_id,
  status, offer_id, item_name, regular_price, discount_type, discount_value, discount_amount, final_price, pass_code,
  merchant_confirmed_at, completed_at, expires_at)
values ('PQ-ABCD2345', :'s1', gen_random_uuid(), :'qr', :'b', :'m', :'gctu', 'completed', :'o1', 'Jollof and chicken', 50,
  'percentage', 20, 10, 40, '1234', now(), now(), now() + interval '10 minutes');

select tests.as_user(:'s2');
select is((public.get_my_review(:'m') ->> 'can_review')::boolean, false, 'a student who has not visited cannot rate');
select throws_ok(format('select public.submit_merchant_review(%L, 5)', :'m'), 'P0001', 'visit_required', 'rating without a visit is refused');

select tests.as_user(:'s1');
select is((public.get_my_review(:'m') ->> 'can_review')::boolean, true, 'a student who completed a redemption can rate');
select throws_ok(format('select public.submit_merchant_review(%L, 6)', :'m'), 'P0001', 'rating_invalid', 'ratings are 1 to 5');
select throws_ok(format('select public.submit_merchant_review(%L, 4, %L)', :'m', repeat('a', 501)), 'P0001', 'comment_too_long', 'comments are capped');
select public.submit_merchant_review(:'m', 4, 'Big portions, quick service');
select is((select rating from public.merchant_ratings(array[:'m'::uuid])), 4.0, 'the average shows');
select is((select reviews from public.merchant_ratings(array[:'m'::uuid])), 1, 'with a count');
select public.submit_merchant_review(:'m', 5, 'Even better the second time');
select is((select count(*)::int from public.merchant_reviews where merchant_id = :'m'), 1, 'rating again updates the same rating');
select is((select rating from public.merchant_ratings(array[:'m'::uuid])), 5.0, 'with the new score');
select is((select author from public.list_merchant_reviews(:'m')), 'Ama M.', 'reviews show first name and initial only');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'owner' and kind = 'merchant.review'), 1, 'the shop is told once about a new rating');

-- Shop team reads them; staff can hide
select tests.as_user(:'owner', 'aal2');
select is((select count(*)::int from public.list_merchant_reviews(:'m')), 1, 'the shop sees its ratings');
select tests.as_postgres(); select id as rv from public.merchant_reviews limit 1 \gset
select tests.as_user(:'owner', 'aal2');
select throws_ok(format('select public.staff_set_review_hidden(%L, true)', :'rv'), 'P0001', 'forbidden', 'shops cannot hide ratings');
select tests.as_user(:'padmin', 'aal2');
select public.staff_set_review_hidden(:'rv', true);
select tests.as_user(:'s2');
select is((select count(*)::int from public.list_merchant_reviews(:'m')), 0, 'hidden ratings disappear for students');
select is((select count(*)::int from public.merchant_ratings(array[:'m'::uuid])), 0, 'and from the average');
select tests.as_user(:'s1');
select is((public.get_my_review(:'m') ->> 'hidden')::boolean, true, 'the author can see theirs was hidden');
select public.delete_my_review(:'m');
select is((public.get_my_review(:'m') ->> 'rating'), null, 'students can remove their rating');

-- Map lookups
select is((select latitude from public.branch_locations(array[:'b'::uuid])), 5.6150::double precision, 'branch locations are available for the map');
select tests.as_postgres(); set local role anon;
select throws_ok(format('select * from public.branch_locations(array[%L::uuid])', :'b'), '42501', null, 'not to signed-out visitors');
reset role;

select * from finish();
rollback;
