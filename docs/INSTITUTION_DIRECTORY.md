# Accra institution directory

Seeded by `supabase/migrations/20261114090021_institution_directory.sql` on 15 November 2026.
Every detail below came from a page that was opened and read. Nothing was filled in from memory.

## Rules

- Every new institution starts **hidden** with accreditation **not checked**.
- An institution can't be set to Pilot or Active until an admin records GTEC accreditation as confirmed. The database enforces this.
- GTEC accreditation was **not** checked for any institution. gtec.edu.gh couldn't be reached from the build environment. An admin checks each one and records it under Admin → Institutions → Directory and accreditation.
- Campuses marked _not confirmed_ come from secondary sources (news, directories). Students can still pick them once the institution is listed. Confirm them on the official site when you can.
- Logos come only from the institution's own website and are never cropped or recoloured. Each one records the page it came from.

## Institutions and campuses

| Institution                                          | Type     | Official site     | Campuses (primary first)              | Campus status             |
| ---------------------------------------------------- | -------- | ----------------- | ------------------------------------- | ------------------------- |
| Ghana Communication Technology University (GCTU)     | Public   | gctu.edu.gh       | Tesano, Abeka, Nungua Learning Centre | Confirmed                 |
| University of Ghana (UG)                             | Public   | ug.edu.gh         | Legon, Korle-Bu, Accra City           | Confirmed                 |
| University of Professional Studies, Accra (UPSA)     | Public   | upsa.edu.gh       | East Legon                            | Not confirmed             |
| GIMPA                                                | Public   | gimpa.edu.gh      | Greenhill, Tema                       | Confirmed                 |
| Accra Technical University (ATU)                     | Public   | atu.edu.gh        | Barnes Road                           | Not confirmed             |
| University of Media, Arts and Communication (UniMAC) | Public   | unimac.edu.gh     | IJ Ringway (Osu), North Dzorwulu      | Confirmed, no primary set |
| Regional Maritime University (RMU)                   | See note | rmu.edu.gh        | Nungua                                | Confirmed                 |
| Central University                                   | Private  | central.edu.gh    | Miotso, Christ Temple                 | Confirmed                 |
| Academic City University (ACity)                     | Private  | acity.edu.gh      | Haatso                                | Confirmed                 |
| Pentecost University                                 | Private  | pentvars.edu.gh   | Sowutuom                              | Confirmed                 |
| Methodist University Ghana (MUG)                     | Private  | mug.edu.gh        | Dansoman, Tema                        | Confirmed                 |
| Valley View University (VVU)                         | Private  | vvu.edu.gh        | Oyibi                                 | Confirmed                 |
| Wisconsin International University College (WIUC)    | Private  | wiuc-ghana.edu.gh | North Legon                           | Confirmed                 |
| Islamic University College, Ghana (IUCG)             | Private  | iug.edu.gh        | East Legon (Adjiringanor)             | Confirmed                 |
| Webster University Ghana                             | Private  | Not confirmed     | East Legon                            | Not confirmed             |
| Radford University College                           | Private  | Not confirmed     | East Legon                            | Not confirmed             |
| Ghana Christian University College (GhanaCU)         | Private  | ghanacu.edu.gh    | Amrahia                               | Not confirmed             |
| Family Health University (FHU)                       | Private  | fhu.edu.gh        | Teshie                                | Not confirmed             |
| Entrance University of Health Sciences (EUHS)        | Private  | Not found         | Spintex Road (School of Medicine)     | Not confirmed             |

### Notes to check

- **RMU** was founded by five West African states. Check how GTEC lists it before relying on the public label.
- **Webster** announced a teach-out of the Ghana campus by December 2023. Keep it hidden unless GTEC shows it operating.
- **IUCG**: the website title now reads "Islamic University of Ghana", but its logo still says "Islamic University College, Ghana". Check the current name on GTEC before listing.
- **Radford** and **EUHS**: no official website confirmed.

## Logos

Downloaded on 15 November 2026 from each institution's own website. They ship with the app in `public/institution-logos/`, and migration 0022 links each one to its institution. Three very large files (Central, GhanaCU, GCTU) were scaled down to 800 px wide. Nothing was cropped or recoloured. If an admin uploads a logo under Admin → Institutions → Official logo, it replaces the bundled one.

| Institution                | File                     | Logo source page           | Note                                                                                                                                              |
| -------------------------- | ------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| GCTU                       | gctu.png                 | https://site.gctu.edu.gh/  | Crest. The header logo is white text, made for dark backgrounds.                                                                                  |
| UG                         | ug.svg                   | https://www.ug.edu.gh/     | Checked: no scripts.                                                                                                                              |
| UPSA                       | upsa.png                 | https://upsa.edu.gh/       |                                                                                                                                                   |
| ATU                        | atu.png                  | https://atu.edu.gh/        |                                                                                                                                                   |
| UniMAC                     | unimac.png               | https://unimac.edu.gh/     |                                                                                                                                                   |
| RMU                        | rmu.png                  | https://rmu.edu.gh/        | The site only serves a JPEG; saved as PNG with no other change.                                                                                   |
| Central University         | central-university.png   | https://central.edu.gh/    |                                                                                                                                                   |
| ACity                      | academic-city.png        | https://acity.edu.gh/      | The version for light backgrounds.                                                                                                                |
| Pentecost University       | pentecost-university.png | https://pentvars.edu.gh/   |                                                                                                                                                   |
| MUG                        | mug.png                  | https://mug.edu.gh/        |                                                                                                                                                   |
| VVU                        | vvu.png                  | https://vvu.edu.gh/        |                                                                                                                                                   |
| WIUC                       | wiuc.png                 | https://wiuc-ghana.edu.gh/ |                                                                                                                                                   |
| IUCG                       | iucg.png                 | https://iug.edu.gh/        |                                                                                                                                                   |
| GhanaCU                    | ghanacu.png              | https://ghanacu.edu.gh/    |                                                                                                                                                   |
| FHU                        | fhu.webp                 | https://fhu.edu.gh/        |                                                                                                                                                   |
| **GIMPA**                  | —                        | —                          | **Pending.** The site only has white-text logos for its dark header, and they're unreadable on a white tile. Ask GIMPA for a full-colour version. |
| **Webster, Radford, EUHS** | —                        | —                          | **Pending.** No confirmed official website.                                                                                                       |
