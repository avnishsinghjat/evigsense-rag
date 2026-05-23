-- Create a trigger to automatically grant 'manage' access to folder creator
CREATE OR REPLACE FUNCTION public.grant_folder_creator_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert 'manage' access for the folder creator
  INSERT INTO public.folder_access (folder_id, user_id, access_level, granted_by)
  VALUES (NEW.id, NEW.created_by, 'manage', NEW.created_by);
  
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS on_folder_created ON public.folders;
CREATE TRIGGER on_folder_created
  AFTER INSERT ON public.folders
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_folder_creator_access();

-- Backfill: Add 'manage' access for existing folder creators who don't have it
INSERT INTO public.folder_access (folder_id, user_id, access_level, granted_by)
SELECT f.id, f.created_by, 'manage', f.created_by
FROM public.folders f
WHERE NOT EXISTS (
  SELECT 1 FROM public.folder_access fa 
  WHERE fa.folder_id = f.id AND fa.user_id = f.created_by
);