-- Add delete policies for admins on audit tables
CREATE POLICY "Admins can delete audit logs"
ON public.audit_log
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete organization audit"
ON public.organization_audit
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));