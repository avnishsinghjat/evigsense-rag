import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chatCompletionText, getTranslateModel, stripThinkTags } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Translations on local Qwen3 with thinking disabled fit comfortably under
// 4 minutes per chunk; the supabase edge worker timeout is 400s (see main/index.ts).
// LM Studio with default (single-slot) inference can queue concurrent requests,
// so we keep enough headroom to absorb queueing without aborting the model mid-generation.
const TRANSLATION_TIMEOUT_MS = 180_000;

// Prefix `/no_think` is a Qwen3 directive that disables internal chain-of-thought
// generation. Without it the model burns most of its token budget thinking and
// often gets aborted before emitting any translation.
const SYSTEM_PROMPT = `/no_think
You are a professional document translator. Translate the provided Markdown into the target language while preserving the Markdown structure exactly. Keep headings, lists, tables, links, image placeholders, code blocks, math, and layout intact. Do not remove any content. Do not summarize. If the Markdown contains image_description blocks, translate those descriptions clearly. If a visual diagram or figure is referenced, preserve the block and ensure the description is useful.

Additional rules:
- Do NOT translate code, file names, URLs, variable names, or technical identifiers unless clearly natural language.
- Keep tables as Markdown tables.
- Preserve heading levels (#, ##, ###), bullet indentation, numbering, and horizontal rules.
- Preserve image syntax exactly: ![Figure N](image-placeholder)
- Preserve ::: image_description ... ::: fences exactly; only translate the text inside them.
- Output ONLY the translated Markdown, no commentary, no <think> tags, no extra wrapping.`;

interface RequestBody {
  documentId: string;
  targetLanguage: string;
  markdown?: string; // optional override
  translatedMarkdown?: string;
  mode?: "translate" | "save";
  persist?: boolean;
  chunkIndex?: number;
  chunkCount?: number;
}

async function translateChunk({
  targetLanguage,
  markdown,
  chunkIndex,
  chunkCount,
}: {
  targetLanguage: string;
  markdown: string;
  chunkIndex?: number;
  chunkCount?: number;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSLATION_TIMEOUT_MS);
  try {
    const chunkContext =
      typeof chunkIndex === "number" && typeof chunkCount === "number"
        ? `This is Markdown chunk ${chunkIndex + 1} of ${chunkCount}. Translate only this chunk; do not add chunk labels.`
        : "";

    const translated = await chatCompletionText(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `${chunkContext}\nTarget language: ${targetLanguage}\n\nMarkdown to translate:\n\n${markdown}`,
        },
      ],
      {
        model: getTranslateModel(),
        temperature: 0.2,
        max_tokens: 4096,
        signal: controller.signal,
        // LM Studio passes chat_template_kwargs through to llama.cpp/Qwen,
        // disabling the thinking phase even if `/no_think` is ignored.
        extra: { chat_template_kwargs: { enable_thinking: false } },
      },
    );

    const cleaned = stripThinkTags(translated);
    if (!cleaned.trim()) throw new Error("Translation model returned empty content");
    return cleaned;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        `Translation model request timed out after ${TRANSLATION_TIMEOUT_MS / 1000}s ` +
          `(model=${getTranslateModel()}). LM Studio may be queueing concurrent requests; ` +
          `lower VITE_TRANSLATION_CONCURRENCY or enable parallel generation in LM Studio.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) throw new Error("Missing auth token");

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) throw new Error("Unauthorized");
    const user = userData.user;

    const body = (await req.json()) as RequestBody;
    if (!body?.documentId || !body?.targetLanguage) {
      return new Response(JSON.stringify({ error: "documentId and targetLanguage required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sourceMarkdown = body.markdown;
    if (!sourceMarkdown) {
      const { data: rec, error: recErr } = await supabase
        .from("document_markdown")
        .select("ocr_markdown")
        .eq("document_id", body.documentId)
        .maybeSingle();
      if (recErr) throw new Error(recErr.message);
      sourceMarkdown = rec?.ocr_markdown ?? "";
    }

    const mode = body.mode ?? "translate";

    if (mode === "save") {
      if (!body.translatedMarkdown?.trim()) {
        return new Response(JSON.stringify({ error: "translatedMarkdown required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: upserted, error: upErr } = await supabase
        .from("document_markdown")
        .upsert(
          {
            document_id: body.documentId,
            ocr_markdown: sourceMarkdown ?? "",
            translated_markdown: body.translatedMarkdown,
            target_language: body.targetLanguage,
            translation_model: getTranslateModel(),
            created_by: user.id,
          },
          { onConflict: "document_id" },
        )
        .select()
        .single();

      if (upErr) throw new Error(`Failed to save translation: ${upErr.message}`);
      return new Response(
        JSON.stringify({
          success: true,
          translatedMarkdown: body.translatedMarkdown,
          record: upserted,
          model: getTranslateModel(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!sourceMarkdown || !sourceMarkdown.trim()) {
      return new Response(
        JSON.stringify({ error: "Empty document result", details: "OCR markdown not found. Generate it first." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const translated = await translateChunk({
      targetLanguage: body.targetLanguage,
      markdown: sourceMarkdown,
      chunkIndex: body.chunkIndex,
      chunkCount: body.chunkCount,
    });

    if (body.persist === false) {
      return new Response(
        JSON.stringify({ success: true, translatedMarkdown: translated, model: getTranslateModel() }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: upserted, error: upErr } = await supabase
      .from("document_markdown")
      .upsert(
        {
          document_id: body.documentId,
          ocr_markdown: sourceMarkdown,
          translated_markdown: translated,
          target_language: body.targetLanguage,
          translation_model: getTranslateModel(),
          created_by: user.id,
        },
        { onConflict: "document_id" },
      )
      .select()
      .single();

    if (upErr) throw new Error(`Failed to save translation: ${upErr.message}`);

    return new Response(
      JSON.stringify({
        success: true,
        translatedMarkdown: translated,
        record: upserted,
        model: getTranslateModel(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("translate-markdown error:", msg);
    return new Response(JSON.stringify({ error: "Translation failed", details: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
