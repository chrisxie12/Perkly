# Events & Conferences

Events grow out of Campus events (`docs/CAMPUS.md`, C3): an event is still a Campus post with a `campus_events` row beside it, registrations are still `event_rsvps`, and tickets are still `event_tickets`. There is no second events system. Plan and decisions: https://claude.ai/artifact/SniYzY4RziSCG1K4rohJWM

## Status

**PR A (database and backend)** is on branch `events-pr-a`. It is not merged and not applied to staging or production. PR B adds the admin and organiser screens, PR C the student screens, and PR D the frequent reminder runner (pg_cron + pg_net).

Migrations, in order:

1. `20261127090000_events_schema.sql`: tables and columns, plus the backfill.
2. `20261127100000_events_core.sql`: status, permissions, registration, tickets and check-in, and management.
3. `20261127110000_events_conference.sql`: sessions, speakers, sponsors and duplicating.
4. `20261127120000_events_reports.sql`: lists, analytics, export, announcements and reminders.

Rollback: `supabase/rollback/events_pr_a_down.sql` is never run automatically (see its header).

## Decisions

- **Perqly-run events** belong to an organisation of the new kind `perqly`, one per school, created by `admin_perqly_organisation`.
  - It has no members, so it hands no organisation powers to anyone. A trigger refuses members.
  - Only Perqly admins act for it.
  - It never shows "University official". That badge belongs to `administration`, which is the school's own administration and needs an agreement.
- **Status:**
  - The lifecycle is stored: `draft`, `published`, `cancelled`, `completed` or `archived`.
  - What students see is worked out on every read by `private.event_status`: `published` (registration not open yet), `registration_open`, `full`, `registration_closed`, `cancelled`, `completed` or `archived`. There is also a phase: `upcoming`, `live` or `ended`.
  - An event with no end is over 3 hours after it starts.
- **Length:** there is no 14-day limit any more; the sanity cap is 366 days. Sessions sit inside the event, each up to 24 hours long.
- **Paid events** are still paid at the door. Free events get a ticket too (price 0), because the ticket is what the door scans.
- **Registrations are never deleted.**
  - Cancelling sets `cancelled`. Old RSVPs became `confirmed`, and checked-in ones became `attended`.
  - `remove_event_details` and `delete_event` refuse once anyone has registered.
- **Waitlist:** first come, first served by `waitlisted_at` (clock time), then user id. Promotion happens in the same transaction that frees the place.
- **Who can do what:**

| Role                         | Can do                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Perqly admin (two-factor)    | Everything, at every school, also before Campus launches.                            |
| Organisation owner and admin | Edit the event, see the attendee list, approve or decline, export, add door helpers. |
| Editor                       | Edit the event and see counts only.                                                  |
| Door helper (`event_staff`)  | Scan and search names at the door for one event.                                     |
| Student                      | Discover, register, cancel, and see their own ticket.                                |

- **Audience:**
  - `school` is the default.
  - `listed` adds schools, campuses or organisation members.
  - `all_verified` covers every verified student.
  - Only Perqly admins can reach beyond the event's own school.
- **Tickets:**
  - The QR holds `PQT1:` followed by 32 hex characters. That is the first 16 bytes of an HMAC-SHA256 of the ticket id, made with a per-database key in `private.app_settings` (`events.ticket_qr_key`), which is created in the database and never put in git.
  - `event_tickets.secret_hash` stores only its SHA-256, and the door finds tickets by that hash.
  - The 8-character code still works, typed or from old QRs. It is now made with `gen_random_bytes`.
  - Check-in locks the ticket row, so a second scanner gets `already_checked_in`.
  - Merchant redemption is untouched.
- **Online links** are returned only to the student's own confirmed (or attended) registration, from `online_link_lead_minutes` before the start (default 60) until the end.
- **Notifications** use `campus.event_*` kinds, so they follow the Campus category, the student's Campus setting and the `campus.push_enabled` switch:
  - registered, pending, approved, rejected, waitlisted, promoted
  - cancelled, rescheduled, venue changed, agenda changed, announcement, reminder
- **Reminders:**
  - The schedule is 7 days, 24 hours and 1 hour before, each switchable per event.
  - `event_reminders_sent` makes each one once only.
  - Rescheduling clears it, so reminders go again for the new time.
  - Students get a reminder only if they registered before its moment.
  - The existing daily cron (`queue_event_reminders`) sends the 24-hour and 7-day ones. `queue_due_event_reminders` (every 10 minutes, PR D) sends all three.
- **Audit:** every management action, decision, export and announcement writes to `audit_logs` (`entity_type = 'campus_event'`).

## Countdown

`src/lib/events/countdown.ts` is pure and runs on the device from the real UTC start and end. `src/lib/events/use-now.ts` is one shared 1-second clock. It returns null on the server and during hydration, so there is no mismatch, and it stops when the last countdown unmounts.

| Time to start      | Units shown             | Card label                                                                      |
| ------------------ | ----------------------- | ------------------------------------------------------------------------------- |
| More than 24 hours | days, hours, minutes    | "Starts in N days" or "Starts tomorrow" (calendar days in the event's timezone) |
| Under 24 hours     | hours, minutes, seconds | "Starts in N hours"                                                             |
| Under an hour      | minutes, seconds        | "Starts in N minutes", or "Starting now" in the last minute                     |

After the start it shows "Happening now", then "Event ended". Cancelled events show "Cancelled".

## Tests

- **pgTAP:**
  - `045_events_registration_test.sql`
  - `046_events_management_test.sql`
  - `047_events_door_test.sql`
  - `048_events_reports_test.sql`
  - Existing suites 026, 027 (updated for the new rules: no 14-day limit; event details can't be wiped once people registered), 030, 032 and 042 still pass.
- **Upgrade test:** `scripts/db/test-events-upgrade.sh` builds the database up to 20261126, makes events, RSVPs and tickets with the old functions, applies the Events migrations, and checks that nothing was lost and old tickets still work. It runs locally; CI runs the pgTAP suites.
- **Vitest:** `tests/events-countdown.test.ts`.
