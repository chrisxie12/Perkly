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
select plan(27);

select id as gctu from public.institutions where slug = 'gctu' \gset
select id as food from public.merchant_categories where slug = 'food' \gset
select tests.create_user('owner@chat.example', 'Abena Owner') as owner \gset
select tests.create_user('cashier@chat.example', 'Kofi Cashier') as cashier \gset
select tests.create_user('admin@perqly.example', 'Perqly Admin') as padmin \gset
select tests.create_user('ama@student.example', 'Ama Mensah') as s1 \gset
select tests.create_user('yaw@student.example', 'Yaw Boateng') as s2 \gset
select tests.create_user('nobody@example.com', 'Not Student') as outsider \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin');
select tests.as_user(:'s1'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s2'); select public.upsert_student_profile(:'gctu');

select tests.as_user(:'owner', 'aal2');
select public.register_merchant('Chat Chop Bar', :'food') as m \gset
select public.upsert_merchant_branch(:'m', null, 'Tesano', null, 'Tesano', 'Accra', null, 5.6150, -0.2320) as b \gset
select public.sign_merchant_agreement(:'m', 1, 'Abena Owner', 'Owner', 'Chat Chop Ltd', true);
select tests.as_postgres();
insert into public.merchant_users (merchant_id, user_id, role, status, invited_by) values (:'m', :'cashier', 'cashier', 'active', :'owner');

-- Not listed yet
select tests.as_user(:'s1');
select throws_ok(format('select public.start_conversation(%L)', :'m'), 'P0001', 'merchant_not_found', 'students cannot chat with a business that is not approved');
select tests.as_user(:'owner', 'aal2'); select public.submit_merchant_for_review(:'m');
select tests.as_user(:'padmin', 'aal2'); select public.decide_merchant(:'m', 'approve');

select tests.as_user(:'outsider');
select throws_ok(format('select public.start_conversation(%L)', :'m'), 'P0001', 'not_a_student', 'only students start chats');
select tests.as_user(:'s1');
select public.start_conversation(:'m') as c \gset
select is(public.start_conversation(:'m'), :'c'::uuid, 'opening the chat again returns the same conversation');
select is((select count(*)::int from public.list_my_conversations()), 0, 'an empty chat does not show in the list');
select throws_ok(format('select public.send_message(%L, %L)', :'c', '   '), 'P0001', 'message_invalid', 'blank messages are refused');
select throws_ok(format('select public.send_message(%L, %L)', :'c', repeat('a', 1001)), 'P0001', 'message_invalid', 'very long messages are refused');
select public.send_message(:'c', 'Hello, do you have jollof today?');
select public.send_message(:'c', 'And is it spicy?');
select is((select count(*)::int from public.messages where conversation_id = :'c'), 2, 'the student sees their messages');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'owner' and kind = 'chat.message'), 1, 'the owner is notified once for a burst of messages');
select is((select count(*)::int from public.notifications where user_id = :'cashier' and kind = 'chat.message'), 0, 'cashiers are not notified');
select is((select category from public.notifications where user_id = :'owner' and kind = 'chat.message'), 'messages', 'chat notifications are in the Messages category');
select is((select title from public.notifications where user_id = :'owner' and kind = 'chat.message'), 'Message from Ama', 'the shop sees the student''s first name');

-- Others cannot see or write
select tests.as_user(:'s2');
select is((select count(*)::int from public.messages where conversation_id = :'c'), 0, 'another student cannot read the chat');
select throws_ok(format('select public.send_message(%L, %L)', :'c', 'hi'), 'P0001', 'forbidden', 'or write in it');
select is(public.get_conversation(:'c'), null, 'or open it');
select tests.as_user(:'cashier', 'aal2');
select is((select count(*)::int from public.messages where conversation_id = :'c'), 0, 'cashiers cannot read shop chats');
select tests.as_user(:'owner', 'aal1');
select is((select count(*)::int from public.messages where conversation_id = :'c'), 0, 'an owner without two-factor cannot read chats');

-- The shop replies
select tests.as_user(:'owner', 'aal2');
select is((select unread from public.list_merchant_conversations(:'m')), 2, 'the shop sees two unread messages');
select is(public.count_unread_chats(:'m'), 1, 'one unread chat for the shop');
select public.mark_conversation_read(:'c');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'owner' and kind = 'chat.message' and read_at is null), 0, 'opening the chat clears its notifications');
select tests.as_user(:'s1'); select public.send_message(:'c', 'One more thing: do you open on Sunday?');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'owner' and kind = 'chat.message'), 2, 'a new message after reading notifies again');
select tests.as_user(:'owner', 'aal2');
select public.send_message(:'c', 'Yes! Spicy or mild, your choice.');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'owner' and kind = 'chat.message'), 2, 'your own messages never notify you');
select tests.as_user(:'owner', 'aal2');
select is((select unread from public.list_merchant_conversations(:'m')), 0, 'replying marks the chat read for the shop');
select tests.as_user(:'s1');
select is((select unread from public.list_my_conversations()), 1, 'the student has one unread reply');
select public.mark_conversation_read(:'c');
select is(public.count_unread_chats(), 0, 'opening the chat clears it');

-- Blocking
select tests.as_user(:'s1');
select throws_ok(format('select public.set_conversation_blocked(%L, true)', :'c'), 'P0001', 'forbidden', 'students cannot block the shop''s side');
select tests.as_user(:'owner', 'aal2'); select public.set_conversation_blocked(:'c', true);
select tests.as_user(:'s1');
select throws_ok(format('select public.send_message(%L, %L)', :'c', 'hello?'), 'P0001', 'chat_blocked', 'a blocked student cannot write');
select tests.as_postgres();
select is((select count(*)::int from public.audit_logs where action = 'chat.blocked'), 1, 'blocking is audited');

select * from finish();
rollback;
