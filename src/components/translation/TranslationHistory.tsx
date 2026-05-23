import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Trash2, History, FileSpreadsheet, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface TranslationRecord {
  id: string;
  original_filename: string;
  translated_filename: string;
  original_storage_path: string;
  translated_storage_path: string;
  source_language: string;
  target_language: string;
  total_cells: number;
  translated_cells: number;
  skipped_cells: number;
  file_size_bytes: number | null;
  created_at: string;
}

export function TranslationHistory() {
  const [history, setHistory] = useState<TranslationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("translation_history")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setHistory(data || []);
    } catch (error) {
      console.error("Error fetching translation history:", error);
      toast.error("Failed to load translation history");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (record: TranslationRecord, type: "original" | "translated") => {
    setDownloadingId(`${record.id}-${type}`);
    try {
      const storagePath = type === "original" ? record.original_storage_path : record.translated_storage_path;
      const filename = type === "original" ? record.original_filename : record.translated_filename;

      const { data, error } = await supabase.storage
        .from("translations")
        .download(storagePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Downloaded ${filename}`);
    } catch (error) {
      console.error("Error downloading file:", error);
      toast.error("Failed to download file");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (record: TranslationRecord) => {
    setDeletingId(record.id);
    try {
      // Delete files from storage
      await supabase.storage
        .from("translations")
        .remove([record.original_storage_path, record.translated_storage_path]);

      // Delete record from database
      const { error } = await supabase
        .from("translation_history")
        .delete()
        .eq("id", record.id);

      if (error) throw error;

      setHistory(history.filter((h) => h.id !== record.id));
      toast.success("Translation deleted");
    } catch (error) {
      console.error("Error deleting translation:", error);
      toast.error("Failed to delete translation");
    } finally {
      setDeletingId(null);
    }
  };

  const getLanguageDisplay = (lang: string) => {
    return lang === "ru" ? "🇷🇺 Russian" : "🇬🇧 English";
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Translation History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Translation History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileSpreadsheet className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No translations yet</p>
            <p className="text-sm">Your translated files will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="text-center">Cells</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-primary" />
                        <span className="font-medium truncate max-w-[200px]">
                          {record.original_filename}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {getLanguageDisplay(record.source_language)} → {getLanguageDisplay(record.target_language)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm text-muted-foreground">
                        {record.translated_cells}/{record.total_cells}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {formatFileSize(record.file_size_bytes)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(record.created_at), "MMM d, yyyy HH:mm")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(record, "original")}
                          disabled={downloadingId === `${record.id}-original`}
                          title="Download original"
                        >
                          {downloadingId === `${record.id}-original` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleDownload(record, "translated")}
                          disabled={downloadingId === `${record.id}-translated`}
                          title="Download translated"
                        >
                          {downloadingId === `${record.id}-translated` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-1" />
                              Translated
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(record)}
                          disabled={deletingId === record.id}
                          className="text-destructive hover:text-destructive"
                          title="Delete"
                        >
                          {deletingId === record.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
