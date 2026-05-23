-- Create storage policies for documents bucket to allow OCR uploads

-- Policy to allow authenticated users to upload files to their own folder
CREATE POLICY "Users can upload to their own OCR folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = 'ocr'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy to allow authenticated users to read their own OCR files
CREATE POLICY "Users can read their own OCR files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = 'ocr'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy to allow authenticated users to delete their own OCR files
CREATE POLICY "Users can delete their own OCR files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = 'ocr'
  AND (storage.foldername(name))[2] = auth.uid()::text
);