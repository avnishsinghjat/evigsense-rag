-- =========================================================================
-- Pre-migration bootstrap. Runs once on first volume creation
-- (Postgres /docker-entrypoint-initdb.d). Idempotent so it can also be
-- re-run manually via docker/scripts/fix-stack.ps1 / fix-stack.sh.
-- =========================================================================

-- ---------- Storage --------------------------------------------------------
DO $$ BEGIN
  CREATE ROLE supabase_storage_admin NOINHERIT CREATEROLE LOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The supabase/postgres image creates `storage` owned by supabase_admin.
-- Storage-API's 0002-storage-schema.sql migration ALTERs ownership to
-- supabase_storage_admin, which requires it to already own the schema (or
-- be superuser). Transfer ownership now so its migrations can complete.
ALTER SCHEMA storage OWNER TO supabase_storage_admin;

GRANT ALL ON SCHEMA storage TO supabase_storage_admin;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO supabase_storage_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO supabase_storage_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA storage TO supabase_storage_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON TABLES TO supabase_storage_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON SEQUENCES TO supabase_storage_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON FUNCTIONS TO supabase_storage_admin;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'storage' LOOP
    EXECUTE format('ALTER TABLE storage.%I OWNER TO supabase_storage_admin', r.tablename);
  END LOOP;
  FOR r IN SELECT proname, pg_get_function_identity_arguments(p.oid) AS args
           FROM pg_proc p WHERE pronamespace = 'storage'::regnamespace LOOP
    EXECUTE format('ALTER FUNCTION storage.%I(%s) OWNER TO supabase_storage_admin', r.proname, r.args);
  END LOOP;
END $$;

-- storage-api issues `SET LOCAL ROLE service_role|anon|authenticated` per
-- request, so the connecting role (supabase_storage_admin) must be a member
-- of those roles, otherwise every request fails with
-- "new row violates row-level security policy" (code 42501).
DO $$ BEGIN
  GRANT anon, authenticated, service_role TO supabase_storage_admin;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Storage-api migration 0002-storage-schema.sql is supposed to grant USAGE +
-- table privileges on the storage schema to the JWT roles, but its
-- `CREATE ROLE anon ...` step throws "role already exists" against the
-- supabase/postgres base image and rolls back the whole DO block, so the
-- grants never apply. Re-grant explicitly here. (Idempotent.)
ALTER ROLE supabase_storage_admin SET search_path = storage, public;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- ---------- Realtime -------------------------------------------------------
-- supabase/realtime sets `search_path = _realtime` on connect, so the
-- schema must exist before the realtime container boots, otherwise the
-- Ecto migration step fails with "no schema has been selected to create in".
CREATE SCHEMA IF NOT EXISTS _realtime;
ALTER SCHEMA _realtime OWNER TO postgres;
