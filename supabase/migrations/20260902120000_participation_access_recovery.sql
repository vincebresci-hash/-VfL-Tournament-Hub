-- =============================================================================
-- PR51: Secure participation-link recovery for external cancellation entry
-- =============================================================================
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
-- Pending-activation tokens: active links stay valid until email provider accepts.
-- =============================================================================

ALTER TYPE public.email_template_type
  ADD VALUE IF NOT EXISTS 'participation-access-recovery';

ALTER TABLE public.secure_access_tokens
  ADD COLUMN IF NOT EXISTS pending_activation boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.secure_access_tokens.pending_activation IS
  'True while a recovery token awaits email provider acceptance; not valid for portal access.';

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.participation_recovery_token_expires_at(
  p_tournament_date date
)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_reference_date date;
  v_expires_at timestamptz;
  v_minimum_expires_at timestamptz;
BEGIN
  IF p_tournament_date IS NULL THEN
    RETURN (timezone('UTC', now()) + interval '1 day');
  END IF;

  v_reference_date := GREATEST(
    p_tournament_date,
    (timezone('UTC', now()))::date
  );
  v_expires_at := ((v_reference_date + 30)::timestamp AT TIME ZONE 'UTC');
  v_minimum_expires_at := timezone('UTC', date_trunc('day', timezone('UTC', now())) + interval '1 day');

  IF v_expires_at <= timezone('UTC', now()) THEN
    RETURN v_minimum_expires_at;
  END IF;

  IF v_expires_at < v_minimum_expires_at THEN
    RETURN v_minimum_expires_at;
  END IF;

  RETURN v_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.participation_recovery_token_expires_at(date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.participation_recovery_token_expires_at(date)
  TO service_role;

-- -----------------------------------------------------------------------------
-- Stage recovery token (pending; does not revoke active links)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.stage_participation_access_recovery_token(
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

  SELECT *
  INTO v_app
  FROM public.applications
  WHERE id = v_app.id
  FOR UPDATE;

  IF v_app.status IS DISTINCT FROM 'accepted'::public.application_status
     OR v_app.club_id IS NOT NULL
     OR v_app.tournament_id IS DISTINCT FROM p_tournament_id
     OR lower(btrim(v_app.contact_email)) IS DISTINCT FROM v_email THEN
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

  v_expires_at := public.participation_recovery_token_expires_at(v_tournament.date);

  DELETE FROM public.secure_access_tokens
  WHERE application_id = v_app.id
    AND purpose = 'cancellation'::public.secure_access_token_purpose
    AND pending_activation = true;

  INSERT INTO public.secure_access_tokens (
    application_id,
    purpose,
    token_hash,
    expires_at,
    revoked_at,
    pending_activation
  )
  VALUES (
    v_app.id,
    'cancellation'::public.secure_access_token_purpose,
    p_token_hash,
    v_expires_at,
    now(),
    true
  );

  RETURN QUERY
  SELECT
    v_app.id,
    v_app.contact_email,
    coalesce(nullif(btrim(v_app.contact_first_name), ''), ''),
    coalesce(nullif(btrim(v_tournament.name), ''), 'Turnier');
END;
$$;

-- -----------------------------------------------------------------------------
-- Activate staged token after provider acceptance
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.activate_participation_access_recovery_token(
  p_token_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token public.secure_access_tokens%ROWTYPE;
  v_app public.applications%ROWTYPE;
BEGIN
  IF char_length(p_token_hash) <> 64 OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_token
  FROM public.secure_access_tokens
  WHERE token_hash = p_token_hash
    AND purpose = 'cancellation'::public.secure_access_token_purpose
    AND pending_activation = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_app
  FROM public.applications
  WHERE id = v_token.application_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_app.status IS DISTINCT FROM 'accepted'::public.application_status
     OR v_app.club_id IS NOT NULL THEN
    DELETE FROM public.secure_access_tokens
    WHERE id = v_token.id
      AND pending_activation = true;
    RETURN false;
  END IF;

  IF v_token.expires_at <= now() THEN
    DELETE FROM public.secure_access_tokens
    WHERE id = v_token.id
      AND pending_activation = true;
    RETURN false;
  END IF;

  UPDATE public.secure_access_tokens
  SET revoked_at = now()
  WHERE application_id = v_app.id
    AND purpose = 'cancellation'::public.secure_access_token_purpose
    AND pending_activation = false
    AND revoked_at IS NULL
    AND id IS DISTINCT FROM v_token.id;

  UPDATE public.secure_access_tokens
  SET
    pending_activation = false,
    revoked_at = NULL
  WHERE id = v_token.id;

  DELETE FROM public.secure_access_tokens
  WHERE application_id = v_app.id
    AND purpose = 'cancellation'::public.secure_access_token_purpose
    AND pending_activation = true
    AND id IS DISTINCT FROM v_token.id;

  RETURN true;
END;
$$;

-- -----------------------------------------------------------------------------
-- Discard staged token after provider rejection
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.discard_participation_access_recovery_token(
  p_token_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF char_length(p_token_hash) <> 64 OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  DELETE FROM public.secure_access_tokens
  WHERE token_hash = p_token_hash
    AND purpose = 'cancellation'::public.secure_access_token_purpose
    AND pending_activation = true;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

COMMENT ON FUNCTION public.stage_participation_access_recovery_token(
  uuid, text, text, text, text
) IS
  'Service-role only: stage a pending recovery token without revoking active participation links.';

COMMENT ON FUNCTION public.activate_participation_access_recovery_token(text) IS
  'Service-role only: activate a staged recovery token after email provider acceptance.';

COMMENT ON FUNCTION public.discard_participation_access_recovery_token(text) IS
  'Service-role only: discard a staged recovery token when email delivery fails.';

REVOKE ALL ON FUNCTION public.stage_participation_access_recovery_token(
  uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_participation_access_recovery_token(
  uuid, text, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.activate_participation_access_recovery_token(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_participation_access_recovery_token(text)
  TO service_role;

REVOKE ALL ON FUNCTION public.discard_participation_access_recovery_token(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discard_participation_access_recovery_token(text)
  TO service_role;

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
