# Supabase setup and environment variables

**How to configure `perqly-staging` (and later `perqly-production`), and every environment variable the app uses**

|            |                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| Status     | Ready for you to follow when you create `perqly-staging`. Nothing has been applied to any hosted project |
| Date       | 2026-11-14                                                                                               |
| Applies to | Roadmap steps 1.1 (Supabase foundation) and 1.2 (authentication)                                         |

## 1. Rules that keep staging and production apart

1. **Two separate Supabase projects:** `perqly-staging` and `perqly-production`. Each has its own database password, its own API keys and its own auth settings. Nothing is shared between them.
2. **Each environment points at exactly one project:**

   | Where the app runs                                  | Supabase project                                                                                                                              |
   | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
   | Your laptop (`npm run dev`)                         | `perqly-staging`, or a local Supabase started with `supabase start`                                                                           |
   | Vercel **Preview** and **Development** environments | `perqly-staging`                                                                                                                              |
   | Vercel **Production** environment                   | `perqly-production`, set only at roadmap step 1.9. Until then, Production has **no** Supabase variables, so the live site can't touch staging |

3. **No real student data in staging.** Use your own and teammates' test accounts and obviously fictional names. Never copy production data into staging.
4. **Secrets never go into git.** That means the database password, the secret API key (`sb_secret_…`), the Resend API key, access tokens and service-role keys. `.env.local` is git-ignored; `.env.example` holds only names and placeholders. The app's environment check (`src/lib/env.ts`) refuses a secret key placed in a `NEXT_PUBLIC_` variable.
5. **Separate Resend API keys per project.** One key for staging, another for production, each restricted to "Sending access" for the Perqly domain, so one can be revoked without touching the other.
6. **Migrations go to staging first,** and only reach production after they've passed on staging. They're applied only with your approval.

## 2. Create `perqly-staging`

| Setting                                        | Value                                                                    | Why                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Organization                                   | Your Supabase organization                                               |                                                                                                            |
| Project name                                   | `perqly-staging`                                                         |                                                                                                            |
| Database password                              | Generate a strong one in the dashboard; save it in your password manager | Needed only for the Supabase CLI and direct database connections. Never paste it into chat, code or Vercel |
| Region                                         | **West EU (London)** `eu-west-2`                                         | Supabase has no African region; London has the lowest latency from Accra of the available regions          |
| Plan                                           | Free                                                                     |                                                                                                            |
| Postgres version                               | The default offered (17)                                                 | Matches `supabase/config.toml` (`major_version = 17`)                                                      |
| Data API                                       | Enabled; schemas: `public` only (`graphql_public` can stay)              | Migrations keep helper functions in a `private` schema that must **not** be exposed                        |
| "Automatically expose new tables" (if offered) | Either setting works                                                     | Perqly's migrations grant table access explicitly and enable RLS on every table                            |

Recommended at the same time (Vercel, needs your approval): set the Vercel project's **Function Region** to London (`lhr1`) so server code runs next to the database instead of in Washington (`iad1`, the current default).

## 3. Dashboard configuration, step by step

### 3.1 Authentication → Sign In / Providers

| Setting                    | Value                                            |
| -------------------------- | ------------------------------------------------ |
| Allow new users to sign up | On                                               |
| Allow anonymous sign-ins   | Off                                              |
| Allow manual linking       | Off                                              |
| **Email** provider         | Enabled                                          |
| Confirm email              | **On**                                           |
| Secure email change        | On                                               |
| Email OTP expiration       | **600** seconds (10 minutes)                     |
| Email OTP length           | **6**                                            |
| Phone provider             | **Off** (phone sign-in comes later, decision D6) |
| All social providers       | Off                                              |

### 3.2 Authentication → URL Configuration

| Setting       | Staging value                                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site URL      | The stable staging address: your Vercel preview branch alias (for example `https://perqly-git-staging-vision61-studios.vercel.app`) once you choose one. Until then, `http://localhost:3000` |
| Redirect URLs | `http://localhost:3000/**` and `https://perqly-*-vision61-studios.vercel.app/**` (all Perqly preview deployments)                                                                            |

For production (step 1.9), the Site URL becomes the production domain and the redirect list contains only production URLs.

### 3.3 Authentication → Emails → Templates

Perqly signs people in with a **6-digit code**, with a link as a backup. Supabase sends the **Confirm signup** template to new users and the **Magic Link** template to returning users, so both must contain `{{ .Token }}`.

| Template       | Subject            | Body                                        |
| -------------- | ------------------ | ------------------------------------------- |
| Confirm signup | `Your Perqly code` | Copy `supabase/templates/confirmation.html` |
| Magic Link     | `Your Perqly code` | Copy `supabase/templates/magic_link.html`   |

The repository files are the source of truth: if a template changes, change the file first, then paste it into both projects. The link in the templates goes to `/auth/confirm` on whichever Perqly address requested the code (`{{ .RedirectTo }}`), which must be in the redirect list above.

### 3.4 Authentication → Emails → SMTP Settings (Resend)

Supabase's built-in email service is only for trying things out: it **only delivers to members of your Supabase organization** and allows very few messages an hour. Real testers need custom SMTP.

| Setting                         | Value                                                                       |
| ------------------------------- | --------------------------------------------------------------------------- |
| Enable custom SMTP              | On                                                                          |
| Host                            | `smtp.resend.com`                                                           |
| Port                            | `465`                                                                       |
| Username                        | `resend`                                                                    |
| Password                        | A Resend API key created for **staging only** (restricted to sending)       |
| Sender email                    | `no-reply@<your verified domain>`, for example `no-reply@auth.perqly.<tld>` |
| Sender name                     | `Perqly`                                                                    |
| Minimum interval between emails | 60 seconds                                                                  |

**What Resend needs first:** a domain you own, verified in Resend with its DNS records (SPF and DKIM; add DMARC as well). Resend won't send to arbitrary addresses without one. Perqly doesn't have a domain yet, so:

- **Until a domain is verified:** leave custom SMTP off. Supabase's built-in service will deliver codes to you and anyone you add to your Supabase organization. That's enough to test sign-in on staging.
- **Free-tier suitability:** Resend's free plan allows 100 emails a day and 3,000 a month, with up to 3 verified domains (Resend pricing, checked 2026-11-14). That's comfortable for staging and a small soft launch. A full GCTU launch with many sign-ups on day one could pass 100 in a day, so plan to review this before the public pilot (pre-launch checklist).
- A subdomain such as `auth.<domain>` for sign-in emails keeps their reputation separate from any future marketing email.

### 3.5 Authentication → Rate Limits

After custom SMTP is on, Supabase starts at 30 emails an hour. For staging set:

| Limit                                      | Staging value                         |
| ------------------------------------------ | ------------------------------------- |
| Emails sent per hour                       | 30 (keep it under Resend's 100 a day) |
| Sign-ups and sign-ins per 5 minutes per IP | 30 (default)                          |
| Token verifications per 5 minutes per IP   | 30 (default)                          |

### 3.6 Authentication → Multi-Factor

| Setting                  | Value                       |
| ------------------------ | --------------------------- |
| TOTP (authenticator app) | Enabled (free on all plans) |
| Phone MFA                | Off (a paid add-on)         |

Perqly requires TOTP for platform staff (and, later, institution admins and merchant owners). The app enforces this; there's no dashboard switch for "required".

### 3.7 Other settings

| Area                      | Setting                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Database → Settings → SSL | Enforce SSL on incoming connections: on                                                                                          |
| Database → Extensions     | Nothing to enable by hand: migrations create `pgcrypto`, `citext` and `pg_trgm` in the `extensions` schema                       |
| Integrations → GraphQL    | Perqly doesn't use GraphQL. Leaving it on is safe because RLS still applies; turning off `pg_graphql` reduces the attack surface |
| Storage, Realtime         | Nothing until steps 1.3 and 1.6; migrations create buckets and publications                                                      |
| Advisors                  | Run the Security Advisor after every migration; it must show no errors                                                           |

### 3.8 API keys

Settings → API Keys shows two kinds of key:

| Key                                      | Use in Perqly                                                                                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Publishable** key (`sb_publishable_…`) | The app's only key. Safe in the browser because RLS protects the data                                                                                                       |
| **Secret** key (`sb_secret_…`)           | Optional, server only: lets the server issue institutional-email confirmation codes (step 1.3). Never in the browser, never in a `NEXT_PUBLIC_` variable, never in the repo |
| Legacy `anon` / `service_role` keys      | Not used                                                                                                                                                                    |

## 4. Applying the database migrations

The migrations live in `supabase/migrations/`. Two ways to apply them to staging, both only after you approve:

1. **You run the Supabase CLI** on your laptop:
   ```
   npx supabase login
   npx supabase link --project-ref <staging project ref>    # asks for the database password
   npx supabase db push                                       # applies new migrations
   npx supabase db push --include-seed                        # first time only: also runs seed.sql
   ```
2. **I apply them** through the Supabase connector in this chat, one migration at a time, after you confirm the project is `perqly-staging`.

Either way, check the Security Advisor afterwards.

### Making yourself the first super admin

Platform roles can only be granted by an existing super admin, so the first one is created once by hand. After you've signed in to staging once, run this in the SQL Editor of **staging** (replace the email):

```sql
insert into public.platform_staff (user_id, role)
select id, 'super_admin' from auth.users where email = 'you@example.com';
```

You'll then be asked to set up an authenticator app the next time you open `/admin`.

## 5. Environment variables

| Variable                               | Exposed to the browser? | Local (`.env.local`)                  | Vercel Preview + Development                           | Vercel Production                             | Needed from                 | Notes                                                                                                                                                                                  |
| -------------------------------------- | ----------------------- | ------------------------------------- | ------------------------------------------------------ | --------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Yes                     | Staging URL                           | Staging URL                                            | **Unset** until step 1.9, then production URL | Step 1.1                    | `https://<ref>.supabase.co`                                                                                                                                                            |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes                     | Staging publishable key               | Staging publishable key                                | **Unset** until 1.9                           | Step 1.1                    | Must start with `sb_publishable_` (or be a legacy anon key). The app rejects secret keys here                                                                                          |
| `NEXT_PUBLIC_SITE_URL`                 | Yes                     | `http://localhost:3000`               | Leave unset: the app uses the deployment's own address | Production domain                             | Now                         | Used for metadata and the sitemap                                                                                                                                                      |
| `RESEND_API_KEY`                       | **No** (server only)    | Optional                              | Optional, staging Resend key                           | Unset until 1.9                               | Step 1.3 (optional feature) | Sends institutional-email confirmation codes (and booking emails from 1.7). Separate key per environment                                                                               |
| `RESEND_FROM_EMAIL`                    | **No** (server only)    | Optional                              | e.g. `Perqly <no-reply@auth.your-domain>`              | Unset until 1.9                               | With `RESEND_API_KEY`       | Must be on a domain verified in Resend                                                                                                                                                 |
| `SUPABASE_SECRET_KEY`                  | **No** (server only)    | Optional                              | Optional, staging secret key                           | Unset until 1.9                               | Step 1.3 (optional feature) | Only used to issue institutional-email confirmation codes (`issue_institutional_email_code`, service role only). Without it the "Send code" button is hidden and everything else works |
| Database password                      | **No**                  | Never stored in the repo              | Never                                                  | Never                                         | —                           | Only in your password manager and typed into the CLI when it asks                                                                                                                      |
| `SUPABASE_ACCESS_TOKEN`                | **No**                  | Your machine only, if you use the CLI | —                                                      | —                                             | Optional                    | Personal token for `supabase login`. GitHub secret only if migrations are later automated                                                                                              |

The Resend API key used for SMTP is entered in the **Supabase dashboard** (section 3.4), not in Vercel or the repo.

Where to set Vercel variables: Project `perqly` → Settings → Environment Variables. Tick **Preview** and **Development** for the staging values and leave **Production** unticked.

## 6. Local development

Two options:

- **Point at staging:** copy `.env.example` to `.env.local` and fill in the staging URL and publishable key. Simplest; uses real emails.
- **Fully local:** install Docker and run `npx supabase start`. `supabase/config.toml` mirrors the staging settings above (6-digit codes, 10-minute expiry, confirmations on, TOTP on, Perqly templates). Emails appear in the local Mailpit inbox it prints, and the local URL and publishable key go in `.env.local`. Database tests run with `npx supabase test db`.

## 7. Checklist once `perqly-staging` exists

- [ ] Project in London, Data API exposing `public` only
- [ ] Email provider: confirm email on, OTP 600 s, length 6; phone and social off
- [ ] URL configuration: Site URL and redirect URLs set
- [ ] Both templates pasted with the subject `Your Perqly code`
- [ ] TOTP MFA enabled
- [ ] (When a domain is verified) Resend SMTP configured with a staging-only key; rate limit 30/hour
- [ ] Staging URL and publishable key added to Vercel **Preview + Development only**
- [ ] Migrations applied (after approval), Security Advisor clean
- [ ] Your account made super admin with the SQL above
