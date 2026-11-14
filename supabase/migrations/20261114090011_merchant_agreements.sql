-- Merchant agreement: a business owner signs the current student discount
-- agreement electronically before the business is reviewed and before any offer
-- is submitted. Signatures are append-only evidence: typed name, role, the exact
-- text's SHA-256, time, and the browser's user agent and IP address.
-- The text lives in docs/agreements/; a new version is a new migration.

create table public.merchant_agreement_versions (
  version int primary key check (version >= 1),
  title text not null,
  body text not null,
  body_sha256 text not null,
  is_current boolean not null default false,
  published_at timestamptz not null default now()
);
create unique index merchant_agreement_one_current on public.merchant_agreement_versions (is_current) where is_current;

create table public.merchant_agreements (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  version int not null references public.merchant_agreement_versions (version),
  body_sha256 text not null,
  signer_id uuid not null references public.profiles (id),
  signer_name text not null check (char_length(btrim(signer_name)) between 3 and 120),
  signer_role text not null check (char_length(btrim(signer_role)) between 2 and 80),
  business_legal_name text not null check (char_length(btrim(business_legal_name)) between 2 and 160),
  signed_at timestamptz not null default now(),
  user_agent text check (user_agent is null or char_length(user_agent) <= 400),
  ip_address inet,
  unique (merchant_id, version)
);
create index merchant_agreements_signer on public.merchant_agreements (signer_id);
create index merchant_agreements_version on public.merchant_agreements (version);

create function private.merchant_agreements_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'agreements_are_final' using errcode = 'P0001';
end;
$$;
create trigger merchant_agreements_append_only before update or delete on public.merchant_agreements
  for each row execute function private.merchant_agreements_append_only();
create trigger merchant_agreement_versions_append_only before update of body, body_sha256 or delete on public.merchant_agreement_versions
  for each row execute function private.merchant_agreements_append_only();

alter table public.merchant_agreement_versions enable row level security;
alter table public.merchant_agreements enable row level security;
revoke all on table public.merchant_agreement_versions, public.merchant_agreements from anon, authenticated, service_role;
grant select on table public.merchant_agreement_versions, public.merchant_agreements to authenticated;
create policy "signed-in users read agreement versions" on public.merchant_agreement_versions
  for select to authenticated using (true);
create policy "merchant users read their agreements" on public.merchant_agreements
  for select to authenticated using ((select private.merchant_role(merchant_id)) is not null);
create policy "support reads agreements" on public.merchant_agreements
  for select to authenticated using ((select private.is_staff('support')));

insert into public.merchant_agreement_versions (version, title, body, body_sha256, is_current)
values (1, 'Perqly student discount agreement', $agreement$# Perqly student discount agreement (version 1)

This agreement is between **Perqly** and **the business named below** ("you"). You accept it by signing electronically in your Perqly business account. Your typed name, your role, the date and time, and this version of the text are recorded as your signature.

## 1. What Perqly does
Perqly lists your student offers for students whose school has verified them, and gives you a way to confirm each discount at your counter. Perqly does not sell your goods or services and never takes payment from students on your behalf.

## 2. Your prices
1. You set, for every item you list, its **original price**: the price you normally charge the public.
2. You set the **student price** (or the discount) for each offer yourself.
3. The original price must be genuine. You must not raise it to make a discount look bigger.
4. When your staff confirm a redemption, you honour the student price shown on the confirmed redemption, even if you change your prices afterwards.

## 3. Who gets the student price
1. Only students whose Perqly pass is live on their own phone, and only for the items, branches, schools and dates set on the offer.
2. Your staff check the name and pass code on the student's screen before confirming.
3. You may decline a redemption if the person isn't the student on the pass, didn't buy the item, or chose the wrong item. Choose the reason in Perqly.

## 4. Confirming
Your staff confirm a discount only for a student who is present and has bought the item. You are responsible for what everyone on your Perqly team does in your account.

## 5. Payment and fees
1. Students pay you directly, by cash, mobile money or card. Perqly is not part of the payment.
2. Joining Perqly and listing offers is free during the pilot. Perqly will give you at least 30 days' notice, and ask you to accept a new version of this agreement, before any fee applies.

## 6. Student information
You see a student's first name, school and pass code only to confirm a redemption. You must not copy, keep or use it for anything else.

## 7. Changing or ending offers
You can pause or end an offer at any time in Perqly. Redemptions your staff have already confirmed are still honoured.

## 8. Perqly's checks
Perqly reviews businesses and offers before students see them and may decline, pause or remove an offer, or suspend your account, if it breaks this agreement or misleads students. Perqly will tell you why.

## 9. Your goods and services
You are responsible for the quality, safety and legality of what you sell, and for any tax on it.

## 10. Ending this agreement
Either side can end this agreement at any time. You can do so by asking Perqly to close your business account. Sections 2.4, 6 and 9 continue for redemptions already confirmed.

## 11. Changes
If Perqly changes this agreement, it publishes a new version and asks you to accept it before you can submit new offers.

## 12. Law
This agreement is governed by the laws of Ghana.
$agreement$,
        encode(extensions.digest($agreement$# Perqly student discount agreement (version 1)

This agreement is between **Perqly** and **the business named below** ("you"). You accept it by signing electronically in your Perqly business account. Your typed name, your role, the date and time, and this version of the text are recorded as your signature.

## 1. What Perqly does
Perqly lists your student offers for students whose school has verified them, and gives you a way to confirm each discount at your counter. Perqly does not sell your goods or services and never takes payment from students on your behalf.

## 2. Your prices
1. You set, for every item you list, its **original price**: the price you normally charge the public.
2. You set the **student price** (or the discount) for each offer yourself.
3. The original price must be genuine. You must not raise it to make a discount look bigger.
4. When your staff confirm a redemption, you honour the student price shown on the confirmed redemption, even if you change your prices afterwards.

## 3. Who gets the student price
1. Only students whose Perqly pass is live on their own phone, and only for the items, branches, schools and dates set on the offer.
2. Your staff check the name and pass code on the student's screen before confirming.
3. You may decline a redemption if the person isn't the student on the pass, didn't buy the item, or chose the wrong item. Choose the reason in Perqly.

## 4. Confirming
Your staff confirm a discount only for a student who is present and has bought the item. You are responsible for what everyone on your Perqly team does in your account.

## 5. Payment and fees
1. Students pay you directly, by cash, mobile money or card. Perqly is not part of the payment.
2. Joining Perqly and listing offers is free during the pilot. Perqly will give you at least 30 days' notice, and ask you to accept a new version of this agreement, before any fee applies.

## 6. Student information
You see a student's first name, school and pass code only to confirm a redemption. You must not copy, keep or use it for anything else.

## 7. Changing or ending offers
You can pause or end an offer at any time in Perqly. Redemptions your staff have already confirmed are still honoured.

## 8. Perqly's checks
Perqly reviews businesses and offers before students see them and may decline, pause or remove an offer, or suspend your account, if it breaks this agreement or misleads students. Perqly will tell you why.

## 9. Your goods and services
You are responsible for the quality, safety and legality of what you sell, and for any tax on it.

## 10. Ending this agreement
Either side can end this agreement at any time. You can do so by asking Perqly to close your business account. Sections 2.4, 6 and 9 continue for redemptions already confirmed.

## 11. Changes
If Perqly changes this agreement, it publishes a new version and asks you to accept it before you can submit new offers.

## 12. Law
This agreement is governed by the laws of Ghana.
$agreement$, 'sha256'), 'hex'), true);

-- Whether the business has signed the current version.
create function private.has_current_agreement(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.merchant_agreements a
    join public.merchant_agreement_versions v on v.version = a.version and v.is_current
    where a.merchant_id = p_merchant_id
  );
$$;

create function public.sign_merchant_agreement(
  p_merchant_id uuid,
  p_version int,
  p_signer_name text,
  p_signer_role text,
  p_business_legal_name text,
  p_accept boolean,
  p_user_agent text default null,
  p_ip_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.merchant_agreement_versions;
  v_id uuid;
  v_ip inet;
begin
  if not (coalesce((select private.merchant_role(p_merchant_id)) = 'owner', false) and (select private.has_mfa())) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_accept is not true then raise exception 'acceptance_required' using errcode = 'P0001'; end if;
  select * into v_version from public.merchant_agreement_versions where version = p_version;
  if v_version.version is null or not v_version.is_current then raise exception 'agreement_outdated' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_signer_name, ''))) < 3 then raise exception 'signer_name_required' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_signer_role, ''))) < 2 then raise exception 'signer_role_required' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_business_legal_name, ''))) < 2 then raise exception 'legal_name_required' using errcode = 'P0001'; end if;
  select id into v_id from public.merchant_agreements where merchant_id = p_merchant_id and version = p_version;
  if v_id is not null then return v_id; end if;
  begin
    v_ip := nullif(btrim(coalesce(p_ip_address, '')), '')::inet;
  exception when others then
    v_ip := null;
  end;
  insert into public.merchant_agreements (merchant_id, version, body_sha256, signer_id, signer_name, signer_role, business_legal_name, user_agent, ip_address)
  values (p_merchant_id, p_version, v_version.body_sha256, (select auth.uid()), btrim(p_signer_name), btrim(p_signer_role),
          btrim(p_business_legal_name), left(p_user_agent, 400), v_ip)
  returning id into v_id;
  -- The legal name on the agreement becomes the business's legal name if it had none.
  update public.merchants set legal_name = coalesce(legal_name, btrim(p_business_legal_name)) where id = p_merchant_id;
  perform private.write_audit('merchant.agreement_signed', 'merchant:owner', 'merchant', p_merchant_id, null,
    jsonb_build_object('version', p_version, 'body_sha256', v_version.body_sha256), jsonb_build_object('agreement_id', v_id),
    null, p_merchant_id);
  return v_id;
end;
$$;

-- No review and no new offer without the current agreement.
create function private.require_merchant_agreement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'merchants' then
    if new.status = 'pending_review' and old.status is distinct from 'pending_review' and not private.has_current_agreement(new.id) then
      raise exception 'agreement_required' using errcode = 'P0001';
    end if;
  elsif new.status in ('pending_review', 'active') and old.status in ('draft', 'rejected') and not private.has_current_agreement(new.merchant_id) then
    raise exception 'agreement_required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger merchants_require_agreement before update of status on public.merchants
  for each row execute function private.require_merchant_agreement();
create trigger offers_require_agreement before update of status on public.offers
  for each row execute function private.require_merchant_agreement();

revoke execute on function public.sign_merchant_agreement(uuid, int, text, text, text, boolean, text, text) from public, anon;
grant execute on function public.sign_merchant_agreement(uuid, int, text, text, text, boolean, text, text) to authenticated;

revoke execute on all functions in schema private from public;
