begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);

-- Google gives full_name in the user metadata; the profile picks it up.
insert into auth.users (id, email, raw_user_meta_data)
values (gen_random_uuid(), 'kwame@gmail.example', '{"full_name": "Kwame Asante", "name": "Kwame Asante", "provider_id": "123"}')
returning id as g \gset
select is((select full_name from public.profiles where id = :'g'), 'Kwame Asante', 'the name from Google becomes the profile name');

select set_config('request.jwt.claims', jsonb_build_object('sub', :'g', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.set_signup_intent('merchant');
reset role;
select is((select signup_intent from public.profiles where id = :'g'), 'merchant', 'a new account records what the person chose');

set local role authenticated;
select public.set_signup_intent('student');
reset role;
select is((select signup_intent from public.profiles where id = :'g'), 'merchant', 'it can only be set once');

update public.profiles set signup_intent = null, created_at = now() - interval '2 hours' where id = :'g';
set local role authenticated;
select public.set_signup_intent('merchant');
reset role;
select is((select signup_intent from public.profiles where id = :'g'), null, 'older accounts are left alone');

set local role authenticated;
select throws_ok($$select public.set_signup_intent('admin')$$, 'P0001', 'intent_invalid', 'only student or business');

select * from finish();
rollback;
