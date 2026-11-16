# Supabase setup and environment variables

**The settings each Supabase project needs, how to create the new staging project, and the 11 environment variables the app reads today (12 after task 1.3).**

|         |                                                                                                                                                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status  | **Proposed.** Staging doesn't exist yet; you create it in task 1.2. Production's current dashboard settings have **not** been checked against this document. Items marked _unverified_ must be checked, read-only, in task 1.2. Claude hasn't applied anything here |
| Updated | 2026-11-16                                                                                                                                                                                                                                                          |
| Related | `docs/PRODUCTION_SEPARATION.md` (why and in what order), `docs/BACKUPS.md`                                                                                                                                                                                          |

## 1. The two projects

|                | Production                                                              | Staging                                    |
| -------------- | ----------------------------------------------------------------------- | ------------------------------------------ |
| Dashboard name | `perqly-production` (today shown as `perqly-staging`; relabel it first) | `perqly-staging` (new)                     |
| Ref            | `wktijbmvogxbbwwvqlhq` (unchanged)                                      | assigned when created                      |
| Region         | London (`eu-west-2`)                                                    | London (`eu-west-2`)                       |
| Plan           | Free                                                                    | Free                                       |
| Serves         | perqly.online                                                           | Vercel Preview and Development, laptops    |
| Data           | Real students and businesses                                            | Testers and businesses named `TEST …` only |

Rules:

1. Nothing is shared between them: database password, API keys, auth settings, Google client, Resend key and push keys are all separate.
2. **Production settings are only changed on purpose,** with a note in the pull request or change log. Change staging first, check it, then production.
3. Secrets never go into git, chat or issues. `.env.local` is git-ignored; `.env.example` holds names and placeholders only. `src/lib/env.ts` refuses a secret key placed in a `NEXT_PUBLIC_` variable.

## 2. Create `perqly-staging` (task 1.2, you)

1. **Relabel production first.** Supabase → the live project → Project Settings → General → Project name: `perqly-production`. Only the label changes.
2. **New project** in the same organization:

| Setting           | Value                                                                           | Why                                                           |
| ----------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Name              | `perqly-staging`                                                                |                                                               |
| Database password | Generate in the dashboard; save in your password manager as "Perqly staging DB" | Different from production's                                   |
| Region            | **West EU (London)** `eu-west-2`                                                | Same as production; nearest to Accra; next to Vercel's `lhr1` |
| Postgres          | Default (17)                                                                    | Matches `supabase/config.toml`                                |
| Data API          | On; expose `public` only                                                        | The `private` schema must never be exposed                    |

3. Leave the database empty. The **Migrate staging** workflow (task 1.4) builds it from `supabase/migrations`. Don't paste SQL into it by hand, so the two projects can't drift.

## 3. Dashboard settings for both projects

Set these on staging when you create it. For production, read its current settings once (read-only) in task 1.2 and note any difference. Don't change production yet: each difference is decided separately.

### 3.1 Authentication → Sign In / Providers

| Setting                            | Value                                            |
| ---------------------------------- | ------------------------------------------------ |
| Allow new users to sign up         | On                                               |
| Anonymous sign-ins, manual linking | Off                                              |
| Email provider                     | On; confirm email **on**; secure email change on |
| Email OTP                          | expiry **600** s, length **6**                   |
| Phone provider                     | Off                                              |
| Google                             | On (section 3.7), with each project's own client |
| Other social providers             | Off                                              |

### 3.2 Authentication → URL Configuration

**What the app sends** (checked in the code on 2026-11-16):

| Sign-in            | Redirect address the app asks Supabase for                                 | Where it's built                                                                   |
| ------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Email code or link | `<origin of the request>/auth/confirm`                                     | `src/features/auth/actions.ts` via `getRequestOrigin()` (`src/lib/auth/origin.ts`) |
| Google             | `<origin of the page>/auth/callback`, sometimes followed by `?next=<path>` | `src/features/auth/components/google-button.tsx`                                   |

Because the address comes from whichever domain the person is on, **every domain that serves the app and allows sign-in must be on that project's list**. Otherwise Supabase falls back to the Site URL.

**How Supabase matches** (Supabase documentation): `*` matches any characters except `.` and `/`; `**` matches anything, including `/`. Supabase suggests `https://*-<team-or-account-slug>.vercel.app/**` for Vercel previews, and exact paths for production.

|               | Production (proposed)                                                                  | Staging (proposed)                                                                                             |
| ------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Site URL      | `https://perqly.online`                                                                | the stable staging address (section 5, `NEXT_PUBLIC_SITE_URL`)                                                 |
| Redirect URLs | `https://perqly.online/**`, plus any other domain that serves production, if confirmed | `http://localhost:3000/**`, `http://127.0.0.1:3000/**` and `https://perqly-*-<vercel team slug>.vercel.app/**` |

Notes:

- **Production's current list is _unverified_.** In task 1.2, read it and also check in Vercel which domains serve production: for example `www.perqly.online`, and `perqly-eta.vercel.app`, which the code still names (see section 5). Each one that serves the app without redirecting to `perqly.online` either needs an entry, or should be made to redirect.
- **Preview pattern:** `perqly-*-…` is narrower than Supabase's suggestion. It matches only this project's previews, for example `perqly-<hash>-<team>.vercel.app` and `perqly-git-<branch>-<team>.vercel.app`, and not other projects in the same Vercel team. The team slug is _unverified_; copy it from a real Preview address.
- **Tightening production to exact paths** (`https://perqly.online/auth/confirm`, `https://perqly.online/auth/callback**`) follows Supabase's advice, but test it on staging first. The Google `?next=` parameter must still match.
- `supabase/config.toml` (local only) already lists `http://localhost:3000/**` and `http://127.0.0.1:3000/**`.
- Production's list must not contain localhost or preview addresses. Staging's must not contain production domains.

### 3.3 Email templates

Both projects use the files in the repository: **Confirm signup** ← `supabase/templates/confirmation.html`, **Magic Link** ← `supabase/templates/magic_link.html`, subject `Your Perqly code` for both. Change the file first, then paste into staging, check, then production.

### 3.4 SMTP (Resend)

| Setting                | Value                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Host / port / username | `smtp.resend.com` / `465` / `resend`                                                                                   |
| Password               | A Resend API key restricted to sending, **one key per project**                                                        |
| Sender                 | Production: the current sender, unchanged. Staging: sender name "Perqly Staging", so testers can tell the emails apart |
| Minimum interval       | 60 s                                                                                                                   |

Resend's free plan allows 100 emails a day across both projects (checked 2026-11-14). Keep staging testing light, and review before the full GCTU launch.

### 3.5 Rate limits, MFA and other settings

| Area                                  | Setting                                                                                                                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rate limits                           | Emails 30 an hour; sign-ins and verifications 30 per 5 minutes per IP (defaults)                                                                                                                    |
| Multi-factor                          | TOTP on; phone MFA off. The app requires TOTP for staff and business owners and managers                                                                                                            |
| Database → SSL                        | Enforce SSL on                                                                                                                                                                                      |
| Extensions, Storage buckets, Realtime | Nothing by hand: migrations create `pgcrypto`, `citext`, `pg_trgm`, the four buckets (`pass-photos`, `verification-documents`, `merchant-photos`, `institution-logos`) and the realtime publication |
| Advisors                              | Run Security Advisor after every migration; no errors allowed (expected warnings: `docs/PRODUCTION_SEPARATION.md`, section 9)                                                                       |

### 3.6 API keys

| Key                              | Use                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| Publishable (`sb_publishable_…`) | Browser and server. RLS protects the data                                            |
| Secret (`sb_secret_…`)           | Server only: institutional-email codes, decision emails, daily job, account deletion |
| Legacy `anon` / `service_role`   | Not used                                                                             |

### 3.7 Google sign-in

Each project gets **its own OAuth client** in Google Cloud, so a staging problem can't affect production sign-in.

|                               | Production client (existing)                                                                                                                                           | Staging client (new)                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Authorised JavaScript origins | `https://perqly.online`                                                                                                                                                | `http://localhost:3000`, your Preview address        |
| Authorised redirect URI       | `https://wktijbmvogxbbwwvqlhq.supabase.co/auth/v1/callback`                                                                                                            | `https://<staging ref>.supabase.co/auth/v1/callback` |
| Consent screen                | **Testing**, as recorded in the Phase 0 audit (2026-11-16): only listed test users can sign in. _Unverified_ since; check in task 1.2. Publishing is part of task 1.14 | Can stay in Testing, with testers listed             |

Paste each client's ID and secret into its own Supabase project only (Authentication → Providers → Google). They are never stored in Vercel or the repository. The production client secret is rotated in task 1.8 because it has been handled outside a password manager.

## 4. Migrations

The full workflow is in `docs/PRODUCTION_SEPARATION.md`, section 5. In short:

- **Today:** you run `npx supabase db push` against production from your laptop (or `scripts/db/push.ps1`).
- **After task 1.4:** merging to `main` migrates staging automatically; production is migrated only by the **Migrate production** workflow, and only for the exact commit staging was migrated with, after every check in `docs/PRODUCTION_SEPARATION.md`, section 6, including a verified fresh backup. Manual `db push` to production stops, except in an emergency you've decided on.
- **Writing migrations:** expand, then contract; never insert test accounts; every migration comes with a pgTAP test in `supabase/tests`.

### First super admin on staging

Checked against the role-management code (migration `20261114090002_identity.sql`):

- Roles live in `public.platform_staff`. Its `user_id` must match a row in `public.profiles`, which the `on_auth_user_created` trigger creates automatically at first sign-in.
- The normal way to grant a role is the function `public.set_platform_role` (Admin → Users). It refuses unless the caller is already a super admin who has passed two-factor (`private.is_staff('super_admin')`), and it writes `platform.role_changed` to the audit log. A brand-new staging project has no super admin, so the first one has to be added directly. The SQL editor runs as the `postgres` role, which isn't limited by the table's row-level security.

Steps:

1. Sign in to a **staging** Preview once with your own email, so your profile exists.
2. In the **staging** SQL editor (check the project name at the top first), run this as one statement block. It stops if the email matches no account, or more than one:

   ```sql
   do $$
   declare v_id uuid;
   begin
     select id into strict v_id from auth.users where email = '<your staging email>';
     insert into public.platform_staff (user_id, role) values (v_id, 'super_admin');
     perform private.write_audit('platform.role_changed', 'platform:bootstrap', 'profile', v_id,
       jsonb_build_object('role', null), jsonb_build_object('role', 'super_admin'));
   end $$;
   ```

   `granted_by` stays empty, and the audit entry has no actor, which marks it as the one-off bootstrap.

3. Open `/admin`. You're sent to `/login/mfa` to set up an authenticator app. Staff pages and staff functions need two-factor (`aal2`).
4. Grant every later role from Admin → Users, never by SQL.

Never run this on production. Production's super admin already exists; confirm it read-only in Admin → Users.

## 5. Environment variables

The app reads **11 variables today**: 4 public (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`) and 7 server-only (`SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CRON_SECRET`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PAYSTACK_SECRET_KEY`). This was checked by searching the code for `process.env`. Task 1.3 adds a 12th, `NEXT_PUBLIC_APP_ENV`. `NODE_ENV` is set by Next.js and isn't configured.

Vercel: project `perqly` → Settings → Environment Variables. A production value is ticked for **Production** only; a staging value for **Preview** and **Development** only.

| Variable                               | Browser? | Production                                 | Staging (Preview, Development, `.env.local`)                           | Notes                                                                                                             |
| -------------------------------------- | -------- | ------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Yes      | `https://wktijbmvogxbbwwvqlhq.supabase.co` | `https://<staging ref>.supabase.co`                                    | Required                                                                                                          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes      | production publishable key                 | staging publishable key                                                | Required; must start `sb_publishable_`                                                                            |
| `NEXT_PUBLIC_SITE_URL`                 | Yes      | `https://perqly.online`                    | the stable staging address (Vercel) / `http://localhost:3000` (laptop) | Metadata, sitemap, push and email links, billing return, QR codes. **Must be set on staging**; see the note below |
| `NEXT_PUBLIC_APP_ENV`                  | Yes      | `production`                               | `staging`                                                              | **New in task 1.3.** Shows a Staging banner and keeps search engines off staging                                  |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`         | Yes      | current key, never changed                 | separate staging key                                                   | Push notifications                                                                                                |
| `SUPABASE_SECRET_KEY`                  | No       | production secret key                      | staging secret key                                                     | Optional; features that need it switch off without it                                                             |
| `RESEND_API_KEY`                       | No       | production Resend key                      | staging Resend key                                                     | Optional                                                                                                          |
| `RESEND_FROM_EMAIL`                    | No       | current sender                             | "Perqly Staging" sender                                                | With `RESEND_API_KEY`                                                                                             |
| `CRON_SECRET`                          | No       | random, 32+ characters                     | unset                                                                  | Daily job at 02:30 UTC (`vercel.json`); Vercel runs crons on Production only                                      |
| `VAPID_PRIVATE_KEY`                    | No       | current key, marked Sensitive              | separate staging key                                                   | Generate with `npx web-push generate-vapid-keys` on your own machine                                              |
| `VAPID_SUBJECT`                        | No       | `mailto:` an address you read              | same                                                                   |                                                                                                                   |
| `PAYSTACK_SECRET_KEY`                  | No       | live key, only once Paystack is activated  | `sk_test_…` only                                                       | Billing (`docs/BILLING.md`)                                                                                       |

**Why `NEXT_PUBLIC_SITE_URL` must be set on staging.** The code (checked on 2026-11-16) falls back as follows when it's missing:

- `getSiteUrl()` (`src/lib/env.ts`) uses `http://localhost:3000`. Notification links (`src/lib/notifications/dispatch.ts`), the billing return address (`src/features/billing/actions.ts`), the sitemap, robots and page metadata would point at localhost.
- The QR code page (`src/app/merchant/codes/page.tsx`) uses `https://perqly-eta.vercel.app`, and the scanner (`src/app/student/scan/page.tsx`) always accepts that address. A QR code printed from staging would send students to a production address.

So staging needs a single stable address. The simplest is the branch address of `main` in Vercel's Preview environment, for example `https://perqly-git-main-<vercel team slug>.vercel.app` (_unverified_; copy the real one). Removing the hard-coded `perqly-eta.vercel.app` fallback is a code change, proposed for task 1.3. It isn't made here.

Never in Vercel or the repository: database passwords, Google client secrets, the backup passphrase, your Supabase access token.

GitHub secrets (task 1.2 creates them, task 1.4 uses them). Where they live depends on the repository's visibility and your GitHub plan (`docs/BACKUPS.md`, section 3.1):

| Secret                    | `staging`                  | `production`                                                                        | `production-backup` (`main` only) |
| ------------------------- | -------------------------- | ----------------------------------------------------------------------------------- | --------------------------------- |
| `SUPABASE_DB_URL`         | staging Session pooler URL | production Session pooler URL                                                       | same as `production`              |
| `BACKUP_PASSPHRASE`       | —                          | backup passphrase (`docs/BACKUPS.md`)                                               | same as `production`              |
| deploy key (private half) | —                          | the key allowed to move `production` (`docs/PRODUCTION_SEPARATION.md`, section 6.1) | —                                 |

## 6. Local development

- **Normal:** `.env.local` with staging values. Never production values.
- **Fully local:** `npx supabase start` (needs Docker); `supabase/config.toml` mirrors the settings above and `supabase/seed.sql` loads sample data. Database tests: `npx supabase test db`.

## 7. Checklist for task 1.2

- [ ] Live project relabelled `perqly-production`; ref unchanged
- [ ] `perqly-staging` created in London; Data API exposes `public` only
- [ ] Staging auth, URLs, templates, MFA and rate limits set as in section 3
- [ ] Staging Google client and Resend key created and entered in staging only
- [ ] Repository visibility, GitHub plan and collaborators confirmed (read-only)
- [ ] GitHub environments or secrets created as `docs/BACKUPS.md`, section 3.1, says for that plan
- [ ] Failure emails for Actions switched on for your account
- [ ] Production's URL list, served domains, Google consent screen status and super admin read and noted (read-only)
- [ ] Production settings compared with section 3; differences noted, not yet changed
