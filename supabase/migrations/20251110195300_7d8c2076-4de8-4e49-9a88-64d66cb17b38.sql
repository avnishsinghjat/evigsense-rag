-- Add is_editable column to documents table
ALTER TABLE public.documents 
ADD COLUMN is_editable BOOLEAN DEFAULT false;

-- Add index for faster queries on editable documents
CREATE INDEX idx_documents_is_editable ON public.documents(is_editable);

-- Update existing PDF documents to be editable by default
UPDATE public.documents 
SET is_editable = true 
WHERE mime_type = 'application/pdf';