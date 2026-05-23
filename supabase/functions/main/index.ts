// Main dispatcher for self-hosted supabase/edge-runtime.
// Forwards requests to /functions/v1/<name> to the corresponding function
// directory mounted at /home/deno/functions/<name>/index.ts.
//
// Modeled on the official supabase docker reference:
// https://github.com/supabase/supabase/blob/master/docker/volumes/functions/main/index.ts
import { STATUS_CODE } from 'jsr:@std/http/status';
import * as jose from 'https://deno.land/x/jose@v5.9.6/index.ts';

console.log('main edge-runtime dispatcher started');

const JWT_SECRET = Deno.env.get('JWT_SECRET') ?? '';
const VERIFY_JWT = (Deno.env.get('VERIFY_JWT') ?? 'false').toLowerCase() === 'true';

function getAuthToken(req: Request): string {
  const header = req.headers.get('authorization');
  if (!header) throw new Error('Missing authorization header');
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new Error("Auth header is not 'Bearer {token}'");
  return token;
}

async function verifyJWT(jwt: string): Promise<boolean> {
  if (!JWT_SECRET) return false;
  try {
    await jose.jwtVerify(jwt, new TextEncoder().encode(JWT_SECRET));
    return true;
  } catch (err) {
    console.error('JWT verify failed', err);
    return false;
  }
}

// deno-lint-ignore no-explicit-any
const edgeRuntime: any = (globalThis as any).EdgeRuntime;

Deno.serve(async (req: Request) => {
  if (VERIFY_JWT && req.method !== 'OPTIONS') {
    try {
      const ok = await verifyJWT(getAuthToken(req));
      if (!ok) {
        return new Response(JSON.stringify({ msg: 'Invalid JWT' }), {
          status: STATUS_CODE.Unauthorized,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (e) {
      return new Response(JSON.stringify({ msg: (e as Error).message }), {
        status: STATUS_CODE.Unauthorized,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const serviceName = parts[0];

  if (!serviceName) {
    return new Response(JSON.stringify({ msg: 'missing function name in request' }), {
      status: STATUS_CODE.BadRequest,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const servicePath = `/home/deno/functions/${serviceName}`;

  // Forward host env vars (SUPABASE_*, LMSTUDIO_*, OCR_*, etc.) into the worker
  // isolate so user functions can read them via Deno.env.get. The runtime does
  // not inherit them automatically — we must pass an explicit [key, value] list.
  const envVars: Array<[string, string]> = Object.entries(Deno.env.toObject());

  try {
    const worker = await edgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb: 256,
      workerTimeoutMs: 400_000,
      noModuleCache: false,
      importMapPath: null,
      envVars,
    });
    return await worker.fetch(req);
  } catch (e) {
    const err = e as Error;
    console.error(`worker boot error for ${serviceName}:`, err);
    const status = err.message?.includes('not found') || err.message?.includes('No such file')
      ? STATUS_CODE.NotFound
      : STATUS_CODE.InternalServerError;
    return new Response(JSON.stringify({ msg: err.message ?? 'worker error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
