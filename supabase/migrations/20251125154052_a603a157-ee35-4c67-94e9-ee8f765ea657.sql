-- Create table for PDF conversion history
CREATE TABLE IF NOT EXISTS public.pdf_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  original_filename TEXT NOT NULL,
  original_file_path TEXT NOT NULL,
  converted_file_path TEXT,
  page_count INTEGER,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.pdf_conversions ENABLE ROW LEVEL SECURITY;

-- Users can view their own conversions
CREATE POLICY "Users can view their own conversions"
  ON public.pdf_conversions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own conversions
CREATE POLICY "Users can insert their own conversions"
  ON public.pdf_conversions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own conversions
CREATE POLICY "Users can update their own conversions"
  ON public.pdf_conversions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can view all conversions
CREATE POLICY "Admins can view all conversions"
  ON public.pdf_conversions
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- Create index for faster queries
CREATE INDEX idx_pdf_conversions_user_created ON public.pdf_conversions(user_id, created_at DESC);