-- Add category field to folders table
ALTER TABLE public.folders 
ADD COLUMN category TEXT;

-- Update the get_folder_tree function to support category filtering
CREATE OR REPLACE FUNCTION public.get_folder_tree(
  root_folder_id UUID DEFAULT NULL, 
  user_id UUID DEFAULT NULL,
  filter_category TEXT DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  description TEXT,
  color TEXT,
  parent_id UUID,
  path TEXT,
  level INTEGER,
  category TEXT,
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
      f.category,
      f.created_at,
      f.updated_at
    FROM public.folders f
    WHERE 
      (root_folder_id IS NULL AND f.parent_id IS NULL OR f.parent_id = root_folder_id)
      AND (user_id IS NULL OR f.created_by = user_id)
      AND (filter_category IS NULL OR f.category = filter_category)
    
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
      f.category,
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
  GROUP BY ft.id, ft.name, ft.description, ft.color, ft.parent_id, ft.path, ft.level, ft.category, ft.created_at, ft.updated_at
  ORDER BY ft.level, ft.name;
END;
$$;