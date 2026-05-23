-- Update document_embeddings table to support 4096-dimensional vectors
-- Note: Cannot create index due to pgvector 2000-dimension limit
-- Searches will use sequential scan (slower but accurate)

-- Drop the existing embedding column
ALTER TABLE public.document_embeddings 
DROP COLUMN IF EXISTS embedding;

-- Add the embedding column back with 4096 dimensions (no index)
ALTER TABLE public.document_embeddings 
ADD COLUMN embedding vector(4096);