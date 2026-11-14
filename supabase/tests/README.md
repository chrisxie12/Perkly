# Database tests (pgTAP)

Each `*_test.sql` file runs in its own transaction and rolls back, so tests never leave data behind.
Every file starts with the same small block of helpers (`tests.create_user`, `tests.as_user`,
`tests.as_anon`, `tests.as_postgres`), copied rather than shared so each file runs on its own.

- **CI / with Docker:** `npx supabase db start && npx supabase test db`
- **Without Docker (plain Postgres 16+ with pgTAP):** `PGHOST=… PGPORT=… PGUSER=postgres scripts/db/test-local.sh`.
  This uses `scripts/db/supabase-shim.sql` to stand in for Supabase's roles and `auth` schema.
