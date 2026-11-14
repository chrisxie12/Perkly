-- Phase 5: QR redemption (docs/PERQLY_QR_REDEMPTION_SPECIFICATION.md).
--
-- A static QR identifies a branch only. A scan opens a short-lived session; the
-- student picks an offer and the server snapshots the price; the merchant
-- confirms, then the student confirms, and private.finalize_redemption writes the
-- redemption and every total it affects in one transaction.
--
-- Session functions return jsonb {ok, error, ...} instead of raising for
-- business errors, so that rate-limit attempts and lazy expiry are committed even
-- when the call is refused. Unexpected states still raise and roll back.
--
-- Not in this migration: bookings (no bookings table exists yet), the student
-- photo on the pass (verification photos are deleted 30 days after a decision, so
-- a retained profile photo is needed first), disputes.

create type public.qr_code_status as enum ('active', 'revoked');
create type public.redemption_session_status as enum (
  'open', 'awaiting_merchant', 'awaiting_student', 'completed', 'rejected', 'cancelled', 'expired'
);
create type public.payment_method as enum ('mtn_momo', 'telecel_cash', 'at_money', 'cash', 'card', 'other');
create type public.payment_status as enum ('paid', 'unpaid');

insert into private.app_settings (key, value) values
  ('qr.max_reissues_per_day', '5'),
  ('redemption.max_selects_per_session', '20'),
  ('redemption.merchant_actions_per_minute', '60'),
  ('redemption.payment_records_per_hour', '120'),
  ('redemption.payment_record_days', '7'),
  ('redemption.near_metres', '300')
on conflict (key) do nothing;

-- Random identifiers -------------------------------------------------------------------
-- Crockford base32 (no I, L, O, U), from cryptographic random bytes.
create function private.random_crockford(p_length int)
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', (get_byte(b, i) % 32) + 1, 1), '' order by i)
  from (select extensions.gen_random_bytes(p_length) as b) r, generate_series(0, p_length - 1) i;
$$;

-- 16 random bytes, base64url without padding: 22 characters, 128 bits.
create function private.random_token()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '=');
$$;

-- Tables -------------------------------------------------------------------------------
create table public.merchant_qr_codes (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.merchant_branches (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{22}$'),
  short_code text not null unique check (short_code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
  version int not null default 1 check (version >= 1),
  status public.qr_code_status not null default 'active',
  revoked_reason text check (revoked_reason is null or char_length(revoked_reason) <= 300),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id),
  issued_by uuid references public.profiles (id),
  last_scanned_at timestamptz,
  created_at timestamptz not null default now(),
  constraint merchant_qr_codes_revoked check ((status = 'revoked') = (revoked_at is not null))
);
comment on column public.merchant_qr_codes.token is 'Secret-ish: encoded in the printed QR. Never logged; audit rows carry the QR id only.';
create unique index merchant_qr_codes_one_active on public.merchant_qr_codes (branch_id) where status = 'active';
create index merchant_qr_codes_merchant on public.merchant_qr_codes (merchant_id);
create index merchant_qr_codes_issued_by on public.merchant_qr_codes (issued_by);
create index merchant_qr_codes_revoked_by on public.merchant_qr_codes (revoked_by);

create table public.redemption_sessions (
  id uuid primary key default gen_random_uuid(),
  public_ref text not null unique check (public_ref ~ '^PQ-[0-9A-HJKMNP-TV-Z]{8}$'),
  student_id uuid not null references public.profiles (id) on delete cascade,
  client_request_id uuid not null,
  qr_code_id uuid not null references public.merchant_qr_codes (id),
  branch_id uuid not null references public.merchant_branches (id),
  merchant_id uuid not null references public.merchants (id),
  institution_id uuid not null references public.institutions (id),
  status public.redemption_session_status not null default 'open',
  -- The snapshot both sides confirm and the redemption records.
  offer_id uuid references public.offers (id),
  item_name text,
  regular_price numeric(12, 2),
  discount_type public.discount_type,
  discount_value numeric(12, 2),
  discount_amount numeric(12, 2),
  final_price numeric(12, 2),
  pass_code text check (pass_code is null or pass_code ~ '^[0-9]{4}$'),
  select_count int not null default 0,
  selected_at timestamptz,
  merchant_confirmed_at timestamptz,
  merchant_confirmed_by uuid references public.profiles (id),
  student_confirmed_at timestamptz,
  completed_at timestamptz,
  rejected_reason text check (rejected_reason is null or rejected_reason in ('not_this_student', 'item_not_purchased', 'wrong_item', 'offer_not_honoured_today', 'other')),
  rejected_note text check (rejected_note is null or char_length(rejected_note) <= 300),
  rejected_by uuid references public.profiles (id),
  ended_at timestamptz,
  expires_at timestamptz not null,
  distance_m int check (distance_m is null or distance_m >= 0),
  location_signal text not null default 'unknown' check (location_signal in ('near', 'far', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, client_request_id),
  constraint redemption_sessions_snapshot check (
    status in ('open', 'cancelled', 'expired', 'rejected')
    or (offer_id is not null and final_price is not null and discount_amount > 0 and pass_code is not null)
  ),
  constraint redemption_sessions_merchant_confirmed check (status not in ('awaiting_student', 'completed') or merchant_confirmed_at is not null)
);
comment on table public.redemption_sessions is 'Coordinates on the student device are used only to compute distance_m and are never stored.';
create unique index redemption_sessions_one_live on public.redemption_sessions (student_id)
  where status in ('open', 'awaiting_merchant', 'awaiting_student');
create index redemption_sessions_branch_live on public.redemption_sessions (branch_id, status);
create index redemption_sessions_merchant on public.redemption_sessions (merchant_id, created_at);
create index redemption_sessions_offer on public.redemption_sessions (offer_id);
create index redemption_sessions_qr on public.redemption_sessions (qr_code_id);
create index redemption_sessions_institution on public.redemption_sessions (institution_id);
create index redemption_sessions_confirmed_by on public.redemption_sessions (merchant_confirmed_by);
create index redemption_sessions_rejected_by on public.redemption_sessions (rejected_by);
create index redemption_sessions_limits on public.redemption_sessions (student_id, offer_id, merchant_confirmed_at) where merchant_confirmed_at is not null;
create trigger redemption_sessions_updated_at before update on public.redemption_sessions
  for each row execute function private.set_updated_at();

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.redemption_sessions (id),
  transaction_ref text not null unique,
  student_id uuid not null references public.profiles (id),
  merchant_id uuid not null references public.merchants (id),
  branch_id uuid not null references public.merchant_branches (id),
  offer_id uuid not null references public.offers (id),
  institution_id uuid not null references public.institutions (id),
  item_name text not null,
  regular_price numeric(12, 2) not null check (regular_price > 0),
  discount_type public.discount_type not null,
  discount_value numeric(12, 2) not null,
  discount_amount numeric(12, 2) not null check (discount_amount > 0),
  final_price numeric(12, 2) not null check (final_price >= 0),
  merchant_confirmed_by uuid not null references public.profiles (id),
  redeemed_at timestamptz not null default now(),
  payment_method public.payment_method,
  payment_status public.payment_status,
  payment_recorded_at timestamptz,
  payment_recorded_by uuid references public.profiles (id),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  void_reason text check (void_reason is null or char_length(void_reason) between 5 and 500),
  constraint redemptions_amounts check (regular_price = discount_amount + final_price),
  constraint redemptions_void check ((voided_at is null) = (void_reason is null))
);
comment on column public.redemptions.payment_status is 'Recorded by the merchant. Perqly never handles payment.';
create index redemptions_student on public.redemptions (student_id, redeemed_at);
create index redemptions_merchant on public.redemptions (merchant_id, redeemed_at);
create index redemptions_branch on public.redemptions (branch_id);
create index redemptions_offer on public.redemptions (offer_id, student_id, redeemed_at);
create index redemptions_institution on public.redemptions (institution_id, redeemed_at);
create index redemptions_confirmed_by on public.redemptions (merchant_confirmed_by);
create index redemptions_payment_by on public.redemptions (payment_recorded_by);
create index redemptions_voided_by on public.redemptions (voided_by);

-- A redemption is final: never deleted, and only payment and void fields change.
create function private.redemptions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'redemptions_are_final' using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - array['payment_method', 'payment_status', 'payment_recorded_at', 'payment_recorded_by', 'voided_at', 'voided_by', 'void_reason'])
     is distinct from
     (to_jsonb(old) - array['payment_method', 'payment_status', 'payment_recorded_at', 'payment_recorded_by', 'voided_at', 'voided_by', 'void_reason']) then
    raise exception 'redemptions_are_final' using errcode = 'P0001';
  end if;
  if old.voided_at is not null then
    raise exception 'redemptions_are_final' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger redemptions_guard before update or delete on public.redemptions
  for each row execute function private.redemptions_guard();
create trigger redemptions_no_truncate before truncate on public.redemptions
  for each statement execute function private.redemptions_guard();

-- A final session never changes state again.
create function private.redemption_sessions_final()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('completed', 'rejected', 'cancelled', 'expired') and new.status is distinct from old.status then
    raise exception 'session_final' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger redemption_sessions_final before update on public.redemption_sessions
  for each row execute function private.redemption_sessions_final();

create table public.student_savings (
  student_id uuid primary key references public.profiles (id) on delete cascade,
  total_saved numeric(12, 2) not null default 0 check (total_saved >= 0),
  total_spent_at_student_price numeric(12, 2) not null default 0 check (total_spent_at_student_price >= 0),
  redemption_count int not null default 0 check (redemption_count >= 0),
  first_redeemed_at timestamptz,
  last_redeemed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]+\.[a-z_]+$'),
  title text not null check (char_length(title) between 1 and 140),
  body text check (body is null or char_length(body) <= 500),
  link text check (link is null or link ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on public.notifications (user_id, created_at desc);
create index notifications_unread on public.notifications (user_id) where read_at is null;

-- Row-level security -------------------------------------------------------------------
alter table public.merchant_qr_codes enable row level security;
alter table public.redemption_sessions enable row level security;
alter table public.redemptions enable row level security;
alter table public.student_savings enable row level security;
alter table public.notifications enable row level security;

revoke all on table public.merchant_qr_codes, public.redemption_sessions, public.redemptions, public.student_savings, public.notifications
  from anon, authenticated, service_role;
grant select on table public.merchant_qr_codes, public.redemption_sessions, public.redemptions, public.student_savings, public.notifications
  to authenticated;
grant select, update on table public.redemption_sessions to service_role;

-- Only managers and owners see the printable codes; cashiers don't need the token.
create policy "managers read their branch codes" on public.merchant_qr_codes
  for select to authenticated using ((select private.can_manage_merchant(merchant_id)));
create policy "support reads codes" on public.merchant_qr_codes
  for select to authenticated using ((select private.is_staff('support')));

-- Sessions are readable by their student and by staff who can operate the branch
-- (this is also what Realtime applies). Student names come only through functions.
create policy "students read their sessions" on public.redemption_sessions
  for select to authenticated using (student_id = (select auth.uid()));
create policy "branch staff read branch sessions" on public.redemption_sessions
  for select to authenticated using ((select private.can_operate_branch(branch_id)));
create policy "support reads sessions" on public.redemption_sessions
  for select to authenticated using ((select private.is_staff('support')));

create policy "students read their redemptions" on public.redemptions
  for select to authenticated using (student_id = (select auth.uid()));
create policy "merchant users read their redemptions" on public.redemptions
  for select to authenticated using (
    (select private.can_manage_merchant(merchant_id)) or (select private.can_operate_branch(branch_id))
  );
create policy "support reads redemptions" on public.redemptions
  for select to authenticated using ((select private.is_staff('support')));

create policy "students read their savings" on public.student_savings
  for select to authenticated using (student_id = (select auth.uid()));

create policy "users read their notifications" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.redemption_sessions;
  end if;
end;
$$;

-- QR codes -----------------------------------------------------------------------------
-- Issues a code for a branch if it has none and its business is approved.
create function private.ensure_branch_qr(p_branch_id uuid, p_reason text default 'first')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch public.merchant_branches;
  v_id uuid;
  v_version int;
begin
  select * into v_branch from public.merchant_branches where id = p_branch_id;
  if v_branch.id is null or not v_branch.is_active
     or not exists (select 1 from public.merchants where id = v_branch.merchant_id and status = 'approved') then
    return null;
  end if;
  select id into v_id from public.merchant_qr_codes where branch_id = p_branch_id and status = 'active';
  if v_id is not null then return v_id; end if;
  select coalesce(max(version), 0) + 1 into v_version from public.merchant_qr_codes where branch_id = p_branch_id;
  insert into public.merchant_qr_codes (branch_id, merchant_id, token, short_code, version, issued_by)
  values (p_branch_id, v_branch.merchant_id, private.random_token(), private.random_crockford(8), v_version, (select auth.uid()))
  returning id into v_id;
  perform private.write_audit(case when v_version = 1 then 'qr.issued' else 'qr.reissued' end, 'merchant', 'merchant_qr_code', v_id,
    null, jsonb_build_object('branch_id', p_branch_id, 'version', v_version), jsonb_build_object('reason', p_reason),
    null, v_branch.merchant_id);
  return v_id;
end;
$$;

create function private.issue_codes_on_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch uuid;
begin
  if tg_table_name = 'merchants' then
    if new.status = 'approved' and old.status is distinct from 'approved' then
      for v_branch in select id from public.merchant_branches where merchant_id = new.id and is_active loop
        perform private.ensure_branch_qr(v_branch);
      end loop;
    end if;
  elsif new.is_active then
    perform private.ensure_branch_qr(new.id);
  end if;
  return null;
end;
$$;
create trigger merchants_issue_codes after update of status on public.merchants
  for each row execute function private.issue_codes_on_approval();
create trigger branches_issue_codes after insert or update of is_active on public.merchant_branches
  for each row execute function private.issue_codes_on_approval();

-- Codes for existing approved branches (none on a fresh database).
do $$
declare v uuid;
begin
  for v in select b.id from public.merchant_branches b join public.merchants m on m.id = b.merchant_id where m.status = 'approved' and b.is_active loop
    perform private.ensure_branch_qr(v, 'backfill');
  end loop;
end;
$$;

-- Managers see their branches' current codes (token included, to draw the QR).
create function public.get_branch_codes(p_merchant_id uuid)
returns table (branch_id uuid, branch_name text, qr_code_id uuid, token text, short_code text, version int, issued_at timestamptz, last_scanned_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_merchant(p_merchant_id)) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return query
    select b.id, b.name, q.id, q.token, q.short_code, q.version, q.created_at, q.last_scanned_at
    from public.merchant_branches b
    left join public.merchant_qr_codes q on q.branch_id = b.id and q.status = 'active'
    where b.merchant_id = p_merchant_id and b.is_active
    order by b.name;
end;
$$;

create function public.record_qr_download(p_qr_code_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_merchant uuid;
begin
  select merchant_id into v_merchant from public.merchant_qr_codes where id = p_qr_code_id and status = 'active';
  if v_merchant is null or not (select private.can_manage_merchant(v_merchant)) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  perform private.write_audit('qr.downloaded', 'merchant', 'merchant_qr_code', p_qr_code_id, null, null, '{}'::jsonb, null, v_merchant);
end;
$$;

create function public.reissue_branch_qr(p_branch_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant uuid;
  v_old uuid;
begin
  select merchant_id into v_merchant from public.merchant_branches where id = p_branch_id;
  if v_merchant is null or not (select private.can_manage_merchant(v_merchant)) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.merchants where id = v_merchant and status = 'approved') then
    raise exception 'merchant_not_approved' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  perform private.check_rate_limit('qr.reissue', private.setting_int('qr.max_reissues_per_day', 5), interval '1 day', 'branch:' || p_branch_id);
  update public.merchant_qr_codes
     set status = 'revoked', revoked_at = now(), revoked_by = (select auth.uid()), revoked_reason = left(btrim(p_reason), 300)
   where branch_id = p_branch_id and status = 'active'
   returning id into v_old;
  if v_old is not null then
    perform private.write_audit('qr.revoked', 'merchant', 'merchant_qr_code', v_old, null, null,
      jsonb_build_object('reason', left(btrim(p_reason), 300), 'reissued', true), null, v_merchant);
  end if;
  return private.ensure_branch_qr(p_branch_id, left(btrim(p_reason), 300));
end;
$$;

create function public.revoke_qr_code(p_qr_code_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_merchant uuid;
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  update public.merchant_qr_codes
     set status = 'revoked', revoked_at = now(), revoked_by = (select auth.uid()), revoked_reason = left(btrim(p_reason), 300)
   where id = p_qr_code_id and status = 'active'
   returning merchant_id into v_merchant;
  if v_merchant is null then raise exception 'qr_not_active' using errcode = 'P0001'; end if;
  perform private.write_audit('qr.revoked', 'staff', 'merchant_qr_code', p_qr_code_id, null, null,
    jsonb_build_object('reason', left(btrim(p_reason), 300)), null, v_merchant);
end;
$$;

-- Eligibility and limits ---------------------------------------------------------------
-- Whether an offer can be redeemed at a branch by students of an institution right now.
create function private.offer_redeemable_at(p_offer_id uuid, p_branch_id uuid, p_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.offer_is_live(p_offer_id, p_institution_id)
     and exists (
       select 1 from public.offers o join public.merchant_branches b on b.merchant_id = o.merchant_id
       where o.id = p_offer_id and b.id = p_branch_id and b.is_active
         and (not exists (select 1 from public.offer_branches ob where ob.offer_id = o.id)
              or exists (select 1 from public.offer_branches ob where ob.offer_id = o.id and ob.branch_id = b.id)));
$$;

-- Start of the current limit period, on the Africa/Accra calendar (weeks start Monday).
create function private.period_start(p_period public.limit_period)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case p_period
           when 'offer_lifetime' then '-infinity'::timestamptz
           else date_trunc(p_period::text, now() at time zone 'Africa/Accra') at time zone 'Africa/Accra'
         end;
$$;

create function private.period_end(p_period public.limit_period)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case p_period
           when 'offer_lifetime' then 'infinity'::timestamptz
           else (date_trunc(p_period::text, now() at time zone 'Africa/Accra') + ('1 ' || p_period::text)::interval) at time zone 'Africa/Accra'
         end;
$$;

-- Uses that count toward a student's limit: completed, not voided, redemptions plus
-- sessions that ended without the student after the merchant had confirmed.
create function private.uses_in_period(p_student_id uuid, p_offer_id uuid, p_exclude_session uuid default null)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  with o as (select private.period_start(per_student_period) as since from public.offers where id = p_offer_id)
  select (
    (select count(*) from public.redemptions r, o
      where r.student_id = p_student_id and r.offer_id = p_offer_id and r.voided_at is null and r.redeemed_at >= o.since)
    +
    (select count(*) from public.redemption_sessions s, o
      where s.student_id = p_student_id and s.offer_id = p_offer_id and s.merchant_confirmed_at is not null
        and s.merchant_confirmed_at >= o.since and s.id is distinct from p_exclude_session
        and (s.status = 'expired' or (s.status = 'awaiting_student' and s.expires_at <= now())))
  )::int;
$$;

create function private.uses_left(p_student_id uuid, p_offer_id uuid, p_exclude_session uuid default null)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(o.per_student_limit - private.uses_in_period(p_student_id, p_offer_id, p_exclude_session), 0)
  from public.offers o where o.id = p_offer_id;
$$;

-- Session status as the caller should see it: a live session past its time is expired.
create function private.effective_status(p_status public.redemption_session_status, p_expires_at timestamptz)
returns public.redemption_session_status
language sql
stable
set search_path = ''
as $$
  select case when p_status in ('open', 'awaiting_merchant', 'awaiting_student') and p_expires_at <= now() then 'expired'::public.redemption_session_status
              else p_status end;
$$;

-- Persists expiry for one locked session row and audits it when the merchant had confirmed.
create function private.expire_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v public.redemption_sessions;
begin
  update public.redemption_sessions
     set status = 'expired', ended_at = now()
   where id = p_session_id and status in ('open', 'awaiting_merchant', 'awaiting_student') and expires_at <= now()
   returning * into v;
  if v.id is not null and v.merchant_confirmed_at is not null then
    perform private.write_audit('redemption.expired', 'system', 'redemption_session', v.id, null, null,
      jsonb_build_object('offer_id', v.offer_id, 'merchant_confirmed', true), v.institution_id, v.merchant_id);
  end if;
end;
$$;

create function private.session_error(p_code text, p_extra jsonb default '{}'::jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('ok', false, 'error', p_code) || coalesce(p_extra, '{}'::jsonb);
$$;

-- Eligible offers at a branch for the caller, with uses left. Prices from price_offer.
create function private.branch_offers(p_branch_id uuid, p_student_id uuid, p_institution_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'offer_id', o.id, 'title', coalesce(o.title, coalesce(s.name, p.name)), 'item_name', coalesce(s.name, p.name),
           'regular_price', pr.regular_price, 'discount_amount', pr.discount_amount, 'final_price', pr.final_price,
           'discount_type', o.discount_type, 'discount_value', o.discount_value, 'conditions', o.conditions,
           'per_student_limit', o.per_student_limit, 'per_student_period', o.per_student_period,
           'uses_left', private.uses_left(p_student_id, o.id),
           'resets_at', case when o.per_student_period = 'offer_lifetime' then null else private.period_end(o.per_student_period) end)
         order by pr.discount_amount desc), '[]'::jsonb)
  from public.offers o
  join public.merchant_branches b on b.id = p_branch_id and b.merchant_id = o.merchant_id
  left join public.services s on s.id = o.service_id
  left join public.products p on p.id = o.product_id
  cross join lateral private.price_offer(o.id) pr
  where private.offer_redeemable_at(o.id, p_branch_id, p_institution_id);
$$;

-- Step 2–3: open (or resume) a session from a scanned token or a typed short code.
create function public.open_redemption_session(
  p_token text,
  p_short_code text,
  p_client_request_id uuid,
  p_distance_hint jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_sp public.student_profiles;
  v_inst_status public.institution_status;
  v_qr public.merchant_qr_codes;
  v_branch public.merchant_branches;
  v_existing public.redemption_sessions;
  v_id uuid;
  v_ref text;
  v_distance int;
  v_signal text := 'unknown';
  v_lat double precision;
  v_lng double precision;
  v_acc double precision;
  v_code text := upper(btrim(coalesce(p_short_code, '')));
begin
  if v_uid is null then return private.session_error('not_authenticated'); end if;
  if (select private.is_suspended()) then return private.session_error('account_suspended'); end if;
  if p_client_request_id is null then return private.session_error('request_invalid'); end if;

  -- Idempotency: the same request returns the same session.
  select * into v_existing from public.redemption_sessions where student_id = v_uid and client_request_id = p_client_request_id;
  if v_existing.id is not null then
    return jsonb_build_object('ok', true, 'session_id', v_existing.id, 'resumed', true);
  end if;

  begin
    perform private.check_rate_limit('qr.scan', private.setting_int('qr.max_scans_per_minute', 6), interval '1 minute');
    if v_code <> '' then
      perform private.check_rate_limit('qr.short_code', private.setting_int('qr.max_short_code_attempts_per_10_min', 5), interval '10 minutes');
    end if;
  exception when sqlstate 'P0001' then
    return private.session_error('rate_limited');
  end;

  select * into v_sp from public.student_profiles where user_id = v_uid;
  if v_sp.user_id is null or v_sp.verification_status <> 'verified' then
    return private.session_error(case when v_sp.verification_status = 'expired' then 'verification_expired' else 'not_verified' end);
  end if;
  if v_sp.verified_until <= now() then return private.session_error('verification_expired'); end if;
  select status into v_inst_status from public.institutions where id = v_sp.institution_id;
  if v_inst_status is null or v_inst_status not in ('pilot', 'active') then return private.session_error('institution_inactive'); end if;

  if coalesce(p_token, '') ~ '^[A-Za-z0-9_-]{22}$' then
    select * into v_qr from public.merchant_qr_codes where token = p_token and status = 'active';
  elsif v_code ~ '^[0-9A-HJKMNP-TV-Z]{8}$' then
    select * into v_qr from public.merchant_qr_codes where short_code = v_code and status = 'active';
  end if;
  if v_qr.id is null then
    -- Sampled: only codes that exist are logged by id; the token is never written.
    return private.session_error('qr_invalid');
  end if;
  update public.merchant_qr_codes set last_scanned_at = now() where id = v_qr.id;

  select * into v_branch from public.merchant_branches where id = v_qr.branch_id;
  if not v_branch.is_active or not exists (select 1 from public.merchants where id = v_branch.merchant_id and status = 'approved') then
    return private.session_error('merchant_unavailable');
  end if;

  -- One live session per student: expire stale ones, resume one at this branch.
  for v_existing in
    select * from public.redemption_sessions
    where student_id = v_uid and status in ('open', 'awaiting_merchant', 'awaiting_student') for update
  loop
    if v_existing.expires_at <= now() then
      perform private.expire_session(v_existing.id);
    elsif v_existing.branch_id = v_branch.id then
      return jsonb_build_object('ok', true, 'session_id', v_existing.id, 'resumed', true);
    else
      return private.session_error('session_in_progress', jsonb_build_object(
        'session_id', v_existing.id,
        'merchant_name', (select display_name from public.merchants where id = v_existing.merchant_id)));
    end if;
  end loop;

  if not exists (select 1 from jsonb_array_elements(private.branch_offers(v_branch.id, v_uid, v_sp.institution_id)) e
                 where (e ->> 'uses_left')::int > 0) then
    return private.session_error('no_eligible_offers');
  end if;

  begin
    perform private.check_rate_limit('redemption.session', private.setting_int('redemption.max_sessions_per_hour', 10), interval '1 hour');
  exception when sqlstate 'P0001' then
    return private.session_error('rate_limited');
  end;

  -- Distance, if the student shared location. Coordinates are not stored.
  if p_distance_hint is not null and v_branch.latitude is not null and v_branch.longitude is not null then
    begin
      v_lat := (p_distance_hint ->> 'lat')::double precision;
      v_lng := (p_distance_hint ->> 'lng')::double precision;
      v_acc := coalesce((p_distance_hint ->> 'accuracy_m')::double precision, 0);
      if v_lat between -90 and 90 and v_lng between -180 and 180 then
        v_distance := round(2 * 6371000 * asin(sqrt(
          power(sin(radians(v_lat - v_branch.latitude) / 2), 2)
          + cos(radians(v_branch.latitude)) * cos(radians(v_lat)) * power(sin(radians(v_lng - v_branch.longitude) / 2), 2))));
        v_signal := case when v_distance <= private.setting_int('redemption.near_metres', 300) + least(greatest(v_acc, 0), 500)
                         then 'near' else 'far' end;
      end if;
    exception when others then
      v_distance := null; v_signal := 'unknown';
    end;
  end if;

  loop
    v_ref := 'PQ-' || private.random_crockford(8);
    exit when not exists (select 1 from public.redemption_sessions where public_ref = v_ref);
  end loop;
  insert into public.redemption_sessions (public_ref, student_id, client_request_id, qr_code_id, branch_id, merchant_id, institution_id,
                                          expires_at, distance_m, location_signal)
  values (v_ref, v_uid, p_client_request_id, v_qr.id, v_branch.id, v_branch.merchant_id, v_sp.institution_id,
          now() + make_interval(secs => private.setting_int('redemption.select_window_seconds', 300)), v_distance, v_signal)
  returning id into v_id;
  perform private.write_audit('redemption.session_opened', 'student', 'redemption_session', v_id, null, null,
    jsonb_build_object('qr_code_id', v_qr.id, 'branch_id', v_branch.id, 'location_signal', v_signal, 'via', case when v_code <> '' then 'short_code' else 'qr' end),
    v_sp.institution_id, v_branch.merchant_id);
  return jsonb_build_object('ok', true, 'session_id', v_id, 'resumed', false);
end;
$$;

-- Steps 4–5: the student picks the offer; the server snapshots the price.
create function public.select_redemption_item(p_session_id uuid, p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.redemption_sessions;
  v_offer public.offers;
  v_price record;
  v_item text;
begin
  select * into v from public.redemption_sessions where id = p_session_id and student_id = (select auth.uid()) for update;
  if v.id is null then return private.session_error('session_not_found'); end if;
  if v.status in ('open', 'awaiting_merchant', 'awaiting_student') and v.expires_at <= now() then
    perform private.expire_session(v.id);
    return private.session_error('session_expired');
  end if;
  if v.status not in ('open', 'awaiting_merchant') or v.merchant_confirmed_at is not null then
    return private.session_error('session_locked');
  end if;
  if v.select_count >= private.setting_int('redemption.max_selects_per_session', 20) then
    return private.session_error('rate_limited');
  end if;
  if (select private.is_suspended()) then return private.session_error('account_suspended'); end if;
  if not exists (select 1 from public.student_profiles where user_id = v.student_id and verification_status = 'verified' and verified_until > now()) then
    return private.session_error('verification_expired');
  end if;

  select * into v_offer from public.offers where id = p_offer_id;
  if v_offer.id is null or v_offer.merchant_id <> v.merchant_id or not private.offer_redeemable_at(p_offer_id, v.branch_id, v.institution_id) then
    return private.session_error('offer_unavailable');
  end if;
  if private.uses_left(v.student_id, p_offer_id) < 1 then
    return private.session_error('limit_reached', jsonb_build_object(
      'limit', v_offer.per_student_limit, 'period', v_offer.per_student_period,
      'resets_at', case when v_offer.per_student_period = 'offer_lifetime' then null else private.period_end(v_offer.per_student_period) end));
  end if;

  select * into v_price from private.price_offer(p_offer_id);
  select coalesce(s.name, p.name) into v_item
  from public.offers o left join public.services s on s.id = o.service_id left join public.products p on p.id = o.product_id
  where o.id = p_offer_id;

  update public.redemption_sessions
     set status = 'awaiting_merchant', offer_id = p_offer_id, item_name = v_item,
         regular_price = v_price.regular_price, discount_type = v_offer.discount_type, discount_value = v_offer.discount_value,
         discount_amount = v_price.discount_amount, final_price = v_price.final_price,
         pass_code = lpad(((('x' || encode(extensions.gen_random_bytes(2), 'hex'))::bit(16)::int) % 10000)::text, 4, '0'),
         selected_at = now(), select_count = select_count + 1,
         expires_at = now() + make_interval(secs => private.setting_int('redemption.confirm_window_seconds', 600))
   where id = v.id;
  perform private.write_audit('redemption.item_selected', 'student', 'redemption_session', v.id, null, null,
    jsonb_build_object('offer_id', p_offer_id, 'final_price', v_price.final_price, 'discount_amount', v_price.discount_amount),
    v.institution_id, v.merchant_id);
  return jsonb_build_object('ok', true);
end;
$$;

-- Step 7: a cashier, manager or owner of the branch confirms.
create function public.merchant_confirm_redemption(p_session_id uuid, p_expected_final_price numeric, p_client_request_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.redemption_sessions;
  v_uid uuid := (select auth.uid());
begin
  select * into v from public.redemption_sessions where id = p_session_id for update;
  if v.id is null or not (select private.can_operate_branch(v.branch_id)) then return private.session_error('forbidden'); end if;
  begin
    perform private.check_rate_limit('redemption.merchant_action', private.setting_int('redemption.merchant_actions_per_minute', 60), interval '1 minute');
  exception when sqlstate 'P0001' then
    return private.session_error('rate_limited');
  end;
  if v.status in ('awaiting_student', 'completed') and v.merchant_confirmed_at is not null then
    return case when v.merchant_confirmed_by = v_uid then jsonb_build_object('ok', true, 'already', true)
                else private.session_error('already_confirmed') end;
  end if;
  if v.status in ('open', 'awaiting_merchant', 'awaiting_student') and v.expires_at <= now() then
    perform private.expire_session(v.id);
    return private.session_error('session_expired');
  end if;
  if v.status <> 'awaiting_merchant' then return private.session_error('session_locked'); end if;
  if not exists (select 1 from public.merchants where id = v.merchant_id and status = 'approved')
     or not exists (select 1 from public.merchant_branches where id = v.branch_id and is_active) then
    return private.session_error('merchant_unavailable');
  end if;
  if p_expected_final_price is null or p_expected_final_price <> v.final_price then
    return private.session_error('session_changed');
  end if;
  update public.redemption_sessions
     set status = 'awaiting_student', merchant_confirmed_at = now(), merchant_confirmed_by = v_uid
   where id = v.id;
  perform private.write_audit('redemption.merchant_confirmed', 'merchant', 'redemption_session', v.id, null, null,
    jsonb_build_object('offer_id', v.offer_id, 'final_price', v.final_price), v.institution_id, v.merchant_id);
  return jsonb_build_object('ok', true);
end;
$$;

create function public.merchant_reject_redemption(p_session_id uuid, p_reason text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.redemption_sessions;
begin
  select * into v from public.redemption_sessions where id = p_session_id for update;
  if v.id is null or not (select private.can_operate_branch(v.branch_id)) then return private.session_error('forbidden'); end if;
  begin
    perform private.check_rate_limit('redemption.merchant_action', private.setting_int('redemption.merchant_actions_per_minute', 60), interval '1 minute');
  exception when sqlstate 'P0001' then
    return private.session_error('rate_limited');
  end;
  if p_reason is null or p_reason not in ('not_this_student', 'item_not_purchased', 'wrong_item', 'offer_not_honoured_today', 'other') then
    return private.session_error('reason_required');
  end if;
  if p_reason = 'other' and char_length(btrim(coalesce(p_note, ''))) < 3 then return private.session_error('reason_required'); end if;
  if v.status in ('open', 'awaiting_merchant', 'awaiting_student') and v.expires_at <= now() then
    perform private.expire_session(v.id);
    return private.session_error('session_expired');
  end if;
  if v.status not in ('awaiting_merchant', 'awaiting_student') then return private.session_error('session_locked'); end if;
  update public.redemption_sessions
     set status = 'rejected', rejected_reason = p_reason, rejected_note = nullif(left(btrim(coalesce(p_note, '')), 300), ''),
         rejected_by = (select auth.uid()), ended_at = now()
   where id = v.id;
  perform private.write_audit('redemption.merchant_rejected', 'merchant', 'redemption_session', v.id, null, null,
    jsonb_build_object('reason', p_reason), v.institution_id, v.merchant_id);
  return jsonb_build_object('ok', true);
end;
$$;

create function public.cancel_redemption_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.redemption_sessions;
begin
  select * into v from public.redemption_sessions where id = p_session_id and student_id = (select auth.uid()) for update;
  if v.id is null then return private.session_error('session_not_found'); end if;
  if v.status in ('cancelled') then return jsonb_build_object('ok', true, 'already', true); end if;
  if v.status in ('open', 'awaiting_merchant', 'awaiting_student') and v.expires_at <= now() then
    perform private.expire_session(v.id);
    return private.session_error('session_expired');
  end if;
  if v.status not in ('open', 'awaiting_merchant', 'awaiting_student') then return private.session_error('session_locked'); end if;
  update public.redemption_sessions set status = 'cancelled', ended_at = now() where id = v.id;
  perform private.write_audit('redemption.cancelled', 'student', 'redemption_session', v.id, null, null,
    jsonb_build_object('merchant_confirmed', v.merchant_confirmed_at is not null), v.institution_id, v.merchant_id);
  return jsonb_build_object('ok', true);
end;
$$;

-- Step 9: finalise atomically. Called only from student_confirm_redemption, with the
-- session row already locked by the caller.
create function private.finalize_redemption(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.redemption_sessions;
  v_offer public.offers;
  v_redemption uuid;
  v_merchant_name text;
begin
  select * into v from public.redemption_sessions where id = p_session_id for update;
  if v.status <> 'awaiting_student' then return private.session_error('session_locked'); end if;
  if v.expires_at <= now() then
    perform private.expire_session(v.id);
    return private.session_error('session_expired');
  end if;

  -- Serialises everyone redeeming this offer, so the cap can't be overrun.
  select * into v_offer from public.offers where id = v.offer_id for update;
  if exists (select 1 from public.profiles where id = v.student_id and is_suspended) then return private.session_error('account_suspended'); end if;
  if not exists (select 1 from public.student_profiles where user_id = v.student_id and verification_status = 'verified' and verified_until > now()) then
    return private.session_error('verification_expired');
  end if;
  if not exists (select 1 from public.merchants where id = v.merchant_id and status = 'approved') then
    return private.session_error('merchant_unavailable');
  end if;
  if v_offer.status in ('rejected', 'archived', 'draft', 'pending_review') then return private.session_error('offer_unavailable'); end if;
  if v_offer.total_cap is not null and v_offer.redemption_count >= v_offer.total_cap then return private.session_error('offer_unavailable'); end if;
  if private.uses_left(v.student_id, v.offer_id, v.id) < 1 then
    return private.session_error('limit_reached', jsonb_build_object('limit', v_offer.per_student_limit, 'period', v_offer.per_student_period,
      'resets_at', case when v_offer.per_student_period = 'offer_lifetime' then null else private.period_end(v_offer.per_student_period) end));
  end if;

  insert into public.redemptions (session_id, transaction_ref, student_id, merchant_id, branch_id, offer_id, institution_id, item_name,
                                  regular_price, discount_type, discount_value, discount_amount, final_price, merchant_confirmed_by)
  values (v.id, v.public_ref, v.student_id, v.merchant_id, v.branch_id, v.offer_id, v.institution_id, v.item_name,
          v.regular_price, v.discount_type, v.discount_value, v.discount_amount, v.final_price, v.merchant_confirmed_by)
  returning id into v_redemption;

  update public.offers
     set redemption_count = redemption_count + 1,
         status = case when total_cap is not null and redemption_count + 1 >= total_cap then 'expired' else status end
   where id = v.offer_id;

  insert into public.student_savings as ss (student_id, total_saved, total_spent_at_student_price, redemption_count, first_redeemed_at, last_redeemed_at)
  values (v.student_id, v.discount_amount, v.final_price, 1, now(), now())
  on conflict (student_id) do update
    set total_saved = ss.total_saved + excluded.total_saved,
        total_spent_at_student_price = ss.total_spent_at_student_price + excluded.total_spent_at_student_price,
        redemption_count = ss.redemption_count + 1,
        last_redeemed_at = now(), updated_at = now();

  update public.redemption_sessions
     set status = 'completed', student_confirmed_at = now(), completed_at = now(), ended_at = now()
   where id = v.id;

  perform private.write_audit('redemption.completed', 'student', 'redemption', v_redemption, null,
    jsonb_build_object('session_id', v.id, 'offer_id', v.offer_id, 'regular_price', v.regular_price,
                       'discount_amount', v.discount_amount, 'final_price', v.final_price),
    '{}'::jsonb, v.institution_id, v.merchant_id);

  select display_name into v_merchant_name from public.merchants where id = v.merchant_id;
  insert into public.notifications (user_id, kind, title, body, link) values
    (v.student_id, 'redemption.completed', 'You saved GH₵' || to_char(v.discount_amount, 'FM999999990.00') || ' at ' || left(v_merchant_name, 80),
     v.item_name || '. Pay the business GH₵' || to_char(v.final_price, 'FM999999990.00') || ' directly.', '/student/history'),
    (v.merchant_confirmed_by, 'redemption.completed', 'Redemption ' || v.public_ref || ' completed',
     v.item_name || ', student pays GH₵' || to_char(v.final_price, 'FM999999990.00') || '.', '/merchant/redemptions');

  return jsonb_build_object('ok', true, 'redemption_id', v_redemption);
end;
$$;

-- Step 8: the student confirms, which finalises in the same transaction.
create function public.student_confirm_redemption(p_session_id uuid, p_client_request_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.redemption_sessions;
begin
  select * into v from public.redemption_sessions where id = p_session_id and student_id = (select auth.uid()) for update;
  if v.id is null then return private.session_error('session_not_found'); end if;
  if v.status = 'completed' then
    return jsonb_build_object('ok', true, 'already', true, 'redemption_id', (select id from public.redemptions where session_id = v.id));
  end if;
  if v.status = 'awaiting_merchant' and v.expires_at > now() then return private.session_error('awaiting_merchant'); end if;
  return private.finalize_redemption(v.id);
end;
$$;

-- What the student's redeem screen shows. Null if the session isn't the caller's.
create function public.get_redemption_session(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id, 'public_ref', s.public_ref, 'status', private.effective_status(s.status, s.expires_at), 'expires_at', s.expires_at,
    'merchant_name', m.display_name, 'merchant_slug', m.slug, 'branch_name', b.name,
    'offer_id', s.offer_id, 'item_name', s.item_name, 'regular_price', s.regular_price, 'discount_type', s.discount_type,
    'discount_value', s.discount_value, 'discount_amount', s.discount_amount, 'final_price', s.final_price, 'pass_code', s.pass_code,
    'merchant_confirmed', s.merchant_confirmed_at is not null, 'completed_at', s.completed_at,
    'rejected_reason', s.rejected_reason, 'rejected_note', s.rejected_note,
    'first_name', coalesce(pr.first_name, split_part(pr.full_name, ' ', 1)), 'institution', i.short_name,
    'offers', case when private.effective_status(s.status, s.expires_at) in ('open', 'awaiting_merchant') and s.merchant_confirmed_at is null
                   then private.branch_offers(s.branch_id, s.student_id, s.institution_id) else '[]'::jsonb end
  )
  from public.redemption_sessions s
  join public.merchants m on m.id = s.merchant_id
  join public.merchant_branches b on b.id = s.branch_id
  join public.profiles pr on pr.id = s.student_id
  join public.institutions i on i.id = s.institution_id
  where s.id = p_session_id and s.student_id = (select auth.uid());
$$;

-- The caller's live session, if any (for "resume" links).
create function public.my_live_session()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.redemption_sessions
  where student_id = (select auth.uid()) and status in ('open', 'awaiting_merchant', 'awaiting_student') and expires_at > now()
  limit 1;
$$;

-- The counter screen: live sessions at the branches the caller can operate, plus
-- sessions from the last hour that the merchant confirmed but the student didn't.
create function public.list_counter_sessions(p_merchant_id uuid)
returns table (
  session_id uuid, public_ref text, status public.redemption_session_status, branch_id uuid, branch_name text, student_first_name text,
  institution text, item_name text, regular_price numeric, discount_amount numeric, final_price numeric, discount_type public.discount_type,
  discount_value numeric, pass_code text, expires_at timestamptz, merchant_confirmed_at timestamptz, confirmed_by_me boolean, location_signal text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.public_ref, private.effective_status(s.status, s.expires_at), b.id, b.name,
         case when private.effective_status(s.status, s.expires_at) in ('awaiting_merchant', 'awaiting_student') or s.status = 'open'
              then coalesce(pr.first_name, split_part(pr.full_name, ' ', 1)) end,
         i.short_name, s.item_name, s.regular_price, s.discount_amount, s.final_price, s.discount_type, s.discount_value,
         case when private.effective_status(s.status, s.expires_at) = 'awaiting_merchant' then s.pass_code end,
         s.expires_at, s.merchant_confirmed_at, s.merchant_confirmed_by = (select auth.uid()), s.location_signal
  from public.redemption_sessions s
  join public.merchant_branches b on b.id = s.branch_id
  join public.profiles pr on pr.id = s.student_id
  join public.institutions i on i.id = s.institution_id
  where s.merchant_id = p_merchant_id
    and (select private.can_operate_branch(s.branch_id))
    and ((s.status in ('awaiting_merchant', 'awaiting_student') and s.expires_at > now())
         or (s.merchant_confirmed_at is not null and s.completed_at is null and s.status not in ('rejected', 'cancelled')
             and s.merchant_confirmed_at > now() - interval '1 hour'))
  order by (private.effective_status(s.status, s.expires_at) = 'awaiting_merchant') desc, s.selected_at;
$$;

-- After completion: the merchant's own note of how the student paid.
create function public.record_payment(p_redemption_id uuid, p_method public.payment_method, p_status public.payment_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.redemptions;
begin
  select * into r from public.redemptions where id = p_redemption_id for update;
  if r.id is null or not (select private.can_operate_branch(r.branch_id)) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if r.voided_at is not null then raise exception 'redemption_voided' using errcode = 'P0001'; end if;
  if r.redeemed_at < now() - make_interval(days => private.setting_int('redemption.payment_record_days', 7)) then
    raise exception 'payment_window_closed' using errcode = 'P0001';
  end if;
  if p_method is null or p_status is null then raise exception 'payment_invalid' using errcode = 'P0001'; end if;
  perform private.check_rate_limit('redemption.payment', private.setting_int('redemption.payment_records_per_hour', 120), interval '1 hour');
  update public.redemptions
     set payment_method = p_method, payment_status = p_status, payment_recorded_at = now(), payment_recorded_by = (select auth.uid())
   where id = r.id;
  perform private.write_audit('redemption.payment_recorded', 'merchant', 'redemption', r.id,
    jsonb_build_object('method', r.payment_method, 'status', r.payment_status), jsonb_build_object('method', p_method, 'status', p_status),
    '{}'::jsonb, r.institution_id, r.merchant_id);
end;
$$;

-- Support voids a completed redemption after a dispute.
create function public.void_redemption(p_redemption_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.redemptions;
begin
  if not (select private.is_staff('support')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  select * into r from public.redemptions where id = p_redemption_id for update;
  if r.id is null then raise exception 'redemption_not_found' using errcode = 'P0001'; end if;
  if r.voided_at is not null then raise exception 'redemption_voided' using errcode = 'P0001'; end if;
  update public.redemptions set voided_at = now(), voided_by = (select auth.uid()), void_reason = left(btrim(p_reason), 500) where id = r.id;
  update public.offers set redemption_count = greatest(redemption_count - 1, 0) where id = r.offer_id;
  update public.student_savings
     set total_saved = greatest(total_saved - r.discount_amount, 0),
         total_spent_at_student_price = greatest(total_spent_at_student_price - r.final_price, 0),
         redemption_count = greatest(redemption_count - 1, 0), updated_at = now()
   where student_id = r.student_id;
  perform private.write_audit('redemption.voided', 'staff', 'redemption', r.id, null, null,
    jsonb_build_object('reason', left(btrim(p_reason), 500), 'discount_amount', r.discount_amount), r.institution_id, r.merchant_id);
  insert into public.notifications (user_id, kind, title, body, link)
  values (r.student_id, 'redemption.voided', 'A redemption was cancelled by Perqly support', r.item_name || ' (' || r.transaction_ref || ').', '/student/history');
end;
$$;

-- Student history, with business names.
create function public.list_my_redemptions(p_limit int default 50, p_offset int default 0)
returns table (
  redemption_id uuid, transaction_ref text, merchant_name text, merchant_slug text, branch_name text, item_name text,
  regular_price numeric, discount_amount numeric, final_price numeric, redeemed_at timestamptz, voided boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.transaction_ref, m.display_name, m.slug, b.name, r.item_name, r.regular_price, r.discount_amount, r.final_price,
         r.redeemed_at, r.voided_at is not null
  from public.redemptions r
  join public.merchants m on m.id = r.merchant_id
  join public.merchant_branches b on b.id = r.branch_id
  where r.student_id = (select auth.uid())
  order by r.redeemed_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
$$;

create function public.mark_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_count int;
begin
  update public.notifications set read_at = now()
   where user_id = (select auth.uid()) and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Housekeeping (service role): persist expiry for sessions past their time.
create function public.expire_redemption_sessions()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v uuid;
  v_count int := 0;
begin
  for v in select id from public.redemption_sessions
           where status in ('open', 'awaiting_merchant', 'awaiting_student') and expires_at <= now()
           for update skip locked loop
    perform private.expire_session(v);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Grants -------------------------------------------------------------------------------
revoke execute on function
  public.get_branch_codes(uuid), public.record_qr_download(uuid), public.reissue_branch_qr(uuid, text), public.revoke_qr_code(uuid, text),
  public.open_redemption_session(text, text, uuid, jsonb), public.select_redemption_item(uuid, uuid),
  public.merchant_confirm_redemption(uuid, numeric, uuid), public.merchant_reject_redemption(uuid, text, text),
  public.cancel_redemption_session(uuid), public.student_confirm_redemption(uuid, uuid), public.get_redemption_session(uuid),
  public.my_live_session(), public.list_counter_sessions(uuid), public.record_payment(uuid, public.payment_method, public.payment_status),
  public.void_redemption(uuid, text), public.list_my_redemptions(int, int), public.mark_notifications_read(uuid[]),
  public.expire_redemption_sessions()
  from public, anon;
grant execute on function
  public.get_branch_codes(uuid), public.record_qr_download(uuid), public.reissue_branch_qr(uuid, text), public.revoke_qr_code(uuid, text),
  public.open_redemption_session(text, text, uuid, jsonb), public.select_redemption_item(uuid, uuid),
  public.merchant_confirm_redemption(uuid, numeric, uuid), public.merchant_reject_redemption(uuid, text, text),
  public.cancel_redemption_session(uuid), public.student_confirm_redemption(uuid, uuid), public.get_redemption_session(uuid),
  public.my_live_session(), public.list_counter_sessions(uuid), public.record_payment(uuid, public.payment_method, public.payment_status),
  public.void_redemption(uuid, text), public.list_my_redemptions(int, int), public.mark_notifications_read(uuid[])
  to authenticated;
revoke execute on function public.expire_redemption_sessions() from authenticated;
grant execute on function public.expire_redemption_sessions() to service_role;

revoke execute on all functions in schema private from public;
