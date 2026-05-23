-- Enable pgvector extension for vector embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create document_embeddings table to store vector embeddings
CREATE TABLE IF NOT EXISTS public.document_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  embedding vector(768),
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for similarity search
CREATE INDEX IF NOT EXISTS document_embeddings_embedding_idx ON public.document_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create index for document lookups
CREATE INDEX IF NOT EXISTS document_embeddings_document_id_idx ON public.document_embeddings(document_id);

-- Enable RLS
ALTER TABLE public.document_embeddings ENABLE ROW LEVEL SECURITY;

-- Users can view embeddings for their own documents
CREATE POLICY "Users can view embeddings for their own documents"
  ON public.document_embeddings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_embeddings.document_id
      AND documents.created_by = auth.uid()
    )
  );

-- Users can insert embeddings for their own documents
CREATE POLICY "Users can insert embeddings for their own documents"
  ON public.document_embeddings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_embeddings.document_id
      AND documents.created_by = auth.uid()
    )
  );

-- Users can delete embeddings for their own documents
CREATE POLICY "Users can delete embeddings for their own documents"
  ON public.document_embeddings
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_embeddings.document_id
      AND documents.created_by = auth.uid()
    )
  );

-- Admins can view all embeddings
CREATE POLICY "Admins can view all embeddings"
  ON public.document_embeddings
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create function for similarity search
CREATE OR REPLACE FUNCTION public.search_documents_by_embedding(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  filter_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  document_id uuid,
  document_title text,
  chunk_text text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    de.document_id,
    d.title as document_title,
    de.chunk_text,
    1 - (de.embedding <=> query_embedding) as similarity
  FROM document_embeddings de
  JOIN documents d ON de.document_id = d.id
  WHERE 
    (filter_user_id IS NULL OR d.created_by = filter_user_id)
    AND d.status = 'active'
    AND 1 - (de.embedding <=> query_embedding) > match_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create trigger to update updated_at
CREATE TRIGGER update_document_embeddings_updated_at
  BEFORE UPDATE ON public.document_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();