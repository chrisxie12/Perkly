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
select public.send_message(:'c', 'Are you open late?') as q \gset
select tests.as_user(:'owner', 'aal2');
select public.send_message(:'c', 'Until 10pm.', :'q') as a \gset
select is((select reply_to from public.messages where id = :'a'), :'q'::uuid, 'a reply records the message it answers');

select tests.as_user(:'s2');
select public.start_conversation(:'m') as c2 \gset
select public.send_message(:'c2', 'Hello') as other \gset
select throws_ok(format('select public.send_message(%L, %L, %L)', :'c2', 'x', :'q'), 'P0001', 'reply_invalid', 'you cannot reply to a message from another chat');

-- Photos
select tests.as_user(:'s1');
select format('shop/%s/%s/%s.webp', :'c', :'s1', gen_random_uuid()) as p1 \gset
select format('shop/%s/%s/%s.webp', :'c', :'s2', gen_random_uuid()) as p_wrong_owner \gset
select ok(private.can_write_chat_photo(:'p1'), 'a student may upload a photo into their own chat folder');
select ok(not private.can_write_chat_photo(:'p_wrong_owner'), 'but not into someone else''s folder');
select ok(not private.can_write_chat_photo('shop/' || :'c' || '/' || :'s1' || '/x.exe'), 'only photo paths are accepted');
select throws_ok(format('select public.send_message(%L, %L, null, %L)', :'c', '', :'p1'), 'P0001', 'photo_invalid', 'a photo must be uploaded first');
select tests.as_postgres(); select tests.photo(:'p1', :'s1');
select tests.as_user(:'s1');
select lives_ok(format('select public.send_message(%L, %L, null, %L)', :'c', '', :'p1'), 'a photo can be sent with no text');
select is((select last_message_preview from public.conversations where id = :'c'), 'Photo', 'the chat list shows "Photo"');
select throws_ok(format('select public.send_message(%L, %L)', :'c', ''), 'P0001', 'message_invalid', 'an empty message with no photo is still refused');
select tests.as_user(:'owner', 'aal2');
select ok(private.can_read_chat_photo(:'p1'), 'the business sees the student''s photo');
select tests.as_user(:'s2');
select ok(not private.can_read_chat_photo(:'p1'), 'another student does not');
select throws_ok(format('select public.send_message(%L, %L, null, %L)', :'c2', '', :'p1'), 'P0001', 'photo_invalid', 'a photo from another chat cannot be sent');

-- Reactions
select tests.as_user(:'owner', 'aal2');
select lives_ok(format('select public.react_to_message(%L, %L)', :'q', '👍'), 'the business reacts to a message');
select throws_ok(format('select public.react_to_message(%L, %L)', :'q', 'lol'), 'P0001', 'reaction_invalid', 'reactions are emoji only');
select tests.as_user(:'s1');
select lives_ok(format('select public.react_to_message(%L, %L)', :'a', '❤️'), 'the student reacts');
select lives_ok(format('select public.react_to_message(%L, %L)', :'a', '😂'), 'and changes the reaction');
select is((select emoji from public.message_reactions where message_id = :'a'), '😂', 'one reaction per person, the latest wins');
select is((select count(*)::int from public.message_reactions where message_id = :'q'), 1, 'the student reads reactions in their chat');
select lives_ok(format('select public.react_to_message(%L, null)', :'a'), 'removing a reaction');
select is((select count(*)::int from public.message_reactions where message_id = :'a' and emoji is not null), 0, 'leaves no emoji');
select tests.as_user(:'s2');
select throws_ok(format('select public.react_to_message(%L, %L)', :'q', '👍'), 'P0001', 'forbidden', 'others cannot react in the chat');
select is((select count(*)::int from public.message_reactions where message_id = :'q'), 0, 'or read its reactions');

-- Seen
select tests.as_user(:'s1');
select public.mark_conversation_read(:'c');
select tests.as_user(:'owner', 'aal2');
select ok((public.get_conversation(:'c') ->> 'other_read_at')::timestamptz >= (select created_at from public.messages where id = :'a'),
  'the business can see the student has read its reply');

-- Typing channels
select tests.as_user(:'s1');
select ok(private.can_use_chat_topic('chat:shop:' || :'c'), 'the student may join the chat''s typing channel');
select tests.as_user(:'s2');
select ok(not private.can_use_chat_topic('chat:shop:' || :'c'), 'others may not');
select ok(not private.can_use_chat_topic('chat:shop:nonsense'), 'malformed topics are refused');

-- Friend chat ---------------------------------------------------------------------------------
select tests.as_user(:'s2'); select public.set_social_settings(true, false);
select tests.as_user(:'s1'); select public.send_friend_request(:'s2');
select tests.as_user(:'s2'); select public.respond_friend_request(:'s1', true);
select tests.as_user(:'s1');
select public.start_friend_chat(:'s2') as fc \gset
select public.send_friend_message(:'fc', 'See you at the event?') as fq \gset
select tests.as_user(:'s2');
select public.send_friend_message(:'fc', 'Yes!', :'fq') as fa \gset
select is((select reply_to from public.friend_messages where id = :'fa'), :'fq'::uuid, 'friend replies work');
select lives_ok(format('select public.react_to_friend_message(%L, %L)', :'fq', '🙏'), 'friends react');
select is((select emoji from public.friend_message_reactions where message_id = :'fq'), '🙏', 'and see the reaction');
select format('friend/%s/%s/%s.jpg', :'fc', :'s2', gen_random_uuid()) as fp \gset
select ok(private.can_write_chat_photo(:'fp'), 'a friend may upload a photo');
select tests.as_postgres(); select tests.photo(:'fp', :'s2');
select tests.as_user(:'s2');
select lives_ok(format('select public.send_friend_message(%L, %L, null, %L)', :'fc', 'Look', :'fp'), 'and send it');
select tests.as_user(:'s1');
select ok(private.can_read_chat_photo(:'fp'), 'the other friend sees it');
select is((select count(*)::int from public.friend_chats where id = :'fc'), 1, 'friends read their chat row (for live "seen")');
select public.mark_friend_chat_read(:'fc');
select tests.as_user(:'s2');
select ok((public.get_friend_chat(:'fc') ->> 'other_read_at')::timestamptz >= (select created_at from public.friend_messages where id = :'fa'),
  'and see when the other read it');
select tests.as_user(:'s3');
select ok(not private.can_read_chat_photo(:'fp'), 'a classmate outside the chat cannot see its photos');
select is((select count(*)::int from public.friend_chats where id = :'fc'), 0, 'or read the chat');
select throws_ok(format('select public.react_to_friend_message(%L, %L)', :'fq', '👍'), 'P0001', 'forbidden', 'or react');
select ok(not private.can_use_chat_topic('chat:friend:' || :'fc'), 'or join its typing channel');

-- After unfriending, no more photos or reactions.
select tests.as_user(:'s1'); select public.block_student(:'s2');
select ok(not private.can_write_chat_photo(format('friend/%s/%s/%s.webp', :'fc', :'s1', gen_random_uuid())), 'after a block, no more uploads');
select throws_ok(format('select public.react_to_friend_message(%L, %L)', :'fa', '👍'), 'P0001', 'not_friends', 'or react');

select * from finish();
rollback;
