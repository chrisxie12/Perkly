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
create function tests.as_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end;
$$;
create function tests.as_service()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
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
grant execute on all functions in schema tests to anon, authenticated, service_role;

select no_plan();

select id as gctu from public.institutions where slug = 'gctu' \gset
insert into public.institutions (slug, name, short_name, status, accreditation_status)
values ('test-uni', 'Test University College', 'TUC', 'pilot', 'confirmed') returning id as tuc \gset

select tests.create_user('admin@perqly.example', 'Perqly Admin') as padmin \gset
select tests.create_user('super@perqly.example', 'Perqly Super') as psuper \gset
select tests.create_user('support@perqly.example', 'Perqly Support') as psupport \gset
select tests.create_user('kofi@student.example', 'Kofi Owner') as s1 \gset
select tests.create_user('ama@student.example', 'Ama Reader') as s2 \gset
select tests.create_user('esi@student.example', 'Esi Reader') as s3 \gset
select tests.create_user('yaw@student.example', 'Yaw Unverified') as s4 \gset
select tests.create_user('akos@other.example', 'Akos Other School') as b1 \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin'), (:'psuper', 'super_admin'), (:'psupport', 'support');
select tests.as_user(:'s1'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s2'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s3'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s4'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'b1'); select public.upsert_student_profile(:'tuc');
select tests.as_postgres();
select tests.verify(:'s1'), tests.verify(:'s2'), tests.verify(:'s3'), tests.verify(:'b1');

-- 1. Privileges ---------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.admin_campus_overview()', 'execute'), 'anon cannot read the Campus overview');
select ok(not has_function_privilege('anon', 'public.set_rsvp(uuid, boolean)', 'execute'), 'anon cannot RSVP');
select ok(not has_function_privilege('anon', 'public.upcoming_events(timestamptz, uuid)', 'execute'), 'anon cannot list events');
select ok(has_function_privilege('authenticated', 'public.set_rsvp(uuid, boolean)', 'execute'), 'signed-in users can call set_rsvp');
select ok(not has_function_privilege('authenticated', 'private.event_json(uuid, uuid)', 'execute'), 'event_json is internal');
select ok(not has_table_privilege('authenticated', 'public.event_rsvps', 'select'), 'no direct reads of RSVPs');
select ok(not has_table_privilege('authenticated', 'public.campus_events', 'insert'), 'no direct writes of events');
select ok(not has_table_privilege('anon', 'public.campus_events', 'select'), 'anon has no table access to events');

-- 2. Admin overview (C5) ----------------------------------------------------------------------
select tests.as_user(:'s1');
select throws_ok('select public.admin_campus_overview()', 'P0001', 'forbidden', 'students cannot read the overview');
select tests.as_user(:'psupport', 'aal2');
select throws_ok('select public.admin_campus_overview()', 'P0001', 'forbidden', 'support cannot read the overview');
select tests.as_user(:'padmin', 'aal1');
select throws_ok('select public.admin_campus_overview()', 'P0001', 'forbidden', 'admins need two-factor');
select tests.as_user(:'padmin', 'aal2');
select is(public.admin_campus_overview() -> 'switches', '{"posts": false, "comments": false, "push": false}'::jsonb, 'all switches show off');
select ok(exists (select 1 from jsonb_array_elements(public.admin_campus_overview() -> 'schools') s where s ->> 'short_name' = 'TUC'),
  'listed schools are shown');
select is((select s ->> 'active' from jsonb_array_elements(public.admin_campus_overview() -> 'schools') s where s ->> 'institution_id' = :'gctu'),
  'false', 'no agreement yet');
select throws_ok(format('select public.admin_record_campus_agreement(%L, current_date - 30, null, %L, %L)', :'gctu', 'Registrar', 'Drive ref 1'),
  'P0001', 'forbidden', 'only super admins record agreements');
select throws_ok('select public.admin_set_campus_switch(''campus.posts_enabled'', true)', 'P0001', 'forbidden', 'only super admins switch Campus');
select tests.as_user(:'psuper', 'aal2');
select public.admin_record_campus_agreement(:'gctu', current_date - 30, null, 'Registrar', 'Drive ref 1');
select is((select s ->> 'active' from jsonb_array_elements(public.admin_campus_overview() -> 'schools') s where s ->> 'institution_id' = :'gctu'),
  'true', 'a recorded agreement shows as in force');
select public.admin_end_campus_agreement(:'gctu', current_date);
select is((select s ->> 'active' from jsonb_array_elements(public.admin_campus_overview() -> 'schools') s where s ->> 'institution_id' = :'gctu'),
  'false', 'an agreement ended today is no longer in force');
select public.admin_set_campus_switch('campus.posts_enabled', true);
select is(public.admin_campus_overview() -> 'switches' ->> 'posts', 'true', 'the overview reflects the switch');

-- Set up: an organisation, a member, a live post and a draft.
select tests.as_user(:'padmin', 'aal2');
select public.admin_create_organisation(:'gctu', 'src', 'GCTU SRC', 'src') as src \gset
select public.admin_create_organisation(:'tuc', 'src', 'TUC SRC', 'src') as tsrc \gset
select public.admin_set_organisation_status(:'src', 'verified');
select public.admin_set_organisation_status(:'tsrc', 'verified');
select public.admin_set_organisation_member(:'src', :'s1', 'owner', 'President');
select tests.as_user(:'s1');
select public.save_post(null, :'src', 'src_programme', 'Freshers'' night', 'Music and food.') as ev \gset
select public.publish_post(:'ev');
select public.save_post(null, :'src', 'workshop_seminar', 'CV clinic', 'Bring your CV.') as draft \gset
select public.save_post(null, :'src', 'campus_news', 'Past talk', 'Already happened.') as past \gset
select public.publish_post(:'past');

-- 3. Event details (C3) --------------------------------------------------------------------------
select lives_ok(format('select public.set_event_details(%L, now() + interval ''2 days'', now() + interval ''2 days 4 hours'', %L, 2)', :'ev', 'Main hall'),
  'an editor adds event details with a capacity of 2');
select lives_ok(format('select public.set_event_details(%L, now() + interval ''3 days'', null, %L)', :'draft', 'Library'),
  'an editor adds event details to a draft');
select throws_ok(format('select public.set_event_details(%L, now() + interval ''1 day'', now(), %L)', :'ev', 'Hall'),
  'P0001', 'event_invalid', 'the end must be after the start');
select throws_ok(format('select public.set_event_details(%L, now() + interval ''1 day'', now() + interval ''20 days'', %L)', :'ev', 'Hall'),
  'P0001', 'event_invalid', 'events last at most 14 days');
select throws_ok(format('select public.set_event_details(%L, now() + interval ''2 years'', null, %L)', :'ev', 'Hall'),
  'P0001', 'event_invalid', 'events start within a year');
select throws_ok(format('select public.set_event_details(%L, now() + interval ''1 day'', null, %L)', :'ev', ' '),
  'P0001', 'event_invalid', 'a venue is required');
select tests.as_user(:'s2');
select throws_ok(format('select public.set_event_details(%L, now() + interval ''1 day'', null, %L)', :'ev', 'Hall'),
  'P0001', 'post_not_found', 'non-members cannot add event details');
select tests.as_postgres();
update public.campus_events set starts_at = now() - interval '5 hours', ends_at = null where post_id = :'past';
insert into public.campus_events (post_id, institution_id, starts_at, venue)
select :'past', :'gctu', now() - interval '5 hours', 'Old hall' where not exists (select 1 from public.campus_events where post_id = :'past');

-- 4. Reads ---------------------------------------------------------------------------------------
select tests.as_user(:'s2');
select is(jsonb_array_length(public.upcoming_events()), 1, 'students see upcoming live events only (not drafts, not past)');
select is(public.upcoming_events() -> 0 ->> 'id', :'ev', 'the live event is listed');
select is(public.upcoming_events() -> 0 -> 'event' ->> 'venue', 'Main hall', 'with its venue');
select is(public.event_detail(:'ev') ->> 'going', '0', 'nobody is going yet');
select is(public.event_detail(:'draft'), null, 'students cannot read a draft''s event');
select tests.as_user(:'s4');
select is(public.upcoming_events(), '[]'::jsonb, 'unverified students see no events');
select is(public.event_detail(:'ev'), null, 'unverified students cannot read event details');
select tests.as_user(:'b1');
select is(public.upcoming_events(), '[]'::jsonb, 'students of another school see no GCTU events');
select is(public.event_detail(:'ev'), null, 'nor its details');
select throws_ok(format('select public.set_rsvp(%L, true)', :'ev'), 'P0001', 'not_found', 'nor RSVP');
select throws_ok('select count(*) from public.campus_events', '42501', null, 'no direct reads of event rows');

-- 5. RSVPs and capacity ------------------------------------------------------------------------
select tests.as_user(:'s2');
select is(public.set_rsvp(:'ev', true) ->> 'i_am_going', 'true', 'a verified student RSVPs');
select is(public.set_rsvp(:'ev', true) ->> 'going', '1', 'RSVPing twice counts once');
select tests.as_user(:'s3');
select is(public.set_rsvp(:'ev', true) ->> 'going', '2', 'a second student takes the last place');
select tests.as_user(:'s1');
select throws_ok(format('select public.set_rsvp(%L, true)', :'ev'), 'P0001', 'event_full', 'a full event refuses more');
select throws_ok(format('select public.set_event_details(%L, now() + interval ''2 days'', null, %L, 1)', :'ev', 'Main hall'),
  'P0001', 'capacity_below_going', 'capacity cannot drop below the number going');
select tests.as_user(:'s3');
select is(public.set_rsvp(:'ev', false) ->> 'going', '1', 'a student cancels, freeing a place');
select is(jsonb_array_length(public.my_events()), 0, 'cancelled events leave my events');
select tests.as_user(:'s2');
select is(jsonb_array_length(public.my_events()), 1, 'my events lists what I''m going to');
select tests.as_user(:'s1');
select lives_ok(format('select public.set_event_details(%L, now() + interval ''2 days'', null, %L, null, false)', :'ev', 'Main hall'),
  'an editor closes RSVPs');
select tests.as_user(:'s3');
select throws_ok(format('select public.set_rsvp(%L, true)', :'ev'), 'P0001', 'rsvp_closed', 'closed events refuse RSVPs');
select tests.as_user(:'s2');
select is(public.set_rsvp(:'ev', false) ->> 'going', '0', 'cancelling still works when closed');
select tests.as_user(:'s3');
select throws_ok(format('select public.set_rsvp(%L, true)', :'past'), 'P0001', 'event_over', 'finished events refuse RSVPs');
select throws_ok(format('select public.set_rsvp(%L, true)', :'draft'), 'P0001', 'not_found', 'drafts cannot be RSVPed');
select tests.as_user(:'psupport', 'aal2');
select ok(public.event_detail(:'ev') is not null, 'Perqly support can read event details');

-- 6. Switch, suspension, emergencies, removal -------------------------------------------------
select tests.as_postgres(); select tests.switch('campus.posts_enabled', false);
select tests.as_user(:'s2');
select throws_ok(format('select public.set_rsvp(%L, true)', :'ev'), 'P0001', 'campus_disabled', 'with Campus off, nobody RSVPs');
select is(public.upcoming_events(), '[]'::jsonb, 'with Campus off, no events are listed');
select tests.as_postgres(); select tests.switch('campus.posts_enabled', true);
select public.admin_record_campus_agreement(:'gctu', current_date - 30, null, 'Registrar', 'Drive ref 2')
  from (select tests.as_user(:'psuper', 'aal2')) x;
select tests.as_user(:'padmin', 'aal2');
select public.admin_create_organisation(:'gctu', 'administration', 'Registry', 'registry') as reg \gset
select public.admin_set_organisation_status(:'reg', 'verified');
select public.admin_set_organisation_member(:'reg', :'s1', 'editor', 'Officer');
select tests.as_user(:'s1');
select public.save_post(null, :'reg', 'emergency_notice', 'Water outage', 'No water in Hall A today.') as emerg \gset
select throws_ok(format('select public.set_event_details(%L, now() + interval ''1 day'', null, %L)', :'emerg', 'Hall A'),
  'P0001', 'event_not_allowed', 'emergency notices cannot be events');
select tests.as_user(:'s2'); select public.set_rsvp(:'ev', true) from (select 1) x where false;
select tests.as_user(:'s1');
select public.set_event_details(:'ev', now() + interval '2 days', null, 'Main hall', null, true);
select tests.as_user(:'s2'); select public.set_rsvp(:'ev', true);
select tests.as_postgres(); update public.profiles set is_suspended = true where id = :'s3';
select tests.as_user(:'s3');
select throws_ok(format('select public.set_rsvp(%L, true)', :'ev'), 'P0001', 'account_suspended', 'suspended students cannot RSVP');
select tests.as_user(:'s1');
select lives_ok(format('select public.remove_event_details(%L)', :'ev'), 'an editor removes the event details');
select tests.as_postgres();
select is((select count(*)::int from public.event_rsvps where post_id = :'ev'), 0, 'removing the event removes its RSVPs');
delete from auth.users where id = :'s2';
select is((select count(*)::int from public.event_rsvps where user_id = :'s2'), 0, 'deleting an account removes its RSVPs');

-- 7. Comments are returned with the post once switched on (C2) -------------------------------
select tests.switch('campus.comments_enabled', true);
select tests.as_user(:'s3');
select tests.as_postgres(); update public.profiles set is_suspended = false where id = :'s3';
select tests.as_user(:'s3');
select public.add_comment(:'past', 'Great talk') as c1 \gset
select is(jsonb_array_length(public.post_detail(:'past') -> 'comments'), 1, 'the comment shows on the post');
select is(public.post_detail(:'past') -> 'comments' -> 0 ->> 'mine', 'true', 'and is marked as mine');
select is(public.post_detail(:'past') -> 'comments' -> 0 ->> 'author', 'Esi', 'authors show by first name only');
select tests.as_user(:'s1');
select lives_ok(format('select public.hide_comment(%L)', :'c1'), 'the organisation hides a comment on its post');
select is(jsonb_array_length(public.post_detail(:'past') -> 'comments'), 0, 'hidden comments leave the post');
select tests.as_postgres(); select tests.switch('campus.comments_enabled', false);
select tests.as_user(:'s3');
select is(public.post_detail(:'past') -> 'comments', '[]'::jsonb, 'with comments off, none are returned');

select * from finish();
rollback;
