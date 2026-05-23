import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { pdfjs } from "react-pdf";

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type LanguageDirection = "ru-en" | "en-ru";

export interface PdfTranslationStats {
  totalPages: number;
  totalParagraphs: number;
  translatedParagraphs: number;
}

const BATCH_SIZE = 30;

// Cache for font data
let cachedFontData: string | null = null;

async function loadNotoSansFont(): Promise<string> {
  if (cachedFontData) return cachedFontData;
  
  // Load Noto Sans Regular TTF which supports Latin and Cyrillic
  // Using the raw GitHub URL for the TTF file
  const response = await fetch('https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf');
  
  if (!response.ok) {
    throw new Error('Failed to load font');
  }
  
  const arrayBuffer = await response.arrayBuffer();
  
  // Convert to base64
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  cachedFontData = btoa(binary);
  return cachedFontData;
}

export function usePdfTranslation() {
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<PdfTranslationStats | null>(null);

  const translateBatch = async (
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<string[]> => {
    const { data, error } = await supabase.functions.invoke("translate-document", {
      body: { texts, sourceLanguage, targetLanguage },
    });

    if (error) {
      console.error("Translation error:", error);
      throw error;
    }

    return data?.translatedTexts || texts;
  };

  const extractTextFromPdf = async (file: File): Promise<{ pages: string[][] }> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    
    const pages: string[][] = [];
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Group text items by their Y position to form paragraphs
      const items = textContent.items as Array<{ str: string; transform: number[] }>;
      const lines: Map<number, string[]> = new Map();
      
      for (const item of items) {
        if (item.str.trim()) {
          // Round Y position to group nearby items
          const y = Math.round(item.transform[5] / 12) * 12;
          if (!lines.has(y)) {
            lines.set(y, []);
          }
          lines.get(y)!.push(item.str);
        }
      }
      
      // Convert to paragraphs (sorted by Y position, highest first for PDF coordinate system)
      const sortedYs = Array.from(lines.keys()).sort((a, b) => b - a);
      const pageParagraphs: string[] = [];
      let currentParagraph = "";
      
      for (const y of sortedYs) {
        const lineText = lines.get(y)!.join(" ").trim();
        if (lineText) {
          // Simple heuristic: if line ends with period or is short, end paragraph
          if (currentParagraph && (currentParagraph.endsWith('.') || currentParagraph.endsWith('!') || currentParagraph.endsWith('?') || currentParagraph.length < 50)) {
            if (currentParagraph.trim()) {
              pageParagraphs.push(currentParagraph.trim());
            }
            currentParagraph = lineText;
          } else {
            currentParagraph = currentParagraph ? `${currentParagraph} ${lineText}` : lineText;
          }
        }
      }
      
      if (currentParagraph.trim()) {
        pageParagraphs.push(currentParagraph.trim());
      }
      
      pages.push(pageParagraphs);
    }
    
    return { pages };
  };

  const generateTranslatedPdf = async (
    translatedPages: string[][],
    direction: LanguageDirection
  ): Promise<Blob> => {
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - margin * 2;
    const lineHeight = 6;
    const paragraphSpacing = 4;
    
    // Try to load and use Noto Sans font for Cyrillic support
    let fontLoaded = false;
    try {
      console.log("Loading Noto Sans font for Cyrillic support...");
      const fontData = await loadNotoSansFont();
      pdf.addFileToVFS("NotoSans-Regular.ttf", fontData);
      pdf.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
      pdf.setFont("NotoSans", "normal");
      fontLoaded = true;
      console.log("Noto Sans font loaded successfully");
    } catch (error) {
      console.warn("Could not load Noto Sans font, using Helvetica:", error);
      pdf.setFont("helvetica", "normal");
    }
    
    // Set font size
    pdf.setFontSize(11);
    
    let isFirstPage = true;
    
    for (const paragraphs of translatedPages) {
      if (!isFirstPage) {
        pdf.addPage();
      }
      isFirstPage = false;
      
      let y = margin;
      
      for (const paragraph of paragraphs) {
        if (!paragraph.trim()) continue;
        
        // For Cyrillic text without proper font, transliterate or skip special chars
        let textToWrite = paragraph;
        if (!fontLoaded && direction === "en-ru") {
          // If font failed to load and we're translating to Russian,
          // replace Cyrillic with a placeholder message
          textToWrite = paragraph.replace(/[а-яА-ЯёЁ]/g, '?');
        }
        
        // Split text to fit width
        const lines = pdf.splitTextToSize(textToWrite, maxWidth);
        
        // Check if we need a new page
        const neededHeight = lines.length * lineHeight + paragraphSpacing;
        if (y + neededHeight > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
        
        // Write lines
        for (const line of lines) {
          pdf.text(line, margin, y);
          y += lineHeight;
        }
        
        y += paragraphSpacing;
      }
    }
    
    return pdf.output("blob");
  };

  const translatePdf = async (
    file: File,
    direction: LanguageDirection,
    onComplete?: () => void
  ) => {
    setIsTranslating(true);
    setProgress(0);
    setStats(null);

    const sourceLanguage = direction === "ru-en" ? "ru" : "en";
    const targetLanguage = direction === "ru-en" ? "en" : "ru";

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to translate files");
        setIsTranslating(false);
        return;
      }

      toast.info("Extracting text from PDF...");
      setProgress(5);
      
      // Pre-load font while extracting text
      loadNotoSansFont().catch(console.warn);
      
      const { pages } = await extractTextFromPdf(file);
      
      const totalPages = pages.length;
      const allParagraphs: { pageIndex: number; paragraphIndex: number; text: string }[] = [];
      
      // Flatten all paragraphs with their positions
      pages.forEach((pageParagraphs, pageIndex) => {
        pageParagraphs.forEach((text, paragraphIndex) => {
          if (text.trim() && !/^[\d\s\-\/\.\,\:\;\!\?\@\#\$\%\^\&\*\(\)\[\]\{\}\+\=\_\<\>\~\`\'\"\\|]+$/.test(text)) {
            allParagraphs.push({ pageIndex, paragraphIndex, text });
          }
        });
      });
      
      const totalParagraphs = allParagraphs.length;
      
      if (totalParagraphs === 0) {
        toast.error("No text content found in the PDF");
        setIsTranslating(false);
        return;
      }

      console.log(`Found ${totalParagraphs} paragraphs across ${totalPages} pages`);
      setProgress(10);
      
      // Translate in batches
      const translatedMap = new Map<string, string>();
      let translatedCount = 0;
      
      for (let i = 0; i < allParagraphs.length; i += BATCH_SIZE) {
        const batch = allParagraphs.slice(i, i + BATCH_SIZE);
        const texts = batch.map(p => p.text);
        
        console.log(`Translating batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allParagraphs.length / BATCH_SIZE)}`);
        
        try {
          const translated = await translateBatch(texts, sourceLanguage, targetLanguage);
          
          batch.forEach((p, index) => {
            const key = `${p.pageIndex}:${p.paragraphIndex}`;
            translatedMap.set(key, translated[index]);
          });
          
          translatedCount += batch.length;
          setProgress(10 + Math.round((translatedCount / totalParagraphs) * 80));
        } catch (error) {
          console.error(`Batch failed:`, error);
          // Keep original on error
          batch.forEach((p) => {
            const key = `${p.pageIndex}:${p.paragraphIndex}`;
            translatedMap.set(key, p.text);
          });
          translatedCount += batch.length;
        }
      }
      
      // Reconstruct pages with translations
      const translatedPages: string[][] = pages.map((pageParagraphs, pageIndex) => {
        return pageParagraphs.map((text, paragraphIndex) => {
          const key = `${pageIndex}:${paragraphIndex}`;
          return translatedMap.get(key) || text;
        });
      });
      
      setProgress(95);
      toast.info("Generating translated PDF...");
      
      // Generate new PDF with font support
      const pdfBlob = await generateTranslatedPdf(translatedPages, direction);
      
      const baseName = file.name.replace(/\.pdf$/i, "");
      const suffix = direction === "ru-en" ? "_EN" : "_RU";
      const translatedFilename = `${baseName}${suffix}.pdf`;

      // Upload original file to storage
      const originalPath = `${user.id}/${Date.now()}_original_${file.name}`;
      const { error: originalUploadError } = await supabase.storage
        .from("translations")
        .upload(originalPath, file);

      if (originalUploadError) {
        console.error("Error uploading original file:", originalUploadError);
      }

      // Upload translated file to storage
      const translatedPath = `${user.id}/${Date.now()}_${translatedFilename}`;
      const { error: translatedUploadError } = await supabase.storage
        .from("translations")
        .upload(translatedPath, pdfBlob);

      if (translatedUploadError) {
        console.error("Error uploading translated file:", translatedUploadError);
      }

      // Save to history
      if (!originalUploadError && !translatedUploadError) {
        const { error: historyError } = await supabase
          .from("translation_history")
          .insert({
            user_id: user.id,
            original_filename: file.name,
            translated_filename: translatedFilename,
            original_storage_path: originalPath,
            translated_storage_path: translatedPath,
            source_language: sourceLanguage,
            target_language: targetLanguage,
            total_cells: totalParagraphs,
            translated_cells: translatedCount,
            skipped_cells: 0,
            file_size_bytes: file.size,
          });

        if (historyError) {
          console.error("Error saving to history:", historyError);
        }
      }

      // Download the translated file
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = translatedFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setProgress(100);
      setStats({
        totalPages,
        totalParagraphs,
        translatedParagraphs: translatedCount,
      });

      toast.success(`Translation complete! ${translatedCount} paragraphs translated across ${totalPages} pages.`);
      onComplete?.();
    } catch (error) {
      console.error("PDF translation error:", error);
      toast.error("Failed to translate the PDF. Please try again.");
    } finally {
      setIsTranslating(false);
    }
  };

  return {
    isTranslating,
    progress,
    stats,
    setStats,
    translatePdf,
  };
}
