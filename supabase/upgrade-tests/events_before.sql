-- Events upgrade test, step 1: representative data made with the OLD functions, on a database
-- migrated up to 20261126 (before Events & Conferences). Run by scripts/db/test-events-upgrade.sh.
create schema tests;
create function tests.create_user(p_email text, p_name text)
returns uuid language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), p_email, jsonb_build_object('full_name', p_name)) returning id;
$$;
create function tests.as_user(p_id uuid, p_aal text default 'aal1')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, false);
  execute 'set role authenticated';
end;
$$;
create function tests.as_postgres()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', false);
end;
$$;
grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;

create table tests.ids (name text primary key, id uuid);
grant all on tests.ids to authenticated;

insert into tests.ids select 'gctu', id from public.institutions where slug = 'gctu';
insert into tests.ids values ('padmin', tests.create_user('admin@perqly.example', 'Perqly Admin')),
  ('psuper', tests.create_user('super@perqly.example', 'Perqly Super')),
  ('s1', tests.create_user('kofi@student.example', 'Kofi Owner')),
  ('s2', tests.create_user('ama@student.example', 'Ama Mensah')),
  ('s3', tests.create_user('esi@student.example', 'Esi Boateng')),
  ('s5', tests.create_user('kwame@student.example', 'Kwame Asare'));
insert into public.platform_staff (user_id, role)
select id, case name when 'padmin' then 'admin' else 'super_admin' end::public.platform_role from tests.ids where name in ('padmin', 'psuper');

do $$
declare
  v_gctu uuid := (select id from tests.ids where name = 'gctu');
  v_s text;
  v_org uuid; v_a uuid; v_b uuid; v_c uuid;
begin
  foreach v_s in array array['s1', 's2', 's3', 's5'] loop
    perform tests.as_user((select id from tests.ids where name = v_s));
    perform public.upsert_student_profile(v_gctu);
    perform tests.as_postgres();
  end loop;
  update public.student_profiles set verification_status = 'verified', verified_at = now() - interval '1 month',
         verified_until = now() + interval '1 year';
  perform tests.as_user((select id from tests.ids where name = 'psuper'), 'aal2');
  perform public.admin_set_campus_switch('campus.posts_enabled', true);
  perform tests.as_user((select id from tests.ids where name = 'padmin'), 'aal2');
  v_org := public.admin_create_organisation(v_gctu, 'src', 'GCTU SRC', 'src');
  perform public.admin_set_organisation_status(v_org, 'verified');
  perform public.admin_set_organisation_member(v_org, (select id from tests.ids where name = 's1'), 'owner', 'President');

  perform tests.as_user((select id from tests.ids where name = 's1'));
  v_a := public.save_post(null, v_org, 'src_programme', 'Freshers night', 'Music and food.');
  perform public.publish_post(v_a);
  perform public.set_event_details(v_a, now() + interval '2 hours', now() + interval '5 hours', 'Main hall', 50);
  v_b := public.save_post(null, v_org, 'entertainment', 'Comedy night', 'Laughs all round.');
  perform public.publish_post(v_b);
  perform public.set_event_details(v_b, now() + interval '2 hours', null, 'Auditorium', 100);
  perform public.set_event_tickets(v_b, 5000, 2000);
  v_c := public.save_post(null, v_org, 'workshop_seminar', 'CV clinic', 'Bring your CV.');
  perform public.set_event_details(v_c, now() + interval '5 days', null, 'Library');

  perform tests.as_user((select id from tests.ids where name = 's2'));
  perform public.set_rsvp(v_a, true);
  perform public.take_event_ticket(v_b);
  perform tests.as_user((select id from tests.ids where name = 's3'));
  perform public.set_rsvp(v_a, true);
  perform public.set_rsvp(v_a, false);
  perform public.take_event_ticket(v_b);
  perform tests.as_user((select id from tests.ids where name = 's5'));
  perform public.take_event_ticket(v_b);
  perform public.set_rsvp(v_b, false);
  perform tests.as_postgres();
  v_s := (select code from public.event_tickets where post_id = v_b and user_id = (select id from tests.ids where name = 's2'));
  perform tests.as_user((select id from tests.ids where name = 's1'));
  perform public.door_check_in(v_b, v_s);
  perform tests.as_postgres();
  insert into tests.ids values ('org', v_org), ('a', v_a), ('b', v_b), ('c', v_c);
end;
$$;

-- What must survive the upgrade, exactly.
create table tests.tickets_before as select id, post_id, user_id, code, status, created_at, checked_in_at, checked_in_by, cancelled_at,
  normal_price_pesewas, student_price_pesewas from public.event_tickets;
create table tests.rsvps_before as select post_id, user_id, created_at, reminded_at from public.event_rsvps;
create table tests.events_before as select post_id, starts_at, ends_at, venue, capacity, rsvp_open, normal_price_pesewas, student_price_pesewas
  from public.campus_events;
