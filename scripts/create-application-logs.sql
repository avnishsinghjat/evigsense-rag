-- Recovery: recreate application_logs after a partial bootstrap migration.
-- Safe to re-run; uses IF NOT EXISTS / DROP-IF-EXISTS for policies.

CREATE TABLE IF NOT EXISTS public.application_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  level TEXT NOT NULL CHECK (level IN ('debug','info','warn','error','fatal')),
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  context JSONB,
  user_id UUID,
  session_id TEXT,
  url TEXT,
  user_agent TEXT,
  ip_address TEXT
);

ALTER TABLE public.application_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own logs" ON public.application_logs;
CREATE POLICY "Users can view their own logs" ON public.application_logs
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Admins can view all logs" ON public.application_logs;
CREATE POLICY "Admins can view all logs" ON public.application_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Service role can insert logs" ON public.application_logs;
CREATE POLICY "Service role can insert logs" ON public.application_logs
  FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_application_logs_created_at ON public.application_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_logs_level ON public.application_logs(level);
CREATE INDEX IF NOT EXISTS idx_application_logs_user_id ON public.application_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_application_logs_source ON public.application_logs(source);

CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.application_logs WHERE created_at < now() - interval '30 days';
END;
$$;
