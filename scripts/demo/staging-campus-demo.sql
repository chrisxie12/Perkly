-- Perqly Campus demo on STAGING (perqly-staging, gzmxqjlyhizvmvywbxhn). Never production.
--
-- Sets up what the GCTU SRC demo needs:
--   * GCTU listed (staging only), Campus switched on
--   * two tester accounts verified as GCTU students: a "student" and an "organiser"
--   * an organisation "GCTU SRC (Demo)" owned by the organiser
--   * a published SRC announcement
--   * a published, ticketed event (GH₵50 normally, GH₵30 for students) that starts
--     in about 6 hours, so door check-in is already open
--
-- Before running:
--   1. Open the staging preview and sign in once with each tester email, so both accounts exist.
--   2. Put those two emails in the two lines marked EDIT below.
--   3. Supabase dashboard → project perqly-staging → SQL Editor → paste this file → Run.
--
-- Safe to run again: it updates the same demo organisation, moves the event to about
-- 6 hours from now and clears the demo event's tickets and RSVPs, so you can rehearse
-- and then run it once more on demo day for a clean start.
-- It refuses to run if any business name doesn't start with "TEST" (production has real businesses).

do $$
declare
  v_student_email text := 'student-tester@example.com';    -- EDIT: the "student" phone's sign-in email
  v_organiser_email text := 'organiser-tester@example.com'; -- EDIT: the "organiser" phone's sign-in email
  v_starts_at timestamptz := date_trunc('hour', now()) + interval '6 hours';

  v_gctu uuid;
  v_student uuid;
  v_organiser uuid;
  v_org uuid;
  v_announcement uuid;
  v_event uuid;
begin
  -- Staging only.
  if exists (select 1 from public.merchants where display_name not ilike 'TEST%') then
    raise exception 'Stopped: this database has a business whose name does not start with TEST. It looks like production. Run this on perqly-staging only.';
  end if;
  if v_student_email = v_organiser_email then
    raise exception 'Use two different tester emails: one for the student phone, one for the organiser phone.';
  end if;

  select id into v_student from auth.users where lower(email) = lower(v_student_email);
  select id into v_organiser from auth.users where lower(email) = lower(v_organiser_email);
  if v_student is null then raise exception 'No account for %. Sign in once on the staging preview with that email first.', v_student_email; end if;
  if v_organiser is null then raise exception 'No account for %. Sign in once on the staging preview with that email first.', v_organiser_email; end if;

  -- GCTU listed (staging only; production records accreditation through Admin).
  update public.institutions
     set accreditation_status = 'confirmed',
         accreditation_checked_at = coalesce(accreditation_checked_at, current_date),
         accreditation_note = coalesce(accreditation_note, 'Staging demo')
   where slug = 'gctu' and accreditation_status <> 'confirmed';
  update public.institutions set status = 'pilot' where slug = 'gctu' and status = 'inactive';
  select id into v_gctu from public.institutions where slug = 'gctu';

  -- Both testers verified as GCTU students for a year.
  insert into public.student_profiles (user_id, institution_id, verification_status, verified_at, verified_until)
  select u, v_gctu, 'verified', now(), now() + interval '1 year' from unnest(array[v_student, v_organiser]) as u
  on conflict (user_id) do update
     set institution_id = excluded.institution_id, verification_status = 'verified',
         verified_at = excluded.verified_at, verified_until = excluded.verified_until;
  update public.profiles set full_name = coalesce(full_name, 'Demo Student') where id = v_student;
  update public.profiles set full_name = coalesce(full_name, 'Demo Organiser') where id = v_organiser;

  -- Campus on (comments stay off).
  insert into private.app_settings (key, value) values ('campus.posts_enabled', '1'::jsonb)
  on conflict (key) do update set value = '1'::jsonb, updated_at = now();

  -- The demo SRC organisation, owned by the organiser.
  insert into public.campus_organisations (institution_id, kind, name, slug, description, status, verified_at)
  values (v_gctu, 'src', 'GCTU SRC (Demo)', 'gctu-src-demo', 'Demo organisation for the SRC presentation. Not the real SRC.', 'verified', now())
  on conflict (institution_id, slug) do update set status = 'verified', name = excluded.name
  returning id into v_org;
  insert into public.organisation_members (organisation_id, institution_id, user_id, role, title, status)
  values (v_org, v_gctu, v_organiser, 'owner', 'President', 'active')
  on conflict (organisation_id, user_id) do update set role = 'owner', status = 'active';

  -- An announcement.
  select id into v_announcement from public.campus_posts where organisation_id = v_org and title = 'Hall Week registration is open';
  if v_announcement is null then
    insert into public.campus_posts (institution_id, organisation_id, author_id, kind, title, body, status, publish_at)
    values (v_gctu, v_org, v_organiser, 'official_announcement', 'Hall Week registration is open',
            'Every hall can register a team for Hall Week by Friday. Forms are at the SRC office, or message us on Perqly.',
            'published', now() - interval '1 hour')
    returning id into v_announcement;
  end if;

  -- The ticketed event.
  select id into v_event from public.campus_posts where organisation_id = v_org and title = 'Freshers'' Night (Demo)';
  if v_event is null then
    insert into public.campus_posts (institution_id, organisation_id, author_id, kind, title, body, status, publish_at)
    values (v_gctu, v_org, v_organiser, 'src_programme', 'Freshers'' Night (Demo)',
            'Music, food and games to welcome new students. Bring your friends.', 'published', now() - interval '30 minutes')
    returning id into v_event;
  end if;
  insert into public.campus_events (post_id, institution_id, starts_at, ends_at, venue, capacity, rsvp_open,
                                    normal_price_pesewas, student_price_pesewas)
  values (v_event, v_gctu, v_starts_at, v_starts_at + interval '4 hours', 'Main auditorium', 400, true, 5000, 3000)
  on conflict (post_id) do update
     set starts_at = excluded.starts_at, ends_at = excluded.ends_at, rsvp_open = true,
         normal_price_pesewas = excluded.normal_price_pesewas, student_price_pesewas = excluded.student_price_pesewas;

  -- A clean start for the demo event only.
  delete from public.event_tickets where post_id = v_event;
  delete from public.event_rsvps where post_id = v_event;

  raise notice 'Demo ready. Organisation %, event % starts at % (door check-in open now).', v_org, v_event, v_starts_at;
end;
$$;
