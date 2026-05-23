-- Create analytics_queries table to track all AI queries
CREATE TABLE IF NOT EXISTS public.analytics_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  response_length INTEGER,
  documents_referenced INTEGER DEFAULT 0,
  execution_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create analytics_document_access table to track document references
CREATE TABLE IF NOT EXISTS public.analytics_document_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  query_id UUID REFERENCES public.analytics_queries(id) ON DELETE CASCADE,
  relevance_score FLOAT,
  accessed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for analytics queries
CREATE INDEX IF NOT EXISTS analytics_queries_user_id_idx ON public.analytics_queries(user_id);
CREATE INDEX IF NOT EXISTS analytics_queries_created_at_idx ON public.analytics_queries(created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_queries_conversation_id_idx ON public.analytics_queries(conversation_id);

-- Create indexes for document access
CREATE INDEX IF NOT EXISTS analytics_document_access_user_id_idx ON public.analytics_document_access(user_id);
CREATE INDEX IF NOT EXISTS analytics_document_access_document_id_idx ON public.analytics_document_access(document_id);
CREATE INDEX IF NOT EXISTS analytics_document_access_accessed_at_idx ON public.analytics_document_access(accessed_at DESC);

-- Enable RLS
ALTER TABLE public.analytics_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_document_access ENABLE ROW LEVEL SECURITY;

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

-- Create function to get popular queries
CREATE OR REPLACE FUNCTION public.get_popular_queries(
  filter_user_id UUID DEFAULT NULL,
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  query_text TEXT,
  query_count BIGINT,
  avg_response_length FLOAT,
  avg_documents_referenced FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    aq.query_text,
    COUNT(*)::BIGINT as query_count,
    AVG(aq.response_length)::FLOAT as avg_response_length,
    AVG(aq.documents_referenced)::FLOAT as avg_documents_referenced
  FROM analytics_queries aq
  WHERE 
    (filter_user_id IS NULL OR aq.user_id = filter_user_id)
    AND aq.created_at > now() - interval '30 days'
  GROUP BY aq.query_text
  ORDER BY query_count DESC, aq.query_text
  LIMIT limit_count;
END;
$$;

-- Create function to get document access stats
CREATE OR REPLACE FUNCTION public.get_document_access_stats(
  filter_user_id UUID DEFAULT NULL,
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  document_id UUID,
  document_title TEXT,
  access_count BIGINT,
  avg_relevance FLOAT,
  last_accessed TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ada.document_id,
    d.title as document_title,
    COUNT(*)::BIGINT as access_count,
    AVG(ada.relevance_score)::FLOAT as avg_relevance,
    MAX(ada.accessed_at) as last_accessed
  FROM analytics_document_access ada
  JOIN documents d ON d.id = ada.document_id
  WHERE 
    (filter_user_id IS NULL OR ada.user_id = filter_user_id)
    AND ada.accessed_at > now() - interval '30 days'
  GROUP BY ada.document_id, d.title
  ORDER BY access_count DESC, last_accessed DESC
  LIMIT limit_count;
END;
$$;