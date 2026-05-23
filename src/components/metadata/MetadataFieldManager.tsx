import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Edit, Trash2, GripVertical, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface MetadataField {
  id: string;
  name: string;
  label: string;
  field_type: string;
  options: any;
  is_required: boolean;
  default_value: string | null;
  help_text: string | null;
  display_order: number;
  is_active: boolean;
}

interface MetadataFieldManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MetadataFieldManager = ({ open, onOpenChange }: MetadataFieldManagerProps) => {
  const [fields, setFields] = useState<MetadataField[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<MetadataField | null>(null);
  const [showFieldForm, setShowFieldForm] = useState(false);

  // Form state
  const [fieldName, setFieldName] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<string>("text");
  const [fieldOptions, setFieldOptions] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [defaultValue, setDefaultValue] = useState("");
  const [helpText, setHelpText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadFields();
    }
  }, [open]);

  const loadFields = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("metadata_field_definitions")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) throw error;
      setFields(data || []);
    } catch (error: any) {
      console.error("Error loading metadata fields:", error);
      toast.error("Failed to load metadata fields");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFieldName("");
    setFieldLabel("");
    setFieldType("text");
    setFieldOptions("");
    setIsRequired(false);
    setDefaultValue("");
    setHelpText("");
    setEditingField(null);
  };

  const handleOpenForm = (field?: MetadataField) => {
    if (field) {
      setEditingField(field);
      setFieldName(field.name);
      setFieldLabel(field.label);
      setFieldType(field.field_type);
      setFieldOptions(field.options ? JSON.stringify(field.options) : "");
      setIsRequired(field.is_required);
      setDefaultValue(field.default_value || "");
      setHelpText(field.help_text || "");
    } else {
      resetForm();
    }
    setShowFieldForm(true);
  };

  const handleSaveField = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fieldName.trim() || !fieldLabel.trim()) {
      toast.error("Name and label are required");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Parse options if it's a dropdown or multiselect
      let parsedOptions = null;
      if ((fieldType === "dropdown" || fieldType === "multiselect") && fieldOptions.trim()) {
        try {
          parsedOptions = JSON.parse(fieldOptions);
        } catch {
          // If not valid JSON, treat as comma-separated list
          parsedOptions = fieldOptions.split(",").map(opt => opt.trim()).filter(opt => opt);
        }
      }

      const fieldData = {
        name: fieldName.trim(),
        label: fieldLabel.trim(),
        field_type: fieldType,
        options: parsedOptions,
        is_required: isRequired,
        default_value: defaultValue.trim() || null,
        help_text: helpText.trim() || null,
        display_order: editingField ? editingField.display_order : fields.length,
        created_by: user.id,
      };

      if (editingField) {
        const { error } = await supabase
          .from("metadata_field_definitions")
          .update(fieldData)
          .eq("id", editingField.id);

        if (error) throw error;
        toast.success("Metadata field updated");
      } else {
        const { error } = await supabase
          .from("metadata_field_definitions")
          .insert(fieldData);

        if (error) throw error;
        toast.success("Metadata field created");
      }

      loadFields();
      setShowFieldForm(false);
      resetForm();
    } catch (error: any) {
      console.error("Error saving metadata field:", error);
      toast.error(error.message || "Failed to save metadata field");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!confirm("Are you sure you want to delete this metadata field?")) return;

    try {
      const { error } = await supabase
        .from("metadata_field_definitions")
        .delete()
        .eq("id", fieldId);

      if (error) throw error;
      toast.success("Metadata field deleted");
      loadFields();
    } catch (error: any) {
      console.error("Error deleting metadata field:", error);
      toast.error("Failed to delete metadata field");
    }
  };

  const handleCreateDefaultFields = async () => {
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('You must be logged in to create fields');
      }

      // Check which default fields already exist
      const { data: existingFields } = await supabase
        .from('metadata_field_definitions')
        .select('name')
        .in('name', ['author', 'department', 'document_date', 'confidentiality_level', 'review_date', 'status']);

      const existingFieldNames = new Set(existingFields?.map(f => f.name) || []);

      const defaultFields = [
        {
          name: 'author',
          label: 'Author',
          field_type: 'text',
          options: null,
          is_required: false,
          help_text: 'Document author or creator',
          display_order: 1,
          is_active: true,
          created_by: user.id,
        },
        {
          name: 'department',
          label: 'Department',
          field_type: 'dropdown',
          options: { options: ['HR', 'Finance', 'Legal', 'IT', 'Operations', 'Sales', 'Marketing'] },
          is_required: false,
          help_text: 'Department responsible for this document',
          display_order: 2,
          is_active: true,
          created_by: user.id,
        },
        {
          name: 'document_date',
          label: 'File Date',
          field_type: 'date',
          options: null,
          is_required: false,
          help_text: 'Date when the document was created or issued',
          display_order: 3,
          is_active: true,
          created_by: user.id,
        },
        {
          name: 'confidentiality_level',
          label: 'Confidentiality Level',
          field_type: 'dropdown',
          options: { options: ['Public', 'Internal', 'Confidential', 'Highly Confidential'] },
          is_required: true,
          help_text: 'Document sensitivity level',
          display_order: 4,
          is_active: true,
          created_by: user.id,
        },
        {
          name: 'review_date',
          label: 'Review Date',
          field_type: 'date',
          options: null,
          is_required: false,
          help_text: 'Next review or expiration date',
          display_order: 5,
          is_active: true,
          created_by: user.id,
        },
        {
          name: 'status',
          label: 'Status',
          field_type: 'dropdown',
          options: { options: ['Draft', 'In Review', 'Final', 'Archived'] },
          is_required: true,
          help_text: 'Current file status',
          display_order: 6,
          is_active: true,
          created_by: user.id,
        },
      ];

      // Filter out fields that already exist
      const fieldsToInsert = defaultFields.filter(field => !existingFieldNames.has(field.name));

      if (fieldsToInsert.length === 0) {
        toast.info('All default fields already exist');
        return;
      }

      const { error } = await supabase
        .from('metadata_field_definitions')
        .insert(fieldsToInsert);

      if (error) throw error;

      toast.success(`Created ${fieldsToInsert.length} default metadata fields`);
      loadFields();
    } catch (error: any) {
      console.error('Error creating default fields:', error);
      toast.error(error.message || 'Failed to create default fields');
    } finally {
      setSaving(false);
    }
  };

  const getFieldTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      text: "Text",
      number: "Number",
      date: "Date",
      dropdown: "Dropdown",
      multiselect: "Multi-Select",
      boolean: "Yes/No",
    };
    return types[type] || type;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Metadata Fields</DialogTitle>
          <DialogDescription>
            Create custom fields to add structured metadata to your documents
          </DialogDescription>
        </DialogHeader>

        {showFieldForm ? (
          <form onSubmit={handleSaveField} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="field-name">Field Name (ID)</Label>
                <Input
                  id="field-name"
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value)}
                  placeholder="e.g., project_code"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="field-label">Display Label</Label>
                <Input
                  id="field-label"
                  value={fieldLabel}
                  onChange={(e) => setFieldLabel(e.target.value)}
                  placeholder="e.g., Project Code"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="field-type">Field Type</Label>
              <Select value={fieldType} onValueChange={setFieldType}>
                <SelectTrigger id="field-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="dropdown">Dropdown</SelectItem>
                  <SelectItem value="multiselect">Multi-Select</SelectItem>
                  <SelectItem value="boolean">Yes/No</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(fieldType === "dropdown" || fieldType === "multiselect") && (
              <div className="space-y-2">
                <Label htmlFor="field-options">Options</Label>
                <Textarea
                  id="field-options"
                  value={fieldOptions}
                  onChange={(e) => setFieldOptions(e.target.value)}
                  placeholder='JSON array or comma-separated: ["Option 1", "Option 2"] or Option 1, Option 2'
                  rows={3}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="default-value">Default Value (Optional)</Label>
              <Input
                id="default-value"
                value={defaultValue}
                onChange={(e) => setDefaultValue(e.target.value)}
                placeholder="Default value"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="help-text">Help Text (Optional)</Label>
              <Input
                id="help-text"
                value={helpText}
                onChange={(e) => setHelpText(e.target.value)}
                placeholder="Helper text for users"
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <Label htmlFor="is-required" className="cursor-pointer">Required Field</Label>
              <Switch
                id="is-required"
                checked={isRequired}
                onCheckedChange={setIsRequired}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowFieldForm(false);
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
                  editingField ? "Update Field" : "Create Field"
                )}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex justify-between items-center mb-4">
              <Button 
                onClick={handleCreateDefaultFields}
                variant="outline"
                disabled={saving}
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
                ) : (
                  <><Database className="h-4 w-4 mr-2" /> Create Default Fields</>
                )}
              </Button>
              <Button onClick={() => handleOpenForm()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Metadata Field
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : fields.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No metadata fields yet. Create your first field to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {fields.map((field) => (
                  <Card key={field.id}>
                    <CardHeader className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <CardTitle className="text-base">{field.label}</CardTitle>
                            <p className="text-sm text-muted-foreground">{field.name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{getFieldTypeLabel(field.field_type)}</Badge>
                          {field.is_required && <Badge>Required</Badge>}
                          {!field.is_active && <Badge variant="secondary">Inactive</Badge>}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenForm(field)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteField(field.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
