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
select plan(27);

select id as beauty from public.merchant_categories where slug = 'beauty' \gset
select tests.create_user('super@perqly.example', 'Perqly Super') as sup \gset
select tests.create_user('owner@shop.example', 'Abena Owner') as owner \gset
select tests.create_user('cashier@shop.example', 'Esi Cashier') as cashier \gset
insert into public.platform_staff (user_id, role) values (:'sup', 'super_admin');
insert into public.merchants (slug, display_name, category_id, status, created_by) values ('fresh-fade', 'Fresh Fade', :'beauty', 'draft', :'owner') returning id as shop \gset
insert into public.merchant_users (merchant_id, user_id, role) values (:'shop', :'owner', 'owner');
insert into public.merchant_users (merchant_id, user_id, role, invited_by) values (:'shop', :'cashier', 'cashier', :'owner');
select tests.as_user(:'owner', 'aal2');
select public.sign_merchant_agreement(:'shop', 1, 'Abena Owner', 'Owner', 'Fresh Fade Ltd', true);
select tests.as_postgres();
update public.merchants set status = 'approved' where id = :'shop';
insert into public.services (merchant_id, name, regular_price) values (:'shop', 'Haircut', 50) returning id as svc \gset
insert into public.offers (merchant_id, service_id, conditions, discount_type, discount_value, status, published_at, created_by)
values (:'shop', :'svc', 'Show your pass', 'percentage', 20, 'active', now(), :'owner') returning id as offer \gset

-- Off by default (pilot is free) ---------------------------------------------------
select tests.as_user(:'owner', 'aal2');
select is((public.get_merchant_billing(:'shop') ->> 'state'), 'off', 'billing is off until a super admin turns it on');
select throws_ok($$select * from public.start_merchant_payment((select id from public.merchants where slug = 'fresh-fade'))$$,
  'P0001', 'billing_off', 'nobody can pay while billing is off');
select throws_ok($$select public.admin_set_billing(true, 50, 30, 7)$$, 'P0001', 'forbidden', 'a shop owner cannot change billing');
select tests.as_user(:'cashier');
select throws_ok($$select public.get_merchant_billing((select id from public.merchants where slug = 'fresh-fade'))$$,
  'P0001', 'forbidden', 'cashiers do not see billing');

-- Switching on ------------------------------------------------------------------
select tests.as_user(:'sup', 'aal2');
select throws_ok($$select public.admin_set_billing(true, 0, 30, 7)$$, 'P0001', 'billing_fee_required', 'billing needs a fee');
select lives_ok($$select public.admin_set_billing(true, 50, 30, 7)$$, 'a super admin switches billing on at GH₵50');
select is((public.admin_get_billing_settings() ->> 'monthly_fee_pesewas')::int, 5000, 'the fee is stored in pesewas');
select tests.as_user(:'owner', 'aal2');
select is((public.get_merchant_billing(:'shop') ->> 'state'), 'trial', 'a business approved during the pilot gets its free month from today');
select ok((public.get_merchant_billing(:'shop') ->> 'trial_ends_at')::timestamptz between now() + interval '29 days' and now() + interval '31 days',
  'the free month lasts 30 days');

-- A new business approved while billing is on
select tests.as_postgres();
insert into public.merchants (slug, display_name, category_id, status, created_by) values ('kwik-print', 'Kwik Print', :'beauty', 'draft', :'owner') returning id as shop2 \gset
insert into public.merchant_users (merchant_id, user_id, role) values (:'shop2', :'owner', 'owner');
select tests.as_user(:'owner', 'aal2');
select public.sign_merchant_agreement(:'shop2', 1, 'Abena Owner', 'Owner', 'Kwik Print Ltd', true);
select tests.as_postgres();
update public.merchants set status = 'approved' where id = :'shop2';
select ok((select trial_ends_at > now() + interval '29 days' from public.merchant_billing where merchant_id = :'shop2'),
  'a business approved while billing is on gets its free month from approval');

-- Reminders, due, hold -----------------------------------------------------------
update public.merchant_billing set trial_ends_at = now() + interval '3 days' where merchant_id = :'shop';
select tests.as_service();
select is((public.run_billing_cycle() ->> 'trial_reminders')::int, 1, 'a reminder goes out when the free month ends within 7 days');
select is((public.run_billing_cycle() ->> 'trial_reminders')::int, 0, 'only once');
select tests.as_postgres();
update public.merchant_billing set trial_ends_at = now() - interval '2 days' where merchant_id = :'shop';
select tests.as_service();
select is((public.run_billing_cycle() ->> 'due_notices')::int, 1, 'the team is told payment is due when the free month ends');
select is((public.run_billing_cycle() ->> 'holds')::int, 0, 'no hold during the 7-day grace');
select tests.as_postgres();
update public.merchant_billing set trial_ends_at = now() - interval '8 days' where merchant_id = :'shop';
select tests.as_service();
select is((public.run_billing_cycle() ->> 'holds')::int, 1, 'after the grace period the business is put on hold');
select tests.as_postgres();
select is((select status::text || '/' || status_reason from public.offers where id = :'offer'), 'paused/billing_overdue', 'its live deals are paused');
select is((select count(*)::int from public.notifications where user_id = :'owner' and kind = 'merchant.billing_hold'), 1, 'the owner is told why');
select is((select count(*)::int from public.notifications where user_id = :'cashier' and kind like 'merchant.%'), 0, 'cashiers are not sent billing notices');
select throws_ok($$update public.offers set status = 'active' where status_reason = 'billing_overdue'$$, 'P0001', 'billing_overdue',
  'a deal cannot go live again until the business pays');

-- Paying -------------------------------------------------------------------------
select tests.as_user(:'owner', 'aal2');
select reference as ref from public.start_merchant_payment(:'shop') \gset
select tests.as_postgres();
select is((select amount_pesewas from public.merchant_payments where reference = :'ref'), 5000, 'a payment starts at the monthly fee');
select tests.as_user(:'owner', 'aal2');
select throws_ok($$select public.confirm_merchant_payment('x', 5000, 'GHS', 't', 'card')$$, '42501', null, 'people cannot confirm payments');
select tests.as_service();
select is(public.confirm_merchant_payment(:'ref', 4000, 'GHS', 'tx1', 'mobile_money'), 'mismatch', 'paying less than the fee is refused');
select tests.as_user(:'owner', 'aal2');
select reference as ref2 from public.start_merchant_payment(:'shop') \gset
select tests.as_service();
select is(public.confirm_merchant_payment(:'ref2', 5000, 'GHS', 'tx2', 'mobile_money'), 'confirmed', 'a full payment is confirmed');
select is(public.confirm_merchant_payment(:'ref2', 5000, 'GHS', 'tx2', 'mobile_money'), 'already_confirmed', 'confirming twice changes nothing');
select tests.as_postgres();
select is((select status::text from public.offers where id = :'offer'), 'active', 'paying brings the paused deal back');
select ok((select paid_until between now() + interval '27 days' and now() + interval '32 days' and not on_hold
            from public.merchant_billing where merchant_id = :'shop'), 'and covers the next month');

-- Admin records a cash payment; switching billing off lifts holds
select tests.as_user(:'sup', 'aal2');
select lives_ok($$select public.admin_record_manual_payment((select id from public.merchants where slug = 'kwik-print'), 2, 100, 'Cash at office')$$,
  'an admin can record a payment made another way');

select * from finish();
rollback;
