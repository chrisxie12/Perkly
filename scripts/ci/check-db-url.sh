#!/usr/bin/env bash
# Checks that SUPABASE_DB_URL is a well-formed connection string for the expected
# project, WITHOUT ever printing it or any part of it.
#
# Why: a password with a character such as @ / # ? in it, not percent-encoded, makes
# psql and pg_dump split the string in the wrong place. They then print the "host"
# they tried, which is really a piece of the password. GitHub masks only the whole
# secret, so that piece shows in the (public) log. This check stops the job first.
#
# Usage: check-db-url.sh staging|production|restore
#   restore: a temporary rehearsal project, which must be neither production nor staging.
# Needs: SUPABASE_DB_URL
# On success it also tells GitHub to mask the password, raw and decoded.
# Error messages say which part is wrong, never its value.
set -euo pipefail

fail() { echo "::error::SUPABASE_DB_URL: $1 (the value is not shown)"; exit 1; }

PRODUCTION_REF=wktijbmvogxbbwwvqlhq
STAGING_REF=gzmxqjlyhizvmvywbxhn

case "${1:-}" in
  production) want=$PRODUCTION_REF; other=$STAGING_REF ;;
  staging) want=$STAGING_REF; other=$PRODUCTION_REF ;;
  restore) want=""; other="" ;;
  *) echo "usage: check-db-url.sh staging|production|restore" >&2; exit 2 ;;
esac

url=${SUPABASE_DB_URL:-}
[ -n "$url" ] || fail "it is not set for this job"

# Spaces or line breaks are easy to paste by accident (Notepad, a trailing Enter).
case "$url" in
  [[:space:]]* | *[[:space:]]) fail "it has a space or line break at the start or end; re-save the secret without it" ;;
esac

# Unreserved characters, or %XX escapes. Nothing else may appear in the user or password.
safe='([A-Za-z0-9._~-]|%[0-9A-Fa-f]{2})+'

[[ $url =~ ^postgres(ql)?:// ]] || fail "it must start with postgresql://"
rest=${url#*://}
case "$rest" in *[[:space:]]*) fail "it has a space or line break inside it" ;; esac
case "$rest" in *@*) ;; *) fail "there is no @ between the password and the host" ;; esac
creds=${rest%@*}
server=${rest##*@}
case "$creds" in *@*) fail "the password contains @ (percent-encode it as %40, or use letters and numbers only)" ;; esac
case "$creds" in *:*) ;; *) fail "there is no : between the user and the password" ;; esac
user=${creds%%:*}
password=${creds#*:}
[[ $user =~ ^${safe}$ ]] || fail "the user part has characters that aren't allowed"
[ -n "$password" ] || fail "the password is empty"
case "$password" in *'['* | *']'*) fail "the password still has [ ] brackets around it; remove them" ;; esac
[[ $password =~ ^${safe}$ ]] ||
  fail "the password has a symbol that isn't allowed here; percent-encode it, or reset it to letters and numbers only"

# Mask the password before anything else can print it, as written and decoded.
echo "::add-mask::$password"
decoded=$(printf '%b' "${password//%/\\x}")
[ "$decoded" = "$password" ] || echo "::add-mask::$decoded"

[[ $server =~ ^([A-Za-z0-9.-]+):([0-9]{1,5})/([A-Za-z0-9_-]+)(\?[A-Za-z0-9._~%=\&-]*)?$ ]] ||
  fail "after the @ it must be HOST:PORT/DATABASE, for example ...pooler.supabase.com:5432/postgres"
host=${BASH_REMATCH[1]}

case "$host" in
  *.supabase.com | *.supabase.co) ;;
  *) fail "the host isn't a Supabase host" ;;
esac

# The project ref sits in the user (pooler: postgres.REF) or the host (direct: db.REF.supabase.co).
if [ "$1" = restore ]; then
  # Never let a rehearsal write into a real project.
  case "$user@$host" in
    *"$PRODUCTION_REF"* | *"$STAGING_REF"*) fail "it points at production or staging; a restore rehearsal needs its own temporary project" ;;
  esac
  [[ $user@$host =~ (postgres\.[a-z0-9]{20}@|@db\.[a-z0-9]{20}\.supabase\.co) ]] || fail "it doesn't name a Supabase project"
else
  case "$user@$host" in
    *"$other"*) fail "it points at the wrong project (expected $1)" ;;
    *"$want"*) ;;
    *) fail "it doesn't name the $1 project" ;;
  esac
fi

echo "SUPABASE_DB_URL looks right for $1."
