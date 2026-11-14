# Perqly product specification

**Phase 1: student marketplace, merchant bookings and QR discount redemption**

|            |                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| Status     | Approved 2026-11-14, with the decisions in section 15. Implementation of roadmap steps 1.1–1.2 has started |
| Date       | 2026-11-14                                                                                                 |
| Live app   | https://perqly-eta.vercel.app/ (Phase 0: landing page, PWA, placeholder shells)                            |
| Repository | `chrisxie12/Perkly` (product name is Perqly; the repo keeps its old name for now)                          |

## Document set

These five documents describe Phase 1 together. If two of them disagree, the more specific one wins: the QR redemption specification beats this document on redemption, and the database architecture beats it on fields.

| Document                                                                           | Covers                                                                                              |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `PERQLY_PRODUCT_SPECIFICATION.md` (this file)                                      | Vision, confirmed decisions, features by role, assessment of what exists, conflicts, open decisions |
| [`PERQLY_DATABASE_ARCHITECTURE.md`](./PERQLY_DATABASE_ARCHITECTURE.md)             | Every table, field, key, index, RLS policy and database function                                    |
| [`PERQLY_USER_FLOWS.md`](./PERQLY_USER_FLOWS.md)                                   | Screen-by-screen flows for students, merchants, institution reviewers and admins                    |
| [`PERQLY_QR_REDEMPTION_SPECIFICATION.md`](./PERQLY_QR_REDEMPTION_SPECIFICATION.md) | The QR code, redemption sessions, the state machine, security controls and tests                    |
| [`PERQLY_IMPLEMENTATION_ROADMAP.md`](./PERQLY_IMPLEMENTATION_ROADMAP.md)           | Build order, dependencies, required changes to existing code, acceptance criteria per step          |

**Relationship to the earlier plan.** The product and technical plan (https://claude.ai/artifact/GaKkF97JCKtAc1XJFENVEL) remains the reference for things these documents don't cover: the merchant revenue model, compliance, the fraud-rule catalogue and phases after the pilot. Where it disagrees with these documents (redemption, offers, the database schema, the marketplace and the roadmap), **these documents win**. Section 14 lists every disagreement.

---

## 1. Product vision

Perqly is a student-exclusive marketplace that connects verified tertiary students in Ghana with businesses offering exclusive student discounts.

**Students use Perqly to** discover businesses, browse their services and products, compare regular and student prices, find nearby merchants, book appointments where the business takes them, visit the merchant, scan the merchant's QR code after receiving the service or buying the product, redeem their student discount and track their savings.

**Merchants use Perqly to** promote their business, publish products and services, offer exclusive student discounts, receive appointment bookings, verify student discount redemptions, manage offers and redemption records, and see business analytics.

**What Perqly is not, in this phase:** a payment processor, a delivery service or an online shop. Students always pay the merchant directly. Perqly calculates the discount, records the redemption and proves the discount was given to a verified student.

## 2. Confirmed product decisions

| Decision              | Choice                                                                                                                       | Notes                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Brand                 | Perqly                                                                                                                       | Repository, npm package and Supabase `project_id` stay `perkly` until a later rename |
| Platform              | One installable Progressive Web App                                                                                          | No native apps. Students, merchants, reviewers and admins all use the same app       |
| Stack                 | Next.js (App Router) + TypeScript + Supabase + Vercel                                                                        | Locked. No framework changes                                                         |
| Audience              | Tertiary students in Ghana                                                                                                   |                                                                                      |
| Pilot                 | Ghana Communication Technology University (GCTU)                                                                             | Institutions are data, so more schools can be added without code changes             |
| Student verification  | Hybrid: an application with institution, student ID number, ID card photo and selfie, approved by the institution's reviewer | Collected by Perqly, decided by the institution                                      |
| Sign-in identity      | Personal email (one-time code)                                                                                               | The institutional email is never required for registration, login or recovery        |
| Institutional email   | Optional, stored separately, can be confirmed by code                                                                        | Never grants verification on its own, confirmed or not, whatever its domain (D15)    |
| Verification approval | Institution-authorised reviewers                                                                                             | Perqly staff decide only where an institution formally delegates review              |
| Offer access          | Verified students only for booking and redemption                                                                            | Everyone signed in can browse merchants, offers and student prices (D1)              |
| Merchant onboarding   | Free during the pilot                                                                                                        |                                                                                      |
| Students              | Always free                                                                                                                  |                                                                                      |
| Merchant revenue      | Hybrid model                                                                                                                 | Mix not yet priced; see decision D9                                                  |
| QR redemption         | The student scans the merchant's static QR code at the business                                                              | The QR code identifies the branch only. It never authorises a discount on its own    |
| Payments              | Made directly to the merchant, outside Perqly                                                                                | MTN MoMo, Telecel Cash, AT Money, cash or anything else the merchant accepts         |
| Bookings              | Supported for appointment-based businesses                                                                                   |                                                                                      |
| Walk-in purchases     | Supported                                                                                                                    |                                                                                      |

## 3. Existing implementation assessment

What is in the repository and live today (Phase 0, step 1):

| Area                                                                                             | State                                                                         | Relevance to Phase 1                                                                         |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Next.js 16 app, TypeScript strict, Tailwind v4, design system, CI                                | Done                                                                          | Keep. Phase 1 builds on it                                                                   |
| Public landing page, `/install`, draft `/privacy` and `/terms`                                   | Done                                                                          | Several copy points conflict with the new redemption and offer model (section 14)            |
| PWA: manifest (`start_url /student`), icons, Serwist service worker, offline page, update prompt | Done                                                                          | Keep. The service worker needs one change for the QR landing route (C9)                      |
| `/student`, `/merchant`, `/institution`, `/admin`                                                | "Coming soon" shells only                                                     | Replaced step by step in Phase 1                                                             |
| Supabase browser/server clients, session refresh in `src/proxy.ts`, Zod env validation           | Done, but **no Supabase project is connected**                                | Keep. Phase 1 connects staging first                                                         |
| `supabase/` CLI project                                                                          | Initialised; `migrations/` and `seed.sql` are empty                           | No database tables exist, so nothing needs migrating. Phase 1 starts from an empty schema    |
| Authentication, verification, offers, bookings, redemption, dashboards                           | Not started                                                                   | All of Phase 1                                                                               |
| `src/features/{auth,institutions,merchants,offers,redemptions,students}`                         | Empty module folders                                                          | Phase 1 fills them; add `bookings/`                                                          |
| Security headers                                                                                 | `Permissions-Policy` allows camera and geolocation for this site; partial CSP | Camera is needed for the scanner. A full CSP (including Supabase Realtime) arrives with auth |
| Deployment                                                                                       | Vercel project `perqly`, auto-deploys from `main`, Node 22.x                  | Vercel Hobby is non-commercial only. Still open before the public pilot (D10)                |

Because the database is empty, "don't duplicate existing tables" is easy to satisfy: there are none. The real source of possible duplication is the earlier plan's schema, which was never built. The database architecture maps every old table name to its Phase 1 equivalent.

## 4. Roles

One account can hold several roles. A student who runs a barbershop can be a student and a merchant owner at the same time.

| Role                 | Who                                                       | Summary                                                                                                     |
| -------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Guest                | Not signed in                                             | Public landing page, install guide, sign-up                                                                 |
| Student, unverified  | Signed up, verification not approved                      | Browse the marketplace, save favourites, submit verification. Can't book at student prices or redeem        |
| Student, verified    | Approved by their institution and within `verified_until` | Everything above, plus booking and redemption                                                               |
| Merchant owner       | Holder of the business account                            | Everything for their business: profile, branches, offers, bookings, QR codes, staff, redemptions, analytics |
| Merchant manager     | Trusted staff                                             | Offers, bookings, redemptions, analytics, cashier invites. No ownership or deletion                         |
| Merchant cashier     | Counter staff, tied to one or more branches               | Pending redemptions and today's bookings at their branches. Nothing else                                    |
| Institution reviewer | Appointed by the institution                              | Verification queue for their own institution only                                                           |
| Institution admin    | Appointed by the institution                              | Reviewer work, plus managing the institution's reviewers and seeing their activity                          |
| Perqly support       | Perqly staff                                              | Look up accounts, investigate disputes, void redemptions with a reason                                      |
| Perqly admin         | Perqly core team                                          | Institutions, merchants, categories, moderation, suspensions, analytics                                     |
| Super admin          | Founder                                                   | Everything, plus staff role management                                                                      |

Platform staff, institution admins and merchant owners must use two-factor sign-in (TOTP).

## 5. Student marketplace

The marketplace is built around **merchant discovery**: students find a business first, then see what it offers.

### 5.1 What students can do

- Browse all participating businesses (approved merchants with at least one active branch).
- Search by merchant name, category, service or product, with typo tolerance.
- Filter by distance from their campus or current location, category, discount type and size, "open now" and "takes bookings".
- View a merchant profile: logo, cover image, description, category, branches with address, map pin and business hours, services and products, and active offers.
- See each item's regular price next to the discounted student price.
- View the discount conditions, eligibility, validity dates and limits.
- Save favourite businesses.
- See ratings and reviews (later step; schema defined now).

### 5.2 Categories

Admin-editable, one level of subcategories. The starting list merges the brief with the earlier plan's categories that matter around GCTU:

| Category                            | Examples                                       |
| ----------------------------------- | ---------------------------------------------- |
| Beauty and grooming                 | Barbershops, salons, braiding, nails, skincare |
| Healthcare and dental               | Dental clinics, eye care, pharmacies, wellness |
| Restaurants and cafés               | Chop bars, fast food, cafés, juice bars        |
| Fashion and retail                  | Clothing, tailoring, shoes, accessories        |
| Electronics                         | Phone accessories, repairs, laptops            |
| Fitness and recreation              | Gyms, sports, gaming centres, events           |
| Photography and printing            | Printing, binding, photocopies, photo studios  |
| Education and professional services | Tutoring, short courses, CV help, books        |
| Everyday services                   | Laundry, transport, data and airtime           |

"Barbershops and salons" from the brief is a subcategory of Beauty and grooming, so it doesn't duplicate a top-level category. The last row keeps the earlier plan's high-demand student categories; drop it if you prefer the brief's list exactly (decision D8).

### 5.3 The offer model

An offer is a student discount on **one specific service or one specific product** at a merchant. "15% off everything" is not a Phase 1 offer type, because Perqly must calculate the final price itself (decision D2).

Every offer has:

| Field                 | Rule                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Merchant              | Required                                                                                                                                                              |
| Branches              | One or more of the merchant's branches. Empty means all active branches                                                                                               |
| Service or product    | Exactly one, from the merchant's catalogue                                                                                                                            |
| Regular price         | Taken from the service or product, in GH₵. Must be greater than 0                                                                                                     |
| Discount type         | `percentage`, `fixed_amount` (GH₵ off) or `fixed_price` (a set student price)                                                                                         |
| Discount value        | Percentage: 1–90. Fixed amount: greater than 0 and less than the regular price. Fixed price: the student price itself, greater than 0 and less than the regular price |
| Final student price   | Always calculated by the server, never entered or stored from the client                                                                                              |
| Validity period       | Start and end date-times (Africa/Accra). End optional                                                                                                                 |
| Redemption conditions | Plain-text terms, for example "Show student pass before payment"                                                                                                      |
| Redemption limits     | Per-student count per period (day, week, month or the offer's lifetime) and an optional total cap                                                                     |
| Availability status   | `draft`, `pending_review`, `active`, `paused`, `expired`, `rejected`, `archived`                                                                                      |
| Institution scope     | All active institutions (default) or selected institutions. Only GCTU is active in the pilot                                                                          |

All three types produce the same display. The student price is shown as: regular price struck through, student price, and the saving ("Save GH₵12").

## 6. Appointment booking

Not every merchant needs appointments. Each **service** is marked as bookable or walk-in only. Products are never bookable.

**A. Appointment-based:** the student picks a service, a branch, then an available date and time, and submits. The merchant confirms, rejects or proposes another time, and the student is notified. After the visit and the service, the student redeems the discount by scanning the QR code.

**B. Walk-in:** the student finds an offer, visits, buys the product or receives the service, then scans the QR code and redeems the discount.

| Booking status         | Meaning                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `pending`              | Submitted by the student, waiting for the merchant                                                                      |
| `confirmed`            | Accepted by the merchant                                                                                                |
| `reschedule_requested` | The merchant proposed another time. The student accepts (back to `confirmed` at the new time) or declines (`cancelled`) |
| `cancelled`            | Cancelled by the student or the merchant, or a rejected request. The reason and who cancelled are stored                |
| `completed`            | The appointment happened. Set when a redemption linked to the booking completes, or by the merchant manually            |
| `no_show`              | The student didn't come. The merchant can mark it from 30 minutes after the start time                                  |

**A booking never counts as a redemption.** Only a completed redemption session records a discount. A booking can be `completed` without a redemption (for example, the student chose not to redeem).

Availability comes from weekly rules per branch and service (day, opening and closing time, slot length, capacity), plus date exceptions for closures and holidays. Only verified students can book a slot for a discounted service.

## 7. QR redemption (summary)

The full design is in [`PERQLY_QR_REDEMPTION_SPECIFICATION.md`](./PERQLY_QR_REDEMPTION_SPECIFICATION.md). The essentials:

1. Each merchant branch displays a **static Perqly QR code**. It encodes only an opaque, random, revocable token, as a link: `https://<perqly-domain>/r/<token>`. It contains no merchant data, no student data and no discount authorisation.
2. After the purchase or service, the verified student scans it in Perqly's scanner (or with the phone camera, which opens the same link in Perqly).
3. The server validates the student, the merchant, the branch, the QR token and the eligible offers, then opens a **short-lived redemption session**.
4. The student picks what they actually bought. The server calculates the regular price, discount and final price, and shows a review screen with a live pass (code, running clock, colour of the day).
5. The merchant confirms the pending redemption from the authenticated merchant dashboard. Then the student confirms the purchase and amount.
6. The server finalises the redemption in one atomic transaction: it writes the redemption record, updates the student's savings, the merchant's history, the offer's redemption count and any linked booking, and writes the audit log.

A completed redemption can never be reused, and a pending session expires on its own.

## 8. Payment model

Perqly does **not** process, collect, hold or transfer student payments in Phase 1. There is no payment gateway in this implementation.

The student pays the merchant directly, by MTN MoMo, Telecel Cash, AT Money, cash, or whatever else the merchant accepts. Perqly calculates and records the discounted amount, and verifies that the discount was redeemed by a verified student.

Three separate things must never be confused, in the data or in the interface:

| Concept                 | Who records it                                  | Meaning                                                                                                                         |
| ----------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Discount redemption     | Perqly, after merchant and student confirmation | A verified student received this discount on this item at this branch                                                           |
| Payment to the merchant | Happens outside Perqly                          | The student paid the merchant. Perqly can't see it                                                                              |
| Payment status          | Optionally recorded by the merchant             | The merchant's own note: method (MoMo, Telecel Cash, AT Money, cash, card, other) and status (`not_recorded`, `paid`, `unpaid`) |

Interface rule: redemption screens and receipts say "Discount redeemed", never "Paid". Any payment information is labelled "Recorded by the merchant". A QR redemption is never shown as proof that Perqly processed a payment.

Merchant billing for the hybrid revenue model (subscriptions and so on) is separate from student payments and is out of scope for Phase 1. Merchants are free during the pilot.

## 9. Merchant dashboard (`/merchant`)

Only authorised merchant users can manage their business. Every action is checked against their role for that merchant.

- **Registration:** create a business (draft), submit it for review. Perqly admins approve, reject or ask for more information. Perqly staff can also create a merchant on the owner's behalf and hand it over.
- **Business profile:** name, category, description, contacts, social links, logo and cover image.
- **Branches:** several branches, each with an address, Ghana Post digital address, map pin, phone, business hours and active status.
- **Catalogue:** services (with duration, and whether they're bookable) and products, each with a regular price and image.
- **Offers:** create, edit, pause and archive; set the discount, validity, branches, limits and conditions. The first 3 offers go to moderation, and later ones publish unless they trip a rule.
- **Booking management:** availability rules and exceptions per branch and service; accept, reject or propose another time; mark completed or no-show.
- **QR management:** view, download and print each branch's QR code; revoke and reissue it if it's misused.
- **Pending redemptions:** live list per branch, with student first name, photo, item, final price and pass code; confirm or reject.
- **Payment notes:** record the payment method and status on a redemption.
- **Redemption history:** filter by branch, date, offer and staff member; CSV export.
- **Analytics:** profile and offer views, bookings, redemptions, unique students, repeat students, total student savings given, peak hours. Breakdowns by institution are shown only for groups of at least 10 students.
- **Staff:** invite managers and cashiers, assign cashiers to branches, remove access.

## 10. Institution dashboard (`/institution`)

- Reviewer sign-in with two-factor authentication for institution admins.
- Verification queue: only the institution's own students' requests, oldest first, with waiting time shown.
- Review screen: student ID number, the optional institutional email if included (marked confirmed or not, and whether its domain is on the institution's list, both for information only), programme, level, graduation year, and the ID photo and selfie through short-lived signed links (every view logged).
- Approve, reject with a reason, or request resubmission with a note.
- Verification status for any of the institution's students (verified, pending, expired, suspended).
- Reviewer activity log: decisions and document views by each reviewer (institution admins see all of their institution's reviewers).

The institution dashboard never shows individual students' redemptions or spending.

Students can't book at student prices or redeem until they're verified, and the database enforces this.

## 11. Student dashboard (`/student`)

- Marketplace discovery, search and filters.
- Favourite merchants.
- Bookings: upcoming, past, cancelled; reschedule responses.
- QR scanner (`/student/scan`), one tap from the home screen.
- Redemption history with the item, merchant, regular price, discount and final price.
- Total savings, overall and by month and category.
- Verification status and resubmission.
- Profile: name, photo (shown to merchants at redemption), school and campus, an optional institutional email (add, change, remove, confirm by code), notification settings, data export and account deletion.

## 12. Perqly administration (`/admin`)

- Institutions: create, edit, activate; email domains; campuses; reviewer appointment; review mode (institution or delegated).
- Merchants: review queue, approve, reject, suspend; create on behalf.
- Branches: view and deactivate; QR code revocation.
- Categories: create, edit, reorder.
- Offers: moderation queue, pause, reject.
- Students: look up, suspend, restore.
- Redemptions: monitor live and historical activity; void with a reason after a dispute investigation.
- Disputes: student or merchant reports, with the case history.
- Platform analytics: sign-ups, verifications by institution, active merchants, bookings, redemptions per day, savings given.
- Fraud: suspend fraudulent accounts; anomaly flags (see the QR redemption specification).

## 13. Security and data integrity requirements

Detailed controls are in the database architecture and QR redemption documents. Product-level rules:

| Requirement             | Rule                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role-based access       | Roles live in database tables. Every page has a server-side role guard, and every table has RLS. The proxy redirect is a convenience, never the boundary                |
| Institution isolation   | Reviewers see only their own institution's students and documents                                                                                                       |
| Merchant data isolation | Merchant users see only their own merchant's data; cashiers see only their branches                                                                                     |
| Student privacy         | At redemption, merchants see first name, photo and institution only, never phone or email. Analytics are aggregated                                                     |
| Secure documents        | ID photos and selfies sit in a private bucket, are readable only through 5-minute signed links issued to authorised reviewers, and are deleted 30 days after a decision |
| Server-side pricing     | Prices and discounts are calculated in the database. The client sends only IDs                                                                                          |
| Atomic redemption       | Finalisation is one database transaction with row locks                                                                                                                 |
| Duplicate prevention    | One redemption per session; idempotency keys; limits re-checked at finalisation                                                                                         |
| Booking ownership       | Students see and change only their own bookings; merchants only their own branches' bookings                                                                            |
| Merchant authorisation  | Only owner, manager or an assigned cashier can confirm a redemption at a branch                                                                                         |
| Session expiry          | Pending redemption sessions expire automatically                                                                                                                        |
| Audit logging           | Verification decisions, document views, redemption events, voids, role changes, suspensions and QR revocations                                                          |
| Rate limiting           | Scans, session creation, confirmations, OTP sends, bookings and searches                                                                                                |

Legal: Perqly must register with Ghana's Data Protection Commission (Data Protection Act, 2012, Act 843) before processing real student data. The pilot can't open without it.

## 14. Conflicts with the existing implementation and plan

These are places where the live app or the earlier plan contradicts the confirmed Phase 1 decisions. Nothing has been changed yet; the "Resolution" column is what Phase 1 will do.

| #   | Where                                                                | Conflict                                                                                                                                      | Resolution                                                                                                                                                 |
| --- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Earlier plan §5, §9                                                  | Single `redemptions` table holding live passes; the cashier confirms alone                                                                    | Split into `redemption_sessions` (pending) and `redemptions` (final). Both the merchant and the student confirm                                            |
| C2  | Earlier plan §5                                                      | "No device at the counter": a pass expires as _unconfirmed_ but still counts                                                                  | Dropped. A redemption completes only with merchant confirmation, so the merchant needs a signed-in phone at the counter (D4)                               |
| C3  | Earlier plan §5                                                      | Two QR modes: printed, or live rotating every 30 seconds                                                                                      | Static QR only, as confirmed. The live rotating mode is deferred. The printed QR keeps revocation and reissue                                              |
| C4  | Earlier plan §5                                                      | Location check within 300 m blocks redemption                                                                                                 | Not in the confirmed validation list. Kept as a recorded fraud signal, not a blocker (D3)                                                                  |
| C5  | Earlier plan §9; landing example offers                              | Offers are free-form discounts on the whole business ("15% off any plate", "10% off everything", BOGO, freebies) with an optional bill amount | Phase 1 offers attach to one priced service or product, with percentage or fixed discounts only. Open-bill offers wait for D2                              |
| C6  | Earlier plan                                                         | No bookings, services or products                                                                                                             | Added: `services`, `products`, `bookings`, availability tables                                                                                             |
| C7  | Earlier plan §1, §4                                                  | Unverified students get full browsing                                                                                                         | Kept for browsing. Booking at student prices and redemption need verification. D1 confirms what else is gated                                              |
| C8  | Earlier plan §9                                                      | `saved_offers` (save an offer)                                                                                                                | Replaced by `favourites` (save a merchant), as the brief asks                                                                                              |
| C9  | `src/app/sw.ts`                                                      | The QR link route `/r/...` isn't in the service worker's NetworkOnly list, so it would fall under the default page caching                    | Add `/r` to `PRIVATE_PREFIXES` and to `robots.ts` disallow before the QR route ships                                                                       |
| C10 | Landing: hero, how-it-works step 3, FAQ, student shell               | Flow is "scan → pick a deal → show pass → cashier confirms", before payment                                                                   | New order: buy or get the service → scan → pick the item → merchant confirms → student confirms → pay the merchant. Copy updates are listed in the roadmap |
| C11 | Landing receipt facts                                                | "How long a live pass lasts: 3 min"                                                                                                           | Phase 1 sessions last up to 10 minutes after the item is picked (D5). Update the fact when the session timer is final                                      |
| C12 | Landing category marquee                                             | Categories differ from the Phase 1 list (no Healthcare and dental, Photography)                                                               | Update the marquee to the final category list (D8)                                                                                                         |
| C13 | Landing example offers                                               | Show a discount only, with no regular and student price                                                                                       | Show regular price, student price and saving, still labelled as examples                                                                                   |
| C14 | `/student` shell; earlier plan §13                                   | "Sign up with your email or phone number"                                                                                                     | Phone sign-up needs a paid SMS provider. Email first for the pilot (D6)                                                                                    |
| C15 | Earlier plan §1, §9                                                  | Names: `merchant_members`, `institution_members`, `categories`, `profiles`-based roles                                                        | Renamed to the brief's names: `merchant_users`, `institution_reviewers`, `merchant_categories`. No data exists, so there's nothing to migrate              |
| C16 | Earlier plan §7, §14                                                 | Paystack payments in the roadmap                                                                                                              | Paystack only ever applied to merchant billing, not student payments, and stays out of Phase 1                                                             |
| C17 | Earlier plan §5                                                      | Cashier can void a confirmed redemption within 15 minutes                                                                                     | Not in Phase 1. Voids are support or admin actions after a dispute, so a completed redemption can't be undone casually                                     |
| C18 | Earlier specs §2; landing verification section, how-it-works and FAQ | A school email code was a required part of verification                                                                                       | Institutional email is optional (D15). Specs and landing copy updated on 2026-11-14                                                                        |

## 15. Decisions

Approved by the founder on 2026-11-14. These override any recommendation that differs.

| #   | Decision                                  | Outcome                                                                                                                                                                                                                                                                                                      |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | What "offer access: verified only" covers | **Approved:** unverified students can browse merchant profiles, offers and student prices, but can't book or redeem. Enforced in the database                                                                                                                                                                |
| D2  | Offers without a fixed price              | **Approved:** MVP offers must be tied to a catalogue service or product with a known regular price. Discount types: percentage, fixed amount off, and **fixed student price**. Open-bill offers are out of the MVP                                                                                           |
| D3  | Location check                            | Recommendation stands: record as a fraud signal, never block                                                                                                                                                                                                                                                 |
| D4  | Merchants without a counter device        | Recommendation stands: any signed-in merchant device can confirm                                                                                                                                                                                                                                             |
| D5  | Session timing                            | **Approved:** 5 minutes to pick an item, then 10 minutes for the merchant and student confirmations                                                                                                                                                                                                          |
| D6  | Sign-in method                            | **Approved:** email one-time code first. Phone sign-in later                                                                                                                                                                                                                                                 |
| D7  | Order of confirmations                    | Recommendation stands: merchant first, then student                                                                                                                                                                                                                                                          |
| D8  | Category list                             | Recommendation stands: the merged list in section 5.2                                                                                                                                                                                                                                                        |
| D9  | Merchant revenue                          | **Approved:** merchant onboarding is free during the GCTU pilot. No paid subscriptions are built yet                                                                                                                                                                                                         |
| D10 | Hosting                                   | **Approved:** Vercel commercial-use requirements stay on the pre-launch checklist (roadmap step 1.9)                                                                                                                                                                                                         |
| D11 | Email delivery                            | **Approved:** Resend is the preferred transactional email provider, subject to domain verification and free-tier suitability. Credentials only in environment variables and the Supabase dashboard (see [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md))                                                          |
| D12 | Quantity per redemption                   | Recommendation stands: one unit per redemption                                                                                                                                                                                                                                                               |
| D13 | Manual code fallback                      | Recommendation stands: allowed, rate-limited                                                                                                                                                                                                                                                                 |
| D14 | GCTU                                      | **Approved:** an official GCTU pilot requires institutional approval. Until then GCTU appears only as a planned pilot institution, and real students aren't verified                                                                                                                                         |
| D15 | Institutional email                       | **Approved 2026-11-14:** students register and sign in with a personal email. An institutional email is optional, stored separately with its own confirmation state, and never grants verification. Verification always needs an application approved by an authorised reviewer of the student's institution |

## 16. Product acceptance criteria for Phase 1

Phase 1 is accepted when, on staging, with two real phones:

1. A student signs up with a personal email (no institutional email), submits verification, and a GCTU reviewer approves it in `/institution`. A reviewer from another institution can't see the request.
2. A merchant registers, an admin approves it, and the merchant adds a branch, a service, a product and offers with percentage, fixed-amount and fixed-price discounts.
3. The verified student finds the merchant by search and by category, sees the regular price, student price and saving, and saves the merchant as a favourite.
4. The student books a bookable service; the merchant proposes another time; the student accepts; the booking shows as confirmed.
5. At the branch, the student scans the printed QR code, picks the service, sees the server-calculated price, the merchant confirms, then the student confirms. The redemption appears in both histories, the student's savings grow by exactly the discount, the offer count goes up by one and the booking becomes completed.
6. Scanning a revoked QR code, scanning as an unverified student, exceeding a limit, double-tapping confirm, replaying a confirmation request and letting a session expire all fail safely, with a clear message and no extra redemption.
7. No screen calls a redemption a payment.
8. Every RLS policy has passing pgTAP tests in CI, and the Supabase security advisor shows no errors.
