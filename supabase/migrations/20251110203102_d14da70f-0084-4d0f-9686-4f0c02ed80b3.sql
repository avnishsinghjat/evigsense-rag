-- Create metadata field definitions table
CREATE TABLE public.metadata_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'dropdown', 'multiselect', 'boolean')),
  options JSONB, -- For dropdown/multiselect field types
  is_required BOOLEAN DEFAULT false,
  default_value TEXT,
  help_text TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create document metadata values table
CREATE TABLE public.document_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.metadata_field_definitions(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(document_id, field_id)
);

-- Create taxonomies table (hierarchical categories)
CREATE TABLE public.taxonomies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES public.taxonomies(id) ON DELETE CASCADE,
  path TEXT, -- Materialized path for hierarchy (e.g., /1/2/3/)
  level INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create document taxonomies linking table
CREATE TABLE public.document_taxonomies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  taxonomy_id UUID NOT NULL REFERENCES public.taxonomies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(document_id, taxonomy_id)
);

-- Add indexes for performance
CREATE INDEX idx_metadata_field_definitions_active ON public.metadata_field_definitions(is_active);
CREATE INDEX idx_metadata_field_definitions_order ON public.metadata_field_definitions(display_order);
CREATE INDEX idx_document_metadata_document ON public.document_metadata(document_id);
CREATE INDEX idx_document_metadata_field ON public.document_metadata(field_id);
CREATE INDEX idx_taxonomies_parent ON public.taxonomies(parent_id);
CREATE INDEX idx_taxonomies_path ON public.taxonomies(path);
CREATE INDEX idx_taxonomies_active ON public.taxonomies(is_active);
CREATE INDEX idx_document_taxonomies_document ON public.document_taxonomies(document_id);
CREATE INDEX idx_document_taxonomies_taxonomy ON public.document_taxonomies(taxonomy_id);

-- Enable RLS
ALTER TABLE public.metadata_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxonomies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_taxonomies ENABLE ROW LEVEL SECURITY;

-- RLS Policies for metadata_field_definitions
CREATE POLICY "Anyone can view active metadata fields"
  ON public.metadata_field_definitions FOR SELECT
  USING (is_active = true);

CREATE POLICY "Users can create metadata fields"
  ON public.metadata_field_definitions FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own metadata fields"
  ON public.metadata_field_definitions FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Admins can view all metadata fields"
  ON public.metadata_field_definitions FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all metadata fields"
  ON public.metadata_field_definitions FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for document_metadata
CREATE POLICY "Users can view metadata for their documents"
  ON public.document_metadata FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_metadata.document_id
      AND documents.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can add metadata to their documents"
  ON public.document_metadata FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_metadata.document_id
      AND documents.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update metadata on their documents"
  ON public.document_metadata FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_metadata.document_id
      AND documents.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete metadata from their documents"
  ON public.document_metadata FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_metadata.document_id
      AND documents.created_by = auth.uid()
    )
  );

CREATE POLICY "Admins can view all document metadata"
  ON public.document_metadata FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for taxonomies
CREATE POLICY "Anyone can view active taxonomies"
  ON public.taxonomies FOR SELECT
  USING (is_active = true);

CREATE POLICY "Users can create taxonomies"
  ON public.taxonomies FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own taxonomies"
  ON public.taxonomies FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Admins can manage all taxonomies"
  ON public.taxonomies FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for document_taxonomies
CREATE POLICY "Users can view taxonomies for their documents"
  ON public.document_taxonomies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_taxonomies.document_id
      AND documents.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can add taxonomies to their documents"
  ON public.document_taxonomies FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_taxonomies.document_id
      AND documents.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can remove taxonomies from their documents"
  ON public.document_taxonomies FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_taxonomies.document_id
      AND documents.created_by = auth.uid()
    )
  );

CREATE POLICY "Admins can view all document taxonomies"
  ON public.document_taxonomies FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- Add triggers for updating updated_at
CREATE TRIGGER update_metadata_field_definitions_updated_at
  BEFORE UPDATE ON public.metadata_field_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_document_metadata_updated_at
  BEFORE UPDATE ON public.document_metadata
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_taxonomies_updated_at
  BEFORE UPDATE ON public.taxonomies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to update taxonomy path when parent changes
CREATE OR REPLACE FUNCTION public.update_taxonomy_path()
RETURNS TRIGGER AS $$
DECLARE
  parent_path TEXT;
  parent_level INTEGER;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.path := '/' || NEW.id::text || '/';
    NEW.level := 0;
  ELSE
    SELECT path, level INTO parent_path, parent_level
    FROM public.taxonomies
    WHERE id = NEW.parent_id;
    
    NEW.path := parent_path || NEW.id::text || '/';
    NEW.level := parent_level + 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to update taxonomy path
CREATE TRIGGER set_taxonomy_path
  BEFORE INSERT OR UPDATE ON public.taxonomies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_taxonomy_path();