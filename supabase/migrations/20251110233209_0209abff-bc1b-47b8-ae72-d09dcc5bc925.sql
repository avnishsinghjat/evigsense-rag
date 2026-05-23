-- Allow signers to view documents they are requested to sign
CREATE POLICY "Signers can view documents they need to sign"
ON public.documents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM signature_requests sr
    JOIN document_signers ds ON ds.signature_request_id = sr.id
    WHERE sr.document_id = documents.id
    AND (ds.signer_email = auth.email() OR ds.signer_user_id = auth.uid())
  )
);