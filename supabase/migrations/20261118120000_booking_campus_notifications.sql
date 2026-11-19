-- Notification settings get "Bookings" and "Campus" categories, so students can turn
-- each on or off. Same pattern as the Messages category (migration 0027).
-- Existing rows keep the category they were stored with.

create or replace function private.notification_category(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case split_part(p_kind, '.', 1)
    when 'verification' then 'verification'
    when 'deal' then 'deals'
    when 'redemption' then 'redemptions'
    when 'merchant' then 'business'
    when 'offer' then 'business'
    when 'team' then 'business'
    when 'review' then 'review'
    when 'chat' then 'messages'
    when 'booking' then 'bookings'
    when 'campus' then 'campus'
    else 'account'
  end;
$$;

alter table public.notification_preferences drop constraint notification_preferences_category_check;
alter table public.notification_preferences add constraint notification_preferences_category_check
  check (category in ('verification', 'deals', 'redemptions', 'business', 'review', 'messages', 'bookings', 'campus', 'account'));

create or replace function public.get_my_notification_preferences()
returns table (category text, push boolean, email boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.category,
         private.wants_notification((select auth.uid()), c.category, 'push'),
         private.wants_notification((select auth.uid()), c.category, 'email')
  from unnest(array['verification', 'deals', 'redemptions', 'business', 'review', 'messages', 'bookings', 'campus', 'account']) as c (category)
  where (select auth.uid()) is not null;
$$;

create or replace function public.set_notification_preference(p_category text, p_push boolean, p_email boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_category not in ('verification', 'deals', 'redemptions', 'business', 'review', 'messages', 'bookings', 'campus', 'account')
     or p_push is null or p_email is null then
    raise exception 'preference_invalid' using errcode = 'P0001';
  end if;
  insert into public.notification_preferences (user_id, category, push, email)
  values (v_uid, p_category, p_push, p_email)
  on conflict (user_id, category) do update set push = excluded.push, email = excluded.email, updated_at = now();
end;
$$;
