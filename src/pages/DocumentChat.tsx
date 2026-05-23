import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Loader2, Send, ArrowLeft, FileText } from "lucide-react";
import { PDFViewerWithSearch } from "@/components/PDFViewerWithSearch";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { normalizeMathDelimiters } from "@/lib/normalizeMath";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ page_number: number; similarity: number }>;
}

interface SheetData {
  name: string;
  data: string[][];
}

export default function DocumentChat() {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState<any>(null);
  const [pdfUrl, setPdfUrl] = useState<string>("");
  const [wordContent, setWordContent] = useState<string>("");
  const [excelSheets, setExcelSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState<number>(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [fileType, setFileType] = useState<"pdf" | "word" | "excel" | "other">("pdf");
  const [contentLoading, setContentLoading] = useState(false);

  useEffect(() => {
    loadDocument();
  }, [documentId]);

  const isWordDocument = (mimeType: string | null, filename: string) => {
    if (mimeType?.includes("word") || mimeType?.includes("msword") || 
        mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      return true;
    }
    const ext = filename.toLowerCase().split(".").pop();
    return ext === "doc" || ext === "docx";
  };

  const isExcelDocument = (mimeType: string | null, filename: string) => {
    if (mimeType?.includes("spreadsheet") || mimeType?.includes("excel") ||
        mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        mimeType === "application/vnd.ms-excel" ||
        mimeType === "text/csv" || mimeType === "application/csv") {
      return true;
    }
    const ext = filename.toLowerCase().split(".").pop();
    return ext === "xls" || ext === "xlsx" || ext === "csv";
  };

  const loadDocument = async () => {
    if (!documentId) return;

    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (error) {
      toast.error("Failed to load file");
      return;
    }

    setDocument(data);

    const isWord = isWordDocument(data.mime_type, data.original_filename);
    const isExcel = isExcelDocument(data.mime_type, data.original_filename);

    if (isWord) {
      setFileType("word");
      await loadWordContent(data);
    } else if (isExcel) {
      setFileType("excel");
      await loadExcelContent(data);
    } else {
      setFileType("pdf");
      // Get signed URL for PDF
      const { data: urlData } = await supabase.storage
        .from("documents")
        .createSignedUrl(data.storage_path, 3600);

      if (urlData?.signedUrl) {
        setPdfUrl(urlData.signedUrl);
      }
    }
  };

  const loadWordContent = async (data: any) => {
    setContentLoading(true);
    try {
      const { data: urlData } = await supabase.storage
        .from("documents")
        .createSignedUrl(data.storage_path, 3600);

      if (urlData?.signedUrl && data.original_filename.toLowerCase().endsWith(".docx")) {
        const response = await fetch(urlData.signedUrl);
        const arrayBuffer = await response.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setWordContent(result.value);
      } else if (data.content_text) {
        setWordContent(`<pre style="white-space: pre-wrap; font-family: inherit;">${data.content_text}</pre>`);
      } else {
        setWordContent("<p class='text-muted-foreground'>No content available for this file.</p>");
      }
    } catch (err) {
      console.error("Error loading Word content:", err);
      if (data.content_text) {
        setWordContent(`<pre style="white-space: pre-wrap; font-family: inherit;">${data.content_text}</pre>`);
      } else {
        setWordContent("<p class='text-muted-foreground'>Failed to load file content.</p>");
      }
    } finally {
      setContentLoading(false);
    }
  };

  const loadExcelContent = async (data: any) => {
    setContentLoading(true);
    try {
      const { data: urlData } = await supabase.storage
        .from("documents")
        .createSignedUrl(data.storage_path, 3600);

      if (urlData?.signedUrl) {
        const response = await fetch(urlData.signedUrl);
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        
        const sheets: SheetData[] = workbook.SheetNames.map((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 });
          return {
            name: sheetName,
            data: jsonData as string[][],
          };
        });

        setExcelSheets(sheets);
      } else if (data.content_text) {
        // Fallback to content_text
        setExcelSheets([{ name: "Content", data: [[data.content_text]] }]);
      }
    } catch (err) {
      console.error("Error loading Excel content:", err);
      if (data.content_text) {
        setExcelSheets([{ name: "Content", data: [[data.content_text]] }]);
      } else {
        setExcelSheets([]);
      }
    } finally {
      setContentLoading(false);
    }
  };

  // Extract page numbers mentioned in text like "Page 10" or "(Page 10)"
  const extractPageNumbers = (text: string): number[] => {
    const pageRegex = /\(?\bPage\s+(\d+)\b\)?/gi;
    const matches = text.matchAll(pageRegex);
    const pages = Array.from(matches, m => parseInt(m[1]));
    return [...new Set(pages)].sort((a, b) => a - b);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("rag-assistant", {
        body: {
          query: input,
          conversationId: conversationId || undefined,
          documentId: documentId,
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
      if (data.conversationId) {
        setConversationId(data.conversationId);
      }

      // Automatically jump to first page mentioned in the response (only for PDFs)
      if (fileType === "pdf") {
        const mentionedPages = extractPageNumbers(data.answer);
        if (mentionedPages.length > 0) {
          setCurrentPage(mentionedPages[0]);
        }
      }
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message || "Failed to get response");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSourceClick = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  if (!document) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const renderExcelViewer = () => {
    if (excelSheets.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          No spreadsheet data available
        </div>
      );
    }

    const currentSheet = excelSheets[activeSheet];

    return (
      <div className="h-full flex flex-col">
        {/* Sheet tabs */}
        {excelSheets.length > 1 && (
          <div className="border-b bg-card px-2 py-1 flex gap-1 overflow-x-auto">
            {excelSheets.map((sheet, idx) => (
              <Button
                key={idx}
                variant={activeSheet === idx ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveSheet(idx)}
                className="text-xs whitespace-nowrap"
              >
                {sheet.name}
              </Button>
            ))}
          </div>
        )}
        
        {/* Spreadsheet content */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {currentSheet.data.map((row, rowIdx) => (
                    <tr key={rowIdx} className={rowIdx === 0 ? "bg-muted font-medium" : "border-t"}>
                      {row.map((cell, cellIdx) => (
                        <td 
                          key={cellIdx} 
                          className="px-3 py-2 border-r last:border-r-0 whitespace-nowrap max-w-xs truncate"
                          title={String(cell ?? "")}
                        >
                          {cell ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {currentSheet.data.length === 0 && (
              <p className="text-center text-muted-foreground py-8">This sheet is empty</p>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b bg-card p-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/documents")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold">{document.title}</h1>
          </div>
        </div>
      </div>

      {/* Main Content - Side by Side */}
      <div className="flex-1 flex overflow-hidden">
        {/* Document Viewer - Left Side */}
        <div className="w-1/2 border-r bg-muted/20">
          {contentLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : fileType === "word" ? (
            // Word Document Viewer
            <div className="h-full flex flex-col">
              <div className="border-b bg-card px-4 py-2">
                <span className="text-sm text-muted-foreground">
                  {document.original_filename}
                </span>
              </div>
              <ScrollArea className="flex-1">
                <div 
                  className="p-6 prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: wordContent }}
                />
              </ScrollArea>
            </div>
          ) : fileType === "excel" ? (
            // Excel Document Viewer
            <div className="h-full flex flex-col">
              <div className="border-b bg-card px-4 py-2">
                <span className="text-sm text-muted-foreground">
                  {document.original_filename}
                </span>
              </div>
              {renderExcelViewer()}
            </div>
          ) : pdfUrl ? (
            <PDFViewerWithSearch
              url={pdfUrl}
              filename={document.original_filename}
              initialPage={currentPage}
              initialSearchQuery=""
              onClose={() => navigate("/documents")}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          )}
        </div>

        {/* Chat Interface - Right Side */}
        <div className="w-1/2 flex flex-col">
          {/* Messages Area */}
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages.length === 0 && (
                <Card className="p-6 text-center">
                  <p className="text-muted-foreground">
                    Ask questions about this file. I'll provide answers{fileType === "pdf" && " with specific page references"}.
                  </p>
                </Card>
              )}

              {messages.map((message, idx) => {
                const mentionedPages = message.role === "assistant" && fileType === "pdf" ? extractPageNumbers(message.content) : [];
                
                return (
                  <div
                    key={idx}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <Card
                      className={`max-w-[80%] p-4 ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card"
                      }`}
                    >
                      {message.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none [&_img]:rounded-md [&_img]:my-2 [&_img]:max-w-full [&_img]:h-auto">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeRaw, rehypeKatex]}
                          >
                            {normalizeMathDelimiters(message.content)}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      )}
                      
                      {mentionedPages.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <p className="text-sm font-medium mb-2">Pages mentioned:</p>
                          <div className="flex flex-wrap gap-2">
                            {mentionedPages.map((pageNum, i) => (
                              <Button
                                key={i}
                                variant="secondary"
                                size="sm"
                                onClick={() => handleSourceClick(pageNum)}
                                className="text-xs"
                              >
                                Page {pageNum}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </Card>
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex justify-start">
                  <Card className="p-4 bg-card">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </Card>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="border-t p-4 bg-card">
            <div className="flex gap-2 max-w-3xl mx-auto">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="Ask a question about this file..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
