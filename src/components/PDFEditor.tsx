import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Canvas as FabricCanvas, PencilBrush, Rect, Circle, IText } from "fabric";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { 
  Trash2, 
  Pencil, 
  Square, 
  Circle as CircleIcon, 
  Type, 
  MousePointer,
  Undo,
  Save
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFEditorProps {
  documentId: string;
  documentTitle: string;
  storagePath: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

type Tool = "select" | "draw" | "rectangle" | "circle" | "text";

export const PDFEditor = ({ documentId, documentTitle, storagePath, isOpen, onClose, onSave }: PDFEditorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [activeColor, setActiveColor] = useState("#FF0000");
  const [saving, setSaving] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageWidth, setPageWidth] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageAnnotations, setPageAnnotations] = useState<Map<number, string>>(new Map());

  // Load PDF URL from storage
  useEffect(() => {
    if (!isOpen) {
      setPdfUrl(null);
      return;
    }

    const loadPDF = async () => {
      try {
        const { data } = await supabase.storage
          .from("documents")
          .createSignedUrl(storagePath, 3600);

        if (data?.signedUrl) {
          setPdfUrl(data.signedUrl);
        }
      } catch (error) {
        console.error("Error loading PDF:", error);
        toast.error("Failed to load PDF");
      }
    };

    loadPDF();
  }, [isOpen, storagePath]);

  // Save current page annotations before switching pages
  const saveCurrentPageAnnotations = () => {
    if (fabricCanvas) {
      const json = JSON.stringify(fabricCanvas.toJSON());
      setPageAnnotations(prev => new Map(prev).set(currentPage, json));
    }
  };

  // Load annotations for the current page
  const loadPageAnnotations = () => {
    if (!fabricCanvas) return;
    
    const savedAnnotations = pageAnnotations.get(currentPage);
    if (savedAnnotations) {
      fabricCanvas.loadFromJSON(savedAnnotations, () => {
        fabricCanvas.renderAll();
      });
    } else {
      fabricCanvas.clear();
    }
  };

  // Initialize Fabric canvas when PDF page is rendered
  const onPageLoadSuccess = () => {
    if (!canvasRef.current || !pageRef.current) return;

    // Get PDF page dimensions
    const pdfPage = pageRef.current.querySelector("canvas");
    if (!pdfPage) return;

    const width = pdfPage.width;
    const height = pdfPage.height;
    setPageWidth(width);

    // Initialize or update Fabric canvas
    if (fabricCanvas) {
      fabricCanvas.setDimensions({ width, height });
      loadPageAnnotations();
    } else {
      const canvas = canvasRef.current;
      canvas.width = width;
      canvas.height = height;

      const fabricCanvasInstance = new FabricCanvas(canvas, {
        width,
        height,
        backgroundColor: "transparent",
      });

      fabricCanvasInstance.freeDrawingBrush = new PencilBrush(fabricCanvasInstance);
      fabricCanvasInstance.freeDrawingBrush.color = activeColor;
      fabricCanvasInstance.freeDrawingBrush.width = 3;

      setFabricCanvas(fabricCanvasInstance);
      toast.success("PDF loaded - ready to annotate!");
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (fabricCanvas) {
        fabricCanvas.dispose();
      }
    };
  }, [fabricCanvas]);

  useEffect(() => {
    if (!fabricCanvas) return;

    fabricCanvas.isDrawingMode = activeTool === "draw";
    
    if (activeTool === "draw" && fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush.color = activeColor;
      fabricCanvas.freeDrawingBrush.width = 3;
    }
  }, [activeTool, activeColor, fabricCanvas]);

  const handleToolClick = (tool: Tool) => {
    setActiveTool(tool);

    if (!fabricCanvas) return;

    if (tool === "rectangle") {
      const rect = new Rect({
        left: 100,
        top: 100,
        fill: "transparent",
        stroke: activeColor,
        strokeWidth: 3,
        width: 100,
        height: 100,
      });
      fabricCanvas.add(rect);
    } else if (tool === "circle") {
      const circle = new Circle({
        left: 100,
        top: 100,
        fill: "transparent",
        stroke: activeColor,
        strokeWidth: 3,
        radius: 50,
      });
      fabricCanvas.add(circle);
    } else if (tool === "text") {
      const text = new IText("Add text", {
        left: 100,
        top: 100,
        fill: activeColor,
        fontSize: 20,
      });
      fabricCanvas.add(text);
    }
  };

  const handleClear = () => {
    if (!fabricCanvas) return;
    const objects = fabricCanvas.getObjects();
    objects.forEach((obj) => fabricCanvas.remove(obj));
    fabricCanvas.renderAll();
    toast.success("Canvas cleared");
  };

  const handleUndo = () => {
    if (!fabricCanvas) return;
    const objects = fabricCanvas.getObjects();
    if (objects.length > 0) {
      fabricCanvas.remove(objects[objects.length - 1]);
      fabricCanvas.renderAll();
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > numPages) return;
    saveCurrentPageAnnotations();
    setCurrentPage(newPage);
  };

  const handleSave = async () => {
    if (!fabricCanvas || !pageRef.current) return;
    
    // Save current page annotations before saving
    saveCurrentPageAnnotations();

    try {
      setSaving(true);

      // Get the PDF page canvas
      const pdfCanvas = pageRef.current.querySelector("canvas");
      if (!pdfCanvas) throw new Error("PDF canvas not found");

      // Create a new canvas to merge PDF and annotations
      const mergedCanvas = document.createElement("canvas");
      mergedCanvas.width = pdfCanvas.width;
      mergedCanvas.height = pdfCanvas.height;
      const ctx = mergedCanvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");

      // Draw PDF
      ctx.drawImage(pdfCanvas, 0, 0);

      // Draw annotations
      const annotationsDataURL = fabricCanvas.toDataURL({
        format: "png",
        quality: 1,
        multiplier: 1,
      });
      const annotationsImg = new Image();
      annotationsImg.src = annotationsDataURL;
      
      await new Promise((resolve) => {
        annotationsImg.onload = resolve;
      });
      
      ctx.drawImage(annotationsImg, 0, 0);

      // Convert merged canvas to blob
      const blob = await new Promise<Blob>((resolve) => {
        mergedCanvas.toBlob((b) => resolve(b!), "image/png", 1);
      });

      // Generate new file name
      const timestamp = new Date().getTime();
      const newFileName = `annotated_${timestamp}_${storagePath.split("/").pop()?.replace('.pdf', '.png')}`;
      const newPath = `${storagePath.split("/")[0]}/${newFileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(newPath, blob, {
          contentType: "image/png",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Update document record
      const { error: updateError } = await supabase
        .from("documents")
        .update({
          storage_path: newPath,
          mime_type: "image/png",
          updated_at: new Date().toISOString(),
        })
        .eq("id", documentId);

      if (updateError) throw updateError;

      toast.success("PDF annotations saved successfully");
      setSaving(false);
      onSave();
      onClose();
    } catch (error) {
      console.error("Error saving PDF:", error);
      toast.error("Failed to save PDF annotations");
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Edit PDF: {documentTitle}</DialogTitle>
          <DialogDescription>
            Use the toolbar to annotate the PDF with drawings, shapes, and text
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Toolbar */}
          <Card className="p-4">
            <div className="flex gap-2 items-center flex-wrap">
              <div className="flex gap-2">
                <Button
                  variant={activeTool === "select" ? "default" : "outline"}
                  size="icon"
                  onClick={() => handleToolClick("select")}
                  title="Select"
                >
                  <MousePointer className="h-4 w-4" />
                </Button>
                <Button
                  variant={activeTool === "draw" ? "default" : "outline"}
                  size="icon"
                  onClick={() => handleToolClick("draw")}
                  title="Draw"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant={activeTool === "rectangle" ? "default" : "outline"}
                  size="icon"
                  onClick={() => handleToolClick("rectangle")}
                  title="Rectangle"
                >
                  <Square className="h-4 w-4" />
                </Button>
                <Button
                  variant={activeTool === "circle" ? "default" : "outline"}
                  size="icon"
                  onClick={() => handleToolClick("circle")}
                  title="Circle"
                >
                  <CircleIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant={activeTool === "text" ? "default" : "outline"}
                  size="icon"
                  onClick={() => handleToolClick("text")}
                  title="Text"
                >
                  <Type className="h-4 w-4" />
                </Button>
              </div>

              <Separator orientation="vertical" className="h-8" />

              <div className="flex gap-2 items-center">
                <Label htmlFor="color-picker" className="text-sm">Color:</Label>
                <input
                  id="color-picker"
                  type="color"
                  value={activeColor}
                  onChange={(e) => setActiveColor(e.target.value)}
                  className="w-10 h-10 rounded border cursor-pointer"
                />
              </div>

              <Separator orientation="vertical" className="h-8" />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleUndo}
                  title="Undo"
                >
                  <Undo className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleClear}
                  title="Clear All"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>

          {/* Page Navigation */}
          {numPages > 1 && (
            <Card className="p-4">
              <div className="flex items-center justify-between gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {numPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === numPages}
                >
                  Next
                </Button>
              </div>
            </Card>
          )}

          {/* PDF and Annotation Canvas */}
          <div className="border border-border rounded-lg overflow-auto bg-muted/20 flex justify-center items-start p-4" style={{ maxHeight: "60vh" }}>
            {pdfUrl ? (
              <div style={{ position: "relative", display: "inline-block" }}>
                <div ref={pageRef} style={{ position: "relative", zIndex: 1 }}>
                  <Document
                    file={pdfUrl}
                    onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                    loading={<div className="p-8 text-muted-foreground">Loading PDF...</div>}
                    error={<div className="p-8 text-destructive">Failed to load PDF</div>}
                  >
                    <Page
                      key={currentPage}
                      pageNumber={currentPage}
                      onLoadSuccess={onPageLoadSuccess}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                  </Document>
                </div>
                <canvas
                  ref={canvasRef}
                  style={{ 
                    position: "absolute", 
                    top: 0, 
                    left: 0,
                    zIndex: 10,
                    pointerEvents: "auto"
                  }}
                />
              </div>
            ) : (
              <div className="p-8 text-muted-foreground">Loading PDF...</div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !fabricCanvas}>
            {saving ? (
              <>
                <Save className="h-4 w-4 mr-2 animate-pulse" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Annotations
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
