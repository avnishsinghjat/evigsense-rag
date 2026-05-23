-- Create storage bucket for template images
INSERT INTO storage.buckets (id, name, public)
VALUES ('template-images', 'template-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for template images bucket
CREATE POLICY "Authenticated users can upload template images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'template-images');

CREATE POLICY "Anyone can view template images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'template-images');

CREATE POLICY "Users can update their own template images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'template-images');

CREATE POLICY "Users can delete their own template images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'template-images');