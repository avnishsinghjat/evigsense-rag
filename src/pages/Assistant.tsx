import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";
import { Send, Loader2, Bot, User, MessageSquarePlus, MessageSquare, Download, FileDown, Trash2, ExternalLink, Copy, RefreshCw, FileSearch, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { jsPDF } from "jspdf";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// Normalize LaTeX delimiters the LLM sometimes emits ( \[..\], \(..\), or bare
// [ .. ] / ( .. ) wrapping backslash-commands) into KaTeX-compatible $$/$ form.
import { normalizeMathDelimiters } from "@/lib/normalizeMath";

interface DocumentSource {
  document_id: string;
  document_title: string;
  relevance_score: number;
  page_number?: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: DocumentSource[];
  suggestions?: string[];
}

interface Conversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

const Assistant = () => {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpDocs, setJumpDocs] = useState<Array<{ id: string; title: string; original_filename: string }>>([]);
  const [jumpLoading, setJumpLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setJumpOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!jumpOpen || jumpDocs.length > 0) return;
    setJumpLoading(true);
    supabase
      .from("documents")
      .select("id,title,original_filename")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (error) toast.error("Failed to load documents");
        else setJumpDocs((data as typeof jumpDocs) ?? []);
        setJumpLoading(false);
      });
  }, [jumpOpen, jumpDocs.length]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (currentConversationId) {
      loadMessages(currentConversationId);
    }
  }, [currentConversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadConversations = async () => {
    try {
      // @ts-ignore - Supabase types not yet regenerated
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('Error loading conversations:', error);
      toast.error('Failed to load conversations');
    } finally {
      setLoadingConversations(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      // @ts-ignore - Supabase types not yet regenerated
      const { data, error } = await supabase
        .from('conversation_messages')
        .select('role, content, sources')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      // Cast sources from Json to DocumentSource[]
      const typedMessages = (data || []).map(msg => ({
        ...msg,
        sources: (msg.sources as any) || []
      })) as Message[];
      
      setMessages(typedMessages);
    } catch (error) {
      console.error('Error loading messages:', error);
      toast.error('Failed to load messages');
    }
  };

  const handleOpenDocument = async (documentId: string, pageNumber?: number) => {
    try {
      console.log(`📂 Opening document: ${documentId}${pageNumber ? `, Page ${pageNumber}` : ''}`);
      
      // Fetch document details
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (docError) {
        console.error("❌ Error fetching document:", docError);
        throw docError;
      }

      console.log(`📄 Document details:`, {
        filename: doc.original_filename,
        mimetype: doc.mime_type,
        storage_path: doc.storage_path
      });

      // Handle different file types
      if (doc.mime_type?.includes("pdf")) {
        console.log(`📥 Downloading PDF from storage...`);
        
        // Download PDF as blob to use with page fragment
        const { data: pdfBlob, error: downloadError } = await supabase.storage
          .from("documents")
          .download(doc.storage_path);

        if (downloadError) {
          console.error("❌ PDF download error:", downloadError);
          toast.error("Failed to download PDF");
          throw downloadError;
        }

        if (!pdfBlob || pdfBlob.size === 0) {
          console.error("❌ PDF blob is empty or null");
          toast.error("Downloaded file is empty");
          throw new Error("PDF blob is empty");
        }

        console.log(`✅ PDF downloaded successfully, size: ${(pdfBlob.size / 1024).toFixed(2)} KB`);

        // Create object URL from blob
        const blobUrl = URL.createObjectURL(pdfBlob);
        console.log(`🔗 Created blob URL: ${blobUrl}`);
        
        // Build final URL with page fragment
        const finalUrl = pageNumber ? `${blobUrl}#page=${pageNumber}` : blobUrl;
        console.log(`🚀 Opening URL: ${finalUrl}`);
        
        // Try to open in new window
        const newWindow = window.open(finalUrl, '_blank');
        
        if (newWindow) {
          console.log(`✅ Window opened successfully`);
          toast.success(pageNumber ? `Opening file at page ${pageNumber}` : "File opened");
        } else {
          console.warn("⚠️ Popup was blocked, trying alternative method");
          // Fallback for popup blockers
          const link = document.createElement('a');
          link.href = finalUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          toast.info("If file didn't open, please allow popups for this site");
        }
      } else if (doc.mime_type?.includes("text") || doc.original_filename.endsWith(".txt") || doc.original_filename.endsWith(".md")) {
        // Download text files
        const { data, error } = await supabase.storage
          .from("documents")
          .download(doc.storage_path);

        if (error) throw error;

        const text = await data.text();
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        toast.success("File opened in new tab");
      } else {
        // For other types, offer download
        const { data, error } = await supabase.storage
          .from("documents")
          .download(doc.storage_path);

        if (error) throw error;

        const url = URL.createObjectURL(data);
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.original_filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        toast.success("File download started");
      }
    } catch (error: any) {
      console.error("❌ Error opening document:", error);
      toast.error("Failed to open file");
    }
  };

  const startNewConversation = () => {
    setCurrentConversationId(null);
    setMessages([]);
  };

  const deleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      // @ts-ignore - Supabase types not yet regenerated
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId);

      if (error) throw error;

      // Update local state
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      
      // If we deleted the current conversation, clear it
      if (currentConversationId === conversationId) {
        setCurrentConversationId(null);
        setMessages([]);
      }

      toast.success('Conversation deleted');
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast.error('Failed to delete conversation');
    }
  };

  const exportToMarkdown = () => {
    if (messages.length === 0) {
      toast.error("No messages to export");
      return;
    }

    const currentConv = conversations.find(c => c.id === currentConversationId);
    const title = currentConv?.title || "Conversation";
    const date = new Date().toLocaleDateString();
    
    let markdown = `# ${title}\n\n`;
    markdown += `*Exported on ${date}*\n\n`;
    markdown += `---\n\n`;
    
    messages.forEach((message, index) => {
      const role = message.role === "user" ? "**You**" : "**AI Assistant**";
      markdown += `### ${role}\n\n`;
      markdown += `${message.content}\n\n`;
      if (index < messages.length - 1) {
        markdown += `---\n\n`;
      }
    });

    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conversation-${currentConversationId || "new"}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success("Conversation exported as Markdown");
  };

  const exportToPDF = () => {
    if (messages.length === 0) {
      toast.error("No messages to export");
      return;
    }

    const currentConv = conversations.find(c => c.id === currentConversationId);
    const title = currentConv?.title || "Conversation";
    const date = new Date().toLocaleDateString();

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - 2 * margin;
    let yPosition = margin;

    // Add title
    doc.setFontSize(18);
    doc.setFont(undefined, "bold");
    doc.text(title, margin, yPosition);
    yPosition += 10;

    // Add date
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(`Exported on ${date}`, margin, yPosition);
    yPosition += 15;

    // Add messages
    messages.forEach((message, index) => {
      const role = message.role === "user" ? "You" : "AI Assistant";
      
      // Check if we need a new page
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = margin;
      }

      // Add role header
      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.text(role, margin, yPosition);
      yPosition += 7;

      // Add message content
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      
      const lines = doc.splitTextToSize(message.content, maxWidth);
      lines.forEach((line: string) => {
        if (yPosition > pageHeight - 20) {
          doc.addPage();
          yPosition = margin;
        }
        doc.text(line, margin, yPosition);
        yPosition += 5;
      });

      yPosition += 10;
    });

    doc.save(`conversation-${currentConversationId || "new"}.pdf`);
    toast.success("Conversation exported as PDF");
  };

  const handleCopyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Message copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy message");
    }
  };

  const handleRegenerateResponse = async (assistantMessageIndex: number) => {
    if (isLoading || assistantMessageIndex === 0) return;

    // Find the user message that prompted this assistant response
    const userMessage = messages[assistantMessageIndex - 1];
    if (!userMessage || userMessage.role !== "user") return;

    // Remove the assistant message and regenerate
    setMessages((prev) => prev.slice(0, assistantMessageIndex));
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("rag-assistant", {
        body: { 
          query: userMessage.content,
          conversationId: currentConversationId
        },
      });

      if (error) throw error;

      if (data?.answer) {
        setMessages((prev) => [
          ...prev,
          { 
            role: "assistant", 
            content: data.answer,
            sources: data.sources || [],
            suggestions: data.suggestions || []
          },
        ]);

        if (data.conversationId && !currentConversationId) {
          setCurrentConversationId(data.conversationId);
          loadConversations();
        }
      }
    } catch (error: any) {
      console.error("Assistant error:", error);
      
      let errorMessage = "Failed to regenerate response";
      if (error.message) {
        errorMessage = error.message;
      } else if (error.context?.error) {
        errorMessage = error.context.error;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      toast.error(errorMessage);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${errorMessage}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("rag-assistant", {
        body: { 
          query: userMessage,
          conversationId: currentConversationId
        },
      });

      if (error) throw error;

      if (data?.answer) {
        setMessages((prev) => [
          ...prev,
          { 
            role: "assistant", 
            content: data.answer,
            sources: data.sources || [],
            suggestions: data.suggestions || []
          },
        ]);

        // Update conversation ID if it's a new conversation
        if (data.conversationId && !currentConversationId) {
          setCurrentConversationId(data.conversationId);
          loadConversations(); // Refresh conversations list
        }
      }
    } catch (error: any) {
      console.error("Assistant error:", error);
      
      // Extract error message from various possible structures
      let errorMessage = "Failed to get response";
      
      if (error.message) {
        errorMessage = error.message;
      } else if (error.context?.error) {
        errorMessage = error.context.error;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      toast.error(errorMessage);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${errorMessage}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Conversations Sidebar */}
        <div className="w-64 border-r border-border flex flex-col">
          <div className="p-4 border-b border-border">
            <Button
              onClick={startNewConversation}
              className="w-full"
              variant="outline"
            >
              <MessageSquarePlus className="mr-2 h-4 w-4" />
              New Conversation
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loadingConversations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No conversations yet
              </div>
            ) : (
              <div className="space-y-1">
                {conversations.map((conv) => (
                  <div key={conv.id} className="relative group">
                    <button
                      onClick={() => setCurrentConversationId(conv.id)}
                      className={cn(
                        "w-full text-left p-3 rounded-lg transition-colors",
                        "hover:bg-accent",
                        currentConversationId === conv.id
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0 pr-8">
                          <p className="text-sm font-medium truncate">
                            {conv.title || "New Conversation"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(conv.updated_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => deleteConversation(conv.id, e)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          <div className="border-b border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">AI Assistant</h1>
                <p className="text-sm text-muted-foreground">
                  Ask questions about your documents using semantic search powered by AI embeddings
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setJumpOpen(true)}
                  className="gap-2"
                  title="Jump to document (⌘K)"
                >
                  <FileSearch className="h-4 w-4" />
                  Jump to document
                  <kbd className="ml-1 hidden sm:inline-flex h-5 items-center rounded border bg-muted px-1.5 text-[10px] font-mono text-muted-foreground">
                    ⌘K
                  </kbd>
                </Button>
                {messages.length > 0 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportToMarkdown}
                      className="gap-2"
                    >
                      <FileDown className="h-4 w-4" />
                      Markdown
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportToPDF}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      PDF
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">How can I help you?</h2>
                <p className="text-muted-foreground max-w-md">
                  I can help you find information in your documents, summarize content,
                  and answer questions based on your library. Start a conversation or select an existing one.
                </p>
              </div>
            ) : (
              <>
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex gap-3",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {message.role === "assistant" && (
                      <div className="flex-shrink-0">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                          <Bot className="h-5 w-5 text-primary-foreground" />
                        </div>
                      </div>
                    )}
                    <Card
                      className={cn(
                        "max-w-[80%] p-4 relative group",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card"
                      )}
                    >
                      {message.role === "assistant" && (
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleRegenerateResponse(index)}
                            disabled={isLoading}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleCopyMessage(message.content)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                      {message.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none pr-8 [&_img]:rounded-md [&_img]:my-3 [&_img]:max-w-full [&_img]:h-auto [&_img]:border [&_img]:border-border [&_h1]:mt-4 [&_h2]:mt-4 [&_h3]:mt-3 [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-1 [&_table]:my-3 [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-muted [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-md [&_blockquote]:border-l-4 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_a]:text-primary [&_a]:underline">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeRaw, rehypeKatex]}
                            components={{
                              img: ({ src, alt }) => (
                                <a href={src} target="_blank" rel="noopener noreferrer">
                                  <img src={src} alt={alt ?? ""} loading="lazy" />
                                </a>
                              ),
                            }}
                          >
                            {normalizeMathDelimiters(message.content)}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap pr-8">{message.content}</p>
                      )}
                      {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">
                            Referenced Documents:
                          </p>
                          <div className="space-y-1">
                            {message.sources.map((source, idx) => (
                              <button
                                key={idx}
                                onClick={() => handleOpenDocument(source.document_id, source.page_number)}
                                className="flex items-center justify-between gap-2 text-xs w-full hover:bg-accent/50 p-2 rounded-md transition-colors group"
                              >
                                <span className="truncate text-foreground flex items-center gap-1.5">
                                  <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  {source.document_title}
                                  {source.page_number && (
                                    <span className="text-muted-foreground text-[10px] font-semibold">(Page {source.page_number})</span>
                                  )}
                                </span>
                                <span className="text-muted-foreground whitespace-nowrap">
                                  {(source.relevance_score * 100).toFixed(1)}%
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {message.role === "assistant" && message.suggestions && message.suggestions.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">
                            Follow-up questions:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {message.suggestions.map((suggestion, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  setInput(suggestion);
                                  // Auto-submit the question
                                  const formEvent = new Event('submit', { bubbles: true, cancelable: true });
                                  document.querySelector('form')?.dispatchEvent(formEvent);
                                }}
                                disabled={isLoading}
                                className="text-xs px-3 py-2 rounded-md bg-accent/50 hover:bg-accent text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </Card>
                    {message.role === "user" && (
                      <div className="flex-shrink-0">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-3">
                    <div className="flex-shrink-0">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                        <Bot className="h-5 w-5 text-primary-foreground" />
                      </div>
                    </div>
                    <Card className="max-w-[80%] p-4">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </Card>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          <div className="border-t border-border p-4">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question about your files..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button type="submit" disabled={isLoading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>

      <CommandDialog open={jumpOpen} onOpenChange={setJumpOpen}>
        <CommandInput placeholder="Search documents by name…" />
        <CommandList>
          {jumpLoading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading documents…
            </div>
          ) : (
            <>
              <CommandEmpty>No documents found.</CommandEmpty>
              <CommandGroup heading="Documents">
                {jumpDocs.map((d) => {
                  const label = d.title || d.original_filename;
                  return (
                    <CommandItem
                      key={d.id}
                      value={`${label} ${d.original_filename}`}
                      onSelect={() => {
                        setJumpOpen(false);
                        navigate(`/document-chat/${d.id}`);
                      }}
                    >
                      <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">{label}</span>
                        {d.title && d.original_filename && d.title !== d.original_filename && (
                          <span className="truncate text-xs text-muted-foreground">
                            {d.original_filename}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </Layout>
  );
};

export default Assistant;