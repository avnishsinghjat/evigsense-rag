CREATE TABLE IF NOT EXISTS public.application_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level TEXT NOT NULL CHECK (level IN ('debug','info','warn','error','fatal')),
  source TEXT NOT NULL DEFAULT 'unknown',
  message TEXT NOT NULL,
  context JSONB,
  user_id UUID,
  session_id TEXT,
  url TEXT,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_application_logs_created_at ON public.application_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_logs_level ON public.application_logs (level);
CREATE INDEX IF NOT EXISTS idx_application_logs_user_id ON public.application_logs (user_id);

ALTER TABLE public.application_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') AND
     EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'has_role') THEN
    EXECUTE $p$
      CREATE POLICY "Admins can view logs"
      ON public.application_logs
      FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
    $p$;
  END IF;
END $$;