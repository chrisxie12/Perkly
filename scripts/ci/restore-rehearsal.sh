#!/usr/bin/env bash
# Restore rehearsal (docs/BACKUPS.md, sections 6 and 7). Imports an encrypted backup's
# data into a temporary project whose schema was just built from the migrations, then
# checks it. Never prints the connection string, the passphrase or any row of data:
# only table names, constraint names, counts and SQLSTATE codes. The repository is
# public, so its Actions logs are too.
#
# Usage: restore-rehearsal.sh <encrypted backup (.dump.gpg)>
# Needs: RESTORE_DB_URL (the temporary project), BACKUP_PASSPHRASE
# Optional: PGBIN (default /usr/lib/postgresql/17/bin)
set -euo pipefail

started=$(date +%s)
fail() {
  echo "::error::Restore rehearsal failed: $1"
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "**Restore rehearsal failed:** $1" >>"$GITHUB_STEP_SUMMARY"
  exit 1
}
summary() {
  echo "$1"
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$1" >>"$GITHUB_STEP_SUMMARY"
  return 0
}

[ $# -eq 1 ] || fail "usage: restore-rehearsal.sh <encrypted backup>"
[ -f "$1" ] || fail "the backup file is missing"
[ -n "${RESTORE_DB_URL:-}" ] || fail "RESTORE_DB_URL is not set for this job"
[ -n "${BACKUP_PASSPHRASE:-}" ] || fail "BACKUP_PASSPHRASE is not set for this job"
PGBIN=${PGBIN:-/usr/lib/postgresql/17/bin}

umask 077
work=$(mktemp -d)
# shellcheck disable=SC2329 # called by the trap below
cleanup() {
  find "$work" -type f -exec shred -u {} + 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT

# Quiet psql: no row output, errors as SQLSTATE codes only (a full error message can
# quote a value from a row).
q() { "$PGBIN/psql" "$RESTORE_DB_URL" --no-psqlrc --quiet --tuples-only --no-align -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate "$@"; }

# 1. Decrypt.
gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt --output "$work/perqly.dump" "$1" 3<<<"$BACKUP_PASSPHRASE" ||
  fail "the backup couldn't be decrypted with BACKUP_PASSPHRASE"

# 2. What to restore: every table's data and every sequence value, except Supabase
#    Auth's own bookkeeping and short-lived sign-in state (everyone signs in again).
"$PGBIN/pg_restore" --list "$work/perqly.dump" >"$work/all.list" || fail "pg_restore can't read the backup"
grep -E ' (TABLE DATA|SEQUENCE SET) ' "$work/all.list" |
  grep -Ev ' auth (schema_migrations|sessions|refresh_tokens|flow_state|one_time_tokens|mfa_challenges|mfa_amr_claims) ' >"$work/restore.list"
tables=$(awk '/ TABLE DATA /{print $(NF-2) "." $(NF-1)}' "$work/restore.list" | sort -u)
[ -n "$tables" ] || fail "the backup has no table data"

# Which Supabase Auth version made the backup, and which the target runs.
source_auth=$(grep -E ' TABLE DATA auth schema_migrations ' "$work/all.list" >/dev/null &&
  "$PGBIN/pg_restore" --data-only --table=schema_migrations --schema=auth --file=- "$work/perqly.dump" 2>/dev/null |
  awk '/^COPY /{on=1; next} /^\\\.$/{on=0} on{print $1}' | sort -n | tail -1 || true)
target_auth=$(q -c "select version from auth.schema_migrations order by length(version) desc, version desc limit 1" 2>/dev/null || true)

# 3. The data as SQL, and the rows it holds per table (counted from the COPY blocks).
"$PGBIN/pg_restore" --data-only --no-owner --no-privileges --use-list="$work/restore.list" --file="$work/data.sql" "$work/perqly.dump" ||
  fail "pg_restore couldn't write the data file"
awk '/^COPY /{t=$2; n=0; on=1; next} /^\\\.$/{if(on) print t, n; on=0; next} on{n++}' "$work/data.sql" |
  sed -E 's/"//g' | sort >"$work/expected.txt"

# 4. Empty the tables first. The migrations insert some rows (settings, the school
#    directory, buckets); the backup has the real ones. Then import in one transaction
#    with triggers (and so foreign-key checks, audit entries and notifications) off.
{
  echo "SET session_replication_role = replica;"
  for t in $tables; do echo "DELETE FROM ${t};"; done
} >"$work/prepare.sql"
"$PGBIN/psql" "$RESTORE_DB_URL" --no-psqlrc --quiet --single-transaction -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate \
  --file="$work/prepare.sql" --file="$work/data.sql" >/dev/null 2>"$work/import.err" || {
  codes=$(grep -oE 'ERROR: +[0-9A-Z]{5}' "$work/import.err" | awk '{print $2}' | sort -u | paste -sd' ' -)
  fail "the import was refused and rolled back (SQLSTATE ${codes:-unknown}). 42501 means a permission was refused, 23505 a duplicate row"
}

# 5. Checks. Output is names and numbers only.
problems=0

# 5a. Row counts match the backup, table by table.
while read -r table expected; do
  actual=$(q -c "select count(*) from ${table}") || fail "couldn't count ${table}"
  if [ "$actual" != "$expected" ]; then
    echo "::error::${table}: ${actual} rows restored, ${expected} in the backup"
    problems=$((problems + 1))
  fi
done <"$work/expected.txt"
table_count=$(wc -l <"$work/expected.txt" | tr -d ' ')
row_total=$(awk '{s+=$2} END{print s+0}' "$work/expected.txt")

# 5b. No row points at nothing (foreign keys weren't checked during the import).
orphans=$(q <<'SQL'
create temp table orphan_check (constraint_name text, rows bigint) on commit preserve rows;
do $$
declare
  c record;
  n bigint;
  fk_cols text;
  pk_cols text;
  nn text;
begin
  for c in
    select con.conname, con.conrelid, con.confrelid, con.conkey, con.confkey
    from pg_constraint con
    where con.contype = 'f'
      and con.connamespace in ('public'::regnamespace, 'private'::regnamespace, 'auth'::regnamespace)
  loop
    select string_agg(format('f.%I', a.attname), ', ' order by k.i),
           string_agg(format('f.%I is not null', a.attname), ' and ' order by k.i)
      into fk_cols, nn
      from unnest(c.conkey) with ordinality k(attnum, i)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum;
    select string_agg(format('p.%I', a.attname), ', ' order by k.i)
      into pk_cols
      from unnest(c.confkey) with ordinality k(attnum, i)
      join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum;
    execute format('select count(*) from %s f where %s and not exists (select 1 from %s p where (%s) = (%s))',
                   c.conrelid::regclass, nn, c.confrelid::regclass, pk_cols, fk_cols) into n;
    if n > 0 then insert into orphan_check values (c.conrelid::regclass || '.' || c.conname, n); end if;
  end loop;
end
$$;
select constraint_name || ' ' || rows from orphan_check order by 1;
SQL
) || fail "the orphan check couldn't run"
fk_total=$(q -c "select count(*) from pg_constraint where contype = 'f' and connamespace in ('public'::regnamespace, 'private'::regnamespace, 'auth'::regnamespace)")
if [ -n "$orphans" ]; then
  while read -r name rows; do
    echo "::error::${name}: ${rows} rows point at nothing"
    problems=$((problems + 1))
  done <<<"$orphans"
fi

# 5c. Sequences carry on above the highest restored value.
behind=$(q <<'SQL'
create temp table sequence_check (sequence_name text) on commit preserve rows;
do $$
declare
  c record;
  top numeric;
  last numeric;
begin
  for c in
    select s.seqrelid, d.refobjid as tbl, a.attname
    from pg_sequence s
    join pg_depend d on d.classid = 'pg_class'::regclass and d.objid = s.seqrelid and d.deptype in ('a', 'i')
                    and d.refclassid = 'pg_class'::regclass and d.refobjsubid > 0
    join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
    join pg_class t on t.oid = d.refobjid
    where t.relnamespace in ('public'::regnamespace, 'private'::regnamespace, 'auth'::regnamespace)
  loop
    execute format('select coalesce(max(%I), 0) from %s', c.attname, c.tbl::regclass) into top;
    execute format('select case when is_called then last_value else last_value - 1 end from %s', c.seqrelid::regclass) into last;
    if top > last then insert into sequence_check values (c.seqrelid::regclass::text); end if;
  end loop;
end
$$;
select sequence_name from sequence_check order by 1;
SQL
) || fail "the sequence check couldn't run"
if [ -n "$behind" ]; then
  while read -r seq; do
    echo "::error::sequence ${seq} is behind its column's highest value"
    problems=$((problems + 1))
  done <<<"$behind"
fi

elapsed=$(($(date +%s) - started))
summary "Restore rehearsal: ${table_count} tables, ${row_total} rows imported with triggers off. Row counts: $([ "$problems" -eq 0 ] && echo "all match" || echo "see errors"). Foreign keys checked: ${fk_total}, orphans: $([ -z "$orphans" ] && echo 0 || echo "see errors"). Sequences: $([ -z "$behind" ] && echo "all ahead" || echo "see errors"). Supabase Auth version: backup ${source_auth:-unknown}, target ${target_auth:-unknown}. Took ${elapsed} s."
[ "$problems" -eq 0 ] || fail "${problems} check(s) failed"
summary "All automatic checks passed. Still to do by hand: docs/BACKUPS.md section 7, items 6 and 7 (sign in on a preview pointed at this project; look at a redemption, a chat and a notification). Then delete the temporary project."
