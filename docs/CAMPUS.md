# Campus (C1 organisations and posts, C2 comments, C3 events, C4 reminders, C5 admin screens)

Campus lets verified school organisations (SRC, faculties, departments, halls, clubs, societies, associations and the school's administration) publish posts to verified students of the same school. C1 covers organisations, members, posts, images, follows, likes, saves, reports and moderation. C2 adds the comment screens, C3 events and RSVPs, and C5 the admin screen for switches and school agreements. Comments stay switched off until a super admin turns them on.

Decision record and checklist: https://claude.ai/artifact/EbKzyuRcfgvTKFiT1LD4Vp

## Status

C1 to C5 are built and tested locally on branch `campus-c1` (migrations `20261117090000`, `20261118090000`, `20261118100000`, `20261118120000`, `20261118140000`). The GCTU pilot (C6) is a runbook: `docs/CAMPUS_PILOT_GCTU.md`. **Not pushed, not applied to staging or production.** Gate 0 (staging secret, production password, backup restore rehearsal) must be finished before this is merged.

## Switches and limits

Both switches are off (0) in the migration. While off, students and organisers see "Campus isn't open yet", the student Campus link and the admin Campus menu group are hidden, and the public link pages show nothing.

| Setting                                | Default | Changed with                                  |
| -------------------------------------- | ------- | --------------------------------------------- |
| `campus.posts_enabled`                 | 0       | `admin_set_campus_switch` (super admin, aal2) |
| `campus.comments_enabled`              | 0       | `admin_set_campus_switch` (super admin, aal2) |
| `campus.posts_per_org_per_day`         | 10      | `admin_set_setting`                           |
| `campus.comments_per_student_per_hour` | 30      | `admin_set_setting`                           |
| `campus.reports_per_user_per_day`      | 20      | `admin_set_setting`                           |

`admin_set_setting` refuses 0 and refuses keys ending in `_enabled`, so the switches have their own function. Super admins change switches and record or end school agreements on **Admin → Campus switches and agreements** (`/admin/campus/settings`); other Perqly admins can see it but not change it. While Campus is off, the page is linked from Admin → Settings and Campus organisations. The three limits appear on Admin → Settings.

## Who can do what

- **Perqly admins (aal2):** create organisations, verify, suspend or archive them, appoint the first owner. These work while Campus is off so set-up can happen before launch. Pages: `/admin/campus/organisations` (admin), `/admin/campus/moderation` (support). Before launch, reach them by address.
- **Organisation owners and admins:** edit the profile and manage members. Editors write and publish posts. Staff-run kinds (`administration`) are managed only by Perqly admins.
- **Verified students of the same school:** read, follow, like, save and report. Nobody sees another school's posts.
- **Anyone with a link:** a public post or organisation page (`/campus/p/…`, `/campus/o/…`), only for posts marked public, never indexed.

## Badges

- **Verified organisation:** status `verified`.
- **University official:** kind `administration` **and** an active row in `campus_agreements` for the school. Worked out on every read; nothing is suspended automatically when an agreement ends, the badge just stops showing and emergency posting stops.

## Comments (C2)

Shown under a post only while both switches are on. Authors appear by first name; the student sees their own as "You" and can delete it. Organisation editors (on their own posts) and Perqly support can hide any comment. Anyone can report a comment. Limit: `campus.comments_per_student_per_hour`.

## Events (C3)

Events & Conferences (`docs/EVENTS.md`) builds on this: categories, online and hybrid events, registration windows, waitlists, approval, conference sessions and tickets for every registration. The 14-day limit is gone.

Any post except an emergency notice can be made an event on its edit page: start, optional end, venue, optional number of places, and whether RSVPs are open. Times are Ghana time.

- Verified students of the school RSVP from the post, and see **Campus → Events** (upcoming at their school, soonest first, plus the ones they're going to).
- When places run out the event shows as full. The last place can't be taken twice: RSVPs lock the event row.
- RSVPs close when the event ends (or 3 hours after the start when there's no end), or when the organisers close them.
- Organisers see how many are going, not who.
- Removing the event details removes its RSVPs. Nothing about events sends notifications.

## Notifications (C4)

Campus notifications are in the **Campus** settings category. While `campus.push_enabled` is off (the default), they're written with push and email already `skipped`, so they only appear in the app, exactly as in C1. When a super admin switches it on, new Campus notifications join the normal delivery queue and each student's Campus setting decides. No Campus code imports the dispatcher (a test checks this).

**Event reminders:** once a day, after the daily cron has answered, students going to an event that starts 22 to 46 hours later get one reminder with the date and venue. Nothing is queued while Campus is off.

## Images

Bucket `campus-media` (private, 5 MB, JPEG/PNG/WebP). Paths start with the school ID, then the organisation ID. Files are deleted through the Storage API only:

1. Removing a post, archiving an organisation or replacing an image queues the file in `campus_media_purge`, due 30 days later.
2. The daily cron schedules `runCampusMediaCleanup` with `after()`, so it runs once the cron response is sent and can't change it. It stops after 20 seconds or 200 files, retries a file up to 7 times, and never touches other buckets.
3. If the cron uses its full 60 seconds first, the clean-up is cut short and resumes the next day.

## Tests

- pgTAP: `supabase/tests/026_campus_organisations_posts_test.sql` (145 tests; isolation between schools, grants, switches, badges, scheduling, paging, notifications, media queue). The anon allowlist in `005_students_security_test.sql` gained `campus_enabled`, `public_post` and `public_organisation`.
- pgTAP: `supabase/tests/030_campus_reminders_test.sql` (15 tests; reminders and the push switch).
- pgTAP: `supabase/tests/027_campus_admin_events_test.sql` (64 tests; the admin overview, events, RSVPs and capacity, isolation, comments shown and hidden).
- Vitest: `tests/campus-schemas.test.ts`, `tests/campus-media.test.ts`, `tests/campus-cron.test.ts`, `tests/campus-navigation.test.ts`, `tests/campus-events-admin.test.ts`.

## Not built yet

Search beyond the directory and attendee lists for organisers. The GCTU pilot (C6) is a runbook, not code.
