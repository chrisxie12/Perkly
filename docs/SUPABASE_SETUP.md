# Supabase setup and environment variables

**The settings each Supabase project needs, how to create the new staging project, and every environment variable the app uses.**

|         |                                                                                                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status  | **Proposed.** Production already runs with these settings. Staging does not exist yet; you create it in task 1.2. Nothing here has been applied by Claude |
| Updated | 2026-11-16                                                                                                                                                |
| Related | `docs/PRODUCTION_SEPARATION.md` (why and in what order), `docs/BACKUPS.md`                                                                                |

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

Set these on staging when you create it. They should already match production; check production against this list once, read-only, and note any difference rather than changing it straight away.

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

|               | Production                      | Staging                                                                                                                                  |
| ------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Site URL      | `https://perqly.online`         | your stable Preview address, or `http://localhost:3000` until there is one                                                               |
| Redirect URLs | `https://perqly.online/**` only | `http://localhost:3000/**` and the Vercel Preview pattern for the `perqly` project (`https://perqly-*-<vercel team slug>.vercel.app/**`) |

Production's list must not contain localhost or preview addresses. Staging's must not contain perqly.online.

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

|                               | Production client (existing)                                | Staging client (new)                                 |
| ----------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| Authorised JavaScript origins | `https://perqly.online`                                     | `http://localhost:3000`, your Preview address        |
| Authorised redirect URI       | `https://wktijbmvogxbbwwvqlhq.supabase.co/auth/v1/callback` | `https://<staging ref>.supabase.co/auth/v1/callback` |
| Consent screen                | Published                                                   | Can stay in Testing, with testers listed             |

Paste each client's ID and secret into its own Supabase project only (Authentication → Providers → Google). They are never stored in Vercel or the repository. The production client secret is rotated in task 1.8 because it has been handled outside a password manager.

## 4. Migrations

The full workflow is in `docs/PRODUCTION_SEPARATION.md`, section 5. In short:

- **Today:** you run `npx supabase db push` against production from your laptop (or `scripts/db/push.ps1`).
- **After task 1.4:** merging to `main` migrates staging automatically; production is migrated only by the **Migrate production** workflow, after your approval and a fresh backup. Manual `db push` to production stops, except in an emergency you've decided on.
- **Writing migrations:** expand, then contract; never insert test accounts; every migration comes with a pgTAP test in `supabase/tests`.

### First super admin on staging

Platform roles can only be granted by an existing super admin. After signing in to staging once, run this in the **staging** SQL editor with your own staging email:

```sql
insert into public.platform_staff (user_id, role)
select id, 'super_admin' from auth.users where email = '<your staging email>';
```

Production already has its super admin; don't run this there.

## 5. Environment variables

Vercel: project `perqly` → Settings → Environment Variables. A production value is ticked for **Production** only; a staging value for **Preview** and **Development** only.

| Variable                               | Browser? | Production                                 | Staging (Preview, Development, `.env.local`)      | Notes                                                                            |
| -------------------------------------- | -------- | ------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Yes      | `https://wktijbmvogxbbwwvqlhq.supabase.co` | `https://<staging ref>.supabase.co`               | Required                                                                         |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes      | production publishable key                 | staging publishable key                           | Required; must start `sb_publishable_`                                           |
| `NEXT_PUBLIC_SITE_URL`                 | Yes      | `https://perqly.online`                    | unset (Vercel) / `http://localhost:3000` (laptop) | Metadata, sitemap, links in emails                                               |
| `NEXT_PUBLIC_APP_ENV`                  | Yes      | `production`                               | `staging`                                         | **New in task 1.3.** Shows a Staging banner and keeps search engines off staging |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`         | Yes      | current key, never changed                 | separate staging key                              | Push notifications                                                               |
| `SUPABASE_SECRET_KEY`                  | No       | production secret key                      | staging secret key                                | Optional; features that need it switch off without it                            |
| `RESEND_API_KEY`                       | No       | production Resend key                      | staging Resend key                                | Optional                                                                         |
| `RESEND_FROM_EMAIL`                    | No       | current sender                             | "Perqly Staging" sender                           | With `RESEND_API_KEY`                                                            |
| `CRON_SECRET`                          | No       | random, 32+ characters                     | unset                                             | Daily job at 02:30 UTC (`vercel.json`); Vercel runs crons on Production only     |
| `VAPID_PRIVATE_KEY`                    | No       | current key, marked Sensitive              | separate staging key                              | Generate with `npx web-push generate-vapid-keys` on your own machine             |
| `VAPID_SUBJECT`                        | No       | `mailto:` an address you read              | same                                              |                                                                                  |
| `PAYSTACK_SECRET_KEY`                  | No       | live key, only once Paystack is activated  | `sk_test_…` only                                  | Billing (`docs/BILLING.md`)                                                      |

Never in Vercel or the repository: database passwords, Google client secrets, the backup passphrase, your Supabase access token.

GitHub (task 1.2 creates the environments, task 1.4 uses them):

| Secret              | `staging`                  | `production` (your approval)          | `production-backup` (`main` only) |
| ------------------- | -------------------------- | ------------------------------------- | --------------------------------- |
| `SUPABASE_DB_URL`   | staging Session pooler URL | production Session pooler URL         | same as `production`              |
| `BACKUP_PASSPHRASE` | —                          | backup passphrase (`docs/BACKUPS.md`) | same as `production`              |

## 6. Local development

- **Normal:** `.env.local` with staging values. Never production values.
- **Fully local:** `npx supabase start` (needs Docker); `supabase/config.toml` mirrors the settings above and `supabase/seed.sql` loads sample data. Database tests: `npx supabase test db`.

## 7. Checklist for task 1.2

- [ ] Live project relabelled `perqly-production`; ref unchanged
- [ ] `perqly-staging` created in London; Data API exposes `public` only
- [ ] Staging auth, URLs, templates, MFA and rate limits set as in section 3
- [ ] Staging Google client and Resend key created and entered in staging only
- [ ] GitHub environments `staging`, `production` (you as required reviewer) and `production-backup` (`main` only) created
- [ ] Production settings compared with section 3; differences noted, not yet changed
