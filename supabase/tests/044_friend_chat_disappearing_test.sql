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
select tests.create_user('ama@dm.example', 'Ama Mensah') as s1 \gset
select tests.create_user('kojo@dm.example', 'Kojo Boateng') as s2 \gset
select tests.create_user('esi@dm.example', 'Esi Owusu') as s3 \gset
select tests.as_user(:'s1'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s2'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s3'); select public.upsert_student_profile(:'gctu');
select tests.as_postgres(); select tests.verify(:'s1'); select tests.verify(:'s2'); select tests.verify(:'s3');

select tests.as_user(:'s2'); select public.set_social_settings(true, false);
select tests.as_user(:'s1'); select public.send_friend_request(:'s2');
select tests.as_user(:'s2'); select public.respond_friend_request(:'s1', true);
select tests.as_user(:'s1');
select public.start_friend_chat(:'s2') as fc \gset

-- Default: 24 hours after sending -------------------------------------------------------------
select is((public.get_friend_chat(:'fc'))->>'disappear', '24h', 'new chats default to 24 hours');
select public.send_friend_message(:'fc', 'Lunch at 1?') as m1 \gset
select ok((select expires_at between created_at + interval '23 hours 59 minutes' and created_at + interval '24 hours 1 minute'
           from public.friend_messages where id = :'m1'), 'a message expires 24 hours after it is sent');
select ok(not (select once from public.friend_messages where id = :'m1'), 'and is not view-once');

-- Nobody can stretch the expiry by updating the row directly.
select tests.as_postgres();
update public.friend_messages set expires_at = now() + interval '10 years' where id = :'m1';
select ok((select expires_at < now() + interval '2 days' from public.friend_messages where id = :'m1'), 'expiry cannot be changed by hand');

-- Changing the setting ------------------------------------------------------------------------
select tests.as_user(:'s3');
select throws_ok(format('select public.set_friend_chat_disappear(%L, %L)', :'fc', '12h'), 'P0001', 'forbidden', 'outsiders cannot change it');
select tests.as_user(:'s2');
select throws_ok(format('select public.set_friend_chat_disappear(%L, %L)', :'fc', 'forever'), 'P0001', 'mode_invalid', 'only the three settings exist');
select lives_ok(format('select public.set_friend_chat_disappear(%L, %L)', :'fc', '12h'), 'either friend can change it');
select is((public.get_friend_chat(:'fc'))->>'disappear_set_by_me', 'true', 'the chat says who changed it');
select tests.as_user(:'s1');
select is((public.get_friend_chat(:'fc'))->>'disappear_set_by_me', 'false', 'and the other side sees it was the friend');
select public.send_friend_message(:'fc', 'Make it 2') as m2 \gset
select ok((select expires_at < created_at + interval '12 hours 1 minute' from public.friend_messages where id = :'m2'), 'new messages follow the new setting');
select ok((select expires_at > now() + interval '23 hours' from public.friend_messages where id = :'m1'), 'older messages keep theirs');

-- Expired messages vanish at once ---------------------------------------------------------------
select tests.as_postgres();
select set_config('perqly.friend_expiry', 'on', true);
update public.friend_messages set expires_at = now() - interval '1 minute' where id = :'m1';
select set_config('perqly.friend_expiry', 'off', true);
select tests.as_user(:'s2');
select is((select count(*)::int from public.friend_messages where id = :'m1'), 0, 'an expired message is hidden from both friends');
select is((select count(*)::int from public.friend_messages where id = :'m2'), 1, 'a live one is not');
select is((select last_message_preview from public.list_friend_chats() where id = :'fc'), 'Make it 2', 'the chat list shows the latest live message');
select throws_ok(format('select public.send_friend_message(%L, %L, %L)', :'fc', 'ok', :'m1'), 'P0001', 'reply_invalid', 'you cannot reply to an expired message');

-- View once ---------------------------------------------------------------------------------------
select tests.as_user(:'s2');
select public.send_friend_message(:'fc', 'Sure');
select tests.as_user(:'s1');
select public.set_friend_chat_disappear(:'fc', 'seen');
select public.send_friend_message(:'fc', 'The code is 4417') as m3 \gset
select ok((select once and expires_at > now() + interval '6 days' from public.friend_messages where id = :'m3'), 'an unopened view-once message waits up to 7 days');
select is((select last_message_preview from public.friend_chats where id = :'fc'), 'New message', 'its words are not kept as the chat preview');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'s2' and kind = 'friendchat.message' and body = 'Sent you a message'),
  1, 'nor shown in the notification');
select is((select count(*)::int from public.notifications where body like '%4417%'), 0, 'no notification holds its words');
select tests.as_user(:'s1');
select public.mark_friend_chat_read(:'fc');
select ok((select seen_at is null from public.friend_messages where id = :'m3'), 'the sender opening the chat does not count as seen');
select tests.as_user(:'s2');
select is((select last_message_preview from public.list_friend_chats() where id = :'fc'), 'New message', 'the list hides it too');
select public.mark_friend_chat_read(:'fc');
select ok((select seen_at is not null and expires_at <= clock_timestamp() + interval '1 hour' from public.friend_messages where id = :'m3'),
  'opening it marks it seen, with an hour at most');
select tests.as_user(:'s1');
select is(public.leave_friend_chat(:'fc'), 0, 'the sender leaving changes nothing');
select tests.as_user(:'s2');
select is(public.leave_friend_chat(:'fc'), 1, 'the reader leaving ends it');
select tests.as_user(:'s1');
select is((select count(*)::int from public.friend_messages where id = :'m3'), 0, 'and it is gone for the sender too');
select tests.as_user(:'s3');
select throws_ok(format('select public.leave_friend_chat(%L)', :'fc'), 'P0001', 'forbidden', 'outsiders cannot call leave');

-- Pinned messages stay --------------------------------------------------------------------------
select tests.as_user(:'s1');
select public.set_friend_chat_disappear(:'fc', '24h');
select public.send_friend_message(:'fc', 'Keep this: room B12') as m4 \gset
select public.pin_message('friend', :'m4', true);
select tests.as_postgres();
select set_config('perqly.friend_expiry', 'on', true);
update public.friend_messages set expires_at = now() - interval '1 minute' where id in (:'m2', :'m4');
select set_config('perqly.friend_expiry', 'off', true);
select tests.as_user(:'s2');
select is((select count(*)::int from public.friend_messages where id = :'m4'), 1, 'a pinned message stays past its time');

-- The daily clean-up ----------------------------------------------------------------------------
select tests.as_postgres();
select format('friend/%s/%s/%s.jpg', :'fc', :'s1', gen_random_uuid()) as fp \gset
select tests.photo(:'fp', :'s1');
select tests.as_user(:'s1');
select public.send_friend_message(:'fc', '', null, :'fp') as m5 \gset
select tests.as_postgres();
select set_config('perqly.friend_expiry', 'on', true);
update public.friend_messages set expires_at = now() - interval '1 minute' where id = :'m5';
select set_config('perqly.friend_expiry', 'off', true);
update public.notifications set created_at = now() - interval '2 days' where user_id = :'s2' and kind = 'friendchat.message';

select tests.as_user(:'s1');
select throws_ok('select public.purge_expired_friend_messages()', '42501', null, 'students cannot run the clean-up');

-- A chat with an open report keeps everything until support handles it.
select public.report_student(:'s2', 'harassment', null, :'fc') as rep \gset
select tests.as_postgres();
select is(public.purge_expired_friend_messages(), 0, 'nothing is deleted while a report on the chat is open');
update public.student_reports set status = 'resolved' where id = :'rep';
select is(public.purge_expired_friend_messages(), 4, 'once handled, the expired messages are deleted');
select is((select count(*)::int from public.friend_messages where id in (:'m1', :'m2', :'m3', :'m5')), 0, 'the rows are gone');
select is((select count(*)::int from public.friend_messages where id = :'m4'), 1, 'the pinned one is kept');
select ok(exists (select 1 from public.account_media_purge where bucket = 'chat-photos' and path = :'fp'), 'the photo is queued for removal');
select is((select count(*)::int from public.notifications where user_id = :'s2' and kind = 'friendchat.message' and body is not null), 0,
  'old chat notifications lose the message words');

select * from finish();
rollback;
