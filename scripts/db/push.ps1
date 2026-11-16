# Apply new database migrations to the linked Supabase project.
# Asks for the database password (hidden), uses it only for this run, then clears it.
# This avoids the CLI's "login role 403" when it is signed in to a different Supabase account.
#
#   .\scripts\db\push.ps1
#
$secure = Read-Host "Supabase database password" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:SUPABASE_DB_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  npx supabase db push
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Item Env:SUPABASE_DB_PASSWORD -ErrorAction SilentlyContinue
}
