import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Folder, FolderOpen, ChevronRight, ChevronDown, Plus, MoreVertical, Trash2, Edit2, FolderPlus, Check, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { FolderPermissionsDialog } from "./FolderPermissionsDialog";

interface FolderNode {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  parent_id: string | null;
  path: string;
  level: number;
  category: string | null;
  created_at: string;
  updated_at: string;
  document_count: number;
  children?: FolderNode[];
}

interface FolderTreeProps {
  onFolderSelect: (folderId: string | null) => void;
  selectedFolderId: string | null;
  onCreateFolder: (parentId: string | null) => void;
  onEditFolder: (folder: FolderNode) => void;
  onDeleteFolder: (folderId: string) => void;
  onDocumentDrop: (folderId: string | null) => void;
  onFolderDrop: (folderId: string, targetFolderId: string | null) => void;
  onDuplicateFolder: (folderId: string) => void;
  refreshTrigger?: number;
  category?: string;
}

export const FolderTree = ({
  onFolderSelect,
  selectedFolderId,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onDocumentDrop,
  onFolderDrop,
  onDuplicateFolder,
  refreshTrigger = 0,
  category,
}: FolderTreeProps) => {
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [selectedFolderForPermissions, setSelectedFolderForPermissions] = useState<FolderNode | null>(null);
  useEffect(() => {
    loadFolders();
  }, [refreshTrigger]);

  const loadFolders = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // @ts-ignore
      const { data, error } = await supabase.rpc("get_folder_tree", {
        root_folder_id: null,
        user_id: user.id,
        filter_category: category || null,
      });

      if (error) throw error;

      // Build tree structure
      const folderMap = new Map<string, FolderNode>();
      const rootFolders: FolderNode[] = [];

      // First pass: create all folder nodes
      data?.forEach((folder: any) => {
        folderMap.set(folder.id, { ...folder, children: [] });
      });

      // Second pass: build tree structure
      data?.forEach((folder: any) => {
        const node = folderMap.get(folder.id)!;
        if (folder.parent_id === null) {
          rootFolders.push(node);
        } else {
          const parent = folderMap.get(folder.parent_id);
          if (parent) {
            parent.children = parent.children || [];
            parent.children.push(node);
          }
        }
      });

      setFolders(rootFolders);
    } catch (error: any) {
      console.error("Error loading folders:", error);
      toast.error("Failed to load folders");
    } finally {
      setLoading(false);
    }
  };

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const renderFolder = (folder: FolderNode, level: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const hasChildren = folder.children && folder.children.length > 0;
    const isDragOver = dragOverFolderId === folder.id;
    const isBeingDragged = draggedFolderId === folder.id;

    return (
      <div key={folder.id}>
        <div
          draggable
          className={cn(
            "group flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-accent/50 cursor-pointer transition-all",
            isSelected && "bg-primary/10 border-l-4 border-primary font-semibold text-primary shadow-sm ring-1 ring-primary/20",
            !isSelected && "border-l-4 border-transparent",
            isDragOver && "bg-primary/20 ring-2 ring-primary",
            isBeingDragged && "opacity-50"
          )}
          style={{ paddingLeft: `${level * 1.2 + 0.75}rem` }}
          onDragStart={(e) => {
            e.stopPropagation();
            setDraggedFolderId(folder.id);
          }}
          onDragEnd={(e) => {
            e.stopPropagation();
            setDraggedFolderId(null);
            setDragOverFolderId(null);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (draggedFolderId && draggedFolderId !== folder.id) {
              setDragOverFolderId(folder.id);
            }
          }}
          onDragLeave={(e) => {
            e.stopPropagation();
            setDragOverFolderId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOverFolderId(null);
            
            if (draggedFolderId && draggedFolderId !== folder.id) {
              onFolderDrop(draggedFolderId, folder.id);
            } else {
              onDocumentDrop(folder.id);
            }
          }}
        >
          <div className="flex items-center gap-1 flex-1 min-w-0" onClick={() => onFolderSelect(folder.id)}>
            {hasChildren && (
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 hover:bg-transparent"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolder(folder.id);
                }}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
            )}
            {!hasChildren && <div className="w-4" />}
            
            {isExpanded ? (
              <FolderOpen 
                className={cn("h-4 w-4 flex-shrink-0", isSelected && "text-primary")} 
                style={{ color: !isSelected && folder.color ? folder.color : undefined }} 
              />
            ) : (
              <Folder 
                className={cn("h-4 w-4 flex-shrink-0", isSelected && "text-primary")} 
                style={{ color: !isSelected && folder.color ? folder.color : undefined }} 
              />
            )}
            
            <span className={cn("text-sm truncate flex-1", isSelected && "font-semibold text-primary")}>
              {folder.name}
            </span>
            
            {isSelected && (
              <Check className="h-4 w-4 text-primary flex-shrink-0" />
            )}
            
            {folder.document_count > 0 && (
              <span className={cn("text-xs", isSelected ? "text-primary/80 font-medium" : "text-muted-foreground")}>
                ({folder.document_count})
              </span>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCreateFolder(folder.id); }}>
                <FolderPlus className="h-4 w-4 mr-2" />
                New Subfolder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEditFolder(folder); }}>
                <Edit2 className="h-4 w-4 mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicateFolder(folder.id); }}>
                <FolderPlus className="h-4 w-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { 
                e.stopPropagation(); 
                setSelectedFolderForPermissions(folder);
                setPermissionsDialogOpen(true);
              }}>
                <Shield className="h-4 w-4 mr-2" />
                Manage Permissions
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder.id); }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isExpanded && hasChildren && (
          <div>
            {folder.children!.map((child) => renderFolder(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground p-4">Loading folders...</div>;
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Folders</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => onCreateFolder(null)}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          New
        </Button>
      </div>

      <div
        className={cn(
          "flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-accent/50 cursor-pointer transition-all border-l-4",
          selectedFolderId === null && "bg-primary/10 border-primary font-semibold text-primary shadow-sm ring-1 ring-primary/20",
          selectedFolderId !== null && "border-transparent",
          dragOverFolderId === null && "bg-primary/20 ring-2 ring-primary"
        )}
        onClick={() => onFolderSelect(null)}
        onDragOver={(e) => {
          e.preventDefault();
          if (draggedFolderId) {
            setDragOverFolderId(null);
          }
        }}
        onDragLeave={() => setDragOverFolderId("none")}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverFolderId("none");
          
          if (draggedFolderId) {
            onFolderDrop(draggedFolderId, null);
          } else {
            onDocumentDrop(null);
          }
        }}
      >
        <Folder className={cn("h-4 w-4", selectedFolderId === null ? "text-primary" : "text-muted-foreground")} />
        <span className={cn("text-sm flex-1", selectedFolderId === null && "font-semibold text-primary")}>
          All Documents
        </span>
        {selectedFolderId === null && (
          <Check className="h-4 w-4 text-primary flex-shrink-0" />
        )}
      </div>

      {folders.length === 0 ? (
        <div className="text-center py-8">
          <Folder className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No folders yet</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-7 text-xs"
            onClick={() => onCreateFolder(null)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Create Folder
          </Button>
        </div>
      ) : (
        <div className="space-y-0.5">
          {folders.map((folder) => renderFolder(folder))}
        </div>
      )}

      {/* Folder Permissions Dialog */}
      {selectedFolderForPermissions && (
        <FolderPermissionsDialog
          open={permissionsDialogOpen}
          onOpenChange={setPermissionsDialogOpen}
          folderId={selectedFolderForPermissions.id}
          folderName={selectedFolderForPermissions.name}
        />
      )}
    </div>
  );
};
