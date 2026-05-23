# One-shot recovery for a broken self-hosted Supabase stack.
#
# Fixes three issues that prevent uploads / realtime / edge functions from working:
#   1. storage container restart loop ("must be owner of table buckets" /
#      "cannot drop function foldername because other objects depend on it")
#   2. realtime container ("invalid_schema_name: no schema has been selected to create in")
#   3. functions container ("worker boot error: failed to read path" — missing main dispatcher)
#
# Safe to re-run. Drops the broken storage schema (and any rows in
# storage.buckets / storage.objects) and rebuilds it from scratch by letting
# the storage container apply its full migration chain. Only run when storage
# was never fully functional — files on disk in the storage-data volume keep
# their bytes but their DB rows are wiped.

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$composeProject = "spark-start-genie-offline"
$dbContainer    = "$composeProject-db-1"

function Invoke-Psql([string]$sql) {
  $sql | docker exec -i $dbContainer psql -U postgres -d postgres -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { throw "psql failed" }
}

function Invoke-PsqlFile([string]$path) {
  Write-Host "  -> $path"
  Get-Content -Raw -LiteralPath $path | docker exec -i $dbContainer psql -U postgres -d postgres -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { throw "Failed to apply $path" }
}

Write-Host "=== 1. Stopping storage / realtime / functions ===" -ForegroundColor Cyan
docker compose stop storage realtime functions | Out-Null

Write-Host "=== 2. Rebuilding storage + _realtime schemas (clean slate) ===" -ForegroundColor Cyan
Invoke-Psql @"
DROP SCHEMA IF EXISTS storage CASCADE;
DROP SCHEMA IF EXISTS _realtime CASCADE;
DROP SCHEMA IF EXISTS realtime CASCADE;

CREATE SCHEMA storage AUTHORIZATION supabase_storage_admin;
GRANT ALL ON SCHEMA storage TO supabase_storage_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON TABLES    TO supabase_storage_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON SEQUENCES TO supabase_storage_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON FUNCTIONS TO supabase_storage_admin;

CREATE SCHEMA _realtime AUTHORIZATION postgres;

-- storage-api does `SET LOCAL ROLE <jwt-role>` per request; the connecting
-- role must be a member of those JWT roles.
GRANT anon, authenticated, service_role TO supabase_storage_admin;
"@

Write-Host "=== 3. Restarting storage (lets it run its full migration chain) ===" -ForegroundColor Cyan
docker compose up -d storage | Out-Null

Write-Host "    waiting for storage to finish migrating..."
$deadline = (Get-Date).AddSeconds(90)
$ready = $false
while ((Get-Date) -lt $deadline) {
  $count = docker exec -i $dbContainer psql -U postgres -d postgres -tA -c "SELECT count(*) FROM storage.migrations" 2>$null
  if ($LASTEXITCODE -eq 0 -and $count -match '^\d+$' -and [int]$count -ge 30) { $ready = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ready) {
  Write-Warning "storage migrations didn't finish in 90s. Inspect: docker logs $composeProject-storage-1 --tail 50"
  throw "storage container failed to initialize"
}
Write-Host "    storage migrations applied." -ForegroundColor Green

Write-Host "=== 4. Granting USAGE / table privileges on storage to JWT roles ===" -ForegroundColor Cyan
# The 0002-storage-schema.sql migration would do this, but its CREATE ROLE
# step rolls back when the JWT roles already exist on the base image, so
# grants never apply. Do it manually.
Invoke-Psql @"
ALTER ROLE supabase_storage_admin SET search_path = storage, public;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA storage TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
"@

Write-Host "=== 5. Re-creating buckets + storage policies ===" -ForegroundColor Cyan
Invoke-PsqlFile (Join-Path $PSScriptRoot "restore-storage-policies.sql")

# Restart storage so it picks up the search_path change on its connection pool.
docker compose restart storage | Out-Null

Write-Host "=== 6. Starting realtime + functions ===" -ForegroundColor Cyan
docker compose up -d --force-recreate realtime functions | Out-Null
Start-Sleep -Seconds 8

Write-Host ""
Write-Host "=== 7. Status ===" -ForegroundColor Cyan
docker compose ps storage realtime functions kong

Write-Host ""
Write-Host "Done. Try uploading a document again from the UI." -ForegroundColor Green
Write-Host "If any container is still restarting, check: docker compose logs --tail 50 <service>"
