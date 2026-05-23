-- Add summary column to documents table
ALTER TABLE public.documents
ADD COLUMN summary TEXT;

-- Add index for better performance when filtering by documents with summaries
CREATE INDEX IF NOT EXISTS documents_summary_idx ON public.documents(id) WHERE summary IS NOT NULL;