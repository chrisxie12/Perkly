# Apply new database migrations to the Supabase database.
#
#   .\scripts\db\push.ps1
#
# Paste the Session pooler connection string when asked (Supabase → Connect →
# Session pooler, with your database password filled in; the same value as the
# SUPABASE_DB_URL GitHub secret). Input is hidden and the value is cleared after.
# Going straight to the database avoids the CLI's "login role 403", which
# happens when the CLI is signed in to a different Supabase account.
$secure = Read-Host "Session pooler connection string (postgresql://...)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $url = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  if (-not $url.StartsWith("postgres")) {
    Write-Host "That doesn't look like a connection string. It should start with postgresql://" -ForegroundColor Red
    exit 1
  }
  npx supabase db push --db-url $url
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Variable url -ErrorAction SilentlyContinue
}
