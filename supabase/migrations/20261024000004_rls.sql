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
