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
select plan(24);

select id as gctu from public.institutions where slug = 'gctu' \gset
select id as beauty from public.merchant_categories where slug = 'beauty' \gset
select tests.create_user('admin@perqly.example', 'Perqly Admin') as padmin \gset
select tests.create_user('ama@student.example', 'Ama Mensah') as s1 \gset
select tests.create_user('kojo@student.example', 'Kojo Boateng') as s2 \gset
select tests.create_user('owner@shop.example', 'Abena Owner') as owner \gset
select tests.create_user('cashier@shop.example', 'Esi Cashier') as cashier \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin');
insert into public.student_profiles (user_id, institution_id) values (:'s1', :'gctu'), (:'s2', :'gctu');

-- Verification ------------------------------------------------------------------
insert into public.student_verifications (student_id, institution_id, status) values (:'s1', :'gctu', 'submitted') returning id as app \gset
select is((select count(*)::int from public.notifications where user_id = :'padmin' and kind = 'review.student'), 1,
  'staff hear about a new student to review');
update public.student_verifications set status = 'rejected', decision_reason = 'photo_mismatch' where id = :'app';
select is((select body from public.notifications where user_id = :'s1' and kind = 'verification.rejected'),
  'The selfie didn''t match the photo on the student ID.', 'a rejected student is told why');
select is((select category from public.notifications where user_id = :'s1' and kind = 'verification.rejected'), 'verification',
  'the notification is filed under verification');

update public.student_profiles set verification_status = 'verified', verified_at = now() - interval '300 days', verified_until = now() + interval '5 days'
 where user_id = :'s2';
select tests.as_service();
select is(public.notify_expiring_verifications(), 1, 'a verification ending within 14 days gets a reminder');
select is(public.notify_expiring_verifications(), 0, 'only once');
select tests.as_postgres();
update public.student_profiles set verification_status = 'expired' where user_id = :'s2';
select is((select count(*)::int from public.notifications where user_id = :'s2' and kind = 'verification.expired'), 1, 'expiry is announced');

-- Businesses and deals ----------------------------------------------------------
insert into public.merchants (slug, display_name, category_id, status, created_by) values ('fresh-fade', 'Fresh Fade', :'beauty', 'draft', :'owner') returning id as shop \gset
insert into public.merchant_users (merchant_id, user_id, role) values (:'shop', :'owner', 'owner');
insert into public.merchant_users (merchant_id, user_id, role, invited_by) values (:'shop', :'cashier', 'cashier', :'owner');
select is((select count(*)::int from public.notifications where user_id = :'owner' and kind = 'team.added'), 0, 'the owner who signs up isn''t told they joined');
select is((select title from public.notifications where user_id = :'cashier' and kind = 'team.added'), 'You''ve joined Fresh Fade', 'an added cashier is told');
select tests.as_user(:'owner', 'aal2');
select public.sign_merchant_agreement(:'shop', 1, 'Abena Owner', 'Owner', 'Fresh Fade Ltd', true);
select tests.as_postgres();
update public.merchants set status = 'pending_review' where id = :'shop';
select is((select count(*)::int from public.notifications where user_id = :'padmin' and kind = 'review.merchant'), 1, 'admins hear about a new business');
update public.merchants set status = 'approved' where id = :'shop';
select is((select count(*)::int from public.notifications where kind = 'merchant.approved'), 1, 'only the owner and managers hear the business is approved');

insert into public.favourites (student_id, merchant_id) values (:'s1', :'shop');
insert into public.services (merchant_id, name, regular_price) values (:'shop', 'Haircut', 50) returning id as svc \gset
insert into public.offers (merchant_id, service_id, conditions, discount_type, discount_value, status, created_by)
values (:'shop', :'svc', 'Show your pass', 'percentage', 20, 'pending_review', :'owner') returning id as offer \gset
update public.offers set status = 'active', published_at = now() where id = :'offer';
select is((select title from public.notifications where user_id = :'s1' and kind = 'deal.new'), 'New deal at Fresh Fade', 'students who saved the business hear about its new deal');
select is((select link from public.notifications where user_id = :'s1' and kind = 'deal.new'), '/student/offers/' || :'offer', 'and it links to the deal');
select is((select count(*)::int from public.notifications where user_id = :'owner' and kind = 'offer.approved'), 1, 'the business hears its deal was approved');
update public.offers set status = 'paused' where id = :'offer';
update public.offers set status = 'active' where id = :'offer';
select is((select count(*)::int from public.notifications where kind = 'deal.new'), 1, 'resuming a paused deal isn''t announced again');

-- Settings ----------------------------------------------------------------------
select tests.as_user(:'s1');
select is((select push::text || email::text from public.get_my_notification_preferences() where category = 'verification'), 'truetrue',
  'by default push is on and verification emails are on');
select is((select email from public.get_my_notification_preferences() where category = 'deals'), false, 'other emails are off by default');
select lives_ok($$select public.set_notification_preference('deals', false, true)$$, 'a student can change a setting');
select is((select push::text || email::text from public.get_my_notification_preferences() where category = 'deals'), 'falsetrue', 'and it sticks');
select throws_ok($$select public.set_notification_preference('nonsense', true, true)$$, 'P0001', 'preference_invalid', 'unknown categories are refused');

-- Push subscriptions and delivery -----------------------------------------------
select lives_ok($$select public.save_push_subscription('https://push.example/abc', repeat('k', 40), repeat('a', 16), 'Phone')$$, 'a device can be saved');
select is(public.count_my_push_devices(), 1, 'and counted');
select throws_ok($$select public.claim_notification_deliveries(10)$$, '42501', null, 'people cannot claim deliveries');
select tests.as_service();
select is((select count(*)::int from public.claim_notification_deliveries(100) c where c.user_id = :'s1' and c.send_push),
  1, 'the server gets the pending push (the rejection), not deals, which the student turned off');
select tests.as_postgres();
select is((select push_status || '/' || email_status from public.notifications where user_id = :'s1' and kind = 'deal.new'), 'skipped/processing',
  'the deal goes by email only, as the student chose');

select * from finish();
rollback;
