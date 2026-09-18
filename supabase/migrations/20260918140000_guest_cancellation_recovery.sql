-- PR-C2A: Guest cancellation recovery (match + atomic token rotate)
-- DO NOT apply automatically — manual SQL review required before production.
--
-- Architecture:
--   Trusted server action (service_role) generates plaintext token + SHA-256 hash,
--   calls issue_guest_cancellation_recovery_token, emails /teilnahme/{token}
--   ONLY to stored applications.contact_email when exactly one guest match exists.
--
-- Does NOT create cancellation_requests rows.
-- Does NOT grant anon/authenticated table access to applications or tokens.
-- Reuses secure_access_tokens.purpose = 'cancellation' and existing /teilnahme flow.
-- Does NOT alter EXECUTE grants on shared public_action_attempts helpers.

-- -----------------------------------------------------------------------------
-- Atomic revoke-by-hash (email-send failure cleanup)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_secure_access_token_by_hash(
  p_token_hash text,
  p_purpose public.secure_access_token_purpose DEFAULT 'cancellation'::public.secure_access_token_purpose
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF p_token_hash IS NULL OR char_length(p_token_hash) <> 64 THEN
    RETURN false;
  END IF;

  IF p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  UPDATE public.secure_access_tokens
  SET revoked_at = now()
  WHERE token_hash = p_token_hash
    AND purpose = p_purpose
    AND revoked_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

COMMENT ON FUNCTION public.revoke_secure_access_token_by_hash(text, public.secure_access_token_purpose) IS
  'PR-C2A: revoke a secure_access_tokens row by hash after failed recovery email send. service_role only.';

REVOKE ALL ON FUNCTION public.revoke_secure_access_token_by_hash(
  text, public.secure_access_token_purpose
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_secure_access_token_by_hash(
  text, public.secure_access_token_purpose
) FROM anon;
REVOKE ALL ON FUNCTION public.revoke_secure_access_token_by_hash(
  text, public.secure_access_token_purpose
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_secure_access_token_by_hash(
  text, public.secure_access_token_purpose
) TO service_role;

-- -----------------------------------------------------------------------------
-- Guest cancellation recovery: match + atomic token rotate
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.issue_guest_cancellation_recovery_token(
  p_tournament_id uuid,
  p_contact_email text,
  p_club_name text,
  p_team_name text,
  p_token_hash text,
  p_email_identifier_hash text,
  p_tournament_email_identifier_hash text,
  p_ip_identifier_hash text DEFAULT NULL
)
RETURNS TABLE (
  should_send boolean,
  contact_email text,
  contact_first_name text,
  tournament_name text,
  tournament_date date,
  team_name text,
  club_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_club text;
  v_team text;
  v_email_key text;
  v_combo_key text;
  v_ip_key text;
  v_match_count integer := 0;
  v_app public.applications%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
  v_expires_at timestamptz;
  v_rate_limited boolean := false;
BEGIN
  -- Default neutral row
  should_send := false;
  contact_email := NULL;
  contact_first_name := NULL;
  tournament_name := NULL;
  tournament_date := NULL;
  team_name := NULL;
  club_name := NULL;

  -- Input validation (fail closed → neutral)
  IF p_tournament_id IS NULL
     OR p_contact_email IS NULL
     OR p_club_name IS NULL
     OR p_team_name IS NULL
     OR p_token_hash IS NULL
     OR p_email_identifier_hash IS NULL
     OR p_tournament_email_identifier_hash IS NULL
  THEN
    RETURN NEXT;
    RETURN;
  END IF;

  IF char_length(p_token_hash) <> 64 OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN NEXT;
    RETURN;
  END IF;

  IF char_length(p_email_identifier_hash) <> 64
     OR p_email_identifier_hash !~ '^[0-9a-f]{64}$'
  THEN
    RETURN NEXT;
    RETURN;
  END IF;

  IF char_length(p_tournament_email_identifier_hash) <> 64
     OR p_tournament_email_identifier_hash !~ '^[0-9a-f]{64}$'
  THEN
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_ip_identifier_hash IS NOT NULL
     AND (
       char_length(p_ip_identifier_hash) <> 64
       OR p_ip_identifier_hash !~ '^[0-9a-f]{64}$'
     )
  THEN
    RETURN NEXT;
    RETURN;
  END IF;

  -- Normalization: lower(btrim(...)) — deterministic equality, not fuzzy
  v_email := lower(btrim(p_contact_email));
  v_club := lower(btrim(p_club_name));
  v_team := lower(btrim(p_team_name));

  IF v_email = '' OR v_club = '' OR v_team = '' OR position('@' IN v_email) = 0 THEN
    RETURN NEXT;
    RETURN;
  END IF;

  -- Rate-limit keys are pre-hashed by the trusted server (no raw PII stored)
  v_email_key := p_email_identifier_hash;
  v_combo_key := p_tournament_email_identifier_hash;
  v_ip_key := NULLIF(btrim(COALESCE(p_ip_identifier_hash, '')), '');

  -- Existing project semantics: CHECK then RECORD (COUNT(*) >= max).
  -- With max=3 this allows exactly 3 successful path entries / hour, blocks the 4th.
  IF public.is_public_action_rate_limited(
    'guest_cancellation_recovery_email',
    v_email_key,
    3,
    interval '1 hour'
  ) THEN
    v_rate_limited := true;
  END IF;

  IF public.is_public_action_rate_limited(
    'guest_cancellation_recovery_tournament_email',
    v_combo_key,
    5,
    interval '1 hour'
  ) THEN
    v_rate_limited := true;
  END IF;

  IF v_ip_key IS NOT NULL
     AND public.is_public_action_rate_limited(
       'guest_cancellation_recovery_ip',
       v_ip_key,
       10,
       interval '1 hour'
     )
  THEN
    v_rate_limited := true;
  END IF;

  IF v_rate_limited THEN
    RETURN NEXT;
    RETURN;
  END IF;

  -- Count this request even if identity ultimately does not match (0 / >1 / ineligible).
  PERFORM public.record_public_action_attempt(
    'guest_cancellation_recovery_email',
    v_email_key
  );
  PERFORM public.record_public_action_attempt(
    'guest_cancellation_recovery_tournament_email',
    v_combo_key
  );
  IF v_ip_key IS NOT NULL THEN
    PERFORM public.record_public_action_attempt(
      'guest_cancellation_recovery_ip',
      v_ip_key
    );
  END IF;

  -- Exact guest match count (accepted, non-archived, club_id IS NULL)
  SELECT COUNT(*)::integer
  INTO v_match_count
  FROM public.applications a
  WHERE a.tournament_id = p_tournament_id
    AND a.club_id IS NULL
    AND a.status = 'accepted'::public.application_status
    AND a.archived_at IS NULL
    AND lower(btrim(a.contact_email)) = v_email
    AND lower(btrim(a.club_name)) = v_club
    AND lower(btrim(a.team_name)) = v_team;

  -- 0 or >1 → neutral; never pick arbitrarily
  IF v_match_count IS DISTINCT FROM 1 THEN
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT a.*
  INTO v_app
  FROM public.applications a
  WHERE a.tournament_id = p_tournament_id
    AND a.club_id IS NULL
    AND a.status = 'accepted'::public.application_status
    AND a.archived_at IS NULL
    AND lower(btrim(a.contact_email)) = v_email
    AND lower(btrim(a.club_name)) = v_club
    AND lower(btrim(a.team_name)) = v_team
  LIMIT 1;

  IF NOT FOUND OR v_app.contact_email IS NULL OR btrim(v_app.contact_email) = '' THEN
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT t.*
  INTO v_tournament
  FROM public.tournaments t
  WHERE t.id = v_app.tournament_id;

  IF NOT FOUND OR v_tournament.date IS NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  -- Same expiry semantics as secureAccessTokenExpiresAt: tournament UTC date + 30 days
  v_expires_at :=
    ((v_tournament.date::timestamp AT TIME ZONE 'UTC') + interval '30 days');

  IF v_expires_at <= now() THEN
    RETURN NEXT;
    RETURN;
  END IF;

  -- Atomic rotate for THIS application only (purpose = cancellation).
  -- Email-failure tradeoff (accepted): if the trusted server later fails to deliver
  -- the recovery email, it revokes the newly minted hash. The previous active token
  -- for this application was already revoked here, so the application may temporarily
  -- have no active participation token until another successful recovery.
  -- Alternatives (dual-active tokens / restore-old) conflict with
  -- secure_access_tokens_active_per_application_purpose or introduce concurrency races.
  UPDATE public.secure_access_tokens
  SET revoked_at = now()
  WHERE application_id = v_app.id
    AND purpose = 'cancellation'::public.secure_access_token_purpose
    AND revoked_at IS NULL;

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

  -- Success payload for trusted server email (never returned to public UI)
  should_send := true;
  contact_email := btrim(v_app.contact_email);
  contact_first_name := NULLIF(btrim(COALESCE(v_app.contact_first_name, '')), '');
  tournament_name := NULLIF(btrim(COALESCE(v_tournament.name, '')), '');
  tournament_date := v_tournament.date;
  team_name := NULLIF(btrim(COALESCE(v_app.team_name, '')), '');
  club_name := NULLIF(btrim(COALESCE(v_app.club_name, '')), '');
  RETURN NEXT;
  RETURN;
EXCEPTION
  WHEN OTHERS THEN
    -- Fail closed: any mint/rotate error → neutral (transaction rolls back)
    should_send := false;
    contact_email := NULL;
    contact_first_name := NULL;
    tournament_name := NULL;
    tournament_date := NULL;
    team_name := NULL;
    club_name := NULL;
    RETURN NEXT;
    RETURN;
END;
$$;

COMMENT ON FUNCTION public.issue_guest_cancellation_recovery_token(
  uuid, text, text, text, text, text, text, text
) IS
  'PR-C2A: guest-only cancellation participation recovery. Exactly one accepted guest match required. Atomic cancel-token rotate. service_role only. Does not create cancellation_requests.';

REVOKE ALL ON FUNCTION public.issue_guest_cancellation_recovery_token(
  uuid, text, text, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_guest_cancellation_recovery_token(
  uuid, text, text, text, text, text, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.issue_guest_cancellation_recovery_token(
  uuid, text, text, text, text, text, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.issue_guest_cancellation_recovery_token(
  uuid, text, text, text, text, text, text, text
) TO service_role;

-- Explicit non-goals (documentation / review anchors):
-- * No GRANT SELECT/INSERT/UPDATE on applications to anon
-- * No GRANT on secure_access_tokens to anon/authenticated
-- * No GRANT on cancellation_requests
-- * No RLS policy changes
