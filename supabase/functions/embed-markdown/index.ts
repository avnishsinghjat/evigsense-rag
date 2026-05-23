import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { embed as lmEmbed } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  documentId: z.string().uuid(),
  source: z.enum(["ocr", "translated"]).default("ocr"),
});

const MAX_CHUNK_CHARS = 1400;
const MIN_CHUNK_CHARS = 200;

// Split markdown into chunks at heading / blank-line boundaries while keeping
// image markdown (![alt](url) and <img ...>) intact within their surrounding
// paragraph so the LLM can return them in answers.
function chunkMarkdown(md: string): string[] {
  const text = md.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  // Split on blank lines (paragraphs). Headings naturally start a new para.
  const paragraphs = text.split(/\n{2,}/);

  const chunks: string[] = [];
  let buf = "";

  const flush = () => {
    const t = buf.trim();
    if (t) chunks.push(t);
    buf = "";
  };

  for (const p of paragraphs) {
    const para = p.trim();
    if (!para) continue;

    // Headings start a new chunk if buffer is reasonably full
    const isHeading = /^#{1,6}\s/.test(para);
    if (isHeading && buf.length >= MIN_CHUNK_CHARS) {
      flush();
    }

    if (buf.length + para.length + 2 > MAX_CHUNK_CHARS && buf.length > 0) {
      flush();
    }

    if (para.length > MAX_CHUNK_CHARS) {
      // Long paragraph: hard-split on sentence boundaries, but never inside an
      // image tag.
      const pieces = safeSplitLong(para, MAX_CHUNK_CHARS);
      for (const piece of pieces) {
        if (buf.length + piece.length + 2 > MAX_CHUNK_CHARS && buf.length > 0) flush();
        buf += (buf ? "\n\n" : "") + piece;
      }
    } else {
      buf += (buf ? "\n\n" : "") + para;
    }
  }
  flush();
  return chunks;
}

function safeSplitLong(text: string, max: number): string[] {
  const out: string[] = [];
  // Protect image tags from being cut in half.
  const tokens = text.split(/(!\[[^\]]*\]\([^)]+\)|<img[^>]*>)/g);
  let cur = "";
  for (const tok of tokens) {
    if (cur.length + tok.length > max && cur.length > 0) {
      out.push(cur);
      cur = "";
    }
    if (tok.length > max) {
      // Sentence-split plain text token
      const sentences = tok.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        if (cur.length + s.length > max && cur.length > 0) {
          out.push(cur);
          cur = "";
        }
        cur += (cur ? " " : "") + s;
      }
    } else {
      cur += tok;
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

async function embedText(text: string, retries = 3): Promise<number[]> {
  return lmEmbed(text, retries);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid input", details: parsed.error.errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { documentId, source } = parsed.data;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Verify ownership and load markdown
    const { data: doc, error: docErr } = await admin
      .from("documents")
      .select("id, created_by")
      .eq("id", documentId)
      .maybeSingle();
    if (docErr) throw docErr;
    if (!doc) throw new Error("Document not found");
    if (doc.created_by !== user.id) throw new Error("Access denied");

    const { data: mdRow, error: mdErr } = await admin
      .from("document_markdown")
      .select("ocr_markdown, translated_markdown")
      .eq("document_id", documentId)
      .maybeSingle();
    if (mdErr) throw mdErr;
    const markdown = source === "translated" ? mdRow?.translated_markdown : mdRow?.ocr_markdown;
    if (!markdown || !markdown.trim()) {
      return new Response(
        JSON.stringify({ error: `No ${source} markdown to index` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const chunks = chunkMarkdown(markdown);
    console.log(`[embed-markdown] ${documentId} -> ${chunks.length} chunks`);
    if (chunks.length === 0) {
      return new Response(JSON.stringify({ success: true, chunks: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Replace prior embeddings for this doc so chat sees the rich markdown
    // (with image links) instead of any earlier plain-text indexing.
    await admin.from("document_embeddings").delete().eq("document_id", documentId);

    const BATCH = 10;
    let inserted = 0;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        slice.map(async (text, idx) => {
          const vec = await embedText(text);
          return {
            document_id: documentId,
            chunk_index: i + idx,
            chunk_text: text,
            embedding: JSON.stringify(vec),
            page_number: null,
          };
        }),
      );
      const rows = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
        .map((r) => r.value);
      const failed = results.length - rows.length;
      if (failed > 0) console.warn(`[embed-markdown] ${failed} chunks failed in batch`);
      if (rows.length > 0) {
        const { error: insErr } = await admin.from("document_embeddings").insert(rows);
        if (insErr) {
          console.error("[embed-markdown] insert error:", insErr);
          throw insErr;
        }
        inserted += rows.length;
      }
    }

    return new Response(JSON.stringify({ success: true, chunks: inserted, source }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[embed-markdown] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
