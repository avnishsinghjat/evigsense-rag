## Translation Markdown Workflow

Add a new workflow alongside the existing RAG functionality (which stays untouched). Users pick/upload a document, generate OCR Markdown, translate it, and view original + translated side by side.

### New page: `/translation-markdown`

Added to the sidebar as "Translation Markdown" (separate from existing `/translation` so the current translation feature is preserved).

Layout:
- Top bar: Document picker (select existing doc from `documents` table) OR upload new file, target language dropdown (default English), action buttons.
- Buttons: **Generate OCR Markdown**, **Translate Markdown**, **View Side by Side**, **Download Translated Markdown**.
- View modes (tabs): Original Document | OCR Markdown | Translated Markdown | Side by Side.
- Side-by-Side: split-screen, synchronized scrolling, original (PDF viewer or OCR markdown rendered) on left, translated markdown rendered on right.
- Loading + error states for each step.

### New edge functions

**`generate-ocr-markdown`**
- Input: `{ documentId }` or raw file URL.
- Downloads the file from storage, sends to OpenRouter using model `baidu/qianfan-ocr-fast:free`.
- System prompt instructs model to output structured Markdown preserving headings, paragraphs, tables, lists, captions, page breaks, code blocks, equations; for every image/chart/diagram/flowchart/screenshot, insert:
  ```
  ![Figure N](image-placeholder)
  :::image_description
  <concise description of visual>
  :::
  ```
- Returns `{ markdown }` and persists to new table `document_markdown`.

**`translate-markdown`**
- Input: `{ documentId, targetLanguage }` (or raw markdown).
- Loads stored OCR markdown, sends to OpenRouter using model `qwen/qwen3.6-flash` with the exact system prompt from the spec (preserve structure, don't translate code/URLs/identifiers, translate image_description blocks, etc.).
- Returns `{ translatedMarkdown }` and persists to `document_markdown`.

Both functions:
- Use `OPENROUTER_API_KEY` (already configured).
- Use `INTERNAL_FUNCTION_SECRET` pattern for any internal calls.
- Verify user JWT, CORS headers, Zod-style validation.

### Database

New table `document_markdown` to cache results:
- `document_id` (FK), `ocr_markdown` text, `translated_markdown` text, `target_language` text, `ocr_model`, `translation_model`, timestamps, `user_id`.
- RLS: users see/manage rows only for documents they have access to (reuse `has_folder_access` / document ownership pattern already in project).

### Frontend modules

- `src/pages/TranslationMarkdown.tsx` — main page.
- `src/components/translation-markdown/SideBySideView.tsx` — synchronized scroll split view, renders markdown via `react-markdown` + `remark-gfm` (already likely installed; otherwise add).
- `src/components/translation-markdown/MarkdownViewer.tsx` — renders markdown with custom renderer for `:::image_description` blocks (highlighted callout).
- `src/lib/translationMarkdown.ts` — client helpers: `generateOCRMarkdown(documentId)`, `translateMarkdown(documentId, targetLanguage)`, `downloadTranslatedMarkdown(filename, content)`.
- Sidebar entry added (icon: `FileType` or `Languages` variant) — does not replace existing Translation entry.

### Routes

Register `/translation-markdown` in `src/App.tsx` inside the protected `Layout`.

### Visual block detection

OCR prompt explicitly asks model to insert `image_description` blocks. A post-process step (`detectAndDescribeVisualBlocks`) scans the returned markdown for image syntax without an adjacent `:::image_description` block and, if any are missing, makes a follow-up call to fill them in. Keeps logic modular.

### Error & loading states

- Per-step status: `idle | running | done | error` with messages: "Generating OCR Markdown…", "Translating document…", "Preparing side-by-side view…".
- Errors surfaced via toast + inline alerts: OCR failed, Translation failed, Unsupported file type (validate mime in client and edge function), Empty document result.

### What stays unchanged

- Existing `/translation` page, `translate-document` edge function, `useTranslation`/`usePdfTranslation` hooks, RAG flows (`rag-assistant`, `extract-document-text`, `generate-embeddings`, etc.) — all untouched.

### Tech notes

- Markdown rendering: `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` (add if missing).
- Sync scroll: percentage-based `onScroll` handler shared between two `ScrollArea`s.
- Download: client-side `Blob` → `a.download`.
- All secrets via env (`OPENROUTER_API_KEY`, `INTERNAL_FUNCTION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`).
