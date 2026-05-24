# Spark Start Genie (EVIGSENSE)

Document management, RAG assistant, OCR, translation, and signing — **fully offline** via self-hosted Supabase, local LM Studio, and Chandra OCR.

## Prerequisites

- **Node.js 18+** and npm
- **Docker Desktop** (for self-hosted Supabase)
- **LM Studio** with these models loaded:
  - Chat model (e.g. `qwen/qwen3.6-35b-a3b`) — set id in `LMSTUDIO_CHAT_MODEL`
  - Optional dedicated translator (e.g. `google/gemma-4-e4b`) — set id in `LMSTUDIO_TRANSLATE_MODEL` for faster RU→EN markdown translation
  - Embedding model (e.g. `text-embedding-qwen3-embedding-0.6b` or `bge-m3`, both 1024 dims) — set id in `LMSTUDIO_EMBED_MODEL`
  - Chandra VLM for OCR (e.g. `chandra-ocr-2`) — set id in `OCR_MODEL`, or run Chandra native server

> The values in `LMSTUDIO_*` / `OCR_MODEL` must match the **exact** model ids LM Studio
> exposes at <http://localhost:1234/v1/models>. After changing them, run
> `docker compose up -d --force-recreate functions` so the edge runtime picks them up.
- Optional: Whisper model in LM Studio for audio (`AUDIO_BACKEND=whisper`)

## Run fully offline

### 1. Start LM Studio

1. Open LM Studio → Local Server → start server on port **1234**
2. Load your chat, embedding, and OCR (Chandra) models
3. Note each model id and set them in `docker/.env`

### 2. Start self-hosted Supabase

```sh
cd docker
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, LMSTUDIO_* model ids, INTERNAL_FUNCTION_SECRET
docker compose up -d
```

Wait for Postgres (port **54322**), then apply migrations:

```sh
# Git Bash / WSL / Linux:
POSTGRES_PASSWORD=your-password ./scripts/apply-migrations.sh

# Or manually with psql:
psql "postgresql://postgres:YOUR_PASSWORD@localhost:54322/postgres" -f supabase/migrations/20260524000000_embedding_dim_1024.sql
```

#### Stuck on "name resolution failed" when uploading?

The `storage`, `realtime`, or `functions` container can be stuck in a restart loop after a first-time setup against the supabase/postgres base image (storage's role-creation migration aborts when `anon` / `authenticated` / `service_role` already exist, so it never grants schema access). Run the recovery script once:

```powershell
# Windows (PowerShell)
docker\scripts\fix-stack.ps1
```

It drops and rebuilds the `storage` + `_realtime` schemas, lets storage re-migrate cleanly, regrants schema/table privileges to the JWT roles, and recreates buckets + RLS policies. Safe to re-run.

#### `ingest-logs` returns 500 / `application_logs` table missing?

If the bootstrap migration was applied partially the `application_logs` table can be missing while everything else is present. Apply the recovery script from inside the db container and tell PostgREST to reload its schema cache:

```powershell
docker cp scripts/create-application-logs.sql spark-start-genie-offline-db-1:/tmp/create-application-logs.sql
docker exec spark-start-genie-offline-db-1 psql -U postgres -d postgres -f /tmp/create-application-logs.sql
docker exec spark-start-genie-offline-db-1 psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema';"
```

#### Edge Functions read empty env vars (`supabaseUrl is required`, embedding/OCR fall back to defaults)?

`supabase/functions/main/index.ts` must forward host env vars into the worker
isolate via `envVars: Object.entries(Deno.env.toObject())`. If you upgrade
`supabase/functions/main` from an older snapshot make sure this is in place,
otherwise every function will see `Deno.env.get(...) === undefined`.

**Services:**

| Service | URL |
|---------|-----|
| API (Kong) | http://localhost:8000 |
| Studio | http://localhost:54323 |
| Postgres | localhost:54322 |

### 3. Create admin user

1. Open Studio → Authentication → Add user: `admin@evigway.com`
2. The bootstrap migration grants this user the `admin` role automatically on first schema apply

If Studio shows **"API error happened while trying to communicate with the server"**, `JWT_SECRET` and `ANON_KEY` / `SERVICE_ROLE_KEY` are out of sync. Regenerate keys and restart Kong + Studio:

```sh
cd docker
node scripts/generate-jwt-keys.mjs "$JWT_SECRET"   # copy output into docker/.env and docker/volumes/api/kong.yml
docker compose up -d --force-recreate kong studio auth
```

### 4. Re-embed existing documents (after dim migration)

If upgrading from cloud OpenAI 1536-dim embeddings:

```sh
psql "postgresql://postgres:YOUR_PASSWORD@localhost:54322/postgres" -f scripts/requeue-documents-for-reembed.sql
```

Then trigger queue processing from the Documents page or invoke `process-queue`.

### 5. Start the frontend

```sh
cp .env.example .env   # already points at localhost:8000
npm install
npm run dev
```

Open http://localhost:5173 → sign in with your local admin user.

## Environment variables

See [.env.example](.env.example) for the full list. Key knobs:

| Variable | Purpose |
|----------|---------|
| `LMSTUDIO_BASE_URL` | OpenAI-compatible API (default `http://host.docker.internal:1234/v1`) |
| `LMSTUDIO_CHAT_MODEL` | Model id for chat, summary, metadata |
| `LMSTUDIO_TRANSLATE_MODEL` | Optional dedicated translator for markdown translation (falls back to `LMSTUDIO_CHAT_MODEL`) |
| `LMSTUDIO_EMBED_MODEL` | Embedding model (default `bge-m3`, 1024 dims) |
| `EMBEDDING_DIM` | Must match your embed model (default `1024`) |
| `OCR_BACKEND` | `lmstudio` (VLM) or `chandra-native` |
| `OCR_MODEL` | Chandra model id in LM Studio |
| `CHANDRA_BASE_URL` | Native Chandra server URL (if `OCR_BACKEND=chandra-native`) |
| `AUDIO_BACKEND` | `disabled` (default) or `whisper` |

## Architecture

```
Browser → Kong :8000 → GoTrue / PostgREST / Storage / Realtime / Edge Functions
                              ↓
                         Postgres + pgvector
Edge Functions → LM Studio :1234 (chat + embeddings)
              → Chandra OCR (LM Studio VLM or native :8001)
```

## Development (Supabase CLI alternative)

If you prefer the Supabase CLI instead of raw Docker:

```sh
npx supabase start
npx supabase db reset   # applies migrations
npx supabase functions serve
```

Copy LM Studio env vars into `supabase/.env.local` for edge functions.

## What changed from cloud

- **OpenRouter** → LM Studio (`supabase/functions/_shared/ai.ts`)
- **Paddle OCR + OCR.space** → Chandra (`supabase/functions/_shared/ocr.ts`)
- **Embeddings** → 1024-dim bge-m3 (migration `20260524000000_embedding_dim_1024.sql`)
- **Supabase cloud** → self-hosted Docker stack in `docker/`

## Build

```sh
npm run build
npm run preview
```
