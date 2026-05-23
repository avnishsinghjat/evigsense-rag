-- Drop existing policies if they exist to recreate them
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can view their own analytics queries" ON public.analytics_queries;
  DROP POLICY IF EXISTS "Users can insert their own analytics queries" ON public.analytics_queries;
  DROP POLICY IF EXISTS "Admins can view all analytics queries" ON public.analytics_queries;
  DROP POLICY IF EXISTS "Users can view their own document access analytics" ON public.analytics_document_access;
  DROP POLICY IF EXISTS "Users can insert their own document access analytics" ON public.analytics_document_access;
  DROP POLICY IF EXISTS "Admins can view all document access analytics" ON public.analytics_document_access;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Analytics queries policies
CREATE POLICY "Users can view their own analytics queries"
  ON public.analytics_queries
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own analytics queries"
  ON public.analytics_queries
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all analytics queries"
  ON public.analytics_queries
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Analytics document access policies
CREATE POLICY "Users can view their own document access analytics"
  ON public.analytics_document_access
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own document access analytics"
  ON public.analytics_document_access
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all document access analytics"
  ON public.analytics_document_access
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));