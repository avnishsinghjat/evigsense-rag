-- Create metadata templates table
CREATE TABLE public.metadata_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create junction table for template fields
CREATE TABLE public.metadata_template_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.metadata_templates(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.metadata_field_definitions(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(template_id, field_id)
);

-- Enable RLS
ALTER TABLE public.metadata_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metadata_template_fields ENABLE ROW LEVEL SECURITY;

-- RLS Policies for metadata_templates
CREATE POLICY "Anyone can view active templates"
  ON public.metadata_templates
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Users can view their own templates"
  ON public.metadata_templates
  FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Users can create templates"
  ON public.metadata_templates
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own templates"
  ON public.metadata_templates
  FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Admins can manage all templates"
  ON public.metadata_templates
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for metadata_template_fields
CREATE POLICY "Anyone can view template fields for active templates"
  ON public.metadata_template_fields
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.metadata_templates
      WHERE id = template_id AND is_active = true
    )
  );

CREATE POLICY "Users can manage fields for their own templates"
  ON public.metadata_template_fields
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.metadata_templates
      WHERE id = template_id AND created_by = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all template fields"
  ON public.metadata_template_fields
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes
CREATE INDEX idx_metadata_templates_created_by ON public.metadata_templates(created_by);
CREATE INDEX idx_metadata_templates_category ON public.metadata_templates(category);
CREATE INDEX idx_metadata_template_fields_template_id ON public.metadata_template_fields(template_id);
CREATE INDEX idx_metadata_template_fields_field_id ON public.metadata_template_fields(field_id);

-- Create trigger for updated_at
CREATE TRIGGER update_metadata_templates_updated_at
  BEFORE UPDATE ON public.metadata_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();