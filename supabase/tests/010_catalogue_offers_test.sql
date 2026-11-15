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
-- Prices an arbitrary item and discount through the real pricing function.
create function tests.price(p_regular numeric, p_type public.discount_type, p_value numeric)
returns text language plpgsql as $$
declare v_m uuid; v_s uuid; v_o uuid; v_out text;
begin
  select id into v_m from public.merchants limit 1;
  insert into public.services (merchant_id, name, regular_price) values (v_m, 'Price test', p_regular) returning id into v_s;
  -- The table checks allow any positive fixed value; the pricing function decides validity.
  insert into public.offers (merchant_id, service_id, conditions, discount_type, discount_value, created_by)
  values (v_m, v_s, 'Test', p_type, p_value, (select created_by from public.merchants where id = v_m)) returning id into v_o;
  select coalesce((select regular_price || '/' || discount_amount || '/' || final_price from private.price_offer(v_o)), 'unavailable') into v_out;
  return v_out;
end;
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;
select plan(42);
-- These tests create practice institutions as listed; the accreditation guard has its own tests (020).
select set_config('perqly.seed_pilot', 'on', true);

select id as gctu from public.institutions where slug = 'gctu' \gset
insert into public.institutions (slug, name, short_name, status) values ('test-u', 'Test University', 'TU', 'pilot') returning id as testu \gset
select id as beauty from public.merchant_categories where slug = 'beauty' \gset
select id as food from public.merchant_categories where slug = 'food' \gset
select tests.create_user('owner@shop.example', 'Abena Owner') as owner \gset
select tests.create_user('admin@perqly.example', 'Perqly Admin') as padmin \gset
select tests.create_user('gctu@student.example', 'Ama Gctu') as sgctu \gset
select tests.create_user('tu@student.example', 'Kofi Tu') as stu \gset
select tests.create_user('new@student.example', 'New Student') as snew \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin');
select tests.as_user(:'sgctu'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'stu'); select public.upsert_student_profile(:'testu');

-- Fixture: an approved barber with one branch and a service.
select tests.as_user(:'owner', 'aal2');
select public.register_merchant('Fresh Fade Barbers', :'beauty') as m \gset
select public.upsert_merchant_branch(:'m', null, 'Tesano') as b1 \gset
select public.upsert_merchant_branch(:'m', null, 'Madina') as b2 \gset
select public.sign_merchant_agreement(:'m', 1, 'Abena Owner', 'Owner', 'Fresh Fade Ltd', true);
select public.submit_merchant_for_review(:'m');
select tests.as_user(:'padmin', 'aal2'); select public.decide_merchant(:'m', 'approve');

-- 1. Pricing: the spec's worked examples ----------------------------------------------
select tests.as_postgres();
select is(tests.price(80, 'percentage', 20), '80.00/16.00/64.00', '20% off 80.00 = 16.00 off, 64.00 to pay');
select is(tests.price(35, 'percentage', 15), '35.00/5.25/29.75', '15% off 35.00 = 5.25 off');
select is(tests.price(45, 'percentage', 12.5), '45.00/5.63/39.37', '12.5% off 45.00 rounds 5.625 half away from zero to 5.63');
select is(tests.price(150, 'fixed_amount', 10), '150.00/10.00/140.00', 'GH₵10 off 150.00');
select is(tests.price(30, 'fixed_price', 25), '30.00/5.00/25.00', 'a student price of 25.00 on a 30.00 item is 5.00 off');
select is(tests.price(8, 'fixed_amount', 10), 'unavailable', 'a fixed discount at or above the price makes the offer unavailable');
select is(tests.price(8, 'fixed_price', 8), 'unavailable', 'a student price equal to the regular price is unavailable');

-- 2. Catalogue and offers by the merchant -----------------------------------------------
select tests.as_user(:'owner', 'aal2');
select public.upsert_catalogue_item(:'m', 'service', null, 'Haircut and beard trim', 80, 'Fade and lineup', 45) as cut \gset
select public.upsert_catalogue_item(:'m', 'product', null, 'Beard oil', 50, null, null, 'OIL-1') as oil \gset
select throws_ok(format('select public.upsert_catalogue_item(%L, %L, null, %L, %s, null, null, %L)', :'m', 'product', 'Oil 2', 20, 'OIL-1'), 'P0001', 'sku_in_use',
  'SKUs are unique per business');
select throws_ok(format('select public.upsert_catalogue_item(%L, %L, null, %L, 0)', :'m', 'service', 'Free'), 'P0001', 'price_invalid', 'a price must be above zero');
select throws_ok(format('select public.upsert_offer(%L, null, %L, %L, %L, 95, %L)', :'m', 'service', :'cut', 'percentage', 'Show your pass'), 'P0001', 'discount_invalid',
  'a percentage over 90 is refused');
select public.upsert_offer(:'m', null, 'service', :'cut', 'percentage', 20, 'Show your Perqly pass before paying') as o1 \gset
select throws_ok(format('select public.upsert_offer(%L, null, %L, %L, %L, 60, %L)', :'m', 'product', :'oil', 'fixed_amount', 'x conditions'), 'P0001', 'discount_not_below_price',
  'a fixed discount must be below the item price');
select throws_ok(format('select public.upsert_offer(%L, null, %L, %L, %L, 10, %L)', :'m', 'service', gen_random_uuid(), 'percentage', 'Conditions'), 'P0001', 'item_not_found',
  'an offer must point to the business''s own item');
select is((select status::text from public.offers where id = :'o1'), 'draft', 'a new offer is a draft');

-- 3. Visibility --------------------------------------------------------------------
select tests.as_user(:'sgctu');
select is((select count(*)::int from public.list_offers()), 0, 'drafts are not listed');
select is((select count(*)::int from public.offers), 0, 'students cannot read the offers table directly');
select tests.as_user(:'owner', 'aal2');
select is(public.submit_offer(:'o1')::text, 'pending_review', 'a business''s first offers go to Perqly review');
select tests.as_user(:'sgctu');
select is((select count(*)::int from public.list_offers()), 0, 'offers in review are not listed');
select tests.as_user(:'padmin', 'aal2');
select throws_ok(format('select public.moderate_offer(%L, %L)', :'o1', 'reject'), 'P0001', 'reason_required', 'a rejection needs a reason');
select lives_ok(format('select public.moderate_offer(%L, %L)', :'o1', 'approve'), 'an admin approves the offer');
select tests.as_user(:'sgctu');
select is((select item_name || ' ' || final_price from public.list_offers()), 'Haircut and beard trim 64.00', 'students see the live offer with the server''s price');
select is((select count(*)::int from public.list_offers('beard')), 1, 'search finds it by item name');
select is((select count(*)::int from public.list_offers('fresh')), 1, 'search finds it by business name');
select is((select count(*)::int from public.list_offers('pizza')), 0, 'search excludes non-matches');
select is((select count(*)::int from public.list_offers(null, 'beauty')), 1, 'the category filter includes it');
select is((select count(*)::int from public.list_offers(null, 'food')), 0, 'other categories exclude it');
select tests.as_user(:'snew');
select is((select count(*)::int from public.list_offers()), 1, 'a student who hasn''t chosen a school can browse offers for everyone (D1)');

-- 4. Institution and branch scope ----------------------------------------------------
select tests.as_user(:'owner', 'aal2');
select public.upsert_offer(:'m', null, 'product', :'oil', 'fixed_price', 40, 'One bottle per visit', 'Student oil price', null, null, null, 1, 'week', 5,
  array[:'testu']::uuid[], array[:'b2']::uuid[]) as o2 \gset
select is(public.submit_offer(:'o2')::text, 'pending_review', 'the second offer is reviewed too');
select tests.as_user(:'padmin', 'aal2'); select public.moderate_offer(:'o2', 'approve');
select tests.as_user(:'stu');
select is((select count(*)::int from public.list_offers()), 2, 'a Test University student sees the offer scoped to their school');
select is((public.get_offer(:'o2') -> 'branches' -> 0 ->> 'name'), 'Madina', 'and only the branch it is limited to');
select tests.as_user(:'sgctu');
select is((select count(*)::int from public.list_offers()), 1, 'a GCTU student does not see an offer scoped to another school');
select is(public.get_offer(:'o2'), null, 'nor can they open it directly');

-- 5. Merchant controls, and live-state changes ----------------------------------------
select tests.as_user(:'owner', 'aal2');
select throws_ok(format('select public.upsert_offer(%L, %L, %L, %L, %L, 30, %L)', :'m', :'o1', 'service', :'cut', 'percentage', 'Changed'), 'P0001', 'offer_not_editable',
  'a live offer cannot be edited in place');
select lives_ok(format('select public.set_offer_state(%L, %L)', :'o1', 'pause'), 'the owner pauses it');
select tests.as_user(:'sgctu');
select is((select count(*)::int from public.list_offers()), 0, 'a paused offer disappears');
select tests.as_user(:'owner', 'aal2');
select public.upsert_catalogue_item(:'m', 'service', :'cut', 'Haircut and beard trim', 80, null, 45, null, false);
select public.set_offer_state(:'o1', 'resume');
select tests.as_user(:'sgctu');
select is((select count(*)::int from public.list_offers()), 0, 'an offer on an inactive item is hidden');
select tests.as_user(:'owner', 'aal2');
select public.upsert_catalogue_item(:'m', 'service', :'cut', 'Haircut and beard trim', 80, null, 45);
select tests.as_user(:'padmin', 'aal2'); select public.decide_merchant(:'m', 'suspend', 'Investigating complaints');
select tests.as_user(:'sgctu');
select is((select count(*)::int from public.list_offers()), 0, 'a suspended business''s offers disappear');
select is(public.get_merchant_page((select slug from public.merchants where id = :'m')), null, 'and so does its page');
select tests.as_user(:'padmin', 'aal2'); select public.decide_merchant(:'m', 'reinstate');

-- 6. Favourites -------------------------------------------------------------------
select tests.as_user(:'sgctu');
insert into public.favourites (student_id, merchant_id) values (:'sgctu', :'m');
select is((select display_name from public.list_favourite_merchants()), 'Fresh Fade Barbers', 'a student saves a business');
select throws_ok(format('insert into public.favourites (student_id, merchant_id) values (%L, %L)', :'stu', :'m'), '42501', null,
  'a student cannot add favourites for someone else');
select tests.as_user(:'stu');
select is((select count(*)::int from public.favourites), 0, 'favourites are private');

-- 7. Expiry job ---------------------------------------------------------------------
select tests.as_postgres();
update public.offers set starts_at = now() - interval '2 days', ends_at = now() - interval '1 hour' where id = :'o1';
select is(public.expire_offers(), 1, 'the job expires offers past their end date');
select is(has_function_privilege('authenticated', 'public.expire_offers()', 'execute'), false, 'only the server job can run it');

select * from finish();
rollback;
