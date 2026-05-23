-- Add metadata column to document_processing_queue for storing chunk information
ALTER TABLE public.document_processing_queue 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;