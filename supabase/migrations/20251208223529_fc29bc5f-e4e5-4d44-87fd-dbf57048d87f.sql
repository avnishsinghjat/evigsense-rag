-- Drop the existing SELECT policies for folders
DROP POLICY IF EXISTS "Users can view folders they have access to" ON public.folders;
DROP POLICY IF EXISTS "Admins can view all folders" ON public.folders;

-- Create updated policies that don't bypass folder_access for creators
CREATE POLICY "Admins can view all folders" 
ON public.folders 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view folders they have access to" 
ON public.folders 
FOR SELECT 
USING (has_folder_access(auth.uid(), id, 'view'::folder_access_level));

-- Also update the INSERT policy to allow users to create folders
-- (they'll get access via the trigger, not via created_by bypass)
DROP POLICY IF EXISTS "Users can create their own folders" ON public.folders;
CREATE POLICY "Users can create their own folders" 
ON public.folders 
FOR INSERT 
WITH CHECK (auth.uid() = created_by);