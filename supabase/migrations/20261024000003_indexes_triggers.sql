-- Migration: 20261024000003_indexes_triggers.sql
-- Indexes and triggers for data integrity and search performance

-- Generic touch updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_theses_updated_at
  BEFORE UPDATE ON public.theses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Enforce append-only on activity_logs (master prompt rule 6, SPEC.md)
CREATE OR REPLACE FUNCTION public.enforce_activity_logs_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'activity_logs is append-only: updates and deletes are blocked for audit integrity';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_activity_logs_append_only
  BEFORE UPDATE OR DELETE ON public.activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_activity_logs_append_only();

-- Rebuild author_names on theses whenever thesis_authors changes
CREATE OR REPLACE FUNCTION public.rebuild_thesis_author_names()
RETURNS TRIGGER AS $$
DECLARE
  target_thesis_id uuid;
  names text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_thesis_id := OLD.thesis_id;
  ELSE
    target_thesis_id := NEW.thesis_id;
  END IF;

  SELECT coalesce(array_agg(p.full_name ORDER BY ta.author_order), '{}')
  INTO names
  FROM public.thesis_authors ta
  JOIN public.profiles p ON p.id = ta.profile_id
  WHERE ta.thesis_id = target_thesis_id;

  UPDATE public.theses
  SET author_names = names
  WHERE id = target_thesis_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_rebuild_thesis_author_names
  AFTER INSERT OR UPDATE OR DELETE ON public.thesis_authors
  FOR EACH ROW
  EXECUTE FUNCTION public.rebuild_thesis_author_names();

-- Maintain search_vector on theses
CREATE OR REPLACE FUNCTION public.maintain_theses_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
                       setweight(to_tsvector('english', coalesce(array_to_string(NEW.keywords, ' '), '')), 'B') ||
                       setweight(to_tsvector('english', coalesce(NEW.abstract, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_theses_search_vector
  BEFORE INSERT OR UPDATE OF title, abstract, keywords ON public.theses
  FOR EACH ROW
  EXECUTE FUNCTION public.maintain_theses_search_vector();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_theses_search_vector ON public.theses USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_theses_title_trgm ON public.theses USING GIN(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_name_trgm ON public.profiles USING GIN(full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_email_trgm ON public.profiles USING GIN(email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_theses_status ON public.theses(status);
CREATE INDEX IF NOT EXISTS idx_theses_owner_id ON public.theses(owner_id);
CREATE INDEX IF NOT EXISTS idx_theses_supervisor_id ON public.theses(primary_supervisor_id);
CREATE INDEX IF NOT EXISTS idx_theses_dept_program ON public.theses(department, program);
CREATE INDEX IF NOT EXISTS idx_theses_published_at ON public.theses(published_at);

CREATE INDEX IF NOT EXISTS idx_thesis_authors_lookup ON public.thesis_authors(thesis_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_thesis_versions_lookup ON public.thesis_versions(thesis_id, version_number);
CREATE INDEX IF NOT EXISTS idx_activity_logs_thesis ON public.activity_logs(thesis_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_access_logs_thesis ON public.access_logs(thesis_id, created_at DESC);
