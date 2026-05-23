-- Update document_embeddings table to support 1536-dimensional embeddings
ALTER TABLE public.document_embeddings 
ALTER COLUMN embedding TYPE vector(1536);

-- Update the search function to use the correct vector type
DROP FUNCTION IF EXISTS public.search_documents_by_embedding(vector, double precision, integer, uuid);

CREATE OR REPLACE FUNCTION public.search_documents_by_embedding(
  query_embedding vector(1536),
  match_threshold double precision DEFAULT 0.7,
  match_count integer DEFAULT 5,
  filter_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  document_id uuid,
  document_title text,
  chunk_text text,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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