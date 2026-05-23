-- Create document_versions table to track document history
CREATE TABLE public.document_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content_text TEXT,
  summary TEXT,
  storage_path TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  sensitivity TEXT NOT NULL DEFAULT 'internal',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  change_description TEXT,
  UNIQUE(document_id, version_number)
);

-- Enable Row Level Security
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

-- Create policies for document_versions
CREATE POLICY "Users can view versions of their own documents"
ON public.document_versions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.id = document_versions.document_id
    AND documents.created_by = auth.uid()
  )
);

CREATE POLICY "Users can insert versions for their own documents"
ON public.document_versions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.id = document_versions.document_id
    AND documents.created_by = auth.uid()
  )
);

CREATE POLICY "Admins can view all document versions"
ON public.document_versions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster version lookups
CREATE INDEX idx_document_versions_document_id ON public.document_versions(document_id, version_number DESC);

-- Create function to automatically create version on document update
CREATE OR REPLACE FUNCTION public.create_document_version()
RETURNS TRIGGER AS $$
DECLARE
  next_version INTEGER;
BEGIN
  -- Get the next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO next_version
  FROM public.document_versions
  WHERE document_id = OLD.id;
  
  -- Insert the old version
  INSERT INTO public.document_versions (
    document_id,
    version_number,
    title,
    content_text,
    summary,
    storage_path,
    original_filename,
    mime_type,
    status,
    sensitivity,
    created_by,
    created_at
  ) VALUES (
    OLD.id,
    next_version,
    OLD.title,
    OLD.content_text,
    OLD.summary,
    OLD.storage_path,
    OLD.original_filename,
    OLD.mime_type,
    OLD.status,
    OLD.sensitivity,
    OLD.created_by,
    OLD.updated_at
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to automatically version documents on update
CREATE TRIGGER create_document_version_trigger
BEFORE UPDATE ON public.documents
FOR EACH ROW
WHEN (
  OLD.title IS DISTINCT FROM NEW.title OR
  OLD.content_text IS DISTINCT FROM NEW.content_text OR
  OLD.summary IS DISTINCT FROM NEW.summary OR
  OLD.status IS DISTINCT FROM NEW.status OR
  OLD.sensitivity IS DISTINCT FROM NEW.sensitivity
)
EXECUTE FUNCTION public.create_document_version();