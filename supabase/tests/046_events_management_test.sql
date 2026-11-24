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

-- 047: creating and managing events; permissions; the Perqly organisation; audit.

-- Creating ---------------------------------------------------------------------------------------
select tests.as_user(:'s2');
select throws_ok(format('select public.save_event(null, %L, %L)', :'org', (select data from ev_base)), 'P0001', 'organisation_not_found',
  'students who aren''t organisers can''t create events');
select tests.as_user(:'e1');
select public.save_event(null, :'org', (select data from ev_base)) as ev \gset
select ok(:'ev' is not null, 'an organisation editor creates an event');
select is(public.event_page(:'ev') -> 'event' ->> 'lifecycle', 'draft', 'new events start as drafts');
select is(public.event_page(:'ev') -> 'event' ->> 'timezone', 'Africa/Accra', 'in Ghana time unless chosen otherwise');
select is(public.event_page(:'ev') -> 'event' -> 'category' ->> 'slug', 'technology', 'with its category');
select throws_ok(format('select public.save_event(%L, null, %L)', :'ev', '{"timezone": "Mars/Base"}'), 'P0001', 'timezone_invalid', 'unknown timezones are refused');
select throws_ok(format('select public.save_event(%L, null, %L)', :'ev', '{"category": "astrology"}'), 'P0001', 'category_invalid', 'unknown categories are refused');
select throws_ok(format('select public.save_event(%L, null, %L)', :'ev', jsonb_build_object('ends_at', now() + interval '1 day')),
  'P0001', 'event_invalid', 'the end must come after the start');
select lives_ok(format('select public.save_event(%L, null, %L)', :'ev', jsonb_build_object('ends_at', now() + interval '40 days')),
  'events can now run for weeks');
select public.save_event(:'ev', null, jsonb_build_object('ends_at', now() + interval '3 days 4 hours', 'timezone', 'Europe/London'));
select is(public.event_page(:'ev') -> 'event' ->> 'timezone', 'Europe/London', 'any real timezone can be chosen');
select tests.as_user(:'s2');
select is(public.event_page(:'ev'), null, 'students can''t see drafts');

-- Publishing --------------------------------------------------------------------------------------
select tests.as_user(:'e1');
select public.save_event(:'ev', null, '{"registration_closes_at": "2099-01-01T00:00:00Z"}');
select throws_ok(format('select public.publish_event(%L)', :'ev'), 'P0001', 'registration_after_end', 'registration can''t close after the event');
select public.save_event(:'ev', null, '{"registration_closes_at": null, "format": "online"}');
select throws_ok(format('select public.publish_event(%L)', :'ev'), 'P0001', 'online_link_required', 'online events need a link');
select public.save_event(:'ev', null, '{"format": "physical"}');
select is(public.publish_event(:'ev') ->> 'status', 'registration_open', 'a valid event publishes with registration open');
select throws_ok(format('select public.save_event(%L, null, %L)', :'ev', jsonb_build_object('starts_at', now() + interval '5 days')),
  'P0001', 'use_reschedule', 'a published event''s time changes only by rescheduling');
select tests.as_user(:'s2');
select is(public.event_page(:'ev') -> 'post' ->> 'title', 'Hack Night', 'students now see it');

-- Unpublishing --------------------------------------------------------------------------------------
select tests.as_user(:'e1');
select is(public.unpublish_event(:'ev') ->> 'status', 'draft', 'with nobody registered it can go back to draft');
select public.publish_event(:'ev');
select tests.as_user(:'s2'); select public.register_for_event(:'ev');
select tests.as_user(:'e1');
select throws_ok(format('select public.unpublish_event(%L)', :'ev'), 'P0001', 'registrations_exist', 'once people registered it can''t');
select throws_ok(format('select public.delete_event(%L)', :'ev'), 'P0001', 'not_draft', 'nor be deleted');

-- Rescheduling --------------------------------------------------------------------------------------
select throws_ok(format('select public.reschedule_event(%L, %L)', :'ev', now() - interval '1 hour'), 'P0001', 'starts_in_past', 'not into the past');
select public.reschedule_event(:'ev', now() + interval '6 days', now() + interval '6 days 3 hours');
select tests.as_user(:'s2');
select ok((public.event_detail(:'ev') ->> 'rescheduled_at') is not null, 'the event shows it was rescheduled');
select ok((public.event_detail(:'ev') ->> 'previous_starts_at')::timestamptz < (public.event_detail(:'ev') ->> 'starts_at')::timestamptz,
  'with the earlier time kept');
select is(public.event_detail(:'ev') -> 'my_registration' ->> 'status', 'confirmed', 'and registrations still stand');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'s2' and kind = 'campus.event_rescheduled'), 1, 'registered students are told');

-- Venue change notice.
select tests.as_user(:'e1');
select public.save_event(:'ev', null, '{"venue": "Library auditorium"}');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'s2' and kind = 'campus.event_venue_changed'), 1, 'a new venue is announced');

-- Announcements.
select tests.as_user(:'e1');
select is(public.send_event_announcement(:'ev', 'Bring a laptop', 'Power sockets are limited, bring a charged laptop.'), 1,
  'organisers send announcements to registered students');
select tests.as_user(:'s2');
select throws_ok(format('select public.send_event_announcement(%L, %L, %L)', :'ev', 'Hello', 'Spam message here'), 'P0001', 'not_found',
  'students can''t');

-- Cancelling ---------------------------------------------------------------------------------------
select tests.as_user(:'e1');
select throws_ok(format('select public.cancel_event(%L, %L)', :'ev', ''), 'P0001', 'reason_required', 'cancelling needs a reason');
select is(public.cancel_event(:'ev', 'The hall flooded.') ->> 'status', 'cancelled', 'an organiser cancels');
select tests.as_user(:'s2');
select is(public.event_detail(:'ev') ->> 'cancel_reason', 'The hall flooded.', 'students see why');
select is(public.event_detail(:'ev') -> 'my_registration' ->> 'status', 'cancelled', 'their registration is cancelled');
select throws_ok(format('select public.register_for_event(%L)', :'ev'), 'P0001', 'event_cancelled', 'nobody can register');
select tests.as_postgres();
select is((select status from public.event_tickets where post_id = :'ev' and user_id = :'s2'), 'cancelled', 'tickets are voided');
select is((select body from public.notifications where user_id = :'s2' and kind = 'campus.event_cancelled'), 'The hall flooded.', 'and students are told');
select ok(exists (select 1 from public.audit_logs where entity_id = :'ev' and action = 'event.cancelled'), 'cancelling is audited');
select tests.as_user(:'e1');
select throws_ok(format('select public.publish_event(%L)', :'ev'), 'P0001', 'not_draft', 'a cancelled event stays cancelled');
select is(public.archive_event(:'ev') ->> 'status', 'archived', 'it can be archived');
select tests.as_user(:'s2');
select is(public.event_page(:'ev'), null, 'archived events leave the student app');
select is(jsonb_array_length(public.my_event_registrations('cancelled')), 0, 'and My Events');

-- Completing ----------------------------------------------------------------------------------------
select tests.as_user(:'e1');
select public.save_event(null, :'org', (select data from ev_base) || '{"title": "Study jam"}') as jam \gset
select public.publish_event(:'jam');
select throws_ok(format('select public.complete_event(%L)', :'jam'), 'P0001', 'cannot_complete', 'events can''t complete before they start');
select tests.as_user(:'s2'); select public.register_for_event(:'jam');
select tests.as_user(:'s3'); select public.register_for_event(:'jam');
select tests.as_postgres(); select tests.move_event(:'jam', interval '-2 hours', interval '1 hour');
select tests.as_user(:'e1');
select public.door_check_in_attendee(:'jam', :'s2');
select is(public.complete_event(:'jam', true) ->> 'status', 'completed', 'a started event completes');
select tests.as_postgres();
select is((select status from public.event_rsvps where post_id = :'jam' and user_id = :'s3'), 'no_show', 'people who never came are marked no-show');
select is((select status from public.event_rsvps where post_id = :'jam' and user_id = :'s2'), 'attended', 'attendees stay attended');
select tests.as_user(:'s2');
select is(jsonb_array_length(public.my_event_registrations('attended')), 1, 'attended events show in My Events history');

-- Duplicating and deleting ---------------------------------------------------------------------------
select tests.as_user(:'e1');
select public.duplicate_event(:'jam') as copy \gset
select is(public.event_page(:'copy') -> 'post' ->> 'title', 'Copy of Study jam', 'duplicating makes a new draft');
select is(public.event_page(:'copy') -> 'event' ->> 'going', '0', 'without registrations');
select lives_ok(format('select public.delete_event(%L)', :'copy'), 'an untouched draft can be deleted');
select is(public.event_page(:'copy'), null, 'and is gone');

-- Permissions ---------------------------------------------------------------------------------------
select tests.as_user(:'s2');
select throws_ok(format('select public.save_event(%L, null, %L)', :'jam', '{"title": "Hacked"}'), 'P0001', 'not_found', 'students can''t edit events');
select throws_ok(format('select public.cancel_event(%L, %L)', :'jam', 'because'), 'P0001', 'not_found', 'or cancel them');
select throws_ok('select count(*) from public.event_questions', '42501', null, 'event tables can''t be read directly');
select throws_ok('select count(*) from public.event_sessions', '42501', null, 'including sessions');
select is(jsonb_array_length(public.manage_events_list()), 0, 'students manage no events');
select tests.as_user(:'b1');
select is(jsonb_array_length(public.manage_events_list()), 0, 'nor do students of another school');
select tests.as_user(:'e1');
select ok(jsonb_array_length(public.manage_events_list()) >= 2, 'organisers see their organisation''s events');
select tests.as_user(:'padmin', 'aal2');
select ok(jsonb_array_length(public.manage_events_list(jsonb_build_object('institution_id', :'gctu'))) >= 2, 'Perqly admins see every school''s events');
select tests.as_user(:'padmin', 'aal1');
select is(jsonb_array_length(public.manage_events_list()), 0, 'but only with two-factor');

-- Perqly's own organisation ---------------------------------------------------------------------------
select tests.as_user(:'s1');
select throws_ok(format('select public.admin_perqly_organisation(%L)', :'gctu'), 'P0001', 'forbidden', 'only Perqly admins make the Perqly organisation');
select tests.as_user(:'padmin', 'aal2');
select public.admin_perqly_organisation(:'gctu') as porg \gset
select is(public.admin_perqly_organisation(:'gctu'), :'porg', 'one per school');
select throws_ok(format('select public.admin_set_organisation_member(%L, %L, %L)', :'porg', :'s1', 'owner'), 'P0001', null,
  'it takes no members, so nobody gets organisation powers');
select public.save_event(null, :'porg', (select data from ev_base) || '{"title": "Perqly meetup"}') as pev \gset
select public.publish_event(:'pev');
select tests.as_user(:'s1');
select throws_ok(format('select public.save_event(%L, null, %L)', :'pev', '{"title": "Mine now"}'), 'P0001', 'not_found',
  'organisers of other organisations can''t edit Perqly events');
select tests.as_user(:'s2');
select is(public.event_page(:'pev') -> 'post' -> 'organisation' ->> 'kind', 'perqly', 'students see it as Perqly''s');
select isnt(public.event_page(:'pev') -> 'post' -> 'organisation' ->> 'badge', 'university_official', 'never as the university''s own');

-- Categories ---------------------------------------------------------------------------------------
select is(jsonb_array_length(public.event_categories()), 13, 'the 13 categories are there');
select throws_ok(format('select public.admin_save_event_category(%L, %L)', 'gaming', 'Gaming'), 'P0001', 'forbidden', 'students can''t add categories');
select tests.as_user(:'padmin', 'aal2');
select public.admin_save_event_category('gaming', 'Gaming', 95);
select is(jsonb_array_length(public.event_categories()), 14, 'Perqly admins add more');

-- Every change is in the audit log.
select tests.as_postgres();
select ok((select count(*) from public.audit_logs where entity_type = 'campus_event' and action in
  ('event.created', 'event.updated', 'event.published', 'event.unpublished', 'event.rescheduled', 'event.cancelled',
   'event.archived', 'event.completed', 'event.duplicated', 'event.deleted', 'event.announced')) >= 11, 'management actions are audited');

select * from finish();
rollback;
