-- Allow authenticated users to upload files to documents bucket
CREATE POLICY "Allow authenticated users to upload documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Allow authenticated users to read their own documents
CREATE POLICY "Allow authenticated users to read their documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'documents');

-- Allow authenticated users to update their own documents
CREATE POLICY "Allow authenticated users to update their documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'documents')
WITH CHECK (bucket_id = 'documents');

-- Allow authenticated users to delete their own documents
CREATE POLICY "Allow authenticated users to delete their documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'documents');