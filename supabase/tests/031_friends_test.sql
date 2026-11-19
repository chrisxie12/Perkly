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

update public.institutions set status = 'pilot' where slug = 'atu';
select id as gctu from public.institutions where slug = 'gctu' \gset
select id as atu from public.institutions where slug = 'atu' \gset
select id as beauty from public.merchant_categories where slug = 'beauty' \gset
select tests.create_user('ama@f.example', 'Ama Mensah') as ama \gset
select tests.create_user('kojo@f.example', 'Kojo Boateng') as kojo \gset
select tests.create_user('esi@f.example', 'Esi Owusu') as esi \gset
select tests.create_user('yaw@f.example', 'Yaw Atu') as yaw \gset
select tests.create_user('new@f.example', 'Nana Unverified') as newbie \gset
select tests.create_user('owner@f.example', 'Shop Owner') as owner \gset
select tests.create_user('admin@f.example', 'Perqly Admin') as padmin \gset
select tests.create_user('support@f.example', 'Perqly Support') as psupport \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin'), (:'psupport', 'support');
select tests.as_user(:'ama'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'kojo'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'esi'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'newbie'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'yaw'); select public.upsert_student_profile(:'atu');
select tests.as_postgres();
select tests.verify(:'ama'); select tests.verify(:'kojo'); select tests.verify(:'esi'); select tests.verify(:'yaw');

-- A live deal, for sharing and activity.
select tests.as_user(:'owner', 'aal2');
select public.register_merchant('Friendly Cuts', :'beauty') as m \gset
select public.upsert_merchant_branch(:'m', null, 'Tesano', null, null, 'Accra', null, 5.6145, -0.2310) as b1 \gset
select public.upsert_catalogue_item(:'m', 'service', null, 'Haircut', 80) as cut \gset
select public.upsert_offer(:'m', null, 'service', :'cut', 'percentage', 20, 'Show your pass') as o1 \gset
select public.sign_merchant_agreement(:'m', 1, 'Shop Owner', 'Owner', 'Friendly Cuts', true);
select public.submit_merchant_for_review(:'m');
select tests.as_user(:'padmin', 'aal2'); select public.decide_merchant(:'m', 'approve');
select tests.as_user(:'owner', 'aal2'); select public.submit_offer(:'o1');
select tests.as_user(:'padmin', 'aal2'); select public.moderate_offer(:'o1', 'approve');
select tests.as_postgres();

-- 1. Privileges ------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.search_classmates(text)', 'execute'), 'anon cannot search students');
select ok(not has_table_privilege('authenticated', 'public.friendships', 'select'), 'friendships are read through functions only');
select ok(not has_table_privilege('authenticated', 'public.student_social_settings', 'select'), 'settings are read through functions only');
select ok(not has_table_privilege('authenticated', 'public.student_reports', 'select'), 'reports are read through functions only');
select ok(not has_table_privilege('authenticated', 'public.friend_messages', 'insert'), 'messages are written through functions only');
select ok(not has_function_privilege('authenticated', 'private.can_connect(uuid, uuid)', 'execute'), 'helpers are internal');

-- 2. Findable is off by default ---------------------------------------------------------------
select tests.as_user(:'ama');
select is(public.get_social_settings(), '{"findable": false, "share_activity": false}'::jsonb, 'nobody is findable by default');
select is((select count(*)::int from public.search_classmates('Kojo')), 0, 'so searching finds no one');
select throws_ok('select public.search_classmates(''K'')', 'P0001', 'query_invalid', 'a search needs two letters');
select tests.as_user(:'newbie');
select throws_ok('select public.search_classmates(''Kojo'')', 'P0001', 'not_verified', 'unverified students cannot search');
select throws_ok('select public.set_social_settings(true, false)', 'P0001', 'not_verified', 'or become findable');
select lives_ok('select public.set_social_settings(false, false)', 'but can keep things off');

select tests.as_user(:'kojo'); select public.set_social_settings(true, false);
select tests.as_user(:'esi'); select public.set_social_settings(true, true);
select tests.as_user(:'yaw'); select public.set_social_settings(true, true);

select tests.as_user(:'ama');
select is((select array_agg(name) from public.search_classmates('Kojo')), array['Kojo Boateng'], 'a findable classmate is found');
select is((select array_agg(name) from public.search_classmates('owusu')), array['Esi Owusu'], 'by any part of the name, any case');
select is((select count(*)::int from public.search_classmates('Nana')), 0, 'unverified students are never found');
select is((select count(*)::int from public.search_classmates('Yaw')), 0, 'students at another school are not found');
select is((select count(*)::int from public.search_classmates('%%')), 0, 'wildcards are treated as text');
select is((select relation from public.search_classmates('Kojo')), 'none', 'not connected yet');

-- 3. Requests ---------------------------------------------------------------------------------
select throws_ok(format('select public.send_friend_request(%L)', :'yaw'), 'P0001', 'student_not_found', 'no requests across schools');
select throws_ok(format('select public.send_friend_request(%L)', :'ama'), 'P0001', 'student_not_found', 'no requests to yourself');
select is(public.send_friend_request(:'kojo'), 'requested', 'Ama asks Kojo');
select is(public.send_friend_request(:'kojo'), 'requested', 'asking twice changes nothing');
select is((select relation from public.search_classmates('Kojo')), 'requested', 'search shows the request');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'kojo' and kind = 'friend.request'), 1, 'Kojo is told');
select tests.as_user(:'kojo');
select is((select direction from public.list_friend_requests()), 'incoming', 'Kojo sees an incoming request');
select is(public.count_friend_requests(), 1, 'counted for the badge');
select tests.as_user(:'ama');
select is(public.count_friend_requests(), 0, 'Ama''s own request is not a badge for her');
select throws_ok(format('select public.respond_friend_request(%L, true)', :'kojo'), 'P0001', 'request_not_found', 'you cannot accept your own request');
select tests.as_user(:'kojo');
select lives_ok(format('select public.respond_friend_request(%L, true)', :'ama'), 'Kojo accepts');
select is((select count(*)::int from public.list_friends()), 1, 'they are friends');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'ama' and kind = 'friend.accepted'), 1, 'Ama is told');

-- Esi asks Ama; Ama asking back accepts.
select tests.as_user(:'ama'); select public.set_social_settings(true, false);
select tests.as_user(:'esi'); select public.send_friend_request(:'ama');
select tests.as_user(:'ama');
select is(public.send_friend_request(:'esi'), 'friends', 'asking back accepts');
select is((select count(*)::int from public.list_friends()), 2, 'Ama has two friends');

-- 4. Activity only from friends who share it -------------------------------------------------
select tests.as_postgres();
insert into public.favourites (student_id, merchant_id) values (:'kojo', :'m'), (:'esi', :'m');
select tests.as_user(:'ama');
select is((select array_agg(name) from public.friends_on_offer(:'o1')), array['Esi Owusu'],
  'only friends who share their activity show up');
select tests.as_user(:'yaw');
select is((select count(*)::int from public.friends_on_offer(:'o1')), 0, 'strangers see nothing');

-- 5. Sharing a deal ---------------------------------------------------------------------------
select tests.as_user(:'ama');
select throws_ok(format('select public.share_deal(%L, %L)', :'yaw', :'o1'), 'P0001', 'not_friends', 'only friends');
select throws_ok(format('select public.share_deal(%L, %L, %L)', :'kojo', :'o1', repeat('x', 141)), 'P0001', 'note_invalid', 'short notes only');
select throws_ok(format('select public.share_deal(%L, %L)', :'kojo', gen_random_uuid()), 'P0001', 'offer_not_found', 'a real, live deal');
select lives_ok(format('select public.share_deal(%L, %L, %L)', :'kojo', :'o1', 'Let''s go Friday'), 'Ama shares a deal with Kojo');
select tests.as_user(:'kojo');
select is((select sender_name from public.list_shared_deals()), 'Ama Mensah', 'Kojo sees who shared it');
select is((select live from public.list_shared_deals()), true, 'and that it is live');
select lives_ok('select public.mark_shared_deals_seen()', 'and marks it seen');
select is((select seen from public.list_shared_deals()), true, 'seen');

-- 6. Friend chat ------------------------------------------------------------------------------
select tests.as_user(:'yaw');
select throws_ok(format('select public.start_friend_chat(%L)', :'ama'), 'P0001', 'not_friends', 'no chats with strangers');
select tests.as_user(:'ama');
select public.start_friend_chat(:'kojo') as chat \gset
select is(public.start_friend_chat(:'kojo'), :'chat'::uuid, 'one chat per pair');
select lives_ok(format('select public.send_friend_message(%L, %L)', :'chat', 'Hey Kojo'), 'Ama writes');
select throws_ok(format('select public.send_friend_message(%L, %L)', :'chat', '   '), 'P0001', 'message_invalid', 'empty messages are refused');
select tests.as_user(:'kojo');
select is((select unread from public.list_friend_chats()), 1, 'Kojo has one unread message');
select is(public.count_unread_friend_chats(), 1, 'counted for the badge');
select is((select count(*)::int from public.friend_messages where chat_id = :'chat'), 1, 'Kojo can read the chat');
select lives_ok(format('select public.mark_friend_chat_read(%L)', :'chat'), 'and marks it read');
select is(public.count_unread_friend_chats(), 0, 'nothing unread');
select tests.as_user(:'esi');
select is((select count(*)::int from public.friend_messages where chat_id = :'chat'), 0, 'others cannot read it');
select throws_ok(format('select public.send_friend_message(%L, %L)', :'chat', 'Hi'), 'P0001', 'forbidden', 'or write in it');
select is(public.get_friend_chat(:'chat'), null, 'or open it');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'kojo' and kind = 'friendchat.message'), 1, 'Kojo is told once');

-- 7. Reports ----------------------------------------------------------------------------------
select tests.as_user(:'kojo');
select throws_ok(format('select public.report_student(%L, ''rude'')', :'ama'), 'P0001', 'reason_invalid', 'a known reason');
select throws_ok(format('select public.report_student(%L, ''spam'', null, %L)', :'esi', :'chat'), 'P0001', 'forbidden',
  'a chat can only back a report about the other person in it');
select public.report_student(:'ama', 'harassment', 'Keeps messaging me', :'chat') as rep \gset
select throws_ok('select public.list_student_reports()', 'P0001', 'forbidden', 'students cannot list reports');
select tests.as_user(:'psupport', 'aal1');
select throws_ok('select public.list_student_reports()', 'P0001', 'forbidden', 'support needs two-factor');
select tests.as_user(:'psupport', 'aal2');
select is((select count(*)::int from public.list_student_reports()), 1, 'support lists open reports');
select is(jsonb_array_length(public.get_student_report(:'rep') -> 'messages'), 1, 'with the chat it came from');
select is(public.get_student_report(:'rep') ->> 'reported_name', 'Ama Mensah', 'and who was reported');
select lives_ok(format('select public.set_student_report_status(%L, ''resolved'', %L)', :'rep', 'Spoke to both students.'), 'support resolves it');
select is((select count(*)::int from public.list_student_reports('open')), 0, 'no open reports left');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'psupport' and kind = 'review.student_report'), 1, 'support was told');
select is((select count(*)::int from public.audit_logs where action like 'student_report.%'), 2, 'reports are audited');

-- 8. Blocking ---------------------------------------------------------------------------------
select tests.as_user(:'kojo');
select lives_ok(format('select public.block_student(%L)', :'ama'), 'Kojo blocks Ama');
select is((select count(*)::int from public.list_friends()), 0, 'the friendship ends');
select tests.as_user(:'ama');
select is((select count(*)::int from public.search_classmates('Kojo')), 0, 'Ama can no longer find Kojo');
select throws_ok(format('select public.send_friend_request(%L)', :'kojo'), 'P0001', 'student_not_found', 'or ask again');
select throws_ok(format('select public.send_friend_message(%L, %L)', :'chat', 'Hello?'), 'P0001', 'not_friends', 'or write to him');
select is((select count(*)::int from public.list_friend_chats()), 0, 'the chat is gone from her list');
select is((select count(*)::int from public.list_shared_deals()), 0, 'nothing shared crosses a block');
select tests.as_user(:'kojo');
select is((select name from public.list_blocked_students()), 'Ama Mensah', 'Kojo sees who he blocked');
select lives_ok(format('select public.unblock_student(%L)', :'ama'), 'and can unblock');
select tests.as_user(:'ama');
select is((select relation from public.search_classmates('Kojo')), 'none', 'unblocking does not restore the friendship');

-- 9. Notification settings -------------------------------------------------------------------
select is((select count(*)::int from public.get_my_notification_preferences() where category = 'friends'), 1, 'a Friends category exists');
select lives_ok('select public.set_notification_preference(''friends'', false, false)', 'and can be turned off');
select tests.as_postgres();
select is(private.notification_category('friendchat.message'), 'messages', 'friend chat counts as Messages');

-- 10. Account deletion takes everything with it ------------------------------------------------
delete from auth.users where id = :'esi';
select is((select count(*)::int from public.friendships where :'esi' in (user_a, user_b)), 0, 'friendships go with the account');
select is((select count(*)::int from public.student_social_settings where user_id = :'esi'), 0, 'and settings');

select * from finish();
rollback;
