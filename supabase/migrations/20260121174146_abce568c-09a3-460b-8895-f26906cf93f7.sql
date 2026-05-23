-- Create translation_history table
CREATE TABLE public.translation_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  original_filename TEXT NOT NULL,
  translated_filename TEXT NOT NULL,
  original_storage_path TEXT NOT NULL,
  translated_storage_path TEXT NOT NULL,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  total_cells INTEGER NOT NULL DEFAULT 0,
  translated_cells INTEGER NOT NULL DEFAULT 0,
  skipped_cells INTEGER NOT NULL DEFAULT 0,
  file_size_bytes BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.translation_history ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own translation history"
ON public.translation_history
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own translation history"
ON public.translation_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own translation history"
ON public.translation_history
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all translation history"
ON public.translation_history
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create storage bucket for translations
INSERT INTO storage.buckets (id, name, public) 
VALUES ('translations', 'translations', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for translations bucket
CREATE POLICY "Users can upload their own translations"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'translations' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own translations"
ON storage.objects
FOR SELECT
USING (bucket_id = 'translations' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own translations"
ON storage.objects
FOR DELETE
USING (bucket_id = 'translations' AND auth.uid()::text = (storage.foldername(name))[1]);