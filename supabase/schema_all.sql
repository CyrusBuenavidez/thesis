-- PECIT THESIS ARCHIVE COMPLETE PHASE 1 DATABASE SCHEMA
-- Run this script in your Supabase SQL Editor to apply all Phase 1 migrations


-- ==========================================================================
-- START MIGRATION: 20261024000001_extensions_enums.sql
-- ==========================================================================

-- Migration: 20261024000001_extensions_enums.sql
-- Enables required extensions and creates application domain enums

CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

-- User roles in PECIT Thesis Archive
-- Hierarchy: student (author), advisor (reviewer), librarian (manager), admin, super_admin
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM (
      'student',
      'advisor',
      'librarian',
      'admin',
      'super_admin'
    );
  END IF;
END $$;

-- Lifecycle states for theses (8 states)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'thesis_status') THEN
    CREATE TYPE thesis_status AS ENUM (
      'draft',
      'submitted',
      'under_review',
      'revision_requested',
      'accepted',
      'rejected',
      'published',
      'archived'
    );
  END IF;
END $$;

-- Account lifecycle status (active, disabled, graduated)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_status') THEN
    CREATE TYPE profile_status AS ENUM (
      'active',
      'disabled',
      'graduated'
    );
  END IF;
END $$;

-- Access log kind
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_kind') THEN
    CREATE TYPE access_kind AS ENUM (
      'view',
      'download',
      'docx_export'
    );
  END IF;
END $$;


-- ==========================================================================
-- START MIGRATION: 20261024000002_tables.sql
-- ==========================================================================

-- Migration: 20261024000002_tables.sql
-- Creates core tables for PECIT Thesis Archive System

-- 1. Profiles (source of truth for identity, role, and contact data)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  role user_role NOT NULL DEFAULT 'student',
  department text,
  program text,
  status profile_status NOT NULL DEFAULT 'active',
  must_change_password boolean NOT NULL DEFAULT false,
  privacy_consent_at timestamptz,
  phone text,
  address text,
  birth_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Theses (main research records)
CREATE TABLE IF NOT EXISTS public.theses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  abstract text NOT NULL,
  status thesis_status NOT NULL DEFAULT 'draft',
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  primary_supervisor_id uuid REFERENCES public.profiles(id),
  department text NOT NULL,
  program text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  author_names text[] NOT NULL DEFAULT '{}',
  year integer,
  doi text,
  license text,
  is_confidential boolean NOT NULL DEFAULT false,
  embargo_until timestamptz,
  consent_accepted_at timestamptz,
  consent_version text,
  published_at timestamptz,
  review_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_vector tsvector,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Thesis Authors (group authors and co-author access)
CREATE TABLE IF NOT EXISTS public.thesis_authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid NOT NULL REFERENCES public.theses(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_thesis_authors_thesis_profile UNIQUE (thesis_id, profile_id)
);

-- 4. Thesis Versions (manuscript files in R2)
CREATE TABLE IF NOT EXISTS public.thesis_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid NOT NULL REFERENCES public.theses(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  r2_key text NOT NULL,
  docx_r2_key text,
  file_size bigint NOT NULL,
  sha256 text NOT NULL,
  change_notes text,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_thesis_versions_thesis_version UNIQUE (thesis_id, version_number)
);

-- 5. PDF Annotations (page comments saved during review)
CREATE TABLE IF NOT EXISTS public.pdf_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid NOT NULL REFERENCES public.theses(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.thesis_versions(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  content text NOT NULL,
  highlight_coords jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Activity Logs (append-only audit trail)
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid REFERENCES public.theses(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  from_status thesis_status,
  to_status thesis_status,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Notifications (in-app notifications)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  thesis_id uuid REFERENCES public.theses(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Access Logs (confidential file view / download audits for DPA compliance)
CREATE TABLE IF NOT EXISTS public.access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid NOT NULL REFERENCES public.theses(id) ON DELETE CASCADE,
  version_id uuid REFERENCES public.thesis_versions(id) ON DELETE SET NULL,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  kind access_kind NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Settings (system settings, branding, allowed domains)
CREATE TABLE IF NOT EXISTS public.settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- ==========================================================================
-- START MIGRATION: 20261024000003_indexes_triggers.sql
-- ==========================================================================

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


-- ==========================================================================
-- START MIGRATION: 20261024000004_rls.sql
-- ==========================================================================

-- Migration: 20261024000004_rls.sql
-- Enables Row Level Security on all tables and implements RBAC matrix

-- Enable RLS on every table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thesis_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thesis_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Helper functions to read claims with fallback
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
DECLARE
  claim_role text;
  found_role user_role;
BEGIN
  claim_role := coalesce(
    auth.jwt() ->> 'user_role',
    auth.jwt() -> 'app_metadata' ->> 'role'
  );

  IF claim_role IS NOT NULL THEN
    RETURN claim_role::user_role;
  END IF;

  SELECT role INTO found_role FROM public.profiles WHERE id = auth.uid();
  RETURN found_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean AS $$
BEGIN
  RETURN current_user_role() IN ('librarian', 'admin', 'super_admin');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin_or_super()
RETURNS boolean AS $$
BEGIN
  RETURN current_user_role() IN ('admin', 'super_admin');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
BEGIN
  RETURN current_user_role() = 'super_admin';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ----------------------------------------------------
-- 1. Profiles Policies
-- ----------------------------------------------------
CREATE POLICY "profiles_select_active"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    status = 'active'
    OR id = auth.uid()
    OR is_staff()
  );

CREATE POLICY "profiles_insert_admin"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    is_super_admin()
    OR (
      is_admin_or_super()
      AND role IN ('student', 'advisor', 'librarian')
    )
  );

CREATE POLICY "profiles_update_self_or_admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid()
    OR is_admin_or_super()
  )
  WITH CHECK (
    -- Non-admin cannot change their own role or status
    (
      id = auth.uid()
      AND NOT is_admin_or_super()
      AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
      AND status = (SELECT status FROM public.profiles WHERE id = auth.uid())
    )
    OR is_super_admin()
    OR (
      is_admin_or_super()
      AND role IN ('student', 'advisor', 'librarian')
    )
  );

-- ----------------------------------------------------
-- 2. Theses Policies
-- ----------------------------------------------------
CREATE POLICY "theses_select_policy"
  ON public.theses FOR SELECT
  TO authenticated, anon
  USING (
    -- Staff can see all theses
    (auth.role() = 'authenticated' AND is_staff())
    -- Advisor sees theses assigned to them
    OR (auth.role() = 'authenticated' AND primary_supervisor_id = auth.uid())
    -- Authors see their own theses (owner or co-author)
    OR (
      auth.role() = 'authenticated'
      AND (
        owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.thesis_authors ta
          WHERE ta.thesis_id = public.theses.id AND ta.profile_id = auth.uid()
        )
      )
    )
    -- Anonymous and general users see published, non-confidential, embargo-expired theses
    OR (
      status = 'published'
      AND is_confidential = false
      AND (embargo_until IS NULL OR embargo_until <= now())
    )
  );

CREATE POLICY "theses_insert_author"
  ON public.theses FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    OR is_staff()
  );

CREATE POLICY "theses_update_author_or_staff"
  ON public.theses FOR UPDATE
  TO authenticated
  USING (
    (
      (
        owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.thesis_authors ta
          WHERE ta.thesis_id = public.theses.id AND ta.profile_id = auth.uid()
        )
      )
      AND status IN ('draft', 'revision_requested')
    )
    OR (primary_supervisor_id = auth.uid() AND status = 'under_review')
    OR is_staff()
  );

CREATE POLICY "theses_delete_draft_or_staff"
  ON public.theses FOR DELETE
  TO authenticated
  USING (
    (owner_id = auth.uid() AND status = 'draft')
    OR (is_staff() AND status IN ('draft', 'rejected'))
  );

-- ----------------------------------------------------
-- 3. Thesis Authors Policies
-- ----------------------------------------------------
CREATE POLICY "thesis_authors_select"
  ON public.thesis_authors FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.theses t
      WHERE t.id = thesis_authors.thesis_id
    )
  );

CREATE POLICY "thesis_authors_modify"
  ON public.thesis_authors FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.theses t
      WHERE t.id = thesis_authors.thesis_id
      AND (t.owner_id = auth.uid() OR is_staff())
    )
  );

-- ----------------------------------------------------
-- 4. Thesis Versions Policies
-- ----------------------------------------------------
CREATE POLICY "thesis_versions_select"
  ON public.thesis_versions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.theses t
      WHERE t.id = thesis_versions.thesis_id
    )
  );

CREATE POLICY "thesis_versions_insert"
  ON public.thesis_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.theses t
      WHERE t.id = thesis_versions.thesis_id
      AND (
        t.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.thesis_authors ta
          WHERE ta.thesis_id = t.id AND ta.profile_id = auth.uid()
        )
        OR is_staff()
      )
    )
  );

-- ----------------------------------------------------
-- 5. PDF Annotations Policies
-- ----------------------------------------------------
CREATE POLICY "pdf_annotations_select"
  ON public.pdf_annotations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.theses t
      WHERE t.id = pdf_annotations.thesis_id
    )
  );

CREATE POLICY "pdf_annotations_insert"
  ON public.pdf_annotations FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.theses t
      WHERE t.id = pdf_annotations.thesis_id
      AND (
        t.owner_id = auth.uid()
        OR t.primary_supervisor_id = auth.uid()
        OR is_staff()
      )
    )
  );

-- ----------------------------------------------------
-- 6. Activity Logs Policies
-- ----------------------------------------------------
CREATE POLICY "activity_logs_select"
  ON public.activity_logs FOR SELECT
  TO authenticated
  USING (
    is_staff()
    OR actor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.theses t
      WHERE t.id = activity_logs.thesis_id
      AND (t.owner_id = auth.uid() OR t.primary_supervisor_id = auth.uid())
    )
  );

CREATE POLICY "activity_logs_insert"
  ON public.activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ----------------------------------------------------
-- 7. Notifications Policies
-- ----------------------------------------------------
CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------
-- 8. Access Logs Policies
-- ----------------------------------------------------
CREATE POLICY "access_logs_select_staff"
  ON public.access_logs FOR SELECT
  TO authenticated
  USING (is_staff());

CREATE POLICY "access_logs_insert_authenticated"
  ON public.access_logs FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- ----------------------------------------------------
-- 9. Settings Policies
-- ----------------------------------------------------
CREATE POLICY "settings_select"
  ON public.settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "settings_modify_super_admin"
  ON public.settings FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ==========================================================================
-- START MIGRATION: 20261024000005_public_view.sql
-- ==========================================================================

-- Migration: 20261024000005_public_view.sql
-- Creates public view for anonymous and discovery access to published, non-confidential research

CREATE OR REPLACE VIEW public.public_theses
WITH (security_invoker = true) AS
SELECT
  id,
  title,
  abstract,
  department,
  program,
  keywords,
  author_names,
  year,
  doi,
  license,
  published_at
FROM public.theses
WHERE status = 'published'
  AND is_confidential = false
  AND (embargo_until IS NULL OR embargo_until <= now());

-- Grant view permissions to anonymous visitors and authenticated users
GRANT SELECT ON public.public_theses TO anon, authenticated;


-- ==========================================================================
-- START MIGRATION: 20261024000006_transition_function.sql
-- ==========================================================================

-- Migration: 20261024000006_transition_function.sql
-- Implements transition_thesis_status as SECURITY DEFINER and revokes direct status updates

-- Revoke direct column updates to status
REVOKE UPDATE (status) ON public.theses FROM authenticated, anon, public;

CREATE OR REPLACE FUNCTION public.transition_thesis_status(
  p_thesis_id uuid,
  p_to_status thesis_status,
  p_reason text DEFAULT NULL
)
RETURNS public.theses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role user_role;
  v_thesis public.theses;
  v_old_status thesis_status;
  v_is_author boolean;
  v_is_supervisor boolean;
  v_is_librarian boolean;
  v_is_admin boolean;
  v_is_super boolean;
  v_notification_target uuid;
  v_notification_title text;
  v_notification_msg text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to transition thesis status';
  END IF;

  SELECT * INTO v_thesis FROM public.theses WHERE id = p_thesis_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Thesis not found: %', p_thesis_id;
  END IF;

  v_old_status := v_thesis.status;

  -- Caller role resolution
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;

  v_is_author := (v_thesis.owner_id = v_caller_id) OR EXISTS (
    SELECT 1 FROM public.thesis_authors ta
    WHERE ta.thesis_id = p_thesis_id AND ta.profile_id = v_caller_id
  );
  v_is_supervisor := (v_thesis.primary_supervisor_id = v_caller_id);
  v_is_librarian := (v_caller_role = 'librarian');
  v_is_admin := (v_caller_role = 'admin');
  v_is_super := (v_caller_role = 'super_admin');

  -- Transition Validation Rules
  CASE
    -- 1. draft -> submitted (Author submitting)
    WHEN v_thesis.status = 'draft' AND p_to_status = 'submitted' THEN
      IF NOT (v_is_author OR v_is_admin OR v_is_super) THEN
        RAISE EXCEPTION 'Only authors or administrators can submit a thesis';
      END IF;

    -- 2. submitted -> under_review (Supervisor or Librarian/Admin starts review or assigns)
    WHEN v_thesis.status = 'submitted' AND p_to_status = 'under_review' THEN
      IF NOT (v_is_supervisor OR v_is_librarian OR v_is_admin OR v_is_super) THEN
        RAISE EXCEPTION 'Only assigned advisors, librarians, or administrators can move thesis to under_review';
      END IF;

    -- 3. under_review -> revision_requested (Supervisor or Staff requests revisions; reason required)
    WHEN v_thesis.status = 'under_review' AND p_to_status = 'revision_requested' THEN
      IF NOT (v_is_supervisor OR v_is_librarian OR v_is_admin OR v_is_super) THEN
        RAISE EXCEPTION 'Only assigned advisor or staff can request revisions';
      END IF;
      IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A written reason is required when requesting revisions';
      END IF;

    -- 4. revision_requested -> submitted (Author uploads revision / resubmits)
    WHEN v_thesis.status = 'revision_requested' AND p_to_status = 'submitted' THEN
      IF NOT (v_is_author OR v_is_admin OR v_is_super) THEN
        RAISE EXCEPTION 'Only authors or administrators can resubmit revised thesis';
      END IF;

    -- 5. under_review -> accepted (Supervisor or Staff accepts)
    WHEN v_thesis.status = 'under_review' AND p_to_status = 'accepted' THEN
      IF NOT (v_is_supervisor OR v_is_librarian OR v_is_admin OR v_is_super) THEN
        RAISE EXCEPTION 'Only assigned advisor or staff can accept thesis';
      END IF;

    -- 6. under_review -> rejected (Supervisor or Staff rejects; reason required)
    WHEN v_thesis.status = 'under_review' AND p_to_status = 'rejected' THEN
      IF NOT (v_is_supervisor OR v_is_librarian OR v_is_admin OR v_is_super) THEN
        RAISE EXCEPTION 'Only assigned advisor or staff can reject thesis';
      END IF;
      IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A written reason is required when rejecting a thesis';
      END IF;

    -- 7. accepted -> published (Librarian or Admin publishes; publication consent REQUIRED!)
    WHEN v_thesis.status = 'accepted' AND p_to_status = 'published' THEN
      IF NOT (v_is_librarian OR v_is_admin OR v_is_super) THEN
        RAISE EXCEPTION 'Only librarians or administrators can publish thesis';
      END IF;
      IF v_thesis.consent_accepted_at IS NULL THEN
        RAISE EXCEPTION 'Publish refused: author publication agreement consent is missing';
      END IF;

    -- 8. published -> archived (Librarian or Admin archives)
    WHEN v_thesis.status = 'published' AND p_to_status = 'archived' THEN
      IF NOT (v_is_librarian OR v_is_admin OR v_is_super) THEN
        RAISE EXCEPTION 'Only librarians or administrators can archive thesis';
      END IF;

    -- 9. rejected -> under_review (Admin or Super Admin only can reopen rejected thesis)
    WHEN v_thesis.status = 'rejected' AND p_to_status = 'under_review' THEN
      IF NOT (v_is_admin OR v_is_super) THEN
        RAISE EXCEPTION 'Rejected is terminal; only an administrator can reopen it';
      END IF;
      IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A written reason is required when reopening a rejected thesis';
      END IF;

    ELSE
      RAISE EXCEPTION 'Illegal lifecycle transition from % to % by user %',
        v_thesis.status, p_to_status, v_caller_id;
  END CASE;

  -- Apply status change and publication timestamp if applicable
  UPDATE public.theses
  SET
    status = p_to_status,
    published_at = CASE
      WHEN p_to_status = 'published' AND published_at IS NULL THEN now()
      ELSE published_at
    END,
    year = CASE
      WHEN p_to_status = 'published' AND year IS NULL THEN extract(year from now())::int
      ELSE year
    END,
    updated_at = now()
  WHERE id = p_thesis_id
  RETURNING * INTO v_thesis;

  -- Write append-only activity_log entry
  INSERT INTO public.activity_logs (
    thesis_id,
    actor_id,
    action,
    from_status,
    to_status,
    reason,
    metadata
  ) VALUES (
    p_thesis_id,
    v_caller_id,
    'transition_status',
    v_old_status,
    p_to_status,
    p_reason,
    jsonb_build_object(
      'caller_role', v_caller_role,
      'timestamp', now()
    )
  );

  -- Create in-app notification for author or advisor
  IF p_to_status IN ('accepted', 'rejected', 'revision_requested', 'published') THEN
    v_notification_target := v_thesis.owner_id;
    v_notification_title := 'Thesis Status Updated: ' || p_to_status;
    v_notification_msg := 'Your thesis status changed to ' || p_to_status || coalesce(' (Reason: ' || p_reason || ')', '');
  ELSIF p_to_status = 'submitted' AND v_thesis.primary_supervisor_id IS NOT NULL THEN
    v_notification_target := v_thesis.primary_supervisor_id;
    v_notification_title := 'Thesis Submitted for Review';
    v_notification_msg := 'A thesis has been submitted or resubmitted for your review: ' || v_thesis.title;
  END IF;

  IF v_notification_target IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id,
      thesis_id,
      title,
      message
    ) VALUES (
      v_notification_target,
      p_thesis_id,
      v_notification_title,
      v_notification_msg
    );
  END IF;

  RETURN v_thesis;
END;
$$;

-- Allow authenticated users to call transition_thesis_status
GRANT EXECUTE ON FUNCTION public.transition_thesis_status(uuid, thesis_status, text) TO authenticated;


-- ==========================================================================
-- START MIGRATION: 20261024000007_access_token_hook.sql
-- ==========================================================================

-- Migration: 20261024000007_access_token_hook.sql
-- Custom Access Token Hook to inject user_role and user_status claims into JWT

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claims jsonb;
  user_role_val user_role;
  user_status_val profile_status;
BEGIN
  -- Lookup profile attributes
  SELECT role, status INTO user_role_val, user_status_val
  FROM public.profiles
  WHERE id = (event->>'user_id')::uuid;

  claims := event->'claims';

  IF user_role_val IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role_val::text));
  ELSE
    claims := jsonb_set(claims, '{user_role}', '"student"'::jsonb);
  END IF;

  IF user_status_val IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_status}', to_jsonb(user_status_val::text));
  ELSE
    claims := jsonb_set(claims, '{user_status}', '"active"'::jsonb);
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- Grant execution permissions strictly to supabase_auth_admin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
    GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;


-- ==========================================================================
-- START MIGRATION: 20261024000008_settings_seed.sql
-- ==========================================================================

-- Migration: 20261024000008_settings_seed.sql
-- Seed initial system settings

INSERT INTO public.settings (key, value, description)
VALUES
  (
    'google_login_enabled',
    'false'::jsonb,
    'Whether Google Workspace OAuth login is active (deferred per master prompt)'
  ),
  (
    'google_auto_provision',
    'false'::jsonb,
    'Whether unregistered Workspace users can automatically provision student accounts on first sign-in'
  ),
  (
    'allowed_email_domains',
    '["pecit.edu.ph"]'::jsonb,
    'List of institutional email domains allowed for institutional sign-in'
  ),
  (
    'admin_contact_email',
    '"admin@pecit.edu.ph"'::jsonb,
    'Administrator contact email address for account support'
  ),
  (
    'retention_policy',
    '{"audit_log_years": 7, "closed_account_retention_days": 365}'::jsonb,
    'Data Privacy Act (RA 10173) retention policies for audit records and graduated accounts'
  )
ON CONFLICT (key) DO NOTHING;


-- ==========================================================================
-- START MIGRATION: 20261024000009_fix_rls_recursion.sql
-- ==========================================================================

-- Migration: 20261024000009_fix_rls_recursion.sql
-- Fixes infinite recursion in RLS policies by using SECURITY DEFINER helper functions

-- 1. Helper: Check if user is a registered co-author (SECURITY DEFINER avoids RLS cycle)
CREATE OR REPLACE FUNCTION public.is_thesis_coauthor(p_thesis_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.thesis_authors
    WHERE thesis_id = p_thesis_id AND profile_id = p_user_id
  );
$$;

-- 2. Helper: Check if user can view thesis (SECURITY DEFINER avoids RLS cycle)
CREATE OR REPLACE FUNCTION public.can_view_thesis(p_thesis_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.theses
    WHERE id = p_thesis_id
    AND (
      owner_id = p_user_id
      OR primary_supervisor_id = p_user_id
      OR (status = 'published' AND is_confidential = false AND (embargo_until IS NULL OR embargo_until <= now()))
    )
  );
$$;

-- 3. Update theses select policy using helper
DROP POLICY IF EXISTS "theses_select_policy" ON public.theses;
CREATE POLICY "theses_select_policy"
  ON public.theses FOR SELECT
  TO authenticated, anon
  USING (
    -- Staff can see all theses
    (auth.role() = 'authenticated' AND is_staff())
    -- Advisor sees theses assigned to them
    OR (auth.role() = 'authenticated' AND primary_supervisor_id = auth.uid())
    -- Authors see their own theses (owner or co-author)
    OR (
      auth.role() = 'authenticated'
      AND (
        owner_id = auth.uid()
        OR is_thesis_coauthor(id, auth.uid())
      )
    )
    -- Anonymous and general users see published, non-confidential, embargo-expired theses
    OR (
      status = 'published'
      AND is_confidential = false
      AND (embargo_until IS NULL OR embargo_until <= now())
    )
  );

-- 4. Update theses update policy using helper
DROP POLICY IF EXISTS "theses_update_author_or_staff" ON public.theses;
CREATE POLICY "theses_update_author_or_staff"
  ON public.theses FOR UPDATE
  TO authenticated
  USING (
    (
      (
        owner_id = auth.uid()
        OR is_thesis_coauthor(id, auth.uid())
      )
      AND status IN ('draft', 'revision_requested')
    )
    OR (primary_supervisor_id = auth.uid() AND status = 'under_review')
    OR is_staff()
  );

-- 5. Update thesis_authors select policy
DROP POLICY IF EXISTS "thesis_authors_select" ON public.thesis_authors;
CREATE POLICY "thesis_authors_select"
  ON public.thesis_authors FOR SELECT
  TO authenticated
  USING (
    profile_id = auth.uid()
    OR is_staff()
    OR can_view_thesis(thesis_id, auth.uid())
  );

-- 6. Update thesis_authors modify policy
DROP POLICY IF EXISTS "thesis_authors_modify" ON public.thesis_authors;
CREATE POLICY "thesis_authors_modify"
  ON public.thesis_authors FOR ALL
  TO authenticated
  USING (
    is_staff()
    OR EXISTS (
      SELECT 1 FROM public.theses t
      WHERE t.id = thesis_authors.thesis_id
      AND t.owner_id = auth.uid()
    )
  );

-- 7. Update thesis_versions policies
DROP POLICY IF EXISTS "thesis_versions_select" ON public.thesis_versions;
CREATE POLICY "thesis_versions_select"
  ON public.thesis_versions FOR SELECT
  TO authenticated
  USING (
    is_staff()
    OR can_view_thesis(thesis_id, auth.uid())
    OR is_thesis_coauthor(thesis_id, auth.uid())
  );

DROP POLICY IF EXISTS "thesis_versions_insert" ON public.thesis_versions;
CREATE POLICY "thesis_versions_insert"
  ON public.thesis_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    is_staff()
    OR can_view_thesis(thesis_id, auth.uid())
    OR is_thesis_coauthor(thesis_id, auth.uid())
  );

-- 8. Update pdf_annotations policies
DROP POLICY IF EXISTS "pdf_annotations_select" ON public.pdf_annotations;
CREATE POLICY "pdf_annotations_select"
  ON public.pdf_annotations FOR SELECT
  TO authenticated
  USING (
    is_staff()
    OR can_view_thesis(thesis_id, auth.uid())
    OR is_thesis_coauthor(thesis_id, auth.uid())
  );


-- ==========================================================================
-- START MIGRATION: 20261027000001_departments_programs.sql
-- ==========================================================================

-- Migration: 20261027000001_departments_programs.sql
-- Create departments and programs management tables for institutional flexibility

CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  department_name text NOT NULL,
  type text NOT NULL DEFAULT 'college' CHECK (type IN ('college', 'senior_high')),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_programs_department ON public.programs(department_name);
CREATE INDEX IF NOT EXISTS idx_programs_type ON public.programs(type);
CREATE INDEX IF NOT EXISTS idx_programs_code ON public.programs(code);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'departments' AND policyname = 'Public read departments'
  ) THEN
    CREATE POLICY "Public read departments" ON public.departments FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'programs' AND policyname = 'Public read programs'
  ) THEN
    CREATE POLICY "Public read programs" ON public.programs FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'departments' AND policyname = 'Admin manage departments'
  ) THEN
    CREATE POLICY "Admin manage departments" ON public.departments
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'super_admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'programs' AND policyname = 'Admin manage programs'
  ) THEN
    CREATE POLICY "Admin manage programs" ON public.programs
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'super_admin')
        )
      );
  END IF;
END $$;


