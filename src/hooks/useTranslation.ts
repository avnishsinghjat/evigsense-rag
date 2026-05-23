import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type LanguageDirection = "ru-en" | "en-ru";

export interface TranslationStats {
  totalCells: number;
  translatedCells: number;
  skippedCells: number;
}

const BATCH_SIZE = 100; // LLM can handle larger batches efficiently

export function useTranslation() {
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<TranslationStats | null>(null);

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

  const translateFile = async (
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

      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      // Collect all cells to translate
      interface CellInfo {
        sheetName: string;
        address: string;
        value: string;
      }
      
      const cellsToTranslate: CellInfo[] = [];
      const skippedCells: CellInfo[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
        
        for (let row = range.s.r; row <= range.e.r; row++) {
          for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
            const cell = sheet[cellAddress];
            
            if (cell && cell.t === "s" && cell.v && typeof cell.v === "string" && cell.v.trim()) {
              const text = cell.v;
              
              // Skip if text is just numbers or special characters
              if (/^[\d\s\-\/\.\,\:\;\!\?\@\#\$\%\^\&\*\(\)\[\]\{\}\+\=\_\<\>\~\`\'\"\\|]+$/.test(text)) {
                skippedCells.push({ sheetName, address: cellAddress, value: text });
              } else {
                cellsToTranslate.push({ sheetName, address: cellAddress, value: text });
              }
            }
          }
        }
      }

      const totalCells = cellsToTranslate.length + skippedCells.length;
      
      if (cellsToTranslate.length === 0) {
        toast.error("No text content found in the Excel file");
        setIsTranslating(false);
        return;
      }

      console.log(`Found ${cellsToTranslate.length} cells to translate, ${skippedCells.length} skipped`);
      
      let translatedCount = 0;
      const translatedValues = new Map<string, string>();

      // Process in batches
      for (let i = 0; i < cellsToTranslate.length; i += BATCH_SIZE) {
        const batch = cellsToTranslate.slice(i, i + BATCH_SIZE);
        const texts = batch.map(c => c.value);
        
        console.log(`Translating batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(cellsToTranslate.length / BATCH_SIZE)} (${texts.length} cells)`);
        
        try {
          const translated = await translateBatch(texts, sourceLanguage, targetLanguage);
          
          // Store translated values
          batch.forEach((cell, index) => {
            const key = `${cell.sheetName}:${cell.address}`;
            translatedValues.set(key, translated[index]);
          });
          
          translatedCount += batch.length;
          setProgress(Math.round((translatedCount / cellsToTranslate.length) * 100));
        } catch (error) {
          console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error);
          // Keep original values on error
          batch.forEach((cell) => {
            const key = `${cell.sheetName}:${cell.address}`;
            translatedValues.set(key, cell.value);
          });
          translatedCount += batch.length;
          setProgress(Math.round((translatedCount / cellsToTranslate.length) * 100));
        }
      }

      // Apply translations to workbook
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
        
        for (let row = range.s.r; row <= range.e.r; row++) {
          for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
            const key = `${sheetName}:${cellAddress}`;
            
            if (translatedValues.has(key)) {
              const cell = sheet[cellAddress];
              if (cell) {
                cell.v = translatedValues.get(key);
              }
            }
          }
        }
      }

      // Generate translated file
      const translatedBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const translatedBlob = new Blob([translatedBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const baseName = file.name.replace(/\.(xlsx|xls)$/i, "");
      const suffix = direction === "ru-en" ? "_EN" : "_RU";
      const translatedFilename = `${baseName}${suffix}.xlsx`;

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
        .upload(translatedPath, translatedBlob);

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
            total_cells: totalCells,
            translated_cells: cellsToTranslate.length,
            skipped_cells: skippedCells.length,
            file_size_bytes: file.size,
          });

        if (historyError) {
          console.error("Error saving to history:", historyError);
        }
      }

      // Download the translated file
      const url = URL.createObjectURL(translatedBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = translatedFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStats({
        totalCells,
        translatedCells: cellsToTranslate.length,
        skippedCells: skippedCells.length,
      });

      toast.success(`Translation complete! ${cellsToTranslate.length} cells translated.`);
      onComplete?.();
    } catch (error) {
      console.error("Translation error:", error);
      toast.error("Failed to translate the file. Please try again.");
    } finally {
      setIsTranslating(false);
    }
  };

  return {
    isTranslating,
    progress,
    stats,
    setStats,
    translateFile,
  };
}
