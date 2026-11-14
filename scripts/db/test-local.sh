#!/usr/bin/env bash
# Runs Perqly's migrations and pgTAP tests on a local Postgres (no Docker).
# Usage: PGHOST=/tmp PGPORT=54329 PGUSER=postgres scripts/db/test-local.sh
# CI uses `supabase db start` + `supabase test db` against the real Supabase image instead.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${PERQLY_TEST_DB:-perqly_test}"
psql_q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }

psql_q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql_q -d "$DB" -c "alter database $DB set search_path = \"\$user\", public, extensions"
psql_q -d "$DB" -f scripts/db/supabase-shim.sql >/dev/null
for f in supabase/migrations/*.sql; do
  echo "migrate  $(basename "$f")"
  psql_q -d "$DB" -f "$f" >/dev/null
done
echo "seed     seed.sql"
psql_q -d "$DB" -f supabase/seed.sql >/dev/null

total=0; failed=0
for t in supabase/tests/*.sql; do
  out=$(psql -X -q -t -A -v ON_ERROR_STOP=1 -d "$DB" -f "$t" 2>&1) || { echo "ERROR    $(basename "$t")"; echo "$out" | tail -20; exit 1; }
  ok=$(grep -c '^ok ' <<<"$out" || true)
  bad=$(grep -c '^not ok ' <<<"$out" || true)
  total=$((total + ok + bad)); failed=$((failed + bad))
  if [ "$bad" -gt 0 ] || grep -q '^# Looks like' <<<"$out"; then
    echo "FAIL     $(basename "$t")  ($ok passed, $bad failed)"
    grep -E '^not ok|^#' <<<"$out" | head -40
    failed=$((failed + (bad == 0 ? 1 : 0)))
  else
    echo "pass     $(basename "$t")  ($ok tests)"
  fi
done
echo "----"
echo "$total tests, $failed failed"
[ "$failed" -eq 0 ]
