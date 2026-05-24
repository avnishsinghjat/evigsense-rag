import { supabase } from "@/integrations/supabase/client";
import { parseMarkdownBlocks } from "@/lib/markdownBlocks";
import { blobToDataUri, renderPdfToImages } from "@/lib/pdfToImages";

interface TranslateProgress {
  current: number;
  total: number;
  phase: "translating" | "saving";
}

interface TranslateMarkdownOptions {
  onProgress?: (progress: TranslateProgress) => void;
  maxChunkChars?: number;
  /** Max parallel translate-markdown invocations. Defaults to VITE_TRANSLATION_CONCURRENCY or 2. */
  concurrency?: number;
  /** Number of retries per page on transient failures. Defaults to 2. */
  retries?: number;
}

const MAX_PAGE_CHARS = 8_000;
const FALLBACK_CHUNK_CHARS = 8_000;
const PAGE_SEPARATOR_RE = /\n{2,}\s*---+\s*\n{2,}/g;
const DEFAULT_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1_500;

function getDefaultConcurrency(): number {
  const raw = (import.meta as ImportMeta & { env?: Record<string, string> })?.env
    ?.VITE_TRANSLATION_CONCURRENCY;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  // LM Studio default config processes one chat completion at a time.
  // 2 is a safe default that hides network latency without queuing far past timeouts.
  return 2;
}

export type OCRProgressPhase = "preparing" | "rendering" | "ocr" | "saving";

export interface OCRProgress {
  current: number;
  total: number;
  phase: OCRProgressPhase;
}

export interface OCRMarkdownOptions {
  onProgress?: (progress: OCRProgress) => void;
  signal?: AbortSignal;
}

export interface OCRResult {
  markdown: string;
  imageCount: number;
}

interface DocumentRow {
  storage_path: string;
  mime_type: string | null;
  original_filename: string | null;
}

function isPdfDoc(doc: DocumentRow): boolean {
  const mime = (doc.mime_type ?? "").toLowerCase();
  const filename = (doc.original_filename ?? "").toLowerCase();
  return mime.includes("pdf") || filename.endsWith(".pdf");
}

function isImageDoc(doc: DocumentRow): boolean {
  const mime = (doc.mime_type ?? "").toLowerCase();
  const filename = (doc.original_filename ?? "").toLowerCase();
  return mime.startsWith("image/") || /\.(png|jpe?g|webp|bmp|tiff?|gif)$/.test(filename);
}

export async function generateOCRMarkdown(
  documentId: string,
  options: OCRMarkdownOptions = {},
): Promise<OCRResult> {
  options.onProgress?.({ current: 0, total: 1, phase: "preparing" });

  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("storage_path,mime_type,original_filename")
    .eq("id", documentId)
    .single<DocumentRow>();
  if (docErr || !doc) throw new Error(docErr?.message || "Document not found");

  if (!isPdfDoc(doc) && !isImageDoc(doc)) {
    throw new Error(`Unsupported file type for OCR: ${doc.mime_type || doc.original_filename}`);
  }

  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from("documents")
    .download(doc.storage_path);
  if (dlErr || !fileBlob) throw new Error(dlErr?.message || "Failed to download document");

  let pageImages: string[];
  if (isPdfDoc(doc)) {
    const buffer = await fileBlob.arrayBuffer();
    const rendered = await renderPdfToImages(buffer, {
      scale: 2,
      mimeType: "image/png",
      signal: options.signal,
      onPage: (page, total) => {
        options.onProgress?.({ current: page.pageNumber, total, phase: "rendering" });
      },
    });
    if (rendered.length === 0) throw new Error("PDF has no pages to OCR");
    pageImages = rendered.map((p) => p.dataUri);
  } else {
    const mime = (doc.mime_type ?? "").toLowerCase() || "image/png";
    pageImages = [await blobToDataUri(fileBlob, mime)];
  }

  const pageMarkdowns: string[] = [];
  for (let i = 0; i < pageImages.length; i++) {
    if (options.signal?.aborted) throw new Error("OCR aborted");
    options.onProgress?.({ current: i + 1, total: pageImages.length, phase: "ocr" });
    const { data, error } = await supabase.functions.invoke("paddle-ocr", {
      body: {
        documentId,
        mode: "page",
        pageImage: pageImages[i],
        pageNumber: i + 1,
        totalPages: pageImages.length,
      },
    });
    if (error) throw new Error(error.message || `OCR failed on page ${i + 1}`);
    if (data?.error) throw new Error(data.details || data.error);
    pageMarkdowns.push(String(data?.markdown ?? "").trim());
  }

  const merged = pageMarkdowns.filter(Boolean).join("\n\n---\n\n");
  if (!merged) throw new Error("OCR returned empty markdown for all pages");

  options.onProgress?.({ current: pageImages.length, total: pageImages.length, phase: "saving" });
  const { data: saved, error: saveErr } = await supabase.functions.invoke("paddle-ocr", {
    body: { documentId, mode: "save", markdown: merged, pageCount: pageImages.length },
  });
  if (saveErr) throw new Error(saveErr.message || "Failed to save OCR markdown");
  if (saved?.error) throw new Error(saved.details || saved.error);

  return {
    markdown: (saved?.markdown as string) ?? merged,
    imageCount: (saved?.imageCount as number) ?? 0,
  };
}

interface PageSplit {
  pages: string[];
  separators: string[];
}

function splitMarkdownByPages(markdown: string): PageSplit {
  const pages: string[] = [];
  const separators: string[] = [];
  let lastIndex = 0;
  PAGE_SEPARATOR_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = PAGE_SEPARATOR_RE.exec(markdown)) !== null) {
    pages.push(markdown.slice(lastIndex, match.index));
    separators.push(match[0]);
    lastIndex = match.index + match[0].length;
  }
  pages.push(markdown.slice(lastIndex));

  return { pages, separators };
}

function shouldSkipTranslation(page: string): boolean {
  const trimmed = page.trim();
  if (!trimmed) return true;
  if (/^!\[[^\]]*\]\([^)]*\)\s*$/.test(trimmed)) return true;
  if (/^```[\s\S]*```\s*$/.test(trimmed)) return true;
  return false;
}

function rejoinPages(pages: string[], separators: string[]): string {
  if (pages.length === 0) return "";
  let result = pages[0];
  for (let i = 0; i < separators.length; i++) {
    result += separators[i] + pages[i + 1];
  }
  return result;
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /timed out|timeout|non-2xx|5\d\d|fetch|network|aborted|temporarily/i.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>, retries: number, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isTransientError(err)) break;
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(`[translateMarkdown] ${label} attempt ${attempt + 1} failed; retrying in ${delay}ms`, err);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "Translation failed"));
}

function resolveTranslationUnits(
  markdown: string,
  maxChunkChars?: number,
): { units: string[]; separators: string[] | null } {
  const pageSplit = splitMarkdownByPages(markdown);
  const usePageSplit =
    pageSplit.pages.length > 1 && pageSplit.pages.every((p) => p.length <= MAX_PAGE_CHARS);

  if (usePageSplit) {
    return { units: pageSplit.pages, separators: pageSplit.separators };
  }

  return {
    units: splitMarkdownForTranslation(markdown, maxChunkChars ?? FALLBACK_CHUNK_CHARS),
    separators: null,
  };
}

export async function translateMarkdown(
  documentId: string,
  targetLanguage: string,
  markdown?: string,
  options: TranslateMarkdownOptions = {},
): Promise<string> {
  const source = markdown ?? "";
  const { units, separators } = resolveTranslationUnits(source, options.maxChunkChars);
  const concurrency = options.concurrency ?? getDefaultConcurrency();
  const retries = options.retries ?? DEFAULT_RETRIES;

  const callTranslate = (
    unit: string,
    index: number,
    total: number,
    persist: boolean,
  ) =>
    withRetry(
      async () => {
        const { data, error } = await supabase.functions.invoke("translate-markdown", {
          body: persist
            ? { documentId, targetLanguage, markdown: unit }
            : {
                documentId,
                targetLanguage,
                markdown: unit,
                persist: false,
                chunkIndex: index,
                chunkCount: total,
              },
        });
        if (error) throw new Error(error.message || "Translation failed");
        if (data?.error) throw new Error(data.details || data.error);
        return data.translatedMarkdown as string;
      },
      retries,
      `page ${index + 1}/${total}`,
    );

  if (units.length === 1) {
    const unit = units[0];
    if (shouldSkipTranslation(unit)) return unit.trimEnd();
    return callTranslate(unit, 0, 1, true);
  }

  let completed = 0;
  const translatedUnits = await runWithConcurrency(units, concurrency, async (unit, index) => {
    if (shouldSkipTranslation(unit)) {
      completed++;
      options.onProgress?.({ current: completed, total: units.length, phase: "translating" });
      return unit.trimEnd();
    }

    const translated = await callTranslate(unit, index, units.length, false);

    completed++;
    options.onProgress?.({ current: completed, total: units.length, phase: "translating" });
    return translated.trim();
  });

  const translatedMarkdown = separators
    ? rejoinPages(translatedUnits, separators)
    : translatedUnits.join("\n\n");

  options.onProgress?.({ current: units.length, total: units.length, phase: "saving" });
  const { data: saved, error: saveErr } = await supabase.functions.invoke("translate-markdown", {
    body: { documentId, targetLanguage, markdown: source, translatedMarkdown, mode: "save" },
  });
  if (saveErr) throw new Error(saveErr.message || "Translation save failed");
  if (saved?.error) throw new Error(saved.details || saved.error);
  return saved.translatedMarkdown as string;
}

function splitMarkdownForTranslation(markdown: string, maxChunkChars = FALLBACK_CHUNK_CHARS): string[] {
  if (!markdown.trim()) return [markdown];
  const blocks = parseMarkdownBlocks(markdown).map((block) => block.content.trimEnd()).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  const flush = () => {
    if (!current.length) return;
    chunks.push(current.join("\n\n"));
    current = [];
    currentLength = 0;
  };

  const addPart = (part: string) => {
    const separatorLength = current.length ? 2 : 0;
    if (currentLength + separatorLength + part.length > maxChunkChars) flush();
    current.push(part);
    currentLength += (currentLength ? 2 : 0) + part.length;
  };

  for (const block of blocks) {
    const parts = block.length > maxChunkChars ? splitLargeMarkdownBlock(block, maxChunkChars) : [block];
    for (const part of parts) addPart(part);
  }

  flush();
  return chunks.length ? chunks : [markdown];
}

function splitLargeMarkdownBlock(block: string, maxChunkChars: number): string[] {
  const lines = block.split("\n");
  const parts: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const line of lines) {
    if (currentLength + line.length + 1 > maxChunkChars && current.length) {
      parts.push(current.join("\n"));
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += line.length + 1;
  }

  if (current.length) parts.push(current.join("\n"));
  return parts;
}

// Image extraction is now handled inline by the paddle-ocr edge function.


export async function loadDocumentMarkdown(documentId: string) {
  const { data, error } = await supabase
    .from("document_markdown")
    .select("*")
    .eq("document_id", documentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function downloadTranslatedMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".md") ? filename : `${filename}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Detects image lines in markdown that are missing an immediately-following
 * ::: visual description directive and inserts a generic placeholder.
 */
export function detectAndDescribeVisualBlocks(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    const isImage = /^!\[[^\]]*\]\([^)]*\)\s*$/.test(lines[i]);
    if (isImage) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      const next = j < lines.length ? lines[j].trim() : "";
      const hasBlock =
        /^:::\s*[a-zA-Z0-9_-]+\s*$/.test(next) &&
        /(_description|_desc|^:::\s*(image|chart|diagram|flowchart|figure|screenshot|table|graph|equation|code)\b)/.test(
          next,
        );
      if (!hasBlock) {
        out.push("");
        out.push(":::image_description");
        out.push("Visual element detected. No description provided.");
        out.push(":::");
      }
    }
  }
  return out.join("\n");
}

export const TARGET_LANGUAGES = [
  { value: "English", label: "English" },
  { value: "Spanish", label: "Spanish" },
  { value: "French", label: "French" },
  { value: "German", label: "German" },
  { value: "Italian", label: "Italian" },
  { value: "Portuguese", label: "Portuguese" },
  { value: "Russian", label: "Russian" },
  { value: "Chinese (Simplified)", label: "Chinese (Simplified)" },
  { value: "Japanese", label: "Japanese" },
  { value: "Korean", label: "Korean" },
  { value: "Arabic", label: "Arabic" },
  { value: "Hindi", label: "Hindi" },
  { value: "Dutch", label: "Dutch" },
  { value: "Turkish", label: "Turkish" },
];
