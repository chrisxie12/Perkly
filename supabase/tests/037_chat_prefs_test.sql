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
create function tests.photo(p_name text, p_owner uuid)
returns void language sql as $$
  insert into storage.objects (bucket_id, name, owner) values ('chat-photos', p_name, p_owner);
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
select tests.as_postgres();
select tests.create_user('support@cu.example', 'Perqly Support') as sup \gset
insert into public.platform_staff (user_id, role) values (:'sup', 'support');

-- Mute ----------------------------------------------------------------------------------
select tests.as_user(:'s1');
select public.send_message(:'c', 'First question');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'owner' and kind = 'chat.message'), 1, 'the business is told about a new message');
select tests.as_user(:'owner', 'aal2');
select lives_ok(format('select public.set_chat_pref(%L, %L, true, null)', 'shop', :'c'), 'the owner mutes the chat');
select tests.as_postgres(); delete from public.notifications where user_id = :'owner';
select tests.as_user(:'s1');
select public.send_message(:'c', 'Second question');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'owner' and kind = 'chat.message'), 0, 'a muted chat sends no notification');
select tests.as_user(:'owner', 'aal2');
select public.set_chat_pref('shop', :'c', false, null);
select tests.as_user(:'s1');
select public.send_message(:'c', 'Third question');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'owner' and kind = 'chat.message'), 1, 'unmuted, notifications come back');

-- Archive ---------------------------------------------------------------------------------
select tests.as_user(:'s1');
select lives_ok(format('select public.set_chat_pref(%L, %L, null, true)', 'shop', :'c'), 'the student archives the chat');
select isnt((select archived_at from public.chat_prefs where chat_id = :'c'), null, 'and it is marked archived');
select is((select muted from public.chat_prefs where chat_id = :'c'), false, 'archiving leaves mute alone');
select public.set_chat_pref('shop', :'c', null, false);
select is((select archived_at from public.chat_prefs where chat_id = :'c'), null, 'and can be unarchived');

-- Only people in the chat ---------------------------------------------------------------
select tests.as_user(:'s2');
select throws_ok(format('select public.set_chat_pref(%L, %L, true, null)', 'shop', :'c'), 'P0001', 'forbidden', 'others cannot mute a chat they are not in');
select throws_ok(format('select public.report_chat(%L, %L, %L)', 'shop', :'c', 'spam'), 'P0001', 'forbidden', 'or report it');
select is((select count(*)::int from public.chat_prefs), 0, 'and cannot see other people''s settings');

-- Reports ----------------------------------------------------------------------------------
select tests.as_user(:'s1');
select lives_ok(format('select public.report_chat(%L, %L, %L, %L)', 'shop', :'c', 'scam', 'Asked me to pay a deposit'), 'the student reports the chat');
select throws_ok(format('select public.report_chat(%L, %L, %L)', 'shop', :'c', 'boring'), 'P0001', 'report_invalid', 'reasons come from a short list');
select throws_ok('select public.admin_chat_reports()', 'P0001', 'forbidden', 'students cannot read reports');
select tests.as_user(:'sup', 'aal2');
select is(public.admin_chat_reports() -> 0 ->> 'business', 'Upgrade Chop Bar', 'support sees which business');
select is(public.admin_chat_reports() -> 0 ->> 'reporter_side', 'student', 'and who reported it');
select public.admin_close_chat_report((public.admin_chat_reports() -> 0 ->> 'id')::uuid);
select is(public.admin_chat_reports() -> 0 ->> 'status', 'closed', 'support closes it');

select * from finish();
rollback;
