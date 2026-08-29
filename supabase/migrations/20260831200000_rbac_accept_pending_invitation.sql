-- =============================================================================
-- PR28: Idempotent invitation acceptance for authenticated invitees
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
--
-- Allows invited users to mark their own pending invitation as accepted using
-- auth.uid() + verified auth.users email. No service_role required for acceptance.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rbac_accept_pending_invitation()
RETURNS TABLE (
  invitation_id uuid,
  outcome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_invitation public.user_invitations%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT users.email
  INTO v_email
  FROM auth.users AS users
  WHERE users.id = v_user_id;

  IF v_email IS NULL OR btrim(v_email) = '' THEN
    RAISE EXCEPTION 'authenticated email required';
  END IF;

  SELECT *
  INTO v_invitation
  FROM public.user_invitations
  WHERE status = 'pending'
    AND lower(email) = lower(v_email)
    AND (profile_id IS NULL OR profile_id = v_user_id)
    AND (auth_user_id IS NULL OR auth_user_id = v_user_id)
  ORDER BY invited_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM public.user_invitations
      WHERE status = 'accepted'
        AND lower(email) = lower(v_email)
        AND (profile_id IS NULL OR profile_id = v_user_id)
        AND (auth_user_id IS NULL OR auth_user_id = v_user_id)
    ) THEN
      RETURN QUERY SELECT NULL::uuid, 'already_accepted';
      RETURN;
    END IF;

    RETURN QUERY SELECT NULL::uuid, 'not_found';
    RETURN;
  END IF;

  UPDATE public.user_invitations
  SET
    status = 'accepted',
    accepted_at = COALESCE(accepted_at, now()),
    updated_at = now()
  WHERE id = v_invitation.id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN QUERY SELECT v_invitation.id, 'already_accepted';
    RETURN;
  END IF;

  RETURN QUERY SELECT v_invitation.id, 'accepted';
END;
$$;

REVOKE ALL ON FUNCTION public.rbac_accept_pending_invitation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rbac_accept_pending_invitation() TO authenticated;
