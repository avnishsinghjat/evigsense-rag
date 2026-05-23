#!/usr/bin/env bash
# Apply all SQL migrations to the local Postgres instance (port 54322).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="$ROOT/supabase/migrations"
PGPASSWORD="${POSTGRES_PASSWORD:-your-super-secret-postgres-password}"
export PGPASSWORD

PSQL="psql -h localhost -p 54322 -U postgres -d postgres -v ON_ERROR_STOP=1"

echo "Waiting for Postgres..."
until $PSQL -c "SELECT 1" >/dev/null 2>&1; do
  sleep 2
done

echo "Applying migrations from $MIGRATIONS_DIR ..."
for f in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  echo "  -> $(basename "$f")"
  $PSQL -f "$f"
done

echo "Done."
