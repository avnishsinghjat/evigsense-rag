import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { Loader2, FileText, Languages, Download, Columns, ScanText, AlertCircle, X, Sparkles, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownViewer } from "@/components/translation-markdown/MarkdownViewer";
import { SideBySideView } from "@/components/translation-markdown/SideBySideView";
import {
  generateOCRMarkdown,
  translateMarkdown,
  loadDocumentMarkdown,
  downloadTranslatedMarkdown,
  detectAndDescribeVisualBlocks,
} from "@/lib/translationMarkdown";

interface DocOption {
  id: string;
  title: string;
  original_filename: string;
  storage_path: string;
  mime_type: string | null;
}

type Status = "idle" | "running" | "done" | "error";

export default function TranslationMarkdown() {
  const [searchParams] = useSearchParams();
  const initialDocId = searchParams.get("documentId") ?? "";
  const initialAction = searchParams.get("action") ?? "";

  const [docs, setDocs] = useState<DocOption[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>(initialDocId);
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const targetLang = "English";
  const setTargetLang = (_: string) => {};
  const [ocrMd, setOcrMd] = useState<string>("");
  const [translatedMd, setTranslatedMd] = useState<string>("");
  const [pdfUrl, setPdfUrl] = useState<string>("");
  const [tab, setTab] = useState<string>("original");
  const [sideBySideOpen, setSideBySideOpen] = useState(false);

  const [ocrStatus, setOcrStatus] = useState<Status>("idle");
  const [translateStatus, setTranslateStatus] = useState<Status>("idle");
  const [indexStatus, setIndexStatus] = useState<Status>("idle");
  
  const [translationProgress, setTranslationProgress] = useState<string>("");
  const [ocrProgress, setOcrProgress] = useState<string>("");
  const [ocrError, setOcrError] = useState<string>("");
  const [translateError, setTranslateError] = useState<string>("");
  const [loadingDocs, setLoadingDocs] = useState(true);
  const autoRanRef = useRef(false);

  const selectedDoc = useMemo(
    () => docs.find((d) => d.id === selectedDocId) ?? null,
    [docs, selectedDocId],
  );

  // Load documents
  useEffect(() => {
    (async () => {
      setLoadingDocs(true);
      const { data, error } = await supabase
        .from("documents")
        .select("id,title,original_filename,storage_path,mime_type")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        toast.error("Failed to load documents");
      } else {
        setDocs((data as DocOption[]) ?? []);
      }
      setLoadingDocs(false);
    })();
  }, []);

  // When document changes, reset state and load any cached markdown + signed URL
  useEffect(() => {
    setOcrMd("");
    setTranslatedMd("");
    setPdfUrl("");
    setOcrError("");
    setTranslateError("");
    setTranslationProgress("");
    setOcrStatus("idle");
    setTranslateStatus("idle");
    if (!selectedDoc) return;

    (async () => {
      // Cached markdown
      try {
        const rec = await loadDocumentMarkdown(selectedDoc.id);
        if (rec?.ocr_markdown) {
          setOcrMd(rec.ocr_markdown);
          setOcrStatus("done");
        }
        if (rec?.translated_markdown) {
          setTranslatedMd(rec.translated_markdown);
          setTranslateStatus("done");
          if (rec.target_language) setTargetLang(rec.target_language);
        }
      } catch (_e) {
        // ignore
      }

      // Signed URL for original (PDF preview)
      try {
        const { data } = await supabase.storage
          .from("documents")
          .createSignedUrl(selectedDoc.storage_path, 3600);
        if (data?.signedUrl) setPdfUrl(data.signedUrl);
      } catch (_e) {
        // ignore
      }
    })();
  }, [selectedDoc]);

  const handleIndexForChat = async (docId?: string, opts?: { silent?: boolean }) => {
    const id = docId ?? selectedDoc?.id;
    if (!id) return;
    setIndexStatus("running");
    try {
      const { data, error } = await supabase.functions.invoke("embed-markdown", {
        body: { documentId: id, source: "ocr" },
      });
      if (error) throw error;
      setIndexStatus("done");
      if (!opts?.silent) {
        toast.success(`Indexed for chat (${data?.chunks ?? 0} chunks). Images will appear in answers.`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setIndexStatus("error");
      if (!opts?.silent) toast.error("Indexing failed: " + msg);
      else console.error("Auto-index failed:", msg);
    }
  };

  const handleGenerateOCR = async () => {
    if (!selectedDoc) {
      toast.error("Select a document first");
      return;
    }
    setOcrStatus("running");
    setOcrError("");
    setOcrProgress("Preparing document…");
    try {
      const { markdown, imageCount } = await generateOCRMarkdown(selectedDoc.id, {
        onProgress: ({ current, total, phase }) => {
          if (phase === "preparing") setOcrProgress("Preparing document…");
          else if (phase === "rendering") setOcrProgress(`Rendering page ${current} of ${total}…`);
          else if (phase === "ocr") setOcrProgress(`Reading page ${current} of ${total}…`);
          else if (phase === "saving") setOcrProgress("Saving OCR markdown…");
        },
      });
      const enriched = detectAndDescribeVisualBlocks(markdown);
      setOcrMd(enriched);
      setOcrStatus("done");
      setOcrProgress("");
      setTab("ocr");
      toast.success(
        imageCount > 0
          ? `OCR Markdown generated (${imageCount} image${imageCount === 1 ? "" : "s"} extracted)`
          : "OCR Markdown generated",
      );
      handleIndexForChat(selectedDoc.id, { silent: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setOcrError(msg);
      setOcrStatus("error");
      setOcrProgress("");
      toast.error("OCR failed: " + msg);
    }
  };

  const handleTranslate = async () => {
    if (!selectedDoc) {
      toast.error("Select a document first");
      return;
    }
    if (!ocrMd) {
      toast.error("Generate OCR Markdown first");
      return;
    }
    setTranslateStatus("running");
    setTranslateError("");
    setTranslationProgress("");
    try {
      const md = await translateMarkdown(selectedDoc.id, targetLang, ocrMd, {
        onProgress: ({ current, total, phase }) => {
          setTranslationProgress(
            phase === "saving"
              ? "Saving translated Markdown…"
              : `Translating chunk ${current} of ${total}…`,
          );
        },
      });
      setTranslatedMd(md);
      setTranslateStatus("done");
      setTranslationProgress("");
      setTab("translated");
      toast.success("Translation complete");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setTranslateError(msg);
      setTranslateStatus("error");
      setTranslationProgress("");
      toast.error("Translation failed: " + msg);
    }
  };

  const handleDownload = () => {
    if (!translatedMd) {
      toast.error("Nothing to download yet");
      return;
    }
    const base = selectedDoc?.title || "translated";
    downloadTranslatedMarkdown(`${base}.${targetLang}.md`, translatedMd);
  };

  const handleExportPdf = async () => {
    if (!translatedMd) {
      toast.error("Translate first to export PDF");
      return;
    }
    try {
      const [{ renderToStaticMarkup }, { default: ReactMarkdown }, { default: remarkGfm }, { default: rehypeRaw }] = await Promise.all([
        import("react-dom/server"),
        import("react-markdown"),
        import("remark-gfm"),
        import("rehype-raw"),
      ]);
      const html = renderToStaticMarkup(
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {translatedMd}
        </ReactMarkdown>,
      );
      const title = `${selectedDoc?.title || "translated"} — ${targetLang}`;
      const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/[<>&]/g, "")}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; line-height: 1.55; font-size: 12pt; }
  h1,h2,h3,h4 { page-break-after: avoid; margin-top: 1.2em; }
  h1 { font-size: 22pt; border-bottom: 1px solid #ddd; padding-bottom: .2em; }
  h2 { font-size: 17pt; }
  h3 { font-size: 14pt; }
  p, li { orphans: 3; widows: 3; }
  pre { background: #f6f8fa; padding: 12px; border-radius: 6px; overflow-wrap: break-word; white-space: pre-wrap; font-size: 10pt; page-break-inside: avoid; }
  code { background: #f6f8fa; padding: 1px 4px; border-radius: 3px; font-size: 10pt; }
  pre code { background: transparent; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; page-break-inside: avoid; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; vertical-align: top; font-size: 11pt; }
  th { background: #f3f4f6; }
  img { max-width: 100%; height: auto; page-break-inside: avoid; }
  blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding: .25em 1em; color: #555; }
  a { color: #1d4ed8; text-decoration: none; }
  hr { border: 0; border-top: 1px solid #ddd; margin: 1.5em 0; }
  header { margin-bottom: 1.5em; padding-bottom: .5em; border-bottom: 1px solid #eee; }
  header .title { font-size: 16pt; font-weight: 600; }
  header .meta { font-size: 10pt; color: #666; margin-top: 4px; }
</style></head><body>
<header>
  <div class="title">${(selectedDoc?.title || selectedDoc?.original_filename || "Translated document").replace(/[<>&]/g, "")}</div>
  <div class="meta">Translated to ${targetLang} · Exported ${new Date().toLocaleString()}</div>
</header>
${html}
<script>
  // Wait for images before printing so they aren't blank in the PDF.
  (function(){
    var imgs = Array.from(document.images);
    var pending = imgs.filter(function(i){ return !i.complete; });
    if (pending.length === 0) { setTimeout(function(){ window.focus(); window.print(); }, 200); return; }
    var done = 0;
    pending.forEach(function(img){
      var fin = function(){ done++; if (done === pending.length) { setTimeout(function(){ window.focus(); window.print(); }, 200); } };
      img.addEventListener('load', fin);
      img.addEventListener('error', fin);
    });
  })();
</script>
</body></html>`;
      const win = window.open("", "_blank");
      if (!win) {
        toast.error("Popup blocked — allow popups to export PDF");
        return;
      }
      win.document.open();
      win.document.write(doc);
      win.document.close();
      toast.success("Opening print dialog — choose 'Save as PDF'");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("PDF export failed: " + msg);
    }
  };

  const handleSideBySide = () => {
    if (!translatedMd) {
      toast.error("Translate first to view side by side");
      return;
    }
    setSideBySideOpen(true);
  };


  // Auto-run action from URL params (?action=ocr|translate|side-by-side)
  useEffect(() => {
    if (autoRanRef.current) return;
    if (!initialAction || !selectedDoc) return;
    if (loadingDocs) return;

    if (initialAction === "side-by-side") {
      if (ocrMd && translatedMd) {
        autoRanRef.current = true;
        setSideBySideOpen(true);
      }
      return;
    }

    if (initialAction === "ocr" && ocrStatus === "idle") {
      autoRanRef.current = true;
      handleGenerateOCR();
      return;
    }

    if (initialAction === "translate") {
      if (ocrMd && translateStatus === "idle") {
        autoRanRef.current = true;
        handleTranslate();
      } else if (!ocrMd && ocrStatus === "idle") {
        // OCR not yet generated — switch to OCR tab so user can generate first
        autoRanRef.current = true;
        setTab("ocr");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDoc, loadingDocs, ocrMd, translatedMd, ocrStatus, translateStatus, initialAction]);

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4 w-full h-[calc(100vh-3.5rem)] flex flex-col">
        <div className="flex items-center gap-3">
          <Languages className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Translation Markdown</h1>
            <p className="text-sm text-muted-foreground">
              Generate OCR Markdown from a document, translate it, and view side by side.
            </p>
          </div>
        </div>

        {/* Controls */}
        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-6">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Document
              </label>
              <Popover open={docPickerOpen} onOpenChange={setDocPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    disabled={loadingDocs}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {selectedDoc
                        ? selectedDoc.title || selectedDoc.original_filename
                        : loadingDocs
                          ? "Loading…"
                          : "Select a document"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                  <Command>
                    <CommandInput placeholder="Search documents…" />
                    <CommandList>
                      <CommandEmpty>No documents found.</CommandEmpty>
                      <CommandGroup>
                        {docs.map((d) => {
                          const label = d.title || d.original_filename;
                          return (
                            <CommandItem
                              key={d.id}
                              value={`${label} ${d.original_filename}`}
                              onSelect={() => {
                                setSelectedDocId(d.id);
                                setDocPickerOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedDocId === d.id ? "opacity-100" : "opacity-0",
                                )}
                              />
                              <span className="truncate">{label}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="md:col-span-3">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Target language
              </label>
              <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm">
                English
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleGenerateOCR} disabled={!selectedDoc || ocrStatus === "running"}>
              {ocrStatus === "running" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ScanText />
              )}
              {ocrStatus === "running" ? "Generating OCR Markdown…" : "Generate OCR Markdown"}
            </Button>
            <Button
              onClick={handleTranslate}
              disabled={!ocrMd || translateStatus === "running"}
              variant="secondary"
            >
              {translateStatus === "running" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Languages />
              )}
              {translateStatus === "running" ? "Translating document…" : "Translate Markdown"}
            </Button>
            <Button onClick={handleSideBySide} variant="outline" disabled={!translatedMd}>
              <Columns /> View Side by Side
            </Button>
            <Button
              onClick={() => handleIndexForChat()}
              variant="outline"
              disabled={!ocrMd || indexStatus === "running"}
            >
              {indexStatus === "running" ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {indexStatus === "running" ? "Indexing for chat…" : "Index for Chat (with images)"}
            </Button>
            <Button onClick={handleDownload} variant="outline" disabled={!translatedMd}>
              <Download /> Download Translated Markdown
            </Button>
            <Button onClick={handleExportPdf} variant="outline" disabled={!translatedMd}>
              <FileText /> Export to PDF
            </Button>
          </div>

          {ocrStatus === "error" && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>OCR failed</AlertTitle>
              <AlertDescription>{ocrError}</AlertDescription>
            </Alert>
          )}
          {translateStatus === "error" && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Translation failed</AlertTitle>
              <AlertDescription>{translateError}</AlertDescription>
            </Alert>
          )}
        </Card>

        {/* Viewer */}
        <Card className="p-4 flex-1 min-h-0 flex flex-col">
          <Tabs value={tab} onValueChange={setTab} className="w-full flex-1 min-h-0 flex flex-col">
            <TabsList>
              <TabsTrigger value="original">
                <FileText className="h-4 w-4 mr-1" /> Original Document
              </TabsTrigger>
              <TabsTrigger value="ocr">OCR Markdown</TabsTrigger>
              <TabsTrigger value="translated">Translated Markdown</TabsTrigger>
            </TabsList>

            <div className="mt-4 flex-1 min-h-0">
              <TabsContent value="original" className="h-full m-0">
                {!selectedDoc ? (
                  <EmptyState text="Select a document to begin." />
                ) : pdfUrl ? (
                  <iframe
                    src={pdfUrl}
                    title="Original document"
                    className="w-full h-full border rounded-lg bg-card"
                  />
                ) : (
                  <EmptyState text="Loading document preview…" />
                )}
              </TabsContent>

              <TabsContent value="ocr" className="h-full m-0">
                {ocrStatus === "running" ? (
                  <LoadingState text={ocrProgress || "Generating OCR Markdown…"} />
                ) : ocrMd ? (
                  <div className="h-full overflow-auto border rounded-lg bg-card p-6 md:p-8">
                    <MarkdownViewer content={ocrMd} className="max-w-4xl mx-auto" />
                  </div>
                ) : (
                  <EmptyState text='Click "Generate OCR Markdown" to extract structured Markdown from the document.' />
                )}
              </TabsContent>

              <TabsContent value="translated" className="h-full m-0">
                {translateStatus === "running" ? (
                  <LoadingState text={translationProgress || "Translating document…"} />
                ) : translatedMd ? (
                  <div className="h-full overflow-auto border rounded-lg bg-card p-6 md:p-8">
                    <MarkdownViewer content={translatedMd} className="max-w-4xl mx-auto" />
                  </div>
                ) : (
                  <EmptyState text='Click "Translate Markdown" after generating OCR Markdown.' />
                )}
              </TabsContent>

            </div>
          </Tabs>
        </Card>
      </div>

      <Dialog open={sideBySideOpen} onOpenChange={setSideBySideOpen}>
        <DialogContent
          className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 border-0 flex flex-col"
        >
          <div className="flex items-center justify-between px-4 py-2 border-b bg-card">
            <div className="flex items-center gap-2">
              <Columns className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">
                Side by Side — {selectedDoc?.title || selectedDoc?.original_filename || "Document"}
              </h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSideBySideOpen(false)}>
              <X className="h-4 w-4 mr-1" /> Close
            </Button>
          </div>
          <div className="flex-1 min-h-0 p-3">
            {ocrMd && translatedMd ? (
              <SideBySideView
                leftLabel="OCR Markdown (original language)"
                rightLabel={`Translated (${targetLang})`}
                leftMarkdown={ocrMd}
                rightMarkdown={translatedMd}
                onRightChange={setTranslatedMd}
              />
            ) : (
              <EmptyState text="Generate OCR and translation first to view side by side." />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-full flex items-center justify-center border border-dashed rounded-lg text-sm text-muted-foreground p-6 text-center">
      {text}
    </div>
  );
}

function LoadingState({ text }: { text: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 border rounded-lg bg-card text-sm text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      {text}
    </div>
  );
}
