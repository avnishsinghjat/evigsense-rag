import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ocrPdf, ocrImage, getOcrModelName } from "../_shared/ocr.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RequestBody {
  documentId: string;
  /**
   * Optional mode flag:
   *  - "page"   : OCR a single page image (data URI) and return its markdown only.
   *  - "save"   : Persist a fully-assembled markdown string to document_markdown.
   *  - (none)   : Legacy flow — server downloads file from storage and OCRs it whole.
   *               Works for single-image documents; PDFs should use "page"/"save"
   *               because LM Studio VLMs do not accept PDFs in image_url fields.
   */
  mode?: "page" | "save";
  pageImage?: string;
  pageNumber?: number;
  totalPages?: number;
  markdown?: string;
  pageCount?: number;
}

function sanitizeImagePath(path: string): string {
  return path.replace(/[^a-zA-Z0-9._/-]/g, "_").replace(/^\/+/, "");
}

async function fetchImageBytes(src: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (src.startsWith("data:")) {
    const match = src.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid data URI for image");
    const contentType = match[1] || "image/jpeg";
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { bytes, contentType };
  }
  const r = await fetch(src);
  if (!r.ok) throw new Error(`Failed to download image (${r.status})`);
  const contentType = r.headers.get("content-type") || "image/jpeg";
  const bytes = new Uint8Array(await r.arrayBuffer());
  return { bytes, contentType };
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    if (!body?.documentId || typeof body.documentId !== "string") {
      return jsonResponse({ error: "documentId required" }, 400);
    }

    const ocrModel = getOcrModelName();

    // ---- Mode: per-page OCR ----------------------------------------------
    if (body.mode === "page") {
      if (!body.pageImage) {
        return jsonResponse({ error: "pageImage (data URI) required for mode=page" }, 400);
      }
      const { bytes, contentType } = await fetchImageBytes(body.pageImage);
      if (!contentType.startsWith("image/")) {
        return jsonResponse(
          { error: `Unsupported pageImage content type: ${contentType}` },
          400,
        );
      }

      let result;
      try {
        result = await ocrImage(bytes, contentType);
      } catch (pageErr) {
        const msg = pageErr instanceof Error ? pageErr.message : "Unknown error";
        console.error(
          `paddle-ocr page ${body.pageNumber ?? "?"}/${body.totalPages ?? "?"} failed:`,
          msg,
        );
        // Don't fail the whole document — return a placeholder so the client can
        // continue with subsequent pages and the user gets a partial result.
        return jsonResponse({
          success: true,
          markdown: `> _Page ${body.pageNumber ?? "?"} OCR failed: ${msg}_`,
          imageCount: 0,
          pageNumber: body.pageNumber ?? null,
          totalPages: body.totalPages ?? null,
          pageError: msg,
        });
      }
      const pageMarkdown = (result.markdown || "").trim();

      // Upload any inline images returned by the OCR backend (rare for LM Studio VLM,
      // common for Chandra native).
      let imageCount = 0;
      let processedMd = pageMarkdown;
      for (const [imgPath, imgSrc] of Object.entries(result.images ?? {})) {
        try {
          const { bytes: imgBytes, contentType: imgCt } = await fetchImageBytes(imgSrc);
          const safePath = sanitizeImagePath(imgPath);
          const storagePath = `${user.id}/${body.documentId}/p${body.pageNumber ?? 0}_${safePath}`;
          const { error: upErr } = await supabase.storage
            .from("document-images")
            .upload(storagePath, imgBytes, { contentType: imgCt, upsert: true });
          if (upErr) {
            console.warn("Image upload failed", storagePath, upErr.message);
            continue;
          }
          const { data: pub } = supabase.storage
            .from("document-images")
            .getPublicUrl(storagePath);
          const publicUrl = pub?.publicUrl;
          if (!publicUrl) continue;
          processedMd = processedMd.split(imgPath).join(publicUrl);
          imageCount += 1;
        } catch (e) {
          console.warn(
            "Image processing failed for",
            imgPath,
            e instanceof Error ? e.message : e,
          );
        }
      }

      return jsonResponse({
        success: true,
        markdown: processedMd,
        imageCount,
        pageNumber: body.pageNumber ?? null,
        totalPages: body.totalPages ?? null,
      });
    }

    // ---- Mode: save final markdown ---------------------------------------
    if (body.mode === "save") {
      const markdown = (body.markdown || "").trim();
      if (!markdown) {
        return jsonResponse({ error: "markdown required for mode=save" }, 400);
      }

      const { data: upserted, error: upErr } = await supabase
        .from("document_markdown")
        .upsert(
          {
            document_id: body.documentId,
            ocr_markdown: markdown,
            ocr_model: ocrModel,
            created_by: user.id,
          },
          { onConflict: "document_id" },
        )
        .select()
        .single();

      if (upErr) throw new Error(`Failed to save markdown: ${upErr.message}`);

      return jsonResponse({
        success: true,
        markdown,
        pageCount: body.pageCount ?? null,
        record: upserted,
      });
    }

    // ---- Legacy mode: server-side download + OCR -------------------------
    // Kept for single-image documents and backward compatibility. PDFs should
    // use the per-page client flow because LM Studio VLMs reject PDF data URIs.
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id,storage_path,mime_type,original_filename")
      .eq("id", body.documentId)
      .single();
    if (docErr || !doc) throw new Error("Document not found");

    const mime = (doc.mime_type ?? "").toLowerCase();
    const filename = (doc.original_filename ?? "").toLowerCase();
    const isPdf = mime.includes("pdf") || filename.endsWith(".pdf");
    const isImage =
      mime.startsWith("image/") ||
      /\.(png|jpe?g|webp|bmp|tiff?|gif)$/.test(filename);
    if (!isPdf && !isImage) {
      throw new Error(`Unsupported file type for OCR: ${mime || filename}`);
    }

    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from("documents")
      .download(doc.storage_path);
    if (dlErr || !fileBlob) throw new Error(dlErr?.message || "Failed to download source file");
    const fileBytes = new Uint8Array(await fileBlob.arrayBuffer());

    const ocrResult = isPdf
      ? await ocrPdf(fileBytes)
      : await ocrImage(fileBytes, mime || "image/png");

    let mdText = ocrResult.markdown;
    let totalImages = 0;

    for (const [imgPath, imgSrc] of Object.entries(ocrResult.images)) {
      try {
        const { bytes, contentType } = await fetchImageBytes(imgSrc);
        const safePath = sanitizeImagePath(imgPath);
        const storagePath = `${user.id}/${body.documentId}/${safePath}`;
        const { error: upErr } = await supabase.storage
          .from("document-images")
          .upload(storagePath, bytes, { contentType, upsert: true });
        if (upErr) {
          console.warn("Image upload failed", storagePath, upErr.message);
          continue;
        }
        const { data: pub } = supabase.storage.from("document-images").getPublicUrl(storagePath);
        const publicUrl = pub?.publicUrl;
        if (!publicUrl) continue;
        mdText = mdText.split(imgPath).join(publicUrl);
        totalImages += 1;
      } catch (e) {
        console.warn("Image processing failed for", imgPath, e instanceof Error ? e.message : e);
      }
    }

    const markdown = mdText.trim();
    if (!markdown) throw new Error("OCR returned empty markdown");

    const { data: upserted, error: upErr } = await supabase
      .from("document_markdown")
      .upsert(
        {
          document_id: body.documentId,
          ocr_markdown: markdown,
          ocr_model: ocrModel,
          created_by: user.id,
        },
        { onConflict: "document_id" },
      )
      .select()
      .single();

    if (upErr) throw new Error(`Failed to save markdown: ${upErr.message}`);

    return jsonResponse({
      success: true,
      markdown,
      imageCount: totalImages,
      sectionCount: 1,
      record: upserted,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("paddle-ocr error:", msg);
    return jsonResponse({ error: "OCR failed", details: msg }, 500);
  }
});
