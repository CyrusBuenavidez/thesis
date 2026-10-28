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
