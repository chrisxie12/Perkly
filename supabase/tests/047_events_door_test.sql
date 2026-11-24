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
     set verification_status = 'verified', verified_at = now() - interval '1 month', verified_until = now() + interval '1 year'
   where user_id = p_user;
$$;
create function tests.switch(p_key text, p_on boolean)
returns void language sql as $$
  update private.app_settings set value = to_jsonb(case when p_on then 1 else 0 end) where key = p_key;
$$;
-- Move an event's times as if time had passed (tests only).
create function tests.move_event(p_post uuid, p_starts interval, p_ends interval default null)
returns void language sql as $$
  update public.campus_events set starts_at = now() + p_starts, ends_at = case when p_ends is null then null else now() + p_ends end
   where post_id = p_post;
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

select no_plan();

select id as gctu from public.institutions where slug = 'gctu' \gset
insert into public.institutions (slug, name, short_name, status, accreditation_status)
values ('test-uni', 'Test University College', 'TUC', 'pilot', 'confirmed') returning id as tuc \gset
insert into public.campuses (institution_id, name) values (:'gctu', 'Test campus') returning id as tesano \gset

select tests.create_user('admin@perqly.example', 'Perqly Admin') as padmin \gset
select tests.create_user('super@perqly.example', 'Perqly Super') as psuper \gset
select tests.create_user('kofi@student.example', 'Kofi Owner') as s1 \gset
select tests.create_user('efua@student.example', 'Efua Editor') as e1 \gset
select tests.create_user('ama@student.example', 'Ama Mensah') as s2 \gset
select tests.create_user('esi@student.example', 'Esi Boateng') as s3 \gset
select tests.create_user('yaw@student.example', 'Yaw Unverified') as s4 \gset
select tests.create_user('kwame@student.example', 'Kwame Asare') as s5 \gset
select tests.create_user('abena@student.example', 'Abena Owusu') as s6 \gset
select tests.create_user('akos@other.example', 'Akos Other School') as b1 \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin'), (:'psuper', 'super_admin');
select tests.as_user(:'s1'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'e1'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s2'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s3'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s4'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s5'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s6'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'b1'); select public.upsert_student_profile(:'tuc');
select tests.as_postgres();
select tests.verify(:'s1'), tests.verify(:'e1'), tests.verify(:'s2'), tests.verify(:'s3'), tests.verify(:'s5'), tests.verify(:'s6'), tests.verify(:'b1');
update public.student_profiles set campus_id = :'tesano' where user_id = :'s5';

-- Campus on; an organisation with an owner (s1) and an editor (e1).
select tests.as_user(:'psuper', 'aal2');
select public.admin_set_campus_switch('campus.posts_enabled', true);
select tests.as_user(:'padmin', 'aal2');
select public.admin_create_organisation(:'gctu', 'club', 'GCTU Tech Club', 'tech') as org \gset
select public.admin_set_organisation_status(:'org', 'verified');
select public.admin_set_organisation_member(:'org', :'s1', 'owner', 'President');
select public.admin_set_organisation_member(:'org', :'e1', 'editor', 'Secretary');

-- A ready-to-publish event payload, starting in 3 days for 4 hours.
create temporary table ev_base as select jsonb_build_object(
  'title', 'Hack Night', 'description', 'Build something in a night with friends.', 'category', 'technology',
  'event_type', 'event', 'format', 'physical', 'venue', 'Main hall',
  'starts_at', now() + interval '3 days', 'ends_at', now() + interval '3 days 4 hours') as data;
grant select on ev_base to authenticated;

-- 048: tickets, QR secrets, check-in, door helpers, manual lookup.

select tests.as_user(:'s1');
select public.save_event(null, :'org', (select data from ev_base) || '{"title": "Demo day"}') as ev \gset
select public.publish_event(:'ev');
select public.save_event(null, :'org', (select data from ev_base) || '{"title": "Other night"}') as other \gset
select public.publish_event(:'other');
select tests.as_user(:'s2'); select public.register_for_event(:'ev');
select public.event_detail(:'ev') -> 'my_ticket' ->> 'qr' as qr2 \gset
select public.event_detail(:'ev') -> 'my_ticket' ->> 'code' as code2 \gset
select tests.as_user(:'s3'); select public.register_for_event(:'ev');
select public.event_detail(:'ev') -> 'my_ticket' ->> 'qr' as qr3 \gset
select tests.as_user(:'s5'); select public.register_for_event(:'other');
select public.event_detail(:'other') -> 'my_ticket' ->> 'qr' as qr5 \gset

-- Secrets ------------------------------------------------------------------------------------------
select tests.as_postgres();
select ok(:'qr2' <> :'qr3', 'every ticket has its own secret');
select is((select count(*)::int from public.event_tickets where secret_hash = private.ticket_secret_hash(substr(:'qr2', 6))), 1,
  'the table stores its hash');
select ok(not exists (select 1 from public.event_tickets t where encode(t.secret_hash, 'hex') like '%' || substr(:'qr2', 6) || '%'),
  'and never the secret itself');
select ok(not exists (select 1 from information_schema.columns where table_name = 'event_tickets' and column_name in ('secret', 'qr')),
  'there is no column holding raw secrets');
select tests.as_user(:'s3');
select isnt(public.event_detail(:'ev') -> 'my_ticket' ->> 'qr', :'qr2', 'a student only ever sees their own QR');

-- The door -------------------------------------------------------------------------------------------
select tests.as_user(:'s1');
select throws_ok(format('select public.door_check_in(%L, %L)', :'ev', :'qr2'), 'P0001', 'door_closed', 'doors open 24 hours before');
select tests.as_postgres(); select tests.move_event(:'ev', interval '1 hour', interval '4 hours'); select tests.move_event(:'other', interval '1 hour', interval '4 hours');
select tests.as_user(:'s2');
select throws_ok(format('select public.door_check_in(%L, %L)', :'ev', :'qr3'), 'P0001', 'post_not_found', 'students can''t scan');
select tests.as_user(:'s1');
select is(public.door_lookup_ticket(:'ev', :'qr2') ->> 'name', 'Ama Mensah', 'scanning shows whose ticket it is');
select throws_ok(format('select public.door_check_in(%L, %L)', :'ev', :'qr5'), 'P0001', 'ticket_not_found', 'a ticket for another event is refused');
select throws_ok(format('select public.door_check_in(%L, %L)', :'ev', 'PQT1:' || repeat('0', 32)), 'P0001', 'ticket_not_found', 'a made-up QR is refused');
select throws_ok(format('select public.door_check_in(%L, %L)', :'ev', 'not a ticket'), 'P0001', 'ticket_not_found', 'so is junk');
select is(public.door_check_in(:'ev', :'qr2') ->> 'status', 'checked_in', 'a valid QR checks the student in');
select throws_ok(format('select public.door_check_in(%L, %L)', :'ev', :'qr2'), 'P0001', 'already_checked_in', 'the same ticket can''t get in twice');
select throws_ok(format('select public.door_check_in(%L, %L)', :'ev', :'code2'), 'P0001', 'already_checked_in', 'not even by its code');
select tests.as_postgres();
select is((select status from public.event_rsvps where post_id = :'ev' and user_id = :'s2'), 'attended', 'the registration becomes attended');
select is((select checked_in_by from public.event_tickets where post_id = :'ev' and user_id = :'s2'), :'s1', 'with who checked them in');
select ok((select checked_in_at from public.event_tickets where post_id = :'ev' and user_id = :'s2') is not null, 'and when');
select tests.as_user(:'s2');
select throws_ok(format('select public.cancel_event_registration(%L)', :'ev'), 'P0001', 'already_checked_in', 'attended registrations can''t be cancelled');

-- Old codes still work (typed at the door, or old QRs holding just the code).
select tests.as_user(:'s3');
select public.event_detail(:'ev') -> 'my_ticket' ->> 'code' as code3 \gset
select tests.as_user(:'s1');
select is(public.door_check_in(:'ev', lower(substr(:'code3', 1, 4)) || '-' || substr(:'code3', 5)) ->> 'status', 'checked_in',
  'the 8-character code still works, in any case and with a dash');

-- Cancelled and rejected registrations never get in.
select tests.as_user(:'s6'); select public.register_for_event(:'ev');
select public.event_detail(:'ev') -> 'my_ticket' ->> 'qr' as qr6 \gset
select public.cancel_event_registration(:'ev');
select tests.as_user(:'s1');
select throws_ok(format('select public.door_check_in(%L, %L)', :'ev', :'qr6'), 'P0001', 'ticket_not_found', 'a cancelled ticket is refused');

-- Door helpers ---------------------------------------------------------------------------------------
select tests.as_user(:'e1');
select throws_ok(format('select public.set_event_door_helper(%L, %L, true)', :'ev', :'s5'), 'P0001', 'not_found', 'editors can''t add door helpers');
select tests.as_user(:'s1');
select throws_ok(format('select public.set_event_door_helper(%L, %L, true)', :'ev', :'b1'), 'P0001', 'helper_not_allowed',
  'helpers must be from the school or the organisation');
select public.set_event_door_helper(:'ev', :'s5', true);
select tests.as_user(:'s5');
select is(jsonb_array_length(public.my_scannable_events()), 1, 'a door helper sees the event they can scan');
select throws_ok(format('select public.save_event(%L, null, %L)', :'ev', '{"title": "Mine"}'), 'P0001', 'not_found', 'but can''t edit it');
select throws_ok(format('select public.event_attendees(%L)', :'ev'), 'P0001', 'not_found', 'or see the attendee list');
select throws_ok(format('select public.door_check_in(%L, %L)', :'other', :'qr5'), 'P0001', 'post_not_found', 'or scan other events');

-- Manual lookup ----------------------------------------------------------------------------------------
select tests.as_user(:'s6'); select public.cancel_event_registration(:'ev');
select tests.as_postgres();
update public.event_rsvps set status = 'cancelled' where post_id = :'ev' and user_id = :'s6';
select tests.as_user(:'s5');
select throws_ok(format('select public.door_search_attendees(%L, %L)', :'ev', 'a'), 'P0001', 'query_invalid', 'searches need two letters');
select is(jsonb_array_length(public.door_search_attendees(:'ev', 'ama')), 1, 'a helper finds a registered student by name');
select is(jsonb_array_length(public.door_search_attendees(:'ev', 'abena')), 0, 'cancelled registrations don''t show');
select tests.as_user(:'s1'); select public.set_event_door_helper(:'ev', :'s5', false);
select tests.as_user(:'s5');
select throws_ok(format('select public.door_search_attendees(%L, %L)', :'ev', 'ama'), 'P0001', 'post_not_found', 'removed helpers lose access');

-- Manual check-in for a registered student without their phone.
select tests.as_user(:'s5'); select public.register_for_event(:'other');
select tests.as_user(:'s1');
select is(public.door_check_in_attendee(:'other', :'s5') ->> 'manual', 'true', 'organisers can check a student in by name');
select throws_ok(format('select public.door_check_in_attendee(%L, %L)', :'other', :'s5'), 'P0001', 'already_checked_in', 'once only');

-- A student who loses verification can't get in.
select tests.as_user(:'s3'); select public.register_for_event(:'other');
select public.event_detail(:'other') -> 'my_ticket' ->> 'qr' as qr3b \gset
select tests.as_postgres(); update public.student_profiles set verified_until = now() - interval '1 day' where user_id = :'s3';
select tests.as_user(:'s1');
select throws_ok(format('select public.door_check_in(%L, %L)', :'other', :'qr3b'), 'P0001', 'not_verified', 'expired verification is refused at the door');

-- Merchant redemption is untouched: event codes aren't redemption codes.
select tests.as_postgres();
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname like '%redeem%' and pg_get_functiondef(p.oid) ilike '%event_tickets%'),
  'no redemption function reads event tickets');

select * from finish();
rollback;
