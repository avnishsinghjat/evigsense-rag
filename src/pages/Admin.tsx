import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Tag, Plus, Loader2, Shield, AlertTriangle, UserPlus, Trash2, Filter, X, Users, Mail, Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OrganizationRulesManager } from "@/components/metadata/OrganizationRulesManager";
import { FolderPermissionsManager } from "@/components/admin/FolderPermissionsManager";

interface TagData {
  id: string;
  name: string;
  type: string | null;
  created_at: string;
}

interface AuditLogEntry {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
  user_id: string | null;
}

interface DocumentData {
  id: string;
  title: string;
}

interface UserRole {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
}

interface User {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at?: string;
  email_confirmed_at?: string;
}

const Admin = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<TagData[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [userEmailMap, setUserEmailMap] = useState<Record<string, string>>({});
  const [documentNameMap, setDocumentNameMap] = useState<Record<string, string>>({});
  const [newTagName, setNewTagName] = useState("");
  const [newTagType, setNewTagType] = useState("");
  const [creating, setCreating] = useState(false);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [clearAuditDialogOpen, setClearAuditDialogOpen] = useState(false);
  const [clearingAudit, setClearingAudit] = useState(false);

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roles } = await supabase
        // @ts-ignore - Supabase types not yet regenerated
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      const hasAccess = !!roles;
      setIsAdmin(hasAccess);

      if (hasAccess) {
        loadAdminData();
        loadAllUsers();
      }
    } catch (error) {
      console.error("Error checking admin access:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadAdminData = async () => {
    try {
      const [tagsResult, logsResult, rolesResult, documentsResult] = await Promise.all([
        // @ts-ignore - Supabase types not yet regenerated
        supabase.from("tags").select("*").order("created_at", { ascending: false }),
        // @ts-ignore - Supabase types not yet regenerated
        supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(50),
        // @ts-ignore - Supabase types not yet regenerated
        supabase.from("user_roles").select("*").order("created_at", { ascending: false }),
        // @ts-ignore - Supabase types not yet regenerated
        supabase.from("documents").select("id, title"),
      ]);

      if (tagsResult.data) setTags(tagsResult.data);
      if (logsResult.data) setAuditLogs(logsResult.data);
      if (rolesResult.data) setUserRoles(rolesResult.data);
      
      // Create document name mapping
      if (documentsResult.data) {
        const docMapping: Record<string, string> = {};
        documentsResult.data.forEach((doc: DocumentData) => {
          docMapping[doc.id] = doc.title;
        });
        setDocumentNameMap(docMapping);
      }
      
      // Fetch users via edge function
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: usersData, error: usersError } = await supabase.functions.invoke('list-users', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (usersError) {
          console.error("Error fetching users:", usersError);
          toast.error("Failed to load user list");
        } else if (usersData?.users) {
          const emailMapping: Record<string, string> = {};
          usersData.users.forEach((user: any) => {
            emailMapping[user.id] = user.email || 'Unknown';
          });
          setUserEmailMap(emailMapping);
        }
      }
    } catch (error) {
      console.error("Error loading admin data:", error);
    }
  };

  const loadAllUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: usersData, error } = await supabase.functions.invoke('list-users', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error("Error fetching users:", error);
        toast.error("Failed to load users");
        return;
      }

      if (usersData?.users) {
        setAllUsers(usersData.users);
      }
    } catch (error) {
      console.error("Error loading users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail.trim() || !newUserPassword.trim()) return;

    setCreatingUser(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke('create-user', {
        body: { 
          email: newUserEmail.trim(), 
          password: newUserPassword.trim() 
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      toast.success("User created successfully");
      setNewUserEmail("");
      setNewUserPassword("");
      setAddUserOpen(false);
      loadAllUsers();
    } catch (error: any) {
      console.error("Error creating user:", error);
      toast.error(error.message || "Failed to create user");
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Delete user via edge function
      const { error } = await supabase.functions.invoke('delete-user', {
        body: { userId: userToDelete.id },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      toast.success("User deleted successfully");
      setUserToDelete(null);
      loadAllUsers();
      loadAdminData();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast.error(error.message || "Failed to delete user");
    }
  };

  const handleToggleRole = async (userId: string, role: string, hasRole: boolean) => {
    try {
      if (hasRole) {
        // Remove the role
        const roleEntry = userRoles.find(ur => ur.user_id === userId && ur.role === role);
        if (!roleEntry) return;

        // @ts-ignore
        const { error } = await supabase.from("user_roles").delete().eq("id", roleEntry.id);

        if (error) throw error;
        toast.success(`${role} role removed`);
      } else {
        // Add the role
        // @ts-ignore
        const { error } = await supabase.from("user_roles").insert({
          // @ts-ignore
          user_id: userId,
          // @ts-ignore
          role: role,
        });

        if (error) {
          if (error.code === '23505') {
            throw new Error("This user already has this role");
          }
          throw error;
        }
        toast.success(`${role} role added`);
      }

      loadAdminData();
    } catch (error: any) {
      console.error("Error toggling role:", error);
      toast.error(error.message || "Failed to update role");
    }
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;

    setCreating(true);
    try {
      // @ts-ignore - Supabase types not yet regenerated
      const { error } = await supabase.from("tags")
        .insert({
        // @ts-ignore
        name: newTagName.trim(),
        type: newTagType.trim() || null,
      });

      if (error) throw error;

      toast.success("Tag created successfully");
      setNewTagName("");
      setNewTagType("");
      loadAdminData();
    } catch (error: any) {
      console.error("Error creating tag:", error);
      toast.error(error.message || "Failed to create tag");
    } finally {
      setCreating(false);
    }
  };

  const handleExportAuditLogs = async () => {
    try {
      // Fetch all audit logs (not just the limited set)
      const { data: allAuditLogs, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!allAuditLogs || allAuditLogs.length === 0) {
        toast.error("No audit logs to export");
        return;
      }

      // Convert to CSV
      const headers = ["Timestamp", "Action", "User Email", "Target Type", "Target Name", "Target ID"];
      const csvRows = [headers.join(",")];

      allAuditLogs.forEach((log: AuditLogEntry) => {
        const row = [
          new Date(log.created_at).toLocaleString(),
          log.action,
          log.user_id ? (userEmailMap[log.user_id] || log.user_id) : "System",
          log.target_type || "",
          log.target_type === "documents" && log.target_id ? (documentNameMap[log.target_id] || "") : "",
          log.target_id || ""
        ];
        // Escape values and wrap in quotes if they contain commas
        const escapedRow = row.map(value => {
          const stringValue = String(value);
          if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        });
        csvRows.push(escapedRow.join(","));
      });

      const csvContent = csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(`Exported ${allAuditLogs.length} audit log entries`);
    } catch (error: any) {
      console.error("Error exporting audit logs:", error);
      toast.error(error.message || "Failed to export audit logs");
    }
  };

  const handleClearAuditTrail = async () => {
    setClearingAudit(true);
    try {
      // Delete from both audit tables
      const [auditLogResult, orgAuditResult] = await Promise.all([
        supabase.from("audit_log").delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        supabase.from("organization_audit").delete().neq('id', '00000000-0000-0000-0000-000000000000')
      ]);

      if (auditLogResult.error) throw auditLogResult.error;
      if (orgAuditResult.error) throw orgAuditResult.error;

      toast.success("Audit trail cleared successfully");
      setClearAuditDialogOpen(false);
      loadAdminData();
    } catch (error: any) {
      console.error("Error clearing audit trail:", error);
      toast.error(error.message || "Failed to clear audit trail");
    } finally {
      setClearingAudit(false);
    }
  };

  const clearFilters = () => {
    setActionFilter("all");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  };

  const filteredAuditLogs = auditLogs.filter((log) => {
    // Filter by action type
    if (actionFilter !== "all" && log.action !== actionFilter) {
      return false;
    }

    // Filter by date range
    const logDate = new Date(log.created_at);
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (logDate < start) return false;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (logDate > end) return false;
    }

    return true;
  });

  const hasActiveFilters = actionFilter !== "all" || startDate || endDate;

  // Pagination calculations
  const totalPages = Math.ceil(filteredAuditLogs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedLogs = filteredAuditLogs.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [actionFilter, startDate, endDate]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-full text-center p-6">
          <Shield className="h-16 w-16 text-destructive mb-4" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">
            You do not have admin privileges to access this page.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            Manage tags, view audit logs, and configure system settings
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create New Tag</CardTitle>
            <CardDescription>Add a new tag to organize documents</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateTag} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tag-name">Tag Name *</Label>
                  <Input
                    id="tag-name"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="e.g., Engineering, Marketing"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tag-type">Tag Type (Optional)</Label>
                  <Input
                    id="tag-type"
                    value={newTagType}
                    onChange={(e) => setNewTagType(e.target.value)}
                    placeholder="e.g., team, product, customer"
                  />
                </div>
              </div>
              <Button type="submit" disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Tag
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tags ({tags.length})</CardTitle>
            <CardDescription>Manage document tags</CardDescription>
          </CardHeader>
          <CardContent>
            {tags.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No tags created yet</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge key={tag.id} variant="secondary" className="text-sm">
                    <Tag className="mr-1 h-3 w-3" />
                    {tag.name}
                    {tag.type && <span className="ml-1 text-xs">({tag.type})</span>}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                User Management
              </CardTitle>
              <CardDescription>View all users and manage their accounts and roles</CardDescription>
            </div>
            <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreateUser}>
                  <DialogHeader>
                    <DialogTitle>Create New User</DialogTitle>
                    <DialogDescription>
                      Add a new user account to the system
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-user-email">Email *</Label>
                      <Input
                        id="new-user-email"
                        type="email"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        placeholder="user@example.com"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-user-password">Password *</Label>
                      <Input
                        id="new-user-password"
                        type="password"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        placeholder="Min. 6 characters"
                        required
                        minLength={6}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={creatingUser}>
                      {creatingUser ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        "Create User"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {loadingUsers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : allUsers.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No users found</p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md border">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-4 py-3 text-left text-sm font-medium">Email</th>
                          <th className="px-4 py-3 text-left text-sm font-medium">Joined</th>
                          <th className="px-4 py-3 text-left text-sm font-medium">Last Sign In</th>
                          <th className="px-4 py-3 text-left text-sm font-medium">Roles</th>
                          <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allUsers.map((user) => {
                          const userRolesList = userRoles.filter(ur => ur.user_id === user.id);
                          const hasAdminRole = userRolesList.some(ur => ur.role === 'admin');
                          const hasModeratorRole = userRolesList.some(ur => ur.role === 'moderator');
                          const hasUserRole = userRolesList.some(ur => ur.role === 'user');

                          return (
                            <tr key={user.id} className="border-b hover:bg-muted/50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <Mail className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium">{user.email}</span>
                                  {!user.email_confirmed_at && (
                                    <Badge variant="outline" className="text-xs">Unconfirmed</Badge>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">
                                {new Date(user.created_at).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">
                                {user.last_sign_in_at 
                                  ? new Date(user.last_sign_in_at).toLocaleDateString()
                                  : 'Never'}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant={hasAdminRole ? "default" : "outline"}
                                    className="h-7 text-xs"
                                    onClick={() => handleToggleRole(user.id, 'admin', hasAdminRole)}
                                  >
                                    Admin
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={hasModeratorRole ? "default" : "outline"}
                                    className="h-7 text-xs"
                                    onClick={() => handleToggleRole(user.id, 'moderator', hasModeratorRole)}
                                  >
                                    Moderator
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={hasUserRole ? "default" : "outline"}
                                    className="h-7 text-xs"
                                    onClick={() => handleToggleRole(user.id, 'user', hasUserRole)}
                                  >
                                    User
                                  </Button>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setUserToDelete(user)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete User Account</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to permanently delete the account for "{userToDelete?.email}"? 
                This will remove all their data and cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive hover:bg-destructive/90">
                Delete User
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={clearAuditDialogOpen} onOpenChange={setClearAuditDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear Audit Trail</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to permanently delete all audit logs? This will remove all 
                records of document operations and system changes. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={clearingAudit}>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleClearAuditTrail} 
                disabled={clearingAudit}
                className="bg-destructive hover:bg-destructive/90"
              >
                {clearingAudit ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Clearing...
                  </>
                ) : (
                  'Clear All Audit Logs'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Organization Rules Section */}
        <Card>
          <CardContent className="pt-6">
            <OrganizationRulesManager />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle>Recent Audit Trail</CardTitle>
              <CardDescription>Document operations and system changes</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleExportAuditLogs}
              >
                <Download className="mr-2 h-4 w-4" />
                Export to CSV
              </Button>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => setClearAuditDialogOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Clear Audit Trail
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="action-filter">Action Type</Label>
                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger id="action-filter">
                    <SelectValue placeholder="All actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    <SelectItem value="created">Created</SelectItem>
                    <SelectItem value="updated">Updated</SelectItem>
                    <SelectItem value="deleted">Deleted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            
            {hasActiveFilters && (
              <div className="flex items-center justify-between p-2 bg-accent/50 rounded-md">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Showing {filteredAuditLogs.length} of {auditLogs.length} logs
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear Filters
                </Button>
              </div>
            )}

            {filteredAuditLogs.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                {hasActiveFilters ? "No audit logs match your filters" : "No audit logs yet"}
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  {paginatedLogs.map((log) => (
                    <div key={log.id} className="flex items-start justify-between p-3 border rounded hover:bg-accent/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant={log.action === 'deleted' ? 'destructive' : 'secondary'} className="text-xs">
                            {log.action}
                          </Badge>
                          {log.target_type && (
                            <span className="text-xs text-muted-foreground">{log.target_type}</span>
                          )}
                        </div>
                        {log.target_id && log.target_type === 'documents' && (
                          <p className="text-sm font-medium text-foreground">
                            {documentNameMap[log.target_id] || `Document: ${log.target_id.slice(0, 8)}...`}
                          </p>
                        )}
                        {log.target_id && log.target_type !== 'documents' && (
                          <p className="text-xs text-muted-foreground">
                            {log.target_type}: {log.target_id.slice(0, 8)}...
                          </p>
                        )}
                        {log.user_id && (
                          <p className="text-sm font-medium text-foreground">
                            By: {userEmailMap[log.user_id] || log.user_id.slice(0, 8) + '...'}
                          </p>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="items-per-page" className="text-sm">Show:</Label>
                      <Select 
                        value={itemsPerPage.toString()} 
                        onValueChange={(value) => {
                          setItemsPerPage(Number(value));
                          setCurrentPage(1);
                        }}
                      >
                        <SelectTrigger id="items-per-page" className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5</SelectItem>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-sm text-muted-foreground">
                        Showing {startIndex + 1}-{Math.min(endIndex, filteredAuditLogs.length)} of {filteredAuditLogs.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                      >
                        First
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <span className="text-sm px-2">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                      >
                        Last
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Folder Permissions Manager */}
        <FolderPermissionsManager />
      </div>
    </Layout>
  );
};

export default Admin;