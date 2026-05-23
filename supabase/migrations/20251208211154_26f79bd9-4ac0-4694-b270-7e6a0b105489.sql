-- Add HNSW vector index for fast approximate nearest neighbor search
-- This dramatically improves similarity search performance at scale
CREATE INDEX IF NOT EXISTS idx_document_embeddings_hnsw 
ON public.document_embeddings 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Add index on chunk_index for ordered retrieval
CREATE INDEX IF NOT EXISTS idx_document_embeddings_chunk 
ON public.document_embeddings (document_id, chunk_index);