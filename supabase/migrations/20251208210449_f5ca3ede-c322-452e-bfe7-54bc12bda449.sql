-- Create enum for folder access levels
CREATE TYPE public.folder_access_level AS ENUM ('view', 'edit', 'manage');

-- Create folder_access table to store user-folder permissions
CREATE TABLE public.folder_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_id UUID NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  access_level folder_access_level NOT NULL DEFAULT 'view',
  granted_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(folder_id, user_id)
);

-- Enable RLS
ALTER TABLE public.folder_access ENABLE ROW LEVEL SECURITY;

-- Create function to check folder access including inheritance from parent folders
CREATE OR REPLACE FUNCTION public.has_folder_access(
  _user_id UUID, 
  _folder_id UUID, 
  _required_level folder_access_level DEFAULT 'view'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  folder_path TEXT;
  parent_folder_id UUID;
  access_found folder_access_level;
BEGIN
  -- Admins always have access
  IF public.has_role(_user_id, 'admin') THEN
    RETURN TRUE;
  END IF;

  -- Check direct access to the folder
  SELECT access_level INTO access_found
  FROM public.folder_access
  WHERE folder_id = _folder_id AND user_id = _user_id;

  IF access_found IS NOT NULL THEN
    -- Check if access level meets requirement
    RETURN CASE 
      WHEN _required_level = 'view' THEN TRUE
      WHEN _required_level = 'edit' THEN access_found IN ('edit', 'manage')
      WHEN _required_level = 'manage' THEN access_found = 'manage'
      ELSE FALSE
    END;
  END IF;

  -- Check inherited access from parent folders
  SELECT parent_id INTO parent_folder_id
  FROM public.folders
  WHERE id = _folder_id;

  IF parent_folder_id IS NOT NULL THEN
    -- Recursively check parent folder access
    RETURN public.has_folder_access(_user_id, parent_folder_id, _required_level);
  END IF;

  RETURN FALSE;
END;
$$;

-- RLS Policies for folder_access table

-- Users with 'manage' access can view folder permissions
CREATE POLICY "Users with manage access can view folder permissions"
ON public.folder_access
FOR SELECT
USING (
  public.has_folder_access(auth.uid(), folder_id, 'manage') OR
  user_id = auth.uid()
);

-- Users with 'manage' access can grant permissions
CREATE POLICY "Users with manage access can grant permissions"
ON public.folder_access
FOR INSERT
WITH CHECK (
  public.has_folder_access(auth.uid(), folder_id, 'manage')
);

-- Users with 'manage' access can update permissions
CREATE POLICY "Users with manage access can update permissions"
ON public.folder_access
FOR UPDATE
USING (
  public.has_folder_access(auth.uid(), folder_id, 'manage')
);

-- Users with 'manage' access can revoke permissions
CREATE POLICY "Users with manage access can revoke permissions"
ON public.folder_access
FOR DELETE
USING (
  public.has_folder_access(auth.uid(), folder_id, 'manage')
);

-- Admins can do everything
CREATE POLICY "Admins can manage all folder access"
ON public.folder_access
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Update folders RLS policies to use the new access function
DROP POLICY IF EXISTS "Users can view their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can update their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can delete their own folders" ON public.folders;

-- New folder view policy based on access
CREATE POLICY "Users can view folders they have access to"
ON public.folders
FOR SELECT
USING (
  public.has_folder_access(auth.uid(), id, 'view') OR
  created_by = auth.uid()
);

-- New folder update policy based on access
CREATE POLICY "Users can update folders they can manage"
ON public.folders
FOR UPDATE
USING (
  public.has_folder_access(auth.uid(), id, 'manage')
);

-- New folder delete policy based on access
CREATE POLICY "Users can delete folders they can manage"
ON public.folders
FOR DELETE
USING (
  public.has_folder_access(auth.uid(), id, 'manage')
);

-- Update documents RLS to check folder access
DROP POLICY IF EXISTS "Users can view their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can update their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can delete their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can insert their own documents" ON public.documents;

-- Documents view policy - can view if created by user OR has folder access
CREATE POLICY "Users can view documents they own or have folder access"
ON public.documents
FOR SELECT
USING (
  created_by = auth.uid() OR
  (folder_id IS NOT NULL AND public.has_folder_access(auth.uid(), folder_id, 'view'))
);

-- Documents insert policy - can insert if owns document AND (no folder OR has folder edit access)
CREATE POLICY "Users can insert documents in accessible folders"
ON public.documents
FOR INSERT
WITH CHECK (
  created_by = auth.uid() AND
  (folder_id IS NULL OR public.has_folder_access(auth.uid(), folder_id, 'edit'))
);

-- Documents update policy - can update if created by user OR has folder edit access
CREATE POLICY "Users can update documents they own or have folder edit access"
ON public.documents
FOR UPDATE
USING (
  created_by = auth.uid() OR
  (folder_id IS NOT NULL AND public.has_folder_access(auth.uid(), folder_id, 'edit'))
);

-- Documents delete policy - can delete if created by user OR has folder manage access
CREATE POLICY "Users can delete documents they own or have folder manage access"
ON public.documents
FOR DELETE
USING (
  created_by = auth.uid() OR
  (folder_id IS NOT NULL AND public.has_folder_access(auth.uid(), folder_id, 'manage'))
);

-- Add trigger for updated_at
CREATE TRIGGER update_folder_access_updated_at
BEFORE UPDATE ON public.folder_access
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();