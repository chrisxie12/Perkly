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

-- 049: reminders (7 days, 24 hours, 1 hour; once only; never for cancelled events), analytics,
-- attendee list and export permissions, the admin overview.

select tests.as_user(:'s1');
select public.save_event(null, :'org', (select data from ev_base) || jsonb_build_object('title', 'Founders talk',
  'starts_at', now() + interval '8 days', 'ends_at', now() + interval '8 days 2 hours', 'capacity', 10)) as ev \gset
select public.publish_event(:'ev');
select public.save_event(null, :'org', (select data from ev_base) || jsonb_build_object('title', 'Quiz night',
  'starts_at', now() + interval '8 days', 'ends_at', now() + interval '8 days 2 hours')) as gone \gset
select public.publish_event(:'gone');
select tests.as_user(:'s2'); select public.register_for_event(:'ev'); select public.register_for_event(:'gone');
select tests.as_user(:'s3'); select public.register_for_event(:'ev');
select tests.as_user(:'s1'); select public.cancel_event(:'gone', 'Quizmaster is ill.');

-- Who runs them.
select ok(not has_function_privilege('authenticated', 'public.queue_due_event_reminders()', 'execute'), 'students can''t trigger reminders');
select ok(has_function_privilege('service_role', 'public.queue_due_event_reminders()', 'execute'), 'the scheduled job can');

-- Seven days before.
select tests.as_postgres();
select tests.move_event(:'ev', interval '6 days 20 hours', interval '6 days 22 hours');
select tests.move_event(:'gone', interval '6 days 20 hours', interval '6 days 22 hours');
update public.event_rsvps set created_at = now() - interval '3 days';
set local role service_role;
select is(public.queue_due_event_reminders(), 2, 'both students get the 7-day reminder');
select is(public.queue_due_event_reminders(), 0, 'and never twice');
reset role;
select is((select count(*)::int from public.notifications where kind = 'campus.event_reminder' and title like 'In a week:%'), 2, 'worded for a week ahead');
select is((select count(*)::int from public.notifications where kind = 'campus.event_reminder' and link like '%' || :'gone'), 0,
  'nothing for the cancelled event');

-- 24 hours, then 1 hour before.
select tests.move_event(:'ev', interval '20 hours', interval '22 hours');
set local role service_role;
select is(public.queue_due_event_reminders(), 2, 'the 24-hour reminder');
select is(public.queue_event_reminders(), 0, 'the daily job doesn''t repeat it');
reset role;
select tests.move_event(:'ev', interval '40 minutes', interval '3 hours');
set local role service_role;
select is(public.queue_due_event_reminders(), 2, 'the 1-hour reminder');
select is(public.queue_due_event_reminders(), 0, 'each once');
reset role;
select is((select count(*)::int from public.notifications where kind = 'campus.event_reminder' and user_id = :'s2'), 3, 'three reminders in all');

-- Switching a reminder off, and late registrations.
select tests.as_user(:'s5'); select public.register_for_event(:'ev');
select tests.as_postgres();
set local role service_role;
select is(public.queue_due_event_reminders(), 0, 'someone registering 40 minutes before doesn''t get the 7-day or 24-hour one');
reset role;
select tests.as_user(:'s1'); select public.save_event(:'ev', null, '{"remind_1h": false}');
select tests.as_postgres();
delete from public.event_reminders_sent where kind = '1h';
set local role service_role;
select is(public.queue_due_event_reminders(), 0, 'switched-off reminders aren''t sent');
reset role;

-- Rescheduling starts the reminders again.
select tests.as_user(:'s1'); select public.save_event(:'ev', null, '{"remind_1h": true}');
select public.reschedule_event(:'ev', now() + interval '50 minutes', now() + interval '3 hours');
select tests.as_postgres();
select is((select count(*)::int from public.event_reminders_sent where post_id = :'ev'), 0, 'a new time clears sent reminders');
update public.event_rsvps set created_at = now() - interval '3 days' where post_id = :'ev';
set local role service_role;
select is(public.queue_due_event_reminders(), 3, 'so the 1-hour reminder goes again for the new time');
reset role;

-- Analytics, lists and exports -----------------------------------------------------------------------
select tests.move_event(:'ev', interval '-1 hour', interval '2 hours');
select tests.as_user(:'s1');
select public.door_check_in_attendee(:'ev', :'s2');
select tests.as_user(:'e1');
select is(public.event_analytics(:'ev') ->> 'checked_in', '1', 'editors see check-in counts');
select is(public.event_analytics(:'ev') ->> 'capacity_used', '0.300', 'and how full the event is');
select is(jsonb_array_length(public.event_analytics(:'ev') -> 'registrations_by_day'), 1, 'with registrations by day');
select throws_ok(format('select public.event_attendees(%L)', :'ev'), 'P0001', 'not_found', 'but not names');
select throws_ok(format('select public.event_attendee_export(%L)', :'ev'), 'P0001', 'not_found', 'nor the export');
select tests.as_user(:'s2');
select throws_ok(format('select public.event_analytics(%L)', :'ev'), 'P0001', 'not_found', 'students see no analytics');
select throws_ok(format('select public.event_attendee_export(%L)', :'ev'), 'P0001', 'not_found', 'nor exports');
select tests.as_user(:'b1');
select throws_ok(format('select public.event_attendees(%L)', :'ev'), 'P0001', 'not_found', 'nor other schools');
select tests.as_user(:'s1');
select is(jsonb_array_length(public.event_attendees(:'ev')), 3, 'the owner sees the attendee list');
select ok(not (public.event_attendees(:'ev') -> 0 ? 'email'), 'without contact details');
select is(jsonb_array_length(public.event_attendee_export(:'ev') -> 'rows'), 3, 'and can export it');
select tests.as_postgres();
select ok(exists (select 1 from public.audit_logs where entity_id = :'ev' and action = 'event.exported'), 'exports are audited');
select tests.as_user(:'s1');
select public.complete_event(:'ev', true);
select tests.move_event(:'ev', interval '-5 hours', interval '-2 hours') from (select tests.as_postgres()) x;
select tests.as_user(:'s1');
select is(public.event_analytics(:'ev') ->> 'attendance_rate', '0.333', 'after the event: attendance rate');
select is(public.event_analytics(:'ev') ->> 'no_show', '2', 'and no-shows');

-- The admin overview.
select tests.as_user(:'s1');
select throws_ok('select public.admin_events_overview()', 'P0001', 'forbidden', 'organisers don''t see the platform overview');
select tests.as_user(:'padmin', 'aal2');
select is(public.admin_events_overview() ->> 'cancelled', '1', 'Perqly admins see cancelled events');
select is(public.admin_events_overview() ->> 'attendees', '1', 'attendees');
select is(public.admin_events_overview() ->> 'attendance_rate', '0.333', 'and the attendance rate from scanned events');

select * from finish();
rollback;
