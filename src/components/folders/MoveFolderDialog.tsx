import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Folder, FolderOpen } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";

interface FolderOption {
  id: string;
  name: string;
  path: string;
  level: number;
}

interface MoveFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentIds: string[];
  onSuccess: () => void;
}

export const MoveFolderDialog = ({
  open,
  onOpenChange,
  documentIds,
  onSuccess,
}: MoveFolderDialogProps) => {
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingFolders, setLoadingFolders] = useState(true);

  useEffect(() => {
    if (open) {
      loadFolders();
      setSelectedFolderId(null);
    }
  }, [open]);

  const loadFolders = async () => {
    try {
      setLoadingFolders(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get the first document to determine its category
      let filterCategory = null;
      if (documentIds.length > 0) {
        const { data: document } = await supabase
          .from("documents")
          .select("folder_id")
          .eq("id", documentIds[0])
          .single();

        if (document?.folder_id) {
          const { data: folder } = await supabase
            .from("folders")
            .select("category")
            .eq("id", document.folder_id)
            .single();

          if (folder?.category) {
            filterCategory = folder.category;
          }
        }
      }

      // @ts-ignore
      const { data, error } = await supabase.rpc("get_folder_tree", {
        root_folder_id: null,
        user_id: user.id,
        filter_category: filterCategory,
      });

      if (error) throw error;

      setFolders(data || []);
    } catch (error: any) {
      console.error("Error loading folders:", error);
      toast.error("Failed to load folders");
    } finally {
      setLoadingFolders(false);
    }
  };

  const handleMove = async () => {
    if (documentIds.length === 0) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("documents")
        .update({ folder_id: selectedFolderId })
        .in("id", documentIds);

      if (error) throw error;

      toast.success(
        documentIds.length === 1
          ? "File moved successfully"
          : `${documentIds.length} files moved successfully`
      );
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error moving documents:", error);
      toast.error("Failed to move files");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move to Folder</DialogTitle>
          <DialogDescription>
            Select a folder to move {documentIds.length === 1 ? "this file" : `${documentIds.length} files`} to
          </DialogDescription>
        </DialogHeader>

        {loadingFolders ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="py-4">
            <RadioGroup value={selectedFolderId || "root"} onValueChange={(value) => setSelectedFolderId(value === "root" ? null : value)}>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="root" id="root" />
                  <Label htmlFor="root" className="flex items-center gap-2 cursor-pointer">
                    <Folder className="h-4 w-4" />
                    <span>Root (No folder)</span>
                  </Label>
                </div>

                {folders.map((folder) => (
                  <div key={folder.id} className="flex items-center space-x-2" style={{ paddingLeft: `${folder.level * 1.5}rem` }}>
                    <RadioGroupItem value={folder.id} id={folder.id} />
                    <Label htmlFor={folder.id} className="flex items-center gap-2 cursor-pointer">
                      <FolderOpen className="h-4 w-4" />
                      <span>{folder.name}</span>
                    </Label>
                  </div>
                ))}
              </div>
            </RadioGroup>

            {folders.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No folders available. Create a folder first.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleMove} disabled={loading || loadingFolders}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Moving...
              </>
            ) : (
              "Move"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
