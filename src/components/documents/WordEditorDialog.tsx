import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RichTextEditor } from '@/components/RichTextEditor';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Save, Download } from 'lucide-react';
import mammoth from 'mammoth';

interface WordEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    id: string;
    title: string;
    original_filename: string;
    storage_path: string;
    content_text?: string | null;
  } | null;
  onSave?: () => void;
}

export const WordEditorDialog = ({ 
  open, 
  onOpenChange, 
  document,
  onSave
}: WordEditorDialogProps) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [originalContent, setOriginalContent] = useState<string>('');

  useEffect(() => {
    if (open && document) {
      loadDocumentContent();
    }
  }, [open, document]);

  const loadDocumentContent = async () => {
    if (!document) return;
    
    setLoading(true);
    try {
      // Check if it's a .docx file (mammoth only supports .docx, not .doc)
      const isDocx = document.original_filename.toLowerCase().endsWith('.docx');
      
      if (isDocx) {
        // Download the file and convert with mammoth to preserve formatting
        const { data, error } = await supabase.storage
          .from('documents')
          .download(document.storage_path);

        if (error) throw error;

        // Convert the blob to ArrayBuffer for mammoth
        const arrayBuffer = await data.arrayBuffer();
        
        // Use mammoth to convert .docx to HTML with formatting
        const result = await mammoth.convertToHtml({ arrayBuffer });
        
        if (result.value && result.value.trim()) {
          setContent(result.value);
          setOriginalContent(result.value);
          
          // Show any conversion warnings
          if (result.messages.length > 0) {
            console.log('Mammoth conversion messages:', result.messages);
          }
        } else {
          // Fallback to content_text if conversion yields no content
          if (document.content_text && document.content_text.trim()) {
            const htmlContent = document.content_text
              .split('\n\n')
              .filter(para => para.trim())
              .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
              .join('');
            setContent(htmlContent);
            setOriginalContent(htmlContent);
          } else {
            setContent('<p><em>No content could be extracted from this file.</em></p>');
            setOriginalContent('<p></p>');
          }
        }
      } else {
        // For .doc files (old format), use content_text as fallback
        // mammoth doesn't support .doc format
        if (document.content_text && document.content_text.trim()) {
          const htmlContent = document.content_text
            .split('\n\n')
            .filter(para => para.trim())
            .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
            .join('');
          setContent(htmlContent);
          setOriginalContent(htmlContent);
          toast.info('Note: .doc format has limited formatting support. For best results, use .docx files.');
        } else {
          toast.error('No extracted text available for this .doc file.');
          setContent('<p><em>No content available. The file may still be processing or text extraction failed.</em></p>');
          setOriginalContent('<p></p>');
        }
      }
    } catch (error) {
      console.error('Error loading document:', error);
      toast.error('Failed to load document content');
      setContent('<p></p>');
      setOriginalContent('<p></p>');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!document) return;
    
    setSaving(true);
    try {
      // Convert HTML content to plain text for storage
      const tempDiv = window.document.createElement('div');
      tempDiv.innerHTML = content;
      const plainText = tempDiv.textContent || tempDiv.innerText || '';

      // Update the document's content_text in the database
      const { error } = await supabase
        .from('documents')
        .update({ 
          content_text: plainText,
          updated_at: new Date().toISOString()
        })
        .eq('id', document.id);

      if (error) throw error;

      toast.success('File saved successfully');
      setOriginalContent(content);
      onSave?.();
    } catch (error) {
      console.error('Error saving document:', error);
      toast.error('Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadAsHtml = () => {
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${document?.title || 'document'}.html`;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('File downloaded');
  };

  const hasChanges = content !== originalContent;

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open && hasChanges) {
        if (window.confirm('You have unsaved changes. Are you sure you want to close?')) {
          onOpenChange(false);
        }
      } else {
        onOpenChange(open);
      }
    }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit File: {document?.title}
          </DialogTitle>
          <DialogDescription>
            {document?.original_filename}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto min-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder="Start editing your file..."
            />
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={handleDownloadAsHtml}
            disabled={loading}
          >
            <Download className="mr-2 h-4 w-4" />
            Export HTML
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || saving || !hasChanges}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
