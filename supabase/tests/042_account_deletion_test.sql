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
create function tests.verify(p_user uuid)
returns void language sql as $$
  update public.student_profiles
     set verification_status = 'verified', verified_at = now(), verified_until = now() + interval '1 year'
   where user_id = p_user;
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;
select no_plan();
select set_config('perqly.seed_pilot', 'on', true);
select id as gctu from public.institutions where slug = 'gctu' \gset
select id as food from public.merchant_categories where slug = 'food' \gset
select tests.create_user('owner@del.example', 'Abena Owner') as owner \gset
select tests.create_user('admin@del.example', 'Perqly Admin') as padmin \gset
select tests.create_user('ama@del.example', 'Ama Mensah') as ama \gset
select tests.create_user('kojo@del.example', 'Kojo Boateng') as kojo \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin');
select tests.as_user(:'ama'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'kojo'); select public.upsert_student_profile(:'gctu');
select tests.as_postgres(); select tests.verify(:'ama'); select tests.verify(:'kojo');

select tests.as_user(:'owner', 'aal2');
select public.register_merchant('Deletion Chop Bar', :'food') as m \gset
select public.upsert_merchant_branch(:'m', null, 'Tesano', null, 'Tesano', 'Accra', null, 5.6150, -0.2320) as b \gset
select public.sign_merchant_agreement(:'m', 1, 'Abena Owner', 'Owner', 'Deletion Chop Ltd', true);
select public.submit_merchant_for_review(:'m');
select tests.as_user(:'padmin', 'aal2'); select public.decide_merchant(:'m', 'approve');

-- Ama's footprint: a shop chat with a photo from each side, a rating, a saved shop,
-- a friend, a push device, a pass photo and a verification photo.
select tests.as_user(:'ama');
select public.start_conversation(:'m') as c \gset
select public.send_message(:'c', 'Do you open on Sunday?');
select tests.as_postgres();
insert into public.messages (conversation_id, sender_id, sender_side, body, photo_path)
values (:'c', :'ama', 'student', 'photo', 'shop/' || :'c' || '/' || :'ama' || '/' || gen_random_uuid() || '.webp'),
       (:'c', :'owner', 'merchant', 'menu', 'shop/' || :'c' || '/' || :'owner' || '/' || gen_random_uuid() || '.webp');
insert into storage.objects (bucket_id, name) select 'chat-photos', photo_path from public.messages where conversation_id = :'c' and photo_path is not null;
insert into public.merchant_reviews (merchant_id, student_id, rating, comment) values (:'m', :'ama', 5, 'Good jollof');
insert into public.favourites (student_id, merchant_id) values (:'ama', :'m');
insert into public.friendships (user_a, user_b, requested_by, status)
select least(:'ama'::uuid, :'kojo'::uuid), greatest(:'ama'::uuid, :'kojo'::uuid), :'ama', 'accepted';
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (:'ama', 'https://push.example/ama', repeat('k', 30), repeat('a', 16));
update public.profiles set avatar_path = :'ama' || '/pass.webp', phone = '+233200000001' where id = :'ama';
insert into storage.objects (bucket_id, name) values ('pass-photos', :'ama' || '/pass.webp'),
  ('verification-documents', :'ama' || '/' || gen_random_uuid() || '/card.webp');
insert into auth.identities (id, user_id, provider, provider_id, identity_data)
values (gen_random_uuid(), :'ama', 'email', :'ama', jsonb_build_object('sub', :'ama'));
insert into auth.sessions (id, user_id) values (gen_random_uuid(), :'ama');

-- Asking alerts admins -----------------------------------------------------------------
select tests.as_user(:'ama');
select public.request_account_deletion('Please delete me') as req \gset
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'padmin' and kind = 'account.deletion_requested'), 1,
  'admins are told about a new deletion request');
select is((select count(*)::int from public.notifications where user_id = :'ama' and kind = 'account.deletion_requested'), 0,
  'the person asking is not');

-- Only admins with a second factor -----------------------------------------------------
select tests.as_user(:'ama');
select throws_ok(format('select public.admin_complete_account_deletion(%L, %L)', :'req', 'Asked in the app'), 'P0001', 'forbidden',
  'a student cannot complete a deletion');
select throws_ok(format('select public.admin_preview_account_deletion(%L)', :'req'), 'P0001', 'forbidden',
  'or preview one');
select tests.as_user(:'padmin', 'aal1');
select throws_ok(format('select public.admin_complete_account_deletion(%L, %L)', :'req', 'Asked in the app'), 'P0001', 'forbidden',
  'an admin without a second factor cannot');
select tests.as_user(:'padmin', 'aal2');
select throws_ok(format('select public.resolve_account_deletion(%L, %L, %L)', :'req', 'completed', 'Done by hand'), 'P0001', 'use_complete_deletion',
  'completed can no longer be set without the deletion running');
select throws_ok(format('select public.admin_complete_account_deletion(%L, %L)', :'req', 'ok'), 'P0001', 'reason_required',
  'a note is required');

-- Preview -------------------------------------------------------------------------------
select tests.as_user(:'padmin', 'aal2');
select public.admin_preview_account_deletion(:'req') as preview \gset
select is((:'preview'::jsonb -> 'deleted' ->> 'shop_chats')::int, 1, 'preview counts the shop chat');
select is((:'preview'::jsonb -> 'deleted' ->> 'ratings')::int, 1, 'and the rating');
select is((:'preview'::jsonb -> 'deleted' ->> 'files')::int, 4, 'and the four files');
select is(:'preview'::jsonb -> 'blockers', '[]'::jsonb, 'nothing blocks it');

-- Complete ------------------------------------------------------------------------------
select public.admin_complete_account_deletion(:'req', 'Asked in the app') as result \gset
select is(:'result'::jsonb ->> 'email', 'ama@del.example', 'the original email comes back for the confirmation');
select tests.as_postgres();

select is((select count(*)::int from public.conversations where student_id = :'ama'), 0, 'the shop chat is gone');
select is((select count(*)::int from public.messages where conversation_id = :'c'), 0, 'with both sides'' messages');
select is((select count(*)::int from public.merchant_reviews where student_id = :'ama'), 0, 'the rating is gone');
select is((select count(*)::int from public.favourites where student_id = :'ama'), 0, 'saved shops are gone');
select is((select count(*)::int from public.friendships where :'ama'::uuid in (user_a, user_b)), 0, 'friends are gone');
select is((select count(*)::int from public.push_subscriptions where user_id = :'ama'), 0, 'push devices are gone');
select is((select count(*)::int from public.student_profiles where user_id = :'ama'), 0, 'the student record is gone');
select is((select count(*)::int from public.notifications where user_id = :'ama'), 0, 'notifications are gone');
select is((select count(*)::int from public.account_media_purge where request_id = :'req'), 4, 'all four files are queued for removal');
select ok((select bool_and(bucket = 'chat-photos') from public.account_media_purge where path like 'shop/%'), 'chat photos go to the chat bucket');

select ok((select full_name is null and first_name is null and avatar_path is null and phone is null and is_suspended and deleted_at is not null
           from public.profiles where id = :'ama'), 'the profile row stays but is empty');
select ok((select email = 'deleted+' || id || '@invalid.perqly' and banned_until = 'infinity' and phone is null and raw_user_meta_data = '{}'::jsonb
           from auth.users where id = :'ama'), 'sign-in is unusable and banned');
select is((select count(*)::int from auth.identities where user_id = :'ama') + (select count(*)::int from auth.sessions where user_id = :'ama'), 0,
  'identities and sessions are gone');
select is((select status from public.account_deletion_requests where id = :'req'), 'completed', 'the request is completed');
select is((select note from public.account_deletion_requests where id = :'req'), null, 'and the person''s note is cleared');
select ok(exists (select 1 from public.audit_logs where action = 'account.deletion_completed' and entity_id = :'ama'), 'it is audited');
select ok(not exists (select 1 from public.audit_logs where action = 'account.deletion_completed' and entity_id = :'ama'
                      and metadata::text like '%ama@del.example%'), 'without the email');
select is((select count(*)::int from public.merchants where id = :'m'), 1, 'the business is untouched');
select is((select count(*)::int from public.student_profiles where user_id = :'kojo'), 1, 'the friend keeps their account');

select throws_ok(format('update public.profiles set is_suspended = false where id = %L', :'ama'), 'P0001', 'account_deleted',
  'a deleted account cannot be restored');
select throws_ok(format('update public.profiles set full_name = %L where id = %L', 'Ama Again', :'ama'), 'P0001', 'account_deleted',
  'or given a name again');

-- Running it twice is safe --------------------------------------------------------------
select tests.as_user(:'padmin', 'aal2');
select throws_ok(format('select public.admin_complete_account_deletion(%L, %L)', :'req', 'Asked in the app'), 'P0001', 'request_not_open',
  'a completed request cannot run again');

-- Blockers ------------------------------------------------------------------------------
select tests.as_postgres();
insert into public.account_deletion_requests (user_id, note) values (:'owner', 'Close my account') returning id as oreq \gset
insert into public.account_deletion_requests (user_id, note) values (:'padmin', 'Close my account') returning id as areq \gset
select tests.as_user(:'padmin', 'aal2');
select throws_ok(format('select public.admin_complete_account_deletion(%L, %L)', :'oreq', 'Asked by email'), 'P0001', 'deletion_blocked',
  'a business owner must hand the business over first');
select is((public.admin_preview_account_deletion(:'oreq') -> 'blockers'), '["business_owner"]'::jsonb, 'the preview says why');
select throws_ok(format('select public.admin_complete_account_deletion(%L, %L)', :'areq', 'Asked by email'), 'P0001', 'cannot_delete_self',
  'an admin cannot delete themselves');

-- Email requests ------------------------------------------------------------------------
select tests.as_user(:'padmin', 'aal2');
select public.admin_open_deletion_request(:'kojo', 'Emailed from his account address') as kreq \gset
select is((select source from public.account_deletion_requests where id = :'kreq'), 'email', 'an emailed request is recorded');
select is(public.admin_open_deletion_request(:'kojo', 'Emailed again'), :'kreq'::uuid, 'and recording it twice keeps one open request');
select tests.as_user(:'kojo');
select throws_ok(format('select public.admin_open_deletion_request(%L, %L)', :'kojo', 'Emailed from his account address'), 'P0001', 'forbidden',
  'students cannot record requests for others');

-- Day-20 reminder -----------------------------------------------------------------------
select tests.as_postgres();
update public.account_deletion_requests set created_at = now() - interval '21 days' where id = :'kreq';
delete from public.notifications where user_id = :'padmin';
set local role service_role;
select is(public.remind_overdue_account_deletions(), 1, 'one request is 20 days old');
select is(public.remind_overdue_account_deletions(), 0, 'and it is only reminded once');
reset role;
select is((select count(*)::int from public.notifications where user_id = :'padmin' and kind = 'account.deletion_overdue'), 1,
  'admins get the reminder');

-- Storage queue -------------------------------------------------------------------------
set local role service_role;
select is((select count(*)::int from public.claim_account_media_due(10)), 4, 'the job claims the queued files');
select is((select count(*)::int from public.claim_account_media_due(10)), 0, 'claimed files are not handed out twice');
select is(public.mark_account_media_purged('pass-photos', array[:'ama' || '/pass.webp']), 1, 'a removed file is marked');
reset role;
select tests.as_user(:'padmin', 'aal2');
select throws_ok('select public.claim_account_media_due(10)', '42501', null, 'only the job can claim files');
select tests.as_postgres();
set local role authenticated;
select throws_ok('select count(*) from public.account_media_purge', '42501', null, 'signed-in people cannot read the queue');
reset role;

select * from finish();
rollback;
