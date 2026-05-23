import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

interface MetadataField {
  id: string;
  name: string;
  label: string;
  field_type: string;
  options: any;
  is_required: boolean;
  default_value: string | null;
  help_text: string | null;
}

interface MetadataValue {
  field_id: string;
  value: string;
}

interface DocumentMetadataEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentTitle: string;
  onSuccess: () => void;
}

export const DocumentMetadataEditor = ({
  open,
  onOpenChange,
  documentId,
  documentTitle,
  onSuccess,
}: DocumentMetadataEditorProps) => {
  const [fields, setFields] = useState<MetadataField[]>([]);
  const [metadataValues, setMetadataValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadFieldsAndValues();
    }
  }, [open, documentId]);

  const loadFieldsAndValues = async () => {
    try {
      setLoading(true);

      // Load field definitions
      const { data: fieldsData, error: fieldsError } = await supabase
        .from("metadata_field_definitions")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (fieldsError) throw fieldsError;

      // Load existing metadata values for this document
      const { data: valuesData, error: valuesError } = await supabase
        .from("document_metadata")
        .select("field_id, value")
        .eq("document_id", documentId);

      if (valuesError) throw valuesError;

      setFields(fieldsData || []);

      // Convert values array to object
      const valuesMap: Record<string, string> = {};
      (valuesData || []).forEach((v) => {
        valuesMap[v.field_id] = v.value;
      });

      // Set default values for fields that don't have values yet
      (fieldsData || []).forEach((field) => {
        if (!valuesMap[field.id] && field.default_value) {
          valuesMap[field.id] = field.default_value;
        }
      });

      setMetadataValues(valuesMap);
    } catch (error: any) {
      console.error("Error loading metadata:", error);
      toast.error("Failed to load metadata");
    } finally {
      setLoading(false);
    }
  };

  const handleValueChange = (fieldId: string, value: string) => {
    setMetadataValues((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
  };

  const handleSave = async () => {
    // Validate required fields
    const missingRequired = fields.filter(
      (field) => field.is_required && !metadataValues[field.id]?.trim()
    );

    if (missingRequired.length > 0) {
      toast.error(`Please fill in required fields: ${missingRequired.map(f => f.label).join(", ")}`);
      return;
    }

    setSaving(true);
    try {
      // Delete existing metadata for this document
      await supabase
        .from("document_metadata")
        .delete()
        .eq("document_id", documentId);

      // Insert new metadata values
      const metadataToInsert = Object.entries(metadataValues)
        .filter(([_, value]) => value?.trim())
        .map(([fieldId, value]) => ({
          document_id: documentId,
          field_id: fieldId,
          value: value.trim(),
        }));

      if (metadataToInsert.length > 0) {
        const { error } = await supabase
          .from("document_metadata")
          .insert(metadataToInsert);

        if (error) throw error;
      }

      toast.success("Document metadata saved");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving metadata:", error);
      toast.error(error.message || "Failed to save metadata");
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field: MetadataField) => {
    const value = metadataValues[field.id] || "";

    switch (field.field_type) {
      case "text":
        return (
          <Input
            value={value}
            onChange={(e) => handleValueChange(field.id, e.target.value)}
            placeholder={field.help_text || `Enter ${field.label.toLowerCase()}`}
            required={field.is_required}
          />
        );

      case "number":
        return (
          <Input
            type="number"
            value={value}
            onChange={(e) => handleValueChange(field.id, e.target.value)}
            placeholder={field.help_text || `Enter ${field.label.toLowerCase()}`}
            required={field.is_required}
          />
        );

      case "date":
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !value && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {value ? format(new Date(value), "PPP") : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-[9999] bg-popover" align="start">
              <Calendar
                mode="single"
                selected={value ? new Date(value) : undefined}
                onSelect={(date) => handleValueChange(field.id, date ? date.toISOString() : "")}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        );

      case "dropdown":
        const options = field.options?.options || [];
        return (
          <Select value={value} onValueChange={(val) => handleValueChange(field.id, val)}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent className="bg-popover z-[9999]">
              {options.map((option: string, index: number) => (
                <SelectItem key={index} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "multiselect":
        const multiselectOptions = field.options?.options || [];
        const selectedValues = value ? value.split(",") : [];
        return (
          <div className="space-y-2">
            {multiselectOptions.map((option: string, index: number) => (
              <div key={index} className="flex items-center space-x-2">
                <Checkbox
                  id={`${field.id}-${index}`}
                  checked={selectedValues.includes(option)}
                  onCheckedChange={(checked) => {
                    const newValues = checked
                      ? [...selectedValues, option]
                      : selectedValues.filter((v) => v !== option);
                    handleValueChange(field.id, newValues.join(","));
                  }}
                />
                <Label htmlFor={`${field.id}-${index}`} className="cursor-pointer">
                  {option}
                </Label>
              </div>
            ))}
          </div>
        );

      case "boolean":
        return (
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <Label htmlFor={field.id} className="cursor-pointer">{field.label}</Label>
            <Switch
              id={field.id}
              checked={value === "true"}
              onCheckedChange={(checked) => handleValueChange(field.id, checked ? "true" : "false")}
            />
          </div>
        );

      default:
        return (
          <Input
            value={value}
            onChange={(e) => handleValueChange(field.id, e.target.value)}
            placeholder={field.help_text || `Enter ${field.label.toLowerCase()}`}
          />
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>File Metadata</DialogTitle>
          <DialogDescription>{documentTitle}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : fields.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No metadata fields available. Create some fields first.
          </div>
        ) : (
          <div className="space-y-4">
            {fields.map((field) => (
              <div key={field.id} className="space-y-2">
                <Label htmlFor={field.id}>
                  {field.label}
                  {field.is_required && <span className="text-destructive ml-1">*</span>}
                </Label>
                {field.help_text && (
                  <p className="text-xs text-muted-foreground">{field.help_text}</p>
                )}
                {renderField(field)}
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
              "Save Metadata"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
