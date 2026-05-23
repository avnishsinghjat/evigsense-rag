/**
 * Shared OCR helper — Chandra via LM Studio VLM or native Chandra server.
 * Replaces Paddle OCR and OCR.space.
 */

import { chatCompletionText, getChatModel } from "./ai.ts";

export interface OcrResult {
  markdown: string;
  /** path -> data URI or remote URL */
  images: Record<string, string>;
}

const OCR_SYSTEM_PROMPT = `You are a document OCR engine. Extract all text from the provided document image or PDF page as faithful Markdown.
Rules:
- Preserve headings, lists, tables (as Markdown tables), and layout structure
- Use $...$ for inline math and $$...$$ for display math
- Do not summarize or omit content
- Output ONLY the Markdown, no commentary or code fences wrapping the whole document`;

function getOcrBackend(): string {
  return (Deno.env.get("OCR_BACKEND") ?? "lmstudio").toLowerCase();
}

function getOcrModel(): string {
  return Deno.env.get("OCR_MODEL") ?? getChatModel();
}

function getOcrMaxTokens(): number {
  // Reasoning OCR models (e.g. chandra-ocr-2) burn through tokens on chain-of-thought
  // before emitting the markdown. LM Studio's default is far too small for this —
  // we observed empty `content` with finish_reason=stop and all tokens spent on
  // `reasoning_content`. 16k is a safe default for single-page OCR.
  const raw = Deno.env.get("OCR_MAX_TOKENS");
  if (!raw) return 16384;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 16384;
}

function getOcrReasoningEffort(): "low" | "medium" | "high" | undefined {
  const v = (Deno.env.get("OCR_REASONING_EFFORT") ?? "").toLowerCase();
  if (v === "low" || v === "medium" || v === "high") return v;
  return undefined;
}

function getChandraBaseUrl(): string {
  return (Deno.env.get("CHANDRA_BASE_URL") ?? "http://host.docker.internal:8001").replace(/\/$/, "");
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function ocrViaLmStudio(bytes: Uint8Array, mimeType: string): Promise<OcrResult> {
  const base64 = uint8ToBase64(bytes);
  const dataUri = `data:${mimeType};base64,${base64}`;

  const markdown = await chatCompletionText(
    [
      { role: "system", content: OCR_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract the full document content as Markdown. Preserve tables, headings, and structure.",
          },
          { type: "image_url", image_url: { url: dataUri } },
        ],
      },
    ],
    {
      model: getOcrModel(),
      temperature: 0,
      max_tokens: getOcrMaxTokens(),
      reasoning_effort: getOcrReasoningEffort(),
    },
  );

  return { markdown: markdown.trim(), images: {} };
}

async function ocrViaChandraNative(bytes: Uint8Array, mimeType: string): Promise<OcrResult> {
  const base64 = uint8ToBase64(bytes);
  const isPdf = mimeType.includes("pdf");

  const response = await fetch(`${getChandraBaseUrl()}/ocr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file: base64,
      fileType: isPdf ? 0 : 1,
      mime_type: mimeType,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chandra OCR failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();

  // Paddle-compatible layout response
  const results = data?.result?.layoutParsingResults ?? data?.layoutParsingResults ?? [];
  if (Array.isArray(results) && results.length > 0) {
    const sectionMarkdowns: string[] = [];
    const images: Record<string, string> = {};
    for (const res of results) {
      sectionMarkdowns.push((res.markdown?.text ?? res.text ?? "").trim());
      Object.assign(images, res.markdown?.images ?? res.images ?? {});
    }
    const markdown = sectionMarkdowns.filter(Boolean).join("\n\n---\n\n");
    if (markdown) return { markdown, images };
  }

  // Simple { markdown: "..." } response
  const markdown = (data?.markdown ?? data?.text ?? "").trim();
  if (markdown) {
    return { markdown, images: data?.images ?? {} };
  }

  throw new Error("Chandra OCR returned empty result");
}

async function runOcr(bytes: Uint8Array, mimeType: string): Promise<OcrResult> {
  const backend = getOcrBackend();
  if (backend === "chandra-native" || backend === "chandra") {
    return ocrViaChandraNative(bytes, mimeType);
  }
  return ocrViaLmStudio(bytes, mimeType);
}

/** OCR a single image file. */
export async function ocrImage(bytes: Uint8Array, mimeType = "image/png"): Promise<OcrResult> {
  return runOcr(bytes, mimeType);
}

/** OCR a PDF (entire document sent to the configured backend). */
export async function ocrPdf(bytes: Uint8Array): Promise<OcrResult> {
  return runOcr(bytes, "application/pdf");
}

/** Plain text extraction helper for RAG pipeline (no image sidecar). */
export async function ocrToPlainText(bytes: Uint8Array, mimeType: string): Promise<string> {
  const result = mimeType.includes("pdf")
    ? await ocrPdf(bytes)
    : await ocrImage(bytes, mimeType);
  return result.markdown;
}

export function getOcrModelName(): string {
  return getOcrBackend() === "lmstudio" ? getOcrModel() : "chandra-native";
}
