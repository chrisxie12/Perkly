-- Institution directory: Greater Accra tertiary institutions and their campuses.
--
-- Institutions are the parent organisation; campuses belong to exactly one.
-- New institutions are seeded HIDDEN (status 'inactive'): an admin records the
-- accreditation check (GTEC) and the official logo, then lists them. Nothing
-- here claims accreditation: every seeded row starts 'unverified'.
-- Sources were checked on 2026-11-15 and are stored per row.

-- Institutions -----------------------------------------------------------------------------
alter table public.institutions
  add column institution_type text check (institution_type in ('public', 'private')),
  add column official_website text check (official_website is null or official_website ~ '^https://[a-z0-9.-]+\.[a-z]{2,}(/.*)?$'),
  add column city text check (city is null or char_length(btrim(city)) between 2 and 60),
  add column region text check (region is null or char_length(btrim(region)) between 2 and 60),
  add column info_source_url text check (info_source_url is null or info_source_url ~ '^https://'),
  add column last_checked_at date,
  add column accreditation_status text not null default 'unverified'
    check (accreditation_status in ('unverified', 'confirmed', 'not_found', 'closed')),
  add column accreditation_note text check (accreditation_note is null or char_length(accreditation_note) <= 300),
  add column accreditation_checked_at date,
  add column logo_status text not null default 'pending' check (logo_status in ('pending', 'official')),
  add column logo_source_url text check (logo_source_url is null or logo_source_url ~ '^https://');

comment on column public.institutions.accreditation_status is
  'confirmed only after an admin checks GTEC; unverified rows cannot be newly listed for students.';
comment on column public.institutions.logo_status is 'official = uploaded from the institution''s own website (logo_source_url).';

-- No two institutions with the same name, whatever the spacing or case.
create unique index institutions_name_unique on public.institutions (lower(btrim(name)));

-- Listing a hidden institution for students requires a confirmed accreditation check.
-- (GCTU was already listed as the pilot before this rule; it isn't re-checked here.)
create function private.guard_institution_listing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- perqly.seed_pilot is set only by supabase/seed.sql to recreate the existing GCTU pilot locally.
  if new.status in ('pilot', 'active')
     and (tg_op = 'INSERT' or old.status = 'inactive')
     and new.accreditation_status <> 'confirmed'
     and coalesce(current_setting('perqly.seed_pilot', true), '') <> 'on' then
    raise exception 'accreditation_unconfirmed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger institutions_guard_listing before insert or update of status on public.institutions
  for each row execute function private.guard_institution_listing();

-- Campuses ---------------------------------------------------------------------------------
alter table public.campuses
  add column slug text check (slug is null or slug ~ '^[a-z0-9-]{2,64}$'),
  add column campus_type text not null default 'satellite' check (campus_type in ('main', 'satellite', 'city', 'learning_centre')),
  add column address text check (address is null or char_length(btrim(address)) between 3 and 200),
  add column city text check (city is null or char_length(btrim(city)) between 2 and 60),
  add column region text check (region is null or char_length(btrim(region)) between 2 and 60),
  add column is_primary boolean not null default false,
  add column source_url text check (source_url is null or source_url ~ '^https://'),
  add column info_status text not null default 'unverified' check (info_status in ('confirmed', 'unverified')),
  add column last_checked_at date;
create unique index campuses_slug_unique on public.campuses (institution_id, slug) where slug is not null;
create unique index campuses_one_primary on public.campuses (institution_id) where is_primary;

-- Logos ------------------------------------------------------------------------------------
-- Public bucket: logos appear in the student picker. Path {institution_id}/logo.{svg|png|webp}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('institution-logos', 'institution-logos', true, 524288, array['image/svg+xml', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create function private.institution_logo_owner(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logo-[0-9]{10,13}\.(svg|png|webp)$'
              then split_part(p_name, '/', 1)::uuid end;
$$;
grant execute on function private.institution_logo_owner(text) to authenticated;

create policy "admins upload institution logos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'institution-logos' and private.institution_logo_owner(name) is not null and (select private.is_staff('admin')));
create policy "admins remove institution logos" on storage.objects
  for delete to authenticated using (bucket_id = 'institution-logos' and (select private.is_staff('admin')));
create policy "admins read institution logo objects" on storage.objects
  for select to authenticated using (bucket_id = 'institution-logos' and (select private.is_staff('admin')));

-- Admin functions ---------------------------------------------------------------------------
create function public.admin_update_institution_directory(
  p_institution_id uuid,
  p_institution_type text,
  p_official_website text,
  p_city text,
  p_region text,
  p_info_source_url text,
  p_accreditation_status text,
  p_accreditation_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.institutions;
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into v_before from public.institutions where id = p_institution_id for update;
  if v_before.id is null then raise exception 'institution_not_found' using errcode = 'P0001'; end if;
  begin
    update public.institutions
       set institution_type = nullif(p_institution_type, ''),
           official_website = nullif(btrim(coalesce(p_official_website, '')), ''),
           city = nullif(btrim(coalesce(p_city, '')), ''),
           region = nullif(btrim(coalesce(p_region, '')), ''),
           info_source_url = nullif(btrim(coalesce(p_info_source_url, '')), ''),
           accreditation_status = coalesce(nullif(p_accreditation_status, ''), 'unverified'),
           accreditation_note = nullif(btrim(coalesce(p_accreditation_note, '')), ''),
           accreditation_checked_at = case when coalesce(nullif(p_accreditation_status, ''), 'unverified') <> v_before.accreditation_status
                                           then current_date else accreditation_checked_at end,
           last_checked_at = current_date
     where id = p_institution_id;
  exception when check_violation then
    raise exception 'directory_invalid' using errcode = 'P0001';
  end;
  perform private.write_audit('institution.directory_updated', 'platform:admin', 'institution', p_institution_id,
    to_jsonb(v_before), (select to_jsonb(i) from public.institutions i where id = p_institution_id), '{}'::jsonb, p_institution_id);
end;
$$;

create function public.admin_set_institution_logo(p_institution_id uuid, p_path text, p_source_url text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if private.institution_logo_owner(p_path) is distinct from p_institution_id then raise exception 'path_invalid' using errcode = 'P0001'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'institution-logos' and name = p_path) then
    raise exception 'logo_missing' using errcode = 'P0001';
  end if;
  if p_source_url is null or p_source_url !~ '^https://' then raise exception 'logo_source_required' using errcode = 'P0001'; end if;
  select logo_path into v_old from public.institutions where id = p_institution_id for update;
  update public.institutions
     set logo_path = p_path, logo_source_url = btrim(p_source_url), logo_status = 'official', last_checked_at = current_date
   where id = p_institution_id;
  perform private.write_audit('institution.logo_set', 'platform:admin', 'institution', p_institution_id, null, null,
    jsonb_build_object('path', p_path, 'source', p_source_url), p_institution_id);
  return v_old; -- the caller removes the replaced file
end;
$$;

create function public.admin_update_campus_details(
  p_campus_id uuid,
  p_campus_type text,
  p_address text,
  p_city text,
  p_region text,
  p_source_url text,
  p_info_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_inst uuid;
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select institution_id into v_inst from public.campuses where id = p_campus_id for update;
  if v_inst is null then raise exception 'campus_not_found' using errcode = 'P0001'; end if;
  begin
    update public.campuses
       set campus_type = coalesce(nullif(p_campus_type, ''), 'satellite'),
           address = nullif(btrim(coalesce(p_address, '')), ''),
           city = nullif(btrim(coalesce(p_city, '')), ''),
           region = nullif(btrim(coalesce(p_region, '')), ''),
           source_url = nullif(btrim(coalesce(p_source_url, '')), ''),
           info_status = coalesce(nullif(p_info_status, ''), 'unverified'),
           last_checked_at = current_date
     where id = p_campus_id;
  exception when check_violation then
    raise exception 'campus_details_invalid' using errcode = 'P0001';
  end;
  perform private.write_audit('campus.details_updated', 'platform:admin', 'campus', p_campus_id, null, null, '{}'::jsonb, v_inst);
end;
$$;

create function public.admin_set_primary_campus(p_campus_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_inst uuid;
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select institution_id into v_inst from public.campuses where id = p_campus_id for update;
  if v_inst is null then raise exception 'campus_not_found' using errcode = 'P0001'; end if;
  update public.campuses set is_primary = false where institution_id = v_inst and is_primary and id <> p_campus_id;
  update public.campuses set is_primary = true, is_active = true where id = p_campus_id;
  perform private.write_audit('campus.primary_set', 'platform:admin', 'campus', p_campus_id, null, null, '{}'::jsonb, v_inst);
end;
$$;

-- Institution requests ("my institution isn't listed") -----------------------------------
create table public.institution_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles (id) on delete cascade,
  institution_name text not null check (char_length(btrim(institution_name)) between 3 and 160),
  campus_name text check (campus_name is null or char_length(btrim(campus_name)) between 2 and 120),
  city text check (city is null or char_length(btrim(city)) between 2 and 60),
  status text not null default 'pending' check (status in ('pending', 'added', 'declined')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 300),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index institution_requests_status on public.institution_requests (status, created_at);
create index institution_requests_requested_by on public.institution_requests (requested_by);
create index institution_requests_handled_by on public.institution_requests (handled_by);
alter table public.institution_requests enable row level security;
revoke all on table public.institution_requests from anon, authenticated, service_role;
grant select on table public.institution_requests to authenticated;
create policy "students read their own institution requests" on public.institution_requests
  for select to authenticated using (requested_by = (select auth.uid()));
create policy "support reads institution requests" on public.institution_requests
  for select to authenticated using ((select private.is_staff('support')));

-- A request is only a request: it never lists or approves an institution.
create function public.request_institution(p_institution_name text, p_campus_name text default null, p_city text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = 'P0001'; end if;
  perform private.check_rate_limit('institution.request', 3, interval '1 day');
  begin
    insert into public.institution_requests (requested_by, institution_name, campus_name, city)
    values ((select auth.uid()), btrim(p_institution_name), nullif(btrim(coalesce(p_campus_name, '')), ''), nullif(btrim(coalesce(p_city, '')), ''))
    returning id into v_id;
  exception when check_violation then
    raise exception 'request_invalid' using errcode = 'P0001';
  end;
  return v_id;
end;
$$;

create function public.admin_handle_institution_request(p_request_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff('admin')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_status not in ('added', 'declined') then raise exception 'status_invalid' using errcode = 'P0001'; end if;
  update public.institution_requests
     set status = p_status, admin_note = nullif(left(btrim(coalesce(p_note, '')), 300), ''),
         handled_by = (select auth.uid()), handled_at = now()
   where id = p_request_id and status = 'pending';
  if not found then raise exception 'request_not_found' using errcode = 'P0001'; end if;
end;
$$;

revoke execute on function
  public.admin_update_institution_directory(uuid, text, text, text, text, text, text, text),
  public.admin_set_institution_logo(uuid, text, text),
  public.admin_update_campus_details(uuid, text, text, text, text, text, text),
  public.admin_set_primary_campus(uuid),
  public.request_institution(text, text, text),
  public.admin_handle_institution_request(uuid, text, text)
  from public, anon;
grant execute on function
  public.admin_update_institution_directory(uuid, text, text, text, text, text, text, text),
  public.admin_set_institution_logo(uuid, text, text),
  public.admin_update_campus_details(uuid, text, text, text, text, text, text),
  public.admin_set_primary_campus(uuid),
  public.request_institution(text, text, text),
  public.admin_handle_institution_request(uuid, text, text)
  to authenticated;

-- Seed: Greater Accra institutions and campuses (checked 2026-11-15) -----------------------
-- Every new institution is hidden and 'unverified' until an admin confirms GTEC status.
insert into public.institutions (slug, name, short_name, status, institution_type, official_website, city, region, info_source_url, last_checked_at, accreditation_note)
select slug, name, short_name, 'inactive'::public.institution_status, institution_type, website, city, 'Greater Accra', source, date '2026-11-15', note
from (values
  ('gctu', 'Ghana Communication Technology University', 'GCTU', 'public', 'https://gctu.edu.gh', 'Accra', 'https://site.gctu.edu.gh/?p=6537', null),
  ('ug', 'University of Ghana', 'UG', 'public', 'https://www.ug.edu.gh', 'Accra', 'https://lawlibrary.ug.edu.gh/node/38', null),
  ('upsa', 'University of Professional Studies, Accra', 'UPSA', 'public', 'https://upsa.edu.gh', 'Accra', 'https://whed.net/institutions/IAU-020438', null),
  ('gimpa', 'Ghana Institute of Management and Public Administration', 'GIMPA', 'public', 'https://gimpa.edu.gh', 'Accra', 'https://gimpa.edu.gh/', null),
  ('atu', 'Accra Technical University', 'ATU', 'public', 'https://atu.edu.gh', 'Accra', 'https://atu.edu.gh/about-atu-overview/', null),
  ('unimac', 'University of Media, Arts and Communication', 'UniMAC', 'public', 'https://unimac.edu.gh', 'Accra', 'https://gij.edu.gh/?p=997', null),
  ('rmu', 'Regional Maritime University', 'RMU', 'public', 'https://rmu.edu.gh', 'Accra', 'https://rmu.edu.gh/?p=6256',
     'Founded by five West African states; check how GTEC lists it before showing a public/private label.'),
  ('central-university', 'Central University', 'CU', 'private', 'https://central.edu.gh', 'Accra', 'https://webcms.central.edu.gh/?p=31', null),
  ('academic-city', 'Academic City University', 'ACity', 'private', 'https://acity.edu.gh', 'Accra', 'https://acity.edu.gh/visit/', null),
  ('pentecost-university', 'Pentecost University', 'PU', 'private', 'https://pentvars.edu.gh', 'Accra', 'https://pentvars.edu.gh/category/news/page/2', null),
  ('mug', 'Methodist University Ghana', 'MUG', 'private', 'https://mug.edu.gh', 'Accra', 'https://mug.edu.gh/2025-2026-admissions/', null),
  ('vvu', 'Valley View University', 'VVU', 'private', 'https://vvu.edu.gh', 'Oyibi', 'https://vvu.edu.gh/contact_us.php', null),
  ('wiuc', 'Wisconsin International University College, Ghana', 'WIUC', 'private', 'https://wiuc-ghana.edu.gh', 'Accra', 'https://wiuc-ghana.edu.gh/?p=2316', null),
  ('iucg', 'Islamic University College, Ghana', 'IUCG', 'private', 'https://iug.edu.gh', 'Accra', 'https://iug.edu.gh/?p=24', null),
  ('webster-ghana', 'Webster University Ghana', 'Webster', 'private', null, 'Accra', 'https://citinewsroom.com/?p=993743',
     'Webster announced the Ghana campus would move to teach-out by December 2023. Keep hidden unless GTEC shows it operating.'),
  ('radford', 'Radford University College', 'RUC', 'private', null, 'Accra', 'https://en.wikipedia.org/wiki/Radford_University_College',
     'Official website not confirmed. Location from secondary sources only.'),
  ('ghanacu', 'Ghana Christian University College', 'GhanaCU', 'private', 'https://ghanacu.edu.gh', 'Accra', 'https://whed.net/institutions/IAU-006646', null),
  ('fhu', 'Family Health University', 'FHU', 'private', 'https://fhu.edu.gh', 'Accra', 'https://gna.org.gh/2024/12/family-health-university-college-earns-presidential-charter/', null),
  ('euhs', 'Entrance University of Health Sciences', 'EUHS', 'private', null, 'Accra', 'https://chs.ug.edu.gh/node/203',
     'Official website not found. Campus details from news reports only.')
) as seed (slug, name, short_name, institution_type, website, city, source, note)
where seed.slug <> 'gctu' or exists (select 1 from public.institutions where slug = 'gctu')
on conflict (slug) do update
  set institution_type = coalesce(public.institutions.institution_type, excluded.institution_type),
      official_website = coalesce(public.institutions.official_website, excluded.official_website),
      city = coalesce(public.institutions.city, excluded.city),
      region = coalesce(public.institutions.region, excluded.region),
      info_source_url = coalesce(public.institutions.info_source_url, excluded.info_source_url),
      last_checked_at = coalesce(public.institutions.last_checked_at, excluded.last_checked_at),
      accreditation_note = coalesce(public.institutions.accreditation_note, excluded.accreditation_note);

insert into public.campuses (institution_id, name, slug, campus_type, is_primary, address, city, region, source_url, info_status, last_checked_at)
select i.id, s.name, s.slug, s.campus_type, s.is_primary, s.address, s.city, 'Greater Accra', s.source, s.info_status, date '2026-11-15'
from (values
  ('gctu', 'Tesano', 'tesano', 'main', true, 'Off J.A. Kufuor Avenue, beside the Police Training School, Tesano', 'Accra', 'https://site.gctu.edu.gh/?p=6537', 'confirmed'),
  ('gctu', 'Abeka', 'abeka', 'satellite', false, null, 'Accra', 'https://site.gctu.edu.gh/?p=2881', 'confirmed'),
  ('gctu', 'Nungua Learning Centre', 'nungua', 'learning_centre', false, null, 'Accra', 'https://site.gctu.edu.gh/?p=6537', 'confirmed'),
  ('ug', 'Legon', 'legon', 'main', true, 'JB Danquah Road, off J.J. Rawlings Avenue, Legon', 'Accra', 'https://lawlibrary.ug.edu.gh/node/38', 'confirmed'),
  ('ug', 'Korle-Bu', 'korle-bu', 'satellite', false, 'College of Health Sciences, Korle-Bu', 'Accra', 'https://lawlibrary.ug.edu.gh/node/38', 'confirmed'),
  ('ug', 'Accra City', 'accra-city', 'city', false, 'Central business district', 'Accra', 'https://lawlibrary.ug.edu.gh/node/38', 'confirmed'),
  ('upsa', 'East Legon', 'east-legon', 'main', true, 'East Legon', 'Accra', 'https://whed.net/institutions/IAU-020438', 'unverified'),
  ('gimpa', 'Greenhill', 'greenhill', 'main', true, 'Greenhill, Achimota', 'Accra', 'https://gimpa.edu.gh/', 'confirmed'),
  ('gimpa', 'Tema', 'tema', 'satellite', false, null, 'Tema', 'https://nweb.gimpa.edu.gh/schools/business-school/how-to-apply/', 'confirmed'),
  ('atu', 'Barnes Road', 'barnes-road', 'main', true, 'Barnes Road, central business district', 'Accra', 'https://atu.edu.gh/about-atu-overview/', 'unverified'),
  ('unimac', 'Institute of Journalism, Ringway (Osu)', 'ij-ringway', 'satellite', false, 'Ringway, Osu', 'Accra', 'https://gij.edu.gh/?p=997', 'confirmed'),
  ('unimac', 'North Dzorwulu', 'north-dzorwulu', 'satellite', false, 'North Dzorwulu', 'Accra', 'https://gij.edu.gh/?p=997', 'confirmed'),
  ('rmu', 'Nungua', 'nungua', 'main', true, 'Nungua', 'Accra', 'https://rmu.edu.gh/?p=6256', 'confirmed'),
  ('central-university', 'Miotso', 'miotso', 'main', true, 'Miotso, near Dawhenya, off the Accra–Aflao Road', 'Tema', 'https://webcms.central.edu.gh/?p=31', 'confirmed'),
  ('central-university', 'Christ Temple', 'christ-temple', 'city', false, '69 Ring Road West', 'Accra', 'https://webcms.central.edu.gh/?p=31', 'confirmed'),
  ('academic-city', 'Haatso', 'haatso', 'main', true, 'Property 279-302, Agbogba, Haatso', 'Accra', 'https://acity.edu.gh/visit.php', 'confirmed'),
  ('pentecost-university', 'Sowutuom', 'sowutuom', 'main', true, 'Sowutuom', 'Accra', 'https://pentvars.edu.gh/category/news/page/2', 'confirmed'),
  ('mug', 'Dansoman', 'dansoman', 'main', true, 'Opposite Wesley Grammar School, Dansoman', 'Accra', 'https://mug.edu.gh/2025-2026-admissions/', 'confirmed'),
  ('mug', 'Tema', 'tema', 'satellite', false, null, 'Tema', 'https://mug.edu.gh/2025-2026-admissions/', 'confirmed'),
  ('vvu', 'Oyibi', 'oyibi', 'main', true, 'Mile 19, Adenta–Dodowa Road, Oyibi', 'Oyibi', 'https://vvu.edu.gh/contact_us.php', 'confirmed'),
  ('wiuc', 'North Legon', 'north-legon', 'main', true, 'Opposite the Legon Botanical Gardens, North Legon', 'Accra', 'https://wiuc-ghana.edu.gh/?p=2316', 'confirmed'),
  ('iucg', 'East Legon (Adjiringanor)', 'east-legon', 'main', true, 'Adjiringanor, East Legon', 'Accra', 'https://iug.edu.gh/?p=24', 'confirmed'),
  ('webster-ghana', 'East Legon', 'east-legon', 'main', true, 'Luanda Close, off Lagos Avenue, East Legon', 'Accra', 'https://citinewsroom.com/?p=993743', 'unverified'),
  ('radford', 'East Legon', 'east-legon', 'main', true, 'Lagos Avenue, East Legon', 'Accra', 'https://en.wikipedia.org/wiki/Radford_University_College', 'unverified'),
  ('ghanacu', 'Amrahia', 'amrahia', 'main', true, 'Adenta–Dodowa Road, Amrahia', 'Accra', 'https://www.ghanaweb.com/GhanaHomePage/regional/Ghana-Christian-University-College-celebrates-15th-matriculation-2006166', 'unverified'),
  ('fhu', 'Teshie', 'teshie', 'main', true, 'Opposite the Kofi Annan International Peacekeeping Training Centre, Teshie', 'Accra', 'https://gna.org.gh/2024/12/family-health-university-college-earns-presidential-charter/', 'unverified'),
  ('euhs', 'Spintex Road (School of Medicine)', 'spintex', 'satellite', false, 'Near the Coca-Cola Roundabout, Spintex Road', 'Accra', 'https://atinkaonline.com/veep-to-inaugurate-new-medical-institutions-in-accra-tomorrow/?amp=1', 'unverified')
) as s (inst, name, slug, campus_type, is_primary, address, city, source, info_status)
join public.institutions i on i.slug = s.inst
on conflict (institution_id, name) do update
  set slug = coalesce(public.campuses.slug, excluded.slug),
      campus_type = excluded.campus_type,
      is_primary = public.campuses.is_primary or excluded.is_primary,
      address = coalesce(public.campuses.address, excluded.address),
      city = coalesce(public.campuses.city, excluded.city),
      region = coalesce(public.campuses.region, excluded.region),
      source_url = coalesce(public.campuses.source_url, excluded.source_url),
      info_status = excluded.info_status,
      last_checked_at = coalesce(public.campuses.last_checked_at, excluded.last_checked_at);

revoke execute on all functions in schema private from public;
