-- Add page_number column to document_embeddings table
ALTER TABLE public.document_embeddings 
ADD COLUMN page_number integer;

-- Add index for better query performance when filtering by page
CREATE INDEX idx_document_embeddings_page_number ON public.document_embeddings(document_id, page_number);

COMMENT ON COLUMN public.document_embeddings.page_number IS 'The page number where this text chunk originates from in the source document';