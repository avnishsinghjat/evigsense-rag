-- Create public bucket for extracted document images
INSERT INTO storage.buckets (id, name, public)
VALUES ('document-images', 'document-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read
CREATE POLICY "Public can read document images"
ON storage.objects FOR SELECT
USING (bucket_id = 'document-images');

-- Authenticated users can upload to their own folder (first path segment = user id)
CREATE POLICY "Users can upload their own document images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'document-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own document images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'document-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own document images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'document-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);