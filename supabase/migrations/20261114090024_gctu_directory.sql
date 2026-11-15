-- GCTU's directory details, campuses and logo on a brand-new database.
-- Migrations 0021 and 0022 only updated GCTU where it already existed (staging),
-- because GCTU used to come from seed.sql. A new production database runs no
-- seed, so this creates GCTU hidden and unverified like every other institution;
-- an admin lists it after recording GTEC accreditation. On staging this changes
-- nothing that is already set.

insert into public.institutions
  (slug, name, short_name, status, review_mode, institution_type, official_website, city, region, info_source_url, last_checked_at,
   logo_path, logo_source_url, logo_status)
values
  ('gctu', 'Ghana Communication Technology University', 'GCTU', 'inactive', 'institution', 'public', 'https://gctu.edu.gh', 'Accra',
   'Greater Accra', 'https://site.gctu.edu.gh/?p=6537', date '2026-11-15', 'bundled/gctu.png', 'https://site.gctu.edu.gh/', 'official')
on conflict (slug) do update
  set institution_type = coalesce(public.institutions.institution_type, excluded.institution_type),
      official_website = coalesce(public.institutions.official_website, excluded.official_website),
      city = coalesce(public.institutions.city, excluded.city),
      region = coalesce(public.institutions.region, excluded.region),
      info_source_url = coalesce(public.institutions.info_source_url, excluded.info_source_url),
      last_checked_at = coalesce(public.institutions.last_checked_at, excluded.last_checked_at),
      logo_source_url = case when public.institutions.logo_path is null then excluded.logo_source_url else public.institutions.logo_source_url end,
      logo_status = case when public.institutions.logo_path is null then excluded.logo_status else public.institutions.logo_status end,
      logo_path = coalesce(public.institutions.logo_path, excluded.logo_path);

insert into public.campuses (institution_id, name, slug, campus_type, is_primary, address, city, region, source_url, info_status, last_checked_at)
select i.id, s.name, s.slug, s.campus_type, s.is_primary, s.address, 'Accra', 'Greater Accra', s.source, 'confirmed', date '2026-11-15'
from (values
  ('Tesano', 'tesano', 'main', true, 'Off J.A. Kufuor Avenue, beside the Police Training School, Tesano', 'https://site.gctu.edu.gh/?p=6537'),
  ('Abeka', 'abeka', 'satellite', false, null, 'https://site.gctu.edu.gh/?p=2881'),
  ('Nungua Learning Centre', 'nungua', 'learning_centre', false, null, 'https://site.gctu.edu.gh/?p=6537')
) as s (name, slug, campus_type, is_primary, address, source)
join public.institutions i on i.slug = 'gctu'
on conflict (institution_id, name) do nothing;
