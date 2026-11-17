#!/usr/bin/env bash
# Installs the Postgres 17 client tools (pg_dump, pg_restore, psql) on a GitHub runner.
# Supabase runs Postgres 17, and pg_dump must be at least as new as the server.
set -euo pipefail
# Network hiccups on the runner are common, so every download retries.
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSL --retry 5 --retry-delay 3 --retry-all-errors -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" |
  sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
sudo apt-get -o Acquire::Retries=5 update -qq
sudo apt-get -o Acquire::Retries=5 install -y -qq postgresql-client-17
/usr/lib/postgresql/17/bin/pg_dump --version
