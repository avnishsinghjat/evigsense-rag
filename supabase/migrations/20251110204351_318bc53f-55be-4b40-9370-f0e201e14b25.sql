-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view signature requests for their documents" ON public.signature_requests;
DROP POLICY IF EXISTS "Users can view signers for requests they can access" ON public.document_signers;

-- Create security definer function to check signature request access
CREATE OR REPLACE FUNCTION public.can_access_signature_request(_signature_request_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.signature_requests sr
    WHERE sr.id = _signature_request_id
    AND (
      sr.requested_by = _user_id
      OR EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.id = sr.document_id AND d.created_by = _user_id
      )
    )
  );
$$;

-- Create security definer function to check if user is a signer
CREATE OR REPLACE FUNCTION public.is_signer_for_request(_signature_request_id uuid, _user_id uuid, _user_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.document_signers ds
    WHERE ds.signature_request_id = _signature_request_id
    AND (ds.signer_user_id = _user_id OR ds.signer_email = _user_email)
  );
$$;

-- Recreate signature_requests policy using security definer functions
CREATE POLICY "Users can view signature requests for their documents"
  ON public.signature_requests
  FOR SELECT
  USING (
    requested_by = auth.uid()
    OR can_access_signature_request(id, auth.uid())
    OR is_signer_for_request(id, auth.uid(), auth.email())
  );

-- Recreate document_signers policy using security definer function
CREATE POLICY "Users can view signers for requests they can access"
  ON public.document_signers
  FOR SELECT
  USING (
    can_access_signature_request(signature_request_id, auth.uid())
    OR signer_email = auth.email()
    OR signer_user_id = auth.uid()
  );