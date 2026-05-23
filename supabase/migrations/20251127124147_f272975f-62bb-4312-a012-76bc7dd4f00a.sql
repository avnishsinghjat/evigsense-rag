-- Update document_embeddings table to support 1536-dimensional vectors
ALTER TABLE public.document_embeddings 
ALTER COLUMN embedding TYPE vector(1536);