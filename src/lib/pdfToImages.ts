import { pdfjs } from "react-pdf";

if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

export interface PdfPagePng {
  pageNumber: number;
  dataUri: string;
  width: number;
  height: number;
}

export interface RenderOptions {
  /** Render scale; 2.0 is a good OCR sweet spot (≈ 144 DPI for a US-Letter PDF). */
  scale?: number;
  /** Image MIME type. PNG is lossless but bigger; JPEG is smaller. */
  mimeType?: "image/png" | "image/jpeg";
  /** JPEG quality 0..1. Ignored for PNG. */
  quality?: number;
  /** Optional subset of pages (1-indexed). Defaults to all pages. */
  pageNumbers?: number[];
  /** Called after each page is rendered. */
  onPage?: (page: PdfPagePng, total: number) => void | Promise<void>;
  /** AbortSignal to cancel rendering between pages. */
  signal?: AbortSignal;
}

/**
 * Render every page of a PDF (or a subset) to image data URIs using pdfjs-dist
 * in the browser. Used to feed LM Studio's VLM OCR endpoint, which only accepts
 * real images (PNG/JPEG/WebP) — not PDFs — in its `image_url.url` field.
 */
export async function renderPdfToImages(
  source: ArrayBuffer | Uint8Array | Blob,
  options: RenderOptions = {},
): Promise<PdfPagePng[]> {
  const scale = options.scale ?? 2;
  const mimeType = options.mimeType ?? "image/png";
  const quality = options.quality ?? 0.92;

  const data =
    source instanceof Blob
      ? new Uint8Array(await source.arrayBuffer())
      : source instanceof Uint8Array
        ? source
        : new Uint8Array(source);

  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  try {
    const totalPages = pdf.numPages;
    const targetPages =
      options.pageNumbers && options.pageNumbers.length > 0
        ? options.pageNumbers.filter((p) => p >= 1 && p <= totalPages)
        : Array.from({ length: totalPages }, (_, i) => i + 1);

    const out: PdfPagePng[] = [];
    for (const pageNum of targetPages) {
      if (options.signal?.aborted) throw new Error("Render aborted");

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("2D canvas context unavailable");

      await page.render({ canvasContext: ctx, viewport }).promise;

      const dataUri =
        mimeType === "image/jpeg"
          ? canvas.toDataURL("image/jpeg", quality)
          : canvas.toDataURL("image/png");

      const rendered: PdfPagePng = {
        pageNumber: pageNum,
        dataUri,
        width: canvas.width,
        height: canvas.height,
      };
      out.push(rendered);

      canvas.width = 0;
      canvas.height = 0;

      page.cleanup();

      if (options.onPage) {
        await options.onPage(rendered, targetPages.length);
      }
    }

    return out;
  } finally {
    try {
      await pdf.cleanup();
      await pdf.destroy();
    } catch {
      // ignore
    }
  }
}

/** Convert a Blob (or File) to a data URI. */
export async function blobToDataUri(blob: Blob, fallbackMime = "application/octet-stream"): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < buffer.length; i += chunkSize) {
    binary += String.fromCharCode(...buffer.subarray(i, i + chunkSize));
  }
  return `data:${blob.type || fallbackMime};base64,${btoa(binary)}`;
}
