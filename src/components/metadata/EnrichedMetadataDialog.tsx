import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FileText, Calendar, HardDrive, FileType, Tag, Building2, MapPin, User, DollarSign, Package, CalendarDays, Sparkles } from "lucide-react";
import { format } from "date-fns";

interface EnrichedMetadata {
  // Inherent metadata
  file_size_bytes: number;
  file_type: string;
  creation_date: string;
  last_modified_date: string;
  page_count: number;
  // Contextual metadata
  keywords: string[];
  detected_entities: Array<{ text: string; type: string }>;
  document_type: string;
  priority_indicator: string;
  confidence_score: number;
}

interface EnrichedMetadataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metadata: EnrichedMetadata | null;
  documentTitle: string;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

const getEntityIcon = (type: string) => {
  switch (type.toUpperCase()) {
    case 'PERSON':
      return <User className="h-4 w-4" />;
    case 'ORGANIZATION':
      return <Building2 className="h-4 w-4" />;
    case 'LOCATION':
      return <MapPin className="h-4 w-4" />;
    case 'DATE':
      return <CalendarDays className="h-4 w-4" />;
    case 'MONETARY_VALUE':
      return <DollarSign className="h-4 w-4" />;
    case 'PRODUCT':
      return <Package className="h-4 w-4" />;
    default:
      return <Tag className="h-4 w-4" />;
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority.toLowerCase()) {
    case 'high':
      return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'medium':
      return 'bg-warning/10 text-warning border-warning/20';
    case 'low':
      return 'bg-muted text-muted-foreground border-border';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
};

export const EnrichedMetadataDialog = ({
  open,
  onOpenChange,
  metadata,
  documentTitle,
}: EnrichedMetadataDialogProps) => {
  if (!metadata) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Extracted Metadata
          </DialogTitle>
          <DialogDescription>{documentTitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Inherent Metadata */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                File Properties
              </CardTitle>
              <CardDescription>Inherent metadata from file attributes</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <HardDrive className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">File Size</p>
                  <p className="text-sm text-muted-foreground">{formatBytes(metadata.file_size_bytes)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <FileType className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">File Type</p>
                  <p className="text-sm text-muted-foreground">{metadata.file_type || 'Unknown'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Created</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(metadata.creation_date), 'PPP')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Last Modified</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(metadata.last_modified_date), 'PPP')}
                  </p>
                </div>
              </div>
              {metadata.page_count > 0 && (
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Page Count</p>
                    <p className="text-sm text-muted-foreground">{metadata.page_count} pages</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contextual Metadata */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI-Extracted Metadata
              </CardTitle>
              <CardDescription>Contextual metadata derived from file content</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Document Type & Priority */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium mb-2">File Type</p>
                  <Badge variant="secondary" className="capitalize">
                    {metadata.document_type}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Priority</p>
                  <Badge variant="outline" className={getPriorityColor(metadata.priority_indicator)}>
                    {metadata.priority_indicator}
                  </Badge>
                </div>
              </div>

              <Separator />

              {/* Keywords */}
              {metadata.keywords && metadata.keywords.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Keywords
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {metadata.keywords.map((keyword, index) => (
                      <Badge key={index} variant="outline">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Detected Entities */}
              {metadata.detected_entities && metadata.detected_entities.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-3">Detected Entities</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {metadata.detected_entities.map((entity, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 rounded-md border bg-card">
                        {getEntityIcon(entity.type)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{entity.text}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {entity.type.replace('_', ' ').toLowerCase()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Confidence Score */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                <span className="text-sm font-medium">Confidence Score</span>
                <span className="text-sm font-mono">
                  {(metadata.confidence_score * 100).toFixed(0)}%
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
