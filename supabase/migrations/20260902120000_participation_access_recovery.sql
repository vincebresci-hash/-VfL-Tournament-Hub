-- =============================================================================
-- PR51: Secure participation-link recovery for external cancellation entry
-- =============================================================================
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
-- Grants token rotation only through a narrow service_role RPC.
-- =============================================================================

ALTER TYPE public.email_template_type
  ADD VALUE IF NOT EXISTS 'participation-access-recovery';

-- -----------------------------------------------------------------------------
-- Recovery RPC (service_role only)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.issue_participation_access_recovery_token(
  p_tournament_id uuid,
  p_contact_email text,
  p_email_identifier_hash text,
  p_ip_identifier_hash text,
  p_token_hash text
)
RETURNS TABLE (
  application_id uuid,
  contact_email text,
  contact_first_name text,
  tournament_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_app public.applications%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
  v_expires_at timestamptz;
BEGIN
  IF p_tournament_id IS NULL THEN
    RETURN;
  END IF;

  v_email := lower(btrim(p_contact_email));
  IF v_email IS NULL OR char_length(v_email) < 3 OR position('@' IN v_email) = 0 THEN
    RETURN;
  END IF;

  IF char_length(p_token_hash) <> 64 OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;

  IF char_length(p_email_identifier_hash) <> 64
     OR p_email_identifier_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;

  IF p_ip_identifier_hash IS NOT NULL
     AND btrim(p_ip_identifier_hash) <> ''
     AND (
       char_length(p_ip_identifier_hash) <> 64
       OR p_ip_identifier_hash !~ '^[0-9a-f]{64}$'
     ) THEN
    RETURN;
  END IF;

  IF public.is_public_action_rate_limited(
    'participation_recovery_email',
    p_email_identifier_hash,
    5,
    interval '1 hour'
  ) THEN
    RETURN;
  END IF;

  IF btrim(coalesce(p_ip_identifier_hash, '')) <> ''
     AND public.is_public_action_rate_limited(
       'participation_recovery_ip',
       p_ip_identifier_hash,
       30,
       interval '1 hour'
     ) THEN
    RETURN;
  END IF;

  PERFORM public.record_public_action_attempt(
    'participation_recovery_email',
    p_email_identifier_hash
  );

  IF btrim(coalesce(p_ip_identifier_hash, '')) <> '' THEN
    PERFORM public.record_public_action_attempt(
      'participation_recovery_ip',
      p_ip_identifier_hash
    );
  END IF;

  SELECT a.*
  INTO v_app
  FROM public.applications a
  WHERE a.tournament_id = p_tournament_id
    AND lower(btrim(a.contact_email)) = v_email
    AND a.status = 'accepted'::public.application_status
    AND a.club_id IS NULL
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF public.is_public_action_rate_limited(
    'participation_recovery_app',
    encode(digest(v_app.id::text, 'sha256'), 'hex'),
    1,
    interval '15 minutes'
  ) THEN
    RETURN;
  END IF;

  PERFORM public.record_public_action_attempt(
    'participation_recovery_app',
    encode(digest(v_app.id::text, 'sha256'), 'hex')
  );

  SELECT *
  INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND OR v_tournament.date IS NULL THEN
    RETURN;
  END IF;

  v_expires_at := (v_tournament.date + 30)::timestamptz;

  UPDATE public.secure_access_tokens
  SET revoked_at = now()
  WHERE application_id = v_app.id
    AND purpose = 'cancellation'::public.secure_access_token_purpose
    AND revoked_at IS NULL
    AND expires_at > now();

  INSERT INTO public.secure_access_tokens (
    application_id,
    purpose,
    token_hash,
    expires_at
  )
  VALUES (
    v_app.id,
    'cancellation'::public.secure_access_token_purpose,
    p_token_hash,
    v_expires_at
  );

  RETURN QUERY
  SELECT
    v_app.id,
    v_app.contact_email,
    coalesce(nullif(btrim(v_app.contact_first_name), ''), ''),
    coalesce(nullif(btrim(v_tournament.name), ''), 'Turnier');
END;
$$;

COMMENT ON FUNCTION public.issue_participation_access_recovery_token(
  uuid, text, text, text, text
) IS
  'Service-role only: rotate participation cancellation token for external accepted applications without leaking existence.';

REVOKE ALL ON FUNCTION public.issue_participation_access_recovery_token(
  uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.issue_participation_access_recovery_token(
  uuid, text, text, text, text
) TO service_role;

-- -----------------------------------------------------------------------------
-- Email template (idempotent)
-- -----------------------------------------------------------------------------

DO $seed$
DECLARE
  v_type public.email_template_type;
  v_name text;
  v_subject text;
  v_body text;
BEGIN
  v_type := 'participation-access-recovery';
  v_name := 'Teilnahme-Link erneut anfordern';
  v_subject := 'Teilnahme verwalten – {{tournament_name}}';
  v_body := $body$Hallo {{contact_first_name}},

ihr habt einen sicheren Link angefordert, um eure Turnierteilnahme im Tournament Hub zu verwalten.

{{participation_url}}

Über den Link könnt ihr eure Teilnahme einsehen und bei Bedarf eine Absageanfrage stellen.

Sportliche Grüße
VfL Kirchheim
Tournament Hub$body$;

  IF EXISTS (SELECT 1 FROM public.email_templates WHERE type = v_type) THEN
    UPDATE public.email_templates
    SET
      name = v_name,
      subject = v_subject,
      body = v_body,
      updated_at = now()
    WHERE type = v_type;
  ELSE
    INSERT INTO public.email_templates (name, subject, body, type, active)
    VALUES (v_name, v_subject, v_body, v_type, true);
  END IF;
END
$seed$;
