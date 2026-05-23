
-- ===== Drop pre-existing application_logs (recreated below with proper schema) =====
DROP TABLE IF EXISTS public.application_logs CASCADE;

-- ===== Extension =====
CREATE EXTENSION IF NOT EXISTS vector;

-- ===== Enums =====
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin','moderator','user'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.folder_access_level AS ENUM ('view','edit','manage'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== Helper functions =====
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ===== user_roles =====
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ===== tags =====
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view tags" ON public.tags FOR SELECT USING (true);
CREATE POLICY "Admins can manage tags" ON public.tags FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users can create tags" ON public.tags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update tags" ON public.tags FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete tags" ON public.tags FOR DELETE TO authenticated USING (true);

-- ===== folders (created early so documents.folder_id can reference) =====
CREATE TABLE IF NOT EXISTS public.folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  parent_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
  path TEXT,
  level INTEGER DEFAULT 0,
  category TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT folders_name_parent_unique UNIQUE (name, parent_id, created_by)
);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON public.folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_created_by ON public.folders(created_by);
CREATE INDEX IF NOT EXISTS idx_folders_path ON public.folders(path);
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_folder_path()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE parent_path TEXT; parent_level INTEGER;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.path := '/' || NEW.id::text || '/'; NEW.level := 0;
  ELSE
    SELECT path, level INTO parent_path, parent_level FROM public.folders WHERE id = NEW.parent_id;
    IF parent_path IS NULL THEN RAISE EXCEPTION 'Parent folder not found'; END IF;
    NEW.path := parent_path || NEW.id::text || '/'; NEW.level := parent_level + 1;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trigger_update_folder_path BEFORE INSERT OR UPDATE OF parent_id ON public.folders
FOR EACH ROW EXECUTE FUNCTION public.update_folder_path();
CREATE TRIGGER trigger_folders_updated_at BEFORE UPDATE ON public.folders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== documents =====
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  status TEXT DEFAULT 'draft',
  sensitivity TEXT DEFAULT 'internal',
  content_text TEXT,
  summary TEXT,
  is_editable BOOLEAN DEFAULT false,
  page_map JSONB DEFAULT '[]'::jsonb,
  folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_summary_idx ON public.documents(id) WHERE summary IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_is_editable ON public.documents(is_editable);
CREATE INDEX IF NOT EXISTS idx_documents_folder_id ON public.documents(folder_id);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== folder_access (depends on folders) =====
CREATE TABLE IF NOT EXISTS public.folder_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  access_level folder_access_level NOT NULL DEFAULT 'view',
  granted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(folder_id, user_id)
);
ALTER TABLE public.folder_access ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_folder_access_updated_at BEFORE UPDATE ON public.folder_access
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.has_folder_access(_user_id UUID, _folder_id UUID, _required_level folder_access_level DEFAULT 'view')
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE parent_folder_id UUID; access_found folder_access_level;
BEGIN
  IF public.has_role(_user_id, 'admin') THEN RETURN TRUE; END IF;
  SELECT access_level INTO access_found FROM public.folder_access WHERE folder_id = _folder_id AND user_id = _user_id;
  IF access_found IS NOT NULL THEN
    RETURN CASE
      WHEN _required_level = 'view' THEN TRUE
      WHEN _required_level = 'edit' THEN access_found IN ('edit','manage')
      WHEN _required_level = 'manage' THEN access_found = 'manage'
      ELSE FALSE END;
  END IF;
  SELECT parent_id INTO parent_folder_id FROM public.folders WHERE id = _folder_id;
  IF parent_folder_id IS NOT NULL THEN RETURN public.has_folder_access(_user_id, parent_folder_id, _required_level); END IF;
  RETURN FALSE;
END; $$;

-- folders RLS (final version)
CREATE POLICY "Admins can view all folders" ON public.folders FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users can view folders they have access to" ON public.folders FOR SELECT USING (public.has_folder_access(auth.uid(), id, 'view'));
CREATE POLICY "Users can create their own folders" ON public.folders FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update folders they can manage" ON public.folders FOR UPDATE USING (public.has_folder_access(auth.uid(), id, 'manage'));
CREATE POLICY "Users can delete folders they can manage" ON public.folders FOR DELETE USING (public.has_folder_access(auth.uid(), id, 'manage'));

-- folder_access RLS
CREATE POLICY "Users with manage access can view folder permissions" ON public.folder_access FOR SELECT USING (public.has_folder_access(auth.uid(), folder_id, 'manage') OR user_id = auth.uid());
CREATE POLICY "Users with manage access can grant permissions" ON public.folder_access FOR INSERT WITH CHECK (public.has_folder_access(auth.uid(), folder_id, 'manage'));
CREATE POLICY "Users with manage access can update permissions" ON public.folder_access FOR UPDATE USING (public.has_folder_access(auth.uid(), folder_id, 'manage'));
CREATE POLICY "Users with manage access can revoke permissions" ON public.folder_access FOR DELETE USING (public.has_folder_access(auth.uid(), folder_id, 'manage'));
CREATE POLICY "Admins can manage all folder access" ON public.folder_access FOR ALL USING (public.has_role(auth.uid(),'admin'));

-- documents RLS (final version with folder access)
CREATE POLICY "Users can view documents they own or have folder access" ON public.documents FOR SELECT
USING (created_by = auth.uid() OR (folder_id IS NOT NULL AND public.has_folder_access(auth.uid(), folder_id, 'view')));
CREATE POLICY "Users can insert documents in accessible folders" ON public.documents FOR INSERT
WITH CHECK (created_by = auth.uid() AND (folder_id IS NULL OR public.has_folder_access(auth.uid(), folder_id, 'edit')));
CREATE POLICY "Users can update documents they own or have folder edit access" ON public.documents FOR UPDATE
USING (created_by = auth.uid() OR (folder_id IS NOT NULL AND public.has_folder_access(auth.uid(), folder_id, 'edit')));
CREATE POLICY "Users can delete documents they own or have folder manage access" ON public.documents FOR DELETE
USING (created_by = auth.uid() OR (folder_id IS NOT NULL AND public.has_folder_access(auth.uid(), folder_id, 'manage')));
CREATE POLICY "Admins can view all documents" ON public.documents FOR SELECT USING (public.has_role(auth.uid(),'admin'));

-- folder creator gets manage access via trigger
CREATE OR REPLACE FUNCTION public.grant_folder_creator_access()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.folder_access (folder_id, user_id, access_level, granted_by)
  VALUES (NEW.id, NEW.created_by, 'manage', NEW.created_by);
  RETURN NEW;
END; $$;
CREATE TRIGGER on_folder_created AFTER INSERT ON public.folders FOR EACH ROW EXECUTE FUNCTION public.grant_folder_creator_access();

-- folder helpers
CREATE OR REPLACE FUNCTION public.get_folder_stats(folder_id UUID)
RETURNS TABLE(document_count BIGINT, total_size_bytes BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT COUNT(*)::BIGINT, 0::BIGINT FROM public.documents WHERE documents.folder_id = get_folder_stats.folder_id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_folder_tree(root_folder_id UUID DEFAULT NULL, user_id UUID DEFAULT NULL, filter_category TEXT DEFAULT NULL)
RETURNS TABLE(id UUID, name TEXT, description TEXT, color TEXT, parent_id UUID, path TEXT, level INTEGER, category TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, document_count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE folder_tree AS (
    SELECT f.id,f.name,f.description,f.color,f.parent_id,f.path,f.level,f.category,f.created_at,f.updated_at
    FROM public.folders f
    WHERE (root_folder_id IS NULL AND f.parent_id IS NULL OR f.parent_id = root_folder_id)
      AND (user_id IS NULL OR f.created_by = user_id)
      AND (filter_category IS NULL OR f.category = filter_category)
    UNION ALL
    SELECT f.id,f.name,f.description,f.color,f.parent_id,f.path,f.level,f.category,f.created_at,f.updated_at
    FROM public.folders f INNER JOIN folder_tree ft ON f.parent_id = ft.id
    WHERE (user_id IS NULL OR f.created_by = user_id)
  )
  SELECT ft.*, COALESCE(COUNT(d.id),0)::BIGINT FROM folder_tree ft
  LEFT JOIN public.documents d ON d.folder_id = ft.id
  GROUP BY ft.id,ft.name,ft.description,ft.color,ft.parent_id,ft.path,ft.level,ft.category,ft.created_at,ft.updated_at
  ORDER BY ft.level, ft.name;
END; $$;

-- ===== document_tags =====
CREATE TABLE IF NOT EXISTS public.document_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(document_id, tag_id)
);
ALTER TABLE public.document_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tags on their own documents" ON public.document_tags FOR SELECT
USING (EXISTS (SELECT 1 FROM public.documents WHERE id = document_tags.document_id AND created_by = auth.uid()));
CREATE POLICY "Users can add tags to their own documents" ON public.document_tags FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.documents WHERE id = document_tags.document_id AND created_by = auth.uid()));
CREATE POLICY "Users can remove tags from their own documents" ON public.document_tags FOR DELETE
USING (EXISTS (SELECT 1 FROM public.documents WHERE id = document_tags.document_id AND created_by = auth.uid()));
CREATE POLICY "Admins can view all document tags" ON public.document_tags FOR SELECT USING (public.has_role(auth.uid(),'admin'));

-- ===== document_embeddings =====
CREATE TABLE IF NOT EXISTS public.document_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  embedding vector(1536),
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  page_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_embeddings_document_id_idx ON public.document_embeddings(document_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_page_number ON public.document_embeddings(document_id, page_number);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_hnsw ON public.document_embeddings USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_chunk ON public.document_embeddings(document_id, chunk_index);
ALTER TABLE public.document_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view embeddings for their own documents" ON public.document_embeddings FOR SELECT
USING (EXISTS (SELECT 1 FROM public.documents WHERE id = document_embeddings.document_id AND created_by = auth.uid()));
CREATE POLICY "Users can insert embeddings for their own documents" ON public.document_embeddings FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.documents WHERE id = document_embeddings.document_id AND created_by = auth.uid()));
CREATE POLICY "Users can delete embeddings for their own documents" ON public.document_embeddings FOR DELETE
USING (EXISTS (SELECT 1 FROM public.documents WHERE id = document_embeddings.document_id AND created_by = auth.uid()));
CREATE POLICY "Admins can view all embeddings" ON public.document_embeddings FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_document_embeddings_updated_at BEFORE UPDATE ON public.document_embeddings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.search_documents_by_embedding(
  query_embedding vector(1536), match_threshold double precision DEFAULT 0.7,
  match_count integer DEFAULT 5, filter_user_id uuid DEFAULT NULL)
RETURNS TABLE(document_id uuid, document_title text, chunk_text text, similarity double precision, page_number integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  RETURN QUERY
  SELECT de.document_id, d.title, de.chunk_text, 1 - (de.embedding <=> query_embedding), de.page_number
  FROM document_embeddings de JOIN documents d ON de.document_id = d.id
  WHERE (filter_user_id IS NULL OR d.created_by = filter_user_id)
    AND d.status = 'active' AND 1 - (de.embedding <=> query_embedding) > match_threshold
  ORDER BY de.embedding <=> query_embedding LIMIT match_count;
END; $$;

-- ===== conversations & messages =====
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  sources JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS conversations_updated_at_idx ON public.conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS conversation_messages_conversation_id_idx ON public.conversation_messages(conversation_id);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own conversations" ON public.conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own conversations" ON public.conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own conversations" ON public.conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own conversations" ON public.conversations FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all conversations" ON public.conversations FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users can view messages in their conversations" ON public.conversation_messages FOR SELECT
USING (EXISTS (SELECT 1 FROM public.conversations WHERE id = conversation_messages.conversation_id AND user_id = auth.uid()));
CREATE POLICY "Users can insert messages in their conversations" ON public.conversation_messages FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.conversations WHERE id = conversation_messages.conversation_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete messages in their conversations" ON public.conversation_messages FOR DELETE
USING (EXISTS (SELECT 1 FROM public.conversations WHERE id = conversation_messages.conversation_id AND user_id = auth.uid()));
CREATE POLICY "Admins can view all conversation messages" ON public.conversation_messages FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== analytics =====
CREATE TABLE IF NOT EXISTS public.analytics_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  response_length INTEGER,
  documents_referenced INTEGER DEFAULT 0,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.analytics_document_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  query_id UUID REFERENCES public.analytics_queries(id) ON DELETE CASCADE,
  relevance_score FLOAT,
  accessed_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_queries_user_id_idx ON public.analytics_queries(user_id);
CREATE INDEX IF NOT EXISTS analytics_queries_created_at_idx ON public.analytics_queries(created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_document_access_user_id_idx ON public.analytics_document_access(user_id);
CREATE INDEX IF NOT EXISTS analytics_document_access_document_id_idx ON public.analytics_document_access(document_id);
ALTER TABLE public.analytics_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_document_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own analytics queries" ON public.analytics_queries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own analytics queries" ON public.analytics_queries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all analytics queries" ON public.analytics_queries FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users can view their own document access analytics" ON public.analytics_document_access FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own document access analytics" ON public.analytics_document_access FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all document access analytics" ON public.analytics_document_access FOR SELECT USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.get_popular_queries(filter_user_id UUID DEFAULT NULL, limit_count INTEGER DEFAULT 10)
RETURNS TABLE(query_text TEXT, query_count BIGINT, avg_response_length FLOAT, avg_documents_referenced FLOAT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT aq.query_text, COUNT(*)::BIGINT, AVG(aq.response_length)::FLOAT, AVG(aq.documents_referenced)::FLOAT
  FROM analytics_queries aq
  WHERE (filter_user_id IS NULL OR aq.user_id = filter_user_id) AND aq.created_at > now() - interval '30 days'
  GROUP BY aq.query_text ORDER BY 2 DESC, aq.query_text LIMIT limit_count;
END; $$;

CREATE OR REPLACE FUNCTION public.get_document_access_stats(filter_user_id UUID DEFAULT NULL, limit_count INTEGER DEFAULT 10)
RETURNS TABLE(document_id UUID, document_title TEXT, access_count BIGINT, avg_relevance FLOAT, last_accessed TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT ada.document_id, d.title, COUNT(*)::BIGINT, AVG(ada.relevance_score)::FLOAT, MAX(ada.accessed_at)
  FROM analytics_document_access ada JOIN documents d ON d.id = ada.document_id
  WHERE (filter_user_id IS NULL OR ada.user_id = filter_user_id) AND ada.accessed_at > now() - interval '30 days'
  GROUP BY ada.document_id, d.title ORDER BY 3 DESC LIMIT limit_count;
END; $$;

-- ===== document_versions =====
CREATE TABLE IF NOT EXISTS public.document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content_text TEXT,
  summary TEXT,
  storage_path TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  sensitivity TEXT NOT NULL DEFAULT 'internal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  change_description TEXT,
  UNIQUE(document_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_document_versions_document_id ON public.document_versions(document_id, version_number DESC);
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view versions of their own documents" ON public.document_versions FOR SELECT
USING (EXISTS (SELECT 1 FROM public.documents WHERE id = document_versions.document_id AND created_by = auth.uid()));
CREATE POLICY "Users can insert versions for their own documents" ON public.document_versions FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.documents WHERE id = document_versions.document_id AND created_by = auth.uid()));
CREATE POLICY "Admins can view all document versions" ON public.document_versions FOR SELECT USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.create_document_version()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number),0)+1 INTO next_version FROM public.document_versions WHERE document_id = OLD.id;
  INSERT INTO public.document_versions (document_id,version_number,title,content_text,summary,storage_path,original_filename,mime_type,status,sensitivity,created_by,created_at)
  VALUES (OLD.id,next_version,OLD.title,OLD.content_text,OLD.summary,OLD.storage_path,OLD.original_filename,OLD.mime_type,OLD.status,OLD.sensitivity,OLD.created_by,OLD.updated_at);
  RETURN NEW;
END; $$;
CREATE TRIGGER create_document_version_trigger BEFORE UPDATE ON public.documents FOR EACH ROW
WHEN (OLD.title IS DISTINCT FROM NEW.title OR OLD.content_text IS DISTINCT FROM NEW.content_text OR OLD.summary IS DISTINCT FROM NEW.summary OR OLD.status IS DISTINCT FROM NEW.status OR OLD.sensitivity IS DISTINCT FROM NEW.sensitivity)
EXECUTE FUNCTION public.create_document_version();

-- ===== document_templates =====
CREATE TABLE IF NOT EXISTS public.document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  template_type TEXT NOT NULL,
  content TEXT,
  fields JSONB,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_public BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0
);
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own templates" ON public.document_templates FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "Users can view public templates" ON public.document_templates FOR SELECT USING (is_public = true);
CREATE POLICY "Users can create their own templates" ON public.document_templates FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their own templates" ON public.document_templates FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Users can delete their own templates" ON public.document_templates FOR DELETE USING (auth.uid() = created_by);
CREATE POLICY "Admins can view all templates" ON public.document_templates FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_templates_created_by ON public.document_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_templates_category ON public.document_templates(category);
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON public.document_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== signature requests =====
CREATE TABLE IF NOT EXISTS public.signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled')),
  message TEXT,
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.document_signers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_request_id UUID NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
  signer_email TEXT NOT NULL,
  signer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed','declined')),
  signed_at TIMESTAMPTZ,
  declined_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_signer_id UUID NOT NULL REFERENCES public.document_signers(id) ON DELETE CASCADE,
  signature_data TEXT NOT NULL,
  signature_type TEXT NOT NULL CHECK (signature_type IN ('drawn','typed','uploaded')),
  ip_address TEXT, user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_signature_requests_document ON public.signature_requests(document_id);
CREATE INDEX IF NOT EXISTS idx_document_signers_request ON public.document_signers(signature_request_id);
CREATE INDEX IF NOT EXISTS idx_document_signers_email ON public.document_signers(signer_email);
ALTER TABLE public.signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_signature_request(_signature_request_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.signature_requests sr WHERE sr.id = _signature_request_id
    AND (sr.requested_by = _user_id OR EXISTS (SELECT 1 FROM public.documents d WHERE d.id = sr.document_id AND d.created_by = _user_id)));
$$;
CREATE OR REPLACE FUNCTION public.is_signer_for_request(_signature_request_id uuid, _user_id uuid, _user_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.document_signers ds WHERE ds.signature_request_id = _signature_request_id
    AND (ds.signer_user_id = _user_id OR ds.signer_email = _user_email));
$$;

CREATE POLICY "Users can view signature requests for their documents" ON public.signature_requests FOR SELECT
USING (requested_by = auth.uid() OR public.can_access_signature_request(id, auth.uid()) OR public.is_signer_for_request(id, auth.uid(), auth.email()));
CREATE POLICY "Users can create signature requests for their documents" ON public.signature_requests FOR INSERT
WITH CHECK (requested_by = auth.uid() AND EXISTS (SELECT 1 FROM public.documents WHERE id = signature_requests.document_id AND created_by = auth.uid()));
CREATE POLICY "Users can update their own signature requests" ON public.signature_requests FOR UPDATE USING (requested_by = auth.uid());
CREATE POLICY "Admins can view all signature requests" ON public.signature_requests FOR SELECT USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Users can view signers for requests they can access" ON public.document_signers FOR SELECT
USING (public.can_access_signature_request(signature_request_id, auth.uid()) OR signer_email = auth.email() OR signer_user_id = auth.uid());
CREATE POLICY "Request creators can add signers" ON public.document_signers FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.signature_requests WHERE id = document_signers.signature_request_id AND requested_by = auth.uid()));
CREATE POLICY "Signers can update their own status" ON public.document_signers FOR UPDATE USING (signer_email = auth.email() OR signer_user_id = auth.uid());
CREATE POLICY "Admins can view all signers" ON public.document_signers FOR SELECT USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Users can view signatures for requests they can access" ON public.signatures FOR SELECT
USING (EXISTS (SELECT 1 FROM public.document_signers ds JOIN public.signature_requests sr ON sr.id = ds.signature_request_id
  WHERE ds.id = signatures.document_signer_id AND (sr.requested_by = auth.uid() OR ds.signer_email = auth.email() OR ds.signer_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.documents WHERE id = sr.document_id AND created_by = auth.uid()))));
CREATE POLICY "Signers can create their own signatures" ON public.signatures FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.document_signers WHERE id = signatures.document_signer_id AND (signer_email = auth.email() OR signer_user_id = auth.uid())));
CREATE POLICY "Admins can view all signatures" ON public.signatures FOR SELECT USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Signers can view documents they need to sign" ON public.documents FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM signature_requests sr JOIN document_signers ds ON ds.signature_request_id = sr.id
  WHERE sr.document_id = documents.id AND (ds.signer_email = auth.email() OR ds.signer_user_id = auth.uid())));

CREATE TRIGGER update_signature_requests_updated_at BEFORE UPDATE ON public.signature_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.check_signature_request_completion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'signed' THEN
    UPDATE public.signature_requests SET status='completed', updated_at=now() WHERE id = NEW.signature_request_id
    AND NOT EXISTS (SELECT 1 FROM public.document_signers WHERE signature_request_id = NEW.signature_request_id AND status='pending');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER auto_complete_signature_request AFTER UPDATE ON public.document_signers FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.check_signature_request_completion();

-- ===== metadata fields & taxonomies =====
CREATE TABLE IF NOT EXISTS public.metadata_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text','number','date','dropdown','multiselect','boolean')),
  options JSONB, is_required BOOLEAN DEFAULT false, default_value TEXT, help_text TEXT,
  display_order INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL, updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.document_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.metadata_field_definitions(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL, updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(document_id, field_id)
);
CREATE TABLE IF NOT EXISTS public.taxonomies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, description TEXT,
  parent_id UUID REFERENCES public.taxonomies(id) ON DELETE CASCADE,
  path TEXT, level INTEGER DEFAULT 0, display_order INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL, updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.document_taxonomies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  taxonomy_id UUID NOT NULL REFERENCES public.taxonomies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(document_id, taxonomy_id)
);
CREATE INDEX IF NOT EXISTS idx_document_metadata_document ON public.document_metadata(document_id);
CREATE INDEX IF NOT EXISTS idx_taxonomies_parent ON public.taxonomies(parent_id);
CREATE INDEX IF NOT EXISTS idx_document_taxonomies_document ON public.document_taxonomies(document_id);
ALTER TABLE public.metadata_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxonomies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_taxonomies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active metadata fields" ON public.metadata_field_definitions FOR SELECT USING (is_active = true);
CREATE POLICY "Users can create metadata fields" ON public.metadata_field_definitions FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their own metadata fields" ON public.metadata_field_definitions FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Admins can manage all metadata fields" ON public.metadata_field_definitions FOR ALL USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Users can view metadata for their documents" ON public.document_metadata FOR SELECT
USING (EXISTS (SELECT 1 FROM public.documents WHERE id = document_metadata.document_id AND created_by = auth.uid()));
CREATE POLICY "Users can add metadata to their documents" ON public.document_metadata FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.documents WHERE id = document_metadata.document_id AND created_by = auth.uid()));
CREATE POLICY "Users can update metadata on their documents" ON public.document_metadata FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.documents WHERE id = document_metadata.document_id AND created_by = auth.uid()));
CREATE POLICY "Users can delete metadata from their documents" ON public.document_metadata FOR DELETE
USING (EXISTS (SELECT 1 FROM public.documents WHERE id = document_metadata.document_id AND created_by = auth.uid()));
CREATE POLICY "Admins can view all document metadata" ON public.document_metadata FOR SELECT USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Anyone can view active taxonomies" ON public.taxonomies FOR SELECT USING (is_active = true);
CREATE POLICY "Users can create taxonomies" ON public.taxonomies FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their own taxonomies" ON public.taxonomies FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Admins can manage all taxonomies" ON public.taxonomies FOR ALL USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Users can view taxonomies for their documents" ON public.document_taxonomies FOR SELECT
USING (EXISTS (SELECT 1 FROM public.documents WHERE id = document_taxonomies.document_id AND created_by = auth.uid()));
CREATE POLICY "Users can add taxonomies to their documents" ON public.document_taxonomies FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.documents WHERE id = document_taxonomies.document_id AND created_by = auth.uid()));
CREATE POLICY "Users can remove taxonomies from their documents" ON public.document_taxonomies FOR DELETE
USING (EXISTS (SELECT 1 FROM public.documents WHERE id = document_taxonomies.document_id AND created_by = auth.uid()));
CREATE POLICY "Admins can view all document taxonomies" ON public.document_taxonomies FOR SELECT USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER update_metadata_field_definitions_updated_at BEFORE UPDATE ON public.metadata_field_definitions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_document_metadata_updated_at BEFORE UPDATE ON public.document_metadata FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_taxonomies_updated_at BEFORE UPDATE ON public.taxonomies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.update_taxonomy_path()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE parent_path TEXT; parent_level INTEGER;
BEGIN
  IF NEW.parent_id IS NULL THEN NEW.path := '/'||NEW.id::text||'/'; NEW.level := 0;
  ELSE SELECT path,level INTO parent_path,parent_level FROM public.taxonomies WHERE id = NEW.parent_id;
    NEW.path := parent_path||NEW.id::text||'/'; NEW.level := parent_level+1; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER set_taxonomy_path BEFORE INSERT OR UPDATE ON public.taxonomies FOR EACH ROW EXECUTE FUNCTION public.update_taxonomy_path();

-- ===== metadata_templates =====
CREATE TABLE IF NOT EXISTS public.metadata_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, description TEXT, category TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true, created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL, updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.metadata_template_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.metadata_templates(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.metadata_field_definitions(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(template_id, field_id)
);
ALTER TABLE public.metadata_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metadata_template_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active templates" ON public.metadata_templates FOR SELECT USING (is_active = true);
CREATE POLICY "Users can view their own metadata templates" ON public.metadata_templates FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "Users can create metadata templates" ON public.metadata_templates FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their own metadata templates" ON public.metadata_templates FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Admins can manage all metadata templates" ON public.metadata_templates FOR ALL USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Anyone can view template fields for active templates" ON public.metadata_template_fields FOR SELECT
USING (EXISTS (SELECT 1 FROM public.metadata_templates WHERE id = template_id AND is_active = true));
CREATE POLICY "Users can manage fields for their own templates" ON public.metadata_template_fields FOR ALL
USING (EXISTS (SELECT 1 FROM public.metadata_templates WHERE id = template_id AND created_by = auth.uid()));
CREATE POLICY "Admins can manage all template fields" ON public.metadata_template_fields FOR ALL USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_metadata_templates_updated_at BEFORE UPDATE ON public.metadata_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== audit_log =====
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL, target_type TEXT, target_id UUID,
  user_id UUID, created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit logs" ON public.audit_log FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users can insert audit logs for their actions" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can delete audit logs" ON public.audit_log FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.log_audit_entry()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP='INSERT') THEN INSERT INTO public.audit_log (user_id,action,target_type,target_id) VALUES (NEW.created_by,'created',TG_TABLE_NAME,NEW.id); RETURN NEW;
  ELSIF (TG_OP='UPDATE') THEN INSERT INTO public.audit_log (user_id,action,target_type,target_id) VALUES (NEW.created_by,'updated',TG_TABLE_NAME,NEW.id); RETURN NEW;
  ELSIF (TG_OP='DELETE') THEN INSERT INTO public.audit_log (user_id,action,target_type,target_id) VALUES (OLD.created_by,'deleted',TG_TABLE_NAME,OLD.id); RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER audit_documents_insert AFTER INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.log_audit_entry();
CREATE TRIGGER audit_documents_update AFTER UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.log_audit_entry();
CREATE TRIGGER audit_documents_delete AFTER DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.log_audit_entry();

-- ===== pdf_conversions =====
CREATE TABLE IF NOT EXISTS public.pdf_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  original_filename TEXT NOT NULL, original_file_path TEXT NOT NULL,
  converted_file_path TEXT, page_count INTEGER,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.pdf_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own conversions" ON public.pdf_conversions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own conversions" ON public.pdf_conversions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own conversions" ON public.pdf_conversions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own conversions" ON public.pdf_conversions FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all conversions" ON public.pdf_conversions FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_pdf_conversions_user_created ON public.pdf_conversions(user_id, created_at DESC);

-- ===== application_logs =====
CREATE TABLE IF NOT EXISTS public.application_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  level TEXT NOT NULL CHECK (level IN ('debug','info','warn','error','fatal')),
  source TEXT NOT NULL, message TEXT NOT NULL, context JSONB,
  user_id UUID, session_id TEXT, url TEXT, user_agent TEXT, ip_address TEXT
);
ALTER TABLE public.application_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own logs" ON public.application_logs FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Admins can view all logs" ON public.application_logs FOR SELECT USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Service role can insert logs" ON public.application_logs FOR INSERT WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_application_logs_created_at ON public.application_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_logs_level ON public.application_logs(level);
CREATE INDEX IF NOT EXISTS idx_application_logs_user_id ON public.application_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_application_logs_source ON public.application_logs(source);

CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN DELETE FROM public.application_logs WHERE created_at < now() - interval '30 days'; END; $$;

-- ===== document_chunks =====
CREATE TABLE IF NOT EXISTS public.document_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  start_page INTEGER NOT NULL, end_page INTEGER NOT NULL,
  content_text TEXT NOT NULL, page_map JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, chunk_index)
);
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON public.document_chunks(document_id);
CREATE POLICY "Users can view chunks for their own documents" ON public.document_chunks FOR SELECT
USING (EXISTS (SELECT 1 FROM public.documents WHERE id = document_chunks.document_id AND created_by = auth.uid()));
CREATE POLICY "Admins can view all document chunks" ON public.document_chunks FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Service role can insert document chunks" ON public.document_chunks FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can update document chunks" ON public.document_chunks FOR UPDATE USING (true);
CREATE POLICY "Service role can delete document chunks" ON public.document_chunks FOR DELETE USING (true);

-- ===== document_processing_queue =====
CREATE TABLE IF NOT EXISTS public.document_processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  priority INTEGER NOT NULL DEFAULT 0, retry_count INTEGER NOT NULL DEFAULT 0, max_retries INTEGER NOT NULL DEFAULT 3,
  error_message TEXT, metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_queue_status_priority ON public.document_processing_queue(status, priority DESC, created_at);
ALTER TABLE public.document_processing_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own queue items" ON public.document_processing_queue FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own queue items" ON public.document_processing_queue FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "System can update queue items" ON public.document_processing_queue FOR UPDATE USING (true);
CREATE TRIGGER update_queue_updated_at BEFORE UPDATE ON public.document_processing_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== document_enriched_metadata =====
CREATE TABLE IF NOT EXISTS public.document_enriched_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  file_size_bytes BIGINT, file_type TEXT,
  creation_date TIMESTAMPTZ, last_modified_date TIMESTAMPTZ, page_count INTEGER,
  keywords TEXT[], detected_entities JSONB,
  document_type TEXT, priority_indicator TEXT, confidence_score DECIMAL(3,2),
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_document_enriched_metadata UNIQUE(document_id)
);
ALTER TABLE public.document_enriched_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view enriched metadata for their documents" ON public.document_enriched_metadata FOR SELECT
USING (EXISTS (SELECT 1 FROM public.documents WHERE id = document_enriched_metadata.document_id AND created_by = auth.uid()));
CREATE POLICY "Users can insert enriched metadata for their documents" ON public.document_enriched_metadata FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.documents WHERE id = document_enriched_metadata.document_id AND created_by = auth.uid()));
CREATE POLICY "Users can update enriched metadata for their documents" ON public.document_enriched_metadata FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.documents WHERE id = document_enriched_metadata.document_id AND created_by = auth.uid()));
CREATE POLICY "Users can delete enriched metadata for their documents" ON public.document_enriched_metadata FOR DELETE
USING (EXISTS (SELECT 1 FROM public.documents WHERE id = document_enriched_metadata.document_id AND created_by = auth.uid()));
CREATE POLICY "Admins can view all enriched metadata" ON public.document_enriched_metadata FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_document_enriched_metadata_document_id ON public.document_enriched_metadata(document_id);
CREATE TRIGGER update_document_enriched_metadata_updated_at BEFORE UPDATE ON public.document_enriched_metadata FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== organization_rules & audit =====
CREATE TABLE IF NOT EXISTS public.organization_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, description TEXT,
  priority INTEGER NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  conditions JSONB NOT NULL,
  target_folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  CONSTRAINT unique_rule_name UNIQUE(name, created_by)
);
CREATE TABLE IF NOT EXISTS public.organization_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.organization_rules(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  from_folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  to_folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  reason TEXT, metadata_snapshot JSONB,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  performed_by UUID, is_automatic BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE public.organization_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own rules" ON public.organization_rules FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "Users can create their own rules" ON public.organization_rules FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their own rules" ON public.organization_rules FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Users can delete their own rules" ON public.organization_rules FOR DELETE USING (auth.uid() = created_by);
CREATE POLICY "Admins can view all rules" ON public.organization_rules FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users can view audit for their documents" ON public.organization_audit FOR SELECT
USING (EXISTS (SELECT 1 FROM public.documents WHERE id = organization_audit.document_id AND created_by = auth.uid()));
CREATE POLICY "Service can insert audit records" ON public.organization_audit FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view all audit" ON public.organization_audit FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can delete organization audit" ON public.organization_audit FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_organization_rules_active ON public.organization_rules(is_active, priority DESC);
CREATE INDEX IF NOT EXISTS idx_organization_audit_document ON public.organization_audit(document_id, performed_at DESC);
CREATE TRIGGER update_organization_rules_updated_at BEFORE UPDATE ON public.organization_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== profiles =====
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT, display_name TEXT, avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view profiles" ON public.profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id,email,display_name)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data ->> 'display_name', split_part(new.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- backfill profiles for existing users
INSERT INTO public.profiles (id,email,display_name)
SELECT id, email, COALESCE(raw_user_meta_data ->> 'display_name', split_part(email,'@',1))
FROM auth.users WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

-- ===== user_messages =====
CREATE TABLE IF NOT EXISTS public.user_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL, receiver_id UUID NOT NULL,
  content TEXT NOT NULL, is_read BOOLEAN NOT NULL DEFAULT false,
  file_url TEXT, file_name TEXT, file_type TEXT, file_size INTEGER,
  replied_to_message_id UUID REFERENCES public.user_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view messages they sent or received" ON public.user_messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Users can send messages" ON public.user_messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users can mark messages as read" ON public.user_messages FOR UPDATE USING (auth.uid() = receiver_id) WITH CHECK (auth.uid() = receiver_id);
CREATE POLICY "Users can delete messages they sent or received" ON public.user_messages FOR DELETE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE INDEX IF NOT EXISTS idx_user_messages_sender ON public.user_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_user_messages_receiver ON public.user_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_user_messages_replied_to ON public.user_messages(replied_to_message_id) WHERE replied_to_message_id IS NOT NULL;

-- ===== message_reactions =====
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.user_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON public.message_reactions(message_id);
CREATE POLICY "Users can view reactions on messages they can see" ON public.message_reactions FOR SELECT
USING (EXISTS (SELECT 1 FROM public.user_messages m WHERE m.id = message_reactions.message_id AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())));
CREATE POLICY "Users can add reactions to messages they can see" ON public.message_reactions FOR INSERT
WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.user_messages m WHERE m.id = message_reactions.message_id AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())));
CREATE POLICY "Users can remove their own reactions" ON public.message_reactions FOR DELETE USING (auth.uid() = user_id);

-- ===== translation_history =====
CREATE TABLE IF NOT EXISTS public.translation_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  original_filename TEXT NOT NULL, translated_filename TEXT NOT NULL,
  original_storage_path TEXT NOT NULL, translated_storage_path TEXT NOT NULL,
  source_language TEXT NOT NULL, target_language TEXT NOT NULL,
  total_cells INTEGER NOT NULL DEFAULT 0, translated_cells INTEGER NOT NULL DEFAULT 0, skipped_cells INTEGER NOT NULL DEFAULT 0,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.translation_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own translation history" ON public.translation_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own translation history" ON public.translation_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own translation history" ON public.translation_history FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all translation history" ON public.translation_history FOR SELECT USING (public.has_role(auth.uid(),'admin'));

-- ===== Storage buckets =====
INSERT INTO storage.buckets (id,name,public) VALUES ('documents','documents',false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id,name,public) VALUES ('template-images','template-images',true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id,name,public) VALUES ('chat-files','chat-files',true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id,name,public) VALUES ('translations','translations',false) ON CONFLICT (id) DO NOTHING;

-- documents bucket policies
CREATE POLICY "Users can upload their own documents" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can view their own documents" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can delete their own documents" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can upload to their own OCR folder" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = 'ocr' AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "Users can read their own OCR files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = 'ocr' AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "Users can delete their own OCR files" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = 'ocr' AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "Allow authenticated users to upload documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents');
CREATE POLICY "Allow authenticated users to read their documents" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documents');
CREATE POLICY "Allow authenticated users to update their documents" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'documents') WITH CHECK (bucket_id = 'documents');
CREATE POLICY "Allow authenticated users to delete their documents" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'documents');

-- template-images
CREATE POLICY "Authenticated users can upload template images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'template-images');
CREATE POLICY "Anyone can view template images" ON storage.objects FOR SELECT TO public USING (bucket_id = 'template-images');
CREATE POLICY "Users can update their own template images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'template-images');
CREATE POLICY "Users can delete their own template images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'template-images');

-- chat-files
CREATE POLICY "Authenticated users can upload chat files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-files');
CREATE POLICY "Anyone can view chat files" ON storage.objects FOR SELECT USING (bucket_id = 'chat-files');
CREATE POLICY "Users can delete their own chat files" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- translations
CREATE POLICY "Users can upload their own translations" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'translations' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view their own translations" ON storage.objects FOR SELECT
USING (bucket_id = 'translations' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own translations" ON storage.objects FOR DELETE
USING (bucket_id = 'translations' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ===== Realtime =====
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.documents; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_messages; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== Grant admin to bootstrap user (admin@evigway.com) =====
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'admin@evigway.com'
ON CONFLICT (user_id, role) DO NOTHING;
