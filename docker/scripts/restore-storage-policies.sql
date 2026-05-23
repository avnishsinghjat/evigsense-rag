-- Re-create storage buckets + RLS policies after a clean storage-schema rebuild.
-- Idempotent (CONFLICT DO NOTHING / DROP POLICY IF EXISTS).
-- Mirrors the storage portions of these app migrations:
--   20251107100531, 20251112164402, 20251114123512,
--   20251208170731, 20260121174146, 20260507233921, 20260508120319

-- ===== Buckets =====
INSERT INTO storage.buckets (id, name, public) VALUES
  ('documents',       'documents',       false),
  ('template-images', 'template-images', true),
  ('chat-files',      'chat-files',      true),
  ('translations',    'translations',    false),
  ('document-images', 'document-images', true)
ON CONFLICT (id) DO NOTHING;

-- ===== documents bucket =====
DROP POLICY IF EXISTS "Users can upload their own documents"            ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own documents"              ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own documents"            ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to their own OCR folder"        ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own OCR files"              ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own OCR files"            ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload documents"   ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to read their documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update their documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete their documents" ON storage.objects;

CREATE POLICY "Users can upload their own documents" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can view their own documents" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can delete their own documents" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can upload to their own OCR folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = 'ocr' AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "Users can read their own OCR files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = 'ocr' AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "Users can delete their own OCR files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = 'ocr' AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "Allow authenticated users to upload documents" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents');
CREATE POLICY "Allow authenticated users to read their documents" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents');
CREATE POLICY "Allow authenticated users to update their documents" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documents') WITH CHECK (bucket_id = 'documents');
CREATE POLICY "Allow authenticated users to delete their documents" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents');

-- ===== template-images =====
DROP POLICY IF EXISTS "Authenticated users can upload template images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view template images"                ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own template images"     ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own template images"     ON storage.objects;

CREATE POLICY "Authenticated users can upload template images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'template-images');
CREATE POLICY "Anyone can view template images"                ON storage.objects FOR SELECT TO public        USING      (bucket_id = 'template-images');
CREATE POLICY "Users can update their own template images"     ON storage.objects FOR UPDATE TO authenticated USING      (bucket_id = 'template-images');
CREATE POLICY "Users can delete their own template images"     ON storage.objects FOR DELETE TO authenticated USING      (bucket_id = 'template-images');

-- ===== chat-files =====
DROP POLICY IF EXISTS "Authenticated users can upload chat files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view chat files"                ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own chat files"     ON storage.objects;

CREATE POLICY "Authenticated users can upload chat files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-files');
CREATE POLICY "Anyone can view chat files"                ON storage.objects FOR SELECT                  USING      (bucket_id = 'chat-files');
CREATE POLICY "Users can delete their own chat files"     ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ===== translations =====
DROP POLICY IF EXISTS "Users can upload their own translations" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own translations"   ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own translations" ON storage.objects;

CREATE POLICY "Users can upload their own translations" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'translations' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view their own translations"   ON storage.objects FOR SELECT
  USING (bucket_id = 'translations' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own translations" ON storage.objects FOR DELETE
  USING (bucket_id = 'translations' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ===== document-images =====
DROP POLICY IF EXISTS "Public can read document images"             ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own document images"  ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own document images"  ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own document images"  ON storage.objects;

CREATE POLICY "Public can read document images"            ON storage.objects FOR SELECT                  USING      (bucket_id = 'document-images');
CREATE POLICY "Users can upload their own document images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'document-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update their own document images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'document-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own document images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'document-images' AND auth.uid()::text = (storage.foldername(name))[1]);
