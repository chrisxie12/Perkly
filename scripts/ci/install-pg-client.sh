#!/usr/bin/env bash
# Installs the Postgres 17 client tools (pg_dump, pg_restore, psql) on a GitHub runner.
# Supabase runs Postgres 17, and pg_dump must be at least as new as the server.
set -euo pipefail
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" |
  sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq postgresql-client-17
/usr/lib/postgresql/17/bin/pg_dump --version
