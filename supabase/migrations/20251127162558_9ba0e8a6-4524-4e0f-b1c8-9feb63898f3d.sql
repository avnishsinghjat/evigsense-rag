-- Create table for enriched document metadata
CREATE TABLE IF NOT EXISTS public.document_enriched_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  
  -- File properties (inherent metadata)
  file_size_bytes BIGINT,
  file_type TEXT,
  creation_date TIMESTAMP WITH TIME ZONE,
  last_modified_date TIMESTAMP WITH TIME ZONE,
  page_count INTEGER,
  
  -- AI-extracted contextual metadata
  keywords TEXT[],
  detected_entities JSONB, -- Array of entities with types
  document_type TEXT,
  priority_indicator TEXT,
  confidence_score DECIMAL(3, 2),
  
  -- Timestamps
  extracted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_document_enriched_metadata UNIQUE(document_id)
);

-- Enable RLS
ALTER TABLE public.document_enriched_metadata ENABLE ROW LEVEL SECURITY;

-- Users can view enriched metadata for their own documents
CREATE POLICY "Users can view enriched metadata for their documents"
ON public.document_enriched_metadata
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.id = document_enriched_metadata.document_id
    AND documents.created_by = auth.uid()
  )
);

-- Users can insert enriched metadata for their own documents
CREATE POLICY "Users can insert enriched metadata for their documents"
ON public.document_enriched_metadata
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.id = document_enriched_metadata.document_id
    AND documents.created_by = auth.uid()
  )
);

-- Users can update enriched metadata for their own documents
CREATE POLICY "Users can update enriched metadata for their documents"
ON public.document_enriched_metadata
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.id = document_enriched_metadata.document_id
    AND documents.created_by = auth.uid()
  )
);

-- Users can delete enriched metadata for their own documents
CREATE POLICY "Users can delete enriched metadata for their documents"
ON public.document_enriched_metadata
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.id = document_enriched_metadata.document_id
    AND documents.created_by = auth.uid()
  )
);

-- Admins can view all enriched metadata
CREATE POLICY "Admins can view all enriched metadata"
ON public.document_enriched_metadata
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster lookups
CREATE INDEX idx_document_enriched_metadata_document_id ON public.document_enriched_metadata(document_id);

-- Add trigger for updated_at
CREATE TRIGGER update_document_enriched_metadata_updated_at
BEFORE UPDATE ON public.document_enriched_metadata
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();