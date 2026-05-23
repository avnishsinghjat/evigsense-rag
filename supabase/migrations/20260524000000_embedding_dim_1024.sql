-- Migrate embedding vectors from OpenAI 1536-dim to local bge-m3 1024-dim.
-- Existing embeddings are truncated; re-embed all documents after applying this migration.

DROP INDEX IF EXISTS document_embeddings_embedding_idx;

TRUNCATE document_embeddings;

ALTER TABLE document_embeddings
  ALTER COLUMN embedding TYPE vector(1024);

CREATE INDEX document_embeddings_embedding_idx
  ON document_embeddings
  USING hnsw (embedding vector_cosine_ops);

DROP FUNCTION IF EXISTS public.search_documents_by_embedding(vector, double precision, integer, uuid);

CREATE OR REPLACE FUNCTION public.search_documents_by_embedding(
  query_embedding vector(1024),
  match_threshold double precision DEFAULT 0.7,
  match_count integer DEFAULT 5,
  filter_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  document_id uuid,
  document_title text,
  chunk_text text,
  similarity double precision,
  page_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.document_id,
    d.title AS document_title,
    de.chunk_text,
    1 - (de.embedding <=> query_embedding) AS similarity,
    de.page_number
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
