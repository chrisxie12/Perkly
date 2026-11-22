-- Pilot switches: keep the GCTU pilot focused on deals and redemption.
--
-- Friends (requests, friend chat) and Bookings start switched off. Campus already has its
-- own switch (campus.posts_enabled), and event tickets live inside Campus. A super admin
-- switches each one on from Platform settings when the pilot is ready for it.
-- Switching off hides these from students and businesses in the app; nothing is deleted.

insert into private.app_settings (key, value) values
  ('pilot.friends_enabled', '0'),
  ('pilot.bookings_enabled', '0')
on conflict (key) do nothing;

-- What's switched on, for the app's menus and pages.
create function public.feature_switches()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'friends', private.setting_int('pilot.friends_enabled', 0) >= 1,
    'bookings', private.setting_int('pilot.bookings_enabled', 0) >= 1,
    'campus', private.setting_int('campus.posts_enabled', 0) >= 1)
  where (select auth.uid()) is not null;
$$;

create function public.admin_set_feature_switch(p_key text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_before jsonb;
begin
  if not (select private.is_staff('super_admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_key not in ('pilot.friends_enabled', 'pilot.bookings_enabled') or p_on is null then
    raise exception 'setting_not_tunable' using errcode = 'P0001';
  end if;
  select value into v_before from private.app_settings where key = p_key for update;
  update private.app_settings set value = to_jsonb(case when p_on then 1 else 0 end), updated_by = (select auth.uid()) where key = p_key;
  perform private.write_audit('platform.setting_changed', 'platform:super_admin', 'app_setting', null,
    jsonb_build_object('key', p_key, 'value', v_before), jsonb_build_object('key', p_key, 'value', case when p_on then 1 else 0 end));
end;
$$;

revoke execute on function public.feature_switches(), public.admin_set_feature_switch(text, boolean) from public, anon;
grant execute on function public.feature_switches(), public.admin_set_feature_switch(text, boolean) to authenticated;
