import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Edit } from "lucide-react";

interface MetadataField {
  id: string;
  name: string;
  label: string;
  field_type: string;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string;
  is_active: boolean;
}

interface TemplateField {
  field_id: string;
  display_order: number;
}

interface MetadataTemplateManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MetadataTemplateManager = ({ open, onOpenChange }: MetadataTemplateManagerProps) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [fields, setFields] = useState<MetadataField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
  });
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    try {
      setLoading(true);

      const [templatesRes, fieldsRes] = await Promise.all([
        supabase.from("metadata_templates").select("*").order("name"),
        supabase.from("metadata_field_definitions").select("id, name, label, field_type").eq("is_active", true).order("label"),
      ]);

      if (templatesRes.error) throw templatesRes.error;
      if (fieldsRes.error) throw fieldsRes.error;

      setTemplates(templatesRes.data || []);
      setFields(fieldsRes.data || []);
    } catch (error: any) {
      console.error("Error loading templates:", error);
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || "",
      category: template.category,
    });

    // Load template fields
    const { data, error } = await supabase
      .from("metadata_template_fields")
      .select("field_id")
      .eq("template_id", template.id);

    if (error) {
      toast.error("Failed to load template fields");
      return;
    }

    setSelectedFields(new Set(data.map((f) => f.field_id)));
    setShowForm(true);
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      const { error } = await supabase.from("metadata_templates").delete().eq("id", templateId);

      if (error) throw error;

      toast.success("Template deleted");
      loadData();
    } catch (error: any) {
      console.error("Error deleting template:", error);
      toast.error("Failed to delete template");
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.category.trim()) {
      toast.error("Please fill in required fields");
      return;
    }

    if (selectedFields.size === 0) {
      toast.error("Please select at least one field");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let templateId: string;

      if (editingTemplate) {
        // Update existing template
        const { error } = await supabase
          .from("metadata_templates")
          .update({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            category: formData.category.trim(),
          })
          .eq("id", editingTemplate.id);

        if (error) throw error;
        templateId = editingTemplate.id;

        // Delete existing template fields
        await supabase.from("metadata_template_fields").delete().eq("template_id", templateId);
      } else {
        // Create new template
        const { data, error } = await supabase
          .from("metadata_templates")
          .insert({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            category: formData.category.trim(),
            created_by: user.id,
          })
          .select()
          .single();

        if (error) throw error;
        templateId = data.id;
      }

      // Insert template fields
      const templateFields = Array.from(selectedFields).map((fieldId, index) => ({
        template_id: templateId,
        field_id: fieldId,
        display_order: index,
      }));

      const { error: fieldsError } = await supabase.from("metadata_template_fields").insert(templateFields);

      if (fieldsError) throw fieldsError;

      toast.success(editingTemplate ? "Template updated" : "Template created");
      resetForm();
      loadData();
    } catch (error: any) {
      console.error("Error saving template:", error);
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: "", description: "", category: "" });
    setSelectedFields(new Set());
    setEditingTemplate(null);
    setShowForm(false);
  };

  const toggleField = (fieldId: string) => {
    const newSelected = new Set(selectedFields);
    if (newSelected.has(fieldId)) {
      newSelected.delete(fieldId);
    } else {
      newSelected.add(fieldId);
    }
    setSelectedFields(newSelected);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Metadata Templates</DialogTitle>
          <DialogDescription>Create and manage metadata field templates for different document types</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : showForm ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Template Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Invoice Template"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">
                Category <span className="text-destructive">*</span>
              </Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Financial, Legal, HR"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe when to use this template"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>
                Select Fields <span className="text-destructive">*</span>
              </Label>
              <div className="border rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
                {fields.map((field) => (
                  <div key={field.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={field.id}
                      checked={selectedFields.has(field.id)}
                      onCheckedChange={() => toggleField(field.id)}
                    />
                    <Label htmlFor={field.id} className="cursor-pointer flex-1">
                      {field.label}
                      <span className="text-xs text-muted-foreground ml-2">({field.field_type})</span>
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>{editingTemplate ? "Update Template" : "Create Template"}</>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Button onClick={() => setShowForm(true)} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Create New Template
            </Button>

            {templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No templates yet. Create your first template to get started.
              </div>
            ) : (
              <div className="grid gap-4">
                {templates.map((template) => (
                  <Card key={template.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{template.name}</CardTitle>
                          <CardDescription className="mt-1">
                            Category: {template.category}
                            {template.description && ` • ${template.description}`}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(template)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(template.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
