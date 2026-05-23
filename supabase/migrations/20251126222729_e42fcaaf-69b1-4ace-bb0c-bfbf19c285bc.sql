-- Update RLS policies for tags table to allow users to create tags
DROP POLICY IF EXISTS "Admins can manage tags" ON public.tags;

-- Allow admins to manage all tags
CREATE POLICY "Admins can manage tags"
ON public.tags
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow authenticated users to insert tags
CREATE POLICY "Users can create tags"
ON public.tags
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow users to update tags (optional - you can restrict this if needed)
CREATE POLICY "Users can update tags"
ON public.tags
FOR UPDATE
TO authenticated
USING (true);

-- Allow users to delete tags (optional - you can restrict this if needed)
CREATE POLICY "Users can delete tags"
ON public.tags
FOR DELETE
TO authenticated
USING (true);