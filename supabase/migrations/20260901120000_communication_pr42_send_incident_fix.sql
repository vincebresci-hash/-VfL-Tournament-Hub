-- =============================================================================
-- PR42: Communication send incident fix
-- - Receipt token expiry: accept clamped future expiry (past tournament dates)
-- - RLS: communications.view may SELECT communications (read-only)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.issue_communication_confirmation_token(
  p_communication_recipient_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_expires_at timestamptz;
BEGIN
  IF NOT public.has_rbac_permission('communications.send') THEN
    RAISE EXCEPTION 'communications.send required';
  END IF;

  IF p_token_hash IS NULL OR length(p_token_hash) <> 64 THEN
    RAISE EXCEPTION 'invalid token hash';
  END IF;

  v_expires_at := p_expires_at;
  IF v_expires_at IS NULL OR v_expires_at <= now() THEN
    v_expires_at := now() + interval '90 days';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.communication_confirmation_tokens
  WHERE communication_recipient_id = p_communication_recipient_id
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.communication_confirmation_tokens
    SET
      token_hash = p_token_hash,
      expires_at = v_expires_at,
      revoked_at = NULL
    WHERE communication_recipient_id = p_communication_recipient_id;

    RETURN 'replaced';
  END IF;

  INSERT INTO public.communication_confirmation_tokens (
    communication_recipient_id,
    token_hash,
    expires_at
  )
  VALUES (
    p_communication_recipient_id,
    p_token_hash,
    v_expires_at
  );

  RETURN 'created';
EXCEPTION
  WHEN unique_violation THEN
    UPDATE public.communication_confirmation_tokens
    SET
      token_hash = p_token_hash,
      expires_at = v_expires_at,
      revoked_at = NULL
    WHERE communication_recipient_id = p_communication_recipient_id;

    RETURN 'replaced';
END;
$$;

REVOKE ALL ON FUNCTION public.issue_communication_confirmation_token(
  uuid, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_communication_confirmation_token(
  uuid, text, timestamptz
) TO authenticated;

DROP POLICY IF EXISTS tournament_communications_view_select ON public.tournament_communications;
CREATE POLICY tournament_communications_view_select
  ON public.tournament_communications
  FOR SELECT
  TO authenticated
  USING (public.has_rbac_permission('communications.view'));

DROP POLICY IF EXISTS communication_recipients_view_select ON public.communication_recipients;
CREATE POLICY communication_recipients_view_select
  ON public.communication_recipients
  FOR SELECT
  TO authenticated
  USING (public.has_rbac_permission('communications.view'));
