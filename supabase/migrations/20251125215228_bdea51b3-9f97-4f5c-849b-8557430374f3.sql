-- Add DELETE policy for pdf_conversions table so users can delete their own conversions
CREATE POLICY "Users can delete their own conversions"
ON public.pdf_conversions
FOR DELETE
USING (auth.uid() = user_id);