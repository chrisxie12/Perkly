# Database backups

Supabase's free plan keeps no backups you can download, so a GitHub Action
(`.github/workflows/backup.yml`) dumps the database every night at 01:17 UTC.
It encrypts the dump with a passphrase only you hold and keeps it for 14 days
as a workflow artifact. GitHub never sees the unencrypted file.

## What's included

The `public` and `private` schemas (every table, function and policy) and `auth` (the sign-in accounts). Uploaded files (logos, shop photos, pass photos, verification photos) live in Supabase Storage and are **not** included. Verification photos are deleted after 30 days anyway; logos and shop photos can be uploaded again.

## Set it up (once)

1. In Supabase: Project Settings → Database → Connection string → **Session pooler**. Copy the URI and put your database password into it.
2. Make a long random passphrase (your password manager can generate one) and save it there as "Perqly backup passphrase". Without it the backups can't be opened.
3. In GitHub: chrisxie12/Perkly → Settings → Secrets and variables → Actions → New repository secret:
   - `SUPABASE_DB_URL`: the connection string from step 1
   - `BACKUP_PASSPHRASE`: the passphrase from step 2
4. Actions → Nightly database backup → **Run workflow**, to check it works now rather than tonight.

Don't paste either value into chat, an issue, or a file in the repo.

## Restore

Always into a new, empty Supabase project, never over a live one.

1. Actions → Nightly database backup → pick a run → download the artifact and unzip it.
2. Decrypt: `gpg --decrypt perqly-<date>.dump.gpg > perqly.dump` (it asks for the passphrase).
3. Create the tables in the new project: `npx supabase link --project-ref <new ref>`, then `npx supabase db push`.
4. Restore the sign-in accounts first, then everything else. Triggers are switched off so no notifications are sent again:
   - `pg_restore --data-only --no-owner --schema=auth --dbname "<new connection string>" perqly.dump`
   - `pg_restore --data-only --no-owner --disable-triggers --schema=public --schema=private --dbname "<new connection string>" perqly.dump`
5. Point the app's environment variables at the new project, then delete `perqly.dump` from your computer.

Try a restore into a scratch project once before launch, so you know it works when it matters.
