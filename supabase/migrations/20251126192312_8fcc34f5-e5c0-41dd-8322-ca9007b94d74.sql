-- Add CASCADE delete to document_embeddings foreign key
-- This ensures that when a document is deleted, all its embeddings are automatically removed

-- First, drop the existing foreign key constraint
ALTER TABLE public.document_embeddings 
DROP CONSTRAINT IF EXISTS document_embeddings_document_id_fkey;

-- Recreate the foreign key with ON DELETE CASCADE
ALTER TABLE public.document_embeddings 
ADD CONSTRAINT document_embeddings_document_id_fkey 
FOREIGN KEY (document_id) 
REFERENCES public.documents(id) 
ON DELETE CASCADE;

-- Add a comment to document the behavior
COMMENT ON CONSTRAINT document_embeddings_document_id_fkey ON public.document_embeddings 
IS 'Automatically deletes all embeddings when parent document is deleted';