# Production and staging

**How Perqly keeps live students' data apart from testing, and how a change gets from a pull request to perqly.online.**

|          |                                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Status   | **In progress.** Task 1.2 is done (section 2.1). Sections 5–9 describe tasks 1.3–1.15, which don't exist yet. Each step says who does it |
| Updated  | 2026-11-17                                                                                                                               |
| Replaces | The earlier plan to create a new production project and keep the current one as staging. The decision is now the other way round         |
| Related  | `docs/SUPABASE_SETUP.md` (project settings, variables), `docs/BACKUPS.md` (backups, restore), `docs/TEST_DATA_CLEANUP.md` (clean-up)     |

## 1. The decision

- The existing Supabase project, ref `wktijbmvogxbbwwvqlhq`, **stays production**. It serves perqly.online today and keeps doing so. It does not become staging.
- A **new, empty project** becomes staging. It is built only from the migrations in `supabase/migrations`.
- The existing project is labelled `perqly-staging` in the Supabase dashboard, a leftover name. It is relabelled `perqly-production` first, so the new project can take the name `perqly-staging` without confusion. Relabelling changes nothing else: the ref, keys, URL and data stay the same.

## 2. Where things stand today (16 November 2026)

| Item                    | Today                                                                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase                | Two projects: `perqly-production` (`wktijbmvogxbbwwvqlhq`, live) and `perqly-staging` (`gzmxqjlyhizvmvywbxhn`, empty test project, created 2026-11-16)                                                                                         |
| Vercel                  | Project `perqly`, functions in London (`lhr1`), domain perqly.online. Production deploys from `main`. Since 2026-11-16, every server and email variable is Production only; Preview and Development use staging's URL and publishable key only |
| Migrations              | 29 files in `supabase/migrations`. Both projects have all 29 (checked 2026-11-16, up to `20261114090029`). Production is still migrated by hand with `npx supabase db push` until task 1.4                                                     |
| CI                      | `.github/workflows/ci.yml`: typecheck, lint, format, unit tests, build, and pgTAP tests on a fresh local database. Passing again since commit `f68c9e8` (2026-11-16); it had failed on every push since 14 Nov. No end-to-end tests yet        |
| Backups                 | `.github/workflows/backup.yml`: nightly encrypted dump of the production database, kept 14 days. Never restored (`docs/BACKUPS.md`)                                                                                                            |
| Test data in production | Yes: test accounts from building and testing. **StudaData is a genuine business** and is not test data                                                                                                                                         |
| Legal entity            | **Pending.** None of these documents names an owner or operating company                                                                                                                                                                       |

### 2.1 Task 1.2 outcome (2026-11-16 and 17)

- **Supabase:** the live project was renamed `perqly-production` (ref unchanged). `perqly-staging` was created in London and built from all 29 migrations with `scripts/db/push.ps1`. It has no accounts or businesses. Its sign-in addresses and email sign-in settings are set (`docs/SUPABASE_SETUP.md`, section 3). Still open on staging: email templates (need a staging email sender first), Google sign-in, and checking that authenticator two-factor is on.
- **Vercel:** Preview and Development no longer hold any production value. They have only staging's URL and publishable key.
- **GitHub (repository is public):**
  - Actions: workflow token is read-only; Actions can't create or approve pull requests; outside contributors' workflows need approval.
  - Environments: `staging` (no rules), `production` (you as required reviewer, `main` only), `production-backup` (`main` only). All three are empty: the backup secrets stay repository secrets until task 1.4 updates `backup.yml`.
  - Ruleset `protect-main` on `main`: no deletion, no force push, changes only by pull request, and CI jobs `check` and `database` must pass. Required approvals: 0, because you work alone. **From now on, changes reach `main` through pull requests, not direct pushes.**

### 2.2 Incident: malformed production secret key (2026-11-14 to 16)

- **What happened:** `SUPABASE_SECRET_KEY` in Vercel Production contained an invalid character from 14 Nov. Every server feature that uses it failed: push and email notifications, the daily job, Paystack confirmations, school email codes and decision emails. The error messages printed the key into Vercel's runtime logs.
- **Fixed on 16 Nov:** a new key (`vercel_production_20261116`) was created and set in Vercel, production was redeployed, and both older secret keys were deleted in Supabase. Notifications and the daily job were confirmed working afterwards.
- **Clean-up:** 22 stale chat notifications were marked skipped; 8 other notices were delivered. Notifications older than 24 hours, and decision emails from that period, were not delivered. One Paystack **test-mode** payment for StudaData was closed as `abandoned` with an audit entry. StudaData's manual MoMo payment was left as recorded.
- **Lessons:** paste keys as one unbroken line using the copy button; check the runtime logs after any change to a secret.

## 3. The three environments

| Environment | Supabase project                                                | Vercel environment                                   | Used by                       | Data                                                                                                           |
| ----------- | --------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Local       | Postgres on your machine or in CI                               | `npm run dev`                                        | Developers                    | `supabase/seed.sql` only. It never runs anywhere else                                                          |
| Staging     | `perqly-staging` (`gzmxqjlyhizvmvywbxhn`), London (`eu-west-2`) | **Preview** and **Development** (branch/PR previews) | You and invited testers       | Tester accounts, and businesses whose names start with `TEST`. Never real students; never a copy of production |
| Production  | `perqly-production` (`wktijbmvogxbbwwvqlhq`)                    | **Production** (perqly.online)                       | Students, businesses, schools | Real data only                                                                                                 |

Rules:

1. Each environment has its own database password, API keys, auth settings, email sender and push keys. Nothing is shared.
2. Nobody tests on production. Test accounts already in production are handled only through `docs/TEST_DATA_CLEANUP.md`, which starts with an inventory for your review.
3. Production data is never copied into staging or onto a laptop. The one exception is a backup you download yourself to rehearse or carry out a restore (`docs/BACKUPS.md`).

## 4. Environment variables

The app reads 11 variables today: 4 public (`NEXT_PUBLIC_…`) and 7 server-only, all listed in `src/lib/env.ts` and `src/lib/env.server.ts`. Task 1.3 adds a 12th, `NEXT_PUBLIC_APP_ENV`. `NODE_ENV` is set by Next.js and isn't configured. Values for each environment are in `docs/SUPABASE_SETUP.md`, section 5.

In Vercel, a staging value is ticked for **Preview** and **Development** only, and a production value for **Production** only. `.env.local` on a laptop holds staging values only, and git ignores it (`.gitignore`: `.env*` except `.env.example`).

## 5. How a change reaches production (proposed)

```
pull request ─► CI ─► merge to main ─► Migrate staging ─► check on Preview
                                                               │
             Migrate production: verify ─► approve ─► backup + verify ─► migrate ─► verify ─► move `production`
                                                                                                    │
                                                                       perqly.online ◄── Vercel deploys `production`
```

1. **Pull request.** CI runs typecheck, lint, format, unit tests, build, pgTAP tests on a fresh database, schema lint and, from task 1.9, the Playwright journeys. A pull request fails if it adds a migration without a pgTAP test, or inserts test accounts in a migration.
2. **Merge to `main`.** **Migrate staging** (task 1.4) applies pending migrations to staging for that exact commit, and records the commit on the run. Vercel builds a Preview deployment, which uses staging.
3. **Check on staging.** You or a tester try the change on the Preview of that same commit.
4. **Migrate production** (section 6). You start it for one commit. It refuses unless that commit is the one staging was migrated and checked with.
5. **Deploy.** Vercel's production branch is `production` (switched in task 1.15). The workflow moves `production` only after the database is migrated, so app code never goes live before the database changes it needs.

Until these workflows exist, nothing changes in how you deploy today.

## 6. Migrate production, step by step (built in task 1.4)

The workflow is `.github/workflows/migrate-production.yml`, with helper scripts in `scripts/ci/`. You start it from Actions → Migrate production, entering the **full 40-character commit SHA** you want to release.

How the jobs are split:

- **A1–A4** use no secrets.
- **A5** reads staging through the `staging` environment.
- **A6–A8** read production through `production-backup`, which is read-only and needs no approval. That way the list of pending migrations is in the run summary **before** you're asked to approve.
- **After your approval**, the `production` job runs A6–A8 **again**, in case production changed in the meantime, then C and D.
- The Supabase CLI version is pinned (3.1.0) in both migration workflows. A newer version is adopted deliberately, after trying it on staging.

Every step must pass. **If any step fails, the workflow stops at once.** Nothing after it runs: no backup is replaced, no migration is applied, and the `production` branch doesn't move.

**A. Preconditions (read-only; nothing in production changes)**

| #   | Check                                                                                                             | Stops when                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | The SHA is a full SHA and is on `main`                                                                            | It's short, unknown, or not reachable from `main`                                                                                                             |
| A2  | CI passed for exactly this SHA                                                                                    | Any required check is missing or failed                                                                                                                       |
| A3  | **Migrate staging succeeded for exactly this SHA**                                                                | No successful staging run has this SHA as its commit. A run for a later or earlier commit doesn't count                                                       |
| A4  | Every later commit on `main` that staging has run since leaves `supabase/migrations` unchanged                    | A later commit added or changed a migration, so staging's database no longer matches what you'd release. Release that later commit instead, once it's checked |
| A5  | Staging's migration history equals the migration files at this SHA                                                | Any file is missing, extra, or differs in name or order                                                                                                       |
| A6  | Production's history is an unchanged beginning of that same list                                                  | Production has a migration that the SHA doesn't contain, or one with a different name: drift, which needs investigating first                                 |
| A7  | `production` can move forward to this SHA                                                                         | The current `production` commit isn't an ancestor of the SHA, so the move wouldn't be a fast-forward                                                          |
| A8  | A dry run (`supabase db push --dry-run`) lists exactly the migrations in the SHA that production doesn't have yet | The dry-run list differs from that difference. If both are empty (an app-code-only release), C and D1 are skipped and D2–D4 still run                         |

The run summary shows the SHA, the commit message, the staging run that tested it, and the migrations that will be applied.

**B. Approval**

- **Public repository, or GitHub Enterprise:** the next job uses the `production` environment, and GitHub waits for you, as required reviewer, to approve it after reading the summary.
- **Private repository without Enterprise:** GitHub doesn't offer required reviewers there (`docs/BACKUPS.md`, section 3.1). Approval is then two things together: only you can start the workflow, because only accounts with write access can, and you are the only collaborator (confirm this in task 1.2); and the SHA you typed must match A1–A8.

**C. Backup**

| #   | Step                                            | Stops when       |
| --- | ----------------------------------------------- | ---------------- |
| C1  | Fresh encrypted backup of production            | The dump fails   |
| C2  | Backup checks from `docs/BACKUPS.md`, section 4 | Any check fails  |
| C3  | Backup uploaded and its SHA-256 recorded        | The upload fails |

**D. Migrate and verify**

| #   | Step                                                                                                                                                                                                  | Stops when                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Apply the pending migrations from A8                                                                                                                                                                  | Any migration fails. Each file runs in its own transaction, so a failing file is undone, but files before it in the same run stay applied. Task 1.4 confirms this behaviour on staging. Production then matches the migrations that did succeed, `production` doesn't move, and the live app keeps running on the old code. Recovery is a fix-forward migration through the same flow, or a restore from C1 |
| D2  | Production's history now equals the SHA's list, entry for entry                                                                                                                                       | Anything differs                                                                                                                                                                                                                                                                                                                                                                                            |
| D3  | The Security Advisor (`supabase db advisors --type security`, the same check as the dashboard) shows no errors. It is read-only. Schema lint runs in CI, on a fresh database with the same migrations | Any error-level finding                                                                                                                                                                                                                                                                                                                                                                                     |
| D4  | Fast-forward `production` to the SHA                                                                                                                                                                  | The push is refused, or isn't a fast-forward                                                                                                                                                                                                                                                                                                                                                                |

### 6.1 Who can move the `production` branch (proposed, task 1.4)

The aim: `production` only ever changes through step D4.

- **Ruleset on `production`:** blocks creation, updates, deletion and force pushes for everyone. The only exception is a dedicated **deploy key**. You are not on the exception list either. In an emergency, you'd change the ruleset on purpose, and that change is logged. The workflow's own `GITHUB_TOKEN` (the `github-actions` bot) is also not on the list, so no workflow can move `production` without the deploy key.
- **Plan check:** done in task 1.2. The repository is public, so rulesets and required reviewers are available on the free plan.
- **Vercel:** Production builds only from `production` (task 1.15). Vercel's own "Promote to Production", "Instant Rollback" and `vercel --prod` still work for people on the Vercel team. Keep those for the rollback cases in section 7 and use nothing else, because they bypass the database checks.

### 6.2 The deploy key (proposed, task 1.4)

- **Created by you, on your own machine:** a new SSH key used only for this. You add its public half in GitHub → Settings → Deploy keys with **Allow write access**.
- **Stored in one place only:** the private half becomes a secret of the `production` environment, named `PRODUCTION_DEPLOY_KEY`, and is then deleted from your machine. It is never a repository secret, and never a secret of `staging` or `production-backup`.
- **D4 is the only intended consumer, not a technical guarantee:** GitHub gives an environment's secrets to **any** job that names the environment, as long as the job runs from an allowed branch (`main`) and, where available, is approved. GitHub does **not** limit an environment to one workflow or one job. So any workflow file on `main` that says `environment: production` could read `PRODUCTION_DEPLOY_KEY` and the other production secrets. By design, only job D4 of Migrate production references the key, after A–D3 have passed. That is a convention this repository keeps, not a restriction GitHub enforces.
- **What the protection really depends on:** controlling and reviewing every workflow change that is merged into `main`. The `main` ruleset (section 6.3) forces changes through pull requests with passing CI. Any pull request that adds or changes a file under `.github/workflows/`, or any action those files use, must be reviewed carefully before merging. Look in particular for `environment: production`, `environment: production-backup`, `secrets.`, new `permissions:`, new triggers (`push`, `schedule`, `workflow_run`, `pull_request_target`) and new third-party actions. A workflow change that references a production environment is treated like a change to production itself.
- **Narrow use:** D4 uses the key for one fast-forward push of `production` and nothing else. Every other git step uses read-only checkout.
- **If it may have leaked:** delete the deploy key in GitHub and make a new one. Moving `production` stops until then, which is safe: the site keeps running.

### 6.3 GitHub permissions that keep pull requests, forks and other branches out (proposed, task 1.2 and 1.4)

These settings stop pull requests, forks and other branches from moving `production` or reading production secrets. They can't stop another workflow that is already on `main` from naming the `production` environment. That part relies on reviewing every workflow change before it is merged (section 6.2). Each setting must be set as described. Task 1.2 records each one as checked.

| Where                                                      | Setting                                                                                                                                                                                     | Why                                                                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings → Actions → General → Workflow permissions        | **Read repository contents and packages permissions**; untick **Allow GitHub Actions to create and approve pull requests**                                                                  | The default `GITHUB_TOKEN` can't push, and can't approve its own changes                                                                                |
| Each workflow file                                         | Top-level `permissions: contents: read`. Migrate production adds only `actions: read` and `checks: read`, to read the staging run and CI results for the SHA                                | Nothing gets more than it needs                                                                                                                         |
| Settings → Actions → General → Fork pull request workflows | Require approval for all outside collaborators. Don't send write tokens or secrets to fork pull requests                                                                                    | Pull requests from forks never get secrets. This is GitHub's default; it's recorded here so it isn't loosened                                           |
| Workflow triggers                                          | No workflow uses `pull_request_target` or `workflow_run` to touch production. Migrate production runs only on `workflow_dispatch`, and its jobs check `github.ref == 'refs/heads/main'`     | Pull-request code never runs with production secrets                                                                                                    |
| Environment `production`                                   | Deployment branches: **Selected branches → `main` only**. Required reviewer: you, where your plan allows                                                                                    | A job started from any other branch, including a pull request's branch, is refused the environment and its secrets                                      |
| Environment `production-backup`                            | Deployment branches: `main` only. Holds only `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE`, never the deploy key. Used by the nightly backup and by Migrate production's read-only checks A6–A8 | Those jobs can read the database, but can't move `production`                                                                                           |
| Repository secrets                                         | No production value stored as a repository secret. The GitHub Free fallback in `docs/BACKUPS.md`, section 3.1, is the one exception, and is marked as the weakest option                    | Repository secrets reach every workflow on every branch                                                                                                 |
| Ruleset on `main`                                          | Changes only through pull requests with passing CI; no force pushes; no deletion                                                                                                            | Every workflow on `main` can reach the production environments, so every workflow change must go through a reviewed, checked pull request (section 6.2) |
| Ruleset on `production`                                    | Section 6.1. Only the deploy key may bypass                                                                                                                                                 | Only a job holding the deploy key can move it. D4 is the only intended one (section 6.2)                                                                |
| Settings → Actions → General → Actions permissions         | Allow actions by GitHub and verified creators only. Pin third-party actions to a full commit SHA                                                                                            | An outside action can't be swapped for one that reads secrets                                                                                           |
| Settings → Collaborators                                   | You only, for now. Anyone added later with write access can start workflows, so access is reviewed before adding anyone                                                                     | Starting Migrate production needs write access                                                                                                          |

**Limits that remain:**

- An account with admin rights on the repository, which today is you, can change any of these settings. That is why the ruleset and environment changes are logged in GitHub's audit log, and why this account must use two-factor.
- On a private repository without Pro, environment branch rules and rulesets aren't available. The protection then rests on you being the only collaborator, until the plan changes.
- Environments can't be limited to one workflow or job. Any workflow merged into `main` can name `production`, so careful review of workflow changes is a required part of the protection, not an extra (section 6.2).

### 6.4 Switching it on (after the task 1.4 pull request is reviewed)

Do these **before merging** the pull request. Merging to `main` starts Migrate staging straight away, and the nightly backup runs at 01:17 UTC. Both now read their secrets from environments, so they fail loudly if the secrets aren't there.

1. **`staging` environment → add secret** `SUPABASE_DB_URL`: staging's Session pooler connection string (`postgres.gzmxqjlyhizvmvywbxhn…`). The workflow refuses a production string.
2. **`production-backup` environment → add secrets** `SUPABASE_DB_URL` (production's Session pooler string) and `BACKUP_PASSPHRASE` (the existing passphrase, unchanged).
3. **`production` environment → add secrets** `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE`, the same two values.
4. **Deploy key**, on your own computer:
   - Run `ssh-keygen -t ed25519 -N "" -C perqly-production-deploy -f perqly_deploy`.
   - Paste `perqly_deploy.pub` into Settings → Deploy keys → Add deploy key, with **Allow write access** ticked.
   - Paste the contents of `perqly_deploy` into the `production` environment as `PRODUCTION_DEPLOY_KEY`.
   - Delete both files.
5. **Ruleset `protect-production`:** target branch `production`; tick restrict creations, restrict updates, restrict deletions and block force pushes; bypass list: **Deploy keys** only.

After merging:

6. Run **Nightly database backup** by hand and check it passes every check. Then delete the old **repository** secrets `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE`.
7. Check that **Migrate staging** ran for the merge and says staging matches `main`.
8. Run **Migrate production** with the merge commit's SHA. With nothing pending, it skips the backup and the migration, runs the checks, and creates the `production` branch. Vercel keeps deploying from `main` until task 1.15.

## 7. Rollback

| What went wrong              | What to do                                                                                      | Typical time          |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | --------------------- |
| A bug in app code            | Vercel → Deployments → previous production deployment → **Instant Rollback**                    | Minutes               |
| A migration's logic is wrong | A new migration that corrects it, through the same flow                                         | Under an hour         |
| A migration damaged data     | Restore the affected rows from backup C1 via a scratch project (`docs/BACKUPS.md`, section 6.4) | Hours                 |
| The database is lost         | Full restore from the latest backup into a new project (`docs/BACKUPS.md`, section 6)           | Hours, once rehearsed |

Instant Rollback is only safe if the older code still runs against the newer database. So migrations are written **expand, then contract**: one release adds tables, columns and functions; old ones are removed or renamed only in a later release, once no deployed code uses them.

## 8. Secrets

- **Production secrets** live in Vercel's Production environment, and in GitHub in the places that `docs/BACKUPS.md`, section 3.1, sets out for your plan. They are never on a laptop, in chat, in an issue or in the repository.
- **Staging secrets** live in Vercel's Preview and Development environments, in GitHub's `staging` environment (or repository secrets, depending on plan), and in `.env.local` on laptops.
- **After the split** (task 1.8), change every value that has ever been typed into a chat or stored on a laptop: the Google client secret, Resend API keys (and delete old unused ones), `CRON_SECRET`, the Supabase secret key and the production database password. Then update the backup secret.

## 9. Steps, in order

**You** do anything in a dashboard. **Claude** makes repository changes, and only after you approve each task. Claude runs nothing against production.

| Task | What happens                                                                                                                                                                                         | Who                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1.1  | These documents                                                                                                                                                                                      | Claude                               |
| 1.2  | **Done** (section 2.1): repository confirmed public; live project relabelled; `perqly-staging` created and built; GitHub Actions settings, environments and the `main` ruleset in place              | You, guided                          |
| 1.3  | `NEXT_PUBLIC_APP_ENV` and the Staging banner                                                                                                                                                         | Claude                               |
| 1.4  | Migrate staging and Migrate production workflows with every check in section 6; backup checks; ruleset proposal. First run builds staging. A production run with nothing pending must change nothing | Claude, then you run it              |
| 1.5  | Point Vercel Preview and Development at staging                                                                                                                                                      | You                                  |
| 1.6  | Test-data inventory for your review, then clean-up of approved rows only (`docs/TEST_DATA_CLEANUP.md`)                                                                                               | Claude prepares; you approve and run |
| 1.8  | Change secrets (section 8)                                                                                                                                                                           | You                                  |
| 1.15 | Restore rehearsal must pass; then switch Vercel's production branch to `production`                                                                                                                  | You, with a guide                    |

Tasks 1.7 and 1.9 to 1.14 (types, end-to-end tests, account deletion, navigation, landing page, legal-document versioning, Google sign-in) are described in the roadmap and don't change how environments work. Final Terms, Privacy Policy and DPC registration stay pre-launch compliance tasks, pending the legal entity decision.

## 10. Supabase advisor warnings you can expect

Checked on 15 November 2026 against a full copy of the schema, using the same checks the Supabase dashboard runs. These are expected on both projects:

- **Signed-in users can call security-definer functions:** intended. They are the app's actions. Each checks who is calling, and server-only functions are blocked for users.
- **Anonymous users can call a function:** `join_waitlist`, intended.
- **Multiple permissive policies:** a speed hint that only matters at much larger scale.
- **Unused indexes**, and **RLS on without policies** on `push_subscriptions` (reached only through functions): expected.
