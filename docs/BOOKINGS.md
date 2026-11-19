# Bookings and problem reports

Built locally on branch `campus-c1` (migrations `20261118110000_bookings`, `20261118120000_booking_campus_notifications`, `20261118130000_disputes`). Not pushed or applied anywhere.

## Bookings (product spec §6)

- **Shops** (owners and managers) open **Bookings → Booking hours**: mark a service bookable, add weekly hours per branch (slot length, students per slot) and close days. Products are never bookable.
- **Students** (verified only) see **Book an appointment** on a shop's page when it has bookable services with hours. They pick a service, branch, day and free time, can name the deal they plan to use, and send the request. **Me → Bookings** lists their bookings.
- **The shop** (owners, managers and the branch's cashiers) confirms, declines or proposes another free time that day. The student accepts or declines a proposal. Either side can cancel an open booking. From the start time the shop can mark it done; from 30 minutes after, as missed.
- A booking never counts as a redemption. When the student redeems a deal on the booked service at that branch, from 2 hours before to 12 hours after the booked time, the booking is marked done (a database trigger; `finalize_redemption()` is unchanged).
- Limits: `booking.max_open_per_student` (5) open future bookings; 20 requests a day. The last place in a slot can't be taken twice (advisory lock on the slot).
- Requests not answered before their time show as "Not answered in time" and the daily job cancels them as the system.
- Notifications are in the new **Bookings** settings category: the shop's owners, managers and the branch's cashiers hear about requests; the student hears about confirmations, declines, proposals and cancellations.
- Not built: replacement opening hours for a day in the screens (the database supports them; the screen only closes days), moving a booking to another day.

## Problem reports (disputes)

- A student reports a problem from **My deals** or **My bookings**; a business from **Redemptions** or **Bookings**. Each side has its own list of reasons; one open report per side per redemption or booking; 5 a day.
- **Perqly support** (two-factor) sees **Admin → Problem reports**, writes replies (the reporter sees them) or internal notes (staff only), and sets the status. Resolving or dismissing needs a written decision, which the reporter sees. Voiding a redemption stays a separate, audited action on Admin → Redemptions.
- A student sees their own reports; a business's owners and managers see the reports their business sent. Neither side sees the other's report.
- Reports stay when an account is deleted, without the person.

## Tests

pgTAP `028_bookings_test.sql` (58) and `029_disputes_test.sql` (40); Vitest `tests/bookings.test.ts`, `tests/disputes.test.ts`.
