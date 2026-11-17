# Campus (C1: organisations and posts)

Campus lets verified school organisations (SRC, faculties, departments, halls, clubs, societies, associations and the school's administration) publish posts to verified students of the same school. C1 covers organisations, members, posts, images, follows, likes, saves, reports and moderation. Comments are built in the database but switched off, and there is no comment form yet.

Decision record and checklist: https://claude.ai/artifact/EbKzyuRcfgvTKFiT1LD4Vp

## Status

Built and tested locally on branch `campus-c1`. **Not pushed, not applied to staging or production.** Gate 0 (staging secret, production password, backup restore rehearsal) must be finished before this is merged.

## Switches and limits

Both switches are off (0) in the migration. While off, students and organisers see "Campus isn't open yet", the student Campus link and the admin Campus menu group are hidden, and the public link pages show nothing.

| Setting                                | Default | Changed with                                  |
| -------------------------------------- | ------- | --------------------------------------------- |
| `campus.posts_enabled`                 | 0       | `admin_set_campus_switch` (super admin, aal2) |
| `campus.comments_enabled`              | 0       | `admin_set_campus_switch` (super admin, aal2) |
| `campus.posts_per_org_per_day`         | 10      | `admin_set_setting`                           |
| `campus.comments_per_student_per_hour` | 30      | `admin_set_setting`                           |
| `campus.reports_per_user_per_day`      | 20      | `admin_set_setting`                           |

`admin_set_setting` refuses 0 and refuses keys ending in `_enabled`, so the switches have their own function. There is no screen for switches or agreements yet; they are set by calling the functions.

## Who can do what

- **Perqly admins (aal2):** create organisations, verify, suspend or archive them, appoint the first owner. These work while Campus is off so set-up can happen before launch. Pages: `/admin/campus/organisations` (admin), `/admin/campus/moderation` (support). Before launch, reach them by address.
- **Organisation owners and admins:** edit the profile and manage members. Editors write and publish posts. Staff-run kinds (`administration`) are managed only by Perqly admins.
- **Verified students of the same school:** read, follow, like, save and report. Nobody sees another school's posts.
- **Anyone with a link:** a public post or organisation page (`/campus/p/…`, `/campus/o/…`), only for posts marked public, never indexed.

## Badges

- **Verified organisation:** status `verified`.
- **University official:** kind `administration` **and** an active row in `campus_agreements` for the school. Worked out on every read; nothing is suspended automatically when an agreement ends, the badge just stops showing and emergency posting stops.

## Notifications

Campus writes rows to `public.notifications` through `private.notify_campus` with push and email already marked `skipped`, so the existing delivery queue never sends them. No Campus code imports the dispatcher (a test checks this). Emergencies follow each student's preferences like everything else.

## Images

Bucket `campus-media` (private, 5 MB, JPEG/PNG/WebP). Paths start with the school ID, then the organisation ID. Files are deleted through the Storage API only:

1. Removing a post, archiving an organisation or replacing an image queues the file in `campus_media_purge`, due 30 days later.
2. The daily cron schedules `runCampusMediaCleanup` with `after()`, so it runs once the cron response is sent and can't change it. It stops after 20 seconds or 200 files, retries a file up to 7 times, and never touches other buckets.
3. If the cron uses its full 60 seconds first, the clean-up is cut short and resumes the next day.

## Tests

- pgTAP: `supabase/tests/026_campus_organisations_posts_test.sql` (145 tests; isolation between schools, grants, switches, badges, scheduling, paging, notifications, media queue). The anon allowlist in `005_students_security_test.sql` gained `campus_enabled`, `public_post` and `public_organisation`.
- Vitest: `tests/campus-schemas.test.ts`, `tests/campus-media.test.ts`, `tests/campus-cron.test.ts`, `tests/campus-navigation.test.ts`.

## Not in C1

Comment form, switch and agreement screens, search beyond the directory, events and RSVPs, the C11 notification category, and the later steps C2–C6 in the roadmap.
