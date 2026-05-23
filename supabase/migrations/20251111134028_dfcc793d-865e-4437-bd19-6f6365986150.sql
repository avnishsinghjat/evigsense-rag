-- Create function to log audit entries
CREATE OR REPLACE FUNCTION public.log_audit_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- For INSERT operations
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.audit_log (user_id, action, target_type, target_id)
    VALUES (NEW.created_by, 'created', TG_TABLE_NAME, NEW.id);
    RETURN NEW;
  
  -- For UPDATE operations
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.audit_log (user_id, action, target_type, target_id)
    VALUES (NEW.created_by, 'updated', TG_TABLE_NAME, NEW.id);
    RETURN NEW;
  
  -- For DELETE operations
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.audit_log (user_id, action, target_type, target_id)
    VALUES (OLD.created_by, 'deleted', TG_TABLE_NAME, OLD.id);
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Create triggers for documents table
CREATE TRIGGER audit_documents_insert
AFTER INSERT ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.log_audit_entry();

CREATE TRIGGER audit_documents_update
AFTER UPDATE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.log_audit_entry();

CREATE TRIGGER audit_documents_delete
AFTER DELETE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.log_audit_entry();

-- Create RLS policy for users to insert their own audit logs
CREATE POLICY "Users can insert audit logs for their actions"
ON public.audit_log
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);