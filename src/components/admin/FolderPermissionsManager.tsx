import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, FolderLock, UserPlus, Trash2, Eye, Edit, Settings, Shield, Search, ChevronDown, ChevronRight, Folder } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FolderData {
  id: string;
  name: string;
  parent_id: string | null;
  path: string | null;
  level: number;
  color: string | null;
  created_by: string;
}

interface FolderPermission {
  id: string;
  folder_id: string;
  user_id: string;
  access_level: "view" | "edit" | "manage";
  created_at: string;
  folder_name?: string;
  user_email?: string;
  user_display_name?: string;
}

interface UserProfile {
  id: string;
  email: string | null;
  display_name: string | null;
}

const ACCESS_LEVELS = [
  { value: "view", label: "View", icon: Eye, description: "Can view folder contents" },
  { value: "edit", label: "Edit", icon: Edit, description: "Can view and edit documents" },
  { value: "manage", label: "Manage", icon: Settings, description: "Full access including permissions" },
];

export const FolderPermissionsManager = () => {
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [permissions, setPermissions] = useState<FolderPermission[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Add permission dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newAccessLevel, setNewAccessLevel] = useState<"view" | "edit" | "manage">("view");
  const [addingPermission, setAddingPermission] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load all folders (admin can see all)
      const { data: foldersData, error: foldersError } = await supabase
        .from("folders")
        .select("id, name, parent_id, path, level, color, created_by")
        .order("name");

      if (foldersError) throw foldersError;

      // Load all folder permissions
      const { data: permissionsData, error: permissionsError } = await supabase
        .from("folder_access")
        .select("*")
        .order("created_at", { ascending: false });

      if (permissionsError) throw permissionsError;

      // Load all user profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, display_name");

      if (profilesError) throw profilesError;

      setFolders(foldersData || []);
      setProfiles(profilesData || []);

      // Enrich permissions with folder and user info
      const folderMap = new Map(foldersData?.map(f => [f.id, f.name]) || []);
      const profileMap = new Map(profilesData?.map(p => [p.id, { email: p.email, display_name: p.display_name }]) || []);

      const enrichedPermissions = (permissionsData || []).map(p => ({
        ...p,
        access_level: p.access_level as "view" | "edit" | "manage",
        folder_name: folderMap.get(p.folder_id) || "Unknown Folder",
        user_email: profileMap.get(p.user_id)?.email || "Unknown",
        user_display_name: profileMap.get(p.user_id)?.display_name || null,
      }));

      setPermissions(enrichedPermissions);
    } catch (error: any) {
      console.error("Error loading folder permissions data:", error);
      toast.error("Failed to load folder permissions");
    } finally {
      setLoading(false);
    }
  };

  const handleAddPermission = async () => {
    if (!selectedFolderId || !newUserEmail.trim()) {
      toast.error("Please select a folder and enter an email");
      return;
    }

    try {
      setAddingPermission(true);

      // Find user by email
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, email, display_name")
        .eq("email", newUserEmail.trim().toLowerCase())
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile) {
        toast.error("User not found with that email address");
        return;
      }

      // Check if permission already exists
      const existingPermission = permissions.find(
        p => p.folder_id === selectedFolderId && p.user_id === profile.id
      );
      if (existingPermission) {
        toast.error("User already has access to this folder");
        return;
      }

      // Get current user for granted_by
      const { data: { user } } = await supabase.auth.getUser();

      // Add permission
      const { error: insertError } = await supabase
        .from("folder_access")
        .insert({
          folder_id: selectedFolderId,
          user_id: profile.id,
          access_level: newAccessLevel,
          granted_by: user?.id,
        });

      if (insertError) throw insertError;

      toast.success(`Access granted to ${profile.display_name || profile.email}`);
      setNewUserEmail("");
      setNewAccessLevel("view");
      setAddDialogOpen(false);
      loadData();
    } catch (error: any) {
      console.error("Error adding permission:", error);
      toast.error(error.message || "Failed to add permission");
    } finally {
      setAddingPermission(false);
    }
  };

  const handleUpdatePermission = async (permissionId: string, newLevel: "view" | "edit" | "manage") => {
    try {
      const { error } = await supabase
        .from("folder_access")
        .update({ access_level: newLevel })
        .eq("id", permissionId);

      if (error) throw error;

      toast.success("Permission updated");
      loadData();
    } catch (error: any) {
      console.error("Error updating permission:", error);
      toast.error("Failed to update permission");
    }
  };

  const handleRemovePermission = async (permissionId: string) => {
    try {
      const { error } = await supabase
        .from("folder_access")
        .delete()
        .eq("id", permissionId);

      if (error) throw error;

      toast.success("Permission removed");
      loadData();
    } catch (error: any) {
      console.error("Error removing permission:", error);
      toast.error("Failed to remove permission");
    }
  };

  const toggleFolderExpand = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const getInitials = (name: string | null, email: string | null) => {
    if (name) {
      return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return "?";
  };

  const getAccessBadgeVariant = (level: string): "default" | "secondary" | "outline" => {
    switch (level) {
      case "manage": return "default";
      case "edit": return "secondary";
      default: return "outline";
    }
  };

  // Build folder tree
  const buildFolderTree = () => {
    const rootFolders = folders.filter(f => f.parent_id === null);
    const childrenMap = new Map<string, FolderData[]>();
    
    folders.forEach(f => {
      if (f.parent_id) {
        const children = childrenMap.get(f.parent_id) || [];
        children.push(f);
        childrenMap.set(f.parent_id, children);
      }
    });

    const renderFolder = (folder: FolderData, depth: number = 0): JSX.Element => {
      const children = childrenMap.get(folder.id) || [];
      const isExpanded = expandedFolders.has(folder.id);
      const isSelected = selectedFolderId === folder.id;
      const folderPermissions = permissions.filter(p => p.folder_id === folder.id);

      return (
        <div key={folder.id}>
          <div
            className={cn(
              "flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer hover:bg-accent/50 transition-colors",
              isSelected && "bg-primary/10 ring-1 ring-primary"
            )}
            style={{ paddingLeft: `${depth * 16 + 12}px` }}
            onClick={() => setSelectedFolderId(isSelected ? null : folder.id)}
          >
            {children.length > 0 ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolderExpand(folder.id);
                }}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
            ) : (
              <div className="w-4" />
            )}
            <Folder 
              className="h-4 w-4 flex-shrink-0" 
              style={{ color: folder.color || undefined }}
            />
            <span className="text-sm flex-1 truncate">{folder.name}</span>
            {folderPermissions.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {folderPermissions.length} user{folderPermissions.length > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          {isExpanded && children.length > 0 && (
            <div>
              {children.map(child => renderFolder(child, depth + 1))}
            </div>
          )}
        </div>
      );
    };

    return rootFolders.map(folder => renderFolder(folder));
  };

  // Get permissions for selected folder
  const selectedFolderPermissions = selectedFolderId
    ? permissions.filter(p => p.folder_id === selectedFolderId)
    : [];

  const selectedFolder = folders.find(f => f.id === selectedFolderId);

  // Filter permissions by search
  const filteredPermissions = searchQuery
    ? permissions.filter(p => 
        p.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.user_display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.folder_name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : permissions;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderLock className="h-5 w-5" />
              Folder Permissions
            </CardTitle>
            <CardDescription>
              Manage user access to folders across the system
            </CardDescription>
          </div>
          <Button
            onClick={() => {
              if (!selectedFolderId) {
                toast.error("Please select a folder first");
                return;
              }
              setAddDialogOpen(true);
            }}
            disabled={!selectedFolderId}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by user or folder..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Folder Tree */}
          <div className="lg:col-span-1 border rounded-lg p-4 max-h-[500px] overflow-y-auto">
            <h4 className="font-medium mb-3 text-sm">Select Folder</h4>
            {folders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No folders found
              </p>
            ) : (
              <div className="space-y-1">
                {buildFolderTree()}
              </div>
            )}
          </div>

          {/* Permissions for selected folder */}
          <div className="lg:col-span-2 border rounded-lg p-4">
            {selectedFolderId && selectedFolder ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Folder 
                      className="h-5 w-5" 
                      style={{ color: selectedFolder.color || undefined }}
                    />
                    <h4 className="font-medium">{selectedFolder.name}</h4>
                  </div>
                  <Badge variant="outline">
                    {selectedFolderPermissions.length} permission{selectedFolderPermissions.length !== 1 ? 's' : ''}
                  </Badge>
                </div>

                {selectedFolderPermissions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No permissions assigned</p>
                    <p className="text-xs mt-1">Click "Add User" to grant access</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {selectedFolderPermissions.map((permission) => (
                      <div
                        key={permission.id}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {getInitials(permission.user_display_name ?? null, permission.user_email ?? null)}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {permission.user_display_name || "No name"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {permission.user_email}
                          </p>
                        </div>

                        <Select
                          value={permission.access_level}
                          onValueChange={(value: "view" | "edit" | "manage") => 
                            handleUpdatePermission(permission.id, value)
                          }
                        >
                          <SelectTrigger className="w-[100px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ACCESS_LEVELS.map((level) => (
                              <SelectItem key={level.value} value={level.value}>
                                <div className="flex items-center gap-2">
                                  <level.icon className="h-3 w-3" />
                                  {level.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemovePermission(permission.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <FolderLock className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="font-medium">Select a folder</p>
                <p className="text-sm mt-1">Choose a folder from the left to manage its permissions</p>
              </div>
            )}
          </div>
        </div>

        {/* All Permissions Table */}
        {!selectedFolderId && filteredPermissions.length > 0 && (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Folder</TableHead>
                  <TableHead>Access Level</TableHead>
                  <TableHead>Granted</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPermissions.slice(0, 20).map((permission) => (
                  <TableRow key={permission.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-xs">
                            {getInitials(permission.user_display_name ?? null, permission.user_email ?? null)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">
                            {permission.user_display_name || permission.user_email}
                          </p>
                          {permission.user_display_name && (
                            <p className="text-xs text-muted-foreground">{permission.user_email}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{permission.folder_name}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getAccessBadgeVariant(permission.access_level)}>
                        {permission.access_level}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {new Date(permission.created_at).toLocaleDateString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleRemovePermission(permission.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredPermissions.length > 20 && (
              <div className="p-3 text-center text-sm text-muted-foreground border-t">
                Showing 20 of {filteredPermissions.length} permissions. Select a folder to view all.
              </div>
            )}
          </div>
        )}

        {/* Access Level Legend */}
        <div className="border-t pt-4">
          <p className="text-xs text-muted-foreground mb-2">Access Level Guide:</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {ACCESS_LEVELS.map((level) => (
              <div key={level.value} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                <level.icon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="font-medium">{level.label}</span>
                  <p className="text-muted-foreground">{level.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>

      {/* Add Permission Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Add User to Folder
            </DialogTitle>
            <DialogDescription>
              Grant access to <span className="font-medium">{selectedFolder?.name}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>User Email</Label>
              <Input
                placeholder="Enter user email address"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                disabled={addingPermission}
              />
            </div>

            <div className="space-y-2">
              <Label>Access Level</Label>
              <Select
                value={newAccessLevel}
                onValueChange={(value: "view" | "edit" | "manage") => setNewAccessLevel(value)}
                disabled={addingPermission}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCESS_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      <div className="flex items-center gap-2">
                        <level.icon className="h-4 w-4" />
                        <div>
                          <span className="font-medium">{level.label}</span>
                          <span className="text-muted-foreground ml-2">- {level.description}</span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={addingPermission}>
              Cancel
            </Button>
            <Button onClick={handleAddPermission} disabled={addingPermission || !newUserEmail.trim()}>
              {addingPermission ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Add Permission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
