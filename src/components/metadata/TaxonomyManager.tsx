import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Edit, Trash2, ChevronRight, FolderTree } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Taxonomy {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  path: string;
  level: number;
  display_order: number;
  is_active: boolean;
  children?: Taxonomy[];
}

interface TaxonomyManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TaxonomyManager = ({ open, onOpenChange }: TaxonomyManagerProps) => {
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTaxonomy, setEditingTaxonomy] = useState<Taxonomy | null>(null);
  const [showTaxonomyForm, setShowTaxonomyForm] = useState(false);

  // Form state
  const [taxName, setTaxName] = useState("");
  const [taxDescription, setTaxDescription] = useState("");
  const [taxParentId, setTaxParentId] = useState<string>("none");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadTaxonomies();
    }
  }, [open]);

  const loadTaxonomies = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("taxonomies")
        .select("*")
        .order("path", { ascending: true });

      if (error) throw error;
      
      // Build hierarchy
      const hierarchical = buildHierarchy(data || []);
      setTaxonomies(hierarchical);
    } catch (error: any) {
      console.error("Error loading taxonomies:", error);
      toast.error("Failed to load taxonomies");
    } finally {
      setLoading(false);
    }
  };

  const buildHierarchy = (items: Taxonomy[]): Taxonomy[] => {
    const map = new Map<string, Taxonomy>();
    const roots: Taxonomy[] = [];

    // Initialize map
    items.forEach((item) => {
      map.set(item.id, { ...item, children: [] });
    });

    // Build hierarchy
    items.forEach((item) => {
      const node = map.get(item.id)!;
      if (item.parent_id) {
        const parent = map.get(item.parent_id);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  const flattenTaxonomies = (items: Taxonomy[]): Taxonomy[] => {
    const result: Taxonomy[] = [];
    const flatten = (items: Taxonomy[]) => {
      items.forEach((item) => {
        result.push(item);
        if (item.children && item.children.length > 0) {
          flatten(item.children);
        }
      });
    };
    flatten(items);
    return result;
  };

  const resetForm = () => {
    setTaxName("");
    setTaxDescription("");
    setTaxParentId("none");
    setEditingTaxonomy(null);
  };

  const handleOpenForm = (taxonomy?: Taxonomy) => {
    if (taxonomy) {
      setEditingTaxonomy(taxonomy);
      setTaxName(taxonomy.name);
      setTaxDescription(taxonomy.description || "");
      setTaxParentId(taxonomy.parent_id || "none");
    } else {
      resetForm();
    }
    setShowTaxonomyForm(true);
  };

  const handleSaveTaxonomy = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!taxName.trim()) {
      toast.error("Name is required");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const taxonomyData = {
        name: taxName.trim(),
        description: taxDescription.trim() || null,
        parent_id: taxParentId === "none" ? null : taxParentId,
        created_by: user.id,
      };

      if (editingTaxonomy) {
        const { error } = await supabase
          .from("taxonomies")
          .update(taxonomyData)
          .eq("id", editingTaxonomy.id);

        if (error) throw error;
        toast.success("Taxonomy updated");
      } else {
        const { error } = await supabase
          .from("taxonomies")
          .insert(taxonomyData);

        if (error) throw error;
        toast.success("Taxonomy created");
      }

      loadTaxonomies();
      setShowTaxonomyForm(false);
      resetForm();
    } catch (error: any) {
      console.error("Error saving taxonomy:", error);
      toast.error(error.message || "Failed to save taxonomy");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTaxonomy = async (taxonomyId: string) => {
    if (!confirm("Are you sure you want to delete this taxonomy? Child taxonomies will also be deleted.")) return;

    try {
      const { error } = await supabase
        .from("taxonomies")
        .delete()
        .eq("id", taxonomyId);

      if (error) throw error;
      toast.success("Taxonomy deleted");
      loadTaxonomies();
    } catch (error: any) {
      console.error("Error deleting taxonomy:", error);
      toast.error("Failed to delete taxonomy");
    }
  };

  const renderTaxonomyTree = (items: Taxonomy[], depth: number = 0) => {
    return items.map((taxonomy) => (
      <div key={taxonomy.id} style={{ marginLeft: `${depth * 24}px` }}>
        <Card className="mb-2">
          <CardHeader className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {depth > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <FolderTree className="h-4 w-4 text-primary" />
                <div>
                  <CardTitle className="text-sm">{taxonomy.name}</CardTitle>
                  {taxonomy.description && (
                    <p className="text-xs text-muted-foreground">{taxonomy.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Level {taxonomy.level}</Badge>
                {!taxonomy.is_active && <Badge variant="secondary">Inactive</Badge>}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleOpenForm(taxonomy)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteTaxonomy(taxonomy.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
        {taxonomy.children && taxonomy.children.length > 0 && renderTaxonomyTree(taxonomy.children, depth + 1)}
      </div>
    ));
  };

  const allTaxonomies = flattenTaxonomies(taxonomies);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Taxonomies</DialogTitle>
          <DialogDescription>
            Create hierarchical categories to organize your documents
          </DialogDescription>
        </DialogHeader>

        {showTaxonomyForm ? (
          <form onSubmit={handleSaveTaxonomy} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tax-name">Name</Label>
              <Input
                id="tax-name"
                value={taxName}
                onChange={(e) => setTaxName(e.target.value)}
                placeholder="e.g., Legal Files"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax-description">Description (Optional)</Label>
              <Textarea
                id="tax-description"
                value={taxDescription}
                onChange={(e) => setTaxDescription(e.target.value)}
                placeholder="Describe this category..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax-parent">Parent Category (Optional)</Label>
              <Select value={taxParentId} onValueChange={setTaxParentId}>
                <SelectTrigger id="tax-parent" className="bg-background">
                  <SelectValue placeholder="None (Top Level)" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-[9999]">
                  <SelectItem value="none">None (Top Level)</SelectItem>
                  {allTaxonomies
                    .filter((t) => t.id !== editingTaxonomy?.id) // Don't allow selecting self as parent
                    .map((tax) => (
                      <SelectItem key={tax.id} value={tax.id}>
                        {"  ".repeat(tax.level)}{tax.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowTaxonomyForm(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  editingTaxonomy ? "Update Category" : "Create Category"
                )}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex justify-end mb-4">
              <Button onClick={() => handleOpenForm()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Category
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : taxonomies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No taxonomies yet. Create your first category to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {renderTaxonomyTree(taxonomies)}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
