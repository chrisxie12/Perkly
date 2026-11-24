-- Events upgrade test, step 2: after migrations 20261127*, the same data must still be there and
-- keep working through both the old and the new functions.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select id as a from tests.ids where name = 'a' \gset
select id as b from tests.ids where name = 'b' \gset
select id as c from tests.ids where name = 'c' \gset
select id as s1 from tests.ids where name = 's1' \gset
select id as s2 from tests.ids where name = 's2' \gset
select id as s3 from tests.ids where name = 's3' \gset
select id as s5 from tests.ids where name = 's5' \gset

-- Nothing lost or changed.
select is((select count(*)::int from public.event_tickets), (select count(*)::int from tests.tickets_before), 'every ticket is still there');
select is((select count(*)::int from tests.tickets_before b join public.event_tickets t using (id)
           where (t.post_id, t.user_id, t.code, t.status, t.created_at, t.checked_in_at, t.checked_in_by, t.cancelled_at,
                  t.normal_price_pesewas, t.student_price_pesewas)
             is not distinct from (b.post_id, b.user_id, b.code, b.status, b.created_at, b.checked_in_at, b.checked_in_by, b.cancelled_at,
                  b.normal_price_pesewas, b.student_price_pesewas)),
  (select count(*)::int from tests.tickets_before), 'with the same id, code, status, check-in, prices and times');
select is((select count(*)::int from public.event_tickets where secret_hash is null), 0, 'every ticket got a secret hash');
select is((select count(distinct secret_hash)::int from public.event_tickets), (select count(*)::int from public.event_tickets), 'each one different');
select is((select count(*)::int from public.event_rsvps), (select count(*)::int from tests.rsvps_before), 'every RSVP is still there');
select is((select count(*)::int from tests.rsvps_before b join public.event_rsvps r using (post_id, user_id) where r.created_at = b.created_at),
  (select count(*)::int from tests.rsvps_before), 'with its original time');
select is((select count(*)::int from tests.events_before b join public.campus_events e using (post_id)
           where (e.starts_at, e.ends_at, e.venue, e.capacity, e.rsvp_open, e.normal_price_pesewas, e.student_price_pesewas)
             is not distinct from (b.starts_at, b.ends_at, b.venue, b.capacity, b.rsvp_open, b.normal_price_pesewas, b.student_price_pesewas)),
  (select count(*)::int from tests.events_before), 'events keep their times, venue, capacity and prices');

-- Mapped to the new model.
select is((select status from public.event_rsvps where post_id = :'a' and user_id = :'s2'), 'confirmed', 'an RSVP becomes a confirmed registration');
select is((select status from public.event_rsvps where post_id = :'b' and user_id = :'s2'), 'attended', 'a checked-in ticket''s registration becomes attended');
select is((select status from public.event_rsvps where post_id = :'b' and user_id = :'s3'), 'confirmed', 'an active ticket''s registration is confirmed');
select is((select lifecycle from public.campus_events where post_id = :'a'), 'published', 'published events stay published');
select is((select lifecycle from public.campus_events where post_id = :'c'), 'draft', 'drafts stay drafts');
select is((select count(*)::int from public.campus_events where timezone <> 'Africa/Accra' or format <> 'physical' or category_id is null), 0,
  'existing events are in Ghana time, in person, in a category');

-- Still working through the old functions.
select null from set_config('request.jwt.claims', jsonb_build_object('sub', :'s2', 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;
select is(public.event_detail(:'a') ->> 'going', '1', 'the old event read still counts who''s going');
select is(public.event_detail(:'b') -> 'my_ticket' ->> 'status', 'checked_in', 'and shows the student''s ticket');
select is(jsonb_array_length(public.my_tickets()), 1, 'my tickets still lists it');
select ok((public.event_detail(:'b') -> 'my_ticket' ->> 'qr') ~ '^PQT1:[0-9a-f]{32}$', 'old tickets get a QR secret too');
reset role;
select null from set_config('request.jwt.claims', jsonb_build_object('sub', :'s3', 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;
select public.event_detail(:'b') -> 'my_ticket' ->> 'qr' as qr3 \gset
reset role;
select code as code3 from tests.tickets_before where post_id = :'b' and user_id = :'s3' \gset
select code as code5 from tests.tickets_before where post_id = :'b' and user_id = :'s5' \gset
select null from set_config('request.jwt.claims', jsonb_build_object('sub', :'s1', 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;
select is(public.door_lookup_ticket(:'b', :'qr3') ->> 'name', 'Esi Boateng', 'the new QR finds an old ticket');
select is(public.door_check_in(:'b', :'code3') ->> 'status', 'checked_in',
  'and the old 8-character code still checks in');
select throws_ok(format('select public.door_check_in(%L, %L)', :'b', :'code5'),
  'P0001', 'ticket_not_found', 'a ticket cancelled before the upgrade stays cancelled');
select throws_ok(format('select public.remove_event_details(%L)', :'a'), 'P0001', 'registrations_exist', 'events with registrations can''t be wiped');
reset role;

select * from finish();
rollback;
