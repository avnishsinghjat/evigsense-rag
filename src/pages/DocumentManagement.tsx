import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Eye, Trash2, Sparkles, Edit, Filter, EyeOff, Loader2, History, RotateCcw, CheckSquare, Square, Tag, Plus, X, PenTool, FileSignature, Database, FolderTree, FolderInput, FolderOpen, Grid3x3, List, MessageSquare, Mic, FileEdit, ScanText, Languages, Columns } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PDFEditor } from "@/components/PDFEditor";
import { RequestSignatureDialog } from "@/components/signatures/RequestSignatureDialog";
import { SignatureStatusDialog } from "@/components/signatures/SignatureStatusDialog";
import { MetadataFieldManager } from "@/components/metadata/MetadataFieldManager";
import { DocumentMetadataEditor } from "@/components/metadata/DocumentMetadataEditor";
import { TaxonomyManager } from "@/components/metadata/TaxonomyManager";
import { AssignTaxonomiesDialog } from "@/components/metadata/AssignTaxonomiesDialog";
import { MetadataTemplateManager } from "@/components/metadata/MetadataTemplateManager";
import { ApplyTemplateDialog } from "@/components/metadata/ApplyTemplateDialog";
import { FolderTree as FolderTreeComponent } from "@/components/folders/FolderTree";
import { FolderDialog } from "@/components/folders/FolderDialog";
import { MoveFolderDialog } from "@/components/folders/MoveFolderDialog";
import { AudioVideoViewer } from "@/components/AudioVideoViewer";
import { WordEditorDialog } from "@/components/documents/WordEditorDialog";
import { cn } from "@/lib/utils";

interface Document {
  id: string;
  title: string;
  original_filename: string;
  storage_path: string;
  mime_type: string | null;
  created_at: string;
  status: string;
  sensitivity: string;
  summary?: string;
  content_text?: string | null;
  is_editable?: boolean;
  folder_id?: string | null;
  tags?: { tag_id: string; tags: { name: string; type: string | null } }[];
  metadata?: DocumentMetadata[];
}

interface DocumentMetadata {
  field_id: string;
  value: string;
  metadata_field_definitions: {
    label: string;
    field_type: string;
  };
}

interface FolderData {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  parent_id: string | null;
}

interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  title: string;
  content_text: string | null;
  summary: string | null;
  storage_path: string;
  original_filename: string;
  mime_type: string | null;
  status: string;
  sensitivity: string;
  created_at: string;
  created_by: string;
  change_description: string | null;
}

interface TagData {
  id: string;
  name: string;
  type: string | null;
  created_at: string;
}

interface CategoryData {
  id: string;
  name: string;
  description: string;
}

export default function DocumentManagement() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [editForm, setEditForm] = useState({ title: "", status: "", sensitivity: "" });
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [hiddenSummaries, setHiddenSummaries] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"date" | "title" | "status">("date");
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<string | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [bulkSensitivityDialogOpen, setBulkSensitivityDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkSensitivity, setBulkSensitivity] = useState("");
  const [allTags, setAllTags] = useState<TagData[]>([]);
  const [tagManagementDialogOpen, setTagManagementDialogOpen] = useState(false);
  const [assignTagsDialogOpen, setAssignTagsDialogOpen] = useState(false);
  const [documentForTagAssignment, setDocumentForTagAssignment] = useState<Document | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [newTagType, setNewTagType] = useState("");
  const [editingTag, setEditingTag] = useState<TagData | null>(null);
  const [editTagName, setEditTagName] = useState("");
  const [editTagType, setEditTagType] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [pdfEditorOpen, setPdfEditorOpen] = useState(false);
  const [editingPdf, setEditingPdf] = useState<Document | null>(null);
  const [requestSignatureDialogOpen, setRequestSignatureDialogOpen] = useState(false);
  const [signatureStatusDialogOpen, setSignatureStatusDialogOpen] = useState(false);
  const [selectedDocumentForSignature, setSelectedDocumentForSignature] = useState<Document | null>(null);
  const [metadataFieldManagerOpen, setMetadataFieldManagerOpen] = useState(false);
  const [taxonomyManagerOpen, setTaxonomyManagerOpen] = useState(false);
  const [documentMetadataEditorOpen, setDocumentMetadataEditorOpen] = useState(false);
  const [selectedDocumentForMetadata, setSelectedDocumentForMetadata] = useState<Document | null>(null);
  const [assignTaxonomiesDialogOpen, setAssignTaxonomiesDialogOpen] = useState(false);
  const [selectedDocumentForTaxonomy, setSelectedDocumentForTaxonomy] = useState<Document | null>(null);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [applyTemplateDialogOpen, setApplyTemplateDialogOpen] = useState(false);
  const [selectedDocumentForTemplate, setSelectedDocumentForTemplate] = useState<Document | null>(null);
  
  // Folder management states
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState<"create" | "edit">("create");
  const [parentFolderId, setParentFolderId] = useState<string | null>(null);
  const [editingFolder, setEditingFolder] = useState<FolderData | null>(null);
  
  // Audio/Video preview states
  const [audioVideoPreviewOpen, setAudioVideoPreviewOpen] = useState(false);
  const [audioVideoPreviewDoc, setAudioVideoPreviewDoc] = useState<Document | null>(null);
  const [audioVideoUrl, setAudioVideoUrl] = useState<string | null>(null);
  const [audioVideoTranscription, setAudioVideoTranscription] = useState<string | null>(null);
  const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const [moveFolderDialogOpen, setMoveFolderDialogOpen] = useState(false);
  const [folderRefreshTrigger, setFolderRefreshTrigger] = useState(0);
  const [draggedDocumentId, setDraggedDocumentId] = useState<string | null>(null);
  const [showFolderSidebar, setShowFolderSidebar] = useState(true);
  
  // View mode state
  const [viewMode, setViewMode] = useState<'tile' | 'list'>('list');
  const [expandedDocumentId, setExpandedDocumentId] = useState<string | null>(null);
  
  // Quick category creation
  const [quickCategoryDialogOpen, setQuickCategoryDialogOpen] = useState(false);
  const [quickCategoryName, setQuickCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  
  // Audio transcription state
  const [transcribingIds, setTranscribingIds] = useState<Set<string>>(new Set());
  
  // Word editor state
  const [wordEditorDoc, setWordEditorDoc] = useState<Document | null>(null);
  
  // Helper to check if file is a Word document
  const isWordDocument = (mimeType: string | null, filename: string) => {
    const wordMimeTypes = [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const wordExtensions = ['.doc', '.docx'];
    
    if (mimeType && wordMimeTypes.includes(mimeType)) return true;
    return wordExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  };

  useEffect(() => {
    loadDocuments();
    loadTags();
    loadCategories();
    
    // Real-time updates for tags
    const tagsChannel = supabase
      .channel('tags-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tags'
        },
        () => {
          loadTags();
          loadCategories();
        }
      )
      .subscribe();

    // Real-time updates for document tags
    const docTagsChannel = supabase
      .channel('document-tags-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'document_tags'
        },
        () => {
          loadDocuments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tagsChannel);
      supabase.removeChannel(docTagsChannel);
    };
  }, []);

  const loadDocuments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("documents")
        .select(`
          *,
          tags:document_tags(
            tag_id,
            tags(name, type)
          ),
          metadata:document_metadata(
            field_id,
            value,
            metadata_field_definitions(label, field_type)
          )
        `)
        .eq("created_by", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
      
      // Initialize all summaries as hidden by default
      const allDocIds = new Set((data || []).map((doc: Document) => doc.id));
      setHiddenSummaries(allDocIds);
    } catch (error) {
      console.error("Error loading documents:", error);
      toast.error("Failed to load files");
    } finally {
      setLoading(false);
    }
  };

  const loadTags = async () => {
    try {
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .order("name");

      if (error) throw error;
      setAllTags(data || []);
    } catch (error) {
      console.error("Error loading tags:", error);
      toast.error("Failed to load tags");
    }
  };

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("tags")
        .select("type")
        .not("type", "is", null)
        .order("type");

      if (error) throw error;
      
      // Get unique tag types (case-insensitive)
      const uniqueTypesLower = Array.from(new Set(data?.map(t => t.type?.toLowerCase()).filter(Boolean) || []));
      const categoriesData: CategoryData[] = uniqueTypesLower.map(type => ({
        id: type!,
        name: type!.toUpperCase(),
        description: `${type} documents`
      }));
      
      setCategories(categoriesData);
      
      // Set first category as active if none selected, or keep empty to show all
      if (categoriesData.length > 0 && !activeCategory) {
        setActiveCategory(categoriesData[0].id);
      } else if (categoriesData.length === 0) {
        // If no categories exist, clear the active category to show all documents
        setActiveCategory("");
      }
    } catch (error) {
      console.error("Error loading categories:", error);
      toast.error("Failed to load categories");
    }
  };

  const getCategoryDocuments = (categoryId: string) => {
    let filtered = documents.filter((doc) => {
      const tagTypes = doc.tags?.map((t) => t.tags.type?.toLowerCase()) || [];
      // If no category is selected or category is empty, show all documents
      const matchesCategory = !categoryId ? true : tagTypes.includes(categoryId);
      const matchesFolder = selectedFolderId === null ? true : doc.folder_id === selectedFolderId;
      return matchesCategory && matchesFolder;
    });

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter((doc) =>
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.original_filename.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((doc) => doc.status === statusFilter);
    }

    // Apply tag filter
    if (tagFilter !== "all") {
      filtered = filtered.filter((doc) => {
        const tagIds = doc.tags?.map((t) => t.tag_id) || [];
        return tagIds.includes(tagFilter);
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "title":
          return a.title.localeCompare(b.title);
        case "status":
          return a.status.localeCompare(b.status);
        case "date":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return filtered;
  };

  const handlePreview = async (doc: Document) => {
    try {
      // Check if it's audio or video
      if (isAudioOrVideo(doc.mime_type)) {
        const { data, error } = await supabase.storage
          .from("documents")
          .createSignedUrl(doc.storage_path, 3600); // 1 hour for media playback

        if (error) throw error;
        if (data?.signedUrl) {
          // Get transcription from metadata
          const transcriptionField = doc.metadata?.find(
            m => m.metadata_field_definitions.label === 'Audio Transcription'
          );
          
          setAudioVideoUrl(data.signedUrl);
          setAudioVideoPreviewDoc(doc);
          setAudioVideoTranscription(transcriptionField?.value || null);
          setAudioVideoPreviewOpen(true);
        }
      } else {
        // Regular document preview
        const { data, error } = await supabase.storage
          .from("documents")
          .createSignedUrl(doc.storage_path, 60);

        if (error) throw error;
        if (data?.signedUrl) {
          window.open(data.signedUrl, "_blank");
        }
      }
    } catch (error) {
      console.error("Error previewing document:", error);
      toast.error("Failed to preview file");
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .download(doc.storage_path);

      if (error) throw error;
      if (data) {
        const url = URL.createObjectURL(data);
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.original_filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("File downloaded");
      }
    } catch (error) {
      console.error("Error downloading document:", error);
      toast.error("Failed to download file");
    }
  };

  const handleDelete = async () => {
    if (!documentToDelete) return;

    try {
      const doc = documents.find((d) => d.id === documentToDelete);
      if (!doc) return;

      const { error: storageError } = await supabase.storage
        .from("documents")
        .remove([doc.storage_path]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from("documents")
        .delete()
        .eq("id", documentToDelete);

      if (dbError) throw dbError;

      toast.success("File deleted successfully");
      loadDocuments();
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Failed to delete file");
    } finally {
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
    }
  };

  const handleEdit = (doc: Document) => {
    setEditingDocument(doc);
    setEditForm({
      title: doc.title,
      status: doc.status,
      sensitivity: doc.sensitivity,
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingDocument) return;

    try {
      const { error } = await supabase
        .from("documents")
        .update({
          title: editForm.title,
          status: editForm.status,
          sensitivity: editForm.sensitivity,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingDocument.id);

      if (error) throw error;

      toast.success("File updated successfully");
      loadDocuments();
      setEditDialogOpen(false);
    } catch (error) {
      console.error("Error updating document:", error);
      toast.error("Failed to update file");
    }
  };

  const handleGenerateSummary = async (documentId: string) => {
    try {
      setGeneratingIds((prev) => new Set(prev).add(documentId));

      const { data, error } = await supabase.functions.invoke("generate-summary", {
        body: { documentId },
      });

      if (error) throw error;

      if (data?.summary) {
        toast.success("Summary generated successfully");
        loadDocuments();
      }
    } catch (error: any) {
      console.error("Error generating summary:", error);
      toast.error(error.message || "Failed to generate summary");
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(documentId);
        return next;
      });
    }
  };

  const toggleSummaryVisibility = (documentId: string) => {
    setHiddenSummaries((prev) => {
      const next = new Set(prev);
      if (next.has(documentId)) {
        next.delete(documentId);
      } else {
        next.add(documentId);
      }
      return next;
    });
  };

  const isAudioOrVideo = (mimeType: string | null): boolean => {
    if (!mimeType) return false;
    const audioVideoTypes = [
      'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/m4a',
      'video/mp4', 'video/webm', 'video/mpeg', 'video/quicktime', 'video/x-msvideo'
    ];
    return audioVideoTypes.includes(mimeType);
  };

  const handleTranscribeAudio = async (documentId: string) => {
    try {
      setTranscribingIds((prev) => new Set(prev).add(documentId));
      toast.info("Transcribing audio... This may take a moment");

      const { data, error } = await supabase.functions.invoke("transcribe-audio", {
        body: { document_id: documentId },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Audio transcribed successfully!");
        loadDocuments(); // Reload to show new metadata
      }
    } catch (error: any) {
      console.error("Error transcribing audio:", error);
      toast.error(error.message || "Failed to transcribe audio");
    } finally {
      setTranscribingIds((prev) => {
        const next = new Set(prev);
        next.delete(documentId);
        return next;
      });
    }
  };

  const handleEditPDF = (doc: Document) => {
    setEditingPdf(doc);
    setPdfEditorOpen(true);
  };

  const handlePDFSaved = () => {
    loadDocuments();
    setPdfEditorOpen(false);
    setEditingPdf(null);
  };

  const handleRequestSignature = (doc: Document) => {
    setSelectedDocumentForSignature(doc);
    setRequestSignatureDialogOpen(true);
  };

  const handleViewSignatureStatus = (doc: Document) => {
    setSelectedDocumentForSignature(doc);
    setSignatureStatusDialogOpen(true);
  };

  const handleEditMetadata = (doc: Document) => {
    setSelectedDocumentForMetadata(doc);
    setDocumentMetadataEditorOpen(true);
  };

  const handleAssignTaxonomies = (doc: Document) => {
    setSelectedDocumentForTaxonomy(doc);
    setAssignTaxonomiesDialogOpen(true);
  };

  const handleApplyTemplate = (doc: Document) => {
    setSelectedDocumentForTemplate(doc);
    setApplyTemplateDialogOpen(true);
  };

  const handleGenerateMarkdown = (doc: Document) => {
    navigate(`/translation-markdown?documentId=${doc.id}&action=ocr`);
  };

  const handleTranslateDocument = (doc: Document) => {
    navigate(`/translation-markdown?documentId=${doc.id}&action=translate`);
  };

  const handleViewTranslation = (doc: Document) => {
    navigate(`/translation-markdown?documentId=${doc.id}&action=side-by-side`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "archived": return "bg-gray-500/10 text-gray-500 border-gray-500/20";
      case "draft": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "transcribing": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getSensitivityColor = (sensitivity: string) => {
    switch (sensitivity) {
      case "public": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "internal": return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "confidential": return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "restricted": return "bg-red-500/10 text-red-500 border-red-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const handleViewVersions = async (documentId: string) => {
    setSelectedDocumentId(documentId);
    setVersionDialogOpen(true);
    setLoadingVersions(true);

    try {
      const { data, error } = await supabase
        .from("document_versions")
        .select("*")
        .eq("document_id", documentId)
        .order("version_number", { ascending: false });

      if (error) throw error;
      setVersions(data || []);
    } catch (error) {
      console.error("Error loading versions:", error);
      toast.error("Failed to load version history");
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleRestoreVersion = async (version: DocumentVersion) => {
    setRestoringVersion(version.id);

    try {
      const { error } = await supabase
        .from("documents")
        .update({
          title: version.title,
          content_text: version.content_text,
          summary: version.summary,
          status: version.status,
          sensitivity: version.sensitivity,
          updated_at: new Date().toISOString(),
        })
        .eq("id", version.document_id);

      if (error) throw error;

      toast.success(`Document restored to version ${version.version_number}`);
      loadDocuments();
      setVersionDialogOpen(false);
    } catch (error) {
      console.error("Error restoring version:", error);
      toast.error("Failed to restore version");
    } finally {
      setRestoringVersion(null);
    }
  };

  const toggleSelectDocument = (documentId: string) => {
    setSelectedDocuments((prev) => {
      const next = new Set(prev);
      if (next.has(documentId)) {
        next.delete(documentId);
      } else {
        next.add(documentId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const categoryDocs = getCategoryDocuments(activeCategory);
    if (selectedDocuments.size === categoryDocs.length) {
      setSelectedDocuments(new Set());
    } else {
      setSelectedDocuments(new Set(categoryDocs.map((doc) => doc.id)));
    }
  };

  const handleBulkDelete = async () => {
    try {
      const docsToDelete = documents.filter((d) => selectedDocuments.has(d.id));

      // Delete from storage
      const storagePaths = docsToDelete.map((d) => d.storage_path);
      const { error: storageError } = await supabase.storage
        .from("documents")
        .remove(storagePaths);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from("documents")
        .delete()
        .in("id", Array.from(selectedDocuments));

      if (dbError) throw dbError;

      toast.success(`${selectedDocuments.size} document(s) deleted successfully`);
      setSelectedDocuments(new Set());
      loadDocuments();
    } catch (error) {
      console.error("Error deleting documents:", error);
      toast.error("Failed to delete files");
    } finally {
      setBulkDeleteDialogOpen(false);
    }
  };

  const handleBulkStatusChange = async () => {
    try {
      const { error } = await supabase
        .from("documents")
        .update({
          status: bulkStatus,
          updated_at: new Date().toISOString(),
        })
        .in("id", Array.from(selectedDocuments));

      if (error) throw error;

      toast.success(`${selectedDocuments.size} document(s) status updated`);
      setSelectedDocuments(new Set());
      loadDocuments();
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update document status");
    } finally {
      setBulkStatusDialogOpen(false);
      setBulkStatus("");
    }
  };

  const handleBulkSensitivityChange = async () => {
    try {
      const { error } = await supabase
        .from("documents")
        .update({
          sensitivity: bulkSensitivity,
          updated_at: new Date().toISOString(),
        })
        .in("id", Array.from(selectedDocuments));

      if (error) throw error;

      toast.success(`${selectedDocuments.size} document(s) sensitivity updated`);
      setSelectedDocuments(new Set());
      loadDocuments();
    } catch (error) {
      console.error("Error updating sensitivity:", error);
      toast.error("Failed to update document sensitivity");
    } finally {
      setBulkSensitivityDialogOpen(false);
      setBulkSensitivity("");
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      toast.error("Tag name is required");
      return;
    }

    if (!newTagType.trim()) {
      toast.error("Category is required for tag");
      return;
    }

    try {
      const { error } = await supabase
        .from("tags")
        .insert({
          name: newTagName.trim(),
          type: newTagType.trim(),
        });

      if (error) throw error;

      toast.success("Tag created successfully");
      setNewTagName("");
      setNewTagType("");
      loadTags();
    } catch (error) {
      console.error("Error creating tag:", error);
      toast.error("Failed to create tag");
    }
  };

  const handleEditTag = async () => {
    if (!editingTag || !editTagName.trim()) return;

    if (!editTagType.trim()) {
      toast.error("Category is required for tag");
      return;
    }

    try {
      const { error } = await supabase
        .from("tags")
        .update({
          name: editTagName.trim(),
          type: editTagType.trim(),
        })
        .eq("id", editingTag.id);

      if (error) throw error;

      toast.success("Tag updated successfully");
      setEditingTag(null);
      setEditTagName("");
      setEditTagType("");
      loadTags();
    } catch (error) {
      console.error("Error updating tag:", error);
      toast.error("Failed to update tag");
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    try {
      const { error } = await supabase
        .from("tags")
        .delete()
        .eq("id", tagId);

      if (error) throw error;

      toast.success("Tag deleted successfully");
      loadTags();
    } catch (error) {
      console.error("Error deleting tag:", error);
      toast.error("Failed to delete tag");
    }
  };

  const handleAssignTag = async (tagId: string) => {
    if (!documentForTagAssignment) return;

    try {
      // Check if tag is already assigned
      const isAssigned = documentForTagAssignment.tags?.some(t => t.tag_id === tagId);

      if (isAssigned) {
        // Remove tag
        const { error } = await supabase
          .from("document_tags")
          .delete()
          .eq("document_id", documentForTagAssignment.id)
          .eq("tag_id", tagId);

        if (error) throw error;
        toast.success("Tag removed from document");
      } else {
        // Add tag
        const { error } = await supabase
          .from("document_tags")
          .insert({
            document_id: documentForTagAssignment.id,
            tag_id: tagId,
          });

        if (error) throw error;
        toast.success("Tag assigned to document");
      }

      loadDocuments();
    } catch (error) {
      console.error("Error managing tag assignment:", error);
      toast.error("Failed to update tag assignment");
    }
  };

  const openAssignTagsDialog = (doc: Document) => {
    setDocumentForTagAssignment(doc);
    setAssignTagsDialogOpen(true);
  };

  // Folder management functions
  const handleCreateFolder = (parentId: string | null) => {
    setParentFolderId(parentId);
    setFolderDialogMode("create");
    setEditingFolder(null);
    setFolderDialogOpen(true);
  };

  const handleEditFolder = (folder: any) => {
    setEditingFolder(folder);
    setFolderDialogMode("edit");
    setFolderDialogOpen(true);
  };

  const handleFolderSubmit = async (data: { name: string; description: string; color: string; category: string }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (folderDialogMode === "create") {
        // @ts-ignore
        const { error } = await supabase.from("folders").insert({
          name: data.name,
          description: data.description,
          color: data.color,
          category: data.category,
          parent_id: parentFolderId,
          created_by: user.id,
        });

        if (error) throw error;
        toast.success("Folder created successfully");
      } else if (editingFolder) {
        // @ts-ignore
        const { error } = await supabase
          .from("folders")
          .update({
            name: data.name,
            description: data.description,
            color: data.color,
          })
          .eq("id", editingFolder.id);

        if (error) throw error;
        toast.success("Folder updated successfully");
      }

      setFolderRefreshTrigger((prev) => prev + 1);
    } catch (error: any) {
      console.error("Error managing folder:", error);
      toast.error(error.message || "Failed to manage folder");
    }
  };

  const handleDeleteFolder = (folderId: string) => {
    setFolderToDelete(folderId);
    setDeleteFolderDialogOpen(true);
  };

  const confirmDeleteFolder = async () => {
    if (!folderToDelete) return;

    try {
      const { error } = await supabase
        .from("folders")
        .delete()
        .eq("id", folderToDelete);

      if (error) throw error;

      toast.success("Folder deleted successfully");
      setFolderRefreshTrigger(prev => prev + 1);
      loadDocuments();
    } catch (error: any) {
      console.error("Error deleting folder:", error);
      toast.error(error.message || "Failed to delete folder");
    } finally {
      setDeleteFolderDialogOpen(false);
      setFolderToDelete(null);
    }
  };

  const handleDocumentDrop = async (folderId: string | null) => {
    if (!draggedDocumentId) return;

    try {
      const { error } = await supabase
        .from("documents")
        .update({ folder_id: folderId })
        .eq("id", draggedDocumentId);

      if (error) throw error;

      toast.success(folderId ? "Document moved to folder" : "Document moved to root");
      setDraggedDocumentId(null);
      setFolderRefreshTrigger(prev => prev + 1);
      loadDocuments();
    } catch (error: any) {
      console.error("Error moving document:", error);
      toast.error("Failed to move document");
    }
  };

  const handleFolderDrop = async (folderId: string, targetFolderId: string | null) => {
    try {
      const { error } = await supabase
        .from("folders")
        .update({ parent_id: targetFolderId })
        .eq("id", folderId);

      if (error) throw error;

      toast.success("Folder moved successfully");
      setFolderRefreshTrigger((prev) => prev + 1);
    } catch (error: any) {
      console.error("Error moving folder:", error);
      toast.error("Failed to move folder");
    }
  };

  const handleDuplicateFolder = async (folderId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get the folder to duplicate
      const { data: sourceFolder, error: fetchError } = await supabase
        .from("folders")
        .select("*")
        .eq("id", folderId)
        .single();

      if (fetchError) throw fetchError;

      // Create a copy with a new name
      const { error: insertError } = await supabase
        .from("folders")
        .insert({
          name: `${sourceFolder.name} (Copy)`,
          description: sourceFolder.description,
          color: sourceFolder.color,
          parent_id: sourceFolder.parent_id,
          category: sourceFolder.category,
          created_by: user.id,
        });

      if (insertError) throw insertError;

      toast.success("Folder duplicated successfully");
      setFolderRefreshTrigger((prev) => prev + 1);
    } catch (error: any) {
      console.error("Error duplicating folder:", error);
      toast.error("Failed to duplicate folder");
    }
  };

  const handleQuickCategoryCreate = async () => {
    // Client-side validation
    const trimmedName = quickCategoryName.trim();
    
    if (!trimmedName) {
      toast.error("Category name cannot be empty");
      return;
    }
    
    if (trimmedName.length > 50) {
      toast.error("Category name must be less than 50 characters");
      return;
    }
    
    // Check for special characters that could cause issues
    if (!/^[a-zA-Z0-9\s-_]+$/.test(trimmedName)) {
      toast.error("Category name can only contain letters, numbers, spaces, hyphens, and underscores");
      return;
    }
    
    // Check if category already exists
    const existingCategory = categories.find(
      (cat) => cat.name.toLowerCase() === trimmedName.toUpperCase()
    );
    
    if (existingCategory) {
      toast.error("A category with this name already exists");
      return;
    }

    setCreatingCategory(true);
    
    try {
      // Create a sample tag with this type to establish the category
      const { error } = await supabase.from("tags").insert({
        name: `${trimmedName} Sample`,
        type: trimmedName,
      });

      if (error) throw error;

      toast.success(`Category "${trimmedName}" created successfully`);
      setQuickCategoryDialogOpen(false);
      setQuickCategoryName("");
      loadCategories();
      loadTags();
    } catch (error: any) {
      console.error("Error creating category:", error);
      toast.error(error.message || "Failed to create category");
    } finally {
      setCreatingCategory(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading documents...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">File Management</h1>
            <p className="text-muted-foreground mt-2">
              Organize and manage your files by category and folder
            </p>
          </div>
        </div>

        <div className="flex gap-4 items-end flex-wrap bg-muted/30 p-4 rounded-lg border">
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="search" className="text-xs font-medium">Search Files</Label>
            <Input
              id="search"
              placeholder="Search by title or filename..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="w-40">
            <Label htmlFor="status-filter" className="text-xs font-medium">
              <Filter className="inline h-3 w-3 mr-1" />
              Status
            </Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="status-filter" className="h-9">
                <SelectValue />
              </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                  <SelectItem value="transcribing">Transcribing</SelectItem>
                </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Label htmlFor="tag-filter" className="text-xs font-medium">
              <Tag className="inline h-3 w-3 mr-1" />
              Tag
            </Label>
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger id="tag-filter" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tags</SelectItem>
                {allTags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Label htmlFor="sort-by" className="text-xs font-medium">Sort By</Label>
            <Select value={sortBy} onValueChange={(value: "date" | "title" | "status") => setSortBy(value)}>
              <SelectTrigger id="sort-by" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Date (Newest)</SelectItem>
                <SelectItem value="title">Title (A-Z)</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            className="h-9"
            onClick={() => setQuickCategoryDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-2" />
            Quick Category
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setTagManagementDialogOpen(true)}
          >
            <Tag className="h-3.5 w-3.5 mr-2" />
            Tags
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setMetadataFieldManagerOpen(true)}
          >
            <Database className="h-3.5 w-3.5 mr-2" />
            Metadata
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setTaxonomyManagerOpen(true)}
          >
            <FolderTree className="h-3.5 w-3.5 mr-2" />
            Taxonomies
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setTemplateManagerOpen(true)}
          >
            <FileText className="h-3.5 w-3.5 mr-2" />
            Templates
          </Button>
          </div>
          </div>

          {selectedDocuments.size > 0 && (
          <Card className="bg-accent/30 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">
                    {selectedDocuments.size} document{selectedDocuments.size > 1 ? 's' : ''} selected
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMoveFolderDialogOpen(true)}
                  >
                    <FolderInput className="h-4 w-4 mr-2" />
                    Move to Folder
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setBulkDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Selected
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDocuments(new Set())}
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

          <Tabs value={activeCategory} onValueChange={setActiveCategory} className="w-full">
            {categories.length > 0 ? (
              <>
                <TabsList className="grid w-full gap-2 h-auto p-1 bg-muted/50" style={{ gridTemplateColumns: `repeat(${categories.length}, minmax(0, 1fr))` }}>
                  {categories.map((category) => (
                    <TabsTrigger 
                      key={category.id} 
                      value={category.id}
                      className="data-[state=active]:bg-background data-[state=active]:shadow-sm"
                    >
                      {category.name}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {categories.map((category) => (
                  <TabsContent key={category.id} value={category.id} className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Folders Section */}
                <Card className="lg:col-span-1 border-2">
                  <CardHeader className="pb-3 bg-muted/20">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-primary" />
                      Folders
                    </CardTitle>
                    <CardDescription className="text-xs">Organize in {category.name}</CardDescription>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 pt-4">
                    <FolderTreeComponent
                      selectedFolderId={selectedFolderId}
                      onFolderSelect={setSelectedFolderId}
                      onCreateFolder={handleCreateFolder}
                      onEditFolder={handleEditFolder}
                      onDeleteFolder={handleDeleteFolder}
                      onDocumentDrop={handleDocumentDrop}
                      onFolderDrop={handleFolderDrop}
                      onDuplicateFolder={handleDuplicateFolder}
                      refreshTrigger={folderRefreshTrigger}
                      category={category.id}
                    />
                  </CardContent>
                </Card>

                {/* Documents Section */}
                <div className="lg:col-span-3">
                  <Card className="border-2">
                    <CardHeader className="bg-muted/20">
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-primary" />
                          <span>{category.name} Documents</span>
                          <Badge variant="secondary" className="ml-2">
                            {getCategoryDocuments(category.id).length}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant={viewMode === 'tile' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setViewMode('tile')}
                          >
                            <Grid3x3 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant={viewMode === 'list' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setViewMode('list')}
                          >
                            <List className="h-4 w-4" />
                          </Button>
                          {getCategoryDocuments(category.id).length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={toggleSelectAll}
                            >
                              {selectedDocuments.size === getCategoryDocuments(category.id).length ? (
                                <>
                                  <CheckSquare className="h-4 w-4 mr-2" />
                                  Deselect All
                                </>
                              ) : (
                                <>
                                  <Square className="h-4 w-4 mr-2" />
                                  Select All
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </CardTitle>
                      <CardDescription>{category.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                  {getCategoryDocuments(category.id).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No files in this category
                    </div>
                  ) : viewMode === 'tile' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {getCategoryDocuments(category.id).map((doc) => (
                        <Card 
                          key={doc.id}
                          className={cn(
                            "hover:shadow-md transition-all",
                            expandedDocumentId === doc.id && "ring-2 ring-primary"
                          )}
                        >
                          <CardContent className="p-4 space-y-3">
                            <div 
                              className="cursor-pointer"
                              onClick={() => setExpandedDocumentId(expandedDocumentId === doc.id ? null : doc.id)}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleSelectDocument(doc.id);
                                    }}
                                  >
                                    {selectedDocuments.has(doc.id) ? (
                                      <CheckSquare className="h-4 w-4 text-primary" />
                                    ) : (
                                      <Square className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <FileText className="h-5 w-5 text-primary" />
                                </div>
                                <div className="flex gap-1">
                                  <Badge variant="outline" className={getStatusColor(doc.status)}>
                                    {doc.status}
                                  </Badge>
                                  <Badge variant="outline" className={getSensitivityColor(doc.sensitivity)}>
                                    {doc.sensitivity}
                                  </Badge>
                                </div>
                              </div>
                              <div className="mt-2">
                                <h3 className="font-medium text-foreground line-clamp-2">{doc.title}</h3>
                                <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                                  {doc.original_filename}
                                </p>
                              </div>
                              {doc.tags && doc.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {doc.tags.map((tag) => (
                                    <Badge key={tag.tag_id} variant="secondary" className="text-xs">
                                      {tag.tags.name}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {doc.summary && !hiddenSummaries.has(doc.id) && (
                                <div className="bg-muted/50 rounded-md p-2 mt-2">
                                  <p className="text-xs text-muted-foreground line-clamp-3">{doc.summary}</p>
                                </div>
                              )}
                            </div>
                            
                            {expandedDocumentId === doc.id && (
                              <div className="space-y-2 pt-2 border-t">
                                <div className="grid grid-cols-2 gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.open(`/document-chat/${doc.id}`, '_blank')}
                                    className="w-full justify-start"
                                  >
                                    <MessageSquare className="h-3.5 w-3.5 mr-2" />
                                    Chat
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleGenerateSummary(doc.id)}
                                    disabled={generatingIds.has(doc.id)}
                                    className="w-full justify-start"
                                  >
                                    <Sparkles className="h-3.5 w-3.5 mr-2" />
                                    Summary
                                  </Button>
                                  {doc.is_editable && doc.mime_type === "application/pdf" && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleEditPDF(doc)}
                                      className="w-full justify-start"
                                    >
                                      <PenTool className="h-3.5 w-3.5 mr-2" />
                                      Edit PDF
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleGenerateMarkdown(doc)}
                                    className="w-full justify-start"
                                  >
                                    <ScanText className="h-3.5 w-3.5 mr-2" />
                                    Generate Markdown
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleTranslateDocument(doc)}
                                    className="w-full justify-start"
                                  >
                                    <Languages className="h-3.5 w-3.5 mr-2" />
                                    Translate
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleViewTranslation(doc)}
                                    className="w-full justify-start"
                                  >
                                    <Columns className="h-3.5 w-3.5 mr-2" />
                                    View Translation
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openAssignTagsDialog(doc)}
                                    className="w-full justify-start"
                                  >
                                    <Tag className="h-3.5 w-3.5 mr-2" />
                                    Tags
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditMetadata(doc)}
                                    className="w-full justify-start"
                                  >
                                    <Database className="h-3.5 w-3.5 mr-2" />
                                    Metadata
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleViewVersions(doc.id)}
                                    className="w-full justify-start"
                                  >
                                    <History className="h-3.5 w-3.5 mr-2" />
                                    Versions
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEdit(doc)}
                                    className="w-full justify-start"
                                  >
                                    <Edit className="h-3.5 w-3.5 mr-2" />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePreview(doc)}
                                    className="w-full justify-start"
                                  >
                                    <Eye className="h-3.5 w-3.5 mr-2" />
                                    Preview
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDownload(doc)}
                                    className="w-full justify-start"
                                  >
                                    <Download className="h-3.5 w-3.5 mr-2" />
                                    Download
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => {
                                      setDocumentToDelete(doc.id);
                                      setDeleteDialogOpen(true);
                                    }}
                                    className="w-full justify-start col-span-2"
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                                    Delete Document
                                  </Button>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {getCategoryDocuments(category.id).map((doc) => (
                        <Card 
                          key={doc.id}
                          className={cn(
                            "hover:bg-accent/50 transition-colors",
                            expandedDocumentId === doc.id && "ring-2 ring-primary"
                          )}
                        >
                          <CardContent className="p-4">
                            <div 
                              className="flex items-center gap-4 cursor-pointer"
                              onClick={() => setExpandedDocumentId(expandedDocumentId === doc.id ? null : doc.id)}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 flex-shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSelectDocument(doc.id);
                                }}
                              >
                                {selectedDocuments.has(doc.id) ? (
                                  <CheckSquare className="h-5 w-5 text-primary" />
                                ) : (
                                  <Square className="h-5 w-5" />
                                )}
                              </Button>
                              <FileText className="h-8 w-8 text-primary flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-foreground truncate">{doc.title}</h3>
                                <p className="text-sm text-muted-foreground truncate">
                                  {doc.original_filename}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Badge variant="outline" className={getStatusColor(doc.status)}>
                                  {doc.status}
                                </Badge>
                                <Badge variant="outline" className={getSensitivityColor(doc.sensitivity)}>
                                  {doc.sensitivity}
                                </Badge>
                                {doc.tags && doc.tags.length > 0 && (
                                  <Badge variant="secondary">
                                    {doc.tags.length} tag{doc.tags.length > 1 ? 's' : ''}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            
                            {expandedDocumentId === doc.id && (
                              <div className="mt-4 pt-4 border-t">
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.open(`/document-chat/${doc.id}`, '_blank')}
                                  >
                                    <MessageSquare className="h-4 w-4 mr-2" />
                                    Chat with Document
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleGenerateSummary(doc.id)}
                                    disabled={generatingIds.has(doc.id)}
                                  >
                                    {generatingIds.has(doc.id) ? (
                                      <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Generating...
                                      </>
                                    ) : (
                                      <>
                                        <Sparkles className="h-4 w-4 mr-2" />
                                        {doc.summary ? "Regenerate Summary" : "Generate Summary"}
                                      </>
                                    )}
                                  </Button>
                                  {isAudioOrVideo(doc.mime_type) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleTranscribeAudio(doc.id)}
                                      disabled={transcribingIds.has(doc.id)}
                                    >
                                      {transcribingIds.has(doc.id) ? (
                                        <>
                                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                          Transcribing...
                                        </>
                                      ) : (
                                        <>
                                          <Mic className="h-4 w-4 mr-2" />
                                          Extract Audio
                                        </>
                                      )}
                                    </Button>
                                  )}
                                  {doc.is_editable && doc.mime_type === "application/pdf" && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleEditPDF(doc)}
                                    >
                                      <PenTool className="h-4 w-4 mr-2" />
                                      Edit PDF
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleGenerateMarkdown(doc)}
                                  >
                                    <ScanText className="h-4 w-4 mr-2" />
                                    Generate Markdown
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleTranslateDocument(doc)}
                                  >
                                    <Languages className="h-4 w-4 mr-2" />
                                    Translate
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleViewTranslation(doc)}
                                  >
                                    <Columns className="h-4 w-4 mr-2" />
                                    View Translation
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openAssignTagsDialog(doc)}
                                  >
                                    <Tag className="h-4 w-4 mr-2" />
                                    Manage Tags
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditMetadata(doc)}
                                  >
                                    <Database className="h-4 w-4 mr-2" />
                                    Edit Metadata
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleViewVersions(doc.id)}
                                  >
                                    <History className="h-4 w-4 mr-2" />
                                    Version History
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEdit(doc)}
                                  >
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit Info
                                  </Button>
                                  {isWordDocument(doc.mime_type, doc.original_filename) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setWordEditorDoc(doc)}
                                    >
                                      <FileEdit className="h-4 w-4 mr-2" />
                                      Edit Content
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePreview(doc)}
                                  >
                                    <Eye className="h-4 w-4 mr-2" />
                                    Preview
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDownload(doc)}
                                  >
                                    <Download className="h-4 w-4 mr-2" />
                                    Download
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => {
                                      setDocumentToDelete(doc.id);
                                      setDeleteDialogOpen(true);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Document
                                  </Button>
                                </div>
                                
                                {doc.metadata && doc.metadata.length > 0 && (
                                  <div className="mt-4 space-y-2">
                                    <div className="flex items-center gap-2">
                                      <Database className="h-4 w-4 text-primary" />
                                      <span className="text-sm font-medium">Metadata</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 bg-muted/30 rounded-md p-3">
                                      {doc.metadata.map((meta) => (
                                        <div key={meta.field_id} className="space-y-1">
                                          <span className="text-xs font-medium text-muted-foreground">
                                            {meta.metadata_field_definitions.label}
                                          </span>
                                          <p className="text-sm text-foreground">
                                            {meta.value || '-'}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {doc.summary && (
                                  <div className="mt-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <Sparkles className="h-4 w-4 text-primary" />
                                        <span className="text-sm font-medium">AI Summary</span>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => toggleSummaryVisibility(doc.id)}
                                      >
                                        {hiddenSummaries.has(doc.id) ? (
                                          <><Eye className="h-4 w-4 mr-1" /> Show</>
                                        ) : (
                                          <><EyeOff className="h-4 w-4 mr-1" /> Hide</>
                                        )}
                                      </Button>
                                    </div>
                                    {!hiddenSummaries.has(doc.id) && (
                                      <div className="bg-muted/50 rounded-md p-3">
                                        <p className="text-sm text-muted-foreground">{doc.summary}</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                       ))}
                    </div>
                  )}
                  </CardContent>
                </Card>
                </div>
              </div>
            </TabsContent>
          ))}
              </>
            ) : (
              <TabsContent value="" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  {/* Folders Section */}
                  <Card className="lg:col-span-1 border-2">
                    <CardHeader className="pb-3 bg-muted/20">
                      <CardTitle className="text-base flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-primary" />
                        Folders
                      </CardTitle>
                      <CardDescription className="text-xs">Organize your documents</CardDescription>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 pt-4">
                      <FolderTreeComponent
                        selectedFolderId={selectedFolderId}
                        onFolderSelect={setSelectedFolderId}
                        onCreateFolder={handleCreateFolder}
                        onEditFolder={handleEditFolder}
                        onDeleteFolder={handleDeleteFolder}
                        onDocumentDrop={handleDocumentDrop}
                        onFolderDrop={handleFolderDrop}
                        onDuplicateFolder={handleDuplicateFolder}
                        refreshTrigger={folderRefreshTrigger}
                        category={null}
                      />
                    </CardContent>
                  </Card>

                  {/* Documents Section for No Categories */}
                  <div className="lg:col-span-3">
                  <Card className="border-2">
                    <CardHeader className="bg-muted/20">
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-primary" />
                          <span>All Documents</span>
                          <Badge variant="secondary" className="ml-2">
                            {getCategoryDocuments("").length}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant={viewMode === 'tile' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setViewMode('tile')}
                          >
                            <Grid3x3 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant={viewMode === 'list' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setViewMode('list')}
                          >
                            <List className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardTitle>
                      <CardDescription>Create tags with types to organize documents into categories</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                  {getCategoryDocuments("").length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No files found
                    </div>
                  ) : viewMode === 'tile' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {getCategoryDocuments("").map((doc) => (
                        <Card 
                          key={doc.id}
                          className={cn(
                            "hover:shadow-md transition-all",
                            expandedDocumentId === doc.id && "ring-2 ring-primary"
                          )}
                        >
                          <CardContent className="p-4 space-y-3">
                            <div 
                              className="cursor-pointer"
                              onClick={() => setExpandedDocumentId(expandedDocumentId === doc.id ? null : doc.id)}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleSelectDocument(doc.id);
                                    }}
                                  >
                                    {selectedDocuments.has(doc.id) ? (
                                      <CheckSquare className="h-4 w-4 text-primary" />
                                    ) : (
                                      <Square className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <FileText className="h-5 w-5 text-primary" />
                                </div>
                                <div className="flex gap-1">
                                  <Badge variant="outline" className={getStatusColor(doc.status)}>
                                    {doc.status}
                                  </Badge>
                                  <Badge variant="outline" className={getSensitivityColor(doc.sensitivity)}>
                                    {doc.sensitivity}
                                  </Badge>
                                </div>
                              </div>
                              <div className="mt-2">
                                <h3 className="font-medium text-foreground line-clamp-2">{doc.title}</h3>
                                <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                                  {doc.original_filename}
                                </p>
                              </div>
                              {doc.tags && doc.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {doc.tags.map((tag) => (
                                    <Badge key={tag.tag_id} variant="secondary" className="text-xs">
                                      {tag.tags.name}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {doc.summary && !hiddenSummaries.has(doc.id) && (
                                <div className="bg-muted/50 rounded-md p-2 mt-2">
                                  <p className="text-xs text-muted-foreground line-clamp-3">{doc.summary}</p>
                                </div>
                              )}
                            </div>
                            
                            {expandedDocumentId === doc.id && (
                              <div className="space-y-2 pt-2 border-t">
                                <div className="grid grid-cols-2 gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.open(`/document-chat/${doc.id}`, '_blank')}
                                    className="w-full justify-start"
                                  >
                                    <MessageSquare className="h-3.5 w-3.5 mr-2" />
                                    Chat
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleGenerateSummary(doc.id)}
                                    disabled={generatingIds.has(doc.id)}
                                    className="w-full justify-start"
                                  >
                                    {generatingIds.has(doc.id) ? (
                                      <>
                                        <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                                        Generating...
                                      </>
                                    ) : (
                                      <>
                                        <Sparkles className="h-3.5 w-3.5 mr-2" />
                                        {doc.summary ? "Regenerate" : "Summary"}
                                      </>
                                    )}
                                  </Button>
                                  {doc.is_editable && doc.mime_type === "application/pdf" && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleEditPDF(doc)}
                                      className="w-full justify-start"
                                    >
                                      <PenTool className="h-3.5 w-3.5 mr-2" />
                                      Edit PDF
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleGenerateMarkdown(doc)}
                                    className="w-full justify-start"
                                  >
                                    <ScanText className="h-3.5 w-3.5 mr-2" />
                                    Generate Markdown
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleTranslateDocument(doc)}
                                    className="w-full justify-start"
                                  >
                                    <Languages className="h-3.5 w-3.5 mr-2" />
                                    Translate
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleViewTranslation(doc)}
                                    className="w-full justify-start"
                                  >
                                    <Columns className="h-3.5 w-3.5 mr-2" />
                                    View Translation
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openAssignTagsDialog(doc)}
                                    className="w-full justify-start"
                                  >
                                    <Tag className="h-3.5 w-3.5 mr-2" />
                                    Tags
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditMetadata(doc)}
                                    className="w-full justify-start"
                                  >
                                    <Database className="h-3.5 w-3.5 mr-2" />
                                    Metadata
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleViewVersions(doc.id)}
                                    className="w-full justify-start"
                                  >
                                    <History className="h-3.5 w-3.5 mr-2" />
                                    Versions
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePreview(doc)}
                                    className="w-full justify-start"
                                  >
                                    <Eye className="h-3.5 w-3.5 mr-2" />
                                    Preview
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDownload(doc)}
                                    className="w-full justify-start"
                                  >
                                    <Download className="h-3.5 w-3.5 mr-2" />
                                    Download
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEdit(doc)}
                                    className="w-full justify-start"
                                  >
                                    <Edit className="h-3.5 w-3.5 mr-2" />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => {
                                      setDocumentToDelete(doc.id);
                                      setDeleteDialogOpen(true);
                                    }}
                                    className="w-full justify-start"
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                                    Delete
                                  </Button>
                                </div>
                                
                                {doc.summary && (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <Sparkles className="h-4 w-4 text-primary" />
                                        <span className="text-sm font-medium">AI Summary</span>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => toggleSummaryVisibility(doc.id)}
                                      >
                                        {hiddenSummaries.has(doc.id) ? (
                                          <><Eye className="h-4 w-4 mr-1" /> Show</>
                                        ) : (
                                          <><EyeOff className="h-4 w-4 mr-1" /> Hide</>
                                        )}
                                      </Button>
                                    </div>
                                    {!hiddenSummaries.has(doc.id) && (
                                      <div className="bg-muted/50 rounded-md p-3">
                                        <p className="text-sm text-muted-foreground">{doc.summary}</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {getCategoryDocuments("").map((doc) => (
                        <Card key={doc.id} className={cn(
                          "hover:shadow-sm transition-all",
                          selectedDocuments.has(doc.id) && "ring-2 ring-primary"
                        )}>
                          <CardContent className="p-4">
                            <div className="flex items-center gap-4">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => toggleSelectDocument(doc.id)}
                              >
                                {selectedDocuments.has(doc.id) ? (
                                  <CheckSquare className="h-4 w-4 text-primary" />
                                ) : (
                                  <Square className="h-4 w-4" />
                                )}
                              </Button>
                              <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                              <div className="flex-1 min-w-0 space-y-1">
                                <h3 className="font-medium truncate">{doc.title}</h3>
                                <p className="text-xs text-muted-foreground truncate">
                                  {doc.original_filename}
                                </p>
                                {doc.tags && doc.tags.length > 0 && (
                                  <div className="flex gap-1 flex-wrap">
                                    {doc.tags.map((tagRelation) => (
                                      <Badge key={tagRelation.tag_id} variant="secondary" className="text-xs">
                                        {tagRelation.tags.name}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Badge variant="outline" className={getStatusColor(doc.status)}>
                                  {doc.status}
                                </Badge>
                                <Badge variant="outline" className={getSensitivityColor(doc.sensitivity)}>
                                  {doc.sensitivity}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => setExpandedDocumentId(expandedDocumentId === doc.id ? null : doc.id)}
                                  title="More actions"
                                >
                                  {expandedDocumentId === doc.id ? (
                                    <X className="h-4 w-4" />
                                  ) : (
                                    <Plus className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </div>
                            
                            {expandedDocumentId === doc.id && (
                              <div className="mt-4 pt-4 border-t">
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.open(`/document-chat/${doc.id}`, '_blank')}
                                  >
                                    <MessageSquare className="h-4 w-4 mr-2" />
                                    Chat with Document
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleGenerateSummary(doc.id)}
                                    disabled={generatingIds.has(doc.id)}
                                  >
                                    {generatingIds.has(doc.id) ? (
                                      <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Generating...
                                      </>
                                    ) : (
                                      <>
                                        <Sparkles className="h-4 w-4 mr-2" />
                                        {doc.summary ? "Regenerate Summary" : "Generate Summary"}
                                      </>
                                    )}
                                  </Button>
                                  {doc.is_editable && doc.mime_type === "application/pdf" && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleEditPDF(doc)}
                                    >
                                      <PenTool className="h-4 w-4 mr-2" />
                                      Edit PDF
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleGenerateMarkdown(doc)}
                                  >
                                    <ScanText className="h-4 w-4 mr-2" />
                                    Generate Markdown
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleTranslateDocument(doc)}
                                  >
                                    <Languages className="h-4 w-4 mr-2" />
                                    Translate
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleViewTranslation(doc)}
                                  >
                                    <Columns className="h-4 w-4 mr-2" />
                                    View Translation
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openAssignTagsDialog(doc)}
                                  >
                                    <Tag className="h-4 w-4 mr-2" />
                                    Manage Tags
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditMetadata(doc)}
                                  >
                                    <Database className="h-4 w-4 mr-2" />
                                    Edit Metadata
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleViewVersions(doc.id)}
                                  >
                                    <History className="h-4 w-4 mr-2" />
                                    Version History
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEdit(doc)}
                                  >
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit Info
                                  </Button>
                                  {isWordDocument(doc.mime_type, doc.original_filename) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setWordEditorDoc(doc)}
                                    >
                                      <FileEdit className="h-4 w-4 mr-2" />
                                      Edit Content
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePreview(doc)}
                                  >
                                    <Eye className="h-4 w-4 mr-2" />
                                    Preview
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDownload(doc)}
                                  >
                                    <Download className="h-4 w-4 mr-2" />
                                    Download
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => {
                                      setDocumentToDelete(doc.id);
                                      setDeleteDialogOpen(true);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Document
                                  </Button>
                                </div>
                                
                                {doc.summary && (
                                  <div className="mt-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <Sparkles className="h-4 w-4 text-primary" />
                                        <span className="text-sm font-medium">AI Summary</span>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => toggleSummaryVisibility(doc.id)}
                                      >
                                        {hiddenSummaries.has(doc.id) ? (
                                          <><Eye className="h-4 w-4 mr-1" /> Show</>
                                        ) : (
                                          <><EyeOff className="h-4 w-4 mr-1" /> Hide</>
                                        )}
                                      </Button>
                                    </div>
                                    {!hiddenSummaries.has(doc.id) && (
                                      <div className="bg-muted/50 rounded-md p-3">
                                        <p className="text-sm text-muted-foreground">{doc.summary}</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                     </CardContent>
                   </Card>
                   </div>
                 </div>
               </TabsContent>
            )}
          </Tabs>
        </div>

      <Dialog open={bulkStatusDialogOpen} onOpenChange={setBulkStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Status for Selected Files</DialogTitle>
            <DialogDescription>
              Update the status for {selectedDocuments.size} selected file(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="bulk-status">New Status</Label>
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger id="bulk-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkStatusChange}>Update Status</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkSensitivityDialogOpen} onOpenChange={setBulkSensitivityDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Sensitivity for Selected Files</DialogTitle>
            <DialogDescription>
              Update the sensitivity level for {selectedDocuments.size} selected file(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="bulk-sensitivity">New Sensitivity</Label>
              <Select value={bulkSensitivity} onValueChange={setBulkSensitivity}>
                <SelectTrigger id="bulk-sensitivity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="confidential">Confidential</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkSensitivityDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkSensitivityChange}>Update Sensitivity</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedDocuments.size} selected document(s). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this file? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={versionDialogOpen} onOpenChange={setVersionDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
            <DialogDescription>
              View and restore previous versions of this document
            </DialogDescription>
          </DialogHeader>
          
          {loadingVersions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No previous versions found
            </div>
          ) : (
            <div className="space-y-4">
              {versions.map((version, index) => (
                <Card key={version.id} className="relative">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono">
                            v{version.version_number}
                          </Badge>
                          {index === versions.length - 1 && (
                            <Badge variant="secondary">Oldest</Badge>
                          )}
                        </div>
                        <h4 className="font-medium text-foreground">{version.title}</h4>
                        <p className="text-sm text-muted-foreground">
                          {version.original_filename}
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant="outline" className={getStatusColor(version.status)}>
                            {version.status}
                          </Badge>
                          <Badge variant="outline" className={getSensitivityColor(version.sensitivity)}>
                            {version.sensitivity}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Created: {new Date(version.created_at).toLocaleString()}
                        </p>
                        {version.summary && (
                          <div className="bg-muted/50 rounded-md p-3 mt-2">
                            <p className="text-sm text-muted-foreground">{version.summary}</p>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRestoreVersion(version)}
                        disabled={restoringVersion === version.id}
                      >
                        {restoringVersion === version.id ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Restoring...
                          </>
                        ) : (
                          <>
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Restore
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={tagManagementDialogOpen} onOpenChange={setTagManagementDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Tags</DialogTitle>
            <DialogDescription>
              Create, edit, and organize tags for document categorization
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Create New Tag */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Create New Tag</CardTitle>
                <CardDescription className="text-xs mt-1">
                  Tags must be assigned to a category. Documents with tags will appear in their category.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="new-tag-name">Tag Name *</Label>
                    <Input
                      id="new-tag-name"
                      placeholder="e.g., Priority, Urgent"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-tag-type">Category *</Label>
                    {categories.length > 0 ? (
                      <Select value={newTagType} onValueChange={setNewTagType}>
                        <SelectTrigger id="new-tag-type">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="new-tag-type"
                        placeholder="e.g., hr, legal, finance"
                        value={newTagType}
                        onChange={(e) => setNewTagType(e.target.value.toLowerCase())}
                      />
                    )}
                  </div>
                </div>
                <Button onClick={handleCreateTag} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Tag
                </Button>
              </CardContent>
            </Card>

            {/* Existing Tags */}
            <div>
              <h3 className="font-medium mb-3">Existing Tags ({allTags.length})</h3>
              {allTags.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No tags created yet
                </div>
              ) : (
                <div className="space-y-2">
                  {allTags.map((tag) => (
                    <Card key={tag.id}>
                      <CardContent className="p-4">
                        {editingTag?.id === tag.id ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label htmlFor="edit-tag-name">Tag Name *</Label>
                                <Input
                                  id="edit-tag-name"
                                  value={editTagName}
                                  onChange={(e) => setEditTagName(e.target.value)}
                                />
                              </div>
                              <div>
                                <Label htmlFor="edit-tag-type">Category *</Label>
                                {categories.length > 0 ? (
                                  <Select value={editTagType} onValueChange={setEditTagType}>
                                    <SelectTrigger id="edit-tag-type">
                                      <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {categories.map((cat) => (
                                        <SelectItem key={cat.id} value={cat.id}>
                                          {cat.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input
                                    id="edit-tag-type"
                                    placeholder="e.g., hr, legal, finance"
                                    value={editTagType}
                                    onChange={(e) => setEditTagType(e.target.value.toLowerCase())}
                                  />
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={handleEditTag}>
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingTag(null);
                                  setEditTagName("");
                                  setEditTagType("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">{tag.name}</Badge>
                                {tag.type && (
                                  <Badge variant="outline" className="text-xs uppercase">
                                    {tag.type}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                Category: {tag.type ? tag.type.toUpperCase() : 'None'} • Created: {new Date(tag.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingTag(tag);
                                  setEditTagName(tag.name);
                                  setEditTagType(tag.type || "");
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteTag(tag.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={assignTagsDialogOpen} onOpenChange={setAssignTagsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage File Tags</DialogTitle>
            <DialogDescription>
              Assign tags to: {documentForTagAssignment?.title}. Files will appear in the categories of their assigned tags.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {allTags.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No tags available.</p>
                <Button
                  variant="link"
                  onClick={() => {
                    setAssignTagsDialogOpen(false);
                    setTagManagementDialogOpen(true);
                  }}
                >
                  Create tags first
                </Button>
              </div>
            ) : (
              <div className="grid gap-2">
                {allTags.map((tag) => {
                  const isAssigned = documentForTagAssignment?.tags?.some(
                    t => t.tag_id === tag.id
                  );
                  
                  return (
                    <Button
                      key={tag.id}
                      variant={isAssigned ? "default" : "outline"}
                      className="justify-between"
                      onClick={() => handleAssignTag(tag.id)}
                    >
                      <span className="flex items-center gap-2">
                        {tag.name}
                        {tag.type && (
                          <Badge variant="secondary" className="text-xs uppercase">
                            Category: {tag.type}
                          </Badge>
                        )}
                      </span>
                      {isAssigned && <CheckSquare className="h-4 w-4" />}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTagsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Category Creation Dialog */}
      <Dialog open={quickCategoryDialogOpen} onOpenChange={setQuickCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Category Creation</DialogTitle>
            <DialogDescription>
              Create a new category to organize your documents. A sample tag will be created with this category type.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">Category Name</Label>
              <Input
                id="category-name"
                placeholder="e.g., Contracts, HR, Finance"
                value={quickCategoryName}
                onChange={(e) => setQuickCategoryName(e.target.value)}
                maxLength={50}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !creatingCategory) {
                    e.preventDefault();
                    handleQuickCategoryCreate();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Only letters, numbers, spaces, hyphens, and underscores allowed (max 50 characters)
              </p>
            </div>
            
            {categories.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Existing Categories:</Label>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <Badge key={cat.id} variant="secondary">
                      {cat.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setQuickCategoryDialogOpen(false);
                setQuickCategoryName("");
              }}
              disabled={creatingCategory}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleQuickCategoryCreate}
              disabled={creatingCategory || !quickCategoryName.trim()}
            >
              {creatingCategory ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Category
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Info</DialogTitle>
            <DialogDescription>
              Update file metadata and settings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={editForm.status}
                onValueChange={(value) => setEditForm({ ...editForm, status: value })}
              >
                <SelectTrigger id="edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-sensitivity">Sensitivity</Label>
              <Select
                value={editForm.sensitivity}
                onValueChange={(value) => setEditForm({ ...editForm, sensitivity: value })}
              >
                <SelectTrigger id="edit-sensitivity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="confidential">Confidential</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Editor */}
      {editingPdf && (
        <PDFEditor
          documentId={editingPdf.id}
          documentTitle={editingPdf.title}
          storagePath={editingPdf.storage_path}
          isOpen={pdfEditorOpen}
          onClose={() => {
            setPdfEditorOpen(false);
            setEditingPdf(null);
          }}
          onSave={handlePDFSaved}
        />
      )}

      {/* Signature Request Dialog */}
      {selectedDocumentForSignature && (
        <RequestSignatureDialog
          open={requestSignatureDialogOpen}
          onOpenChange={setRequestSignatureDialogOpen}
          documentId={selectedDocumentForSignature.id}
          documentTitle={selectedDocumentForSignature.title}
          onSuccess={loadDocuments}
        />
      )}

      {/* Signature Status Dialog */}
      {selectedDocumentForSignature && (
        <SignatureStatusDialog
          open={signatureStatusDialogOpen}
          onOpenChange={setSignatureStatusDialogOpen}
          documentId={selectedDocumentForSignature.id}
          documentTitle={selectedDocumentForSignature.title}
        />
      )}

      {/* Metadata Field Manager */}
      <MetadataFieldManager
        open={metadataFieldManagerOpen}
        onOpenChange={setMetadataFieldManagerOpen}
      />

      {/* Taxonomy Manager */}
      <TaxonomyManager
        open={taxonomyManagerOpen}
        onOpenChange={setTaxonomyManagerOpen}
      />

      {/* Document Metadata Editor */}
      {selectedDocumentForMetadata && (
        <DocumentMetadataEditor
          open={documentMetadataEditorOpen}
          onOpenChange={setDocumentMetadataEditorOpen}
          documentId={selectedDocumentForMetadata.id}
          documentTitle={selectedDocumentForMetadata.title}
          onSuccess={loadDocuments}
        />
      )}

      {/* Assign Taxonomies Dialog */}
      {selectedDocumentForTaxonomy && (
        <AssignTaxonomiesDialog
          open={assignTaxonomiesDialogOpen}
          onOpenChange={setAssignTaxonomiesDialogOpen}
          documentId={selectedDocumentForTaxonomy.id}
          documentTitle={selectedDocumentForTaxonomy.title}
          onSuccess={loadDocuments}
        />
      )}

      {/* Metadata Template Manager */}
      <MetadataTemplateManager
        open={templateManagerOpen}
        onOpenChange={setTemplateManagerOpen}
      />

      {/* Apply Template Dialog */}
      {selectedDocumentForTemplate && (
        <ApplyTemplateDialog
          open={applyTemplateDialogOpen}
          onOpenChange={setApplyTemplateDialogOpen}
          documentId={selectedDocumentForTemplate.id}
          documentTitle={selectedDocumentForTemplate.title}
          onSuccess={loadDocuments}
        />
      )}

      {/* Folder Dialogs */}
      <FolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        onSubmit={handleFolderSubmit}
        title={folderDialogMode === "create" ? "Create Folder" : "Edit Folder"}
        description={folderDialogMode === "create" ? "Create a new folder to organize your documents" : "Update folder details"}
        category={activeCategory}
        defaultValues={editingFolder ? {
          name: editingFolder.name,
          description: editingFolder.description || "",
          color: editingFolder.color || "#3b82f6",
        } : undefined}
      />

      <MoveFolderDialog
        open={moveFolderDialogOpen}
        onOpenChange={setMoveFolderDialogOpen}
        documentIds={Array.from(selectedDocuments)}
        onSuccess={() => {
          setSelectedDocuments(new Set());
          loadDocuments();
        }}
      />

      {/* Audio/Video Preview Dialog */}
      {audioVideoPreviewDoc && audioVideoUrl && (
        <Dialog open={audioVideoPreviewOpen} onOpenChange={setAudioVideoPreviewOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>{audioVideoPreviewDoc.title}</DialogTitle>
              <DialogDescription>
                {audioVideoPreviewDoc.mime_type?.startsWith('video/') ? 'Video' : 'Audio'} file viewer
              </DialogDescription>
            </DialogHeader>
            <AudioVideoViewer
              url={audioVideoUrl}
              mimeType={audioVideoPreviewDoc.mime_type || ''}
              title={audioVideoPreviewDoc.title}
              transcription={audioVideoTranscription || undefined}
            />
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={deleteFolderDialogOpen} onOpenChange={setDeleteFolderDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this folder? All documents in this folder will be moved to root. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteFolder} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Word Editor Dialog */}
      <WordEditorDialog
        open={!!wordEditorDoc}
        onOpenChange={(open) => !open && setWordEditorDoc(null)}
        document={wordEditorDoc}
        onSave={() => loadDocuments()}
      />
    </Layout>
  );
}
