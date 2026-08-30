-- =============================================================================
-- Status-E-Mail Reservation Lease / Claim
-- =============================================================================
--
-- Extends status_email_send_keys with provider_message_id so a successful Resend
-- accept can be recorded before email_logs insert (prevents stale recovery from
-- causing duplicate sends after log failures).
--
-- reserve_application_status_email_send gains atomic stale-orphan takeover using
-- created_at + lease interval. In-flight reservations younger than the lease are
-- never deleted by another request.
-- =============================================================================

ALTER TABLE public.status_email_send_keys
  ADD COLUMN IF NOT EXISTS provider_message_id text;

COMMENT ON COLUMN public.status_email_send_keys.provider_message_id IS
  'Set after Resend accepts the message. Blocks stale orphan recovery to avoid duplicate sends.';

CREATE OR REPLACE FUNCTION public.reserve_application_status_email_send(
  p_application_id uuid,
  p_template_type public.email_template_type
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reserved uuid;
  v_deleted integer;
  v_stale_threshold timestamptz := now() - interval '10 minutes';
BEGIN
  IF NOT (
    public.has_rbac_permission('applications.decide')
    OR public.has_rbac_permission('applications.manage')
  ) THEN
    RAISE EXCEPTION 'Nicht autorisiert.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.email_logs
    WHERE application_id = p_application_id
      AND template_type = p_template_type
      AND status = 'sent'
  ) THEN
    RETURN 'skip';
  END IF;

  INSERT INTO public.status_email_send_keys (application_id, template_type)
  VALUES (p_application_id, p_template_type)
  ON CONFLICT (application_id, template_type) DO NOTHING
  RETURNING application_id INTO v_reserved;

  IF v_reserved IS NOT NULL THEN
    RETURN 'send';
  END IF;

  DELETE FROM public.status_email_send_keys
  WHERE application_id = p_application_id
    AND template_type = p_template_type
    AND provider_message_id IS NULL
    AND created_at < v_stale_threshold;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN 'skip';
  END IF;

  INSERT INTO public.status_email_send_keys (application_id, template_type)
  VALUES (p_application_id, p_template_type)
  ON CONFLICT (application_id, template_type) DO NOTHING
  RETURNING application_id INTO v_reserved;

  IF v_reserved IS NULL THEN
    RETURN 'skip';
  END IF;

  RETURN 'send';
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_application_status_email_send(
  p_application_id uuid,
  p_template_type public.email_template_type,
  p_provider_message_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed boolean;
BEGIN
  IF NOT (
    public.has_rbac_permission('applications.decide')
    OR public.has_rbac_permission('applications.manage')
  ) THEN
    RAISE EXCEPTION 'Nicht autorisiert.';
  END IF;

  IF p_provider_message_id IS NULL OR btrim(p_provider_message_id) = '' THEN
    RETURN false;
  END IF;

  UPDATE public.status_email_send_keys
  SET provider_message_id = btrim(p_provider_message_id)
  WHERE application_id = p_application_id
    AND template_type = p_template_type
    AND provider_message_id IS NULL;

  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  RETURN v_claimed > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_application_status_email_send(
  p_application_id uuid,
  p_template_type public.email_template_type
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_rbac_permission('applications.decide')
    OR public.has_rbac_permission('applications.manage')
  ) THEN
    RAISE EXCEPTION 'Nicht autorisiert.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.email_logs
    WHERE application_id = p_application_id
      AND template_type = p_template_type
      AND status = 'sent'
  ) THEN
    RETURN;
  END IF;

  DELETE FROM public.status_email_send_keys
  WHERE application_id = p_application_id
    AND template_type = p_template_type
    AND provider_message_id IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_application_status_email_send(
  uuid, public.email_template_type, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_application_status_email_send(
  uuid, public.email_template_type, text
) TO authenticated;
