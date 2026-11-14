# Perqly user flows

**Phase 1: screen-by-screen experience for students, merchants, institution reviewers and admins**

|                     |                                                                                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | Approved 2026-11-14. Sign-in screens are being implemented (roadmap step 1.2)                                                                                                                                         |
| Date                | 2026-11-14                                                                                                                                                                                                            |
| Companion documents | [Product specification](./PERQLY_PRODUCT_SPECIFICATION.md) · [QR redemption](./PERQLY_QR_REDEMPTION_SPECIFICATION.md) · [Database](./PERQLY_DATABASE_ARCHITECTURE.md) · [Roadmap](./PERQLY_IMPLEMENTATION_ROADMAP.md) |

## Conventions for every screen

- **One app, four areas.** `/student`, `/merchant`, `/institution` and `/admin` each have their own layout and a **server-side role guard**. The guard redirects; the database (RLS and functions) is the actual boundary.
- **Mobile first.** Student and cashier screens are designed for a 360 px phone. Merchant management, institution and admin screens also work well on desktop.
- **Every list has an empty, loading and error state.** Empty states say what to do next. Errors say what happened and how to fix it, without apologising.
- **Money** is shown as `GH₵64.00`. Discounts are shown as regular price struck through, student price, and "Save GH₵16.00".
- **Never "Paid".** Redemption screens say "Discount redeemed" and "Amount to pay the merchant".
- **Private routes are never cached** by the service worker. Offline, they show the offline page.
- **Brand:** Perqly Blue `#0066FF` for primary actions, Perk Orange `#FF6B35` with ink text for highlights, Bricolage Grotesque headings, Figtree body text.

## Shared: sign-up and sign-in

| Route            | Screen         | Content and actions                                                                                                                                                                    |
| ---------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/register`      | Create account | Full name, email, "I'm a student" or "I run a business". Sends a 6-digit email code (decision D6: email first; phone later). Links to terms and privacy                                |
| `/login`         | Sign in        | Email → 6-digit code (optional password later). "Didn't get it?" resend after 60 seconds, max 3 an hour                                                                                |
| `/login/code`    | Enter code     | 6 boxes, paste-friendly, auto-submit. Errors: wrong code (attempts left), expired code                                                                                                 |
| `/login/mfa`     | Two-factor     | Required for platform staff, institution admins and merchant owners: TOTP code, or set-up with a QR and recovery codes on first sign-in                                                |
| `/auth/callback` | (no UI)        | Completes sign-in and sends the user to the right area: student → `/student`; merchant user → `/merchant`; reviewer → `/institution`; staff → `/admin`. Several roles → an area picker |

---

## Student

### S1. Onboarding (`/student/welcome`, first sign-in only)

1. **Welcome:** "Real student prices at shops near campus." Three short cards: get verified, find a deal, scan at the counter.
2. **Choose your school:** list of `pilot`/`active` institutions (GCTU only in the pilot), then campus.
3. **Install prompt:** Android shows a one-tap install button when the browser offers it; iPhone shows the Share → Add to Home Screen guide. Skippable.
4. **Notifications:** asked only after install on iPhone, and only with a reason ("We'll tell you when your school approves you and when a merchant answers a booking"). Skippable.
5. Ends on the marketplace with a verification banner.

### S2. Registration details (`/student/profile/setup`)

First name (shown to merchants), profile photo (required before the first redemption, because cashiers compare it with your face), programme, level, expected graduation year. Saved with `update_student_profile()`.

### S3. Verification (`/student/verify`)

Before applying, the student saves their school on the profile (S13). The application then asks for:

| Item                         | Content                                                                                                 | System                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Student ID number            | As printed on the card                                                                                  | Checked for format; never written to logs                                                                                                   |
| Photo of the student ID card | Rear camera or upload; compressed to WebP (JPEG on older iPhones) in the browser, location data removed | Uploaded straight to `verification-documents/{student}/{application}/id-card.*`, which only the student and the school's reviewers can read |
| Selfie                       | Front camera                                                                                            | Same, `selfie.*`                                                                                                                            |
| Institutional email          | **Optional.** If one is saved on the profile, a ticked box includes it, marked confirmed or not         | Snapshot on the application, for the reviewer's information only                                                                            |
| Notice                       | "GCTU's appointed reviewers will see these details and photos… deleted 30 days after the decision."     |                                                                                                                                             |
| **Send to GCTU for review**  |                                                                                                         | `submit_verification_application()`                                                                                                         |

The first photo creates a draft application (`start_verification_application()`), so there's never more than one open application.

**Status** (same page, and as a card on the student home):

| State                   | What the student sees                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Not verified            | "Get verified by GCTU to book and redeem student discounts. You can browse offers and prices now." **Start verification** |
| Pending review          | Date sent, the student ID they used, **Withdraw application**                                                             |
| Changes requested       | The reviewer's note, and the form with only what's needed to replace                                                      |
| Not approved (rejected) | The reason in plain words and any note; the form to apply again                                                           |
| Approved                | "Verified by GCTU until {date}."                                                                                          |
| Expired                 | "Your verification has expired." The form to renew (also available in the last 30 days)                                   |
| Suspended               | "Your account is suspended. Contact Perqly support."                                                                      |

Until approved, the marketplace works but **Book** and **Scan** are replaced by "Get verified to use this", and the database refuses both.

### S4. Marketplace (`/student`)

- **Header:** greeting, campus, "You've saved GH₵X" chip (link to savings), scan button.
- **Verification banner** if not verified.
- **Search bar** (opens S5).
- **Category chips** (horizontal scroll).
- **Sections:** Near campus, New on Perqly, Takes bookings, Your favourites (if any), By category. "Popular at GCTU" is added once there are enough redemptions to be meaningful.
- **Merchant card:** logo, name, category, distance from campus, open/closed now, best discount ("Up to 20% off"), favourite heart.
- **Empty state (no merchants yet):** "Perqly is signing up businesses around {campus}. Check back soon." Never placeholder merchants.

### S5. Search and filters (`/student/search`)

- One box matching merchant names, categories, services and products, with typo tolerance.
- **Filters** (bottom sheet): category, distance (500 m, 1 km, 3 km, any), discount type (percentage, amount off, set student price), minimum discount, open now, takes bookings.
- **Sort:** nearest, biggest saving, newest.
- **Results:** merchant cards; matching items listed under each merchant ("Haircut and beard trim, GH₵80 → GH₵64").
- **No results:** "No matches for '{query}'. Try a category instead." with category chips.

### S6. Merchant details (`/student/merchants/[slug]`)

- Cover image, logo, name, category, favourite button, share button.
- **Branches:** each with address, digital address, distance, "Open now · closes 18:00", hours, call button, directions (opens the phone's map app).
- **Offers** (top): offer cards with item, regular price, student price, saving, validity and "Book" (bookable services) or "Redeem in store".
- **Services** and **Products** tabs: the full catalogue with regular prices; items with an offer show the student price.
- **Reviews** (later step): average rating and recent reviews.
- **Report a problem** link.

### S7. Offer details (`/student/offers/[id]`)

- Item name and image, merchant and branches where it's valid.
- Price block: regular price struck through, **student price**, "Save GH₵16.00 (20%)".
- Validity: "Until 31 Dec 2026" or "Ongoing".
- Conditions (merchant's text).
- Limits: "1 use per month · you have 1 left", and "Limited: 12 left" when a cap is close.
- Actions: **Book a time** (bookable service, verified only), or "How to redeem": visit, get the service or buy the item, scan the shop's Perqly code, the merchant confirms, you confirm, you pay the student price.

### S8. Booking

| Route                       | Screen               | Content                                                                                                                                                         |
| --------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/student/book/[serviceId]` | Choose branch        | Only branches where the service is bookable                                                                                                                     |
| (same, step 2)              | Choose date and time | 14-day date strip; free slots from `get_available_slots()`; unavailable days greyed out. Empty: "No free times in the next 2 weeks. Try another branch."        |
| (same, step 3)              | Review               | Service, branch, date and time, regular and student price ("Discount is applied at the shop when you scan"), optional note to the merchant. **Request booking** |
| `/student/bookings/[id]`    | Booking status       | Status timeline (Requested → Confirmed → Completed), branch details, directions, add to calendar (.ics), cancel                                                 |
| `/student/bookings`         | My bookings          | Tabs: Upcoming, Past, Cancelled                                                                                                                                 |

States shown on the booking: `pending` "Waiting for {merchant} to confirm"; `confirmed` "Confirmed for Tue 18 Nov, 10:30"; `reschedule_requested` "{merchant} suggested Wed 19 Nov, 14:00" with **Accept** and **Decline**; `cancelled` with who cancelled and why; `completed`; `no_show` "Marked as a no-show by {merchant}" with "Report a problem".

### S9. QR scanner (`/student/scan`)

- Full-screen camera view with a square guide and torch toggle.
- Permission not yet given: an explanation screen before the browser prompt ("Perqly uses your camera only to read shop codes").
- Permission denied: steps to allow the camera in Chrome or Safari settings, plus **Enter code instead**.
- **Enter code instead:** 8-character input, auto-uppercased, dashes ignored.
- Optional location: "Share location to help prevent fraud" (asked once; not required).
- Not verified: the scanner is replaced by the verification prompt.
- Detects a Perqly link → calls `open_redemption_session()` → goes to S10. Anything else: "That's not a Perqly code."

### S10. Redemption and confirmation (`/student/redeem/[sessionId]`)

Detailed behaviour is in the [QR redemption specification](./PERQLY_QR_REDEMPTION_SPECIFICATION.md#4-step-by-step).

1. **Pick what you bought:** merchant and branch header, eligible offers with item, regular price, student price and uses left. Today's confirmed booking at this branch is preselected if it matches. Timer: "Choose within 4:52".
2. **Review and live pass:** original price, student discount, **amount to pay the merchant**, the live pass (photo, first name, institution, 4-digit code, reference, running clock, colour of the day, time left). Status: "Show this to the cashier. Waiting for them to confirm." Buttons: **Change item** (until the merchant confirms), **Cancel**.
3. **Your confirmation:** after the merchant confirms, the screen changes: "{merchant} confirmed. Confirm you're paying GH₵64.00 for Haircut and beard trim." **Confirm**.
4. **Done:** large check, "Discount redeemed. You saved GH₵16.00.", "Pay {merchant} GH₵64.00 directly", reference, time. Buttons: **Done**, **View receipt**, and later **Rate your visit**.
5. **Ended states:** rejected (with the merchant's reason and "Report a problem"), expired ("Scan again to start over"), cancelled.

### S11. Savings and history

| Route                       | Content                                                                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/student/savings`          | Total saved (large), number of redemptions, this month vs last month, savings by category and by month (simple bar chart), recent redemptions                                                                      |
| `/student/redemptions`      | List: merchant, item, date, saved amount, status (Completed / Voided)                                                                                                                                              |
| `/student/redemptions/[id]` | Receipt: merchant, branch, item, original price, discount, amount paid to the merchant at the student price, reference, time, "Payment recorded by the merchant: Mobile Money" if recorded, and "Report a problem" |

Empty state: "No savings yet. Find a deal near campus." with a link to the marketplace.

### S12. Favourites (`/student/favourites`)

Saved merchants with their current best offer. Empty: "Tap the heart on a business to keep it here."

### S13. Profile (`/student/profile`)

- **School details:** school (locked while an application is open or the student is verified), campus, programme, level, graduation year. `upsert_student_profile()`.
- **Institutional email (optional):** add, change or remove; shown as Confirmed or Not confirmed. When email sending is configured, **Send code** emails a 6-digit code to that address and the student confirms it here. The card says plainly that confirming doesn't verify them on its own.
- Name, photo (required before the first redemption), notification settings, install guide, privacy (download my data, delete my account; redemptions are anonymised rather than deleted so merchants' records stay intact), terms, sign out. _(Later steps.)_

---

## Merchant

### M1. Registration (`/merchant/register`)

A five-step form that saves as it goes; nothing is public until Perqly approves it.

| Step                 | Content                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1. Business          | Display name, category, short description, phone, email, socials                                                             |
| 2. First branch      | Name, address, digital address, map pin (drag to adjust), phone, hours per day                                               |
| 3. Branding          | Logo and cover image (optional, recommended)                                                                                 |
| 4. Documents         | Business registration certificate, or for sole traders a utility bill or tenancy proof with the owner's ID; shop-front photo |
| 5. Review and submit | Summary; agreement to the merchant terms; **Submit for review** (`submit_merchant_for_review()`)                             |

Perqly staff can create a merchant on the owner's behalf (`/admin/merchants/new`) and send the owner an invite.

### M2. Dashboard (`/merchant`)

- Status banner while `pending_review` ("Perqly is reviewing your business. You can prepare offers in the meantime."), `rejected` (reason, fix and resubmit) or `suspended`.
- **Today:** pending redemptions (link to the counter), bookings today, redemptions today, student savings given today.
- **This week:** profile views, offer views, bookings, redemptions, unique students.
- Shortcuts: Open counter, New offer, Bookings, Download QR.
- Empty state for a new merchant: a checklist (add a service or product, create an offer, print your QR, invite your cashier).

### M3. Business profile (`/merchant/profile`)

Edit name, category, description, contacts, socials, logo and cover. A preview shows the student's view.

### M4. Branch management (`/merchant/branches`, `/merchant/branches/[id]`)

List of branches with status. Branch editor: address, pin, phone, hours, "accepts bookings", active toggle, assigned cashiers. Deactivating a branch hides it and stops new scans there.

### M5. Catalogue (`/merchant/catalogue`)

Tabs for **Services** (name, price, duration, bookable, branches) and **Products** (name, price, SKU). Add, edit, deactivate. Empty: "Add what you sell so students can see your prices."

### M6. Offer management (`/merchant/offers`, `/merchant/offers/new`, `/merchant/offers/[id]`)

- **List:** tabs by status (Active, Drafts, In review, Paused, Ended), with redemptions and remaining cap.
- **Builder** (one page, live preview of the student card on the side or below):
  1. Item: choose a service or product (or create one inline).
  2. Discount: percentage, fixed amount off, or a set student price; the preview shows regular price, student price and saving, calculated by the server as you type (debounced).
  3. Validity: start, optional end.
  4. Branches: all or selected.
  5. Limits: uses per student per day, week, month or offer lifetime; optional total cap.
  6. Conditions: template text to edit ("Valid for verified students only. One use per visit.").
  7. **Save draft** or **Submit**. The first 3 offers go to review ("Usually within 1 working day"); later offers go live unless flagged.
- Actions on an active offer: pause, edit, archive. Past redemptions keep the prices they were recorded with, so editing an offer never changes history.

### M7. Booking management (`/merchant/bookings`, `/merchant/availability`)

- **Bookings:** day and week views per branch; pending requests on top with **Confirm**, **Suggest another time**, **Decline** (reason). Confirmed bookings: **Mark completed**, **Mark no-show** (from 30 minutes after the start).
- **Availability:** per branch and service, weekly hours, slot length and capacity; date exceptions (closed, special hours) with a reason.
- Empty state: "Turn on bookings for a service in your catalogue to receive requests."

### M8. QR management (`/merchant/qr`)

- One card per branch: the QR, short code, version, issued date, last scanned.
- **Download poster** (A5 PDF and PNG): merchant and branch name, "Student? Scan with Perqly", QR, short code, and "Pay the merchant directly. Perqly never takes payment."
- **Get a new code** (with reason): confirms that the old printed code will stop working at once.

### M9. Pending redemptions: the counter (`/merchant/counter`)

- Full-screen, designed for a cashier's phone. Cashiers land here after sign-in.
- Branch picker if the user can operate several branches.
- Live list (Realtime) of `awaiting_merchant` sessions, newest first, each showing: student photo and first name, institution, item, original price, discount, **amount to collect**, pass code, reference, time left.
- Gentle sound and vibration on a new request (toggle).
- Empty: "No students waiting. When a student scans your code, they'll appear here."
- Connection lost: a banner "Offline. Reconnecting…" and the list greys out; nothing can be confirmed offline.

### M10. Redemption confirmation (`/merchant/counter/[sessionId]`)

- Large student photo and name, pass code, item, original price, discount, **amount to collect from the student**.
- Checklist reminder: "Check the photo matches the student and the code matches their screen."
- **Confirm discount** and **Decline** (reason list).
- After confirming: "Waiting for the student to confirm…" then "Completed" (Realtime), with **Record payment**: Mobile Money (MTN), Telecel Cash, AT Money, Cash, Card, Other; Paid or Not paid. Labelled "For your records. Perqly doesn't process payments."
- Errors: `session_changed`, `already_confirmed`, `session_expired` (section 9 of the QR specification).

### M11. Redemption history (`/merchant/redemptions`)

Filters: branch, date range, offer, staff member, payment status. Columns: time, reference, student first name, item, original, discount, final, payment method and status, confirmed by. CSV export. Rows open a detail view with "Report a problem". Also lists sessions that expired after the merchant confirmed ("Confirmed by you, not by the student").

### M12. Analytics (`/merchant/analytics`)

Date range picker. Profile and offer views, favourites, bookings (requested, confirmed, completed, no-show), redemptions, unique and repeat students, total student savings given, revenue at student prices (sum of final prices; clearly labelled as Perqly-recorded amounts, not payments), peak hours, top offers. Institution breakdown only for groups of at least 10 students.

### M13. Staff (`/merchant/staff`)

Invite by email as manager or cashier; assign cashiers to branches; remove access. Owners must have two-factor sign-in on.

---

## Institution

### I1. Reviewer sign-in

Reviewers are invited by email by Perqly (first institution admin) or by their institution admin. They sign in through `/login`; institution admins must also set up two-factor sign-in. A first-time reviewer sees a short guide: what to check, how to decide, and the data-handling rules from the institution's agreement.

### I2. Verification queue (`/institution`)

- Counts: pending, waiting more than 48 hours, decided today.
- List, oldest first: student name, programme, level, submitted time, waiting time, email-confirmed badge, resubmission badge.
- Filters: status, programme, waiting time. Search by name or student ID number.
- Empty: "No requests waiting. New requests appear here."

### I3. Student review (`/institution/requests/[id]`)

- Applicant: name, student ID number, programme, level, graduation year, submitted time, earlier applications and their outcomes, and the institutional email only if the student included it, marked "Confirmed by code" or "Not confirmed" and whether its domain is on the institution's list, with the note "For information only. An email address doesn't prove enrolment."
- Evidence: ID card photo and selfie side by side, loaded through 5-minute signed links. "Your view is logged." Zoom and rotate.
- Duplicate warning if the hashed student ID already belongs to another verified account.

### I4. Approval and rejection (on I3)

- **Approve:** confirms "Verified until {academic year end}". `decide_verification('approve')`.
- **Reject:** preset reasons (not enrolled, ID doesn't match records, photo doesn't match ID, documents unreadable, other) plus an optional note to the student.
- **Request resubmission:** pick what must be replaced (email, ID photo, selfie, student ID number) and write a note.
- After a decision, the next request in the queue opens automatically.

### I5. Activity history (`/institution/activity`)

- Reviewers see their own decisions. Institution admins see all reviewers: decisions, document views, time to decide, approval rate.
- Institution admins also manage reviewers here (`/institution/reviewers`): invite, remove.
- Counts of verified, pending and expired students. Never individual redemptions or spending.

---

## Admin

### A1. Platform overview (`/admin`)

Desktop-first. Queues needing action (merchants to review, offers to moderate, open disputes, flags), today and the last 7 days: sign-ups, verifications by institution, active merchants, bookings, redemptions, savings given. Requires two-factor sign-in.

### A2. Institutions (`/admin/institutions`)

Create and edit institutions, email domains and campuses; set status and review mode (delegated only with a signed agreement, recorded with its date); appoint the first institution admin.

### A3. Merchants (`/admin/merchants`)

- Review queue: business details, documents through signed links (logged), call checklist; **Approve**, **Reject** (reason), **Ask for more information**.
- Directory of all merchants: status, branches, offers, redemptions; suspend (with reason) and restore; create on behalf; manage branches and revoke QR codes.

### A4. Offers (`/admin/offers`)

Moderation queue (first 3 offers per merchant, and offers that trip rules such as a discount above 70%); approve or reject with a reason; pause any active offer; reported offers.

### A5. Students (`/admin/students`)

Look up by name, email or reference; see account status, institution, verification state (not documents unless review is delegated); suspend and restore with a reason.

### A6. Redemptions (`/admin/redemptions`)

Live feed and search by reference, student, merchant or date. Detail shows the session timeline (opened, selected, merchant confirmed, student confirmed) and audit events. **Void** (support and above) with a reason, linked to a dispute.

### A7. Reports (`/admin/reports`)

Sign-ups → verified → first redemption funnel by institution, time to verify, weekly active students, redemptions per active student, active merchants with at least one redemption a week, booking outcomes, failed redemption attempts by reason, flags (repeated "confirmed but not completed" sessions, unusual scan locations). CSV export.

### A8. Disputes and categories

`/admin/disputes`: case list and detail, assign, resolve (void, no action, suspend). `/admin/categories`: add, edit, reorder, deactivate categories and subcategories.
