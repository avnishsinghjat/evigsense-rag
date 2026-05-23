#!/bin/bash
# Sync Supabase internal role passwords with POSTGRES_PASSWORD (official stack does this in roles.sql).
set -eu

psql -v ON_ERROR_STOP=1 -U postgres -d postgres -v pwd="${POSTGRES_PASSWORD}" <<-'EOSQL'
ALTER ROLE supabase_admin            WITH PASSWORD :'pwd';
ALTER ROLE supabase_auth_admin       WITH PASSWORD :'pwd';
ALTER ROLE supabase_storage_admin    WITH PASSWORD :'pwd';
ALTER ROLE authenticator             WITH PASSWORD :'pwd';
EOSQL

# Optional role (not present on all image variants)
psql -v ON_ERROR_STOP=0 -U postgres -d postgres -v pwd="${POSTGRES_PASSWORD}" <<-'EOSQL' || true
ALTER ROLE supabase_functions_admin WITH PASSWORD :'pwd';
EOSQL
