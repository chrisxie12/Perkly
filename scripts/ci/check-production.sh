#!/usr/bin/env bash
# Read-only release checks A6–A8 for Migrate production (docs/PRODUCTION_SEPARATION.md, section 6).
#   A6  production's migration history is exactly the start of the commit's list (no drift)
#   A7  the production branch can fast-forward to the commit
#   A8  a dry run would apply exactly the pending migrations
# Writes pending.txt and files.txt; prints the pending count as `count=N` to GITHUB_OUTPUT.
# Needs: SHA, FILES (space-separated versions), SUPABASE_DB_URL (production), the supabase CLI.
set -euo pipefail

fail() { echo "::error::$1"; exit 1; }
[ -n "${SHA:-}" ] && [ -n "${SUPABASE_DB_URL:-}" ] || fail "SHA and SUPABASE_DB_URL are required"

tr ' ' '\n' <<<"${FILES:-}" | sed '/^$/d' > files.txt
[ -s files.txt ] || fail "No migration files for ${SHA}"

# A6
scripts/ci/migration-versions.sh applied > production.txt
applied=$(wc -l < production.txt | tr -d ' ')
diff -u production.txt <(head -n "$applied" files.txt) ||
  fail "Production's history isn't the start of this commit's list (drift). Investigate before releasing."
tail -n +"$((applied + 1))" files.txt > pending.txt
count=$(wc -l < pending.txt | tr -d ' ')

# A7
current=$(git ls-remote origin refs/heads/production | cut -f1)
if [ -n "$current" ]; then
  git merge-base --is-ancestor "$current" "$SHA" ||
    fail "production (${current}) isn't an ancestor of ${SHA}; the move wouldn't be a fast-forward."
fi

# A8
supabase db push --remote="$SUPABASE_DB_URL" --dry-run --yes > dry.txt 2>&1 || { cat dry.txt; fail "The dry run failed."; }
grep -oE '[0-9]{14}_[A-Za-z0-9_]+\.sql' dry.txt | cut -d_ -f1 | sort -u > dry-versions.txt || true
diff -u pending.txt dry-versions.txt || { cat dry.txt; fail "The dry run doesn't match the pending list."; }

[ -n "${GITHUB_OUTPUT:-}" ] && echo "count=$count" >> "$GITHUB_OUTPUT"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Pending migrations for production: ${count}"
    sed 's/^/- /' pending.txt
    [ -n "$current" ] && echo "production branch: \`${current}\` → \`${SHA}\`" || echo "production branch: will be created at \`${SHA}\`"
  } >> "$GITHUB_STEP_SUMMARY"
fi
echo "A6–A8 passed: ${count} pending migration(s)."
