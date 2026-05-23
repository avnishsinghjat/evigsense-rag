-- Create signature requests table
CREATE TABLE public.signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  message TEXT,
  due_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create document signers table (who needs to sign)
CREATE TABLE public.document_signers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_request_id UUID NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
  signer_email TEXT NOT NULL,
  signer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'declined')),
  signed_at TIMESTAMP WITH TIME ZONE,
  declined_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create signatures table (actual signature data)
CREATE TABLE public.signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_signer_id UUID NOT NULL REFERENCES public.document_signers(id) ON DELETE CASCADE,
  signature_data TEXT NOT NULL, -- Base64 encoded signature image
  signature_type TEXT NOT NULL CHECK (signature_type IN ('drawn', 'typed', 'uploaded')),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Add indexes for performance
CREATE INDEX idx_signature_requests_document ON public.signature_requests(document_id);
CREATE INDEX idx_signature_requests_status ON public.signature_requests(status);
CREATE INDEX idx_document_signers_request ON public.document_signers(signature_request_id);
CREATE INDEX idx_document_signers_email ON public.document_signers(signer_email);
CREATE INDEX idx_document_signers_status ON public.document_signers(status);

-- Enable RLS
ALTER TABLE public.signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

-- RLS Policies for signature_requests
CREATE POLICY "Users can view signature requests for their documents"
  ON public.signature_requests FOR SELECT
  USING (
    requested_by = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM public.documents 
      WHERE documents.id = signature_requests.document_id 
      AND documents.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.document_signers
      WHERE document_signers.signature_request_id = signature_requests.id
      AND (document_signers.signer_email = auth.email() OR document_signers.signer_user_id = auth.uid())
    )
  );

CREATE POLICY "Users can create signature requests for their documents"
  ON public.signature_requests FOR INSERT
  WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.documents 
      WHERE documents.id = signature_requests.document_id 
      AND documents.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update their own signature requests"
  ON public.signature_requests FOR UPDATE
  USING (requested_by = auth.uid());

CREATE POLICY "Admins can view all signature requests"
  ON public.signature_requests FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for document_signers
CREATE POLICY "Users can view signers for requests they can access"
  ON public.document_signers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.signature_requests sr
      WHERE sr.id = document_signers.signature_request_id
      AND (
        sr.requested_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.documents 
          WHERE documents.id = sr.document_id 
          AND documents.created_by = auth.uid()
        )
      )
    )
    OR signer_email = auth.email()
    OR signer_user_id = auth.uid()
  );

CREATE POLICY "Request creators can add signers"
  ON public.document_signers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.signature_requests
      WHERE signature_requests.id = document_signers.signature_request_id
      AND signature_requests.requested_by = auth.uid()
    )
  );

CREATE POLICY "Signers can update their own status"
  ON public.document_signers FOR UPDATE
  USING (signer_email = auth.email() OR signer_user_id = auth.uid());

CREATE POLICY "Admins can view all signers"
  ON public.document_signers FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for signatures
CREATE POLICY "Users can view signatures for requests they can access"
  ON public.signatures FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.document_signers ds
      JOIN public.signature_requests sr ON sr.id = ds.signature_request_id
      WHERE ds.id = signatures.document_signer_id
      AND (
        sr.requested_by = auth.uid()
        OR ds.signer_email = auth.email()
        OR ds.signer_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.documents
          WHERE documents.id = sr.document_id
          AND documents.created_by = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Signers can create their own signatures"
  ON public.signatures FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.document_signers
      WHERE document_signers.id = signatures.document_signer_id
      AND (document_signers.signer_email = auth.email() OR document_signers.signer_user_id = auth.uid())
    )
  );

CREATE POLICY "Admins can view all signatures"
  ON public.signatures FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- Add trigger for updating updated_at
CREATE TRIGGER update_signature_requests_updated_at
  BEFORE UPDATE ON public.signature_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add a function to check if all signers have signed
CREATE OR REPLACE FUNCTION public.check_signature_request_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- Update signature request status if all signers have signed
  IF NEW.status = 'signed' THEN
    UPDATE public.signature_requests
    SET status = 'completed',
        updated_at = now()
    WHERE id = NEW.signature_request_id
    AND NOT EXISTS (
      SELECT 1 FROM public.document_signers
      WHERE signature_request_id = NEW.signature_request_id
      AND status = 'pending'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-complete signature requests
CREATE TRIGGER auto_complete_signature_request
  AFTER UPDATE ON public.document_signers
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.check_signature_request_completion();