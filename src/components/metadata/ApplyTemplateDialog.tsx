import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string;
}

interface ApplyTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentTitle: string;
  onSuccess: () => void;
}

export const ApplyTemplateDialog = ({
  open,
  onOpenChange,
  documentId,
  documentTitle,
  onSuccess,
}: ApplyTemplateDialogProps) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (open) {
      loadTemplates();
    }
  }, [open]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("metadata_templates")
        .select("*")
        .eq("is_active", true)
        .order("category")
        .order("name");

      if (error) throw error;
      setTemplates(data || []);
    } catch (error: any) {
      console.error("Error loading templates:", error);
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!selectedTemplate) {
      toast.error("Please select a template");
      return;
    }

    setApplying(true);
    try {
      // Get template fields
      const { data: templateFields, error: fieldsError } = await supabase
        .from("metadata_template_fields")
        .select("field_id, metadata_field_definitions(id, name, label, field_type, default_value)")
        .eq("template_id", selectedTemplate)
        .order("display_order");

      if (fieldsError) throw fieldsError;

      // Get existing document metadata
      const { data: existingMetadata, error: metadataError } = await supabase
        .from("document_metadata")
        .select("field_id")
        .eq("document_id", documentId);

      if (metadataError) throw metadataError;

      const existingFieldIds = new Set((existingMetadata || []).map((m) => m.field_id));

      // Prepare metadata to insert (only for fields that don't already have values)
      const metadataToInsert = (templateFields || [])
        .filter((tf: any) => {
          const field = tf.metadata_field_definitions;
          return field && !existingFieldIds.has(field.id) && field.default_value;
        })
        .map((tf: any) => {
          const field = tf.metadata_field_definitions;
          return {
            document_id: documentId,
            field_id: field.id,
            value: field.default_value,
          };
        });

      if (metadataToInsert.length > 0) {
        const { error: insertError } = await supabase.from("document_metadata").insert(metadataToInsert);

        if (insertError) throw insertError;
      }

      toast.success("Template applied successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error applying template:", error);
      toast.error("Failed to apply template");
    } finally {
      setApplying(false);
    }
  };

  // Group templates by category
  const templatesByCategory = templates.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, Template[]>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply Metadata Template</DialogTitle>
          <DialogDescription>
            Apply a predefined template to this file
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No templates available. Create templates first in the Metadata Templates manager.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template">Select Template</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger id="template">
                  <SelectValue placeholder="Choose a template" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {Object.entries(templatesByCategory).map(([category, categoryTemplates]) => (
                    <SelectGroup key={category}>
                      <SelectLabel>{category}</SelectLabel>
                      {categoryTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          <div className="flex flex-col">
                            <span>{template.name}</span>
                            {template.description && (
                              <span className="text-xs text-muted-foreground">
                                {template.description}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="text-sm text-muted-foreground">
              This will initialize metadata fields from the template. Existing field values will not be overwritten.
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={applying || loading || !selectedTemplate}>
            {applying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Applying...
              </>
            ) : (
              "Apply Template"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
