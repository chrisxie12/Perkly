-- Official logos shipped with the app (public/institution-logos), downloaded on
-- 15 November 2026 from each institution's own website. Sources: docs/INSTITUTION_DIRECTORY.md.
-- Only fills institutions that have no logo yet; an admin upload always wins.
-- Pending (no usable official file): GIMPA, Webster, Radford, EUHS.

update public.institutions i
   set logo_path = 'bundled/' || s.file,
       logo_source_url = s.source,
       logo_status = 'official'
  from (values
    ('gctu', 'gctu.png', 'https://site.gctu.edu.gh/'),
    ('ug', 'ug.svg', 'https://www.ug.edu.gh/'),
    ('upsa', 'upsa.png', 'https://upsa.edu.gh/'),
    ('atu', 'atu.png', 'https://atu.edu.gh/'),
    ('unimac', 'unimac.png', 'https://unimac.edu.gh/'),
    ('rmu', 'rmu.png', 'https://rmu.edu.gh/'),
    ('central-university', 'central-university.png', 'https://central.edu.gh/'),
    ('academic-city', 'academic-city.png', 'https://acity.edu.gh/'),
    ('pentecost-university', 'pentecost-university.png', 'https://pentvars.edu.gh/'),
    ('mug', 'mug.png', 'https://mug.edu.gh/'),
    ('vvu', 'vvu.png', 'https://vvu.edu.gh/'),
    ('wiuc', 'wiuc.png', 'https://wiuc-ghana.edu.gh/'),
    ('iucg', 'iucg.png', 'https://iug.edu.gh/'),
    ('ghanacu', 'ghanacu.png', 'https://ghanacu.edu.gh/'),
    ('fhu', 'fhu.webp', 'https://fhu.edu.gh/')
  ) as s (slug, file, source)
 where i.slug = s.slug
   and i.logo_path is null;
