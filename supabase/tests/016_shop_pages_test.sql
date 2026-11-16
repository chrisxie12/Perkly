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
select plan(22);

select id as gctu from public.institutions where slug = 'gctu' \gset
select id as food from public.merchant_categories where slug = 'food' \gset
select tests.create_user('owner@shop.example', 'Abena Owner') as owner \gset
select tests.create_user('other@shop.example', 'Yaw Other') as other \gset
select tests.create_user('admin@perqly.example', 'Perqly Admin') as padmin \gset
select tests.create_user('ama@student.example', 'Ama Mensah') as s1 \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin');
select tests.as_user(:'s1'); select public.upsert_student_profile(:'gctu');

select tests.as_user(:'owner', 'aal2');
select public.register_merchant('Auntie Akos Kitchen', :'food') as m \gset
select public.upsert_merchant_branch(:'m', null, 'Tesano', null, 'Tesano', 'Accra', null, 5.6150, -0.2320) as b \gset
select public.sign_merchant_agreement(:'m', 1, 'Abena Owner', 'Owner', 'Auntie Akos Ltd', true);
select public.submit_merchant_for_review(:'m');
select tests.as_user(:'padmin', 'aal2'); select public.decide_merchant(:'m', 'approve');
select tests.as_user(:'other', 'aal2');
select public.register_merchant('Other Shop', :'food') as m2 \gset

select slug as slug from public.merchants where id = :'m' \gset
-- Details
select tests.as_user(:'owner', 'aal2');
select lives_ok(format('select public.update_shop_details(%L, %L, %L, %L, %L, %L)', :'m', 'GH₵ 20–60', '0241234567',
  '{"instagram": "@auntieakos", "website": "https://auntieakos.com"}', '{Cash,"MTN MoMo"}', '{Dine-in,Takeaway}'), 'a manager can save shop details');
select is((select socials from public.merchants where id = :'m'), '{"instagram": "auntieakos", "website": "auntieakos.com"}'::jsonb, 'handles are stored without @ or https://');
select throws_ok(format('select public.update_shop_details(%L, null, null, %L, %L, %L)', :'m', '{}', '{Bitcoin}', '{}'), 'P0001', 'details_invalid', 'unknown ways to pay are refused');
select throws_ok(format('select public.update_shop_details(%L, null, null, %L, %L, %L)', :'m', '{"myspace": "x"}', '{}', '{}'), 'P0001', 'socials_invalid', 'unknown social accounts are refused');
select throws_ok(format('select public.update_shop_details(%L, null, null, %L, %L, %L)', :'m', '{"instagram": "bad handle!"}', '{}', '{}'), 'P0001', 'socials_invalid', 'bad handles are refused');
select throws_ok(format('select public.update_shop_details(%L, null, %L, %L, %L, %L)', :'m', '12', '{}', '{}', '{}'), 'P0001', 'details_invalid', 'a short WhatsApp number is refused');

-- Location
select lives_ok(format('select public.set_branch_location(%L, %L, %L, %s, %s)', :'b', 'Opposite the GCTU main gate', 'https://maps.app.goo.gl/abc123', 5.6151, -0.2321), 'a manager can set the landmark and map link');
select throws_ok(format('select public.set_branch_location(%L, null, %L, null, null)', :'b', 'https://evil.example/maps'), 'P0001', 'map_link_invalid', 'only Google Maps links are accepted');
select tests.as_user(:'other', 'aal2');
select throws_ok(format('select public.set_branch_location(%L, null, null, null, null)', :'b'), 'P0001', 'forbidden', 'another business cannot change the branch');
select throws_ok(format('select public.update_shop_details(%L, null, null, %L, %L, %L)', :'m', '{}', '{}', '{}'), 'P0001', 'forbidden', 'or the details');

-- Photos
select tests.as_user(:'owner', 'aal2');
select (:'m' || '/' || gen_random_uuid() || '.webp') as p1 \gset
select (:'m' || '/' || gen_random_uuid() || '.webp') as p2 \gset
select throws_ok(format('select public.add_merchant_photo(%L, %L)', :'m', :'p1'), 'P0001', 'photo_missing', 'a photo must be uploaded first');
insert into storage.objects (bucket_id, name) values ('merchant-photos', :'p1'), ('merchant-photos', :'p2');
select public.add_merchant_photo(:'m', :'p1', 'Jollof and chicken') as ph1 \gset
select public.add_merchant_photo(:'m', :'p2') as ph2 \gset
select tests.as_user(:'other', 'aal2');
select throws_ok(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'merchant-photos', :'m' || '/' || gen_random_uuid() || '.webp'), '42501', null, 'another business cannot upload into this shop''s folder');
select throws_ok(format('select public.add_merchant_photo(%L, %L)', :'m2', :'p1'), 'P0001', 'path_invalid', 'or claim its photo');
select throws_ok(format('select public.edit_merchant_photo(%L, %L)', :'ph1', 'remove'), 'P0001', 'forbidden', 'or remove it');
select tests.as_user(:'owner', 'aal2');
select public.edit_merchant_photo(:'ph2', 'cover');
select tests.as_user(:'s1');
select is((public.get_merchant_page(:'slug') -> 'photos' -> 0 ->> 'id'), :'ph2', 'the photo made cover comes first');
select is((public.get_merchant_page(:'slug') -> 'photos' -> 1 ->> 'caption'), 'Jollof and chicken', 'captions come along');
select is((public.get_merchant_page(:'slug') -> 'branches' -> 0 ->> 'landmark'), 'Opposite the GCTU main gate', 'the landmark is on the shop page');
select is((public.get_merchant_page(:'slug') -> 'payment_methods'), '["Cash", "MTN MoMo"]'::jsonb, 'ways to pay are on the shop page');
select is((select count(*)::int from public.merchant_photos), 0, 'students cannot read the photos table directly');
select is((select path from public.merchant_cover_photos(array[:'m'::uuid, :'m2'::uuid])), :'p2', 'deal cards get the cover photo of a listed shop');
select is((select count(*)::int from public.merchant_cover_photos(array[:'m'::uuid, :'m2'::uuid])), 1, 'one cover per shop, none for unlisted shops');
select tests.as_postgres(); set local role anon;
select throws_ok(format('select * from public.merchant_cover_photos(array[%L::uuid])', :'m'), '42501', null, 'signed-out visitors cannot list shop photos');
reset role;

select * from finish();
rollback;
