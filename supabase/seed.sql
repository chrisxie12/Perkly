-- Local development only. Never run this on production: there, GCTU stays
-- hidden until an admin records its GTEC accreditation (migrations 0021, 0024).
-- No fake merchants, offers or students (docs/PERQLY_DATABASE_ARCHITECTURE.md §10).
--
-- Locally, GCTU is open to students so the app can be tried end to end.
select set_config('perqly.seed_pilot', 'on', false);
update public.institutions set status = 'pilot' where slug = 'gctu' and status = 'inactive';
select set_config('perqly.seed_pilot', '', false);
