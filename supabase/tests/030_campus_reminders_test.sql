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

-- Set up: Campus on, an organisation, a live event two days away and one tomorrow.
select tests.as_user(:'psuper', 'aal2');
select public.admin_set_campus_switch('campus.posts_enabled', true);
select tests.as_user(:'padmin', 'aal2');
select public.admin_create_organisation(:'gctu', 'src', 'GCTU SRC', 'src') as src \gset
select public.admin_set_organisation_status(:'src', 'verified');
select public.admin_set_organisation_member(:'src', :'s1', 'owner', 'President');
select tests.as_user(:'s1');
select public.save_post(null, :'src', 'src_programme', 'Freshers night', 'Music and food.') as ev \gset
select public.publish_post(:'ev');
select public.set_event_details(:'ev', now() + interval '30 hours', null, 'Main hall');
select public.save_post(null, :'src', 'workshop_seminar', 'CV clinic', 'Bring your CV.') as later \gset
select public.publish_post(:'later');
select public.set_event_details(:'later', now() + interval '5 days', null, 'Library');
select tests.as_user(:'s2'); select public.set_rsvp(:'ev', true); select public.set_rsvp(:'later', true);
select tests.as_user(:'s3'); select public.set_rsvp(:'ev', true);

-- 1. Privileges and switch ------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.queue_event_reminders()', 'execute'), 'only the daily job queues reminders');
select ok(has_function_privilege('service_role', 'public.queue_event_reminders()', 'execute'), 'the daily job can');
select tests.as_user(:'padmin', 'aal2');
select is(public.admin_campus_overview() -> 'switches' ->> 'push', 'false', 'phone and email for Campus start off');
select throws_ok('select public.admin_set_campus_switch(''campus.push_enabled'', true)', 'P0001', 'forbidden', 'only super admins switch it');
select tests.as_user(:'s1');
select throws_ok('select public.admin_set_setting(''campus.push_enabled'', ''1'')', 'P0001', null, 'it isn''t a tunable setting');

-- 2. Reminders, in-app only while push is off ---------------------------------------------------
select tests.as_postgres();
set local role service_role;
select is(public.queue_event_reminders(), 2, 'both students going to the event about 30 hours away get one reminder');
select is(public.queue_event_reminders(), 0, 'and never a second');
reset role;
select is((select count(*)::int from public.notifications where kind = 'campus.event_reminder' and push_status = 'skipped' and email_status = 'skipped'), 2,
  'with push off, reminders are in-app only');
select is((select category from public.notifications where kind = 'campus.event_reminder' limit 1), 'campus', 'in the Campus category');
select ok((select body from public.notifications where kind = 'campus.event_reminder' limit 1) like '%Main hall', 'with the date and venue');
select is((select count(*)::int from public.notifications where kind = 'campus.event_reminder' and link = '/student/campus/posts/' || :'later'), 0,
  'events further away aren''t reminded yet');

-- 3. With push on --------------------------------------------------------------------------------
select tests.as_user(:'psuper', 'aal2');
select public.admin_set_campus_switch('campus.push_enabled', true);
select tests.as_postgres();
update public.campus_events set starts_at = now() + interval '30 hours' where post_id = :'later';
set local role service_role;
select is(public.queue_event_reminders(), 1, 'the second event is now due');
reset role;
select is((select push_status || '/' || email_status from public.notifications where kind = 'campus.event_reminder' and link = '/student/campus/posts/' || :'later'),
  'pending/pending', 'with push on, reminders join the delivery queue');
select tests.as_user(:'s1');
select public.save_post(null, :'src', 'campus_news', 'Elections', 'Nominations open.') as news \gset
select tests.as_user(:'s2'); select public.follow_organisation(:'src', true);
select tests.as_user(:'s1'); select public.publish_post(:'news');
select tests.as_postgres();
select is((select push_status from public.notifications where kind = 'campus.post' and user_id = :'s2' and link like '%' || :'news'), 'pending',
  'followers'' post notifications are delivered too');

-- 4. Off again: nothing is queued when Campus is closed ------------------------------------------
select tests.as_user(:'psuper', 'aal2');
select public.admin_set_campus_switch('campus.posts_enabled', false);
select tests.as_postgres();
update public.event_rsvps set reminded_at = null;
set local role service_role;
select is(public.queue_event_reminders(), 0, 'with Campus off, no reminders');
reset role;

select * from finish();
rollback;
