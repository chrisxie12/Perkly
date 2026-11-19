-- Campus C4: event reminders, and phone/email delivery for Campus notifications.
--
-- * A third switch, campus.push_enabled, off by default. While it's off, Campus
--   notifications stay in-app only, exactly as in C1 (push and email 'skipped').
--   When a super admin turns it on, new Campus notifications go to the delivery
--   queue like every other kind, and each student's "Campus" setting decides.
-- * Event reminders: once a day, students going to an event that starts between 22
--   and 46 hours later get one reminder, with the date written out. Queued after the
--   daily cron has answered, so the next daily run (about 24 hours later, before the
--   event) delivers it if push is on.

insert into private.app_settings (key, value) values ('campus.push_enabled', '0');

alter table public.event_rsvps add column reminded_at timestamptz;

create function private.campus_delivery_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.campus_switch('campus.push_enabled') then 'pending' else 'skipped' end;
$$;

-- Same as C1, except push and email follow the new switch.
create or replace function private.notify_campus(p_post_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.campus_posts;
  v_org public.campus_organisations;
  v_count int;
  v_status text := private.campus_delivery_status();
begin
  select * into v_post from public.campus_posts where id = p_post_id;
  select * into v_org from public.campus_organisations where id = v_post.organisation_id;
  insert into public.notifications (user_id, kind, title, body, link, push_status, email_status)
  select sp.user_id,
         case when v_post.is_emergency then 'campus.emergency' else 'campus.post' end,
         left(v_org.name || ': ' || v_post.title, 140),
         left(v_post.body, 200),
         '/student/campus/posts/' || v_post.id,
         v_status, v_status
  from public.student_profiles sp
  where sp.institution_id = v_post.institution_id
    and sp.user_id is distinct from v_post.author_id
    and private.student_state(sp.user_id) = 'verified'
    and (v_post.is_emergency
         or exists (select 1 from public.organisation_follows f where f.organisation_id = v_post.organisation_id and f.user_id = sp.user_id));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.admin_set_campus_switch(p_key text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_before jsonb;
begin
  if not (select private.is_staff('super_admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_key not in ('campus.posts_enabled', 'campus.comments_enabled', 'campus.push_enabled') or p_on is null then
    raise exception 'setting_not_tunable' using errcode = 'P0001';
  end if;
  select value into v_before from private.app_settings where key = p_key for update;
  update private.app_settings set value = to_jsonb(case when p_on then 1 else 0 end), updated_by = (select auth.uid()) where key = p_key;
  perform private.write_audit('platform.setting_changed', 'platform:super_admin', 'app_setting', null,
    jsonb_build_object('key', p_key, 'value', v_before), jsonb_build_object('key', p_key, 'value', case when p_on then 1 else 0 end));
end;
$$;

-- The admin overview shows the new switch too.
create or replace function public.admin_campus_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'switches', jsonb_build_object(
      'posts', private.campus_switch('campus.posts_enabled'),
      'comments', private.campus_switch('campus.comments_enabled'),
      'push', private.campus_switch('campus.push_enabled')),
    'schools', coalesce((
      select jsonb_agg(jsonb_build_object(
               'institution_id', i.id, 'short_name', i.short_name, 'name', i.name,
               'signed_on', a.signed_on, 'ends_on', a.ends_on, 'signed_by_name', a.signed_by_name,
               'document_ref', a.document_ref, 'recorded_at', a.recorded_at,
               'active', private.campus_agreement_active(i.id),
               'organisations', (select count(*) from public.campus_organisations o
                                 where o.institution_id = i.id and o.status <> 'archived'))
             order by i.short_name)
      from public.institutions i
      left join public.campus_agreements a on a.institution_id = i.id
      where i.status in ('pilot', 'active') or a.institution_id is not null), '[]'::jsonb));
end;
$$;

-- Daily (service role): one reminder per RSVP for events starting 22 to 46 hours from now.
create function public.queue_event_reminders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_status text := private.campus_delivery_status();
begin
  if not private.campus_switch('campus.posts_enabled') then return 0; end if;
  with due as (
    select r.post_id, r.user_id, e.starts_at, e.venue, p.title
    from public.event_rsvps r
    join public.campus_events e on e.post_id = r.post_id
    join public.campus_posts p on p.id = r.post_id
    where r.reminded_at is null
      and e.starts_at between now() + interval '22 hours' and now() + interval '46 hours'
      and private.post_is_live(r.post_id)
      and private.student_state(r.user_id) = 'verified'
    for update of r skip locked
  ), sent as (
    insert into public.notifications (user_id, kind, title, body, link, push_status, email_status)
    select d.user_id, 'campus.event_reminder', left('Reminder: ' || d.title, 140),
           left(to_char(d.starts_at at time zone 'UTC', 'Dy DD Mon, HH24:MI') || ', ' || d.venue, 500),
           '/student/campus/posts/' || d.post_id, v_status, v_status
    from due d
    returning 1
  ), marked as (
    update public.event_rsvps r set reminded_at = now()
    from due d where r.post_id = d.post_id and r.user_id = d.user_id
    returning 1
  )
  select count(*)::int into v_count from marked;
  return v_count;
end;
$$;

revoke execute on function private.campus_delivery_status(), public.queue_event_reminders() from public, anon, authenticated, service_role;
grant execute on function public.queue_event_reminders() to service_role;
