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
grant execute on all functions in schema tests to anon, authenticated, service_role;
select plan(14);

select id as beauty from public.merchant_categories where slug = 'beauty' \gset
select tests.create_user('owner@shop.example', 'Abena Owner') as owner \gset
select tests.create_user('manager@shop.example', 'Kwame Manager') as manager \gset
select tests.create_user('admin@perqly.example', 'Perqly Admin') as padmin \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin');
select tests.as_user(:'owner', 'aal2');
select public.register_merchant('Fresh Fade Barbers', :'beauty') as m \gset
select public.upsert_merchant_branch(:'m', null, 'Tesano');
select public.add_merchant_user(:'m', 'manager@shop.example', 'manager');

select is((select count(*)::int from public.merchant_agreement_versions where is_current), 1, 'there is exactly one current agreement');
select ok((select body_sha256 = encode(extensions.digest(body, 'sha256'), 'hex') from public.merchant_agreement_versions where version = 1), 'the stored hash matches the text');
select throws_ok(format('select public.submit_merchant_for_review(%L)', :'m'), 'P0001', 'agreement_required', 'a business cannot be reviewed before signing');
select throws_ok(format('select public.sign_merchant_agreement(%L, 1, %L, %L, %L, false)', :'m', 'Abena Owner', 'Owner', 'Fresh Fade Ltd'), 'P0001',
  'acceptance_required', 'the box must be ticked');
select throws_ok(format('select public.sign_merchant_agreement(%L, 1, %L, %L, %L, true)', :'m', 'A', 'Owner', 'Fresh Fade Ltd'), 'P0001',
  'signer_name_required', 'a typed name is required');
select throws_ok(format('select public.sign_merchant_agreement(%L, 2, %L, %L, %L, true)', :'m', 'Abena Owner', 'Owner', 'Fresh Fade Ltd'), 'P0001',
  'agreement_outdated', 'only the current version can be signed');
select tests.as_user(:'owner', 'aal1');
select throws_ok(format('select public.sign_merchant_agreement(%L, 1, %L, %L, %L, true)', :'m', 'Abena Owner', 'Owner', 'Fresh Fade Ltd'), 'P0001',
  'forbidden', 'the owner signs with two-step verification');
select tests.as_user(:'manager');
select throws_ok(format('select public.sign_merchant_agreement(%L, 1, %L, %L, %L, true)', :'m', 'Kwame Manager', 'Manager', 'Fresh Fade Ltd'), 'P0001',
  'forbidden', 'only the owner can sign');
select tests.as_user(:'owner', 'aal2');
select public.sign_merchant_agreement(:'m', 1, 'Abena Owner', 'Owner', 'Fresh Fade Ltd', true, 'Test browser', '41.66.1.2') as a1 \gset
select is(public.sign_merchant_agreement(:'m', 1, 'Abena Owner', 'Owner', 'Fresh Fade Ltd', true), :'a1'::uuid, 'signing again returns the same signature');
select is((select signer_name || '/' || host(ip_address) || '/' || version from public.merchant_agreements where id = :'a1'), 'Abena Owner/41.66.1.2/1',
  'the signature records the name, IP address and version');
select is((select legal_name from public.merchants where id = :'m'), 'Fresh Fade Ltd', 'the legal name is filled from the agreement');
select lives_ok(format('select public.submit_merchant_for_review(%L)', :'m'), 'after signing the business can be submitted');
select tests.as_postgres();
select throws_ok(format('update public.merchant_agreements set signer_name = %L where id = %L', 'Someone Else', :'a1'), 'P0001', 'agreements_are_final',
  'a signature cannot be changed');
select is((select count(*)::int from public.audit_logs where action = 'merchant.agreement_signed' and merchant_id = :'m'), 1, 'signing is audited once');

select * from finish();
rollback;
