-- Create document processing queue table
CREATE TABLE IF NOT EXISTS public.document_processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  priority INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for efficient queue queries
CREATE INDEX idx_queue_status_priority ON public.document_processing_queue(status, priority DESC, created_at ASC);
CREATE INDEX idx_queue_user_id ON public.document_processing_queue(user_id);
CREATE INDEX idx_queue_document_id ON public.document_processing_queue(document_id);

-- Enable RLS
ALTER TABLE public.document_processing_queue ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own queue items"
  ON public.document_processing_queue
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own queue items"
  ON public.document_processing_queue
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can update queue items"
  ON public.document_processing_queue
  FOR UPDATE
  USING (true);

-- Trigger to update updated_at
CREATE TRIGGER update_queue_updated_at
  BEFORE UPDATE ON public.document_processing_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();