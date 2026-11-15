begin;
select plan(4);

select is(
  (select count(*)::int from public.institutions where logo_path like 'bundled/%' and logo_status = 'official'),
  (select count(*)::int from public.institutions where slug in ('ug','upsa','atu','unimac','rmu','central-university','academic-city',
     'pentecost-university','mug','vvu','wiuc','iucg','ghanacu','fhu','gctu')),
  -- GCTU is included: the migration covers it in production and seed.sql covers it locally.
  'every institution with an official file has its bundled logo');

select ok(
  not exists (select 1 from public.institutions where logo_path like 'bundled/%' and (logo_source_url is null or logo_source_url !~ '^https://')),
  'bundled logos record their https source');

select is(
  (select logo_status from public.institutions where slug = 'gimpa'), 'pending',
  'GIMPA stays pending');

select is(
  (select logo_path from public.institutions where slug = 'ug'), 'bundled/ug.svg',
  'UG points at the official SVG');

select * from finish();
rollback;
