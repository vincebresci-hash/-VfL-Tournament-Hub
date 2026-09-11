-- =============================================================================
-- Application hard-delete dependency counts (SECURITY DEFINER)
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
--
-- Why: Direct client SELECTs on status_email_send_keys fail (REVOKE for
-- authenticated). Other dependency tables can RLS-filter to count=0 and cause
-- false-allow. This RPC counts under applications.manage without exposing rows
-- and without granting table SELECT on status_email_send_keys.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_application_hard_delete_dependency_counts(
  p_application_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_application_id IS NULL THEN
    RAISE EXCEPTION 'application_id required';
  END IF;

  -- Same RBAC source as requireApplicationsManage / deleteApplicationAction.
  IF NOT public.has_rbac_permission('applications.manage') THEN
    RAISE EXCEPTION 'Nicht autorisiert.';
  END IF;

  RETURN jsonb_build_object(
    'match_count',
    (
      SELECT count(*)::integer
      FROM public.tournament_matches tm
      WHERE tm.home_application_id = p_application_id
         OR tm.away_application_id = p_application_id
    ),
    'group_member_count',
    (
      SELECT count(*)::integer
      FROM public.tournament_group_members tgm
      WHERE tgm.application_id = p_application_id
    ),
    'cancellation_count',
    (
      SELECT count(*)::integer
      FROM public.cancellation_requests cr
      WHERE cr.application_id = p_application_id
    ),
    'secure_token_count',
    (
      SELECT count(*)::integer
      FROM public.secure_access_tokens sat
      WHERE sat.application_id = p_application_id
    ),
    'review_count',
    (
      SELECT count(*)::integer
      FROM public.application_reviews ar
      WHERE ar.application_id = p_application_id
    ),
    'status_email_send_key_count',
    (
      SELECT count(*)::integer
      FROM public.status_email_send_keys sesk
      WHERE sesk.application_id = p_application_id
    ),
    'payment_admin_note_count',
    (
      SELECT count(*)::integer
      FROM public.application_payment_admin_notes apan
      WHERE apan.application_id = p_application_id
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_application_hard_delete_dependency_counts(uuid) IS
  'Fail-closed hard-delete dependency counts for applications.manage; returns aggregates only.';

REVOKE ALL ON FUNCTION public.get_application_hard_delete_dependency_counts(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_application_hard_delete_dependency_counts(uuid)
  TO authenticated;
