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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, UserPlus, Trash2, Users, Shield, Eye, Edit, Settings } from "lucide-react";
import { toast } from "sonner";

interface FolderPermission {
  id: string;
  user_id: string;
  access_level: "view" | "edit" | "manage";
  created_at: string;
  profile?: {
    email: string | null;
    display_name: string | null;
  };
}

interface FolderPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string;
  folderName: string;
}

const ACCESS_LEVELS = [
  { value: "view", label: "View", icon: Eye, description: "Can view folder contents" },
  { value: "edit", label: "Edit", icon: Edit, description: "Can view and edit documents" },
  { value: "manage", label: "Manage", icon: Settings, description: "Full access including permissions" },
];

export const FolderPermissionsDialog = ({
  open,
  onOpenChange,
  folderId,
  folderName,
}: FolderPermissionsDialogProps) => {
  const [permissions, setPermissions] = useState<FolderPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newAccessLevel, setNewAccessLevel] = useState<"view" | "edit" | "manage">("view");
  const [addingUser, setAddingUser] = useState(false);

  useEffect(() => {
    if (open && folderId) {
      loadPermissions();
    }
  }, [open, folderId]);

  const loadPermissions = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from("folder_access")
        .select(`
          id,
          user_id,
          access_level,
          created_at
        `)
        .eq("folder_id", folderId);

      if (error) throw error;

      // Fetch profiles for each user
      const userIds = data?.map(p => p.user_id) || [];
      let profilesMap: Record<string, { email: string | null; display_name: string | null }> = {};
      
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email, display_name")
          .in("id", userIds);
        
        profiles?.forEach(profile => {
          profilesMap[profile.id] = {
            email: profile.email,
            display_name: profile.display_name,
          };
        });
      }

      const permissionsWithProfiles = (data || []).map(p => ({
        ...p,
        access_level: p.access_level as "view" | "edit" | "manage",
        profile: profilesMap[p.user_id] || { email: null, display_name: null },
      }));

      setPermissions(permissionsWithProfiles);
    } catch (error: any) {
      console.error("Error loading permissions:", error);
      toast.error("Failed to load permissions");
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUserEmail.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    try {
      setAddingUser(true);

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
      const existingPermission = permissions.find(p => p.user_id === profile.id);
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
          folder_id: folderId,
          user_id: profile.id,
          access_level: newAccessLevel,
          granted_by: user?.id,
        });

      if (insertError) throw insertError;

      toast.success(`Access granted to ${profile.display_name || profile.email}`);
      setNewUserEmail("");
      setNewAccessLevel("view");
      loadPermissions();
    } catch (error: any) {
      console.error("Error adding user:", error);
      toast.error(error.message || "Failed to add user");
    } finally {
      setAddingUser(false);
    }
  };

  const handleUpdateAccess = async (permissionId: string, newLevel: "view" | "edit" | "manage") => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from("folder_access")
        .update({ access_level: newLevel })
        .eq("id", permissionId);

      if (error) throw error;

      toast.success("Permission updated");
      loadPermissions();
    } catch (error: any) {
      console.error("Error updating permission:", error);
      toast.error("Failed to update permission");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAccess = async (permissionId: string, userName: string) => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from("folder_access")
        .delete()
        .eq("id", permissionId);

      if (error) throw error;

      toast.success(`Access removed for ${userName}`);
      loadPermissions();
    } catch (error: any) {
      console.error("Error removing permission:", error);
      toast.error("Failed to remove access");
    } finally {
      setSaving(false);
    }
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

  const getAccessBadgeVariant = (level: string) => {
    switch (level) {
      case "manage": return "default";
      case "edit": return "secondary";
      default: return "outline";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Folder Permissions
          </DialogTitle>
          <DialogDescription>
            Manage who has access to <span className="font-medium">{folderName}</span>. 
            Permissions are inherited by subfolders.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Add User Section */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Add User
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter email address"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                className="flex-1"
                disabled={addingUser}
              />
              <Select
                value={newAccessLevel}
                onValueChange={(value: "view" | "edit" | "manage") => setNewAccessLevel(value)}
                disabled={addingUser}
              >
                <SelectTrigger className="w-[110px]">
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
              <Button onClick={handleAddUser} disabled={addingUser || !newUserEmail.trim()}>
                {addingUser ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Add"
                )}
              </Button>
            </div>
          </div>

          {/* Current Permissions */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Current Access ({permissions.length})
            </Label>
            
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : permissions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No users have been granted access yet</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {permissions.map((permission) => {
                  const userName = permission.profile?.display_name || permission.profile?.email || "Unknown";
                  
                  return (
                    <div
                      key={permission.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {getInitials(permission.profile?.display_name ?? null, permission.profile?.email ?? null)}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {permission.profile?.display_name || "No name"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {permission.profile?.email || "No email"}
                        </p>
                      </div>

                      <Select
                        value={permission.access_level}
                        onValueChange={(value: "view" | "edit" | "manage") => 
                          handleUpdateAccess(permission.id, value)
                        }
                        disabled={saving}
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
                        onClick={() => handleRemoveAccess(permission.id, userName)}
                        disabled={saving}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Access Level Legend */}
          <div className="border-t pt-4">
            <p className="text-xs text-muted-foreground mb-2">Access Level Guide:</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {ACCESS_LEVELS.map((level) => (
                <div key={level.value} className="flex items-center gap-1.5">
                  <level.icon className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{level.label}:</span>
                  <span className="text-muted-foreground">{level.description.split(" ").slice(1, 3).join(" ")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
