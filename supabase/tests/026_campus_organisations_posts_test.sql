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
-- Every page of the caller's feed, following the cursor until it runs out.
create function tests.feed_ids()
returns uuid[] language plpgsql as $$
declare
  v_ids uuid[] := '{}';
  v_page jsonb;
  v_at timestamptz;
  v_id uuid;
begin
  loop
    v_page := public.campus_feed(v_at, v_id, false);
    exit when jsonb_array_length(v_page) = 0;
    v_ids := v_ids || array(select (e ->> 'id')::uuid from jsonb_array_elements(v_page) e);
    v_at := (v_page -> -1 ->> 'publish_at')::timestamptz;
    v_id := (v_page -> -1 ->> 'id')::uuid;
  end loop;
  return v_ids;
end;
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

select no_plan();

-- Two schools: GCTU (seed) and a second listed school.
select id as gctu from public.institutions where slug = 'gctu' \gset
insert into public.institutions (slug, name, short_name, status, accreditation_status)
values ('test-uni', 'Test University College', 'TUC', 'pilot', 'confirmed') returning id as tuc \gset

select tests.create_user('admin@perqly.example', 'Perqly Admin') as padmin \gset
select tests.create_user('super@perqly.example', 'Perqly Super') as psuper \gset
select tests.create_user('kofi@student.example', 'Kofi Owner') as s1 \gset
select tests.create_user('efua@student.example', 'Efua Editor') as s2 \gset
select tests.create_user('ama@student.example', 'Ama Reader') as s3 \gset
select tests.create_user('yaw@student.example', 'Yaw Unverified') as s4 \gset
select tests.create_user('akos@other.example', 'Akos Other School') as b1 \gset
select tests.create_user('kwame@student.example', 'Kwame Later Suspended') as sus \gset
insert into public.platform_staff (user_id, role) values (:'padmin', 'admin'), (:'psuper', 'super_admin');

select tests.as_user(:'s1'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s2'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s3'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'s4'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'sus'); select public.upsert_student_profile(:'gctu');
select tests.as_user(:'b1'); select public.upsert_student_profile(:'tuc');
select tests.as_postgres();
select tests.verify(:'s1'), tests.verify(:'s2'), tests.verify(:'s3'), tests.verify(:'sus'), tests.verify(:'b1');

-- 1. Privileges -------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.campus_feed(timestamptz, uuid, boolean)', 'execute'), 'anon cannot call the school feed');
select ok(has_function_privilege('anon', 'public.public_post(uuid)', 'execute'), 'anon can call public_post');
select ok(has_function_privilege('anon', 'public.public_organisation(text, text, timestamptz, uuid)', 'execute'), 'anon can call public_organisation');
select ok(has_function_privilege('authenticated', 'public.save_post(uuid, uuid, text, text, text, text, text, text, text[])', 'execute'), 'signed-in users can call save_post');
select ok(not has_function_privilege('authenticated', 'public.claim_campus_media_due(int)', 'execute'), 'signed-in users cannot claim media for removal');
select ok(has_function_privilege('service_role', 'public.claim_campus_media_due(int)', 'execute'), 'the service role can claim media for removal');
select ok(not has_function_privilege('anon', 'public.claim_campus_media_due(int)', 'execute'), 'anon cannot claim media for removal');
select ok(has_function_privilege('authenticated', 'private.can_read_post(uuid)', 'execute'), 'policy helpers are callable by signed-in users');
select ok(not has_function_privilege('anon', 'private.can_read_post(uuid)', 'execute'), 'policy helpers are not callable by anon');
select ok(not has_function_privilege('authenticated', 'private.notify_campus(uuid)', 'execute'), 'notify_campus is internal');
select ok(has_function_privilege('authenticated', 'private.can_review_institution(uuid)', 'execute'), 'existing grants are kept (can_review_institution)');
select ok(has_function_privilege('anon', 'private.institution_is_listed(uuid)', 'execute'), 'existing grants are kept (institution_is_listed)');
select ok(has_function_privilege('authenticated', 'private.can_read_pass_photo(text)', 'execute'), 'existing grants are kept (pass photos)');
select ok(not has_table_privilege('anon', 'public.campus_posts', 'select'), 'anon has no table access to posts');
select ok(not has_table_privilege('authenticated', 'public.campus_posts', 'insert'), 'signed-in users cannot insert posts directly');
select ok(not has_table_privilege('authenticated', 'public.content_reports', 'select'), 'signed-in users cannot read reports');
select ok(not has_table_privilege('authenticated', 'public.campus_agreements', 'select'), 'signed-in users cannot read agreements');
select ok(not has_table_privilege('authenticated', 'public.campus_media_purge', 'select'), 'signed-in users cannot read the purge queue');

-- 2. Settings ---------------------------------------------------------------------------
select is(private.setting_int('campus.posts_enabled', -1), 0, 'posts switch starts at 0');
select is(private.setting_int('campus.comments_enabled', -1), 0, 'comments switch starts at 0');
select ok(private.is_tunable_setting('campus.posts_per_org_per_day') and private.is_tunable_setting('redemption.select_window_seconds')
          and private.is_tunable_setting('verification.otp_max_per_hour'), 'limits are tunable and existing keys still are');
select ok(not private.is_tunable_setting('campus.posts_enabled'), 'switches are not tunable through admin_set_setting');

-- 3. Admin set-up works while switched off -----------------------------------------------
select tests.as_user(:'padmin', 'aal1');
select throws_ok(format('select public.admin_create_organisation(%L, %L, %L, %L)', :'gctu', 'src', 'GCTU SRC', 'src'),
  'P0001', 'forbidden', 'admins without two-factor cannot create organisations');
select tests.as_user(:'padmin', 'aal2');
select public.admin_create_organisation(:'gctu', 'src', 'GCTU SRC', 'src') as src \gset
select public.admin_create_organisation(:'gctu', 'club', 'Coding Club', 'coding-club') as club \gset
select public.admin_create_organisation(:'tuc', 'src', 'TUC SRC', 'src') as tsrc \gset
select ok(:'src' is not null, 'an admin with two-factor creates an organisation while Campus is off');
select throws_ok(format('select public.admin_create_organisation(%L, %L, %L, %L)', :'gctu', 'administration', 'Registry', 'registry'),
  'P0001', 'agreement_required', 'administration organisations need an active agreement');
select throws_ok(format('select public.admin_create_organisation(%L, %L, %L, %L)', :'gctu', 'club', 'Again', 'src'),
  'P0001', 'slug_taken', 'slugs are unique per school');
select lives_ok(format('select public.admin_set_organisation_status(%L, %L)', :'src', 'verified'), 'an admin verifies an organisation');
select public.admin_set_organisation_status(:'club', 'verified');
select public.admin_set_organisation_status(:'tsrc', 'verified');
select lives_ok(format('select public.admin_set_organisation_member(%L, %L, %L, %L)', :'src', :'s1', 'owner', 'SRC President'), 'an admin appoints the first owner');
select public.admin_set_organisation_member(:'club', :'s1', 'owner', 'Club lead');
select throws_ok(format('select public.admin_set_organisation_member(%L, %L, %L)', :'src', :'b1', 'editor'),
  'P0001', 'member_not_eligible', 'a student of another school cannot join');
select throws_ok(format('select public.admin_set_organisation_member(%L, %L, %L)', :'src', :'s4', 'editor'),
  'P0001', 'member_not_eligible', 'an unverified student cannot join');
select is(public.admin_find_user_by_email('KOFI@student.example'), :'s1'::uuid, 'admins find accounts by email');

-- 4. Switched off: student and member functions refuse; reads are empty -----------------
select tests.as_user(:'s1');
select throws_ok(format('select public.save_post(null, %L, %L, %L, %L)', :'src', 'src_programme', 'Week of welcome', 'Details'),
  'P0001', 'campus_disabled', 'with the switch off, members cannot write');
select is(public.campus_feed(), '[]'::jsonb, 'with the switch off, the feed is empty');
select is(public.my_organisations() -> 0 ->> 'role', 'owner', 'members still see their own memberships');
select is((select count(*)::int from public.campus_organisations), 0, 'with the switch off, organisations are not readable');

select tests.as_postgres(); select tests.switch('campus.posts_enabled', true);

-- 5. Members and posts --------------------------------------------------------------------
select tests.as_user(:'s1');
select lives_ok(format('select public.set_organisation_member(%L, %L, %L, %L)', :'src', 'efua@student.example', 'editor', 'General Secretary'),
  'an owner adds a verified student of the school as editor');
select throws_ok(format('select public.set_organisation_member(%L, %L, %L)', :'src', 'akos@other.example', 'editor'),
  'P0001', 'member_not_eligible', 'owners cannot add students of other schools');
select throws_ok(format('select public.set_organisation_member(%L, %L, %L)', :'src', 'nobody@nowhere.example', 'editor'),
  'P0001', 'member_not_eligible', 'unknown addresses get the same answer');
select throws_ok(format('select public.remove_organisation_member(%L, %L)', :'src', :'s1'), 'P0001', 'last_owner', 'the last owner cannot be removed');
select tests.as_user(:'s2');
select public.save_post(null, :'src', 'src_programme', 'Week of welcome', 'Join us at the SRC office.') as p1 \gset
select ok(:'p1' is not null, 'an editor saves a draft');
select throws_ok(format('select public.save_post(null, %L, %L, %L, %L)', :'src', 'emergency_notice', 'Fire drill', 'Leave now'),
  'P0001', 'emergency_not_allowed', 'a verified student body cannot post emergencies');
select throws_ok(format('select public.save_post(null, %L, %L, %L, %L, %L)', :'src', 'campus_news', 'Link', 'Body', 'http://insecure.example'),
  'P0001', 'post_invalid', 'links must be https');
select tests.as_user(:'s3');
select throws_ok(format('select public.save_post(null, %L, %L, %L, %L)', :'src', 'campus_news', 'Not mine', 'Body'),
  'P0001', 'forbidden', 'non-members cannot post');
select is((select count(*)::int from public.campus_posts where id = :'p1'), 0, 'readers cannot see drafts');
select tests.as_user(:'s2');
select is(public.publish_post(:'p1') ->> 'live', 'true', 'publishing now makes the post live');
select tests.as_user(:'s3');
select is(jsonb_array_length(public.campus_feed()), 1, 'a verified student of the school sees the live post');
select is(public.post_detail(:'p1') -> 'organisation' ->> 'badge', 'verified', 'an SRC is a Verified organisation');
select ok(public.post_detail(:'p1') -> 'organisation' ->> 'badge' <> 'university_official', 'an SRC is never University official');

-- 6. Isolation and verification ----------------------------------------------------------
select tests.as_user(:'s4');
select is(public.campus_feed(), '[]'::jsonb, 'an unverified student sees no school-only posts');
select is((select count(*)::int from public.campus_posts), 0, 'an unverified student reads no post rows');
select throws_ok(format('select public.set_post_like(%L, true)', :'p1'), 'P0001', 'not_found', 'an unverified student cannot like');
select is(public.organisation_directory() ->> 'full', 'false', 'an unverified student gets the short directory');
select tests.as_user(:'b1');
select is(public.campus_feed(), '[]'::jsonb, 'a student of another school sees nothing from GCTU');
select is(public.post_detail(:'p1'), null, 'post detail is empty for another school');
select is((select count(*)::int from public.campus_posts where id = :'p1'), 0, 'no GCTU post rows for another school');
select is((select count(*)::int from public.campus_organisations where institution_id = :'gctu'), 0, 'no GCTU organisation rows for another school');
select is((select count(*)::int from public.organisation_members where organisation_id = :'src'), 0, 'no GCTU representatives for another school');
select is(jsonb_array_length(public.organisation_directory() -> 'items'), 1, 'the directory lists only their own school');
select throws_ok(format('select public.follow_organisation(%L, true)', :'src'), 'P0001', 'not_found', 'cannot follow another school''s organisation');
select is(public.organisation_profile('src') ->> 'name', 'TUC SRC', 'a slug resolves within the caller''s school only');
select tests.as_anon();
select throws_ok('select count(*) from public.campus_posts', '42501', null, 'anon has no table access');
select is(public.public_post(:'p1'), null, 'a school-only post is not public');

-- 7. Database constraints keep schools apart, whoever writes -----------------------------
select tests.as_postgres();
select throws_ok(format('insert into public.post_likes (post_id, institution_id, user_id) values (%L, %L, %L)', :'p1', :'tuc', :'b1'),
  '23503', null, 'a like cannot point at another school''s post');
select throws_ok(format($q$insert into public.campus_posts (institution_id, organisation_id, kind, title, body) values (%L, %L, 'campus_news', 'Cross', 'x')$q$, :'tuc', :'src'),
  '23503', null, 'a post cannot belong to another school''s organisation');
select throws_ok(format($q$insert into public.organisation_members (organisation_id, institution_id, user_id, role) values (%L, %L, %L, 'editor')$q$, :'src', :'tuc', :'b1'),
  '23503', null, 'a membership cannot cross schools');
select throws_ok(format($q$insert into public.organisation_follows (organisation_id, institution_id, user_id) values (%L, %L, %L)$q$, :'src', :'tuc', :'b1'),
  '23503', null, 'a follow cannot cross schools');
select throws_ok(format($q$insert into public.content_reports (institution_id, post_id, organisation_id, reporter_id, reason) values (%L, %L, %L, %L, 'spam')$q$, :'gctu', :'p1', :'src', :'s3'),
  '23514', null, 'a report has exactly one target');
select throws_ok(format($q$insert into public.content_reports (institution_id, post_id, reporter_id, reason) values (%L, %L, %L, 'spam')$q$, :'tuc', :'p1', :'b1'),
  '23503', null, 'a report cannot point across schools');
select throws_ok(format($q$insert into public.post_media (post_id, institution_id, path, position) values (%L, %L, %L, 1)$q$, :'p1', :'gctu', :'tuc' || '/' || :'src' || '/post/' || gen_random_uuid() || '.jpg'),
  '23514', null, 'an image path must start with the post''s school');
select throws_ok(format('update public.campus_posts set publish_at = now() + interval ''1 day'' where id = %L', :'p1'),
  'P0001', 'post_already_live', 'a live post''s publish time cannot move');

-- 8. Notifications are in-app only --------------------------------------------------------
select is((select count(*)::int from public.notifications where kind like 'campus.%'), 0, 'nobody follows yet, so no notification');
select tests.as_user(:'s3'); select public.follow_organisation(:'src', true);
select tests.as_user(:'s2');
select public.save_post(null, :'src', 'campus_news', 'Elections', 'Nominations open.') as p2 \gset
select public.publish_post(:'p2');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where kind = 'campus.post' and user_id = :'s3'), 1, 'a follower gets an in-app notification');
select is((select count(*)::int from public.notifications where kind like 'campus.%' and (push_status <> 'skipped' or email_status <> 'skipped')), 0,
  'every campus notification is skipped for push and email');
select is((select count(*)::int from public.claim_notification_deliveries(500) where kind like 'campus.%'), 0, 'the delivery queue never picks up campus notifications');

-- 9. Scheduling -----------------------------------------------------------------------------
select tests.as_user(:'s2');
select public.save_post(null, :'src', 'workshop_seminar', 'CV clinic', 'Bring your CV.') as p3 \gset
select is(public.publish_post(:'p3', now() + interval '1 hour') ->> 'live', 'false', 'a post can be scheduled');
select is((select count(*)::int from public.notifications where link like '%' || :'p3'), 0, 'scheduling sends no notification');
select ok(exists (select 1 from jsonb_array_elements(public.organisation_posts_for_editor(:'src')) e where e ->> 'id' = :'p3'), 'its editor sees the scheduled post');
select tests.as_user(:'s3');
select ok(not exists (select 1 from jsonb_array_elements(public.campus_feed()) e where e ->> 'id' = :'p3'), 'a scheduled post is not in the feed');
select is(public.post_detail(:'p3'), null, 'a scheduled post has no detail for readers');
select tests.as_postgres();
update public.campus_posts set publish_at = now() - interval '1 second' where id = :'p3';
select tests.as_user(:'s3');
select ok(exists (select 1 from jsonb_array_elements(public.campus_feed()) e where e ->> 'id' = :'p3'), 'once publish_at passes the post appears, with no status change');
select is((select status from public.campus_posts where id = :'p3'), 'published', 'its status was never changed by a job');

-- 10. Public posts ----------------------------------------------------------------------------
select tests.as_user(:'s2');
select public.save_post(null, :'src', 'campus_news', 'Open day', 'Everyone welcome.', null, null, 'public') as p4 \gset
select public.publish_post(:'p4');
select tests.as_anon();
select is(public.public_post(:'p4') ->> 'title', 'Open day', 'a public post opens for signed-out visitors');
select ok(public.public_post(:'p4') -> 'organisation' ->> 'name' = 'GCTU SRC' and not (public.public_post(:'p4') ? 'author'), 'with no author');
select is(jsonb_array_length(public.public_organisation('gctu', 'src') -> 'posts'), 1, 'the public organisation page lists public posts only');
select ok(not (public.public_organisation('gctu', 'src') ? 'representatives'), 'and no representatives');
select tests.as_user(:'s4');
select is(jsonb_array_length(public.campus_public_school_feed()), 1, 'an unverified student sees their school''s public posts only');

-- 11. Agreements: University official, lapse and renewal ------------------------------------
select tests.as_user(:'padmin', 'aal2');
select throws_ok(format('select public.admin_record_campus_agreement(%L, current_date - 30, null, %L, %L)', :'gctu', 'Registrar', 'DOC-1'),
  'P0001', 'forbidden', 'only super admins record agreements');
select tests.as_user(:'psuper', 'aal2');
select lives_ok(format('select public.admin_record_campus_agreement(%L, current_date - 30, null, %L, %L)', :'gctu', 'Registrar', 'DOC-1'),
  'a super admin records an agreement');
select public.admin_create_organisation(:'gctu', 'administration', 'Office of the Registrar', 'registrar') as reg \gset
select public.admin_create_organisation(:'gctu', 'faculty', 'Faculty of Computing', 'computing') as fac \gset
select public.admin_set_organisation_status(:'reg', 'verified');
select public.admin_set_organisation_status(:'fac', 'verified');
select public.admin_set_organisation_member(:'reg', :'psuper', 'editor', 'Comms');
select tests.as_postgres();
select is(private.organisation_badge(:'fac'), 'university_official', 'a faculty is University official while the agreement is active');
select is(private.organisation_badge(:'src'), 'verified', 'an SRC stays Verified organisation even with an agreement');
select tests.as_user(:'psuper', 'aal2');
select public.save_post(null, :'reg', 'official_announcement', 'Exam timetable', 'Out now.', null, null, 'public') as p5 \gset
select public.publish_post(:'p5');
select tests.as_user(:'s3');
select ok(exists (select 1 from jsonb_array_elements(public.campus_feed()) e where e ->> 'id' = :'p5'), 'the administration post is visible');
select tests.as_user(:'psuper', 'aal2');
select public.admin_end_campus_agreement(:'gctu', current_date);
select tests.as_postgres();
select is(private.organisation_badge(:'fac'), 'verified', 'when the agreement ends the faculty loses the official badge');
select tests.as_user(:'s3');
select ok(not exists (select 1 from jsonb_array_elements(public.campus_feed()) e where e ->> 'id' = :'p5'), 'administration posts leave the feed when the agreement lapses');
select is(public.post_detail(:'p5'), null, 'and their detail page');
select tests.as_anon();
select is(public.public_post(:'p5'), null, 'and their public link');
select tests.as_user(:'psuper', 'aal2');
select throws_ok(format('select public.save_post(null, %L, %L, %L, %L)', :'reg', 'official_announcement', 'More', 'Body'),
  'P0001', 'forbidden', 'an administration organisation cannot publish without an agreement');
select is((select status from public.campus_organisations where id = :'reg'), 'verified', 'nothing was suspended in storage');
select public.admin_record_campus_agreement(:'gctu', current_date - 30, null, 'Registrar', 'DOC-2');
select tests.as_user(:'s3');
select ok(exists (select 1 from jsonb_array_elements(public.campus_feed()) e where e ->> 'id' = :'p5'), 'renewing the agreement restores the post with no status change');

-- 12. Emergencies ---------------------------------------------------------------------------
select tests.as_user(:'padmin', 'aal2');
select public.save_post(null, :'src', 'emergency_notice', 'Water outage', 'Main campus has no water today.') as p6 \gset
select public.publish_post(:'p6');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where kind = 'campus.emergency' and link like '%' || :'p6'), 4,
  'an admin emergency reaches every verified GCTU student (not the unverified one, not another school)');
select tests.as_user(:'s3');
select is(public.campus_highlights() -> 0 ->> 'id', :'p6', 'an emergency leads the highlights');

-- 13. Feed paging: no gaps, no repeats ---------------------------------------------------------
select tests.as_postgres();
insert into public.campus_posts (institution_id, organisation_id, kind, title, body, status, publish_at)
select :'gctu', :'club', 'campus_news', 'Batch ' || g, 'Body', 'published',
       case when g <= 10 then timestamptz '2026-11-01 10:00+00' else timestamptz '2026-11-01 10:00+00' - make_interval(mins => g) end
from generate_series(1, 75) g;
select count(*)::int as expected from public.campus_posts where status = 'published' and private.post_is_live(id) and institution_id = :'gctu' \gset
select tests.as_user(:'s3');
select tests.feed_ids() as all_ids \gset
select is(cardinality(:'all_ids'::uuid[]), :expected, 'paging returns every live post');
select is((select count(distinct x)::int from unnest(:'all_ids'::uuid[]) x), cardinality(:'all_ids'::uuid[]), 'with no repeats, even with 10 posts at the same time');
select ok((select bool_and(ok) from (
  select (p.publish_at, p.id) < lag((p.publish_at, p.id)) over (order by o) or lag(p.id) over (order by o) is null as ok
  from unnest(:'all_ids'::uuid[]) with ordinality u(id, o) join public.campus_posts p on p.id = u.id) t), 'in strict (publish_at, id) order');
select public.campus_feed() -> 29 ->> 'publish_at' as cut_at, public.campus_feed() -> 29 ->> 'id' as cut_id \gset
select tests.as_postgres();
insert into public.campus_posts (institution_id, organisation_id, kind, title, body, status, publish_at)
values (:'gctu', :'club', 'campus_news', 'Arrived between pages', 'Body', 'published', now());
update public.campus_posts set status = 'hidden' where title = 'Batch 40';
update public.campus_posts set pinned_until = now() + interval '1 day' where title = 'Batch 50';
select tests.as_user(:'s3');
select ok(not exists (
  select 1 from jsonb_array_elements(public.campus_feed(:'cut_at'::timestamptz, :'cut_id'::uuid)) e
  where e ->> 'title' in ('Arrived between pages', 'Batch 40')
     or e ->> 'id' in (select x::text from unnest((:'all_ids'::uuid[])[1:30]) x)), 'a new post, a hidden post or a new pin between pages causes no repeat');

-- 14. Likes, saves, reports, moderation ---------------------------------------------------------
select tests.as_user(:'s3');
select lives_ok(format('select public.set_post_like(%L, true)', :'p1'), 'a verified student likes a post');
select public.set_post_like(:'p1', true);
select is((public.post_detail(:'p1') ->> 'like_count')::int, 1, 'liking twice counts once');
select public.set_post_save(:'p1', true);
select is(jsonb_array_length(public.my_saved_posts()), 1, 'saved posts are listed');
select lives_ok(format('select public.report_content(%L, %L, %L)', 'post', :'p2', 'misleading'), 'a verified student reports a post');
select throws_ok(format('select public.report_content(%L, %L, %L)', 'post', :'p2', 'spam'), 'P0001', 'already_reported', 'once per person per target');
select tests.as_user(:'s4');
select throws_ok(format('select public.report_content(%L, %L, %L)', 'post', :'p2', 'spam'), 'P0001', 'not_found', 'unverified students cannot report');
select tests.as_user(:'padmin', 'aal1');
select throws_ok('select public.moderation_queue()', 'P0001', 'forbidden', 'moderation needs two-factor');
select tests.as_user(:'padmin', 'aal2');
select is(jsonb_array_length(public.moderation_queue()), 1, 'the report is in the queue');
select public.moderation_queue() -> 0 ->> 'id' as r1 \gset
select lives_ok(format('select public.moderate_report(%L, %L)', :'r1', 'hide'), 'a moderator hides the post');
select tests.as_user(:'s3');
select ok(not exists (select 1 from jsonb_array_elements(public.campus_feed()) e where e ->> 'id' = :'p2'), 'a hidden post leaves the feed');

-- 15. Comments (off by default) --------------------------------------------------------------
select throws_ok(format('select public.add_comment(%L, %L)', :'p1', 'Nice'), 'P0001', 'campus_disabled', 'comments are off by default');
select tests.as_postgres(); select tests.switch('campus.comments_enabled', true);
select tests.as_user(:'s3');
select lives_ok(format('select public.add_comment(%L, %L)', :'p1', 'See you there'), 'with the switch on, verified students comment');
select tests.as_postgres(); select tests.switch('campus.comments_enabled', false);

-- 16. Suspension and rate limits ---------------------------------------------------------------
select tests.as_user(:'s1'); select public.set_organisation_member(:'club', 'kwame@student.example', 'editor');
select tests.as_postgres(); update public.profiles set is_suspended = true where id = :'sus';
select tests.as_user(:'sus');
select throws_ok(format('select public.save_post(null, %L, %L, %L, %L)', :'club', 'campus_news', 'Hi', 'Body'),
  'P0001', 'account_suspended', 'a suspended member cannot post');
select tests.as_postgres(); update private.app_settings set value = '2' where key = 'campus.posts_per_org_per_day';
select tests.as_user(:'s1');
select public.save_post(null, :'club', 'campus_news', 'One', 'Body') as q1 \gset
select public.save_post(null, :'club', 'campus_news', 'Two', 'Body') as q2 \gset
select public.save_post(null, :'club', 'campus_news', 'Three', 'Body') as q3 \gset
select public.publish_post(:'q1'); select public.publish_post(:'q2');
select throws_ok(format('select public.publish_post(%L)', :'q3'), 'P0001', 'rate_limited', 'organisations have a daily post limit');
select tests.as_postgres(); update private.app_settings set value = '10' where key = 'campus.posts_per_org_per_day';

-- 17. Storage ------------------------------------------------------------------------------------
select :'gctu' || '/' || :'src' || '/post/' || gen_random_uuid() || '.jpg' as img \gset
select tests.as_user(:'s2');
select lives_ok(format($q$insert into storage.objects (bucket_id, name) values ('campus-media', %L)$q$, :'img'), 'an editor uploads an image to their organisation''s folder');
select tests.as_user(:'s3');
select throws_ok(format($q$insert into storage.objects (bucket_id, name) values ('campus-media', %L)$q$, :'gctu' || '/' || :'src' || '/post/' || gen_random_uuid() || '.jpg'),
  '42501', null, 'a reader cannot upload');
select is((select count(*)::int from storage.objects where name = :'img'), 0, 'an unattached upload is not readable by students');
select tests.as_user(:'s2');
select public.save_post(null, :'src', 'campus_news', 'Photos', 'Look', null, null, 'school', array[:'img']) as p7 \gset
select public.publish_post(:'p7');
select tests.as_user(:'s3');
select is((select count(*)::int from storage.objects where name = :'img'), 1, 'a verified student can read an image of a post they can read');
select tests.as_user(:'b1');
select is((select count(*)::int from storage.objects where name = :'img'), 0, 'another school cannot read it');
select tests.as_anon();
select is((select count(*)::int from storage.objects where name = :'img'), 0, 'signed-out visitors cannot read it through Storage');

-- 18. Media clean-up ----------------------------------------------------------------------------
select tests.as_user(:'s2');
select public.set_post_status(:'p7', 'removed');
select tests.as_postgres();
select ok((select due_at > now() + interval '29 days' from public.campus_media_purge where path = :'img'), 'a removed post''s images are queued for 30 days later');
select tests.as_service();
select is((select count(*)::int from public.claim_campus_media_due(100)), 0, 'nothing is due yet');
select tests.as_postgres(); update public.campus_media_purge set due_at = now() - interval '1 minute' where path = :'img';
select tests.as_service();
select is((select array_agg(x) from public.claim_campus_media_due(100) x), array[:'img'], 'a due file is claimed');
select is((select count(*)::int from public.claim_campus_media_due(100)), 0, 'a claimed file is not claimed twice');
select is(public.mark_campus_media_purged(array[:'img']), 1, 'marking purged works');
select is(public.mark_campus_media_purged(array[:'img']), 0, 'and is idempotent');
select tests.as_postgres();
insert into public.campus_media_purge (path, due_at) values (:'gctu' || '/' || :'src' || '/logo/' || gen_random_uuid() || '.png', now() - interval '1 minute') returning path as failing \gset
update public.campus_media_purge set attempts = 6 where path = :'failing';
select tests.as_service();
select public.mark_campus_media_failed(:'failing', 'storage error');
select tests.as_postgres();
update public.campus_media_purge set due_at = now() - interval '1 minute' where path = :'failing';
select tests.as_service();
select is((select count(*)::int from public.claim_campus_media_due(100) x where x = :'failing'), 0, 'after 7 failures a file is no longer claimed');
select tests.as_postgres();
select throws_ok($q$insert into public.campus_media_purge (path, due_at) values ('d1c1d1c1-0000-4000-8000-000000000000/pass.jpg', now())$q$,
  '23514', null, 'the purge queue only accepts campus-media paths');

-- 19. Context and switches -------------------------------------------------------------------------
select tests.as_user(:'s1');
select ok(public.get_my_context() ?& array['user_id', 'full_name', 'first_name', 'signup_intent', 'is_suspended', 'platform_role', 'aal',
                                            'institution_roles', 'delegated_institutions', 'merchant_roles', 'organisation_roles'],
  'get_my_context keeps every existing key and adds organisation_roles');
select is(jsonb_array_length(public.get_my_context() -> 'organisation_roles'), 2, 'an owner of two organisations has two roles');
select tests.as_user(:'s3');
select is(public.get_my_context() -> 'organisation_roles', '[]'::jsonb, 'a non-member has none');
select tests.as_user(:'padmin', 'aal2');
select throws_ok(format('select public.admin_set_campus_switch(%L, false)', 'campus.posts_enabled'), 'P0001', 'forbidden', 'only super admins flip switches');
select tests.as_user(:'psuper', 'aal2');
select throws_ok(format('select public.admin_set_setting(%L, 1)', 'campus.posts_enabled'), 'P0001', 'setting_not_tunable', 'switches are not set through admin_set_setting');
select lives_ok(format('select public.admin_set_campus_switch(%L, false)', 'campus.posts_enabled'), 'a super admin turns Campus off');
select tests.as_user(:'s3');
select is(public.campus_feed(), '[]'::jsonb, 'and the feed is empty again');
select tests.as_anon();
select is(public.public_post(:'p4'), null, 'and public links show nothing');

-- 20. Archiving -------------------------------------------------------------------------------------
select tests.as_postgres(); select tests.switch('campus.posts_enabled', true);
select tests.as_user(:'padmin', 'aal2');
select public.admin_set_organisation_status(:'club', 'archived');
select tests.as_postgres();
select is((select count(*)::int from public.campus_posts where organisation_id = :'club' and status <> 'removed'), 0, 'archiving removes the organisation''s posts');
select tests.as_user(:'s1');
select is(jsonb_array_length(public.my_organisations()), 1, 'an archived organisation leaves its members'' lists');
select throws_ok(format('select public.admin_set_organisation_status(%L, %L)', :'club', 'verified'), 'P0001', 'forbidden', 'students cannot change organisation status');

-- 21. Audit -----------------------------------------------------------------------------------------
select tests.as_postgres();
select ok((select count(*) from public.audit_logs where action like 'campus.%') >= 20, 'campus writes are audited');
select is((select count(*)::int from public.audit_logs where action = 'campus.post_published' and entity_id = :'p1'), 1, 'one audit row per publish');

select * from finish();
rollback;
