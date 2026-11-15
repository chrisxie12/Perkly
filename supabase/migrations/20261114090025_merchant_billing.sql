-- Merchant billing (decision D18): businesses pay Perqly a monthly subscription
-- through Paystack (card or mobile money), or an admin records a payment made
-- another way. New businesses get their first month free.
--
-- Billing is OFF until a super admin switches it on and sets the fee, so the
-- pilot stays free (D9). While off, nothing here changes what anyone sees.
--
-- Money itself never touches this database: the app server confirms each
-- Paystack payment with Paystack before calling confirm_merchant_payment.

-- Settings --------------------------------------------------------------------
insert into private.app_settings (key, value) values
  ('billing.enabled', '0'),
  ('billing.monthly_fee_pesewas', '0'),
  ('billing.trial_days', '30'),
  ('billing.grace_days', '7')
on conflict (key) do nothing;

create function private.billing_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.setting_int('billing.enabled', 0) = 1 and private.setting_int('billing.monthly_fee_pesewas', 0) > 0;
$$;

-- State per business ------------------------------------------------------------
create table public.merchant_billing (
  merchant_id uuid primary key references public.merchants (id) on delete cascade,
  -- The free month. Set when the business is approved while billing is on, or
  -- when billing is switched on for businesses approved during the pilot.
  trial_ends_at timestamptz,
  paid_until timestamptz,
  on_hold boolean not null default false,
  held_at timestamptz,
  trial_reminded_at timestamptz,
  due_notified_for timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger merchant_billing_updated_at before update on public.merchant_billing
  for each row execute function private.set_updated_at();
alter table public.merchant_billing enable row level security;
revoke all on table public.merchant_billing from anon, authenticated, service_role;

create table public.merchant_payments (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  reference text not null unique check (reference ~ '^PQ-[A-Za-z0-9-]{8,60}$'),
  method text not null check (method in ('paystack', 'manual')),
  amount_pesewas int not null check (amount_pesewas > 0),
  months smallint not null default 1 check (months between 1 and 12),
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'abandoned')),
  provider_channel text check (provider_channel is null or char_length(provider_channel) <= 40),
  provider_transaction_id text check (provider_transaction_id is null or char_length(provider_transaction_id) <= 80),
  period_start timestamptz,
  period_end timestamptz,
  note text check (note is null or char_length(note) <= 300),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index merchant_payments_merchant on public.merchant_payments (merchant_id, created_at desc);
create index merchant_payments_created_by on public.merchant_payments (created_by);
alter table public.merchant_payments enable row level security;
revoke all on table public.merchant_payments from anon, authenticated, service_role;

create function private.billing_covered_until(p_merchant_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(b.trial_ends_at, b.paid_until) from public.merchant_billing b where b.merchant_id = p_merchant_id;
$$;

-- off | none (not approved) | trial | active | due | on_hold
create function private.billing_state(p_merchant_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not private.billing_enabled() then 'off'
    when m.status <> 'approved' then 'none'
    when b.on_hold then 'on_hold'
    when b.paid_until is not null and b.paid_until > now() then 'active'
    when b.trial_ends_at is not null and b.trial_ends_at > now() then 'trial'
    else 'due'
  end
  from public.merchants m
  left join public.merchant_billing b on b.merchant_id = m.id
  where m.id = p_merchant_id;
$$;

-- First month free: starts at approval when billing is on.
create function private.on_merchant_approved_billing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    insert into public.merchant_billing (merchant_id, trial_ends_at)
    values (new.id, case when private.billing_enabled() then now() + make_interval(days => private.setting_int('billing.trial_days', 30)) end)
    on conflict (merchant_id) do nothing;
  end if;
  return null;
end;
$$;
create trigger merchant_billing_on_approval after update of status on public.merchants
  for each row execute function private.on_merchant_approved_billing();

-- Every business approved before this migration gets a billing row (no free month yet).
insert into public.merchant_billing (merchant_id)
select id from public.merchants where status = 'approved'
on conflict (merchant_id) do nothing;

-- A business on hold can't put deals live until it pays.
create function private.guard_offer_billing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and old.status is distinct from 'active'
     and private.billing_enabled()
     and exists (select 1 from public.merchant_billing b where b.merchant_id = new.merchant_id and b.on_hold) then
    raise exception 'billing_overdue' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger offers_billing_guard before update of status on public.offers
  for each row execute function private.guard_offer_billing();

-- Extends cover from today or from the end of current cover, whichever is later,
-- lifts any hold and puts back the deals the hold paused.
create function private.apply_merchant_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.merchant_payments;
  v_start timestamptz;
  v_merchant public.merchants;
begin
  select * into v_pay from public.merchant_payments where id = p_payment_id for update;
  insert into public.merchant_billing (merchant_id) values (v_pay.merchant_id) on conflict (merchant_id) do nothing;
  select greatest(now(), coalesce(private.billing_covered_until(v_pay.merchant_id), now())) into v_start;

  update public.merchant_payments
     set status = 'success', paid_at = coalesce(paid_at, now()), period_start = v_start,
         period_end = v_start + make_interval(months => v_pay.months)
   where id = p_payment_id;
  update public.merchant_billing
     set paid_until = v_start + make_interval(months => v_pay.months), on_hold = false, held_at = null
   where merchant_id = v_pay.merchant_id;
  update public.offers set status = 'active', status_reason = null
   where merchant_id = v_pay.merchant_id and status = 'paused' and status_reason = 'billing_overdue';

  select * into v_merchant from public.merchants where id = v_pay.merchant_id;
  perform private.notify_business_team(v_pay.merchant_id, 'merchant.payment_received', 'Payment received',
    'Thank you. ' || v_merchant.display_name || ' is covered until '
      || to_char((v_start + make_interval(months => v_pay.months)) at time zone 'Africa/Accra', 'FMDD FMMonth YYYY') || '.',
    '/merchant/billing');
end;
$$;

-- What the business (or support) sees -------------------------------------------
create function public.get_merchant_billing(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_covered timestamptz;
begin
  if not ((select private.merchant_role(p_merchant_id)) in ('owner', 'manager') or (select private.is_staff('support'))) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_covered := private.billing_covered_until(p_merchant_id);
  return jsonb_build_object(
    'enabled', private.billing_enabled(),
    'state', private.billing_state(p_merchant_id),
    'monthly_fee_pesewas', private.setting_int('billing.monthly_fee_pesewas', 0),
    'trial_days', private.setting_int('billing.trial_days', 30),
    'grace_days', private.setting_int('billing.grace_days', 7),
    'trial_ends_at', (select trial_ends_at from public.merchant_billing where merchant_id = p_merchant_id),
    'paid_until', (select paid_until from public.merchant_billing where merchant_id = p_merchant_id),
    'covered_until', v_covered,
    'hold_on', case when v_covered is null then null else v_covered + make_interval(days => private.setting_int('billing.grace_days', 7)) end,
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'reference', p.reference, 'method', p.method, 'amount_pesewas', p.amount_pesewas, 'months', p.months,
        'status', p.status, 'channel', p.provider_channel, 'period_start', p.period_start, 'period_end', p.period_end,
        'created_at', p.created_at, 'paid_at', p.paid_at) order by p.created_at desc)
      from (select * from public.merchant_payments where merchant_id = p_merchant_id and status <> 'pending'
            order by created_at desc limit 24) p), '[]'::jsonb)
  );
end;
$$;

-- Owner or manager starts a payment; the server sends them to Paystack.
create function public.start_merchant_payment(p_merchant_id uuid)
returns table (reference text, amount_pesewas int, email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ref text;
  v_fee int := private.setting_int('billing.monthly_fee_pesewas', 0);
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if (select private.merchant_role(p_merchant_id)) not in ('owner', 'manager') then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if not private.billing_enabled() then raise exception 'billing_off' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.merchants where id = p_merchant_id and status = 'approved') then
    raise exception 'merchant_not_approved' using errcode = 'P0001';
  end if;
  perform private.check_rate_limit('billing.start', 10, interval '1 hour', v_uid::text);

  v_ref := 'PQ-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.merchant_payments (merchant_id, reference, method, amount_pesewas, months, created_by)
  values (p_merchant_id, v_ref, 'paystack', v_fee, 1, v_uid);

  reference := v_ref;
  amount_pesewas := v_fee;
  email := (select u.email from auth.users u where u.id = v_uid);
  return next;
end;
$$;

-- Server only, after Paystack confirms the payment. Safe to call twice.
create function public.confirm_merchant_payment(
  p_reference text, p_amount_pesewas int, p_currency text, p_transaction_id text, p_channel text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.merchant_payments;
begin
  select * into v_pay from public.merchant_payments where reference = p_reference for update;
  if v_pay.id is null then raise exception 'payment_not_found' using errcode = 'P0001'; end if;
  if v_pay.status = 'success' then return 'already_confirmed'; end if;
  if p_currency is distinct from 'GHS' or p_amount_pesewas is null or p_amount_pesewas < v_pay.amount_pesewas then
    update public.merchant_payments set status = 'failed', note = 'Amount or currency did not match' where id = v_pay.id;
    perform private.write_audit('billing.payment_mismatch', 'system', 'merchant_payment', v_pay.id, null,
      jsonb_build_object('reference', p_reference, 'amount_pesewas', p_amount_pesewas, 'currency', p_currency), '{}'::jsonb, null, v_pay.merchant_id);
    return 'mismatch';
  end if;
  update public.merchant_payments
     set provider_transaction_id = left(p_transaction_id, 80), provider_channel = left(p_channel, 40)
   where id = v_pay.id;
  perform private.apply_merchant_payment(v_pay.id);
  perform private.write_audit('billing.payment_received', 'system', 'merchant_payment', v_pay.id, null,
    jsonb_build_object('reference', p_reference, 'amount_pesewas', p_amount_pesewas, 'channel', p_channel), '{}'::jsonb, null, v_pay.merchant_id);
  return 'confirmed';
end;
$$;

-- Server only: Paystack says the payment failed or was abandoned.
create function public.close_merchant_payment(p_reference text, p_status text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.merchant_payments set status = p_status
   where reference = p_reference and status = 'pending' and p_status in ('failed', 'abandoned');
$$;

-- Admin records a payment made another way (cash, bank transfer, MoMo to the Perqly number).
create function public.admin_record_manual_payment(p_merchant_id uuid, p_months int, p_amount_ghs numeric, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_months is null or p_months not between 1 and 12 or p_amount_ghs is null or p_amount_ghs <= 0 or p_amount_ghs > 100000 then
    raise exception 'payment_invalid' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.merchants where id = p_merchant_id) then raise exception 'merchant_not_found' using errcode = 'P0001'; end if;
  insert into public.merchant_payments (merchant_id, reference, method, amount_pesewas, months, note, created_by)
  values (p_merchant_id, 'PQ-M-' || replace(gen_random_uuid()::text, '-', ''), 'manual', round(p_amount_ghs * 100)::int, p_months,
          left(nullif(btrim(coalesce(p_note, '')), ''), 300), (select auth.uid()))
  returning id into v_id;
  perform private.apply_merchant_payment(v_id);
  perform private.write_audit('billing.manual_payment', 'platform:admin', 'merchant_payment', v_id, null,
    jsonb_build_object('months', p_months, 'amount_ghs', p_amount_ghs, 'note', p_note), '{}'::jsonb, null, p_merchant_id);
end;
$$;

-- Super admin: switch billing on or off, set the fee.
create function public.admin_set_billing(p_enabled boolean, p_fee_ghs numeric, p_trial_days int, p_grace_days int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_was_on boolean := private.billing_enabled();
begin
  if not (select private.is_staff('super_admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_enabled is null or p_fee_ghs is null or p_fee_ghs < 0 or p_fee_ghs > 100000
     or p_trial_days is null or p_trial_days not between 0 and 365 or p_grace_days is null or p_grace_days not between 0 and 60 then
    raise exception 'billing_settings_invalid' using errcode = 'P0001';
  end if;
  if p_enabled and p_fee_ghs = 0 then raise exception 'billing_fee_required' using errcode = 'P0001'; end if;

  select jsonb_object_agg(key, value) into v_before from private.app_settings where key like 'billing.%';
  update private.app_settings set value = to_jsonb(case when p_enabled then 1 else 0 end), updated_by = (select auth.uid()) where key = 'billing.enabled';
  update private.app_settings set value = to_jsonb(round(p_fee_ghs * 100)::int), updated_by = (select auth.uid()) where key = 'billing.monthly_fee_pesewas';
  update private.app_settings set value = to_jsonb(p_trial_days), updated_by = (select auth.uid()) where key = 'billing.trial_days';
  update private.app_settings set value = to_jsonb(p_grace_days), updated_by = (select auth.uid()) where key = 'billing.grace_days';

  -- Switching on: every approved business without a free month gets one from today.
  if p_enabled and not v_was_on then
    insert into public.merchant_billing (merchant_id) select id from public.merchants where status = 'approved'
    on conflict (merchant_id) do nothing;
    update public.merchant_billing b set trial_ends_at = now() + make_interval(days => p_trial_days)
     where b.trial_ends_at is null and b.paid_until is null
       and exists (select 1 from public.merchants m where m.id = b.merchant_id and m.status = 'approved');
  end if;
  -- Switching off lifts every hold and puts paused deals back.
  if not p_enabled then
    update public.offers o set status = 'active', status_reason = null
     where o.status = 'paused' and o.status_reason = 'billing_overdue';
    update public.merchant_billing set on_hold = false, held_at = null where on_hold;
  end if;

  perform private.write_audit('platform.billing_changed', 'platform:super_admin', 'app_setting', null, v_before,
    jsonb_build_object('enabled', p_enabled, 'fee_ghs', p_fee_ghs, 'trial_days', p_trial_days, 'grace_days', p_grace_days));
end;
$$;

create function public.admin_get_billing_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'enabled', private.setting_int('billing.enabled', 0) = 1,
    'monthly_fee_pesewas', private.setting_int('billing.monthly_fee_pesewas', 0),
    'trial_days', private.setting_int('billing.trial_days', 30),
    'grace_days', private.setting_int('billing.grace_days', 7));
end;
$$;

-- Daily job ---------------------------------------------------------------------
create function public.run_billing_cycle()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grace interval := make_interval(days => private.setting_int('billing.grace_days', 7));
  v_fee text := to_char(private.setting_int('billing.monthly_fee_pesewas', 0) / 100.0, 'FM999990.00');
  r record;
  v_reminded int := 0;
  v_due int := 0;
  v_held int := 0;
begin
  if not private.billing_enabled() then return jsonb_build_object('enabled', false); end if;

  -- Free month ends in 7 days or less: one reminder.
  for r in
    select b.merchant_id, b.trial_ends_at, m.display_name from public.merchant_billing b join public.merchants m on m.id = b.merchant_id
    where m.status = 'approved' and b.paid_until is null and b.trial_reminded_at is null
      and b.trial_ends_at > now() and b.trial_ends_at <= now() + interval '7 days'
  loop
    perform private.notify_business_team(r.merchant_id, 'merchant.trial_ending', 'Your free month ends soon',
      'It ends on ' || to_char(r.trial_ends_at at time zone 'Africa/Accra', 'FMDD FMMonth YYYY') || '. After that Perqly is GH₵'
        || v_fee || ' a month. Pay any time to keep your deals live.', '/merchant/billing');
    update public.merchant_billing set trial_reminded_at = now() where merchant_id = r.merchant_id;
    v_reminded := v_reminded + 1;
  end loop;

  -- Cover has run out: one notice per lapse.
  for r in
    select b.merchant_id, greatest(b.trial_ends_at, b.paid_until) as covered, m.display_name
    from public.merchant_billing b join public.merchants m on m.id = b.merchant_id
    where m.status = 'approved' and not b.on_hold
      and greatest(b.trial_ends_at, b.paid_until) <= now()
      and b.due_notified_for is distinct from greatest(b.trial_ends_at, b.paid_until)
  loop
    perform private.notify_business_team(r.merchant_id, 'merchant.payment_due', 'Payment due',
      'Pay GH₵' || v_fee || ' by ' || to_char((r.covered + v_grace) at time zone 'Africa/Accra', 'FMDD FMMonth')
        || ' to keep ' || r.display_name || '''s deals live.', '/merchant/billing');
    update public.merchant_billing set due_notified_for = r.covered where merchant_id = r.merchant_id;
    v_due := v_due + 1;
  end loop;

  -- Grace is over: pause live deals until payment.
  for r in
    select b.merchant_id, m.display_name from public.merchant_billing b join public.merchants m on m.id = b.merchant_id
    where m.status = 'approved' and not b.on_hold
      and greatest(b.trial_ends_at, b.paid_until) + v_grace <= now()
  loop
    update public.merchant_billing set on_hold = true, held_at = now() where merchant_id = r.merchant_id;
    update public.offers set status = 'paused', status_reason = 'billing_overdue'
     where merchant_id = r.merchant_id and status = 'active';
    perform private.notify_business_team(r.merchant_id, 'merchant.billing_hold', r.display_name || '''s deals are paused',
      'Students can''t see your deals until your Perqly payment is made. They come back as soon as you pay.', '/merchant/billing');
    perform private.write_audit('billing.hold', 'system', 'merchant', r.merchant_id, null, null, '{}'::jsonb, null, r.merchant_id);
    v_held := v_held + 1;
  end loop;

  return jsonb_build_object('enabled', true, 'trial_reminders', v_reminded, 'due_notices', v_due, 'holds', v_held);
end;
$$;

-- Grants --------------------------------------------------------------------------
revoke execute on function
  public.get_merchant_billing(uuid), public.start_merchant_payment(uuid),
  public.confirm_merchant_payment(text, int, text, text, text), public.close_merchant_payment(text, text),
  public.admin_record_manual_payment(uuid, int, numeric, text), public.admin_set_billing(boolean, numeric, int, int),
  public.admin_get_billing_settings(), public.run_billing_cycle()
from public, anon;
grant execute on function
  public.get_merchant_billing(uuid), public.start_merchant_payment(uuid),
  public.admin_record_manual_payment(uuid, int, numeric, text), public.admin_set_billing(boolean, numeric, int, int),
  public.admin_get_billing_settings()
to authenticated;
revoke execute on function
  public.confirm_merchant_payment(text, int, text, text, text), public.close_merchant_payment(text, text), public.run_billing_cycle()
from authenticated;
grant execute on function
  public.confirm_merchant_payment(text, int, text, text, text), public.close_merchant_payment(text, text), public.run_billing_cycle()
to service_role;

revoke execute on all functions in schema private from public;
