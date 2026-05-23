# One-shot: sync Supabase internal role passwords with POSTGRES_PASSWORD from docker/.env
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$envFile = Join-Path $PWD ".env"
$pgPass = (Get-Content $envFile | Where-Object { $_ -match '^POSTGRES_PASSWORD=' }) -replace '^POSTGRES_PASSWORD=', ''
if (-not $pgPass) { throw "POSTGRES_PASSWORD not found in docker/.env" }

$roles = @(
  "supabase_admin",
  "supabase_auth_admin",
  "supabase_storage_admin",
  "authenticator"
)

foreach ($role in $roles) {
  $sql = "ALTER ROLE $role WITH PASSWORD '$($pgPass -replace "'", "''")';"
  docker compose exec -T db psql -U postgres -d postgres -c $sql
  if ($LASTEXITCODE -ne 0) { throw "Failed to alter role $role" }
}

Write-Host "Role passwords updated."
