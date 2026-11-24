#!/usr/bin/env bash
# Events & Conferences upgrade test: build a database up to 20261126 (before Events), make
# representative events, RSVPs and tickets with the OLD functions, apply the Events migrations,
# then check nothing was lost and old tickets still work.
# Usage: PGHOST=/tmp PGPORT=54329 PGUSER=postgres scripts/db/test-events-upgrade.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${PERQLY_UPGRADE_DB:-perqly_events_upgrade}"
psql_q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
psql_q -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
psql_q -d "$DB" -c "alter database $DB set search_path = \"\$user\", public, extensions" >/dev/null
psql_q -d "$DB" -f scripts/db/supabase-shim.sql >/dev/null 2>&1
for f in supabase/migrations/*.sql; do
  [[ "$(basename "$f")" < "20261127" ]] || continue
  psql_q -d "$DB" -f "$f" >/dev/null
done
psql_q -d "$DB" -f supabase/seed.sql >/dev/null
psql_q -d "$DB" -f supabase/upgrade-tests/events_before.sql >/dev/null
echo "before: $(psql -X -t -A -d "$DB" -c "select count(*) from public.event_tickets") tickets, $(psql -X -t -A -d "$DB" -c "select count(*) from public.event_rsvps") RSVPs"
for f in supabase/migrations/20261127*.sql; do
  echo "migrate  $(basename "$f")"
  psql_q -d "$DB" -f "$f" >/dev/null
done
out=$(psql -X -q -t -A -v ON_ERROR_STOP=1 -d "$DB" -f supabase/upgrade-tests/events_after.sql 2>&1) || { echo "$out" | tail -20; exit 1; }
echo "$out" | grep -E '^(ok|not ok)'
! grep -qE '^not ok|^# Looks like' <<<"$out"
