-- Create table for organizational rules
CREATE TABLE IF NOT EXISTS public.organization_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Rule conditions (JSON structure)
  conditions JSONB NOT NULL,
  -- Example: {"document_type": "invoice", "priority_indicator": "high", "keywords_contains": ["urgent"]}
  
  -- Rule actions
  target_folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  
  CONSTRAINT unique_rule_name UNIQUE(name, created_by)
);

-- Create table for organization audit trail
CREATE TABLE IF NOT EXISTS public.organization_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.organization_rules(id) ON DELETE SET NULL,
  
  -- What happened
  action TEXT NOT NULL, -- 'folder_assigned', 'folder_moved', 'manual_move'
  from_folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  to_folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  
  -- Why it happened
  reason TEXT,
  metadata_snapshot JSONB,
  
  -- When and who
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  performed_by UUID,
  
  -- Automatic or manual
  is_automatic BOOLEAN NOT NULL DEFAULT false
);

-- Enable RLS on organization_rules
ALTER TABLE public.organization_rules ENABLE ROW LEVEL SECURITY;

-- Users can view their own rules
CREATE POLICY "Users can view their own rules"
ON public.organization_rules
FOR SELECT
USING (auth.uid() = created_by);

-- Users can create their own rules
CREATE POLICY "Users can create their own rules"
ON public.organization_rules
FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- Users can update their own rules
CREATE POLICY "Users can update their own rules"
ON public.organization_rules
FOR UPDATE
USING (auth.uid() = created_by);

-- Users can delete their own rules
CREATE POLICY "Users can delete their own rules"
ON public.organization_rules
FOR DELETE
USING (auth.uid() = created_by);

-- Admins can view all rules
CREATE POLICY "Admins can view all rules"
ON public.organization_rules
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable RLS on organization_audit
ALTER TABLE public.organization_audit ENABLE ROW LEVEL SECURITY;

-- Users can view audit trail for their own documents
CREATE POLICY "Users can view audit for their documents"
ON public.organization_audit
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.documents
    WHERE documents.id = organization_audit.document_id
    AND documents.created_by = auth.uid()
  )
);

-- Service can insert audit records
CREATE POLICY "Service can insert audit records"
ON public.organization_audit
FOR INSERT
WITH CHECK (true);

-- Admins can view all audit records
CREATE POLICY "Admins can view all audit"
ON public.organization_audit
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes
CREATE INDEX idx_organization_rules_active ON public.organization_rules(is_active, priority DESC);
CREATE INDEX idx_organization_audit_document ON public.organization_audit(document_id, performed_at DESC);
CREATE INDEX idx_organization_audit_rule ON public.organization_audit(rule_id);

-- Add trigger for updated_at
CREATE TRIGGER update_organization_rules_updated_at
BEFORE UPDATE ON public.organization_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();