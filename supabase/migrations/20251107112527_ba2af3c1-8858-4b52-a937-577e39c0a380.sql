-- Create document_tags junction table for many-to-many relationship
CREATE TABLE public.document_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(document_id, tag_id)
);

ALTER TABLE public.document_tags ENABLE ROW LEVEL SECURITY;

-- Users can view tags on their own documents
CREATE POLICY "Users can view tags on their own documents"
  ON public.document_tags
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_tags.document_id
      AND documents.created_by = auth.uid()
    )
  );

-- Users can add tags to their own documents
CREATE POLICY "Users can add tags to their own documents"
  ON public.document_tags
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_tags.document_id
      AND documents.created_by = auth.uid()
    )
  );

-- Users can remove tags from their own documents
CREATE POLICY "Users can remove tags from their own documents"
  ON public.document_tags
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_tags.document_id
      AND documents.created_by = auth.uid()
    )
  );

-- Admins can view all document tags
CREATE POLICY "Admins can view all document tags"
  ON public.document_tags
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));