
CREATE TABLE public.document_markdown (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  ocr_markdown text,
  translated_markdown text,
  target_language text,
  ocr_model text,
  translation_model text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id)
);

ALTER TABLE public.document_markdown ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own document_markdown"
  ON public.document_markdown FOR SELECT
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own document_markdown"
  ON public.document_markdown FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users update own document_markdown"
  ON public.document_markdown FOR UPDATE
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users delete own document_markdown"
  ON public.document_markdown FOR DELETE
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_document_markdown_updated_at
  BEFORE UPDATE ON public.document_markdown
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_document_markdown_document_id ON public.document_markdown(document_id);
CREATE INDEX idx_document_markdown_created_by ON public.document_markdown(created_by);
