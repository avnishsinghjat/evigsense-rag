-- Create folders table
CREATE TABLE public.folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  parent_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
  path TEXT,
  level INTEGER DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT folders_name_parent_unique UNIQUE (name, parent_id, created_by)
);

-- Add folder_id to documents table
ALTER TABLE public.documents 
ADD COLUMN folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL;

-- Create index for faster folder queries
CREATE INDEX idx_folders_parent_id ON public.folders(parent_id);
CREATE INDEX idx_folders_created_by ON public.folders(created_by);
CREATE INDEX idx_folders_path ON public.folders(path);
CREATE INDEX idx_documents_folder_id ON public.documents(folder_id);

-- Function to automatically update folder path and level
CREATE OR REPLACE FUNCTION public.update_folder_path()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_path TEXT;
  parent_level INTEGER;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.path := '/' || NEW.id::text || '/';
    NEW.level := 0;
  ELSE
    SELECT path, level INTO parent_path, parent_level
    FROM public.folders
    WHERE id = NEW.parent_id;
    
    IF parent_path IS NULL THEN
      RAISE EXCEPTION 'Parent folder not found';
    END IF;
    
    NEW.path := parent_path || NEW.id::text || '/';
    NEW.level := parent_level + 1;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to update folder path on insert/update
CREATE TRIGGER trigger_update_folder_path
BEFORE INSERT OR UPDATE OF parent_id ON public.folders
FOR EACH ROW
EXECUTE FUNCTION public.update_folder_path();

-- Trigger to update updated_at timestamp
CREATE TRIGGER trigger_folders_updated_at
BEFORE UPDATE ON public.folders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on folders table
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for folders
CREATE POLICY "Users can view their own folders"
ON public.folders
FOR SELECT
USING (auth.uid() = created_by);

CREATE POLICY "Users can create their own folders"
ON public.folders
FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own folders"
ON public.folders
FOR UPDATE
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own folders"
ON public.folders
FOR DELETE
USING (auth.uid() = created_by);

CREATE POLICY "Admins can view all folders"
ON public.folders
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Function to get folder with document count and size
CREATE OR REPLACE FUNCTION public.get_folder_stats(folder_id UUID)
RETURNS TABLE(
  document_count BIGINT,
  total_size_bytes BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as document_count,
    0::BIGINT as total_size_bytes
  FROM public.documents
  WHERE documents.folder_id = get_folder_stats.folder_id;
END;
$$;

-- Function to get all subfolders recursively
CREATE OR REPLACE FUNCTION public.get_folder_tree(root_folder_id UUID DEFAULT NULL, user_id UUID DEFAULT NULL)
RETURNS TABLE(
  id UUID,
  name TEXT,
  description TEXT,
  color TEXT,
  parent_id UUID,
  path TEXT,
  level INTEGER,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  document_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE folder_tree AS (
    -- Base case: root folders or specified folder
    SELECT 
      f.id,
      f.name,
      f.description,
      f.color,
      f.parent_id,
      f.path,
      f.level,
      f.created_at,
      f.updated_at
    FROM public.folders f
    WHERE 
      (root_folder_id IS NULL AND f.parent_id IS NULL OR f.parent_id = root_folder_id)
      AND (user_id IS NULL OR f.created_by = user_id)
    
    UNION ALL
    
    -- Recursive case: child folders
    SELECT 
      f.id,
      f.name,
      f.description,
      f.color,
      f.parent_id,
      f.path,
      f.level,
      f.created_at,
      f.updated_at
    FROM public.folders f
    INNER JOIN folder_tree ft ON f.parent_id = ft.id
    WHERE (user_id IS NULL OR f.created_by = user_id)
  )
  SELECT 
    ft.*,
    COALESCE(COUNT(d.id), 0)::BIGINT as document_count
  FROM folder_tree ft
  LEFT JOIN public.documents d ON d.folder_id = ft.id
  GROUP BY ft.id, ft.name, ft.description, ft.color, ft.parent_id, ft.path, ft.level, ft.created_at, ft.updated_at
  ORDER BY ft.level, ft.name;
END;
$$;