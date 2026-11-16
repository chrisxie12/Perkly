# Database backups

**How the production database is backed up, where the backups are kept, and how to restore one.**

|         |                                                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------- |
| Status  | Nightly backup exists today. The changes in sections 4 and 5 are **proposed** (tasks 1.2, 1.4, 1.8, 1.15) |
| Updated | 2026-11-16                                                                                                |
| Related | `docs/PRODUCTION_SEPARATION.md`, `docs/TEST_DATA_CLEANUP.md`                                              |

## 1. What runs today

Supabase's free plan keeps no backups you can download, so `.github/workflows/backup.yml` dumps the **production** database every night at 01:17 UTC. It encrypts the dump with a passphrase only you hold (GPG, AES-256) and keeps it for 14 days as a workflow artifact. GitHub never sees the unencrypted file. If its secrets are missing, the job skips instead of failing.

Staging is not backed up. It can always be rebuilt from the migrations.

## 2. What's included

- The `public` and `private` schemas (tables, functions, policies) and `auth` (sign-in accounts).
- **Not included:** Supabase Storage files (`merchant-photos`, `institution-logos`, `pass-photos`, `verification-documents`). Verification photos are deleted 30 days after a decision anyway; shop photos and logos would need re-uploading. A Storage backup is a later decision.

## 3. Secrets

| Secret              | Holds                                                                   | Today             | Proposed                                                                           |
| ------------------- | ----------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------- |
| `SUPABASE_DB_URL`   | production Session pooler connection string, with the database password | repository secret | copied into two GitHub environments (below), then the repository secret is deleted |
| `BACKUP_PASSPHRASE` | the passphrase that encrypts every backup                               | repository secret | same                                                                               |

Keep the passphrase in your password manager as "Perqly backup passphrase". Without it, the backups can't be opened. Never paste either value into chat, an issue or a file.

Why two environments: GitHub's required-reviewer rule applies to scheduled runs too, so a nightly job in the `production` environment would wait for your approval every night. Instead:

- **`production`**: required reviewer (you). Used by Migrate production, including its pre-migration backup.
- **`production-backup`**: no reviewer, but limited to the `main` branch. Used only by the nightly backup job, which only reads the database.

Pull requests and other branches can read neither. The workflow changes are part of task 1.4.

After the database password is rotated (task 1.8), update `SUPABASE_DB_URL` straight away, then run the backup by hand (Actions → Nightly database backup → **Run workflow**) to confirm it still works.

## 4. Backups before changes

From task 1.4, the **Migrate production** workflow takes the same encrypted backup **immediately before** applying migrations, and stops if the backup fails. The clean-up in `docs/TEST_DATA_CLEANUP.md` also starts with a fresh backup. These backups are kept 14 days like the nightly ones; download any you want to keep longer.

## 5. Restore

Always into a **new, empty** Supabase project, never over the live one.

1. Actions → Nightly database backup (or Migrate production) → pick a run → download the artifact and unzip it.
2. Decrypt: `gpg --decrypt perqly-<date>.dump.gpg > perqly.dump` (asks for the passphrase).
3. Create a new project in London and build the schema: `npx supabase link --project-ref <new ref>`, then `npx supabase db push`.
4. Restore sign-in accounts first, then everything else, with triggers off so no notifications are re-sent:
   - `pg_restore --data-only --no-owner --schema=auth --dbname "<new connection string>" perqly.dump`
   - `pg_restore --data-only --no-owner --disable-triggers --schema=public --schema=private --dbname "<new connection string>" perqly.dump`
5. Copy the dashboard settings from `docs/SUPABASE_SETUP.md` section 3 (auth, URLs, templates, SMTP, Google).
6. Point Vercel Production's Supabase variables at the new project and redeploy.
7. Delete `perqly.dump` and the decrypted files from your computer.

To restore **only some tables** after a bad migration, restore into a new project as above, check the rows there, and copy back just what's needed. Claude can prepare that SQL for your review.

## 6. Restore rehearsal (task 1.15)

Before Vercel's production branch switches to `production`, rehearse once:

1. Restore last night's backup into a temporary project, following section 5 up to step 5.
2. Check that row counts for `profiles`, `merchants`, `offers` and `redemptions` match production, and that you can sign in there with your own account.
3. Record the date and how long it took.
4. Delete the temporary project. It holds real personal data, so it must not be left running.

Repeat the rehearsal every three months, and after any change to the backup workflow.
