-- Problem reports ("disputes", database architecture §5.x and product spec admin
-- section). A student, or someone at the business, reports a problem with a
-- redemption or a booking. Perqly support (aal2) investigates, writes notes, and
-- resolves or dismisses the case; voiding a redemption stays the separate, audited
-- void_redemption(). The person who opened a case sees it and its public notes.
-- Every write goes through the functions below.

create type public.dispute_status as enum ('open', 'investigating', 'resolved', 'dismissed');

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  redemption_id uuid references public.redemptions (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete set null,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  opened_by uuid references public.profiles (id) on delete set null,
  opened_by_party text not null check (opened_by_party in ('student', 'merchant')),
  reason text not null check (reason in ('wrong_price', 'discount_refused', 'charged_twice', 'service_not_received', 'staff_behaviour',
                                         'not_a_student', 'wrong_item', 'left_without_paying', 'booking_problem', 'other')),
  details text not null check (char_length(btrim(details)) between 10 and 2000),
  status public.dispute_status not null default 'open',
  assigned_to uuid references public.profiles (id) on delete set null,
  resolution text check (resolution is null or char_length(btrim(resolution)) between 5 and 1000),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- open_dispute() requires a redemption or a booking; either can later disappear
  -- (an account deletion removes bookings), and the case stays for support.
  constraint disputes_resolution check ((status in ('resolved', 'dismissed')) = (resolved_at is not null and resolution is not null))
);
create index disputes_queue on public.disputes (status, created_at);
create index disputes_opened_by on public.disputes (opened_by, created_at desc);
create unique index disputes_one_open on public.disputes (coalesce(redemption_id, booking_id), opened_by_party)
  where status in ('open', 'investigating');
create trigger disputes_updated_at before update on public.disputes for each row execute function private.set_updated_at();

create table public.dispute_events (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_party text not null check (actor_party in ('student', 'merchant', 'support')),
  kind text not null check (kind in ('opened', 'note', 'internal_note', 'status')),
  body text check (body is null or char_length(body) <= 2000),
  status public.dispute_status,
  created_at timestamptz not null default now()
);
create index dispute_events_dispute on public.dispute_events (dispute_id, created_at);

alter table public.disputes enable row level security;
alter table public.dispute_events enable row level security;
revoke all on public.disputes, public.dispute_events from anon, authenticated, service_role;

-- Helpers ------------------------------------------------------------------------------------

-- Who may see a case: whoever opened it; for cases a business opened, its owners and
-- managers too; and Perqly support.
create function private.can_see_dispute(p_d public.disputes)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) = p_d.opened_by
      or (p_d.opened_by_party = 'merchant' and private.can_manage_merchant(p_d.merchant_id))
      or private.is_staff('support');
$$;

create function private.dispute_json(p_d public.disputes, p_staff boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_d.id, 'status', p_d.status, 'reason', p_d.reason, 'details', p_d.details,
    'opened_by_party', p_d.opened_by_party, 'resolution', p_d.resolution, 'resolved_at', p_d.resolved_at,
    'created_at', p_d.created_at, 'updated_at', p_d.updated_at,
    'merchant', jsonb_build_object('id', m.id, 'name', m.display_name, 'slug', m.slug),
    'redemption', case when r.id is null then null else jsonb_build_object(
      'id', r.id, 'transaction_ref', r.transaction_ref, 'item_name', r.item_name, 'regular_price', r.regular_price,
      'final_price', r.final_price, 'discount_amount', r.discount_amount, 'redeemed_at', r.redeemed_at,
      'voided', r.voided_at is not null) end,
    'booking', case when b.id is null then null else jsonb_build_object(
      'id', b.id, 'starts_at', b.starts_at, 'status', b.status, 'service', s.name) end,
    'opened_by_name', case when p_staff then op.full_name end,
    'assigned_to_name', case when p_staff then asg.full_name end,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'body', e.body, 'status', e.status,
                                          'actor_party', e.actor_party, 'mine', e.actor_id = (select auth.uid()),
                                          'created_at', e.created_at) order by e.created_at)
      from public.dispute_events e
      where e.dispute_id = p_d.id and (p_staff or e.kind <> 'internal_note')), '[]'::jsonb))
  from public.merchants m
  left join public.redemptions r on r.id = p_d.redemption_id
  left join public.bookings b on b.id = p_d.booking_id
  left join public.services s on s.id = b.service_id
  left join public.profiles op on op.id = p_d.opened_by
  left join public.profiles asg on asg.id = p_d.assigned_to
  where m.id = p_d.merchant_id;
$$;

-- Opening a case ------------------------------------------------------------------------------

create function public.open_dispute(p_redemption_id uuid, p_booking_id uuid, p_reason text, p_details text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_party text;
  v_merchant uuid;
  v_branch uuid;
  v_student uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if num_nonnulls(p_redemption_id, p_booking_id) <> 1 then raise exception 'subject_required' using errcode = 'P0001'; end if;
  if p_redemption_id is not null then
    select merchant_id, branch_id, student_id into v_merchant, v_branch, v_student from public.redemptions where id = p_redemption_id;
  else
    select merchant_id, branch_id, student_id into v_merchant, v_branch, v_student from public.bookings where id = p_booking_id;
  end if;
  if v_merchant is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_student = v_uid then v_party := 'student';
  elsif (select private.can_operate_branch(v_branch)) then v_party := 'merchant';
  else raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not coalesce(p_reason = any (case v_party
       when 'student' then array['wrong_price', 'discount_refused', 'charged_twice', 'service_not_received', 'staff_behaviour', 'booking_problem', 'other']
       else array['not_a_student', 'wrong_item', 'left_without_paying', 'booking_problem', 'other'] end), false) then
    raise exception 'reason_invalid' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_details, ''))) not between 10 and 2000 then raise exception 'details_invalid' using errcode = 'P0001'; end if;
  perform private.check_rate_limit('dispute.open', 5, interval '1 day');
  begin
    insert into public.disputes (redemption_id, booking_id, merchant_id, opened_by, opened_by_party, reason, details)
    values (p_redemption_id, p_booking_id, v_merchant, v_uid, v_party, p_reason, btrim(p_details))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'dispute_already_open' using errcode = 'P0001';
  end;
  insert into public.dispute_events (dispute_id, actor_id, actor_party, kind, body, status)
  values (v_id, v_uid, v_party, 'opened', null, 'open');
  perform private.write_audit('dispute.opened', v_party, 'dispute', v_id,
    p_after => jsonb_build_object('reason', p_reason, 'redemption_id', p_redemption_id, 'booking_id', p_booking_id),
    p_merchant_id => v_merchant);
  perform private.notify_staff('support', 'review.dispute', 'New problem report',
    case v_party when 'student' then 'A student' else 'A business' end || ' reported a problem.', '/admin/disputes/' || v_id);
  return v_id;
end;
$$;

-- Notes ---------------------------------------------------------------------------------------

create function public.add_dispute_note(p_dispute_id uuid, p_body text, p_internal boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d public.disputes;
  v_staff boolean := (select private.is_staff('support'));
  v_party text;
begin
  select * into v_d from public.disputes where id = p_dispute_id;
  if v_d.id is null or not private.can_see_dispute(v_d) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then raise exception 'note_invalid' using errcode = 'P0001'; end if;
  if coalesce(p_internal, false) and not v_staff then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if v_d.status in ('resolved', 'dismissed') and not v_staff then raise exception 'dispute_closed' using errcode = 'P0001'; end if;
  v_party := case when v_staff and (select auth.uid()) is distinct from v_d.opened_by then 'support' else v_d.opened_by_party end;
  perform private.check_rate_limit('dispute.note', 30, interval '1 hour');
  insert into public.dispute_events (dispute_id, actor_id, actor_party, kind, body)
  values (v_d.id, (select auth.uid()), v_party, case when coalesce(p_internal, false) then 'internal_note' else 'note' end, btrim(p_body));
  update public.disputes set updated_at = now() where id = v_d.id;
  if v_party = 'support' and not coalesce(p_internal, false) then
    perform private.notify(v_d.opened_by, 'account.dispute', 'Perqly support replied', 'About the problem you reported.',
      case v_d.opened_by_party when 'student' then '/student/problems' else '/merchant/problems' end);
  elsif v_party <> 'support' then
    perform private.notify(v_d.assigned_to, 'review.dispute', 'New note on a problem report', null, '/admin/disputes/' || v_d.id);
  end if;
end;
$$;

-- Support ---------------------------------------------------------------------------------------

create function public.set_dispute_status(p_dispute_id uuid, p_status text, p_resolution text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_d public.disputes;
begin
  if not (select private.is_staff('support')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into v_d from public.disputes where id = p_dispute_id for update;
  if v_d.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_status not in ('investigating', 'resolved', 'dismissed', 'open') then raise exception 'status_invalid' using errcode = 'P0001'; end if;
  if p_status in ('resolved', 'dismissed') and char_length(btrim(coalesce(p_resolution, ''))) < 5 then
    raise exception 'resolution_required' using errcode = 'P0001';
  end if;
  update public.disputes
  set status = p_status::public.dispute_status,
      assigned_to = coalesce(assigned_to, (select auth.uid())),
      resolution = case when p_status in ('resolved', 'dismissed') then btrim(p_resolution) end,
      resolved_at = case when p_status in ('resolved', 'dismissed') then now() end
  where id = v_d.id;
  insert into public.dispute_events (dispute_id, actor_id, actor_party, kind, body, status)
  values (v_d.id, (select auth.uid()), 'support', 'status',
          case when p_status in ('resolved', 'dismissed') then btrim(p_resolution) end, p_status::public.dispute_status);
  perform private.write_audit('dispute.' || p_status, 'staff:support', 'dispute', v_d.id,
    jsonb_build_object('status', v_d.status), jsonb_build_object('status', p_status), p_merchant_id => v_d.merchant_id);
  if p_status in ('resolved', 'dismissed') then
    perform private.notify(v_d.opened_by, 'account.dispute',
      case p_status when 'resolved' then 'Your problem report was resolved' else 'Your problem report was closed' end,
      left(btrim(p_resolution), 200),
      case v_d.opened_by_party when 'student' then '/student/problems' else '/merchant/problems' end);
  end if;
end;
$$;

-- Reads ------------------------------------------------------------------------------------------

create function public.my_disputes(p_merchant_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.dispute_json(d, false) order by d.created_at desc), '[]'::jsonb)
  from public.disputes d
  where case when p_merchant_id is null
             then d.opened_by = (select auth.uid()) and d.opened_by_party = 'student'
             else d.merchant_id = p_merchant_id and d.opened_by_party = 'merchant'
                  and (d.opened_by = (select auth.uid()) or private.can_manage_merchant(p_merchant_id)) end;
$$;

create function public.list_disputes(p_status text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff('support')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', d.id, 'status', d.status, 'reason', d.reason, 'opened_by_party', d.opened_by_party,
                                        'merchant_name', m.display_name, 'created_at', d.created_at, 'updated_at', d.updated_at,
                                        'has_redemption', d.redemption_id is not null, 'has_booking', d.booking_id is not null)
                     order by (d.status in ('open', 'investigating')) desc, d.created_at)
    from public.disputes d join public.merchants m on m.id = d.merchant_id
    where p_status is null or d.status::text = p_status
    limit 200), '[]'::jsonb);
end;
$$;

create function public.get_dispute(p_dispute_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.dispute_json(d, private.is_staff('support'))
  from public.disputes d
  where d.id = p_dispute_id and private.can_see_dispute(d);
$$;

-- Grants ------------------------------------------------------------------------------------------

revoke execute on function private.can_see_dispute(public.disputes), private.dispute_json(public.disputes, boolean),
  public.open_dispute(uuid, uuid, text, text), public.add_dispute_note(uuid, text, boolean),
  public.set_dispute_status(uuid, text, text), public.my_disputes(uuid), public.list_disputes(text), public.get_dispute(uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.open_dispute(uuid, uuid, text, text), public.add_dispute_note(uuid, text, boolean),
  public.set_dispute_status(uuid, text, text), public.my_disputes(uuid), public.list_disputes(text), public.get_dispute(uuid)
  to authenticated;
