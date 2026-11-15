-- Shop pages (prototype v2): what a business tells students about itself.
-- Photos, price range, WhatsApp, social accounts, ways to pay, what it offers,
-- and per-branch landmark and Google Maps link. All entered by the business;
-- nothing is invented when a field is empty.

alter table public.merchants
  add column price_range text check (price_range is null or char_length(btrim(price_range)) between 2 and 40),
  add column whatsapp text check (whatsapp is null or whatsapp ~ '^\+?[0-9 ]{9,16}$'),
  add column socials jsonb not null default '{}'::jsonb check (jsonb_typeof(socials) = 'object'),
  add column payment_methods text[] not null default '{}'
    check (payment_methods <@ array['Cash', 'MTN MoMo', 'Telecel Cash', 'AT Money', 'Card']::text[]),
  add column amenities text[] not null default '{}'
    check (amenities <@ array['Dine-in', 'Takeaway', 'Delivery to campus', 'Seating', 'Wi-Fi', 'Toilet', 'Wheelchair access', 'Parking']::text[]);

alter table public.merchant_branches
  add column landmark text check (landmark is null or char_length(btrim(landmark)) between 3 and 120),
  add column maps_url text check (maps_url is null or (char_length(maps_url) <= 500
    and maps_url ~* '^https://([a-z0-9.-]*google\.[a-z.]+/maps|maps\.app\.goo\.gl/|goo\.gl/maps/|maps\.google\.[a-z.]+/)'));

-- Photos ---------------------------------------------------------------------------------
-- Public bucket: shop photos are the business's own marketing. Path {merchant_id}/{uuid}.webp
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merchant-photos', 'merchant-photos', true, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table public.merchant_photos (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  path text not null unique,
  caption text check (caption is null or char_length(caption) <= 140),
  sort_order int not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index merchant_photos_merchant on public.merchant_photos (merchant_id, sort_order);
create index merchant_photos_created_by on public.merchant_photos (created_by);
alter table public.merchant_photos enable row level security;
revoke all on table public.merchant_photos from anon, authenticated, service_role;
grant select on table public.merchant_photos to authenticated;
create policy "merchant users read their photos" on public.merchant_photos
  for select to authenticated using ((select private.merchant_role(merchant_id)) is not null);
create policy "support reads merchant photos" on public.merchant_photos
  for select to authenticated using ((select private.is_staff('support')));

create function private.merchant_photo_merchant(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'
              then split_part(p_name, '/', 1)::uuid end;
$$;
grant execute on function private.merchant_photo_merchant(text) to authenticated;

create policy "managers upload shop photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'merchant-photos' and (select private.can_manage_merchant(private.merchant_photo_merchant(name))));
create policy "managers remove shop photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'merchant-photos' and (select private.can_manage_merchant(private.merchant_photo_merchant(name))));
create policy "managers read their shop photo objects" on storage.objects
  for select to authenticated using (
    bucket_id = 'merchant-photos' and (select private.merchant_role(private.merchant_photo_merchant(name))) is not null);

create function public.add_merchant_photo(p_merchant_id uuid, p_path text, p_caption text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not (select private.can_manage_merchant(p_merchant_id)) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if private.merchant_photo_merchant(p_path) is distinct from p_merchant_id then raise exception 'path_invalid' using errcode = 'P0001'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'merchant-photos' and name = p_path) then
    raise exception 'photo_missing' using errcode = 'P0001';
  end if;
  if (select count(*) from public.merchant_photos where merchant_id = p_merchant_id) >= 10 then
    raise exception 'too_many_photos' using errcode = 'P0001';
  end if;
  insert into public.merchant_photos (merchant_id, path, caption, sort_order, created_by)
  values (p_merchant_id, p_path, nullif(left(btrim(coalesce(p_caption, '')), 140), ''),
          coalesce((select max(sort_order) + 1 from public.merchant_photos where merchant_id = p_merchant_id), 0), (select auth.uid()))
  returning id into v_id;
  perform private.write_audit('merchant.photo_added', 'merchant', 'merchant', p_merchant_id, null, null, jsonb_build_object('photo_id', v_id), null, p_merchant_id);
  return v_id;
end;
$$;

-- Remove, make cover (first), or recaption one photo. Returns the storage path removed, if any.
create function public.edit_merchant_photo(p_photo_id uuid, p_action text, p_caption text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.merchant_photos;
begin
  select * into v from public.merchant_photos where id = p_photo_id;
  if v.id is null or not (select private.can_manage_merchant(v.merchant_id)) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_action = 'remove' then
    delete from public.merchant_photos where id = v.id;
    perform private.write_audit('merchant.photo_removed', 'merchant', 'merchant', v.merchant_id, null, null, jsonb_build_object('photo_id', v.id), null, v.merchant_id);
    return v.path;
  elsif p_action = 'cover' then
    update public.merchant_photos set sort_order = sort_order + 1 where merchant_id = v.merchant_id and id <> v.id;
    update public.merchant_photos set sort_order = 0 where id = v.id;
  elsif p_action = 'caption' then
    update public.merchant_photos set caption = nullif(left(btrim(coalesce(p_caption, '')), 140), '') where id = v.id;
  else
    raise exception 'action_invalid' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

-- Details ---------------------------------------------------------------------------------
create function public.update_shop_details(
  p_merchant_id uuid,
  p_price_range text,
  p_whatsapp text,
  p_socials jsonb,
  p_payment_methods text[],
  p_amenities text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_val text;
  v_clean jsonb := '{}'::jsonb;
begin
  if not (select private.can_manage_merchant(p_merchant_id)) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if exists (select 1 from public.merchants where id = p_merchant_id and status = 'suspended') then
    raise exception 'merchant_suspended' using errcode = 'P0001';
  end if;
  for v_key, v_val in select key, value #>> '{}' from jsonb_each(coalesce(p_socials, '{}'::jsonb)) loop
    if v_key not in ('instagram', 'tiktok', 'facebook', 'x', 'snapchat', 'website') then raise exception 'socials_invalid' using errcode = 'P0001'; end if;
    v_val := btrim(coalesce(v_val, ''));
    if v_val = '' then continue; end if;
    if v_key = 'website' then
      v_val := regexp_replace(v_val, '^https?://', '');
      if v_val !~ '^[a-z0-9.-]+\.[a-z]{2,}(/[^\s]*)?$' or char_length(v_val) > 120 then raise exception 'socials_invalid' using errcode = 'P0001'; end if;
    else
      v_val := ltrim(v_val, '@');
      if v_val !~ '^[A-Za-z0-9._-]{1,40}$' then raise exception 'socials_invalid' using errcode = 'P0001'; end if;
    end if;
    v_clean := v_clean || jsonb_build_object(v_key, v_val);
  end loop;
  begin
    update public.merchants
       set price_range = nullif(btrim(coalesce(p_price_range, '')), ''),
           whatsapp = nullif(btrim(coalesce(p_whatsapp, '')), ''),
           socials = v_clean,
           payment_methods = coalesce(p_payment_methods, '{}'),
           amenities = coalesce(p_amenities, '{}')
     where id = p_merchant_id;
  exception when check_violation then
    raise exception 'details_invalid' using errcode = 'P0001';
  end;
  perform private.write_audit('merchant.shop_details_updated', 'merchant', 'merchant', p_merchant_id, null,
    jsonb_build_object('payments', p_payment_methods, 'amenities', p_amenities), '{}'::jsonb, null, p_merchant_id);
end;
$$;

create function public.set_branch_location(p_branch_id uuid, p_landmark text, p_maps_url text, p_latitude double precision, p_longitude double precision)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_merchant uuid;
begin
  select merchant_id into v_merchant from public.merchant_branches where id = p_branch_id;
  if v_merchant is null or not (select private.can_manage_merchant(v_merchant)) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  begin
    update public.merchant_branches
       set landmark = nullif(btrim(coalesce(p_landmark, '')), ''),
           maps_url = nullif(btrim(coalesce(p_maps_url, '')), ''),
           latitude = coalesce(p_latitude, latitude),
           longitude = coalesce(p_longitude, longitude)
     where id = p_branch_id;
  exception when check_violation then
    raise exception 'map_link_invalid' using errcode = 'P0001';
  end;
end;
$$;

-- The student shop page, with everything the business has filled in.
create or replace function public.get_merchant_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with c as (select * from private.my_campus())
  select jsonb_build_object(
    'id', m.id, 'slug', m.slug, 'display_name', m.display_name, 'description', m.description, 'phone', m.phone,
    'email', m.email, 'website', m.website, 'category', c2.name, 'category_slug', c2.slug, 'category_icon', c2.icon,
    'price_range', m.price_range, 'whatsapp', m.whatsapp, 'socials', m.socials,
    'payment_methods', to_jsonb(m.payment_methods), 'amenities', to_jsonb(m.amenities),
    'today', extract(isodow from now() at time zone 'Africa/Accra')::int,
    'is_favourite', exists (select 1 from public.favourites f where f.student_id = (select auth.uid()) and f.merchant_id = m.id),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.path, 'caption', ph.caption) order by ph.sort_order, ph.created_at)
                        from public.merchant_photos ph where ph.merchant_id = m.id), '[]'::jsonb),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'name', b.name, 'address', concat_ws(', ', b.address_line, b.area, b.city), 'area', b.area,
               'digital_address', b.digital_address, 'landmark', b.landmark, 'maps_url', b.maps_url,
               'opening_hours', b.opening_hours, 'phone', b.phone, 'latitude', b.latitude, 'longitude', b.longitude,
               'distance_m', private.distance_m((select latitude from c), (select longitude from c), b.latitude, b.longitude),
               'campus_name', (select name from c),
               'has_hours', st.has_hours, 'open_now', st.open_now, 'open_until', st.open_until, 'opens_next', st.opens_next,
               'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens', to_char(h.opens, 'HH24:MI'), 'closes', to_char(h.closes, 'HH24:MI')) order by h.weekday)
                                  from public.merchant_branch_hours h where h.branch_id = b.id), '[]'::jsonb))
             order by private.distance_m((select latitude from c), (select longitude from c), b.latitude, b.longitude) nulls last, b.name)
      from public.merchant_branches b
      left join lateral private.branch_open_state(b.id) st on true
      where b.merchant_id = m.id and b.is_active), '[]'::jsonb)
  )
  from public.merchants m join public.merchant_categories c2 on c2.id = m.category_id
  where m.slug = p_slug and m.status = 'approved' and (select auth.uid()) is not null;
$$;

revoke execute on function
  public.add_merchant_photo(uuid, text, text), public.edit_merchant_photo(uuid, text, text),
  public.update_shop_details(uuid, text, text, jsonb, text[], text[]),
  public.set_branch_location(uuid, text, text, double precision, double precision)
  from public, anon;
grant execute on function
  public.add_merchant_photo(uuid, text, text), public.edit_merchant_photo(uuid, text, text),
  public.update_shop_details(uuid, text, text, jsonb, text[], text[]),
  public.set_branch_location(uuid, text, text, double precision, double precision)
  to authenticated;

revoke execute on all functions in schema private from public;
