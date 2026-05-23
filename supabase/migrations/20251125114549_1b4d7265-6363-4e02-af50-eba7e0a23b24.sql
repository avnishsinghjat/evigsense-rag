-- Update document_embeddings to support 1536-dimensional vectors with HNSW index
-- This allows for faster indexed searches with text-embedding-3-large model

-- Drop the existing embedding column
ALTER TABLE public.document_embeddings 
DROP COLUMN IF EXISTS embedding;

-- Add the embedding column back with 1536 dimensions
ALTER TABLE public.document_embeddings 
ADD COLUMN embedding vector(1536);

-- Create HNSW index for fast similarity search
CREATE INDEX IF NOT EXISTS document_embeddings_embedding_idx 
ON public.document_embeddings 
USING hnsw (embedding vector_cosine_ops);