import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, FileText, Loader2, Calendar, Tag as TagIcon, X, Eye, EyeOff, Download, Trash2, Edit, Sparkles, FolderTree, Languages, ArrowRightLeft, CheckCircle2, MessageSquare, Scissors, Database, Play, FileEdit } from "lucide-react";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { DropZone } from "@/components/DropZone";
import { PDFSplitter } from "@/components/PDFSplitter";
import { EnrichedMetadataDialog } from "@/components/metadata/EnrichedMetadataDialog";
import { WordEditorDialog } from "@/components/documents/WordEditorDialog";

interface Tag {
  id: string;
  name: string;
  type: string | null;
}

interface Document {
  id: string;
  title: string;
  original_filename: string;
  storage_path: string;
  mime_type: string | null;
  status: string;
  sensitivity: string;
  summary: string | null;
  content_text: string | null;
  created_at: string;
  created_by: string;
  tags?: Tag[];
  document_embeddings?: { id: string; document_id: string }[];
  document_chunks?: { id: string; document_id: string }[];
}

interface Folder {
  id: string;
  name: string;
  category: string | null;
  color: string | null;
  description: string | null;
}

const Documents = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [availableFolders, setAvailableFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editDoc, setEditDoc] = useState<Document | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editSensitivity, setEditSensitivity] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [updating, setUpdating] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState<string | null>(null);
  const [hiddenSummaries, setHiddenSummaries] = useState<Set<string>>(new Set());
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 50;
  
  // Removed view and selection states - now showing only cards
  
  // Translation states
  const [translationFile, setTranslationFile] = useState<File | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('ru');
  const [translationInput, setTranslationInput] = useState('');
  const [translationOutput, setTranslationOutput] = useState('');
  const [translating, setTranslating] = useState(false);
  const [showSplitter, setShowSplitter] = useState(false);
  
  // Metadata extraction states
  const [extractingMetadata, setExtractingMetadata] = useState<string | null>(null);
  const [metadataDialogDoc, setMetadataDialogDoc] = useState<Document | null>(null);
  const [enrichedMetadata, setEnrichedMetadata] = useState<any>(null);
  
  // Audio/Video player state
  const [mediaPlayerDoc, setMediaPlayerDoc] = useState<Document | null>(null);
  const [mediaPlayerUrl, setMediaPlayerUrl] = useState<string | null>(null);

  // Word editor state
  const [wordEditorDoc, setWordEditorDoc] = useState<Document | null>(null);

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
    { code: 'es', name: 'Spanish' },
    { code: 'pl', name: 'Polish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'no', name: 'Norwegian' },
    { code: 'ru', name: 'Russian' },
  ];

  useEffect(() => {
    loadDocuments();
  }, [currentPage]);

  useEffect(() => {
    loadTags();
    loadFolders();

    // Set up realtime subscription for document updates
    const channel = supabase
      .channel('documents_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'documents',
        },
        (payload) => {
          console.log('Document updated:', payload);
          // Refresh documents when any document is updated
          loadDocuments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-refresh documents being processed (fallback polling)
  useEffect(() => {
    const hasProcessingDocs = documents.some(doc => {
      const hasText = doc.content_text && doc.content_text.trim().length > 0;
      const isActive = doc.status === 'active';
      return !(isActive && hasText);
    });

    if (hasProcessingDocs) {
      const interval = setInterval(() => {
        loadDocuments();
      }, 5000); // Check every 5 seconds (increased from 3s since we have realtime now)

      return () => clearInterval(interval);
    }
  }, [documents]);

  // Auto-retry incomplete embedding generation - DISABLED
  // Removed auto-checking to prevent repeated log messages
  useEffect(() => {
    // Users can manually retry from the document management page if needed
  }, [documents]);

  const loadDocuments = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get total count first
      const { count, error: countError } = await supabase
        .from("documents")
        .select("*", { count: 'exact', head: true })
        .eq("created_by", user.id);

      if (countError) throw countError;
      setTotalCount(count || 0);

      // Calculate offset for pagination
      const offset = (currentPage - 1) * ITEMS_PER_PAGE;

      // Fetch documents uploaded by the current user only with pagination
      const { data: docsData, error: docsError } = await supabase
        // @ts-ignore - Supabase types not yet regenerated
        .from("documents")
        .select("*")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + ITEMS_PER_PAGE - 1);

      if (docsError) throw docsError;

      // Fetch document tags
      const { data: docTagsData, error: docTagsError } = await supabase
        // @ts-ignore - Supabase types not yet regenerated
        .from("document_tags")
        .select("document_id, tag_id, tags(id, name, type)");

      if (docTagsError) throw docTagsError;

      // Fetch document embeddings count
      const { data: embeddingsData, error: embeddingsError } = await supabase
        // @ts-ignore - Supabase types not yet regenerated
        .from("document_embeddings")
        .select("document_id, id");

      if (embeddingsError) throw embeddingsError;

      // Fetch document chunks count
      const { data: chunksData, error: chunksError } = await supabase
        // @ts-ignore - Supabase types not yet regenerated
        .from("document_chunks")
        .select("document_id, id");

      if (chunksError) throw chunksError;

      // Combine documents with their tags, embeddings, and chunks
      const documentsWithTags = (docsData || []).map((doc: Document) => ({
        ...doc,
        tags: (docTagsData || [])
          .filter((dt: any) => dt.document_id === doc.id)
          .map((dt: any) => dt.tags)
          .filter(Boolean),
        document_embeddings: (embeddingsData || [])
          .filter((de: any) => de.document_id === doc.id),
        document_chunks: (chunksData || [])
          .filter((dc: any) => dc.document_id === doc.id),
      }));

      setDocuments(documentsWithTags);
      // Initialize all summaries as hidden by default
      const allDocIds = new Set(documentsWithTags.map((doc: Document) => doc.id));
      setHiddenSummaries(allDocIds);
    } catch (error: any) {
      console.error("Error loading documents:", error);
      // Only show error toast if it's not a network/fetch error
      if (error?.message && !error.message.includes('Failed to fetch')) {
        toast.error("Failed to load files");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadTags = async () => {
    try {
      const { data, error } = await supabase
        // @ts-ignore - Supabase types not yet regenerated
        .from("tags")
        .select("*")
        .order("name");

      if (error) throw error;
      setAvailableTags(data || []);
    } catch (error) {
      console.error("Error loading tags:", error);
    }
  };

  const loadFolders = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        // @ts-ignore - Supabase types not yet regenerated
        .from("folders")
        .select("id, name, category, color, description")
        .eq("created_by", user.id)
        .order("name");

      if (error) throw error;
      setAvailableFolders(data || []);
    } catch (error) {
      console.error("Error loading folders:", error);
    }
  };

  const handleFilesSelected = (selectedFiles: File[]) => {
    // Check individual file sizes (max 50MB per file)
    const oversizedFiles = selectedFiles.filter(f => f.size / (1024 * 1024) > 50);
    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map(f => f.name).join(', ');
      const fileSizes = oversizedFiles.map(f => `${f.name} (${(f.size / (1024 * 1024)).toFixed(1)}MB)`).join(', ');
      toast.error(`Files too large. Maximum 50MB per file: ${fileSizes}`);
      return;
    }
    
    setFiles(selectedFiles);
    if (selectedFiles.length > 0 && !title) {
      setTitle(selectedFiles[0].name);
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Helper to check if file is audio/video
  const isAudioOrVideoFile = (mimeType: string) => {
    const audioVideoTypes = [
      'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/m4a',
      'video/mp4', 'video/webm', 'video/mpeg', 'video/quicktime', 'video/x-msvideo'
    ];
    return audioVideoTypes.includes(mimeType);
  };

  // Helper to check if file is a Word document
  const isWordDocument = (mimeType: string | null, filename: string) => {
    const wordMimeTypes = [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    const wordExtensions = ['.doc', '.docx'];
    return (mimeType && wordMimeTypes.includes(mimeType)) || 
           wordExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      toast.error("Please select at least one file");
      return;
    }

    logger.info('Documents', 'Upload started', { fileCount: files.length, files: files.map(f => f.name) });
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let successCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        try {
          // Upload file to storage
          const fileExt = file.name.split(".").pop();
          const fileName = `${user.id}/${Date.now()}_${i}.${fileExt}`;
          const { error: uploadError } = await supabase.storage
            .from("documents")
            .upload(fileName, file);

          if (uploadError) throw uploadError;

          // Create document record with custom title for single file, or filename for multiple
          const docTitle = files.length === 1 && title.trim() ? title : file.name;

          const isAudioVideo = isAudioOrVideoFile(file.type);

          const { data: docData, error: dbError } = await supabase.from("documents")
            .insert({
              title: docTitle,
              original_filename: file.name,
              storage_path: fileName,
              mime_type: file.type,
              created_by: user.id,
              folder_id: selectedFolderId || null,
              status: isAudioVideo ? 'transcribing' : 'queued',
            })
            .select()
            .single();

          if (dbError) throw dbError;

          // Add tags to document
          const tagsToAdd = [...selectedTags];
          
          // For audio/video files, automatically add "other" tag
          if (isAudioVideo && docData) {
            let otherTag = availableTags.find(tag => tag.name.toLowerCase() === 'other');
            
            // If "other" tag doesn't exist, create it
            if (!otherTag) {
              const { data: newTag, error: tagCreateError } = await supabase
                .from('tags')
                .insert({ name: 'Other', type: 'other' })
                .select()
                .single();
              
              if (!tagCreateError && newTag) {
                otherTag = newTag;
                // Refresh available tags
                setAvailableTags(prev => [...prev, newTag]);
              }
            }
            
            if (otherTag && !tagsToAdd.includes(otherTag.id)) {
              tagsToAdd.push(otherTag.id);
            }
          }
          
          // If category is selected, find or add category tag
          if (selectedCategory && docData) {
            const categoryTag = availableTags.find(
              tag => tag.type?.toLowerCase() === selectedCategory.toLowerCase()
            );
            if (categoryTag && !tagsToAdd.includes(categoryTag.id)) {
              tagsToAdd.push(categoryTag.id);
            }
          }
          
          if (tagsToAdd.length > 0 && docData) {
            const tagInserts = tagsToAdd.map(tagId => ({
              document_id: docData.id,
              tag_id: tagId,
            }));

            const { error: tagError } = await supabase
              .from("document_tags")
              .insert(tagInserts);

            if (tagError) throw tagError;
          }

          // For audio/video files, trigger transcription instead of normal processing
          if (isAudioVideo) {
            // Trigger transcription in the background (edge function will update status)
            supabase.functions.invoke('transcribe-audio', {
              body: { document_id: docData.id }
            }).catch((error) => {
              console.error('Failed to invoke transcription:', error);
              toast.error('Failed to start transcription');
            });
          } else {
            // For regular documents, add to processing queue
            const { error: queueError } = await supabase
              .from('document_processing_queue')
              .insert({
                document_id: docData.id,
                user_id: user.id,
                status: 'pending'
              });

            if (queueError) {
              console.error('Error adding to queue:', queueError);
              // Continue - document is uploaded
            }
          }

          successCount++;
        } catch (fileError: any) {
          logger.error('Documents', `Upload failed for ${file.name}`, { error: fileError.message, fileName: file.name });
          console.error(`Error uploading ${file.name}:`, fileError);
          toast.error(`Failed to upload ${file.name}: ${fileError.message}`);
        }
      }

      if (successCount > 0) {
        logger.info('Documents', 'Upload completed', { successCount, totalFiles: files.length });
        toast.success(`${successCount} file(s) uploaded successfully.`);
        
        // Start queue processing for non-audio/video files
        await supabase.functions.invoke('process-queue');
        
        // If uploaded to a folder, show a message about where to find it
        if (selectedFolderId) {
          const folderName = availableFolders.find(f => f.id === selectedFolderId)?.name;
          if (folderName) {
            toast.info(`Files uploaded to "${folderName}" folder. Go to File Management to view them in the folder.`);
          }
        }
      }

      setFiles([]);
      setTitle("");
      setSelectedTags([]);
      setSelectedCategory("");
      setSelectedFolderId("");
      loadDocuments();
    } catch (error: any) {
      logger.error('Documents', 'Upload error', { error: error.message });
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to upload files");
    } finally {
      setUploading(false);
    }
  };

  const getProcessingStatus = (doc: Document) => {
    // Check if document has been fully processed
    const hasText = doc.content_text && doc.content_text.trim().length > 0;
    // @ts-ignore - Check if embeddings exist
    const embeddingCount = doc.document_embeddings?.length || 0;
    // For chunked documents, use actual chunk count; otherwise estimate from text length
    // Use 1500 chars per chunk to match the actual CONFIG.MAX_CHUNK_SIZE in generate-embeddings
    const chunkCount = doc.document_chunks?.length || 0;
    const estimatedChunks = chunkCount > 0 ? chunkCount : (hasText ? Math.ceil(doc.content_text.length / 1500) : 0);
    
    // If document status is 'active' and has text, it's ready regardless of embedding count estimation
    // This is the authoritative status from the backend
    if (doc.status === 'active' && hasText) {
      return { 
        stage: 'complete', 
        progress: 100, 
        label: 'Ready',
        embeddingCount,
        estimatedChunks
      };
    }
    
    // Check if this is a large document being processed in chunks
    if (hasText && doc.content_text.includes('Processing large document:')) {
      // Check for failed chunks
      const failedMatch = doc.content_text.match(/Processing large document: (\d+)\/(\d+) pages completed \((\d+)\/(\d+) chunks, (\d+) failed\)/);
      if (failedMatch) {
        const completed = parseInt(failedMatch[1]);
        const total = parseInt(failedMatch[2]);
        const completedChunks = parseInt(failedMatch[3]);
        const totalChunks = parseInt(failedMatch[4]);
        const failedChunks = parseInt(failedMatch[5]);
        const progress = Math.round((completed / total) * 100);
        return {
          stage: 'chunked_extraction',
          progress: Math.min(progress, 95),
          label: `Processing: ${completed}/${total} pages (${completedChunks}/${totalChunks} chunks, ${failedChunks} retrying...)`,
          embeddingCount: 0,
          estimatedChunks: 0
        };
      }
      
      // Normal processing without failures
      const match = doc.content_text.match(/Processing large document: (\d+)\/(\d+) pages completed \((\d+)\/(\d+) chunks\)/);
      if (match) {
        const completed = parseInt(match[1]);
        const total = parseInt(match[2]);
        const completedChunks = parseInt(match[3]);
        const totalChunks = parseInt(match[4]);
        const progress = Math.round((completed / total) * 100);
        return {
          stage: 'chunked_extraction',
          progress: Math.min(progress, 95), // Cap at 95% until fully complete
          label: `Processing: ${completed}/${total} pages (${completedChunks}/${totalChunks} chunks)`,
          embeddingCount: 0,
          estimatedChunks: 0
        };
      }
    }
    
    // Check for partial failure status
    if (hasText && doc.content_text.includes('Processing partially failed:')) {
      return {
        stage: 'error',
        progress: 0,
        label: 'Processing failed (some chunks)',
        embeddingCount: 0,
        estimatedChunks: 0
      };
    }
    
    // Check for file too large error
    if (hasText && doc.content_text.includes('File too large for processing')) {
      return {
        stage: 'error',
        progress: 0,
        label: 'File too large (split required)',
        embeddingCount: 0,
        estimatedChunks: 0
      };
    }
    
    // Document is complete if it has sufficient embeddings (at least 95% of estimated)
    if (embeddingCount > 0 && estimatedChunks > 0 && embeddingCount >= estimatedChunks * 0.95) {
      return { 
        stage: 'complete', 
        progress: 100, 
        label: 'Ready',
        embeddingCount,
        estimatedChunks
      };
    }
    
    // If document was just uploaded and has no text yet
    if (!hasText) {
      return { 
        stage: 'extracting', 
        progress: 33, 
        label: 'Extracting text...',
        embeddingCount: 0,
        estimatedChunks: 0
      };
    }
    
    // If has text but generating embeddings
    if (hasText && embeddingCount < estimatedChunks) {
      const embeddingProgress = estimatedChunks > 0 
        ? Math.round((embeddingCount / estimatedChunks) * 100) 
        : 0;
      // Progress from 33% to 100% based on embedding completion
      const overallProgress = 33 + Math.round(embeddingProgress * 0.67);
      
      return { 
        stage: 'embedding', 
        progress: overallProgress, 
        label: `Generating embeddings: ${embeddingCount}/${estimatedChunks} chunks (${embeddingProgress}%)`,
        embeddingCount,
        estimatedChunks
      };
    }
    
    return { 
      stage: 'uploading', 
      progress: 10, 
      label: 'Uploading...',
      embeddingCount: 0,
      estimatedChunks: 0
    };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500";
      case "processing":
        return "bg-blue-500";
      case "queued":
        return "bg-yellow-500";
      case "error":
        return "bg-red-500";
      case "approved":
        return "bg-green-500";
      case "draft":
        return "bg-yellow-500";
      case "deprecated":
        return "bg-gray-500";
      default:
        return "bg-blue-500";
    }
  };

  const getSensitivityColor = (sensitivity: string) => {
    switch (sensitivity) {
      case "confidential":
        return "bg-red-500";
      case "internal":
        return "bg-orange-500";
      case "public":
        return "bg-green-500";
      default:
        return "bg-gray-500";
    }
  };

  const handlePreview = async (doc: Document) => {
    setPreviewDoc(doc);
    setLoadingPreview(true);
    setPreviewUrl(null);
    setPreviewContent(null);

    try {
      // Handle different file types
      if (doc.mime_type?.includes("pdf")) {
        // Generate signed URL for PDF (valid for 1 hour)
        const { data: signedUrlData, error: urlError } = await supabase.storage
          .from("documents")
          .createSignedUrl(doc.storage_path, 3600);

        if (urlError) throw urlError;

        // Open PDF in new tab using signed URL
        window.open(signedUrlData.signedUrl, '_blank');
        toast.success("PDF opened in new tab");
        setPreviewDoc(null);
        setLoadingPreview(false);
      } else if (doc.mime_type?.includes("text") || doc.original_filename.endsWith(".txt") || doc.original_filename.endsWith(".md")) {
        const { data, error } = await supabase.storage
          .from("documents")
          .download(doc.storage_path);

        if (error) throw error;

        const text = await data.text();
        setPreviewContent(text);
        setLoadingPreview(false);
      } else {
        // For other types, offer download
        handleDownload(doc);
        toast.info("File download started");
        setPreviewDoc(null);
        setLoadingPreview(false);
      }
    } catch (error: any) {
      console.error("Error loading preview:", error);
      toast.error("Failed to load file preview");
      setPreviewDoc(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
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
      
      toast.success("Download started");
    } catch (error: any) {
      console.error("Error downloading:", error);
      toast.error("Failed to download file");
    }
  };
  
  const handlePlayMedia = async (doc: Document) => {
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .download(doc.storage_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      setMediaPlayerUrl(url);
      setMediaPlayerDoc(doc);
    } catch (error: any) {
      console.error("Error loading media:", error);
      toast.error("Failed to load media file");
    }
  };

  const closeMediaPlayer = () => {
    if (mediaPlayerUrl) {
      URL.revokeObjectURL(mediaPlayerUrl);
    }
    setMediaPlayerDoc(null);
    setMediaPlayerUrl(null);
  };

  const closePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewDoc(null);
    setPreviewUrl(null);
    setPreviewContent(null);
  };

  const handleDelete = async () => {
    if (!deleteDoc) return;

    setDeleting(true);
    try {
      // Use edge function to handle large document deletion
      const { data, error } = await supabase.functions.invoke(
        'delete-document',
        { 
          body: { documentId: deleteDoc.id }
        }
      );

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to delete document');
      }

      toast.success("File deleted successfully");
      setDeleteDoc(null);
      loadDocuments();
    } catch (error: any) {
      console.error("Error deleting document:", error);
      toast.error("Failed to delete file");
    } finally {
      setDeleting(false);
    }
  };

  const openEditDialog = (doc: Document) => {
    setEditDoc(doc);
    setEditTitle(doc.title);
    setEditStatus(doc.status);
    setEditSensitivity(doc.sensitivity);
    setEditTags(doc.tags?.map(t => t.id) || []);
  };

  const handleGenerateSummary = async (doc: Document) => {
    if (!doc.content_text) {
      toast.error("Document has no text content to summarize");
      return;
    }

    setGeneratingSummary(doc.id);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-summary",
        { body: { documentId: doc.id } }
      );

      if (error) {
        console.error("Summary generation error:", error);
        throw error;
      }

      if (data?.success) {
        toast.success("Summary generated successfully");
        loadDocuments();
      } else {
        throw new Error(data?.error || "Failed to generate summary");
      }
    } catch (error: any) {
      console.error("Error generating summary:", error);
      toast.error(error.message || "Failed to generate summary");
    } finally {
      setGeneratingSummary(null);
    }
  };

  const [resettingDocs, setResettingDocs] = useState(false);
  
  const handleResetStuckDocuments = async () => {
    setResettingDocs(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "reset-stuck-documents",
        { body: {} }
      );

      if (error) {
        console.error("Reset error:", error);
        throw error;
      }

      if (data?.success) {
        toast.success(data.message || "Documents reset successfully");
        loadDocuments();
      } else {
        throw new Error(data?.error || "Failed to reset documents");
      }
    } catch (error: any) {
      console.error("Error resetting documents:", error);
      toast.error(error.message || "Failed to reset stuck files");
    } finally {
      setResettingDocs(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDoc) return;

    setUpdating(true);
    try {
      // Update document record
      // @ts-ignore - Supabase types not yet regenerated
      const { error: updateError } = await supabase
        .from("documents")
        .update({
          title: editTitle,
          status: editStatus,
          sensitivity: editSensitivity,
        })
        .eq("id", editDoc.id);

      if (updateError) throw updateError;

      // Delete existing tags
      // @ts-ignore - Supabase types not yet regenerated
      const { error: deleteTagsError } = await supabase
        .from("document_tags")
        .delete()
        .eq("document_id", editDoc.id);

      if (deleteTagsError) throw deleteTagsError;

      // Insert new tags
      if (editTags.length > 0) {
        const tagInserts = editTags.map(tagId => ({
          document_id: editDoc.id,
          tag_id: tagId,
        }));

        // @ts-ignore - Supabase types not yet regenerated
        const { error: insertTagsError } = await supabase
          .from("document_tags")
          .insert(tagInserts);

        if (insertTagsError) throw insertTagsError;
      }

      toast.success("File updated successfully");
      setEditDoc(null);
      loadDocuments();
    } catch (error: any) {
      console.error("Update error:", error);
      toast.error("Failed to update document");
    } finally {
      setUpdating(false);
    }
  };

  const handleTranslationFileSelect = async (files: File[]) => {
    if (files.length === 0) return;
    
    const file = files[0];
    setTranslationFile(file);
    setTranslationOutput('');
    
    try {
      // Check if file is PDF or DOCX - need to extract text first
      if (file.type === 'application/pdf' || 
          file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        
        setTranslating(true);
        toast.info('Extracting text from document...');

        // Upload file to storage temporarily
        const filePath = `temp/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Extract text using edge function
        const { data: extractData, error: extractError } = await supabase.functions.invoke(
          'extract-document-text',
          {
            body: { filePath, bucketName: 'documents', mimeType: file.type }
          }
        );

        // Clean up temp file
        await supabase.storage.from('documents').remove([filePath]);

        if (extractError) throw extractError;
        
        if (!extractData?.success || !extractData?.text) {
          throw new Error('Failed to extract text from document');
        }

        setTranslationInput(extractData.text);
        toast.success('Text extracted successfully');
        setTranslating(false);
      } else {
        // For text files, read directly
        const text = await file.text();
        setTranslationInput(text);
        toast.success('File loaded successfully');
      }
    } catch (error) {
      console.error('Error reading file:', error);
      toast.error('Failed to process file');
      setTranslating(false);
    }
  };

  const handleTranslate = async () => {
    if (!translationInput.trim()) {
      toast.error('Please enter or upload text to translate');
      return;
    }

    if (sourceLanguage === targetLanguage) {
      toast.error('Source and target languages must be different');
      return;
    }

    setTranslating(true);
    try {
      const { data, error } = await supabase.functions.invoke('translate-document', {
        body: { 
          text: translationInput,
          sourceLanguage,
          targetLanguage
        }
      });

      if (error) throw error;

      if (data?.success) {
        setTranslationOutput(data.translatedText);
        toast.success('Translation completed successfully');
      } else {
        throw new Error(data?.error || 'Translation failed');
      }
    } catch (error: any) {
      console.error('Translation error:', error);
      toast.error(error.message || 'Failed to translate text');
    } finally {
      setTranslating(false);
    }
  };

  const handleDownloadTranslation = () => {
    if (!translationOutput) return;

    const blob = new Blob([translationOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = translationFile 
      ? `translated_${translationFile.name}` 
      : 'translation.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Download started');
  };

  const swapLanguages = () => {
    // Swap languages
    const tempLang = sourceLanguage;
    setSourceLanguage(targetLanguage);
    setTargetLanguage(tempLang);
    // Swap input and output
    const temp = translationInput;
    setTranslationInput(translationOutput);
    setTranslationOutput(temp);
  };

  const handleExtractMetadata = async (doc: Document) => {
    setExtractingMetadata(doc.id);
    try {
      const { data, error } = await supabase.functions.invoke('extract-metadata', {
        body: { documentId: doc.id }
      });

      if (error) throw error;

      if (data?.success) {
        setEnrichedMetadata(data.metadata);
        setMetadataDialogDoc(doc);
        toast.success('Metadata extracted and tags assigned');
        // Refetch documents to show newly assigned tags
        await loadDocuments();
      } else {
        throw new Error(data?.error || 'Failed to extract metadata');
      }
    } catch (error: any) {
      console.error('Metadata extraction error:', error);
      toast.error(error.message || 'Failed to extract metadata');
    } finally {
      setExtractingMetadata(null);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">File Management</h1>
          <p className="text-muted-foreground">
            Upload, translate, and manage your files
          </p>
        </div>

        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="upload">
              <Upload className="mr-2 h-4 w-4" />
              Upload Files
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6">
            <Card>
          <CardHeader>
            <CardTitle>Upload Files</CardTitle>
            <CardDescription>
              Drag and drop a file or click to browse
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-4">
              <DropZone
                onFilesSelected={handleFilesSelected}
                accept=".pdf,.doc,.docx,.txt,.md,.csv,.jpg,.jpeg,.png,.mp3,.wav,.webm,.ogg,.m4a,.mp4,.mpeg,.mov,.avi"
                maxFiles={10}
                currentFiles={files}
                onRemoveFile={handleRemoveFile}
              />
              
              {files.length === 1 && (
                <div className="space-y-2">
                  <Label htmlFor="title">Document Title (Optional)</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Leave empty to use filename"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="category">Category (Optional)</Label>
                <Select 
                  value={selectedCategory || "none"} 
                  onValueChange={(value) => {
                    const newCategory = value === "none" ? "" : value;
                    setSelectedCategory(newCategory);
                    setSelectedFolderId(""); // Reset folder when category changes
                  }}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select a category">
                      {selectedCategory ? (
                        <div className="flex items-center">
                          <FolderTree className="mr-2 h-4 w-4" />
                          {selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)}
                        </div>
                      ) : (
                        "Select a category"
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="contracts">Contracts</SelectItem>
                    <SelectItem value="legal">Legal</SelectItem>
                    <SelectItem value="accounting">Accounting</SelectItem>
                    <SelectItem value="hr">HR</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="folder">Folder (Optional)</Label>
                <Select 
                  value={selectedFolderId || "none"} 
                  onValueChange={(value) => setSelectedFolderId(value === "none" ? "" : value)}
                  disabled={!selectedCategory && availableFolders.length === 0}
                >
                  <SelectTrigger id="folder">
                    <SelectValue placeholder={selectedCategory ? "Select a folder" : "Select category first"}>
                      {selectedFolderId ? (
                        <div className="flex items-center">
                          <FolderTree className="mr-2 h-4 w-4" />
                          {availableFolders.find(f => f.id === selectedFolderId)?.name}
                        </div>
                      ) : (
                        selectedCategory ? "Select a folder" : "Select category first"
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {availableFolders
                      .filter(folder => !selectedCategory || folder.category === selectedCategory)
                      .map(folder => (
                        <SelectItem key={folder.id} value={folder.id}>
                          <div className="flex items-center gap-2">
                            {folder.color && (
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: folder.color }}
                              />
                            )}
                            {folder.name}
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tags (Optional)</Label>
                <div className="flex flex-wrap gap-2 p-2 border rounded-md min-h-[40px]">
                  {availableTags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant={selectedTags.includes(tag.id) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedTags(prev =>
                          prev.includes(tag.id)
                            ? prev.filter(id => id !== tag.id)
                            : [...prev, tag.id]
                        );
                      }}
                    >
                      <TagIcon className="mr-1 h-3 w-3" />
                      {tag.name}
                    </Badge>
                  ))}
                  {availableTags.length === 0 && (
                    <span className="text-sm text-muted-foreground">
                      No tags available. Ask an admin to create tags.
                    </span>
                  )}
                </div>
              </div>
              <Button type="submit" disabled={uploading || files.length === 0} className="w-full">
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload {files.length > 0 ? `${files.length} Document${files.length > 1 ? 's' : ''}` : 'Documents'}
                  </>
                )}
              </Button>
              
              <Button 
                type="button" 
                variant="outline" 
                disabled={resettingDocs} 
                onClick={handleResetStuckDocuments}
                className="w-full"
              >
                {resettingDocs ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Reset Stuck Files
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

         <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Recently Uploaded</h2>
              <p className="text-sm text-muted-foreground">
                Organize and manage your files by category and folder
              </p>
            </div>
            <Button onClick={() => setShowSplitter(true)} variant="outline">
              <Scissors className="mr-2 h-4 w-4" />
              Split Large PDF
            </Button>
            </div>
          </div>

          {documents.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No files yet</p>
              </CardContent>
            </Card>
          ) : (
            <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {documents.map((doc) => {
                const processingStatus = getProcessingStatus(doc);
                const isReady = processingStatus.stage === 'complete';
                return (
                  <Card 
                    key={doc.id} 
                    className="hover:shadow-md transition-shadow"
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex gap-1">
                          <Badge className={getStatusColor(doc.status)}>
                            {doc.status}
                          </Badge>
                          <Badge className={getSensitivityColor(doc.sensitivity)}>
                            {doc.sensitivity}
                          </Badge>
                        </div>
                      </div>
                      <CardTitle className="text-lg mt-2">{doc.title}</CardTitle>
                      <CardDescription className="text-xs">
                        {doc.original_filename}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {processingStatus.stage !== 'complete' ? (
                        <div className="space-y-2 p-3 bg-muted/30 rounded-lg border border-border/50">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                              <span className="text-xs font-medium">{processingStatus.label}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{processingStatus.progress}%</span>
                          </div>
                          <Progress value={processingStatus.progress} className="h-1.5" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 p-2 bg-green-500/10 rounded-lg border border-green-500/20">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          <span className="text-xs font-medium text-green-700">File ready</span>
                        </div>
                      )}
                      {doc.summary && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground">AI Summary</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                const newHidden = new Set(hiddenSummaries);
                                if (newHidden.has(doc.id)) {
                                  newHidden.delete(doc.id);
                                } else {
                                  newHidden.add(doc.id);
                                }
                                setHiddenSummaries(newHidden);
                              }}
                              className="h-6 px-2"
                            >
                              {hiddenSummaries.has(doc.id) ? (
                                <>
                                  <Eye className="h-3 w-3 mr-1" />
                                  Show
                                </>
                              ) : (
                                <>
                                  <EyeOff className="h-3 w-3 mr-1" />
                                  Hide
                                </>
                              )}
                            </Button>
                          </div>
                          {!hiddenSummaries.has(doc.id) && (
                            <div className="bg-muted/50 p-3 rounded-md border border-border">
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                {doc.summary}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(doc.created_at), "MMM d, yyyy")}
                      </div>
                      {doc.tags && doc.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {doc.tags.map((tag) => (
                            <Badge key={tag.id} variant="secondary" className="text-xs">
                              <TagIcon className="mr-1 h-2.5 w-2.5" />
                              {tag.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                      
                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
                        {/* Show Play button for audio/video files */}
                        {(doc.mime_type?.startsWith('audio/') || doc.mime_type?.startsWith('video/')) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePlayMedia(doc)}
                            disabled={!isReady}
                            className="flex-1"
                          >
                            <Play className="mr-1 h-3.5 w-3.5" />
                            Play
                          </Button>
                        )}
                        {/* Hide Chat for audio/video files */}
                        {!doc.mime_type?.startsWith('audio/') && !doc.mime_type?.startsWith('video/') && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/document-chat/${doc.id}`)}
                            disabled={!isReady}
                            className="flex-1"
                          >
                            <MessageSquare className="mr-1 h-3.5 w-3.5" />
                            Chat
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleGenerateSummary(doc)}
                          disabled={!isReady || !!doc.summary || generatingSummary === doc.id}
                          className="flex-1"
                        >
                          {generatingSummary === doc.id ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="mr-1 h-3.5 w-3.5" />
                          )}
                          Summary
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleExtractMetadata(doc)}
                          disabled={!isReady || extractingMetadata === doc.id}
                          className="flex-1"
                        >
                          {extractingMetadata === doc.id ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Database className="mr-1 h-3.5 w-3.5" />
                          )}
                          Metadata
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(doc)}
                          className="flex-1"
                        >
                          <Download className="mr-1 h-3.5 w-3.5" />
                          Download
                        </Button>
                        {/* Word document edit button */}
                        {isWordDocument(doc.mime_type, doc.original_filename) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setWordEditorDoc(doc)}
                            disabled={!isReady}
                            title="Edit document content"
                          >
                            <FileEdit className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(doc)}
                          title="Edit metadata"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeleteDoc(doc)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalCount > ITEMS_PER_PAGE && (
              <div className="mt-8 flex justify-center">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                    
                    {Array.from({ length: Math.ceil(totalCount / ITEMS_PER_PAGE) }, (_, i) => i + 1)
                      .filter(page => {
                        // Show first page, last page, current page, and pages around current
                        const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
                        return (
                          page === 1 ||
                          page === totalPages ||
                          (page >= currentPage - 1 && page <= currentPage + 1)
                        );
                      })
                      .map((page, idx, arr) => {
                        // Add ellipsis if there's a gap
                        const prevPage = arr[idx - 1];
                        const showEllipsis = prevPage && page - prevPage > 1;
                        
                        return (
                          <span key={`page-${page}`}>
                            {showEllipsis && (
                              <PaginationItem>
                                <span className="px-4">...</span>
                              </PaginationItem>
                            )}
                            <PaginationItem>
                              <PaginationLink
                                onClick={() => setCurrentPage(page)}
                                isActive={currentPage === page}
                                className="cursor-pointer"
                              >
                                {page}
                              </PaginationLink>
                            </PaginationItem>
                          </span>
                        );
                      })}
                    
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / ITEMS_PER_PAGE), p + 1))}
                        className={currentPage >= Math.ceil(totalCount / ITEMS_PER_PAGE) ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}

            {/* Showing info */}
            {totalCount > 0 && (
              <div className="mt-4 text-center text-sm text-muted-foreground">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount} documents
              </div>
            )}
            </>
          )}
          </TabsContent>

        </Tabs>
      </div>

      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{previewDoc?.title}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => previewDoc && handleDownload(previewDoc)}
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </DialogTitle>
          </DialogHeader>
          {loadingPreview ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : previewContent ? (
            <ScrollArea className="h-[60vh] w-full rounded-md border p-4">
              <pre className="whitespace-pre-wrap text-sm font-mono">{previewContent}</pre>
            </ScrollArea>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editDoc} onOpenChange={(open) => !open && setEditDoc(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit File</DialogTitle>
            <DialogDescription>
              Update file information and metadata
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Document Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Enter document title"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-status">Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger id="edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="deprecated">Deprecated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-sensitivity">Sensitivity</Label>
                <Select value={editSensitivity} onValueChange={setEditSensitivity}>
                  <SelectTrigger id="edit-sensitivity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="confidential">Confidential</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2 p-2 border rounded-md min-h-[40px]">
                {availableTags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant={editTags.includes(tag.id) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => {
                      setEditTags(prev =>
                        prev.includes(tag.id)
                          ? prev.filter(id => id !== tag.id)
                          : [...prev, tag.id]
                      );
                    }}
                  >
                    <TagIcon className="mr-1 h-3 w-3" />
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDoc(null)}
                disabled={updating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updating}>
                {updating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteDoc} onOpenChange={(open) => !open && setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteDoc?.title}"? This action cannot be undone and will permanently remove the document from storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PDF Splitter Dialog */}
      <PDFSplitter 
        open={showSplitter} 
        onOpenChange={setShowSplitter}
        onComplete={loadDocuments}
      />

      {/* Enriched Metadata Dialog */}
      <EnrichedMetadataDialog
        open={!!metadataDialogDoc}
        onOpenChange={(open) => !open && setMetadataDialogDoc(null)}
        metadata={enrichedMetadata}
        documentTitle={metadataDialogDoc?.title || ''}
      />

      {/* Audio/Video Player Dialog */}
      <Dialog open={!!mediaPlayerDoc} onOpenChange={(open) => !open && closeMediaPlayer()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{mediaPlayerDoc?.title}</DialogTitle>
            <DialogDescription>{mediaPlayerDoc?.original_filename}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center bg-muted/30 rounded-lg p-4 max-h-[70vh] overflow-hidden">
            {mediaPlayerUrl && mediaPlayerDoc?.mime_type?.startsWith('audio/') && (
              <audio 
                controls 
                className="w-full max-w-2xl"
                autoPlay
              >
                <source src={mediaPlayerUrl} type={mediaPlayerDoc.mime_type} />
                Your browser does not support the audio element.
              </audio>
            )}
            {mediaPlayerUrl && mediaPlayerDoc?.mime_type?.startsWith('video/') && (
              <video 
                controls 
                className="w-full max-h-[60vh] rounded-lg object-contain"
                autoPlay
              >
                <source src={mediaPlayerUrl} type={mediaPlayerDoc.mime_type} />
                Your browser does not support the video element.
              </video>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Word Editor Dialog */}
      <WordEditorDialog
        open={!!wordEditorDoc}
        onOpenChange={(open) => !open && setWordEditorDoc(null)}
        document={wordEditorDoc}
        onSave={loadDocuments}
      />
    </Layout>
  );
};

export default Documents;