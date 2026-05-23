-- Add CASCADE delete to document_chunks foreign key
-- This ensures that when a document is deleted, all its chunks are automatically removed

-- First, drop the existing foreign key constraint
ALTER TABLE public.document_chunks 
DROP CONSTRAINT IF EXISTS document_chunks_document_id_fkey;

-- Recreate the foreign key with ON DELETE CASCADE
ALTER TABLE public.document_chunks 
ADD CONSTRAINT document_chunks_document_id_fkey 
FOREIGN KEY (document_id) 
REFERENCES public.documents(id) 
ON DELETE CASCADE;

-- Add a comment to document the behavior
COMMENT ON CONSTRAINT document_chunks_document_id_fkey ON public.document_chunks 
IS 'Automatically deletes all chunks when parent document is deleted';