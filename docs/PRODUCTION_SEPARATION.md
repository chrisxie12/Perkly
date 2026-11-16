# Production and staging

**How Perqly keeps live students' data apart from testing, and how a change travels from a pull request to perqly.online.**

|          |                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Status   | **Approved plan, not yet carried out.** Milestone 1, tasks 1.2 to 1.15. Each step below says who does it                             |
| Updated  | 2026-11-16                                                                                                                           |
| Replaces | The earlier plan to create a new production project and keep the current one as staging. The decision is now the other way round     |
| Related  | `docs/SUPABASE_SETUP.md` (project settings, variables), `docs/BACKUPS.md` (backups, restore), `docs/TEST_DATA_CLEANUP.md` (clean-up) |

## 1. The decision

- The existing Supabase project, ref `wktijbmvogxbbwwvqlhq`, **stays production**. It serves perqly.online today and keeps doing so. It is not converted into staging.
- A **new, empty project** becomes staging. It is built only from the migrations in `supabase/migrations`.
- The existing project is labelled `perqly-staging` in the Supabase dashboard (a leftover name). It is relabelled `perqly-production` first, so the new project can take the name `perqly-staging` without confusion. Relabelling changes nothing else: the ref, keys, URL and data stay the same.

## 2. Where things stand today (16 November 2026)

| Item                    | Today                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Supabase                | One project (`wktijbmvogxbbwwvqlhq`) serves both the live site and all testing                                               |
| Vercel                  | Project `perqly`, functions in London (`lhr1`), domain perqly.online; Production deploys from `main`                         |
| Migrations              | 29 files in `supabase/migrations`; applied by hand with `npx supabase db push` from one laptop                               |
| CI                      | `.github/workflows/ci.yml`: typecheck, lint, format, unit tests, build, pgTAP on a fresh local database. No end-to-end tests |
| Backups                 | `.github/workflows/backup.yml`: nightly encrypted dump of the production database, kept 14 days                              |
| Test data in production | Yes: test accounts from building and testing. StudaData is a **genuine business** and is not test data                       |

## 3. The three environments

| Environment | Supabase project                                       | Vercel environment                                   | Used by                       | Data                                                                                                          |
| ----------- | ------------------------------------------------------ | ---------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Local       | Postgres on your machine or in CI                      | `npm run dev`                                        | Developers                    | `supabase/seed.sql` only. It never runs anywhere else                                                         |
| Staging     | New `perqly-staging`, London (`eu-west-2`)             | **Preview** and **Development** (branch/PR previews) | You and invited testers       | Tester accounts and businesses whose names start with `TEST`. Never real students; never a copy of production |
| Production  | `wktijbmvogxbbwwvqlhq`, relabelled `perqly-production` | **Production** (perqly.online)                       | Students, businesses, schools | Real data only                                                                                                |

Rules:

1. Each environment has its own database password, API keys, auth settings, email sender and push keys. Nothing is shared.
2. Nobody tests on production. A test account found in production is removed through the clean-up procedure (`docs/TEST_DATA_CLEANUP.md`).
3. Production data is never copied into staging or onto a laptop.

## 4. Environment variables

The app reads 4 public and 7 server variables (`src/lib/env.ts`, `src/lib/env.server.ts`). Full descriptions are in `docs/SUPABASE_SETUP.md`, section 5.

| Variable                                                             | Production (Vercel Production only)                        | Staging (Vercel Preview + Development, laptops)      |
| -------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`   | production project                                         | staging project                                      |
| `NEXT_PUBLIC_SITE_URL`                                               | `https://perqly.online`                                    | unset (previews use their own address)               |
| `NEXT_PUBLIC_APP_ENV` (added in task 1.3)                            | `production`                                               | `staging` (shows a "Staging" banner)                 |
| `SUPABASE_SECRET_KEY`                                                | production secret key                                      | staging secret key                                   |
| `RESEND_API_KEY`                                                     | production-only key                                        | separate staging key                                 |
| `RESEND_FROM_EMAIL`                                                  | the current production sender, unchanged                   | a sender named "Perqly Staging" on a verified domain |
| `CRON_SECRET`                                                        | production value                                           | unset: Vercel runs crons on Production only          |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | current pair, unchanged (changing it cuts off every phone) | a separate pair                                      |
| `PAYSTACK_SECRET_KEY`                                                | live key, only once Paystack is activated                  | `sk_test_…` only                                     |

In Vercel, a staging value is ticked for **Preview** and **Development** only; a production value for **Production** only. `.env.local` on a laptop holds staging values only and is ignored by git (`.gitignore`: `.env*`, except `.env.example`).

## 5. How a change reaches production

```
pull request ──► CI (all checks) ──► merge to main ──► Migrate staging ──► testers check the Preview
                                                                                 │
                                    perqly.online ◄── Vercel deploys ◄── Migrate production (you approve)
                                                      the production branch
```

1. **Pull request.** CI runs typecheck, lint, format, unit tests, build, pgTAP on a fresh database, schema lint and, from task 1.9, the Playwright journeys. A pull request that adds a migration without a pgTAP test, or inserts test accounts in a migration, fails.
2. **Merge to `main`.** The **Migrate staging** workflow (task 1.4) runs `supabase db push` against staging. Vercel builds the Preview deployment, which talks to staging.
3. **Check on staging.** You or a tester try the change on the Preview address.
4. **Migrate production.** You start the **Migrate production** workflow by hand. GitHub asks for your approval because the `production` environment is protected. The workflow then:
   1. takes a fresh encrypted backup (same method as the nightly backup);
   2. applies pending migrations to production;
   3. compares the migration lists of staging and production and fails if they differ;
   4. moves the `production` branch to the commit that was just migrated.
5. **Deploy.** Vercel's production branch is changed from `main` to `production` (task 1.15, the last step of the switch-over). From then on, app code reaches perqly.online only after its database changes are in place.

Until the workflows exist, nothing changes in how you deploy today.

## 6. Rollback

| What went wrong              | What to do                                                                         | Typical time  |
| ---------------------------- | ---------------------------------------------------------------------------------- | ------------- |
| A bug in app code            | Vercel → Deployments → previous production deployment → **Instant Rollback**       | Minutes       |
| A migration's logic is wrong | Write a new migration that corrects it; it goes through the same flow              | Under an hour |
| A migration damaged data     | Restore the affected tables from the backup taken in step 4.1 (`docs/BACKUPS.md`)  | Hours         |
| The database is lost         | Full restore from the latest nightly backup into a new project (`docs/BACKUPS.md`) | Hours         |

Instant Rollback only works if the older code still runs against the newer database. So migrations are written **expand, then contract**: add tables, columns and functions in one release; remove or rename old ones only in a later release, once no deployed code uses them.

## 7. Secrets

- **Production secrets live in Vercel's Production environment and two GitHub environments only:** `production` (database URL and backup passphrase for Migrate production) and `production-backup` (the same two values, for the nightly backup). Never on a laptop, in chat, in an issue or in the repository.
- **`production`** requires your approval before any job can read its secrets. **`production-backup`** has no reviewer, so the nightly job can run, but only from `main` (details in `docs/BACKUPS.md`, section 3).
- **Staging secrets** live in Vercel's Preview and Development environments, GitHub's `staging` environment, and `.env.local` on laptops.
- **After the split** (task 1.8), rotate every value that has ever been typed into a chat or stored on a laptop: Google client secret, Resend API keys, `CRON_SECRET`, Supabase secret key and the production database password. Then update the backup secret (`docs/BACKUPS.md`).

## 8. Steps, in order

Who does each: **you** for anything in a dashboard; **Claude** for repository changes, only after you approve each task.

| Task | What happens                                                                                                                                                                                         | Who                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1.1  | These documents                                                                                                                                                                                      | Claude                               |
| 1.2  | Relabel the live project `perqly-production`; create `perqly-staging` in London; create GitHub environments `staging`, `production` (you as required reviewer) and `production-backup` (`main` only) | You                                  |
| 1.3  | `NEXT_PUBLIC_APP_ENV` and the Staging banner                                                                                                                                                         | Claude                               |
| 1.4  | Migrate staging and Migrate production workflows; the first run builds staging from all migrations; a production run with nothing pending proves it changes nothing                                  | Claude, then you run it              |
| 1.5  | Point Vercel Preview and Development at staging                                                                                                                                                      | You                                  |
| 1.6  | Test-data inventory for your review, then clean-up of approved rows only (`docs/TEST_DATA_CLEANUP.md`)                                                                                               | Claude prepares; you approve and run |
| 1.8  | Rotate secrets (section 7)                                                                                                                                                                           | You                                  |
| 1.15 | Rehearse a restore; then switch Vercel's production branch to `production`                                                                                                                           | You, with a guide                    |

Tasks 1.7 and 1.9 to 1.14 (types, end-to-end tests, account deletion, navigation, landing page, legal-document versioning, Google sign-in) are described in the roadmap and don't change how environments work.

## 9. Supabase advisor warnings you can expect

Checked on 15 November 2026 against a full copy of the schema, using the same checks the Supabase dashboard runs. These are expected on both projects:

- **Signed-in users can call security-definer functions:** intended. They are the app's actions; each checks who is calling, and server-only functions are blocked for users.
- **Anonymous users can call a function:** `join_waitlist`, intended.
- **Multiple permissive policies:** a speed hint that matters only at much larger scale.
- **Unused indexes** and **RLS on without policies** (`push_subscriptions`, reached only through functions): expected.
