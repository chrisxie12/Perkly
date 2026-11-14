# Perqly database architecture

**Phase 1: Supabase (Postgres 15+) schema, row-level security and database functions**

|                     |                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status              | Approved 2026-11-14. Migrations 0001–0003 are being implemented                                                                                                                                              |
| Date                | 2026-11-14                                                                                                                                                                                                   |
| Companion documents | [Product specification](./PERQLY_PRODUCT_SPECIFICATION.md) · [QR redemption](./PERQLY_QR_REDEMPTION_SPECIFICATION.md) · [User flows](./PERQLY_USER_FLOWS.md) · [Roadmap](./PERQLY_IMPLEMENTATION_ROADMAP.md) |

## 1. Current state

- **No Supabase project is connected** to the app yet (no environment variables are set on Vercel).
- `supabase/migrations/` holds only `.gitkeep`, and `supabase/seed.sql` is empty. **No tables, functions, buckets or policies exist.**
- The app has a browser client (`src/lib/supabase/client.ts`), a server client (`src/lib/supabase/server.ts`) and session refresh in `src/proxy.ts` using `getClaims()`. They're type-checked but untested against a real project.

So Phase 1 creates the schema from nothing. The only thing to reconcile is the earlier plan's schema (never built). Section 11 maps its names to the names used here.

## 2. Conventions

| Topic            | Rule                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary keys     | `id uuid primary key default gen_random_uuid()`, except where noted (1:1 tables keyed by `user_id`, join tables with composite keys, `audit_logs` with a bigint identity)                                                                                                                                                    |
| Timestamps       | `created_at timestamptz not null default now()`; `updated_at timestamptz not null default now()` kept current by a shared trigger `private.set_updated_at()`                                                                                                                                                                 |
| Time zone        | Stored as `timestamptz` (UTC). Displayed in Africa/Accra (UTC+0, no daylight saving)                                                                                                                                                                                                                                         |
| Money            | `numeric(12,2)`, Ghana cedis. `currency` columns are `char(3)` defaulting to `'GHS'` for future-proofing                                                                                                                                                                                                                     |
| Status fields    | Postgres enums (section 3)                                                                                                                                                                                                                                                                                                   |
| Text identifiers | `citext` for emails and domains; slugs are lower-case, unique and checked by `^[a-z0-9-]{2,64}$`                                                                                                                                                                                                                             |
| Locations        | `latitude` and `longitude` as `double precision` with range checks (both set or both null). Distances use a small haversine SQL function; at pilot scale (hundreds of branches) that's fast without a spatial index. Simpler than PostGIS and testable on plain Postgres; PostGIS can be added later if map features need it |
| Foreign keys     | Every foreign key column has an index. `on delete restrict` by default; `cascade` only where noted                                                                                                                                                                                                                           |
| Search           | Generated `tsvector` columns with GIN indexes, plus `pg_trgm` indexes on names for typo tolerance                                                                                                                                                                                                                            |
| Schemas          | `public` holds tables and the RPC functions the app may call. `private` holds helper functions and internal logic, and is **not** exposed by the Data API                                                                                                                                                                    |
| Extensions       | `pgcrypto`, `citext`, `pg_trgm`, and `pg_cron` (from the jobs migration), all in the `extensions` schema. All are available on Supabase's free plan                                                                                                                                                                          |

### Security model

1. **RLS is enabled on every table in `public`, deny by default.** A table with no policy for a role returns nothing to that role.
2. Clients may write directly only to **low-risk rows they own**: their profile name and photo, favourites, notification read state. Everything that matters (verification decisions, offers going live, bookings, every step of redemption, suspensions) goes through **`security definer` functions** that check the caller's role themselves, validate input and write audit logs.
3. Helper functions are `stable`, `security definer`, `set search_path = ''`, live in `private`, and are called inside policies as `(select private.fn())` so Postgres evaluates them once per statement.
4. The browser holds only the **publishable** key. A server-only secret key is used only by server code that must bypass RLS (none is planned in Phase 1: cron runs inside the database).
5. Every policy has pgTAP tests under `supabase/tests/` that sign in as each role and assert allowed and denied access. CI fails if any test fails.

## 3. Enums

| Enum                          | Values                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `platform_role`               | `reviewer`, `support`, `admin`, `super_admin`                                                    |
| `institution_status`          | `pilot`, `active`, `inactive`                                                                    |
| `review_mode`                 | `institution`, `delegated`                                                                       |
| `institution_reviewer_role`   | `reviewer`, `admin`                                                                              |
| `membership_status`           | `invited`, `active`, `removed`                                                                   |
| `student_verification_state`  | `unverified`, `pending`, `verified`, `expired`, `suspended`                                      |
| `verification_request_status` | `draft`, `submitted`, `approved`, `rejected`, `resubmission_requested`, `withdrawn`              |
| `decider_type`                | `institution`, `perqly`                                                                          |
| `merchant_status`             | `draft`, `pending_review`, `approved`, `rejected`, `suspended`                                   |
| `merchant_user_role`          | `owner`, `manager`, `cashier`                                                                    |
| `offer_status`                | `draft`, `pending_review`, `active`, `paused`, `expired`, `rejected`, `archived`                 |
| `discount_type`               | `percentage`, `fixed_amount`, `fixed_price`                                                      |
| `limit_period`                | `day`, `week`, `month`, `offer_lifetime`                                                         |
| `institution_scope`           | `all`, `selected`                                                                                |
| `booking_status`              | `pending`, `confirmed`, `reschedule_requested`, `cancelled`, `completed`, `no_show`              |
| `booking_party`               | `student`, `merchant`, `system`                                                                  |
| `qr_code_status`              | `active`, `revoked`                                                                              |
| `redemption_session_status`   | `open`, `awaiting_merchant`, `awaiting_student`, `completed`, `expired`, `cancelled`, `rejected` |
| `redemption_status`           | `completed`, `voided`                                                                            |
| `payment_method`              | `mtn_momo`, `telecel_cash`, `at_money`, `cash`, `card`, `other`                                  |
| `payment_record_status`       | `not_recorded`, `paid`, `unpaid`                                                                 |
| `location_signal`             | `not_shared`, `within_range`, `out_of_range`                                                     |
| `review_status`               | `published`, `hidden`                                                                            |
| `dispute_status`              | `open`, `investigating`, `resolved`, `dismissed`                                                 |

## 4. Role helper functions (`private` schema)

| Function                                                                                                    | Returns                             | Used for                                                                                           |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `private.platform_role()`                                                                                   | `platform_role` or null             | Looks up `platform_staff` for `auth.uid()`                                                         |
| `private.is_staff(min platform_role)`                                                                       | boolean                             | True if the caller's platform role is at or above `min` (reviewer < support < admin < super_admin) |
| `private.has_mfa()`                                                                                         | boolean                             | True if the JWT's `aal` claim is `aal2`. Required for staff and institution admin writes           |
| `private.merchant_role(merchant_id uuid)`                                                                   | `merchant_user_role` or null        | Caller's active role at a merchant                                                                 |
| `private.can_operate_branch(branch_id uuid)`                                                                | boolean                             | Owner or manager of the branch's merchant, or a cashier assigned to that branch                    |
| `private.institution_role(institution_id uuid)`                                                             | `institution_reviewer_role` or null | Caller's active reviewer role at an institution                                                    |
| `private.student_institution()`                                                                             | uuid or null                        | The caller's institution from `student_profiles`                                                   |
| `private.is_verified_student()`                                                                             | boolean                             | `verification_status = 'verified'` and `verified_until > now()` and the profile isn't suspended    |
| `private.check_rate_limit(action text, max int, window interval)`                                           | void, raises `rate_limited`         | Counts `rate_limit_events` for `auth.uid()` and `action` inside `window`; inserts a row if allowed |
| `private.write_audit(action text, entity_type text, entity_id uuid, before jsonb, after jsonb, meta jsonb)` | void                                | The only way rows enter `audit_logs`                                                               |

## 5. Entities

Entities from the brief are marked **(brief)**. The others are supporting tables that the brief's entities need. Field lists omit `created_at` and `updated_at`, which every table has unless noted.

### 5.1 Identity and access

#### `profiles` (supporting)

Purpose: one row per Supabase Auth user, created by a trigger on `auth.users` insert.

| Field              | Type                  | Notes                                                                                |
| ------------------ | --------------------- | ------------------------------------------------------------------------------------ |
| `id`               | uuid PK               | = `auth.users.id`, FK `on delete cascade`                                            |
| `full_name`        | text                  | 2–120 chars                                                                          |
| `first_name`       | text                  | Shown to merchants at redemption                                                     |
| `avatar_path`      | text null             | Path in the private `avatars` bucket. Shown to merchants only during a live session  |
| `phone`            | text null             | E.164; never shown to merchants                                                      |
| `signup_intent`    | text null             | `student` or `merchant`, from the sign-up form; only used to route the first sign-in |
| `is_suspended`     | boolean default false | Set only by `set_account_suspension()`                                               |
| `suspended_reason` | text null             |                                                                                      |

Access: the owner reads and updates `full_name`, `first_name` and `avatar_path` (a trigger rejects changes to `is_suspended` and `suspended_reason` from non-function callers). Institution reviewers read name and avatar of their institution's applicants through the review function only. Support and above read all.

#### `platform_staff` (supporting)

Purpose: Perqly staff roles.

| Field        | Type            | Notes         |
| ------------ | --------------- | ------------- |
| `user_id`    | uuid PK         | FK `profiles` |
| `role`       | `platform_role` |               |
| `granted_by` | uuid            | FK `profiles` |

Access: staff read their own row; admins read all; only `super_admin` writes, through `set_platform_role()`, with MFA. Audited.

### 5.2 Institutions

#### `institutions` (brief)

Purpose: each partner tertiary institution. GCTU is the first row.

| Field                                              | Type                                | Notes                                                                  |
| -------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| `id`                                               | uuid PK                             |                                                                        |
| `slug`                                             | text unique                         | `gctu`                                                                 |
| `name`                                             | text                                | Ghana Communication Technology University                              |
| `short_name`                                       | text                                | GCTU                                                                   |
| `status`                                           | `institution_status`                | Only `pilot` and `active` institutions appear in sign-up               |
| `review_mode`                                      | `review_mode` default `institution` | `delegated` lets Perqly reviewers decide, only with a signed agreement |
| `academic_year_end_month`, `academic_year_end_day` | smallint                            | Sets `verified_until` on approval                                      |
| `logo_path`                                        | text null                           | Used only with the institution's written permission                    |

Access: everyone (including guests) reads `pilot`/`active` rows; admins write via `upsert_institution()` with MFA.

#### `institution_email_domains` (supporting)

| Field            | Type          | Notes                                                         |
| ---------------- | ------------- | ------------------------------------------------------------- |
| `id`             | uuid PK       |                                                               |
| `institution_id` | uuid FK       | cascade                                                       |
| `domain`         | citext unique | e.g. the GCTU student mail domain (to be confirmed with GCTU) |
| `is_active`      | boolean       |                                                               |

Access: authenticated users read active rows; admins write. The list only helps reviewers (an application shows whether an included institutional email's domain is listed). It never decides anything.

#### `campuses` (supporting)

| Field                   | Type                  | Notes                                              |
| ----------------------- | --------------------- | -------------------------------------------------- |
| `id`                    | uuid PK               |                                                    |
| `institution_id`        | uuid FK               |                                                    |
| `name`                  | text                  | e.g. Tesano                                        |
| `latitude`, `longitude` | double precision null | Drives "near campus" sorting. Null until confirmed |
| `digital_address`       | text null             | Ghana Post GPS                                     |
| `is_active`             | boolean               |                                                    |

Access: public read of active rows; admins write.

#### `institution_reviewers` (brief)

Purpose: links a user to the one institution whose students they review.

| Field            | Type                        | Notes                             |
| ---------------- | --------------------------- | --------------------------------- |
| `id`             | uuid PK                     |                                   |
| `institution_id` | uuid FK                     |                                   |
| `user_id`        | uuid FK `profiles`          |                                   |
| `role`           | `institution_reviewer_role` | `reviewer` or `admin`             |
| `status`         | `membership_status`         |                                   |
| `appointed_by`   | uuid FK `profiles`          | Perqly admin or institution admin |
| `removed_at`     | timestamptz null            |                                   |

Constraints: unique `(institution_id, user_id)`. Indexes: `(user_id) where status = 'active'`.
Access: reviewers read rows of their own institution; institution admins appoint and remove reviewers via `appoint_institution_reviewer()` and `remove_institution_reviewer()` (MFA); Perqly admins write all. Audited.

### 5.3 Students

Implemented in migration 0004 (`20261114090004_students.sql`). Rules:

- Students sign up and sign in with a **personal email** (Supabase Auth, `auth.users`). That identity never changes for verification.
- An **institutional email is optional**. It lives on `student_profiles`, separately from the sign-in email, with its own confirmation state. A confirmed institutional email, or one whose domain is on the institution's list, **never** verifies a student by itself.
- **Verification** needs an application (institution, student ID number, ID card photo, selfie) approved by an authorised reviewer of that institution. Students can't change their own state or review their own application.
- Only verified students pass `private.require_verified_student()`, which every booking and redemption function calls first.

#### `student_profiles` (brief)

Purpose: the student side of an account, the optional institutional email, and the single source of truth for verification state.

| Field                             | Type                                              | Notes                                                                                                                                        |
| --------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_id`                         | uuid PK                                           | FK `profiles`, cascade                                                                                                                       |
| `institution_id`                  | uuid FK                                           | Chosen by the student. Locked while an application is open or they're verified                                                               |
| `campus_id`                       | uuid FK null                                      | Must belong to the institution                                                                                                               |
| `programme`, `level`, `grad_year` | text, text, smallint                              | Optional                                                                                                                                     |
| `institutional_email`             | citext null                                       | **Optional.** Format-checked only; its domain is not trusted                                                                                 |
| `institutional_email_verified_at` | timestamptz null                                  | Set when the student enters the code emailed to that address. Cleared whenever the address changes. Informational only                       |
| `student_id_hash`                 | text null                                         | HMAC-SHA256 of the institution and the normalised student ID number, set on approval. The pepper is a random value in `private.app_settings` |
| `verification_status`             | `student_verification_state` default `unverified` | Changed only by functions. `verified` past `verified_until` reads as `expired` everywhere (`private.student_state()`)                        |
| `verified_at`, `verified_until`   | timestamptz null                                  | `verified_until` = the institution's next academic year end at least 30 days away, or one year if the institution hasn't set it              |
| `current_verification_id`         | uuid FK `student_verifications` null              |                                                                                                                                              |

Constraints: partial unique `(institution_id, student_id_hash)` (one Perqly account per student ID per institution); institutional email confirmation requires an address; `verified` requires both dates.
Indexes: `(institution_id, verification_status)`, `(campus_id)`, `(current_verification_id)`.
Access: students read their own row; **no direct writes for anyone**. Changes go through `upsert_student_profile()` and `set_institutional_email()`. Reviewers read profiles of students who applied to their institution. Support and above read all.

Codes that confirm an institutional email live in `private.institutional_email_codes` (hashed, 10-minute expiry, 5 attempts, 3 sends an hour). They're issued by `issue_institutional_email_code()`, which only the **service role** may call: the server checks who the user is, issues the code with the secret key and emails it through Resend. Students confirm with `confirm_institutional_email_code()`.

#### `student_verifications` (brief)

Purpose: one row per verification application; history is kept.

| Field                               | Type                          | Notes                                                                                                                                  |
| ----------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                | uuid PK                       |                                                                                                                                        |
| `student_id`                        | uuid FK `student_profiles`    |                                                                                                                                        |
| `institution_id`                    | uuid FK                       | From the profile when the application starts                                                                                           |
| `student_id_number`                 | text null                     | Required to submit. Visible to the reviewer; never written to the audit log                                                            |
| `programme`, `level`, `grad_year`   |                               | Snapshot at submission                                                                                                                 |
| `institutional_email`               | citext null                   | Optional snapshot, only if the student chose to include it                                                                             |
| `institutional_email_confirmed`     | boolean                       | Snapshot: confirmed by code at submission. Informational only                                                                          |
| `institutional_email_domain_listed` | boolean                       | Snapshot: domain is on the institution's list. Informational only                                                                      |
| `id_card_path`, `selfie_path`       | text null                     | Required to submit. Private `verification-documents` bucket                                                                            |
| `status`                            | `verification_request_status` | `draft` → `submitted` (pending) → `approved`, `rejected` or `resubmission_requested` (→ `submitted` again); `withdrawn` by the student |
| `submitted_at`, `decided_at`        | timestamptz null              |                                                                                                                                        |
| `decided_by`                        | uuid FK `profiles` null       | The reviewer. Hidden from students                                                                                                     |
| `decided_by_type`                   | `decider_type` null           | `institution` or `perqly` (delegated review only)                                                                                      |
| `decision_reason`                   | text null                     | Rejection code: `not_enrolled`, `id_mismatch`, `photo_mismatch`, `unreadable_documents`, `duplicate_account`, `other`                  |
| `reviewer_note`                     | text null                     | Shown to the student; required for resubmission requests and "other" rejections                                                        |
| `documents_deleted_at`              | timestamptz null              | Set by the 30-day cleanup (roadmap 1.8)                                                                                                |

Constraints: partial unique `(student_id) where status in ('draft','submitted','resubmission_requested')` (one open application at a time).
Indexes: `(institution_id, status, submitted_at)` for the queue; `(student_id, created_at desc)`; `(decided_by)`.
Access: no direct writes for anyone. Students use `start_verification_application()`, `submit_verification_application()`, `withdraw_verification_application()` and read their state through `get_my_student_status()`, which never returns the reviewer's identity. Reviewers read their institution's non-draft applications and decide with `decide_verification()`: institution reviewers, institution admins **with two-factor**, or Perqly reviewers only where `review_mode = 'delegated'`. Nobody can decide their own application. `get_verification_document_paths()` audits each reviewer view; the app then creates 5-minute signed URLs, which Storage only issues to readers its policies allow.

Expiry: `public.expire_student_verifications()` (service role, scheduled with the jobs in roadmap 1.8) marks lapsed verifications `expired`. Until it runs, `private.student_state()` already treats them as expired.

### 5.4 Merchants

#### `merchant_categories` (brief)

| Field        | Type              | Notes                                           |
| ------------ | ----------------- | ----------------------------------------------- |
| `id`         | uuid PK           |                                                 |
| `slug`       | text unique       |                                                 |
| `name`       | text              |                                                 |
| `icon`       | text              | Lucide icon name                                |
| `parent_id`  | uuid FK self null | One level of subcategories (checked by trigger) |
| `sort_order` | int               |                                                 |
| `is_active`  | boolean           |                                                 |

Access: public read of active rows; admins write.

#### `merchants` (brief)

| Field                        | Type                              | Notes                                                           |
| ---------------------------- | --------------------------------- | --------------------------------------------------------------- |
| `id`                         | uuid PK                           |                                                                 |
| `slug`                       | text unique                       | Public URL `/student/merchants/<slug>`                          |
| `display_name`               | text                              |                                                                 |
| `legal_name`                 | text null                         |                                                                 |
| `category_id`                | uuid FK `merchant_categories`     | Primary category                                                |
| `description`                | text null                         | Max 2,000 chars                                                 |
| `logo_path`, `cover_path`    | text null                         | Public `merchant-media` bucket                                  |
| `phone`, `email`, `website`  | text null                         | Public business contacts                                        |
| `socials`                    | jsonb default `'{}'`              | Validated keys: instagram, tiktok, x, facebook, whatsapp        |
| `status`                     | `merchant_status` default `draft` | Changed only by functions                                       |
| `status_reason`              | text null                         |                                                                 |
| `approved_by`, `approved_at` |                                   |                                                                 |
| `created_by`                 | uuid FK `profiles`                | Owner or the Perqly staff member who created it on their behalf |
| `search_vector`              | tsvector generated                | display_name (A), description (C)                               |

Indexes: GIN `search_vector`; trigram on `display_name`; `(status)`.
Access: everyone signed in reads `approved` merchants (public columns only, through the `merchant_directory` view). Merchant users read their own merchant in any status; owners and managers update profile fields while `draft`, `rejected` or `approved` (changes to an approved profile are audited). `submit_merchant_for_review()`, `decide_merchant()` (admin, MFA), `suspend_merchant()` (admin). Staff read all.

#### `merchant_users` (brief)

Purpose: who can act for a merchant, and how.

| Field           | Type                    | Notes                               |
| --------------- | ----------------------- | ----------------------------------- |
| `id`            | uuid PK                 |                                     |
| `merchant_id`   | uuid FK                 | cascade                             |
| `user_id`       | uuid FK `profiles` null | Null while the invite is unaccepted |
| `invited_email` | citext null             |                                     |
| `role`          | `merchant_user_role`    |                                     |
| `status`        | `membership_status`     |                                     |
| `invited_by`    | uuid FK `profiles`      |                                     |

Constraints: unique `(merchant_id, user_id)`; partial unique `(merchant_id) where role = 'owner' and status = 'active'` (exactly one active owner).
Access: merchant users read their merchant's members; owners invite and remove managers and cashiers, managers invite and remove cashiers only, all through `manage_merchant_user()`. Audited.

#### `merchant_user_branches` (supporting)

Purpose: which branches a cashier can operate.

| Field              | Type    | Notes            |
| ------------------ | ------- | ---------------- |
| `merchant_user_id` | uuid FK | PK part, cascade |
| `branch_id`        | uuid FK | PK part, cascade |

A trigger checks the branch belongs to the same merchant. Access as for `merchant_users`.

#### `merchant_branches` (brief)

| Field                          | Type                  | Notes                                                                            |
| ------------------------------ | --------------------- | -------------------------------------------------------------------------------- |
| `id`                           | uuid PK               |                                                                                  |
| `merchant_id`                  | uuid FK               |                                                                                  |
| `name`                         | text                  | e.g. "Tesano, opposite GCTU main gate"                                           |
| `address_line`, `area`, `city` | text                  |                                                                                  |
| `digital_address`              | text null             |                                                                                  |
| `latitude`, `longitude`        | double precision null | Required before the branch can go live                                           |
| `phone`                        | text null             |                                                                                  |
| `opening_hours`                | jsonb                 | `{"mon":[{"open":"08:00","close":"18:00"}], ...}`, validated by a check function |
| `accepts_bookings`             | boolean default false |                                                                                  |
| `max_distance_m`               | int default 300       | Location signal threshold (not a blocker; product decision D3)                   |
| `is_active`                    | boolean default true  |                                                                                  |

Indexes: `(merchant_id)`; `(latitude, longitude)` for bounding-box pre-filters.
Access: everyone signed in reads active branches of approved merchants; owners and managers write their own; admins deactivate.

#### `merchant_documents` (supporting)

Purpose: business verification documents (registration certificate, owner ID, shop-front photo).

| Field          | Type      | Notes                                                                |
| -------------- | --------- | -------------------------------------------------------------------- |
| `id`           | uuid PK   |                                                                      |
| `merchant_id`  | uuid FK   |                                                                      |
| `type`         | text      | `registration_certificate`, `owner_id`, `shop_front`, `tin`, `other` |
| `storage_path` | text      | Private `merchant-documents` bucket                                  |
| `status`       | text      | `submitted`, `accepted`, `rejected`                                  |
| `review_note`  | text null |                                                                      |

Access: owners upload and read; Perqly reviewers and admins read via signed URLs (audited).

### 5.5 Catalogue

#### `services` (brief)

| Field              | Type                  | Notes                         |
| ------------------ | --------------------- | ----------------------------- |
| `id`               | uuid PK               |                               |
| `merchant_id`      | uuid FK               |                               |
| `name`             | text                  | e.g. "Haircut and beard trim" |
| `description`      | text null             |                               |
| `duration_minutes` | int null              | Required if bookable; 5–480   |
| `regular_price`    | numeric(12,2)         | `> 0`                         |
| `is_bookable`      | boolean default false |                               |
| `image_path`       | text null             |                               |
| `is_active`        | boolean               |                               |
| `search_vector`    | tsvector generated    |                               |

#### `service_branches` (supporting)

Purpose: where a service is performed (and therefore bookable).

| Field        | Type    | Notes            |
| ------------ | ------- | ---------------- |
| `service_id` | uuid FK | PK part, cascade |
| `branch_id`  | uuid FK | PK part, cascade |

#### `products` (brief)

| Field           | Type               | Notes                            |
| --------------- | ------------------ | -------------------------------- |
| `id`            | uuid PK            |                                  |
| `merchant_id`   | uuid FK            |                                  |
| `name`          | text               |                                  |
| `description`   | text null          |                                  |
| `sku`           | text null          | Unique per merchant when present |
| `regular_price` | numeric(12,2)      | `> 0`                            |
| `image_path`    | text null          |                                  |
| `is_active`     | boolean            |                                  |
| `search_vector` | tsvector generated |                                  |

Services and products are separate because only services can be booked and have durations. Offers point to exactly one of them.
Access (both): everyone signed in reads active items of approved merchants; owners and managers write their own. Price changes don't affect open redemption sessions, which hold a price snapshot.

### 5.6 Offers

#### `offers` (brief)

| Field                | Type                              | Notes                                       |
| -------------------- | --------------------------------- | ------------------------------------------- |
| `id`                 | uuid PK                           |                                             |
| `merchant_id`        | uuid FK                           |                                             |
| `service_id`         | uuid FK null                      |                                             |
| `product_id`         | uuid FK null                      |                                             |
| `title`              | text null                         | Defaults to the item's name in listings     |
| `description`        | text null                         |                                             |
| `conditions`         | text                              | Redemption conditions shown to students     |
| `discount_type`      | `discount_type`                   |                                             |
| `discount_value`     | numeric(12,2)                     |                                             |
| `starts_at`          | timestamptz                       |                                             |
| `ends_at`            | timestamptz null                  |                                             |
| `status`             | `offer_status` default `draft`    |                                             |
| `status_reason`      | text null                         | Moderation note                             |
| `per_student_limit`  | int default 1                     | `>= 1`                                      |
| `per_student_period` | `limit_period` default `month`    |                                             |
| `total_cap`          | int null                          | `>= 1`                                      |
| `redemption_count`   | int default 0                     | Incremented only in `finalize_redemption()` |
| `institution_scope`  | `institution_scope` default `all` |                                             |
| `published_at`       | timestamptz null                  |                                             |
| `created_by`         | uuid FK `profiles`                |                                             |

Constraints:

- `check ((service_id is null) <> (product_id is null))`: exactly one item.
- `check (discount_type <> 'percentage' or discount_value between 1 and 90)`.
- `check (discount_type <> 'fixed_amount' or discount_value > 0)`.
- `check (discount_type <> 'fixed_price' or discount_value > 0)` (the value is the student price).
- `check (ends_at is null or ends_at > starts_at)`.
- Trigger: the item belongs to the same merchant; for `fixed_amount` and `fixed_price`, `discount_value < regular_price` at save time. This is re-checked when a session prices the offer.

Indexes: `(merchant_id, status)`; partial `(status, starts_at, ends_at) where status = 'active'`; `(service_id)`; `(product_id)`.
Access: everyone signed in reads `active` offers of approved merchants whose institution scope includes their institution (through the `offer_listings` view, which computes the student price with `private.price_offer()`). Owners and managers create and edit drafts; status changes go through `submit_offer()`, `pause_offer()`, `archive_offer()` and `moderate_offer()` (staff). The first 3 offers of a merchant go to `pending_review`.

#### `offer_branches` and `offer_institutions` (supporting)

| Table                | Fields                                      | Notes                                                                     |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| `offer_branches`     | `offer_id`, `branch_id` (composite PK)      | Empty = all active branches of the merchant. Trigger checks same merchant |
| `offer_institutions` | `offer_id`, `institution_id` (composite PK) | Used only when `institution_scope = 'selected'`                           |

#### Pricing function

`private.price_offer(offer_id uuid) returns table (regular_price numeric, discount_amount numeric, final_price numeric)`:

- `regular_price` = the linked service's or product's current `regular_price`.
- Percentage: `discount_amount = round(regular_price * discount_value / 100, 2)` (half away from zero).
- Fixed amount: `discount_amount = discount_value`.
- Fixed price: `discount_amount = regular_price - discount_value` (so `final_price = discount_value`).
- For both fixed types, an offer whose value is no longer below the item's current regular price is treated as unavailable until the merchant fixes it.
- `final_price = regular_price - discount_amount`. Never negative.

This is the only place prices are calculated. The client never sends a price.

### 5.7 Bookings

#### `branch_availability_rules` (supporting)

| Field                    | Type          | Notes                                |
| ------------------------ | ------------- | ------------------------------------ |
| `id`                     | uuid PK       |                                      |
| `branch_id`              | uuid FK       |                                      |
| `service_id`             | uuid FK       | Must be linked in `service_branches` |
| `weekday`                | smallint      | 0 = Sunday … 6 = Saturday            |
| `start_time`, `end_time` | time          | `end_time > start_time`              |
| `slot_minutes`           | int           | Defaults to the service duration     |
| `capacity`               | int default 1 | Simultaneous bookings per slot       |
| `is_active`              | boolean       |                                      |

#### `availability_exceptions` (supporting)

| Field                    | Type         | Notes                             |
| ------------------------ | ------------ | --------------------------------- |
| `id`                     | uuid PK      |                                   |
| `branch_id`              | uuid FK      |                                   |
| `service_id`             | uuid FK null | Null = the whole branch           |
| `date`                   | date         |                                   |
| `is_closed`              | boolean      |                                   |
| `start_time`, `end_time` | time null    | Replacement hours when not closed |
| `reason`                 | text null    |                                   |

Access (both): signed-in users read rows for active branches (to show free slots); owners and managers write their own.

`get_available_slots(branch_id, service_id, from_date, to_date)` returns free slots: rules minus exceptions minus slots at capacity (counting `pending`, `confirmed` and `reschedule_requested` bookings), and never in the past.

#### `bookings` (brief)

| Field                                        | Type                               | Notes                                   |
| -------------------------------------------- | ---------------------------------- | --------------------------------------- |
| `id`                                         | uuid PK                            |                                         |
| `student_id`                                 | uuid FK `student_profiles`         |                                         |
| `merchant_id`                                | uuid FK                            | Denormalised for RLS and indexing       |
| `branch_id`                                  | uuid FK                            |                                         |
| `service_id`                                 | uuid FK                            |                                         |
| `offer_id`                                   | uuid FK null                       | The discount the student intends to use |
| `starts_at`, `ends_at`                       | timestamptz                        |                                         |
| `status`                                     | `booking_status` default `pending` |                                         |
| `proposed_starts_at`, `proposed_ends_at`     | timestamptz null                   | Set with `reschedule_requested`         |
| `student_note`, `merchant_note`              | text null                          | Max 500 chars                           |
| `confirmed_at`, `completed_at`, `no_show_at` | timestamptz null                   |                                         |
| `cancelled_at`                               | timestamptz null                   |                                         |
| `cancelled_by`                               | uuid FK `profiles` null            |                                         |
| `cancelled_by_party`                         | `booking_party` null               |                                         |
| `cancel_reason`                              | text null                          |                                         |
| `redemption_id`                              | uuid FK `redemptions` null         | Set when a linked redemption completes  |
| `client_request_id`                          | uuid                               | Idempotency key from the client         |

Constraints: unique `(student_id, client_request_id)`; `ends_at > starts_at`.
Indexes: `(branch_id, service_id, starts_at) where status in ('pending','confirmed','reschedule_requested')`; `(student_id, starts_at desc)`; `(merchant_id, status, starts_at)`.
Access: students read their own bookings; merchant users read bookings at branches they can operate. All writes go through functions:

| Function                                                                               | Caller                           | Effect                                                                                                                                         |
| -------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `request_booking(branch_id, service_id, starts_at, offer_id, note, client_request_id)` | Verified student                 | Checks slot availability under an advisory lock on `(branch, service, starts_at)`, rate limit (5 open bookings per student), creates `pending` |
| `respond_to_booking(booking_id, action, proposed_starts_at, note)`                     | Owner, manager, assigned cashier | `confirm`, `reject` (→ `cancelled`, party merchant), or `propose` (→ `reschedule_requested`)                                                   |
| `respond_to_reschedule(booking_id, accept boolean)`                                    | The student                      | Accept → `confirmed` at the new time (re-checks capacity); decline → `cancelled`                                                               |
| `cancel_booking(booking_id, reason)`                                                   | Student or merchant              | Any open status → `cancelled`                                                                                                                  |
| `mark_booking(booking_id, outcome)`                                                    | Merchant                         | `completed` any time after start; `no_show` from 30 minutes after start                                                                        |

A pg_cron job cancels `pending` and `reschedule_requested` bookings whose start time has passed (party `system`).

### 5.8 QR codes and redemption

The full behaviour is in the [QR redemption specification](./PERQLY_QR_REDEMPTION_SPECIFICATION.md). This section defines the storage.

#### `merchant_qr_codes` (brief)

Purpose: the static QR code displayed at a branch.

| Field                                       | Type                              | Notes                                                                                                         |
| ------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `id`                                        | uuid PK                           |                                                                                                               |
| `merchant_id`                               | uuid FK                           |                                                                                                               |
| `branch_id`                                 | uuid FK                           |                                                                                                               |
| `token`                                     | text unique                       | 22 characters of base64url from 16 random bytes (128 bits). Encoded in the QR as `https://<domain>/r/<token>` |
| `short_code`                                | text unique                       | 8 characters, Crockford base32 (no I, L, O, U), for manual entry (decision D13)                               |
| `version`                                   | int                               | Increments each time the branch gets a new code                                                               |
| `status`                                    | `qr_code_status` default `active` |                                                                                                               |
| `issued_by`                                 | uuid FK `profiles`                |                                                                                                               |
| `revoked_at`, `revoked_by`, `revoke_reason` | null                              |                                                                                                               |
| `last_scanned_at`                           | timestamptz null                  |                                                                                                               |

Constraints: partial unique `(branch_id) where status = 'active'` (one live code per branch).
Why the token isn't hashed: the token is printed at the shop for anyone to see, so it isn't a secret. Its authenticity comes from the server lookup (an unknown or revoked token is rejected), not from hiding it. Storing it in plain text lets merchants re-download their printable code. It is still readable only by the merchant's owner and managers and by Perqly admins.
Access: owners and managers read their codes and call `reissue_branch_qr(branch_id, reason)` (revokes the old one atomically). Admins can revoke any code. Students never read this table; they call `open_redemption_session()` with the token.

#### `redemption_sessions` (brief)

Purpose: a short-lived, pending redemption between a scan and finalisation.

| Field                                             | Type                                       | Notes                                                                                         |
| ------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `id`                                              | uuid PK                                    |                                                                                               |
| `public_ref`                                      | text unique                                | Transaction identifier shown to both sides, e.g. `PQ-7K3M9Q2D`                                |
| `pass_code`                                       | char(4)                                    | 4 random digits, for matching the student's screen to the merchant's list. Not a secret       |
| `client_request_id`                               | uuid                                       | Idempotency key from the student's app                                                        |
| `student_id`                                      | uuid FK `student_profiles`                 |                                                                                               |
| `institution_id`                                  | uuid FK                                    | Snapshot                                                                                      |
| `merchant_id`, `branch_id`                        | uuid FK                                    | From the QR code                                                                              |
| `qr_code_id`                                      | uuid FK `merchant_qr_codes`                |                                                                                               |
| `entry_method`                                    | text                                       | `scan` or `short_code`                                                                        |
| `offer_id`                                        | uuid FK null                               | Set when the student picks the item                                                           |
| `service_id`, `product_id`                        | uuid FK null                               | Snapshot of the offer's item                                                                  |
| `booking_id`                                      | uuid FK null                               | Optional link to the student's booking at this branch. Added by the bookings migration (0009) |
| `item_name`                                       | text null                                  | Snapshot                                                                                      |
| `regular_price`, `discount_amount`, `final_price` | numeric(12,2) null                         | Snapshot from `private.price_offer()`                                                         |
| `discount_type`, `discount_value`                 | null                                       | Snapshot                                                                                      |
| `currency`                                        | char(3) default `GHS`                      |                                                                                               |
| `status`                                          | `redemption_session_status` default `open` |                                                                                               |
| `expires_at`                                      | timestamptz                                | `open`: now + 5 minutes. After selection: now + 10 minutes (from `app_settings`)              |
| `selected_at`                                     | timestamptz null                           |                                                                                               |
| `merchant_confirmed_at`, `merchant_confirmed_by`  | null                                       |                                                                                               |
| `student_confirmed_at`                            | null                                       |                                                                                               |
| `completed_at`                                    | null                                       |                                                                                               |
| `ended_reason`                                    | text null                                  | Why it was cancelled, rejected or expired                                                     |
| `rejected_by`                                     | uuid null                                  |                                                                                               |
| `location_signal`                                 | `location_signal` default `not_shared`     |                                                                                               |
| `distance_m`                                      | int null                                   | Only the distance is stored, never coordinates                                                |

Constraints:

- unique `(student_id, client_request_id)` (idempotent creation);
- partial unique `(student_id) where status in ('open','awaiting_merchant','awaiting_student')` (one live session per student);
- `check` that price fields are all null or all set, with `final_price = regular_price - discount_amount`.

Indexes: `(branch_id, status) where status in ('awaiting_merchant','awaiting_student')` for the merchant's pending list; `(expires_at) where status in ('open','awaiting_merchant','awaiting_student')` for the expiry job; `(student_id, created_at desc)`.
Access: the student reads their own sessions; merchant users read sessions at branches they can operate (only `awaiting_*` and today's ended sessions). Direct writes are revoked for everyone; all changes go through the redemption functions. Realtime: both sides subscribe to their rows through Supabase Realtime Postgres Changes, which applies these RLS policies.

#### `redemptions` (brief)

Purpose: the permanent record of a completed discount redemption.

| Field                                                                                    | Type                                           | Notes                                                                                                |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `id`                                                                                     | uuid PK                                        |                                                                                                      |
| `session_id`                                                                             | uuid FK unique                                 | A session can produce at most one redemption                                                         |
| `transaction_ref`                                                                        | text unique                                    | = the session's `public_ref`                                                                         |
| `student_id`, `institution_id`, `merchant_id`, `branch_id`                               | uuid FK                                        |                                                                                                      |
| `offer_id`                                                                               | uuid FK                                        |                                                                                                      |
| `service_id`, `product_id`                                                               | uuid FK null                                   |                                                                                                      |
| `booking_id`                                                                             | uuid FK null                                   | Added by the bookings migration (0009)                                                               |
| `item_name`                                                                              | text                                           | Snapshot                                                                                             |
| `regular_price`, `discount_amount`, `final_price`                                        | numeric(12,2)                                  | Snapshot. `discount_amount > 0`, `final_price >= 0`, `final_price = regular_price - discount_amount` |
| `discount_type`, `discount_value`                                                        |                                                | Snapshot                                                                                             |
| `currency`                                                                               | char(3)                                        |                                                                                                      |
| `merchant_confirmed_by`, `merchant_confirmed_at`, `student_confirmed_at`, `completed_at` |                                                |                                                                                                      |
| `payment_method`                                                                         | `payment_method` null                          | Recorded by the merchant, optional                                                                   |
| `payment_status`                                                                         | `payment_record_status` default `not_recorded` | Recorded by the merchant. Not proof of payment                                                       |
| `payment_recorded_by`, `payment_recorded_at`                                             | null                                           |                                                                                                      |
| `status`                                                                                 | `redemption_status` default `completed`        |                                                                                                      |
| `void_reason`, `voided_by`, `voided_at`                                                  | null                                           | Support or admin only                                                                                |

Immutability: a trigger rejects any update except (a) the payment fields, through `record_payment()` by a merchant user of that branch within 7 days, and (b) the void fields, through `void_redemption()` by support or above. No role can delete rows.
Indexes: `(student_id, offer_id, completed_at) where status = 'completed'` for limits; `(merchant_id, completed_at desc)`; `(branch_id, completed_at desc)`; `(offer_id)`; `(student_id, completed_at desc)`.
Access: students read their own; merchant users read their merchant's (cashiers: their branches, last 7 days); institution users have no access; staff read all.

#### `student_savings` (brief)

Purpose: a running total per student, updated in the same transaction as each redemption. `redemptions` remains the source of truth; this table makes the dashboard fast.

| Field                                       | Type                    | Notes                                             |
| ------------------------------------------- | ----------------------- | ------------------------------------------------- |
| `student_id`                                | uuid PK                 | FK `student_profiles`                             |
| `total_saved`                               | numeric(12,2) default 0 | Sum of `discount_amount` of completed redemptions |
| `total_spent_at_student_price`              | numeric(12,2) default 0 | Sum of `final_price`                              |
| `redemption_count`                          | int default 0           |                                                   |
| `first_redemption_at`, `last_redemption_at` | timestamptz null        |                                                   |

Written only by `finalize_redemption()` (add) and `void_redemption()` (subtract). A nightly job compares it with `redemptions` and raises an audit alert if they differ. A view `student_savings_monthly` (security invoker) breaks savings down by month and category from `redemptions`.
Access: the student reads their own row; staff read all.

### 5.9 Engagement

#### `favourites` (brief)

| Field         | Type        | Notes            |
| ------------- | ----------- | ---------------- |
| `student_id`  | uuid FK     | PK part, cascade |
| `merchant_id` | uuid FK     | PK part, cascade |
| `created_at`  | timestamptz | No `updated_at`  |

Access: the student reads, inserts and deletes their own rows directly (RLS `student_id = auth.uid()`). Rate limit: 60 inserts an hour, through a trigger. Merchants see only counts, through analytics.

#### `reviews` (brief; later Phase 1 step)

| Field                       | Type                                | Notes                               |
| --------------------------- | ----------------------------------- | ----------------------------------- |
| `id`                        | uuid PK                             |                                     |
| `redemption_id`             | uuid FK unique                      | One review per completed redemption |
| `student_id`, `merchant_id` | uuid FK                             |                                     |
| `rating`                    | smallint                            | 1–5                                 |
| `comment`                   | text null                           | Max 1,000 chars                     |
| `status`                    | `review_status` default `published` | Staff can hide                      |
| `merchant_reply`            | text null                           |                                     |
| `merchant_replied_at`       | timestamptz null                    |                                     |

Created through `create_review()`: the redemption must be the caller's, `completed` and less than 30 days old. Everyone signed in reads published reviews (with the student's first name only); merchants reply through `reply_to_review()`.

### 5.10 Operations

#### `audit_logs` (brief)

| Field                           | Type                                   | Notes                                                                                              |
| ------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `id`                            | bigint generated always as identity PK |                                                                                                    |
| `occurred_at`                   | timestamptz default now()              | No `updated_at`                                                                                    |
| `actor_id`                      | uuid null                              | Null for system jobs                                                                               |
| `actor_context`                 | text                                   | e.g. `student`, `merchant:cashier`, `institution:reviewer`, `platform:admin`, `system`             |
| `action`                        | text                                   | e.g. `verification.approved`, `verification.document_viewed`, `redemption.completed`, `qr.revoked` |
| `entity_type`, `entity_id`      | text, uuid                             |                                                                                                    |
| `institution_id`, `merchant_id` | uuid null                              | For scoped reads                                                                                   |
| `before`, `after`               | jsonb null                             | Changed fields only; never ID images or OTPs                                                       |
| `metadata`                      | jsonb                                  | Request ID, IP hash, user agent family                                                             |

Append-only: no `update` or `delete` grant to any role, and a trigger raises on attempts. Written only by `private.write_audit()`. Implemented in migration 0001.
Indexes: `(entity_type, entity_id, occurred_at)`; `(actor_id, occurred_at)`; `(institution_id, occurred_at) where institution_id is not null`; `(merchant_id, occurred_at) where merchant_id is not null`.
Access: institution admins read rows with their `institution_id` (reviewer activity); merchant owners read rows with their `merchant_id`; admins read all. Retention: 24 months, then archived.

#### `disputes` (supporting)

Purpose: student or merchant reports about a redemption or booking, for admin investigation.

| Field                         | Type               | Notes                   |
| ----------------------------- | ------------------ | ----------------------- |
| `id`                          | uuid PK            |                         |
| `redemption_id`, `booking_id` | uuid FK null       | At least one            |
| `opened_by`                   | uuid FK `profiles` |                         |
| `opened_by_party`             | text               | `student` or `merchant` |
| `reason`                      | text               | Preset code             |
| `details`                     | text               |                         |
| `status`                      | `dispute_status`   |                         |
| `assigned_to`                 | uuid null          | Staff                   |
| `resolution`                  | text null          |                         |
| `resolved_at`                 | timestamptz null   |                         |

Access: the opener reads their own disputes; support and above read and resolve all.

#### `notifications` (supporting)

In-app notifications (booking updates, verification decisions, redemption completed). Fields: `id`, `user_id`, `type`, `title`, `body`, `data jsonb`, `read_at`, `email_status` (`none`, `queued`, `sent`, `failed`), `created_at`. Users read and mark their own rows as read; only functions insert. Email delivery runs from a queue (decision D11).

#### `rate_limit_events` (supporting)

Lives in the `private` schema (not exposed by the Data API). Fields: `id bigint identity`, `subject` (user ID or IP hash), `action`, `created_at`. Index `(subject, action, created_at)`. No client access; written by `private.check_rate_limit()`. A daily job deletes rows older than 2 days.

#### `app_settings` (supporting)

Lives in the `private` schema; functions read it with `private.setting_int()`. Key-value settings read by functions: session windows, limits and thresholds. Fields: `key text PK`, `value jsonb`, `updated_by`. Admins write; functions read. Seeded values:

| Key                                     | Default |
| --------------------------------------- | ------- |
| `redemption.select_window_seconds`      | 300     |
| `redemption.confirm_window_seconds`     | 600     |
| `redemption.max_sessions_per_hour`      | 10      |
| `qr.max_scans_per_minute`               | 6       |
| `qr.max_short_code_attempts_per_10_min` | 5       |
| `booking.max_open_per_student`          | 5       |
| `verification.otp_max_per_hour`         | 3       |

## 6. Access summary

R = read, W = direct write allowed by RLS, F = only through a function, – = no access.

| Table                                              | Guest      | Student                                                          | Merchant user                                                        | Institution reviewer                                   | Platform staff                         |
| -------------------------------------------------- | ---------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------- |
| institutions, campuses, merchant_categories        | R (active) | R                                                                | R                                                                    | R                                                      | R; F admin                             |
| institution_email_domains                          | –          | R (active)                                                       | –                                                                    | R own                                                  | R; F admin                             |
| institution_reviewers                              | –          | –                                                                | –                                                                    | R own institution; F institution admin                 | R; F admin                             |
| profiles                                           | –          | R own; W own name/photo                                          | First name + photo of students in a live session at their branch (F) | Applicants' name + photo (F)                           | R support+                             |
| student_profiles                                   | –          | R own; F (incl. optional institutional email)                    | –                                                                    | R applicants to own institution                        | R support+                             |
| student_verifications                              | –          | Own, through `get_my_student_status()` (no reviewer identity); F | –                                                                    | R + decide F, own institution (admins with two-factor) | R support+; decide F only if delegated |
| merchants, merchant_branches                       | –          | R approved                                                       | R own; W owner/manager; status F                                     | R approved                                             | R; status F                            |
| merchant_users, merchant_user_branches             | –          | –                                                                | R own merchant; F                                                    | –                                                      | R; F admin                             |
| merchant_documents                                 | –          | –                                                                | R/W owner                                                            | –                                                      | R reviewer+                            |
| services, products, service_branches               | –          | R active                                                         | R own; W owner/manager                                               | –                                                      | R                                      |
| offers, offer_branches, offer_institutions         | –          | R active and eligible                                            | R own; W drafts; status F                                            | –                                                      | R; moderation F                        |
| branch_availability_rules, availability_exceptions | –          | R                                                                | R own; W owner/manager                                               | –                                                      | R                                      |
| bookings                                           | –          | R own; F                                                         | R own branches; F                                                    | –                                                      | R support+                             |
| merchant_qr_codes                                  | –          | –                                                                | R owner/manager; F                                                   | –                                                      | R; revoke F admin                      |
| redemption_sessions                                | –          | R own; F                                                         | R own branches; F                                                    | –                                                      | R support+                             |
| redemptions                                        | –          | R own                                                            | R own merchant (cashier: own branches, 7 days); payment F            | –                                                      | R; void F support+                     |
| student_savings                                    | –          | R own                                                            | –                                                                    | –                                                      | R                                      |
| favourites                                         | –          | R/W own                                                          | – (counts via analytics)                                             | –                                                      | R support+                             |
| reviews                                            | –          | R published; F                                                   | R own; reply F                                                       | –                                                      | R; hide F                              |
| audit_logs                                         | –          | –                                                                | R own merchant (owner)                                               | R own institution (admin)                              | R admin                                |
| disputes                                           | –          | R own; F                                                         | R own; F                                                             | –                                                      | R/F support+                           |
| notifications                                      | –          | R own; mark read W                                               | R own; mark read W                                                   | R own; mark read W                                     | R own                                  |
| rate_limit_events, app_settings                    | –          | –                                                                | –                                                                    | –                                                      | app_settings R/F admin                 |

Example policy shape (cashier sees pending sessions only at their branches):

```sql
create policy "merchant users read sessions at their branches"
on public.redemption_sessions for select to authenticated
using (
  (select private.can_operate_branch(branch_id))
  and (status in ('awaiting_merchant', 'awaiting_student') or created_at >= date_trunc('day', now()))
);
```

## 7. Database functions (the API surface)

The app calls these with `supabase.rpc()` from Next.js Server Actions or Route Handlers, never with ad-hoc table writes. Every function validates its input, checks the caller's role, applies rate limits, writes audit rows where listed, and returns a typed result or raises a named error (`not_verified`, `qr_invalid`, `limit_reached`, `session_expired`, `rate_limited`, …) that the app turns into a plain-language message.

| Area         | Function                                                                                                                                                                                                                                                 | Caller                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Students     | `upsert_student_profile`, `set_institutional_email`, `confirm_institutional_email_code`, `start_verification_application`, `submit_verification_application`, `withdraw_verification_application`, `get_my_student_status`, `get_student_benefit_access` | Student                                                |
| Verification | `decide_verification`, `get_verification_document_paths` (the queue is a plain RLS-protected read)                                                                                                                                                       | Institution reviewer (or Perqly reviewer if delegated) |
| Server only  | `issue_institutional_email_code`, `expire_student_verifications`                                                                                                                                                                                         | Service role                                           |
| Institutions | `upsert_institution`, `appoint_institution_reviewer`, `remove_institution_reviewer`                                                                                                                                                                      | Admin, institution admin                               |
| Merchants    | `create_merchant`, `create_merchant_on_behalf`, `submit_merchant_for_review`, `decide_merchant`, `suspend_merchant`, `manage_merchant_user`, `accept_merchant_invite`                                                                                    | Merchant owner, admin                                  |
| Offers       | `submit_offer`, `pause_offer`, `archive_offer`, `moderate_offer`                                                                                                                                                                                         | Owner/manager, staff                                   |
| Bookings     | `get_available_slots`, `request_booking`, `respond_to_booking`, `respond_to_reschedule`, `cancel_booking`, `mark_booking`                                                                                                                                | Student, merchant                                      |
| QR           | `reissue_branch_qr`, `revoke_qr_code`                                                                                                                                                                                                                    | Owner/manager, admin                                   |
| Redemption   | `open_redemption_session`, `select_redemption_item`, `merchant_confirm_redemption`, `merchant_reject_redemption`, `student_confirm_redemption`, `cancel_redemption_session`, `record_payment`, `void_redemption`                                         | See the QR specification                               |
| Engagement   | `create_review`, `reply_to_review`, `open_dispute`, `resolve_dispute`                                                                                                                                                                                    | Student, merchant, support                             |
| Admin        | `set_account_suspension`, `set_platform_role`; `get_my_context` (any signed-in user: routing data)                                                                                                                                                       | Admin, super admin (MFA)                               |

## 8. Storage buckets

| Bucket                   | Visibility  | Path rule                                                              | Notes                                                                                                                                                                                                                                                       |
| ------------------------ | ----------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verification-documents` | Private     | `{student_id}/{application_id}/{id-card or selfie}.{webp, jpg or png}` | Created by migration 0004 (5 MB, images only). Students write only to their own open application's folder. Only the student and authorised reviewers of that institution can read, reviewers through 5-minute signed URLs. Deleted 30 days after a decision |
| `avatars`                | Private     | `{user_id}/avatar.webp`                                                | Owner writes. Merchants see it only through a short signed URL during a live session at their branch                                                                                                                                                        |
| `merchant-media`         | Public read | `merchants/{merchant_id}/…`                                            | Owners and managers write. Logos, covers, item images                                                                                                                                                                                                       |
| `merchant-documents`     | Private     | `{merchant_id}/…`                                                      | Owners upload; Perqly reviewers read through signed URLs                                                                                                                                                                                                    |

Images are resized and converted to WebP in the browser before upload (max 1600 px, 5 MB limit enforced by bucket settings).

## 9. Scheduled jobs (pg_cron)

| Job                            | Schedule         | What it does                                                                          |
| ------------------------------ | ---------------- | ------------------------------------------------------------------------------------- |
| `expire_redemption_sessions`   | Every minute     | `open`/`awaiting_*` past `expires_at` → `expired`                                     |
| `expire_offers`                | Every 15 minutes | `active` offers past `ends_at`, or at `total_cap` → `expired`                         |
| `close_stale_bookings`         | Every 15 minutes | Past `pending`/`reschedule_requested` → `cancelled` (system)                          |
| `expire_verifications`         | Daily 02:00      | `verified_until < now()` → `expired`; notify 30 days ahead                            |
| `purge_verification_documents` | Daily 02:30      | Delete ID photos and selfies 30 days after the decision; redact the student ID number |
| `purge_rate_limit_events`      | Daily 03:00      | Delete events older than 2 days                                                       |
| `reconcile_student_savings`    | Daily 03:30      | Compare `student_savings` with `redemptions`; audit any mismatch                      |

Expiry is also checked inside every function, so a late job never lets an expired session or offer through.

## 10. Migration plan and considerations

1. **Projects:** create `perqly-staging` first, then `perqly-production`, both on the free plan. Free projects pause after 7 days of inactivity and have no automatic backups, so schedule a nightly `pg_dump` (a GitHub Action is enough) before the pilot.
2. **Files:** one migration per domain, named `<timestamp>_<name>.sql` as the Supabase CLI expects (for example `20261114090001_foundation.sql`; the short numbers below are for reading), in dependency order, each shipping its tables, RLS policies, functions and pgTAP tests together:
   1. `0001_extensions_and_helpers.sql`: extensions, `private` schema, `set_updated_at`, `write_audit`, `check_rate_limit`, `audit_logs`, `rate_limit_events`, `app_settings`, enums
   2. `0002_identity.sql`: `profiles`, sign-up trigger, `platform_staff`, role helpers
   3. `0003_institutions.sql`: `institutions`, `institution_email_domains`, `campuses`, `institution_reviewers`
   4. `0004_students.sql`: `student_profiles`, `student_verifications`, verification functions, storage policies
   5. `0005_merchants.sql`: `merchant_categories`, `merchants`, `merchant_users`, `merchant_user_branches`, `merchant_branches`, `merchant_documents`
   6. `0006_catalogue_and_offers.sql`: `services`, `service_branches`, `products`, `offers`, `offer_branches`, `offer_institutions`, `price_offer`, listing views, search indexes
   7. `0007_favourites.sql`
   8. `0008_qr_and_redemption.sql`: `merchant_qr_codes`, `redemption_sessions`, `redemptions`, `student_savings`, redemption functions, Realtime publication, the session expiry job. Walk-in redemption ships first, so this migration has no booking columns
   9. `0009_bookings.sql`: availability tables, `bookings`, booking functions, then `alter table` to add `booking_id` to `redemption_sessions` and `redemptions` and the booking step to `finalize_redemption()`
   10. `0010_jobs.sql`: the remaining pg_cron schedules
   11. `0011_reviews_and_disputes.sql` (later step)
3. **Seed:** `seed.sql` holds only reference data: GCTU (status `pilot`), its campus and email domain once confirmed, categories, and `app_settings`. **No fake merchants, offers or students** go into staging or production. Local development uses a separate `supabase/seed.local.sql` with obviously fictional data.
4. **Types:** generate `src/types/database.ts` with `supabase gen types typescript` after each migration; CI checks it's current.
5. **Forward-only:** migrations are never edited once applied to staging. Fixes are new migrations.
6. **Data protection:** register with the Data Protection Commission before real student data reaches production.

## 11. Mapping from the earlier plan's schema

The earlier plan's schema was never built. These are its tables and what replaces them:

| Earlier plan                                                                                         | Phase 1                                                            | Change                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`, `platform_staff`                                                                         | Same                                                               | Unchanged                                                                                                                                                   |
| `institutions`, `institution_email_domains`, `campuses`                                              | Same                                                               | Unchanged                                                                                                                                                   |
| `institution_members`                                                                                | `institution_reviewers`                                            | Renamed to the brief's name                                                                                                                                 |
| `student_profiles`, `student_verifications`                                                          | Same                                                               | Status enum split into profile state and request status                                                                                                     |
| `categories`                                                                                         | `merchant_categories`                                              | Renamed; categorises merchants (and their offers through the merchant)                                                                                      |
| `merchant_members`                                                                                   | `merchant_users` (+ `merchant_user_branches`)                      | Renamed; cashiers can cover several branches                                                                                                                |
| `merchant_branches`, `merchant_documents`                                                            | Same                                                               | QR fields moved to `merchant_qr_codes`                                                                                                                      |
| —                                                                                                    | `services`, `products`, `service_branches`                         | New                                                                                                                                                         |
| `offers`                                                                                             | `offers`                                                           | Now tied to one service or product; percentage, fixed-amount and fixed-price discounts; `min_spend`, `max_discount`, BOGO, freebie and custom types removed |
| `offer_branches`, `offer_institutions`                                                               | Same                                                               | Unchanged                                                                                                                                                   |
| `saved_offers`                                                                                       | `favourites`                                                       | Saves merchants, not offers                                                                                                                                 |
| —                                                                                                    | `branch_availability_rules`, `availability_exceptions`, `bookings` | New                                                                                                                                                         |
| Branch QR key in Vault + `qr_key_version` on branches                                                | `merchant_qr_codes`                                                | One table, revocable, re-downloadable                                                                                                                       |
| `redemptions` (pass + record)                                                                        | `redemption_sessions` + `redemptions` + `student_savings`          | Pending and final are separated; savings totals are kept                                                                                                    |
| `reports`                                                                                            | `disputes`                                                         | Narrowed to redemption and booking disputes for now                                                                                                         |
| `audit_logs`                                                                                         | Same                                                               | Adds institution and merchant scoping columns                                                                                                               |
| `plans`, `merchant_subscriptions`, `invoices`, `payment_events`, `promotions`                        | Not in Phase 1                                                     | Merchant billing comes after the pilot                                                                                                                      |
| `offer_events`, `offer_stats_daily`, `fraud_flags`, `push_subscriptions`, `notification_preferences` | Not in Phase 1 schema                                              | Added when analytics, fraud rules and web push are built                                                                                                    |
