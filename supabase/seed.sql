-- Reference data only. No fake merchants, offers or students (docs/PERQLY_DATABASE_ARCHITECTURE.md §10).
--
-- GCTU is the planned pilot institution. An official GCTU pilot requires the
-- institution's approval (decision D14), so no reviewers are appointed here and
-- no student can be verified until GCTU names its reviewers.
-- The student email domain(s), campus coordinates and academic year end are
-- added once GCTU confirms them.
insert into public.institutions (slug, name, short_name, status, review_mode)
values ('gctu', 'Ghana Communication Technology University', 'GCTU', 'pilot', 'institution')
on conflict (slug) do nothing;

insert into public.campuses (institution_id, name)
select id, 'Tesano' from public.institutions where slug = 'gctu'
on conflict (institution_id, name) do nothing;
