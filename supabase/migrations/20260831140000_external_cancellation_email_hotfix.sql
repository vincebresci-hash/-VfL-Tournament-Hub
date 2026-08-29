-- =============================================================================
-- External cancellation email hotfix (CAN-01 / EML-01 / AUTH-01 / CAN-02)
-- =============================================================================
--
-- Additive migration only. Do not modify prior production migrations.
-- Rerun-safe where practical.
--
-- 1. reserve_external_cancellation_email_send — token-scoped anon path for
--    external cancellation submit workflow emails only.
-- 2. reserve_cancellation_email_send — hardened: admin OR club owner only.
-- 3. Cancellation email audit logs are written server-side only via
--    SUPABASE_SERVICE_ROLE_KEY (see src/lib/cancellations/cancellation-email-log.ts).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared template allow-list
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_cancellation_workflow_template(
  p_template_type public.email_template_type
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_template_type IN (
    'cancellation-request-received',
    'cancellation-request-submitted',
    'cancellation-confirmed',
    'cancellation-rejected'
  );
$$;

REVOKE ALL ON FUNCTION public.is_cancellation_workflow_template(public.email_template_type)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_cancellation_workflow_template(public.email_template_type)
  TO authenticated;

-- -----------------------------------------------------------------------------
-- Harden authenticated/admin reservation (AUTH-01)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_cancellation_email_send(
  p_cancellation_request_id uuid,
  p_template_type public.email_template_type
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_cancellation_workflow_template(p_template_type) THEN
    RAISE EXCEPTION 'invalid template type';
  END IF;

  IF public.is_admin() THEN
    NULL;
  ELSIF auth.uid() IS NOT NULL
    AND public.current_club_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.cancellation_requests cr
      JOIN public.applications a ON a.id = cr.application_id
      WHERE cr.id = p_cancellation_request_id
        AND a.club_id = public.current_club_id()
    ) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'unauthorized';
  END IF;

  INSERT INTO public.cancellation_email_send_keys (
    cancellation_request_id,
    template_type
  )
  VALUES (p_cancellation_request_id, p_template_type)
  ON CONFLICT (cancellation_request_id, template_type) DO NOTHING;

  IF FOUND THEN
    RETURN 'send';
  END IF;

  RETURN 'skip';
END;
$$;

-- -----------------------------------------------------------------------------
-- External/token-scoped reservation (CAN-01 / EML-01)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_external_cancellation_email_send(
  p_token_hash text,
  p_cancellation_request_id uuid,
  p_template_type public.email_template_type
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_validation record;
BEGIN
  IF char_length(p_token_hash) <> 64 THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  IF p_template_type NOT IN (
    'cancellation-request-received',
    'cancellation-request-submitted'
  ) THEN
    RAISE EXCEPTION 'invalid template type';
  END IF;

  SELECT * INTO v_validation
  FROM public.validate_secure_access_token(p_token_hash, 'cancellation')
  LIMIT 1;

  IF v_validation IS NULL OR v_validation.application_id IS NULL THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.cancellation_requests cr
    WHERE cr.id = p_cancellation_request_id
      AND cr.application_id = v_validation.application_id
      AND cr.requested_by_type = 'external'::public.cancellation_requested_by_type
      AND cr.status = 'pending'::public.cancellation_request_status
  ) THEN
    RAISE EXCEPTION 'invalid request';
  END IF;

  INSERT INTO public.cancellation_email_send_keys (
    cancellation_request_id,
    template_type
  )
  VALUES (p_cancellation_request_id, p_template_type)
  ON CONFLICT (cancellation_request_id, template_type) DO NOTHING;

  IF FOUND THEN
    RETURN 'send';
  END IF;

  RETURN 'skip';
END;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.reserve_cancellation_email_send(
  uuid, public.email_template_type
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_cancellation_email_send(
  uuid, public.email_template_type
) TO authenticated;

REVOKE ALL ON FUNCTION public.reserve_external_cancellation_email_send(
  text, uuid, public.email_template_type
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_external_cancellation_email_send(
  text, uuid, public.email_template_type
) TO anon, authenticated;
