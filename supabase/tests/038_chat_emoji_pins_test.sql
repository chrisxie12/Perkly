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
select id as food from public.merchant_categories where slug = 'food' \gset
select tests.create_user('owner@cu.example', 'Abena Owner') as owner \gset
select tests.create_user('admin@cu.example', 'Perqly Admin') as padmin \gset
select tests.create_user('ama@cu.example', 'Ama Mensah') as s1 \gset
select tests.create_user('kojo@cu.example', 'Kojo Boateng') as s2 \gset
select tests.create_user('esi@cu.example', 'Esi Owusu') as s3 \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin');
select tests.as_user(:'s1'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s2'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s3'); select public.upsert_student_profile(:'gctu');
select tests.as_postgres(); select tests.verify(:'s1'); select tests.verify(:'s2'); select tests.verify(:'s3');

select tests.as_user(:'owner', 'aal2');
select public.register_merchant('Upgrade Chop Bar', :'food') as m \gset
select public.upsert_merchant_branch(:'m', null, 'Tesano', null, 'Tesano', 'Accra', null, 5.6150, -0.2320) as b \gset
select public.sign_merchant_agreement(:'m', 1, 'Abena Owner', 'Owner', 'Upgrade Chop Ltd', true);
select public.submit_merchant_for_review(:'m');
select tests.as_user(:'padmin', 'aal2'); select public.decide_merchant(:'m', 'approve');

-- Business chat ------------------------------------------------------------------------------
select tests.as_user(:'s1');
select public.start_conversation(:'m') as c \gset
select public.send_message(:'c', 'Are you open late?') as q \gset
select tests.as_user(:'owner', 'aal2');
select lives_ok(format('select public.react_to_message(%L, %L)', :'q', '🔥'), 'any emoji works as a reaction now');
select lives_ok(format('select public.react_to_message(%L, %L)', :'q', '👍🏾'), 'including skin tones');
select lives_ok(format('select public.react_to_message(%L, %L)', :'q', '👨‍👩‍👧'), 'and joined emoji');
select throws_ok(format('select public.react_to_message(%L, %L)', :'q', 'lol'), 'P0001', 'reaction_invalid', 'but not words');
select throws_ok(format('select public.react_to_message(%L, %L)', :'q', '<b>'), 'P0001', 'reaction_invalid', 'or markup');
select throws_ok(format('select public.react_to_message(%L, %L)', :'q', '🔥 🔥'), 'P0001', 'reaction_invalid', 'or spaces');

-- Pins
select lives_ok(format('select public.pin_message(%L, %L, true)', 'shop', :'q'), 'the business pins the question');
select isnt((select pinned_at from public.messages where id = :'q'), null, 'it is pinned');
select tests.as_user(:'s1');
select is((select pinned_by from public.messages where id = :'q'), :'owner'::uuid, 'the student sees who pinned it');
select lives_ok(format('select public.pin_message(%L, %L, false)', 'shop', :'q'), 'the student unpins it');
select is((select pinned_at from public.messages where id = :'q'), null, 'it is no longer pinned');
select tests.as_user(:'s2');
select throws_ok(format('select public.pin_message(%L, %L, true)', 'shop', :'q'), 'P0001', 'forbidden', 'outsiders cannot pin');
select throws_ok(format('select public.pin_message(%L, %L, true)', 'nonsense', :'q'), 'P0001', 'forbidden', 'unknown kinds are refused');

select * from finish();
rollback;
