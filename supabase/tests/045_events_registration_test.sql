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

-- 046: registration, eligibility, capacity, waitlist, approval, cancellation, sessions, privacy.

-- An event at capacity 2 with a waitlist, a question, and an online link (hybrid).
select tests.as_user(:'s1');
select public.save_event(null, :'org', (select data from ev_base) || jsonb_build_object(
  'capacity', 2, 'waitlist_enabled', true, 'format', 'hybrid', 'online_platform', 'Google Meet',
  'online_link', 'https://meet.example/abc-defg', 'online_link_lead_minutes', 60)) as ev \gset
select public.set_event_questions(:'ev', '[{"prompt": "Which track interests you?", "required": true}, {"prompt": "First hackathon?", "kind": "yes_no"}]');
select tests.as_postgres();
select id as q1 from public.event_questions where post_id = :'ev' and position = 1 \gset
select id as q2 from public.event_questions where post_id = :'ev' and position = 2 \gset
select tests.as_user(:'s2');
select throws_ok(format('select public.register_for_event(%L)', :'ev'), 'P0001', 'not_found', 'drafts can''t be registered for');
select tests.as_user(:'s1');
select public.publish_event(:'ev');

-- Who may register --------------------------------------------------------------------------------
select tests.as_user(:'s4');
select throws_ok(format('select public.register_for_event(%L)', :'ev'), 'P0001', 'not_found', 'unverified students can''t register');
select tests.as_user(:'b1');
select throws_ok(format('select public.register_for_event(%L)', :'ev'), 'P0001', 'not_found', 'students of another school can''t register');
select is(public.event_page(:'ev'), null, 'nor see the event page');
select is(jsonb_array_length(public.discover_events()), 0, 'nor find it in discovery');
select tests.as_user(:'s2');
select is(jsonb_array_length(public.discover_events()), 1, 'eligible students find it');
select is(public.discover_events() -> 0 -> 'event' ->> 'status', 'registration_open', 'with its status worked out');
select throws_ok(format('select public.register_for_event(%L, %L)', :'ev', '{}'), 'P0001', 'answer_required', 'required questions must be answered');
select throws_ok(format('select public.register_for_event(%L, %L)', :'ev', jsonb_build_object(gen_random_uuid()::text, 'x')),
  'P0001', 'answers_invalid', 'unknown questions are refused');
select throws_ok(format('select public.register_for_event(%L, %L)', :'ev', jsonb_build_object(:'q1', 'AI', :'q2', 'yes')),
  'P0001', 'answers_invalid', 'yes/no answers must be true or false');

-- Places and the waitlist ---------------------------------------------------------------------------
select is(public.register_for_event(:'ev', jsonb_build_object(:'q1', '  AI  ', :'q2', true)) -> 'my_registration' ->> 'status', 'confirmed',
  'a verified student registers and is confirmed');
select is(public.register_for_event(:'ev', jsonb_build_object(:'q1', 'AI')) ->> 'going', '1', 'registering twice counts once');
select ok((public.event_detail(:'ev') -> 'my_ticket' ->> 'qr') ~ '^PQT1:[0-9a-f]{32}$', 'a confirmed student gets a ticket with a QR secret');
select ok((public.event_detail(:'ev') ->> 'online_link') is null, 'the online link stays hidden until an hour before');
select tests.as_postgres();
select is((select answers ->> :'q1' from public.event_rsvps where post_id = :'ev' and user_id = :'s2'), 'AI', 'answers are stored trimmed');
select is((select count(*)::int from public.notifications where user_id = :'s2' and kind = 'campus.event_registered'), 1, 'and told they''re going');
select tests.as_user(:'s3');
select is(public.register_for_event(:'ev', jsonb_build_object(:'q1', 'Web')) -> 'my_registration' ->> 'status', 'confirmed', 'the second student takes the last place');
select is(public.event_detail(:'ev') ->> 'status', 'full', 'the event shows as full');
select ok((public.event_detail(:'ev') ->> 'online_link') is null, 'still no link this early');
select tests.as_user(:'s5');
select is(public.register_for_event(:'ev', jsonb_build_object(:'q1', 'Mobile')) -> 'my_registration' ->> 'status', 'waitlisted', 'the next student joins the waitlist');
select is(public.event_detail(:'ev') -> 'my_registration' ->> 'waitlist_position', '1', 'first in line');
select is(public.event_detail(:'ev') ->> 'my_ticket', null, 'a waitlisted student has no ticket');
select tests.as_user(:'s6');
select is(public.register_for_event(:'ev', jsonb_build_object(:'q1', 'Data')) -> 'my_registration' ->> 'waitlist_position', '2', 'second in line');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'s6' and kind = 'campus.event_waitlisted'), 1, 'told they''re on the waitlist');

-- A place frees up: first come, first served.
select tests.as_user(:'s3');
select is(public.cancel_event_registration(:'ev') -> 'my_registration' ->> 'status', 'cancelled', 'a confirmed student cancels');
select tests.as_postgres();
select is((select status from public.event_rsvps where post_id = :'ev' and user_id = :'s5'), 'confirmed', 'the first on the waitlist gets the place');
select is((select status from public.event_rsvps where post_id = :'ev' and user_id = :'s6'), 'waitlisted', 'the second waits on');
select is((select count(*)::int from public.event_tickets where post_id = :'ev' and user_id = :'s5' and status = 'active'), 1, 'with a ticket');
select is((select count(*)::int from public.notifications where user_id = :'s5' and kind = 'campus.event_promoted'), 1, 'and is told');
select is((select status from public.event_tickets where post_id = :'ev' and user_id = :'s3'), 'cancelled', 'the cancelled ticket is voided');
select is((select count(*)::int from public.event_rsvps where post_id = :'ev' and user_id = :'s3'), 1, 'the cancelled registration is kept as history');
select tests.as_user(:'s3');
select is(public.register_for_event(:'ev', jsonb_build_object(:'q1', 'Web')) -> 'my_registration' ->> 'status', 'waitlisted',
  'registering again joins the back of the line');
select is(public.event_detail(:'ev') -> 'my_registration' ->> 'waitlist_position', '2', 'behind the earlier one');

-- Capacity can't drop below the people holding places; raising it promotes from the waitlist.
select tests.as_user(:'s1');
select throws_ok(format('select public.save_event(%L, null, %L)', :'ev', '{"capacity": 1}'), 'P0001', 'capacity_below_going', 'capacity can''t drop below places taken');
select public.save_event(:'ev', null, '{"capacity": 3}');
select tests.as_postgres();
select is((select status from public.event_rsvps where post_id = :'ev' and user_id = :'s6'), 'confirmed', 'a bigger room promotes the next in line');
select is((select status from public.event_rsvps where post_id = :'ev' and user_id = :'s3'), 'waitlisted', 'and only as many as fit');

-- The online link, an hour before.
select tests.move_event(:'ev', interval '30 minutes', interval '4 hours');
select tests.as_user(:'s2');
select is(public.event_detail(:'ev') ->> 'online_link', 'https://meet.example/abc-defg', 'confirmed students get the link an hour before');
select tests.as_user(:'s3');
select is(public.event_detail(:'ev') ->> 'online_link', null, 'waitlisted students don''t');
select tests.as_user(:'b1');
select is(public.event_detail(:'ev'), null, 'nor students of another school');

-- Cancellation rules ------------------------------------------------------------------------------
select tests.as_user(:'s1');
select public.save_event(:'ev', null, '{"cancel_until_hours": 2}');
select tests.as_user(:'s2');
select throws_ok(format('select public.cancel_event_registration(%L)', :'ev'), 'P0001', 'cancel_too_late', 'no cancelling inside the organisers'' window');
select tests.as_user(:'s1');
select public.save_event(:'ev', null, '{"cancel_until_hours": 0, "cancellation_allowed": false}');
select tests.as_user(:'s2');
select throws_ok(format('select public.cancel_event_registration(%L)', :'ev'), 'P0001', 'cancel_not_allowed', 'or when the event doesn''t allow it');
select tests.as_user(:'s3');
select is(public.cancel_event_registration(:'ev') -> 'my_registration' ->> 'status', 'cancelled', 'leaving the waitlist is always allowed');

-- Registration windows ---------------------------------------------------------------------------
select tests.as_user(:'s1');
select public.save_event(null, :'org', (select data from ev_base) || jsonb_build_object('title', 'Career fair',
  'registration_opens_at', now() + interval '1 day', 'registration_closes_at', now() + interval '2 days')) as later \gset
select public.publish_event(:'later');
select tests.as_user(:'s2');
select is(public.event_detail(:'later') ->> 'status', 'published', 'before registration opens the status says so');
select throws_ok(format('select public.register_for_event(%L)', :'later'), 'P0001', 'registration_not_open', 'and nobody can register yet');
select tests.as_postgres();
update public.campus_events set registration_opens_at = now() - interval '2 days', registration_closes_at = now() - interval '1 day' where post_id = :'later';
select tests.as_user(:'s2');
select is(public.event_detail(:'later') ->> 'status', 'registration_closed', 'after the deadline the status says closed');
select throws_ok(format('select public.register_for_event(%L)', :'later'), 'P0001', 'registration_closed', 'and registration is refused');

-- Approval -----------------------------------------------------------------------------------------
select tests.as_user(:'s1');
select public.save_event(null, :'org', (select data from ev_base) || jsonb_build_object('title', 'Mentor lunch',
  'approval_required', true, 'capacity', 1)) as appr \gset
select public.publish_event(:'appr');
select tests.as_user(:'s2');
select is(public.register_for_event(:'appr') -> 'my_registration' ->> 'status', 'pending', 'events needing approval start pending');
select is(public.event_detail(:'appr') ->> 'my_ticket', null, 'with no ticket yet');
select tests.as_user(:'s3');
select is(public.register_for_event(:'appr') -> 'my_registration' ->> 'status', 'pending', 'pending doesn''t take a place');
select tests.as_user(:'e1');
select throws_ok(format('select public.decide_event_registration(%L, %L, true)', :'appr', :'s2'), 'P0001', 'not_found', 'editors can''t approve');
select tests.as_user(:'s2');
select throws_ok(format('select public.decide_event_registration(%L, %L, true)', :'appr', :'s2'), 'P0001', 'not_found', 'nor students');
select tests.as_user(:'s1');
select is(public.decide_event_registration(:'appr', :'s2', true) ->> 'status', 'confirmed', 'the owner approves');
select throws_ok(format('select public.decide_event_registration(%L, %L, true)', :'appr', :'s3'), 'P0001', 'event_full', 'approval respects capacity');
select is(public.decide_event_registration(:'appr', :'s3', false, 'Places went to final years.') ->> 'status', 'rejected', 'and declines');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'s2' and kind = 'campus.event_approved'), 1, 'approval is notified');
select is((select body from public.notifications where user_id = :'s3' and kind = 'campus.event_rejected'), 'Places went to final years.', 'so is the reason for declining');
select is((select count(*)::int from public.event_tickets where post_id = :'appr' and user_id = :'s2'), 1, 'approved students get a ticket');
select ok(exists (select 1 from public.audit_logs where entity_id = :'appr' and action = 'event.registration_approved'), 'decisions are audited');
select tests.as_user(:'s3');
select throws_ok(format('select public.register_for_event(%L)', :'appr'), 'P0001', 'registration_rejected', 'declined students can''t simply re-register');

-- Audiences beyond the school -------------------------------------------------------------------
select tests.as_user(:'s1');
select throws_ok(format('select public.set_event_audience(%L, %L)', :'later', 'all_verified'), 'P0001', 'forbidden',
  'organisers can''t open an event to every school');
select throws_ok(format('select public.set_event_audience(%L, %L, %L)', :'later', 'listed', jsonb_build_array(jsonb_build_object('kind', 'institution', 'id', :'tuc'))),
  'P0001', 'forbidden', 'nor list another school');
select tests.as_user(:'padmin', 'aal2');
select public.set_event_audience(:'appr', 'listed', jsonb_build_array(jsonb_build_object('kind', 'institution', 'id', :'tuc')));
select tests.as_user(:'b1');
select ok(public.event_page(:'appr') is not null, 'a Perqly admin can open an event to another school');
select tests.as_user(:'padmin', 'aal2');
select public.set_event_audience(:'appr', 'school');
select tests.as_user(:'b1');
select is(public.event_page(:'appr'), null, 'and close it again');

-- Conference sessions --------------------------------------------------------------------------
select tests.as_user(:'s1');
select public.save_event(null, :'org', (select data from ev_base) || jsonb_build_object('title', 'DevFest', 'event_type', 'conference',
  'session_registration', true, 'starts_at', now() + interval '10 days', 'ends_at', now() + interval '12 days')) as conf \gset
select public.save_event_session(:'conf', null, jsonb_build_object('title', 'Opening keynote', 'kind', 'keynote',
  'starts_at', now() + interval '10 days', 'ends_at', now() + interval '10 days 1 hour', 'capacity', 1)) as k1 \gset
select public.save_event_session(:'conf', null, jsonb_build_object('title', 'Flutter workshop', 'kind', 'workshop',
  'starts_at', now() + interval '10 days 30 minutes', 'ends_at', now() + interval '10 days 2 hours')) as w1 \gset
select public.save_event_session(:'conf', null, jsonb_build_object('title', 'Day two panel', 'kind', 'panel',
  'starts_at', now() + interval '11 days', 'ends_at', now() + interval '11 days 1 hour')) as p2 \gset
select throws_ok(format('select public.save_event_session(%L, null, %L)', :'conf', jsonb_build_object('title', 'Afterparty',
  'starts_at', now() + interval '13 days', 'ends_at', now() + interval '13 days 1 hour')), 'P0001', 'session_outside_event', 'sessions sit inside the event');
select public.publish_event(:'conf');
select tests.as_user(:'s2');
select throws_ok(format('select public.register_for_session(%L)', :'k1'), 'P0001', 'register_for_event_first', 'sessions need a place at the conference');
select public.register_for_event(:'conf');
select is(public.register_for_session(:'k1') ->> 'status', 'registered', 'a registered student books a session');
select throws_ok(format('select public.register_for_session(%L)', :'w1'), 'P0001', 'session_clash', 'overlapping sessions clash');
select is(public.register_for_session(:'p2') ->> 'status', 'registered', 'a session on another day is fine');
select is(jsonb_array_length(public.event_page(:'conf') -> 'sessions'), 3, 'the agenda lists every session');
select tests.as_user(:'s3');
select public.register_for_event(:'conf');
select throws_ok(format('select public.register_for_session(%L)', :'k1'), 'P0001', 'session_full', 'a full session refuses more');
select tests.as_user(:'s2');
select public.cancel_event_registration(:'conf');
select tests.as_postgres();
select is((select count(*)::int from public.event_session_registrations where user_id = :'s2' and status = 'registered'), 0,
  'cancelling the conference frees the sessions');

select * from finish();
rollback;
