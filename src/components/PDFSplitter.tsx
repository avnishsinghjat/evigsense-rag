import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { PDFDocument } from "pdf-lib";
import { Scissors, Loader2 } from "lucide-react";

interface PDFSplitterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export const PDFSplitter = ({ open, onOpenChange, onComplete }: PDFSplitterProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [pagesPerChunk, setPagesPerChunk] = useState(400);
  const [splitting, setSplitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        toast.error("Please select a PDF file");
        return;
      }
      if (selectedFile.size > 100 * 1024 * 1024) {
        toast.error("File too large. Maximum 100MB");
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSplit = async () => {
    if (!file) {
      toast.error("Please select a PDF file");
      return;
    }

    if (pagesPerChunk < 10 || pagesPerChunk > 500) {
      toast.error("Pages per chunk must be between 10 and 500");
      return;
    }

    setSplitting(true);
    setProgress(0);
    setStatus("Loading PDF...");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Read the PDF file
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const totalPages = pdfDoc.getPageCount();

      console.log(`PDF has ${totalPages} pages. Splitting into chunks of ${pagesPerChunk} pages...`);
      setStatus(`PDF has ${totalPages} pages. Splitting into chunks...`);

      // Calculate number of chunks
      const numChunks = Math.ceil(totalPages / pagesPerChunk);
      console.log(`Creating ${numChunks} chunks...`);

      const chunks: { doc: PDFDocument; startPage: number; endPage: number }[] = [];

      // Create chunks
      for (let i = 0; i < numChunks; i++) {
        const startPage = i * pagesPerChunk;
        const endPage = Math.min((i + 1) * pagesPerChunk - 1, totalPages - 1);
        
        setStatus(`Creating chunk ${i + 1} of ${numChunks} (pages ${startPage + 1}-${endPage + 1})...`);
        setProgress((i / numChunks) * 50);

        // Create a new PDF document for this chunk
        const chunkDoc = await PDFDocument.create();
        
        // Copy pages from the original document
        const pages = await chunkDoc.copyPages(
          pdfDoc,
          Array.from({ length: endPage - startPage + 1 }, (_, idx) => startPage + idx)
        );
        
        pages.forEach((page) => {
          chunkDoc.addPage(page);
        });

        chunks.push({ doc: chunkDoc, startPage: startPage + 1, endPage: endPage + 1 });
      }

      console.log(`Created ${chunks.length} chunks. Uploading...`);

      // Upload each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        setStatus(`Uploading chunk ${i + 1} of ${chunks.length}...`);
        setProgress(50 + ((i / chunks.length) * 50));

        // Save chunk as bytes
        const chunkBytes = await chunk.doc.save();
        const chunkBlob = new Blob([chunkBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
        const chunkFile = new File(
          [chunkBlob],
          `${file.name.replace('.pdf', '')}_chunk_${i + 1}_pages_${chunk.startPage}-${chunk.endPage}.pdf`,
          { type: 'application/pdf' }
        );

        // Upload to storage
        const fileName = `${user.id}/${Date.now()}_chunk_${i + 1}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(fileName, chunkFile);

        if (uploadError) throw uploadError;

        // Create document record
        const { data: docData, error: dbError } = await supabase
          .from("documents")
          .insert({
            title: `${file.name.replace('.pdf', '')} - Part ${i + 1} (Pages ${chunk.startPage}-${chunk.endPage})`,
            original_filename: chunkFile.name,
            storage_path: fileName,
            mime_type: 'application/pdf',
            created_by: user.id,
          })
          .select()
          .single();

        if (dbError) throw dbError;

        // Add to processing queue
        const docId = docData.id;
        const { error: queueError } = await supabase
          .from("document_processing_queue")
          .insert({
            document_id: docId,
            user_id: user.id,
            status: 'pending',
            priority: 0,
            retry_count: 0,
            max_retries: 3
          });

        if (queueError) {
          console.error(`Failed to add chunk ${i + 1} to queue:`, queueError);
          throw queueError;
        }

        console.log(`Chunk ${i + 1} added to processing queue`);
      }

      // Start processing the queue after all chunks are added
      console.log('All chunks added to queue. Starting queue processing...');
      supabase.functions.invoke("process-queue").then(({ error: queueProcessError }) => {
        if (queueProcessError) {
          console.error('Failed to start queue processing:', queueProcessError);
        }
      });

      setProgress(100);
      setStatus(`Successfully split into ${chunks.length} chunks!`);
      toast.success(`PDF split into ${chunks.length} chunks and uploaded successfully!`);
      
      // Close dialog and refresh
      setTimeout(() => {
        onOpenChange(false);
        if (onComplete) onComplete();
        // Reset state
        setFile(null);
        setSplitting(false);
        setProgress(0);
        setStatus("");
      }, 2000);

    } catch (error: any) {
      console.error("Error splitting PDF:", error);
      toast.error(`Failed to split PDF: ${error.message}`);
      setSplitting(false);
      setProgress(0);
      setStatus("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Split Large PDF
          </DialogTitle>
          <DialogDescription>
            Break large PDFs into smaller chunks for efficient processing. Each chunk will be uploaded as a separate document.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="pdf-file">Select PDF File</Label>
            <Input
              id="pdf-file"
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              disabled={splitting}
            />
            {file && (
              <p className="text-sm text-muted-foreground">
                Selected: {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pages-per-chunk">Pages per Chunk</Label>
            <Input
              id="pages-per-chunk"
              type="number"
              min={10}
              max={500}
              value={pagesPerChunk}
              onChange={(e) => setPagesPerChunk(parseInt(e.target.value) || 200)}
              disabled={splitting}
            />
            <p className="text-sm text-muted-foreground">
              Recommended: 400 pages per chunk (max 500, min 10)
            </p>
          </div>

          {splitting && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground">{status}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={splitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSplit}
            disabled={!file || splitting}
          >
            {splitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Splitting...
              </>
            ) : (
              <>
                <Scissors className="mr-2 h-4 w-4" />
                Split PDF
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
