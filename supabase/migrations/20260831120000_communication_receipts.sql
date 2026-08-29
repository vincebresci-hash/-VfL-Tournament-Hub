-- =============================================================================
-- PR C2: Communication receipt confirmation
-- =============================================================================
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- tournament_communications: require_confirmation flag
-- -----------------------------------------------------------------------------

ALTER TABLE public.tournament_communications
  ADD COLUMN IF NOT EXISTS require_confirmation boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tournament_communications.require_confirmation IS
  'When true, recipients receive a personal receipt confirmation link (PR C2).';

-- -----------------------------------------------------------------------------
-- communication_recipients: confirmed_at
-- -----------------------------------------------------------------------------

ALTER TABLE public.communication_recipients
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

COMMENT ON COLUMN public.communication_recipients.confirmed_at IS
  'Timestamp when the recipient confirmed receipt of the communication (PR C2).';

-- -----------------------------------------------------------------------------
-- communication_confirmation_tokens
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.communication_confirmation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_recipient_id uuid NOT NULL
    REFERENCES public.communication_recipients (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communication_confirmation_tokens_hash_len
    CHECK (length(token_hash) = 64),
  CONSTRAINT communication_confirmation_tokens_recipient_unique
    UNIQUE (communication_recipient_id),
  CONSTRAINT communication_confirmation_tokens_hash_unique
    UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS communication_confirmation_tokens_hash_idx
  ON public.communication_confirmation_tokens (token_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS communication_confirmation_tokens_recipient_idx
  ON public.communication_confirmation_tokens (communication_recipient_id);

COMMENT ON TABLE public.communication_confirmation_tokens IS
  'Per-recipient SHA-256 receipt confirmation tokens (PR C2). Plaintext never stored.';

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

ALTER TABLE public.communication_confirmation_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.communication_confirmation_tokens FROM PUBLIC, anon;

DROP POLICY IF EXISTS communication_confirmation_tokens_admin_select
  ON public.communication_confirmation_tokens;
CREATE POLICY communication_confirmation_tokens_admin_select
  ON public.communication_confirmation_tokens
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- initiate_communication_send (add require_confirmation)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.initiate_communication_send(
  p_tournament_id uuid,
  p_type text,
  p_subject text,
  p_body text,
  p_important boolean,
  p_recipient_filter text,
  p_application_ids uuid[] DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_require_confirmation boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_communication_id uuid;
  v_recipient_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  IF p_idempotency_key IS NOT NULL AND length(btrim(p_idempotency_key)) > 0 THEN
    SELECT id INTO v_existing_id
    FROM public.tournament_communications
    WHERE idempotency_key = btrim(p_idempotency_key)
    LIMIT 1;

    IF FOUND THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournaments WHERE id = p_tournament_id
  ) THEN
    RAISE EXCEPTION 'tournament not found';
  END IF;

  IF p_type = 'payment-reminder'
     AND p_recipient_filter NOT IN ('payment-pending', 'custom') THEN
    RAISE EXCEPTION 'payment reminder only allows payment-pending or custom filter';
  END IF;

  INSERT INTO public.tournament_communications (
    tournament_id,
    type,
    subject,
    body,
    important,
    recipient_filter,
    status,
    idempotency_key,
    require_confirmation,
    created_by
  )
  VALUES (
    p_tournament_id,
    p_type,
    btrim(p_subject),
    btrim(p_body),
    COALESCE(p_important, false),
    p_recipient_filter,
    'sending',
    NULLIF(btrim(p_idempotency_key), ''),
    COALESCE(p_require_confirmation, false),
    auth.uid()
  )
  RETURNING id INTO v_communication_id;

  INSERT INTO public.communication_recipients (
    communication_id,
    application_id,
    recipient_email,
    recipient_team_name,
    recipient_club_name,
    send_status
  )
  SELECT
    v_communication_id,
    r.application_id,
    r.recipient_email,
    r.recipient_team_name,
    r.recipient_club_name,
    'pending'
  FROM public.resolve_communication_recipients(
    p_tournament_id,
    p_type,
    p_recipient_filter,
    p_application_ids
  ) r;

  GET DIAGNOSTICS v_recipient_count = ROW_COUNT;

  IF v_recipient_count = 0 THEN
    UPDATE public.tournament_communications
    SET status = 'failed', updated_at = now()
    WHERE id = v_communication_id;

    RAISE EXCEPTION 'no eligible recipients';
  END IF;

  UPDATE public.tournament_communications
  SET recipient_count = v_recipient_count, updated_at = now()
  WHERE id = v_communication_id;

  RETURN v_communication_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Issue confirmation token (admin-only, idempotent per recipient)
-- -----------------------------------------------------------------------------

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
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  IF p_token_hash IS NULL OR length(p_token_hash) <> 64 THEN
    RAISE EXCEPTION 'invalid token hash';
  END IF;

  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'invalid expiry';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.communication_confirmation_tokens cct
    WHERE cct.communication_recipient_id = p_communication_recipient_id
      AND cct.revoked_at IS NULL
      AND cct.expires_at > now()
  ) THEN
    RETURN 'exists';
  END IF;

  INSERT INTO public.communication_confirmation_tokens (
    communication_recipient_id,
    token_hash,
    expires_at
  )
  VALUES (
    p_communication_recipient_id,
    p_token_hash,
    p_expires_at
  );

  RETURN 'created';
EXCEPTION
  WHEN unique_violation THEN
    RETURN 'exists';
END;
$$;

-- -----------------------------------------------------------------------------
-- Public receipt context (minimal fields only)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_communication_receipt_context(
  p_token_hash text
)
RETURNS TABLE (
  subject text,
  body text,
  tournament_name text,
  team_name text,
  confirmation_required boolean,
  confirmed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token_hash IS NULL OR length(p_token_hash) <> 64 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    tc.subject,
    tc.body,
    t.name,
    cr.recipient_team_name,
    tc.require_confirmation,
    cr.confirmed_at
  FROM public.communication_confirmation_tokens cct
  INNER JOIN public.communication_recipients cr
    ON cr.id = cct.communication_recipient_id
  INNER JOIN public.tournament_communications tc
    ON tc.id = cr.communication_id
  INNER JOIN public.tournaments t
    ON t.id = tc.tournament_id
  WHERE cct.token_hash = p_token_hash
    AND cct.revoked_at IS NULL
    AND tc.require_confirmation = true
    AND (
      cct.expires_at > now()
      OR cr.confirmed_at IS NOT NULL
    )
  LIMIT 1;
END;
$$;

-- -----------------------------------------------------------------------------
-- Public receipt confirmation (idempotent)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_communication_receipt(
  p_token_hash text
)
RETURNS TABLE (
  confirmed_at timestamptz,
  already_confirmed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_confirmed_at timestamptz;
  v_confirmed_at timestamptz;
BEGIN
  IF p_token_hash IS NULL OR length(p_token_hash) <> 64 THEN
    RETURN;
  END IF;

  IF public.is_public_action_rate_limited(
    'communication_receipt_confirm',
    p_token_hash,
    20,
    interval '1 hour'
  ) THEN
    RETURN;
  END IF;

  PERFORM public.record_public_action_attempt(
    'communication_receipt_confirm',
    p_token_hash
  );

  SELECT cr.confirmed_at
  INTO v_prev_confirmed_at
  FROM public.communication_confirmation_tokens cct
  INNER JOIN public.communication_recipients cr
    ON cr.id = cct.communication_recipient_id
  INNER JOIN public.tournament_communications tc
    ON tc.id = cr.communication_id
  WHERE cct.token_hash = p_token_hash
    AND cct.revoked_at IS NULL
    AND cct.expires_at > now()
    AND tc.require_confirmation = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.communication_recipients cr
  SET confirmed_at = COALESCE(cr.confirmed_at, now())
  FROM public.communication_confirmation_tokens cct,
       public.tournament_communications tc
  WHERE cr.id = cct.communication_recipient_id
    AND tc.id = cr.communication_id
    AND cct.token_hash = p_token_hash
    AND cct.revoked_at IS NULL
    AND cct.expires_at > now()
    AND tc.require_confirmation = true
  RETURNING cr.confirmed_at INTO v_confirmed_at;

  IF v_confirmed_at IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_confirmed_at,
    (v_prev_confirmed_at IS NOT NULL) AS already_confirmed;
END;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.issue_communication_confirmation_token(
  uuid, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_communication_confirmation_token(
  uuid, text, timestamptz
) TO authenticated;

REVOKE ALL ON FUNCTION public.get_communication_receipt_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_communication_receipt_context(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.confirm_communication_receipt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_communication_receipt(text) TO anon, authenticated;
