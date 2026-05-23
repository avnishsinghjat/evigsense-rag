import { useState, useEffect, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Search, X, ZoomIn, ZoomOut, FileText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Custom text renderer to highlight search terms
const textRenderer = (searchQuery: string) => (textItem: any) => {
  if (!searchQuery) return textItem.str;
  
  const text = textItem.str;
  const searchLower = searchQuery.toLowerCase().trim();
  const textLower = text.toLowerCase();
  
  if (!textLower.includes(searchLower)) return text;
  
  // Split text and wrap matches in a highlight span
  const parts = [];
  let lastIndex = 0;
  let index = textLower.indexOf(searchLower);
  
  while (index !== -1) {
    if (index > lastIndex) {
      parts.push(text.substring(lastIndex, index));
    }
    parts.push(
      `<mark style="background-color: yellow; color: black; padding: 2px; border-radius: 2px;">${text.substring(index, index + searchLower.length)}</mark>`
    );
    lastIndex = index + searchLower.length;
    index = textLower.indexOf(searchLower, lastIndex);
  }
  
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return parts.join('');
};

interface PDFViewerWithSearchProps {
  url: string;
  filename: string;
  initialPage?: number;
  initialSearchQuery?: string;
  onClose: () => void;
}

export const PDFViewerWithSearch = ({ 
  url, 
  filename, 
  initialPage = 1, 
  initialSearchQuery = "",
  onClose 
}: PDFViewerWithSearchProps) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [activeSearchQuery, setActiveSearchQuery] = useState(initialSearchQuery);
  const [scale, setScale] = useState(1.0);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [matchesPerPage, setMatchesPerPage] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    setPageNumber(initialPage);
  }, [initialPage]);

  useEffect(() => {
    setSearchQuery(initialSearchQuery);
    setActiveSearchQuery(initialSearchQuery);
    
    // Auto-trigger search when component loads with a search query
    if (initialSearchQuery && pdfDocument) {
      handleSearch();
    }
  }, [initialSearchQuery, pdfDocument]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !pdfDocument) {
      toast.error("Please enter a search term");
      return;
    }

    setActiveSearchQuery(searchQuery.trim());
    
    // Search through all pages to find matches and count them
    const searchTerm = searchQuery.toLowerCase().trim();
    const matchesMap = new Map<number, number>();
    let firstMatchPage = -1;
    
    for (let i = 1; i <= numPages; i++) {
      try {
        const page = await pdfDocument.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ').toLowerCase();
        
        // Count matches on this page
        let matchCount = 0;
        let index = pageText.indexOf(searchTerm);
        while (index !== -1) {
          matchCount++;
          index = pageText.indexOf(searchTerm, index + 1);
        }
        
        if (matchCount > 0) {
          matchesMap.set(i, matchCount);
          if (firstMatchPage === -1) {
            firstMatchPage = i;
          }
        }
      } catch (error) {
        console.error(`Error searching page ${i}:`, error);
      }
    }
    
    setMatchesPerPage(matchesMap);
    
    if (firstMatchPage !== -1) {
      setPageNumber(firstMatchPage);
      setCurrentMatchIndex(0);
      const totalMatches = Array.from(matchesMap.values()).reduce((a, b) => a + b, 0);
      toast.success(`Found ${totalMatches} match(es) across ${matchesMap.size} page(s)`);
    } else {
      toast.info("No matches found");
    }
  };

  const goToNextMatch = async () => {
    if (!pdfDocument || matchesPerPage.size === 0) return;
    
    const pages = Array.from(matchesPerPage.keys()).sort((a, b) => a - b);
    const currentPageIndex = pages.indexOf(pageNumber);
    
    if (currentPageIndex === -1) return;
    
    const matchesOnCurrentPage = matchesPerPage.get(pageNumber) || 0;
    
    // Calculate total matches before current page
    let matchesBefore = 0;
    for (let i = 0; i < currentPageIndex; i++) {
      matchesBefore += matchesPerPage.get(pages[i]) || 0;
    }
    
    const currentMatchOnPage = currentMatchIndex - matchesBefore;
    
    if (currentMatchOnPage < matchesOnCurrentPage - 1) {
      // Move to next match on same page
      setCurrentMatchIndex(currentMatchIndex + 1);
    } else if (currentPageIndex < pages.length - 1) {
      // Move to first match on next page with matches
      setPageNumber(pages[currentPageIndex + 1]);
      setCurrentMatchIndex(matchesBefore + matchesOnCurrentPage);
    } else {
      // Wrap to first match on first page
      setPageNumber(pages[0]);
      setCurrentMatchIndex(0);
    }
  };

  const goToPreviousMatch = async () => {
    if (!pdfDocument || matchesPerPage.size === 0) return;
    
    const pages = Array.from(matchesPerPage.keys()).sort((a, b) => a - b);
    const currentPageIndex = pages.indexOf(pageNumber);
    
    if (currentPageIndex === -1) return;
    
    // Calculate total matches before current page
    let matchesBefore = 0;
    for (let i = 0; i < currentPageIndex; i++) {
      matchesBefore += matchesPerPage.get(pages[i]) || 0;
    }
    
    const currentMatchOnPage = currentMatchIndex - matchesBefore;
    
    if (currentMatchOnPage > 0) {
      // Move to previous match on same page
      setCurrentMatchIndex(currentMatchIndex - 1);
    } else if (currentPageIndex > 0) {
      // Move to last match on previous page with matches
      const prevPage = pages[currentPageIndex - 1];
      const matchesOnPrevPage = matchesPerPage.get(prevPage) || 0;
      setPageNumber(prevPage);
      setCurrentMatchIndex(matchesBefore - 1);
    } else {
      // Wrap to last match on last page
      const totalMatches = Array.from(matchesPerPage.values()).reduce((a, b) => a + b, 0);
      setPageNumber(pages[pages.length - 1]);
      setCurrentMatchIndex(totalMatches - 1);
    }
  };

  const goToPreviousPage = () => {
    setPageNumber((prev) => Math.max(prev - 1, 1));
  };

  const goToNextPage = () => {
    setPageNumber((prev) => Math.min(prev + 1, numPages));
  };

  const zoomIn = () => {
    setScale((prev) => Math.min(prev + 0.2, 2.0));
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(prev - 0.2, 0.5));
  };

  return (
    <Card className="w-full h-[calc(100vh-8rem)]">
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{filename}</CardTitle>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
          <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search in file..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-64"
            />
            <Button 
              variant="outline" 
              size="icon" 
              onClick={handleSearch}
              disabled={!searchQuery.trim()}
            >
              <Search className="h-4 w-4" />
            </Button>
            {matchesPerPage.size > 0 && (
              <>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={goToPreviousMatch}
                  title="Previous match"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm px-2">
                  Match {currentMatchIndex + 1} of {Array.from(matchesPerPage.values()).reduce((a, b) => a + b, 0)}
                </span>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={goToNextMatch}
                  title="Next match"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={goToPreviousPage} disabled={pageNumber <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm px-3">
              Page {pageNumber} of {numPages}
            </span>
            <Button variant="outline" size="icon" onClick={goToNextPage} disabled={pageNumber >= numPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={zoomOut} disabled={scale <= 0.5}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm px-2">{Math.round(scale * 100)}%</span>
            <Button variant="outline" size="icon" onClick={zoomIn} disabled={scale >= 2.0}>
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <ScrollArea className="h-[calc(100vh-18rem)] w-full">
          <div className="flex justify-center">
            <Document
              file={url}
              onLoadSuccess={(pdf) => {
                onDocumentLoadSuccess(pdf);
                setPdfDocument(pdf);
              }}
              loading={
                <div className="flex items-center justify-center p-8">
                  <div className="text-muted-foreground">Loading PDF...</div>
                </div>
              }
              error={
                <div className="flex items-center justify-center p-8">
                  <div className="text-destructive">Failed to load PDF</div>
                </div>
              }
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                customTextRenderer={textRenderer(activeSearchQuery)}
              />
            </Document>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
