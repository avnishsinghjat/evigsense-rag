-- Create document_templates table
CREATE TABLE public.document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  template_type TEXT NOT NULL, -- 'blank', 'text', 'form'
  content TEXT, -- For text templates
  fields JSONB, -- For form templates (field definitions)
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_public BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own templates"
  ON public.document_templates
  FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Users can view public templates"
  ON public.document_templates
  FOR SELECT
  USING (is_public = true);

CREATE POLICY "Users can create their own templates"
  ON public.document_templates
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own templates"
  ON public.document_templates
  FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own templates"
  ON public.document_templates
  FOR DELETE
  USING (auth.uid() = created_by);

CREATE POLICY "Admins can view all templates"
  ON public.document_templates
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes
CREATE INDEX idx_templates_created_by ON public.document_templates(created_by);
CREATE INDEX idx_templates_category ON public.document_templates(category);
CREATE INDEX idx_templates_is_public ON public.document_templates(is_public);

-- Add trigger for updated_at
CREATE TRIGGER update_templates_updated_at
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();