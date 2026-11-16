# Production and staging

**How Perqly keeps live students' data apart from testing, and how a change gets from a pull request to perqly.online.**

|          |                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status   | **Proposed; architecture approved in principle.** Nothing in sections 5–9 exists yet. Milestone 1, tasks 1.2 to 1.15. Each step says who does it |
| Updated  | 2026-11-16                                                                                                                                       |
| Replaces | The earlier plan to create a new production project and keep the current one as staging. The decision is now the other way round                 |
| Related  | `docs/SUPABASE_SETUP.md` (project settings, variables), `docs/BACKUPS.md` (backups, restore), `docs/TEST_DATA_CLEANUP.md` (clean-up)             |

## 1. The decision

- The existing Supabase project, ref `wktijbmvogxbbwwvqlhq`, **stays production**. It serves perqly.online today and keeps doing so. It does not become staging.
- A **new, empty project** becomes staging. It is built only from the migrations in `supabase/migrations`.
- The existing project is labelled `perqly-staging` in the Supabase dashboard, a leftover name. It is relabelled `perqly-production` first, so the new project can take the name `perqly-staging` without confusion. Relabelling changes nothing else: the ref, keys, URL and data stay the same.

## 2. Where things stand today (16 November 2026)

| Item                    | Today                                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase                | One project (`wktijbmvogxbbwwvqlhq`) serves both the live site and all testing                                                                                         |
| Vercel                  | Project `perqly`, functions in London (`lhr1`), domain perqly.online. Production deploys from `main`                                                                   |
| Migrations              | 29 files in `supabase/migrations`. 0001–0028 are recorded as applied to production; 0029 is not confirmed. Applied by hand with `npx supabase db push` from one laptop |
| CI                      | `.github/workflows/ci.yml`: typecheck, lint, format, unit tests, build, and pgTAP tests on a fresh local database. No end-to-end tests                                 |
| Backups                 | `.github/workflows/backup.yml`: nightly encrypted dump of the production database, kept 14 days. Never restored (`docs/BACKUPS.md`)                                    |
| Test data in production | Yes: test accounts from building and testing. **StudaData is a genuine business** and is not test data                                                                 |
| Legal entity            | **Pending.** None of these documents names an owner or operating company                                                                                               |

## 3. The three environments

| Environment | Supabase project                                       | Vercel environment                                   | Used by                       | Data                                                                                                           |
| ----------- | ------------------------------------------------------ | ---------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Local       | Postgres on your machine or in CI                      | `npm run dev`                                        | Developers                    | `supabase/seed.sql` only. It never runs anywhere else                                                          |
| Staging     | New `perqly-staging`, London (`eu-west-2`)             | **Preview** and **Development** (branch/PR previews) | You and invited testers       | Tester accounts, and businesses whose names start with `TEST`. Never real students; never a copy of production |
| Production  | `wktijbmvogxbbwwvqlhq`, relabelled `perqly-production` | **Production** (perqly.online)                       | Students, businesses, schools | Real data only                                                                                                 |

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

## 6. Migrate production, step by step (proposed, task 1.4)

You start the workflow from Actions → Migrate production, entering the **full 40-character commit SHA** you want to release.

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

| #   | Step                                                                                                                  | Stops when                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Apply the pending migrations from A8                                                                                  | Any migration fails. Each file runs in its own transaction, so a failing file is undone, but files before it in the same run stay applied. Task 1.4 confirms this behaviour on staging. Production then matches the migrations that did succeed, `production` doesn't move, and the live app keeps running on the old code. Recovery is a fix-forward migration through the same flow, or a restore from C1 |
| D2  | Production's history now equals the SHA's list, entry for entry                                                       | Anything differs                                                                                                                                                                                                                                                                                                                                                                                            |
| D3  | `supabase db lint` against production shows no errors. Afterwards you also open the Security Advisor in the dashboard | Any lint error                                                                                                                                                                                                                                                                                                                                                                                              |
| D4  | Fast-forward `production` to the SHA                                                                                  | The push is refused, or isn't a fast-forward                                                                                                                                                                                                                                                                                                                                                                |

### 6.1 Who can move the `production` branch (proposed, task 1.4)

The aim: `production` only ever changes through step D4.

- **Ruleset on `production`:** blocks creation, updates, deletion and force pushes for everyone. The only exception is a dedicated **deploy key**. You are not on the exception list either. In an emergency, you'd change the ruleset on purpose, and that change is logged. The workflow's own `GITHUB_TOKEN` (the `github-actions` bot) is also not on the list, so no workflow can move `production` without the deploy key.
- **Plan check:** in private repositories, rulesets need GitHub Pro or higher. On GitHub Free with a private repository, `production` can't be protected this way. Task 1.2 confirms which case applies, and the proposal is adjusted before task 1.4.
- **Vercel:** Production builds only from `production` (task 1.15). Vercel's own "Promote to Production", "Instant Rollback" and `vercel --prod` still work for people on the Vercel team. Keep those for the rollback cases in section 7 and use nothing else, because they bypass the database checks.

### 6.2 The deploy key (proposed, task 1.4)

- **Created by you, on your own machine:** a new SSH key used only for this. You add its public half in GitHub → Settings → Deploy keys with **Allow write access**.
- **Stored in one place only:** the private half becomes a secret of the `production` environment, named `PRODUCTION_DEPLOY_KEY`, and is then deleted from your machine. It is never a repository secret, and never a secret of `staging` or `production-backup`.
- **Reachable only by the approved run:** environment secrets are only given to a job that names the environment. The `production` environment only admits jobs running from `main` (deployment branch rule) and, where available, only after your approval. In Migrate production, only job D4 names it with the key, after A–D3 have passed.
- **Narrow use:** D4 uses the key for one fast-forward push of `production` and nothing else. Every other git step uses read-only checkout.
- **If it may have leaked:** delete the deploy key in GitHub and make a new one. Moving `production` stops until then, which is safe: the site keeps running.

### 6.3 GitHub permissions that keep pull requests and other workflows out (proposed, task 1.2 and 1.4)

These are the settings that stop a pull request, or any workflow other than Migrate production, from moving `production` or reading production secrets. Each must be set as described. Task 1.2 records each one as checked.

| Where                                                      | Setting                                                                                                                                                                                 | Why                                                                                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Settings → Actions → General → Workflow permissions        | **Read repository contents and packages permissions**; untick **Allow GitHub Actions to create and approve pull requests**                                                              | The default `GITHUB_TOKEN` can't push, and can't approve its own changes                                                             |
| Each workflow file                                         | Top-level `permissions: contents: read`. Migrate production adds only `actions: read` and `checks: read`, to read the staging run and CI results for the SHA                            | Nothing gets more than it needs                                                                                                      |
| Settings → Actions → General → Fork pull request workflows | Require approval for all outside collaborators. Don't send write tokens or secrets to fork pull requests                                                                                | Pull requests from forks never get secrets. This is GitHub's default; it's recorded here so it isn't loosened                        |
| Workflow triggers                                          | No workflow uses `pull_request_target` or `workflow_run` to touch production. Migrate production runs only on `workflow_dispatch`, and its jobs check `github.ref == 'refs/heads/main'` | Pull-request code never runs with production secrets                                                                                 |
| Environment `production`                                   | Deployment branches: **Selected branches → `main` only**. Required reviewer: you, where your plan allows                                                                                | A job started from any other branch, including a pull request's branch, is refused the environment and its secrets                   |
| Environment `production-backup`                            | Deployment branches: `main` only. Holds only `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE`, never the deploy key                                                                            | The nightly backup can read the database, but can't move `production`                                                                |
| Repository secrets                                         | No production value stored as a repository secret. The GitHub Free fallback in `docs/BACKUPS.md`, section 3.1, is the one exception, and is marked as the weakest option                | Repository secrets reach every workflow on every branch                                                                              |
| Ruleset on `main`                                          | Changes only through pull requests with passing CI; no force pushes; no deletion                                                                                                        | Changing a workflow on `main`, which is where production secrets are reachable, means going through a reviewed, checked pull request |
| Ruleset on `production`                                    | Section 6.1. Only the deploy key may bypass                                                                                                                                             | Only D4 can move it                                                                                                                  |
| Settings → Actions → General → Actions permissions         | Allow actions by GitHub and verified creators only. Pin third-party actions to a full commit SHA                                                                                        | An outside action can't be swapped for one that reads secrets                                                                        |
| Settings → Collaborators                                   | You only, for now. Anyone added later with write access can start workflows, so access is reviewed before adding anyone                                                                 | Starting Migrate production needs write access                                                                                       |

**Limits that remain:**

- An account with admin rights on the repository, which today is you, can change any of these settings. That is why the ruleset and environment changes are logged in GitHub's audit log, and why this account must use two-factor.
- On a private repository without Pro, environment branch rules and rulesets aren't available. The protection then rests on you being the only collaborator, until the plan changes.

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
| 1.2  | Confirm repository visibility, GitHub plan and collaborators; relabel the live project; create `perqly-staging`; create the GitHub environments that fit your plan                                   | You                                  |
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
