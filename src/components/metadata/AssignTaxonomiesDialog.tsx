import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface Taxonomy {
  id: string;
  name: string;
  level: number;
  parent_id: string | null;
  path: string;
}

interface AssignTaxonomiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentTitle: string;
  onSuccess: () => void;
}

export const AssignTaxonomiesDialog = ({
  open,
  onOpenChange,
  documentId,
  documentTitle,
  onSuccess,
}: AssignTaxonomiesDialogProps) => {
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([]);
  const [selectedTaxonomies, setSelectedTaxonomies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadTaxonomiesAndAssignments();
    }
  }, [open, documentId]);

  const loadTaxonomiesAndAssignments = async () => {
    try {
      setLoading(true);

      // Load all active taxonomies
      const { data: taxData, error: taxError } = await supabase
        .from("taxonomies")
        .select("*")
        .eq("is_active", true)
        .order("path");

      if (taxError) throw taxError;

      // Load current assignments
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from("document_taxonomies")
        .select("taxonomy_id")
        .eq("document_id", documentId);

      if (assignmentsError) throw assignmentsError;

      setTaxonomies(taxData || []);
      setSelectedTaxonomies((assignmentsData || []).map((a) => a.taxonomy_id));
    } catch (error: any) {
      console.error("Error loading taxonomies:", error);
      toast.error("Failed to load taxonomies");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTaxonomy = (taxonomyId: string) => {
    setSelectedTaxonomies((prev) =>
      prev.includes(taxonomyId)
        ? prev.filter((id) => id !== taxonomyId)
        : [...prev, taxonomyId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Delete existing assignments
      await supabase
        .from("document_taxonomies")
        .delete()
        .eq("document_id", documentId);

      // Insert new assignments
      if (selectedTaxonomies.length > 0) {
        const assignments = selectedTaxonomies.map((taxonomyId) => ({
          document_id: documentId,
          taxonomy_id: taxonomyId,
        }));

        const { error } = await supabase
          .from("document_taxonomies")
          .insert(assignments);

        if (error) throw error;
      }

      toast.success("Taxonomies updated");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving taxonomies:", error);
      toast.error(error.message || "Failed to save taxonomies");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Categories</DialogTitle>
          <DialogDescription>Categories for this file</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : taxonomies.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No taxonomies available. Create some categories first.
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {taxonomies.map((taxonomy) => (
              <div
                key={taxonomy.id}
                className="flex items-center space-x-2 p-2 rounded-lg hover:bg-accent/50"
                style={{ marginLeft: `${taxonomy.level * 20}px` }}
              >
                {taxonomy.level > 0 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <Checkbox
                  id={taxonomy.id}
                  checked={selectedTaxonomies.includes(taxonomy.id)}
                  onCheckedChange={() => handleToggleTaxonomy(taxonomy.id)}
                />
                <Label htmlFor={taxonomy.id} className="cursor-pointer flex-1">
                  {taxonomy.name}
                </Label>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
