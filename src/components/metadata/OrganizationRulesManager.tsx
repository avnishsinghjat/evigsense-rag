import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Plus, Trash2, Edit, FolderTree, Sparkles, ArrowRight } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface Folder {
  id: string;
  name: string;
  category: string | null;
  color: string | null;
}

interface OrganizationRule {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  is_active: boolean;
  conditions: any;
  target_folder_id: string | null;
  folders?: Folder;
}

export const OrganizationRulesManager = () => {
  const [rules, setRules] = useState<OrganizationRule[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [deleteRule, setDeleteRule] = useState<OrganizationRule | null>(null);
  const [editingRule, setEditingRule] = useState<OrganizationRule | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [targetFolderId, setTargetFolderId] = useState("");
  const [documentType, setDocumentType] = useState("all");
  const [priorityIndicator, setPriorityIndicator] = useState("all");
  const [keywordsContains, setKeywordsContains] = useState("");
  const [entityTypeExists, setEntityTypeExists] = useState("all");
  const [minConfidence, setMinConfidence] = useState("");

  useEffect(() => {
    loadRulesAndFolders();
  }, []);

  const loadRulesAndFolders = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load rules
      const { data: rulesData, error: rulesError } = await supabase
        .from('organization_rules')
        .select('*, folders(id, name, category, color)')
        .eq('created_by', user.id)
        .order('priority', { ascending: false });

      if (rulesError) throw rulesError;
      setRules(rulesData || []);

      // Load folders
      const { data: foldersData, error: foldersError } = await supabase
        .from('folders')
        .select('*')
        .eq('created_by', user.id)
        .order('name');

      if (foldersError) throw foldersError;
      setFolders(foldersData || []);
    } catch (error: any) {
      console.error('Error loading rules:', error);
      toast.error('Failed to load organization rules');
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingRule(null);
    resetForm();
    setShowDialog(true);
  };

  const openEditDialog = (rule: OrganizationRule) => {
    setEditingRule(rule);
    setName(rule.name);
    setDescription(rule.description || "");
    setPriority(rule.priority);
    setIsActive(rule.is_active);
    setTargetFolderId(rule.target_folder_id || "");
    
    const conditions = rule.conditions;
    setDocumentType(conditions.document_type || "all");
    setPriorityIndicator(conditions.priority_indicator || "all");
    setKeywordsContains(conditions.keywords_contains?.join(", ") || "");
    setEntityTypeExists(conditions.entity_type_exists || "all");
    setMinConfidence(conditions.min_confidence_score?.toString() || "");
    
    setShowDialog(true);
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setPriority(0);
    setIsActive(true);
    setTargetFolderId("");
    setDocumentType("all");
    setPriorityIndicator("all");
    setKeywordsContains("");
    setEntityTypeExists("all");
    setMinConfidence("");
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please enter a rule name");
      return;
    }
    if (!targetFolderId) {
      toast.error("Please select a target folder");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const conditions: any = {};
      if (documentType && documentType !== "all") conditions.document_type = documentType;
      if (priorityIndicator && priorityIndicator !== "all") conditions.priority_indicator = priorityIndicator;
      if (keywordsContains) conditions.keywords_contains = keywordsContains.split(",").map(k => k.trim()).filter(Boolean);
      if (entityTypeExists && entityTypeExists !== "all") conditions.entity_type_exists = entityTypeExists;
      if (minConfidence) conditions.min_confidence_score = parseFloat(minConfidence);

      const ruleData = {
        name: name.trim(),
        description: description.trim() || null,
        priority,
        is_active: isActive,
        target_folder_id: targetFolderId,
        conditions,
        created_by: user.id,
      };

      if (editingRule) {
        const { error } = await supabase
          .from('organization_rules')
          .update(ruleData)
          .eq('id', editingRule.id);
        if (error) throw error;
        toast.success("Rule updated successfully");
      } else {
        const { error } = await supabase
          .from('organization_rules')
          .insert(ruleData);
        if (error) throw error;
        toast.success("Rule created successfully");
      }

      setShowDialog(false);
      loadRulesAndFolders();
    } catch (error: any) {
      console.error('Error saving rule:', error);
      toast.error(error.message || "Failed to save rule");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteRule) return;

    try {
      const { error } = await supabase
        .from('organization_rules')
        .delete()
        .eq('id', deleteRule.id);

      if (error) throw error;

      toast.success("Rule deleted successfully");
      setDeleteRule(null);
      loadRulesAndFolders();
    } catch (error: any) {
      console.error('Error deleting rule:', error);
      toast.error("Failed to delete rule");
    }
  };

  const toggleRuleActive = async (rule: OrganizationRule) => {
    try {
      const { error } = await supabase
        .from('organization_rules')
        .update({ is_active: !rule.is_active })
        .eq('id', rule.id);

      if (error) throw error;
      toast.success(`Rule ${!rule.is_active ? 'enabled' : 'disabled'}`);
      loadRulesAndFolders();
    } catch (error: any) {
      console.error('Error toggling rule:', error);
      toast.error("Failed to update rule");
    }
  };

  const renderConditions = (conditions: any) => {
    const items = [];
    if (conditions.document_type) items.push(`Type: ${conditions.document_type}`);
    if (conditions.priority_indicator) items.push(`Priority: ${conditions.priority_indicator}`);
    if (conditions.keywords_contains?.length) items.push(`Keywords: ${conditions.keywords_contains.join(", ")}`);
    if (conditions.entity_type_exists) items.push(`Entity: ${conditions.entity_type_exists}`);
    if (conditions.min_confidence_score) items.push(`Min Confidence: ${(conditions.min_confidence_score * 100).toFixed(0)}%`);
    return items.length > 0 ? items.join(" | ") : "No conditions";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Organization Rules</h2>
          <p className="text-muted-foreground">
            Automatically organize files based on metadata
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Create Rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No rules created yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create rules to automatically organize documents into folders
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle>{rule.name}</CardTitle>
                      <Badge variant={rule.is_active ? "default" : "secondary"}>
                        {rule.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="outline">Priority: {rule.priority}</Badge>
                    </div>
                    {rule.description && (
                      <CardDescription>{rule.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={() => toggleRuleActive(rule)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEditDialog(rule)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteRule(rule)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Conditions:</span>
                    <span>{renderConditions(rule.conditions)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <FolderTree className="h-4 w-4 text-primary" />
                    <span className="font-medium">
                      {rule.folders?.name || "No folder selected"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit" : "Create"} Organization Rule</DialogTitle>
            <DialogDescription>
              Define conditions to automatically organize documents into folders
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Rule Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Invoices to Accounting Folder"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of this rule"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Input
                  id="priority"
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
                  placeholder="Higher numbers = higher priority"
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <Label htmlFor="active">Active</Label>
                <Switch
                  id="active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="folder">Target Folder *</Label>
              <Select value={targetFolderId} onValueChange={setTargetFolderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select folder" />
                </SelectTrigger>
                <SelectContent>
                  {folders.map((folder) => (
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

            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Conditions (all must match)</h3>
              
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="docType">File Type</Label>
                  <Select value={documentType} onValueChange={setDocumentType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any type</SelectItem>
                      <SelectItem value="invoice">Invoice</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="report">Report</SelectItem>
                      <SelectItem value="letter">Letter</SelectItem>
                      <SelectItem value="resume">Resume</SelectItem>
                      <SelectItem value="legal_document">Legal Document</SelectItem>
                      <SelectItem value="financial_statement">Financial Statement</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Priority Indicator</Label>
                  <Select value={priorityIndicator} onValueChange={setPriorityIndicator}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any priority</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="keywords">Keywords Contains (comma-separated)</Label>
                  <Input
                    id="keywords"
                    value={keywordsContains}
                    onChange={(e) => setKeywordsContains(e.target.value)}
                    placeholder="e.g., invoice, payment, urgent"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="entity">Entity Type Exists</Label>
                  <Select value={entityTypeExists} onValueChange={setEntityTypeExists}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any entities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any entities</SelectItem>
                      <SelectItem value="PERSON">Person</SelectItem>
                      <SelectItem value="ORGANIZATION">Organization</SelectItem>
                      <SelectItem value="LOCATION">Location</SelectItem>
                      <SelectItem value="DATE">Date</SelectItem>
                      <SelectItem value="MONETARY_VALUE">Monetary Value</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confidence">Minimum Confidence Score</Label>
                  <Input
                    id="confidence"
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={minConfidence}
                    onChange={(e) => setMinConfidence(e.target.value)}
                    placeholder="0.0 to 1.0"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Rule"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteRule} onOpenChange={(open) => !open && setDeleteRule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteRule?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
