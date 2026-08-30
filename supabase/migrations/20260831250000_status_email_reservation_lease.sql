-- =============================================================================
-- Status-E-Mail Reservation Lease / Claim (V2 ownership-aware RPCs)
-- =============================================================================
--
-- Adds lease/claim columns and NEW v2 RPCs only.
-- V1 reserve/release RPCs from 20260831220000 remain unchanged so migration can
-- run before PR37 code while production still executes f093eb9.
--
-- V2 returns jsonb: { "decision": "send"|"skip", "reservation_id": "<uuid>"|null }
-- claim/release v2 require reservation_id so stale takeovers cannot be mutated
-- by the previous lease owner.
-- =============================================================================

ALTER TABLE public.status_email_send_keys
  ADD COLUMN IF NOT EXISTS provider_message_id text;

ALTER TABLE public.status_email_send_keys
  ADD COLUMN IF NOT EXISTS reservation_id uuid NOT NULL DEFAULT gen_random_uuid();

COMMENT ON COLUMN public.status_email_send_keys.provider_message_id IS
  'Set after Resend accepts the message. Blocks stale orphan recovery to avoid duplicate sends.';

COMMENT ON COLUMN public.status_email_send_keys.reservation_id IS
  'Unique lease ownership token regenerated on each successful reservation / stale takeover.';

CREATE OR REPLACE FUNCTION public.reserve_application_status_email_send_v2(
  p_application_id uuid,
  p_template_type public.email_template_type
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_id uuid;
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
    RETURN jsonb_build_object('decision', 'skip', 'reservation_id', NULL);
  END IF;

  v_reservation_id := gen_random_uuid();

  INSERT INTO public.status_email_send_keys (
    application_id,
    template_type,
    reservation_id
  )
  VALUES (
    p_application_id,
    p_template_type,
    v_reservation_id
  )
  ON CONFLICT (application_id, template_type) DO NOTHING
  RETURNING reservation_id INTO v_reservation_id;

  IF v_reservation_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'decision', 'send',
      'reservation_id', v_reservation_id
    );
  END IF;

  DELETE FROM public.status_email_send_keys
  WHERE application_id = p_application_id
    AND template_type = p_template_type
    AND provider_message_id IS NULL
    AND created_at < v_stale_threshold;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN jsonb_build_object('decision', 'skip', 'reservation_id', NULL);
  END IF;

  v_reservation_id := gen_random_uuid();

  INSERT INTO public.status_email_send_keys (
    application_id,
    template_type,
    reservation_id
  )
  VALUES (
    p_application_id,
    p_template_type,
    v_reservation_id
  )
  ON CONFLICT (application_id, template_type) DO NOTHING
  RETURNING reservation_id INTO v_reservation_id;

  IF v_reservation_id IS NULL THEN
    RETURN jsonb_build_object('decision', 'skip', 'reservation_id', NULL);
  END IF;

  RETURN jsonb_build_object(
    'decision', 'send',
    'reservation_id', v_reservation_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_application_status_email_send_v2(
  p_application_id uuid,
  p_template_type public.email_template_type,
  p_reservation_id uuid,
  p_provider_message_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed integer;
BEGIN
  IF NOT (
    public.has_rbac_permission('applications.decide')
    OR public.has_rbac_permission('applications.manage')
  ) THEN
    RAISE EXCEPTION 'Nicht autorisiert.';
  END IF;

  IF p_reservation_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_provider_message_id IS NULL OR btrim(p_provider_message_id) = '' THEN
    RETURN false;
  END IF;

  UPDATE public.status_email_send_keys
  SET provider_message_id = btrim(p_provider_message_id)
  WHERE application_id = p_application_id
    AND template_type = p_template_type
    AND reservation_id = p_reservation_id
    AND provider_message_id IS NULL;

  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  RETURN v_claimed > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_application_status_email_send_v2(
  p_application_id uuid,
  p_template_type public.email_template_type,
  p_reservation_id uuid
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

  IF p_reservation_id IS NULL THEN
    RETURN;
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
    AND reservation_id = p_reservation_id
    AND provider_message_id IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_application_status_email_send_v2(
  uuid, public.email_template_type
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_application_status_email_send_v2(
  uuid, public.email_template_type
) TO authenticated;

REVOKE ALL ON FUNCTION public.claim_application_status_email_send_v2(
  uuid, public.email_template_type, uuid, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_application_status_email_send_v2(
  uuid, public.email_template_type, uuid, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.release_application_status_email_send_v2(
  uuid, public.email_template_type, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_application_status_email_send_v2(
  uuid, public.email_template_type, uuid
) TO authenticated;
