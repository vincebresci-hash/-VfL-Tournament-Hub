-- =============================================================================
-- PR A: Cancellation requests + secure access tokens
-- =============================================================================
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
-- =============================================================================

ALTER TYPE public.application_status
  ADD VALUE IF NOT EXISTS 'cancelled';

ALTER TYPE public.email_template_type
  ADD VALUE IF NOT EXISTS 'cancellation-request-received';

ALTER TYPE public.email_template_type
  ADD VALUE IF NOT EXISTS 'cancellation-request-submitted';

ALTER TYPE public.email_template_type
  ADD VALUE IF NOT EXISTS 'cancellation-confirmed';

ALTER TYPE public.email_template_type
  ADD VALUE IF NOT EXISTS 'cancellation-rejected';

DO $$
BEGIN
  CREATE TYPE public.secure_access_token_purpose AS ENUM (
    'cancellation',
    'communication_confirm'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.cancellation_request_status AS ENUM (
    'pending',
    'confirmed',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.cancellation_requested_by_type AS ENUM (
    'club',
    'external'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- -----------------------------------------------------------------------------
-- secure_access_tokens
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.secure_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications (id) ON DELETE CASCADE,
  purpose public.secure_access_token_purpose NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT secure_access_tokens_token_hash_len
    CHECK (char_length(token_hash) = 64)
);

CREATE UNIQUE INDEX IF NOT EXISTS secure_access_tokens_token_hash_uidx
  ON public.secure_access_tokens (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS secure_access_tokens_active_per_application_purpose
  ON public.secure_access_tokens (application_id, purpose)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS secure_access_tokens_application_id_idx
  ON public.secure_access_tokens (application_id);

COMMENT ON TABLE public.secure_access_tokens IS
  'Hashed opaque tokens for external participation actions (cancellation, future confirmations).';

-- -----------------------------------------------------------------------------
-- cancellation_requests
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cancellation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications (id) ON DELETE CASCADE,
  requested_by_type public.cancellation_requested_by_type NOT NULL,
  reason text,
  is_late_request boolean NOT NULL DEFAULT false,
  status public.cancellation_request_status NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cancellation_requests_one_pending_per_application
  ON public.cancellation_requests (application_id)
  WHERE status = 'pending'::public.cancellation_request_status;

CREATE INDEX IF NOT EXISTS cancellation_requests_status_idx
  ON public.cancellation_requests (status, requested_at DESC);

CREATE INDEX IF NOT EXISTS cancellation_requests_application_id_idx
  ON public.cancellation_requests (application_id);

DROP TRIGGER IF EXISTS set_cancellation_requests_updated_at ON public.cancellation_requests;
CREATE TRIGGER set_cancellation_requests_updated_at
  BEFORE UPDATE ON public.cancellation_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Cancellation email idempotency (separate from status_email_send_keys)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cancellation_email_send_keys (
  cancellation_request_id uuid NOT NULL
    REFERENCES public.cancellation_requests (id) ON DELETE CASCADE,
  template_type public.email_template_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cancellation_request_id, template_type)
);

COMMENT ON TABLE public.cancellation_email_send_keys IS
  'Idempotency for cancellation workflow emails per request + template type.';

-- -----------------------------------------------------------------------------
-- Rate limiting helper (public actions)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.public_action_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  identifier_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS public_action_attempts_lookup_idx
  ON public.public_action_attempts (action_type, identifier_hash, created_at DESC);

COMMENT ON TABLE public.public_action_attempts IS
  'Lightweight rate-limit log for public token actions (hashed identifiers only).';

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_late_cancellation_request(p_tournament_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p_tournament_date IS NOT NULL
    AND p_tournament_date < (CURRENT_DATE + 14);
$$;

CREATE OR REPLACE FUNCTION public.record_public_action_attempt(
  p_action_type text,
  p_identifier_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.public_action_attempts (action_type, identifier_hash)
  VALUES (p_action_type, p_identifier_hash);

  DELETE FROM public.public_action_attempts
  WHERE created_at < now() - interval '24 hours';
END;
$$;

CREATE OR REPLACE FUNCTION public.is_public_action_rate_limited(
  p_action_type text,
  p_identifier_hash text,
  p_max_attempts integer DEFAULT 20,
  p_window interval DEFAULT interval '1 hour'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer >= p_max_attempts
  FROM public.public_action_attempts
  WHERE action_type = p_action_type
    AND identifier_hash = p_identifier_hash
    AND created_at > now() - p_window;
$$;

-- -----------------------------------------------------------------------------
-- Token RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.store_secure_access_token(
  p_application_id uuid,
  p_purpose public.secure_access_token_purpose,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin required';
  END IF;

  IF char_length(p_token_hash) <> 64 THEN
    RAISE EXCEPTION 'invalid token hash';
  END IF;

  SELECT id INTO v_existing
  FROM public.secure_access_tokens
  WHERE application_id = p_application_id
    AND purpose = p_purpose
    AND revoked_at IS NULL
    AND expires_at > now()
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.secure_access_tokens (
    application_id,
    purpose,
    token_hash,
    expires_at
  )
  VALUES (
    p_application_id,
    p_purpose,
    p_token_hash,
    p_expires_at
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_secure_access_token(
  p_token_hash text,
  p_purpose public.secure_access_token_purpose
)
RETURNS TABLE (
  token_id uuid,
  application_id uuid,
  tournament_name text,
  team_name text,
  tournament_date date
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token public.secure_access_tokens%ROWTYPE;
  v_app public.applications%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
BEGIN
  IF char_length(p_token_hash) <> 64 THEN
    RETURN;
  END IF;

  SELECT * INTO v_token
  FROM public.secure_access_tokens
  WHERE token_hash = p_token_hash
    AND purpose = p_purpose
    AND revoked_at IS NULL
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO v_app
  FROM public.applications
  WHERE id = v_token.application_id;

  IF NOT FOUND OR v_app.status IS DISTINCT FROM 'accepted'::public.application_status THEN
    RETURN;
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments
  WHERE id = v_app.tournament_id;

  UPDATE public.secure_access_tokens
  SET last_used_at = now()
  WHERE id = v_token.id;

  RETURN QUERY
  SELECT
    v_token.id,
    v_app.id,
    COALESCE(NULLIF(btrim(v_tournament.name), ''), 'Turnier'),
    COALESCE(NULLIF(btrim(v_app.team_name), ''), 'Mannschaft'),
    v_tournament.date;
END;
$$;

-- -----------------------------------------------------------------------------
-- Cancellation request RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_cancellation_request_external(
  p_token_hash text,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_validation record;
  v_late boolean;
  v_reason text;
  v_request_id uuid;
BEGIN
  IF public.is_public_action_rate_limited(
    'cancellation_submit',
    p_token_hash,
    10,
    interval '1 hour'
  ) THEN
    RAISE EXCEPTION 'rate limited';
  END IF;

  PERFORM public.record_public_action_attempt('cancellation_submit', p_token_hash);

  SELECT * INTO v_validation
  FROM public.validate_secure_access_token(p_token_hash, 'cancellation')
  LIMIT 1;

  IF v_validation IS NULL OR v_validation.application_id IS NULL THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cancellation_requests
    WHERE application_id = v_validation.application_id
      AND status = 'pending'::public.cancellation_request_status
  ) THEN
    RAISE EXCEPTION 'pending request exists';
  END IF;

  v_late := public.is_late_cancellation_request(v_validation.tournament_date);
  v_reason := NULLIF(btrim(p_reason), '');

  IF v_late AND v_reason IS NULL THEN
    RAISE EXCEPTION 'reason required';
  END IF;

  INSERT INTO public.cancellation_requests (
    application_id,
    requested_by_type,
    reason,
    is_late_request,
    status
  )
  VALUES (
    v_validation.application_id,
    'external',
    v_reason,
    v_late,
    'pending'
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_cancellation_request(
  p_request_id uuid,
  p_decision text,
  p_admin_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.cancellation_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin required';
  END IF;

  IF p_decision NOT IN ('confirmed', 'rejected') THEN
    RAISE EXCEPTION 'invalid decision';
  END IF;

  SELECT * INTO v_request
  FROM public.cancellation_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request not found';
  END IF;

  IF v_request.status IS DISTINCT FROM 'pending'::public.cancellation_request_status THEN
    RAISE EXCEPTION 'request not pending';
  END IF;

  IF p_decision = 'confirmed' THEN
    UPDATE public.cancellation_requests
    SET
      status = 'confirmed',
      decided_at = now(),
      decided_by = auth.uid(),
      admin_note = NULLIF(btrim(p_admin_note), '')
    WHERE id = p_request_id;

    UPDATE public.applications
    SET status = 'cancelled'::public.application_status
    WHERE id = v_request.application_id
      AND status = 'accepted'::public.application_status;
  ELSE
    UPDATE public.cancellation_requests
    SET
      status = 'rejected',
      decided_at = now(),
      decided_by = auth.uid(),
      admin_note = NULLIF(btrim(p_admin_note), '')
    WHERE id = p_request_id;
  END IF;
END;
$$;

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
  IF NOT public.is_admin() AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF p_template_type NOT IN (
    'cancellation-request-received',
    'cancellation-request-submitted',
    'cancellation-confirmed',
    'cancellation-rejected'
  ) THEN
    RAISE EXCEPTION 'invalid template type';
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
-- RLS
-- -----------------------------------------------------------------------------

ALTER TABLE public.secure_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cancellation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cancellation_email_send_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_action_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.secure_access_tokens FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.cancellation_email_send_keys FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.public_action_attempts FROM PUBLIC, anon;

DROP POLICY IF EXISTS secure_access_tokens_admin_select ON public.secure_access_tokens;
CREATE POLICY secure_access_tokens_admin_select
  ON public.secure_access_tokens
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS cancellation_requests_select ON public.cancellation_requests;
CREATE POLICY cancellation_requests_select
  ON public.cancellation_requests
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.id = cancellation_requests.application_id
        AND a.club_id = public.current_club_id()
    )
  );

DROP POLICY IF EXISTS cancellation_requests_insert_club ON public.cancellation_requests;
CREATE POLICY cancellation_requests_insert_club
  ON public.cancellation_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by_type = 'club'::public.cancellation_requested_by_type
    AND EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.id = application_id
        AND a.club_id = public.current_club_id()
        AND a.status = 'accepted'::public.application_status
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.cancellation_requests cr
      WHERE cr.application_id = cancellation_requests.application_id
        AND cr.status = 'pending'::public.cancellation_request_status
    )
  );

DROP POLICY IF EXISTS cancellation_requests_admin_update ON public.cancellation_requests;
CREATE POLICY cancellation_requests_admin_update
  ON public.cancellation_requests
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON TABLE public.cancellation_requests TO authenticated;
GRANT INSERT ON TABLE public.cancellation_requests TO authenticated;
GRANT UPDATE ON TABLE public.cancellation_requests TO authenticated;

-- -----------------------------------------------------------------------------
-- Email templates (idempotent: UPDATE existing row by type, else INSERT)
-- Production has active_email_template(p_type) but NOT upsert_status_email_template.
-- email_templates has no UNIQUE(type); do not use ON CONFLICT(type).
-- -----------------------------------------------------------------------------

DO $seed$
DECLARE
  v_type public.email_template_type;
  v_name text;
  v_subject text;
  v_body text;
BEGIN
  v_type := 'cancellation-request-received';
  v_name := 'Absageanfrage eingegangen (Admin)';
  v_subject := 'Absageanfrage – {{tournament_name}} / {{team_name}}';
  v_body := $body$Neue Absageanfrage

Turnier: {{tournament_name}}
Mannschaft: {{team_name}}
Verein: {{club_name}}
Ansprechpartner: {{contact_first_name}} {{contact_last_name}}
E-Mail: {{contact_email}}

Fristgerecht: {{cancellation_on_time_label}}
Grund: {{cancellation_reason}}

Bitte im Admin-Bereich prüfen.$body$;

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

  v_type := 'cancellation-request-submitted';
  v_name := 'Absageanfrage eingegangen (Mannschaft)';
  v_subject := 'Absageanfrage eingegangen – {{tournament_name}}';
  v_body := $body$Hallo {{contact_first_name}},

wir haben eure Absageanfrage für {{team_name}} beim {{tournament_name}} erhalten.

Die Absage ist erst nach Bestätigung durch den VfL Kirchheim wirksam.

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

  v_type := 'cancellation-confirmed';
  v_name := 'Absage bestätigt';
  v_subject := 'Absage bestätigt – {{tournament_name}}';
  v_body := $body$Hallo {{contact_first_name}},

eure Absageanfrage für {{team_name}} beim {{tournament_name}} wurde bestätigt.

Eure Mannschaft gilt damit als abgesagt.

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

  v_type := 'cancellation-rejected';
  v_name := 'Absageanfrage abgelehnt';
  v_subject := 'Absageanfrage abgelehnt – {{tournament_name}}';
  v_body := $body$Hallo {{contact_first_name}},

eure Absageanfrage für {{team_name}} beim {{tournament_name}} konnte nicht bestätigt werden.

{{cancellation_admin_note}}

Bei Rückfragen meldet euch bitte über die Kontaktseite.

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

  v_type := 'application-accepted';
  v_name := 'Bewerbung angenommen';
  v_subject := 'Zusage – {{tournament_name}}';
  v_body := $body$Hallo {{contact_first_name}},

vielen Dank für eure Bewerbung mit {{team_name}} für den {{tournament_name}}.

Damit ist eure Teilnahme an unserem Turnier bestätigt.

Turnier:
{{tournament_name}}
Altersklasse: {{age_group}}
Datum: {{tournament_date}}
Ort: {{location}}

{{participation_url}}

Weitere organisatorische Informationen, den Ablauf sowie gegebenenfalls den Spielplan erhaltet ihr rechtzeitig vor dem Turnier.

Wir freuen uns, euch bei uns in Kirchheim begrüßen zu dürfen und wünschen euch schon jetzt eine gute Anreise und ein tolles Turnier.

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

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.store_secure_access_token(
  uuid, public.secure_access_token_purpose, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_secure_access_token(
  uuid, public.secure_access_token_purpose, text, timestamptz
) TO authenticated;

REVOKE ALL ON FUNCTION public.validate_secure_access_token(
  text, public.secure_access_token_purpose
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_secure_access_token(
  text, public.secure_access_token_purpose
) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.submit_cancellation_request_external(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_cancellation_request_external(text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.decide_cancellation_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_cancellation_request(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.reserve_cancellation_email_send(
  uuid, public.email_template_type
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_cancellation_email_send(
  uuid, public.email_template_type
) TO authenticated;

