#!/usr/bin/env bash
# Takes an encrypted backup of the database in SUPABASE_DB_URL and checks it
# (docs/BACKUPS.md, section 4). Any failed check stops with a non-zero exit, so the
# workflow shows a red cross. It never prints the connection string or the passphrase.
#
# Usage: backup.sh <output directory>
# Needs: SUPABASE_DB_URL, BACKUP_PASSPHRASE
# Optional: PGBIN (default /usr/lib/postgresql/17/bin), MIN_BACKUP_BYTES (default 20000)
# Writes, when run in GitHub Actions: outputs file and stamp, and a line in the job summary.
set -euo pipefail

fail() {
  echo "::error::Backup check failed: $1"
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "**Backup check failed:** $1" >>"$GITHUB_STEP_SUMMARY"
  exit 1
}

[ $# -eq 1 ] || fail "usage: backup.sh <output directory>"
[ -n "${SUPABASE_DB_URL:-}" ] || fail "SUPABASE_DB_URL is not set for this job"
[ -n "${BACKUP_PASSPHRASE:-}" ] || fail "BACKUP_PASSPHRASE is not set for this job"

PGBIN=${PGBIN:-/usr/lib/postgresql/17/bin}
MIN_BACKUP_BYTES=${MIN_BACKUP_BYTES:-20000}
# Tables whose data must be in every backup.
REQUIRED_TABLES="auth.users public.profiles public.merchants public.offers public.redemptions public.audit_logs"

umask 077
out=$1
mkdir -p "$out"
stamp=$(date -u +%Y-%m-%dT%H%MZ)
dump="$out/perqly-$stamp.dump"
enc="$dump.gpg"
# shellcheck disable=SC2329 # called by the trap below
cleanup() { [ -f "$dump" ] && shred -u "$dump" || true; }
trap cleanup EXIT

# Your data and the sign-in accounts (auth), not Supabase's own internals.
"$PGBIN/pg_dump" "$SUPABASE_DB_URL" \
  --format=custom --no-owner --no-privileges \
  --schema=public --schema=private --schema=auth \
  --file="$dump" || fail "pg_dump failed"

# 1. The archive can be read.
toc=$("$PGBIN/pg_restore" --list "$dump") || fail "pg_restore can't read the dump"

# 2. The key tables' data is in it.
for table in $REQUIRED_TABLES; do
  schema=${table%%.*}
  name=${table#*.}
  grep -Eq "TABLE DATA ${schema} ${name}( |$)" <<<"$toc" || fail "no data for ${table} in the dump"
done
data_entries=$(grep -c "TABLE DATA" <<<"$toc" || true)

# 3. The size is plausible.
bytes=$(stat -c %s "$dump")
[ "$bytes" -ge "$MIN_BACKUP_BYTES" ] || fail "the dump is only ${bytes} bytes (minimum ${MIN_BACKUP_BYTES})"

# 4. Encrypt, then prove the passphrase decrypts it to exactly the same file.
plain_sha=$(sha256sum "$dump" | cut -d' ' -f1)
gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 \
  --symmetric --cipher-algo AES256 --output "$enc" "$dump" 3<<<"$BACKUP_PASSPHRASE" || fail "encryption failed"
round_sha=$(gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt "$enc" 3<<<"$BACKUP_PASSPHRASE" | sha256sum | cut -d' ' -f1) ||
  fail "test decryption failed"
[ "$plain_sha" = "$round_sha" ] || fail "test decryption doesn't match the original"
enc_sha=$(sha256sum "$enc" | cut -d' ' -f1)

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "file=$enc" >>"$GITHUB_OUTPUT"
  echo "stamp=$stamp" >>"$GITHUB_OUTPUT"
fi
summary="Backup perqly-${stamp}: ${bytes} bytes before encryption, ${data_entries} tables with data, encrypted SHA-256 ${enc_sha}. All checks passed."
echo "$summary"
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$summary" >>"$GITHUB_STEP_SUMMARY"
exit 0
