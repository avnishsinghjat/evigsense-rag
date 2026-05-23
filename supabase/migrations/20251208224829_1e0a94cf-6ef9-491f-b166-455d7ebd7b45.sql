-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Service role can manage document chunks" ON public.document_chunks;

-- Create proper owner-scoped SELECT policy linking to parent document ownership
CREATE POLICY "Users can view chunks for their own documents"
ON public.document_chunks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.id = document_chunks.document_id
    AND documents.created_by = auth.uid()
  )
);

-- Admins can view all chunks
CREATE POLICY "Admins can view all document chunks"
ON public.document_chunks
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Service role INSERT policy for background processing (edge functions)
CREATE POLICY "Service role can insert document chunks"
ON public.document_chunks
FOR INSERT
WITH CHECK (true);

-- Service role UPDATE policy for background processing
CREATE POLICY "Service role can update document chunks"
ON public.document_chunks
FOR UPDATE
USING (true);

-- Service role DELETE policy for cleanup
CREATE POLICY "Service role can delete document chunks"
ON public.document_chunks
FOR DELETE
USING (true);