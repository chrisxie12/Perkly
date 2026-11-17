#!/usr/bin/env bash
# Prints migration versions, one per line, sorted.
#   migration-versions.sh files   versions of supabase/migrations/*.sql in the checkout
#   migration-versions.sh applied versions recorded in the database at SUPABASE_DB_URL
# (needs psql; an empty or brand-new database prints nothing).
set -euo pipefail
PGBIN=${PGBIN:-/usr/lib/postgresql/17/bin}
case "${1:-}" in
  files)
    for f in supabase/migrations/*.sql; do
      [ -e "$f" ] || continue
      basename "$f" | cut -d_ -f1
    done | sort
    ;;
  applied)
    [ -n "${SUPABASE_DB_URL:-}" ] || { echo "::error::SUPABASE_DB_URL is not set for this job" >&2; exit 1; }
    "$PGBIN/psql" "$SUPABASE_DB_URL" -X -q -At -v ON_ERROR_STOP=1 \
      -c "select version from supabase_migrations.schema_migrations order by version" 2>/tmp/psql.err ||
      { grep -q 'does not exist' /tmp/psql.err && exit 0; cat /tmp/psql.err >&2; exit 1; }
    ;;
  *)
    echo "usage: migration-versions.sh files|applied" >&2
    exit 2
    ;;
esac
