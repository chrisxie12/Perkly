# Database backups

**How the production database is backed up, how a backup is checked, and how a restore is meant to work. A restore has not been tested yet.**

|         |                                                                                                                                                                               |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status  | The nightly backup already runs. Everything marked **Proposed** is part of tasks 1.2, 1.4, 1.8 and 1.15. **No restore has been rehearsed**, so the restore steps are untested |
| Updated | 2026-11-16                                                                                                                                                                    |
| Related | `docs/PRODUCTION_SEPARATION.md`, `docs/SUPABASE_SETUP.md`, `docs/TEST_DATA_CLEANUP.md`                                                                                        |

## 1. What runs today

`.github/workflows/backup.yml` runs at 01:17 UTC every night, and whenever you start it by hand. It:

1. dumps the **production** database with `pg_dump` 17 (custom format, `--no-owner --no-privileges`), covering the `public`, `private` and `auth` schemas;
2. encrypts the dump with GPG (AES-256), using a passphrase only you hold, then shreds the unencrypted file;
3. uploads the encrypted file as a workflow artifact and keeps it for 14 days.

GitHub never sees the unencrypted file. Staging is not backed up, because it can be rebuilt from the migrations at any time.

**A known gap today:** if either secret is missing, the job prints "skipping" and finishes with a green tick. A backup can stop being taken without anyone noticing. Section 4 fixes this.

## 2. What a backup contains, and what it doesn't

| Included                                                                                                                                      | Not included                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every table, row, function and policy in `public` and `private`                                                                               | **Storage file contents.** The photos and documents in `merchant-photos`, `institution-logos`, `pass-photos` and `verification-documents` are not in the dump. The `storage` schema isn't dumped either, so the list of files is missing too |
| Sign-in accounts in `auth`: users, Google identities, two-factor factors, sessions, audit entries, and Supabase Auth's own bookkeeping tables | Supabase project settings: auth providers, URL configuration, email templates, SMTP, rate limits, the Google client, API keys, the JWT signing keys                                                                                          |
|                                                                                                                                               | Vercel and GitHub settings, environment variables, Edge Function secrets                                                                                                                                                                     |
|                                                                                                                                               | Other schemas Supabase manages (`storage`, `realtime`, `extensions`, `vault`, `supabase_migrations`, `cron`)                                                                                                                                 |

What the missing files mean after a restore:

- `merchant_photos.path`, `institutions.logo_path`, pass-photo paths and verification photo paths would point at files that don't exist. Shop photos and logos would need re-uploading. Pass photos would need re-taking.
- Verification photos are deleted 30 days after a decision anyway. Applications still open would need students to upload again.

A separate backup of Storage is a later decision and isn't part of Milestone 1.

## 3. Secrets

| Secret              | Holds                                                                        | Today             | Proposed                                 |
| ------------------- | ---------------------------------------------------------------------------- | ----------------- | ---------------------------------------- |
| `SUPABASE_DB_URL`   | production Session pooler connection string, including the database password | repository secret | GitHub environment secrets (section 3.1) |
| `BACKUP_PASSPHRASE` | the passphrase that encrypts every backup                                    | repository secret | same                                     |

Keep the passphrase in your password manager as "Perqly backup passphrase". **Without it, no backup can be opened.** Never paste either value into chat, an issue or a file.

After the production database password is changed (task 1.8), update `SUPABASE_DB_URL` straight away. Then run the backup by hand and check it passes every check in section 4.

### 3.1 Where the secrets should live (depends on your GitHub plan)

Environment secrets and protection rules depend on whether the repository is public or private, and on your GitHub plan. According to GitHub's documentation (checked 2026-11-16):

- In a private repository, environments, environment secrets and branch restrictions on environments need GitHub Pro, Team or Enterprise.
- Required reviewers on an environment are only available in public repositories, unless you have GitHub Enterprise.

Neither the repository's visibility nor your plan has been checked. Task 1.2 starts by confirming both, read-only. The proposal for each case:

| Repository and plan                          | Nightly backup secrets                                          | Migrate production secrets                                                                                                                                                                                                        |
| -------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public, any plan; or private with Enterprise | environment `production-backup`, limited to `main`, no reviewer | environment `production`, limited to `main`, you as required reviewer                                                                                                                                                             |
| Private, with GitHub Pro                     | environment `production-backup`, limited to `main`              | environment `production`, limited to `main`. No reviewer is available, so the approval is that you start the run yourself and type the commit (see `docs/PRODUCTION_SEPARATION.md`, section 6)                                    |
| Private, GitHub Free                         | repository secrets (as today)                                   | repository secrets. Any workflow on any branch could read them, so this is the weakest option. Upgrading is worth considering first; GitHub Pro may be included in student programmes you have access to, but check this yourself |

The nightly backup has its own environment because a required reviewer would otherwise hold up every scheduled run until you approved it.

## 4. Proposed: checks on every backup (task 1.4)

The backup job **fails, with a red cross, whenever anything is wrong**. None of the checks below may be skipped.

| Check                 | Fails when                                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secrets present       | `SUPABASE_DB_URL` or `BACKUP_PASSPHRASE` is empty. Replaces today's silent skip                                                                                                         |
| Dump readable         | `pg_restore --list` can't read the archive                                                                                                                                              |
| Dump complete         | The archive's table of contents is missing table data for any of these: `auth.users`, `public.profiles`, `public.merchants`, `public.offers`, `public.redemptions`, `public.audit_logs` |
| Size plausible        | The archive is smaller than a fixed minimum, set after the first good runs                                                                                                              |
| Encryption reversible | Decrypting the encrypted file with the same passphrase and listing it again fails, or gives a different SHA-256 than the original                                                       |
| Upload                | The artifact upload fails or uploads no file                                                                                                                                            |

The job summary records the date, the size, the SHA-256 of the encrypted file and the table count. It never records connection strings, passphrases or row contents.

### 4.1 How you're told about a failure

- **GitHub's email.** For a scheduled workflow, GitHub sends failure notifications to the person who last changed the `cron` line in the workflow file. That needs to be your account, with Actions notifications switched on for failed runs (GitHub → Settings → Notifications → Actions). Confirm this in task 1.2.
- **A weekly check by you.** Actions → Nightly database backup should show seven green runs. A missing run counts as a failure.
- **If the repository is public:** GitHub switches off scheduled workflows after 60 days without any activity in the repository. The weekly check catches this.
- **Before a production change:** Migrate production takes its own backup and runs the same checks (section 5). It doesn't depend on last night's backup having worked.

These checks prove the file is readable and complete. **They don't prove a restore works.** Only a rehearsal does (section 7).

## 5. Proposed: a backup before every production change

From task 1.4, **Migrate production** runs the same backup and the same checks as the first step after its preconditions. **If any check fails, the workflow stops and changes nothing.** The test-data clean-up (`docs/TEST_DATA_CLEANUP.md`) also starts with a fresh, checked backup. These backups are also kept for 14 days. Download any you want to keep longer.

## 6. Restore procedure (draft, untested)

**Status: draft. Nobody has carried this out yet.** It will be corrected during the rehearsal in section 7. Until a rehearsal passes, don't describe Perqly's backups as restorable.

Always restore into a **new, empty** Supabase project, never over the live one.

### 6.1 What was wrong with the earlier draft

The earlier draft used `pg_restore --disable-triggers` straight into the new project. That probably wouldn't work on Supabase:

- **Disabling triggers:** `--disable-triggers` runs `ALTER TABLE … DISABLE TRIGGER ALL` on every table. That needs superuser rights, or ownership of the table. On Supabase, the `postgres` role is not a superuser, and the `auth` tables belong to Supabase's own auth role. The command would fail, or leave triggers running.
- **Clashing rows:** a new project already has rows in its own auth bookkeeping table (`auth.schema_migrations`). Restoring the backup's copy of that table clashes with them.
- **Version mismatch:** a new project may run a newer version of Supabase Auth than the backup came from. Any column that differs between versions makes the restore fail.

Supabase's own restore guide does it differently: it imports the data with `psql` after running `SET session_replication_role = replica`. That turns off triggers, and with them foreign-key checks, for that one session. The draft below follows that approach.

### 6.2 Draft steps

1. **Get the file.** Actions → Nightly database backup (or Migrate production) → pick a run → download the artifact → unzip it.
2. **Decrypt it on your own computer:** `gpg --decrypt perqly-<date>.dump.gpg > perqly.dump`. It asks for the passphrase.
3. **Build the schema.** Create a project in London, then run `npx supabase link --project-ref <new ref>` and `npx supabase db push`. This creates the `public` and `private` schemas, the functions, the policies, the grants, the four Storage buckets and the realtime setup, exactly as the migrations define them. Supabase creates the `auth` schema itself.
4. **Make a list of what to restore.** Run `pg_restore --list perqly.dump > restore.list`. Then delete the lines for Supabase's own bookkeeping table `auth.schema_migrations`. The rehearsal decides whether `auth.sessions`, `auth.refresh_tokens`, `auth.flow_state` and `auth.one_time_tokens` should be removed too. Removing them signs everyone out but avoids carrying over half-finished sign-ins.
5. **Turn the list into a data-only SQL file:** `pg_restore --data-only --no-owner --no-privileges --use-list=restore.list --file=data.sql perqly.dump`.
6. **Import it in one transaction, with triggers off:**
   ```
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --command 'SET session_replication_role = replica' \
     --file data.sql --dbname "<new project's Session pooler connection string>"
   ```
   If anything fails, the whole import is undone and the new project stays empty. Triggers being off means no notification emails, no push messages and no duplicate audit entries.
7. **Check the data.** Foreign keys were not checked during the import, so check them now. For each foreign key, count rows that point at nothing. The rehearsal writes these queries once, then keeps them in the repository. Every count must be 0. Also compare row counts per table with the source, and check that sequences carry on above the restored maximum.
8. **Reapply settings by hand.** Copy the dashboard settings from `docs/SUPABASE_SETUP.md`, section 3: providers, URLs, templates, SMTP, MFA, rate limits and the Google client.
9. **Run the Security Advisor.** It must show no errors.
10. **Switch the app.** Point Vercel Production's Supabase variables at the new project and redeploy.
11. **Clean up.** Securely delete `perqly.dump`, `data.sql` and `restore.list` from your computer. They contain personal data.

### 6.3 What a restore can't bring back

- **Sign-ins:** the new project has new signing keys, so everyone is signed out and signs in again. Email codes work as before. Google sign-in works once the Google client is entered in the new project and its redirect URI is updated to the new project's address.
- **Two-factor:** authenticator setups are restored with `auth.mfa_factors`. The rehearsal must confirm a staff member can still pass the two-factor step.
- **Configuration:** anything in section 2's right-hand column must be set up again by hand.
- **Push notifications:** each phone has to turn notifications on again, unless the same VAPID keys are kept in Vercel.
- **Storage files:** see section 2.
- **Supabase Auth versions:** if the new project's Supabase Auth is a newer version and its tables differ from the backup's, step 6 fails. The fix would be to restore into a project on the matching version, if Supabase offers one, or to adjust the SQL by hand.

### 6.4 Restoring only some tables

After a bad migration, it can be safer to restore everything into a scratch project, check the affected rows there, and copy back only what's needed. Claude can prepare that SQL for your review. You run it.

## 7. Restore rehearsal (task 1.15)

The rehearsal comes before Vercel's production branch moves to `production`. **It passes only if every item below is true:**

1. Last night's backup restores into a temporary project using section 6, with no errors.
2. Every orphan count from step 7 is 0.
3. Row counts for every restored table match the source at the time of the backup.
4. You can sign in on a preview build pointed at the temporary project, with your own account, including the two-factor step.
5. A redemption, a chat and a notification look correct in that build.
6. The time it took is written down.

Afterwards:

- Write down the corrected steps and replace section 6 with them.
- Delete the temporary project the same day. It holds real personal data.
- Change the status line of this document to "Restore rehearsed on `<date>`".

Repeat the rehearsal every three months, and after any change to the backup workflow or a major Supabase Auth upgrade.
