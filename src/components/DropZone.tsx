import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  maxFiles?: number;
  currentFiles: File[];
  onRemoveFile: (index: number) => void;
}

export const DropZone = ({ 
  onFilesSelected, 
  accept = ".pdf,.doc,.docx,.txt,.md",
  maxFiles = 10,
  currentFiles,
  onRemoveFile
}: DropZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset file input when currentFiles is empty
  useEffect(() => {
    if (currentFiles.length === 0 && fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [currentFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const acceptedExtensions = accept.split(",").map(ext => ext.trim());
    
    const validFiles = files.filter(file => {
      const fileExt = "." + file.name.split(".").pop()?.toLowerCase();
      return acceptedExtensions.includes(fileExt);
    });

    if (validFiles.length !== files.length) {
      alert(`Some files were rejected. Accepted formats: ${accept}`);
    }

    if (validFiles.length > 0) {
      const totalFiles = currentFiles.length + validFiles.length;
      if (totalFiles > maxFiles) {
        alert(`Maximum ${maxFiles} files allowed. Please remove some files first.`);
        return;
      }
      onFilesSelected([...currentFiles, ...validFiles]);
    }
  }, [accept, onFilesSelected, maxFiles, currentFiles]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      const totalFiles = currentFiles.length + files.length;
      
      if (totalFiles > maxFiles) {
        alert(`Maximum ${maxFiles} files allowed. Please remove some files first.`);
        e.target.value = ''; // Reset input
        return;
      }
      
      onFilesSelected([...currentFiles, ...files]);
      e.target.value = ''; // Reset input to allow re-selecting same files
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-8 transition-all duration-200",
          isDragging 
            ? "border-primary bg-primary/5 scale-[1.02]" 
            : "border-border hover:border-primary/50 hover:bg-muted/30"
        )}
      >
        <input
          type="file"
          id="file-upload"
          ref={fileInputRef}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={handleFileInput}
          accept={accept}
          multiple
        />
        
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          <div className={cn(
            "p-4 rounded-full transition-colors duration-200",
            isDragging ? "bg-primary text-primary-foreground" : "bg-muted"
          )}>
            <Upload className={cn(
              "h-8 w-8 transition-transform duration-200",
              isDragging && "scale-110"
            )} />
          </div>
          
          <div className="space-y-2">
            <p className="text-lg font-medium">
              {isDragging ? "Drop files here" : "Drag and drop files here"}
            </p>
            <p className="text-sm text-muted-foreground">
              or click to browse • Maximum {maxFiles} files
            </p>
            <p className="text-xs text-muted-foreground">
              Accepted formats: {accept.split(",").join(", ")}
            </p>
          </div>
        </div>
      </div>

      {currentFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Selected Files ({currentFiles.length}/{maxFiles})
          </p>
          <div className="grid gap-2 max-h-48 overflow-y-auto">
            {currentFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-muted rounded-lg group hover:bg-muted/70 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveFile(index)}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
