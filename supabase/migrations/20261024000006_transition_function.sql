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
