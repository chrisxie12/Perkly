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

-- Set up: Campus on, an organisation with an owner (s1), a live post that becomes an event.
select tests.as_user(:'psuper', 'aal2');
select public.admin_record_campus_agreement(:'gctu', current_date - 30, null, 'Registrar', 'Drive ref 1');
select public.admin_set_campus_switch('campus.posts_enabled', true);
select tests.as_user(:'padmin', 'aal2');
select public.admin_create_organisation(:'gctu', 'src', 'GCTU SRC', 'src') as src \gset
select public.admin_set_organisation_status(:'src', 'verified');
select public.admin_set_organisation_member(:'src', :'s1', 'owner', 'President');
select tests.as_user(:'s1');
select public.save_post(null, :'src', 'src_programme', 'Freshers'' night', 'Music and food.') as ev \gset
select public.publish_post(:'ev');
select public.set_event_details(:'ev', now() + interval '6 hours', null, 'Main hall', 2);
select public.save_post(null, :'src', 'src_programme', 'Free talk', 'All welcome.') as free \gset
select public.publish_post(:'free');
select public.set_event_details(:'free', now() + interval '3 days', null, 'Library');

-- 1. Privileges ---------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.take_event_ticket(uuid)', 'execute'), 'anon cannot take tickets');
select ok(not has_function_privilege('anon', 'public.door_check_in(uuid, text)', 'execute'), 'anon cannot check in');
select ok(not has_table_privilege('authenticated', 'public.event_tickets', 'select'), 'no direct reads of tickets');
select ok(not has_function_privilege('authenticated', 'private.new_ticket_code()', 'execute'), 'code generator is internal');

-- 2. Organisers set prices --------------------------------------------------------------------
select tests.as_user(:'s2');
select throws_ok(format('select public.set_event_tickets(%L, 5000, 3000)', :'ev'), 'P0001', 'post_not_found', 'students cannot set prices');
select tests.as_user(:'s1');
select throws_ok(format('select public.set_event_tickets(%L, 5000, 5000)', :'ev'), 'P0001', 'prices_invalid', 'student price must be lower');
select throws_ok(format('select public.set_event_tickets(%L, 5000, null)', :'ev'), 'P0001', 'prices_invalid', 'both prices or neither');
select throws_ok(format('select public.set_event_tickets(%L, 50, 0)', :'ev'), 'P0001', 'prices_invalid', 'at least GH₵1 normal price');
select lives_ok(format('select public.set_event_tickets(%L, 5000, 3000)', :'ev'), 'organiser sets GH₵50 normal, GH₵30 student');
select is((public.event_detail(:'ev') ->> 'ticketed'), 'true', 'the event shows as ticketed');
select is((public.event_detail(:'ev') ->> 'student_price'), '3000', 'and carries the student price');

-- 3. Students take tickets --------------------------------------------------------------------
select tests.as_user(:'s4');
select throws_ok(format('select public.take_event_ticket(%L)', :'ev'), 'P0001', 'not_found', 'unverified students cannot take tickets');
select tests.as_user(:'b1');
select throws_ok(format('select public.take_event_ticket(%L)', :'ev'), 'P0001', 'not_found', 'other schools cannot take tickets');
select tests.as_user(:'s2');
select throws_ok(format('select public.set_rsvp(%L, true)', :'ev'), 'P0001', 'ticket_required', 'ticketed events need a ticket, not an RSVP');
select throws_ok(format('select public.take_event_ticket(%L)', :'free'), 'P0001', 'not_ticketed', 'free events have no tickets');
select ok(public.take_event_ticket(:'ev') -> 'my_ticket' ->> 'code' ~ '^[A-HJ-NP-Z2-9]{8}$', 'a verified student gets an 8-character code');
select public.event_detail(:'ev') -> 'my_ticket' ->> 'code' as code2 \gset
select is(public.take_event_ticket(:'ev') -> 'my_ticket' ->> 'code', :'code2', 'taking it again returns the same ticket');
select is(public.event_detail(:'ev') ->> 'going', '1', 'a ticket counts as going');
select is(public.event_detail(:'ev') -> 'my_ticket' ->> 'student_price', '3000', 'the ticket keeps the student price');
select is(jsonb_array_length(public.my_tickets()), 1, 'it shows in My tickets');
select tests.as_user(:'s3');
select public.take_event_ticket(:'ev') -> 'my_ticket' ->> 'code' as code3 \gset
select tests.as_user(:'s1');
select throws_ok(format('select public.take_event_ticket(%L)', :'ev'), 'P0001', 'event_full', 'places run out');
select throws_ok(format('select public.set_event_tickets(%L, null, null)', :'ev'), 'P0001', 'tickets_exist', 'prices stay while tickets are live');
select is(public.event_ticket_stats(:'ev') ->> 'active', '2', 'organisers see how many tickets');

-- 4. The door -------------------------------------------------------------------------------------
select tests.as_user(:'s2');
select throws_ok(format('select public.door_lookup_ticket(%L, %L)', :'ev', :'code3'), 'P0001', 'post_not_found', 'students cannot look up tickets');
select tests.as_user(:'s1');
select throws_ok(format('select public.door_lookup_ticket(%L, %L)', :'ev', 'ZZZZZZZZ'), 'P0001', 'ticket_not_found', 'unknown codes are refused');
select is(public.door_lookup_ticket(:'ev', lower(:'code3')) ->> 'name', 'Esi Reader', 'lookup ignores case and shows the name');
select is(public.door_lookup_ticket(:'ev', :'code3') ->> 'still_verified', 'true', 'and whether they are still verified');
select is(public.door_check_in(:'ev', :'code3') ->> 'status', 'checked_in', 'the organiser checks the student in');
select throws_ok(format('select public.door_check_in(%L, %L)', :'ev', :'code3'), 'P0001', 'already_checked_in', 'a ticket checks in once');
select is(public.event_ticket_stats(:'ev') ->> 'checked_in', '1', 'stats count the check-in');
select tests.as_user(:'s3');
select throws_ok(format('select public.set_rsvp(%L, false)', :'ev'), 'P0001', 'already_checked_in', 'a checked-in ticket cannot be cancelled');

-- 5. Cancelling frees the place ---------------------------------------------------------------
select tests.as_user(:'s2');
select is(public.set_rsvp(:'ev', false) ->> 'going', '1', 'cancelling frees a place');
select ok(public.event_detail(:'ev') -> 'my_ticket' = 'null'::jsonb, 'the ticket is gone');
select tests.as_user(:'s1');
select throws_ok(format('select public.door_check_in(%L, %L)', :'ev', :'code2'), 'P0001', 'ticket_not_found', 'a cancelled ticket does not check in');

-- 6. Doors open 24 hours before -------------------------------------------------------------
select tests.as_user(:'s1');
select public.set_event_tickets(:'free', 2000, 1000);
select tests.as_user(:'s2');
select public.take_event_ticket(:'free') -> 'my_ticket' ->> 'code' as codef \gset
select tests.as_user(:'s1');
select throws_ok(format('select public.door_check_in(%L, %L)', :'free', :'codef'), 'P0001', 'door_closed', 'no check-in three days early');

-- 7. Pass photo at the door -------------------------------------------------------------------
select tests.as_postgres();
update public.profiles set avatar_path = :'s3' || '/pass.webp' where id = :'s3';
update public.profiles set avatar_path = :'s2' || '/pass.webp' where id = :'s2';
select tests.as_user(:'s1');
select ok(private.can_read_pass_photo(:'s3' || '/pass.webp'), 'the organiser sees the photo of a ticket holder while doors are open');
select ok(not private.can_read_pass_photo(:'s2' || '/pass.webp'), 'but not of a student whose ticket is for an event days away');
select tests.as_user(:'s4');
select ok(not private.can_read_pass_photo(:'s3' || '/pass.webp'), 'other students never see it');

select * from finish();
rollback;
