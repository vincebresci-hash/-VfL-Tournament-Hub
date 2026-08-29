-- =============================================================================
-- PR C1: Communication Center (email delivery, no public confirmation)
-- =============================================================================
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- tournament_communications
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tournament_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments (id) ON DELETE CASCADE,
  type text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  important boolean NOT NULL DEFAULT false,
  recipient_filter text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  recipient_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  idempotency_key text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  archived_at timestamptz,
  CONSTRAINT tournament_communications_type_check
    CHECK (type IN (
      'tournament-info',
      'schedule',
      'important-change',
      'payment-reminder',
      'general'
    )),
  CONSTRAINT tournament_communications_status_check
    CHECK (status IN (
      'draft',
      'sending',
      'sent',
      'partially_sent',
      'failed',
      'cancelled'
    )),
  CONSTRAINT tournament_communications_recipient_filter_check
    CHECK (recipient_filter IN (
      'accepted',
      'payment-paid',
      'payment-pending',
      'waitlist',
      'custom'
    )),
  CONSTRAINT tournament_communications_subject_nonempty
    CHECK (length(btrim(subject)) > 0),
  CONSTRAINT tournament_communications_body_nonempty
    CHECK (length(btrim(body)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS tournament_communications_idempotency_key_uidx
  ON public.tournament_communications (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS tournament_communications_tournament_created_idx
  ON public.tournament_communications (tournament_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tournament_communications_status_created_idx
  ON public.tournament_communications (status, created_at DESC);

DROP TRIGGER IF EXISTS set_tournament_communications_updated_at ON public.tournament_communications;
CREATE TRIGGER set_tournament_communications_updated_at
  BEFORE UPDATE ON public.tournament_communications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.tournament_communications IS
  'Admin-authored tournament communications (PR C1 email delivery).';

-- -----------------------------------------------------------------------------
-- communication_recipients
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.communication_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id uuid NOT NULL
    REFERENCES public.tournament_communications (id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.applications (id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  recipient_team_name text NOT NULL,
  recipient_club_name text,
  send_status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  email_log_id uuid,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communication_recipients_send_status_check
    CHECK (send_status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  CONSTRAINT communication_recipients_email_nonempty
    CHECK (length(btrim(recipient_email)) > 0),
  CONSTRAINT communication_recipients_team_nonempty
    CHECK (length(btrim(recipient_team_name)) > 0),
  CONSTRAINT communication_recipients_unique_application
    UNIQUE (communication_id, application_id)
);

CREATE INDEX IF NOT EXISTS communication_recipients_communication_idx
  ON public.communication_recipients (communication_id, send_status);

CREATE INDEX IF NOT EXISTS communication_recipients_application_idx
  ON public.communication_recipients (application_id);

COMMENT ON TABLE public.communication_recipients IS
  'Per-recipient snapshot and send state for tournament communications.';

-- -----------------------------------------------------------------------------
-- communication_email_send_keys (per-recipient idempotency)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.communication_email_send_keys (
  communication_recipient_id uuid PRIMARY KEY
    REFERENCES public.communication_recipients (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.communication_email_send_keys IS
  'Idempotency for communication emails per recipient row.';

-- -----------------------------------------------------------------------------
-- email_logs extension
-- -----------------------------------------------------------------------------

ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS communication_recipient_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'email_logs_communication_recipient_id_fkey'
  ) THEN
    ALTER TABLE public.email_logs
      ADD CONSTRAINT email_logs_communication_recipient_id_fkey
      FOREIGN KEY (communication_recipient_id)
      REFERENCES public.communication_recipients (id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS email_logs_communication_recipient_id_idx
  ON public.email_logs (communication_recipient_id)
  WHERE communication_recipient_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

ALTER TABLE public.tournament_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_email_send_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tournament_communications_admin_all ON public.tournament_communications;
CREATE POLICY tournament_communications_admin_all
  ON public.tournament_communications
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS communication_recipients_admin_all ON public.communication_recipients;
CREATE POLICY communication_recipients_admin_all
  ON public.communication_recipients
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.communication_email_send_keys FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Internal recipient resolution
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_communication_recipients(
  p_tournament_id uuid,
  p_communication_type text,
  p_recipient_filter text,
  p_application_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  application_id uuid,
  recipient_email text,
  recipient_team_name text,
  recipient_club_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_communication_type = 'payment-reminder'
     AND p_recipient_filter NOT IN ('payment-pending', 'custom') THEN
    RAISE EXCEPTION 'payment reminder only allows payment-pending or custom filter';
  END IF;

  IF p_recipient_filter = 'custom' THEN
    IF p_application_ids IS NULL OR cardinality(p_application_ids) = 0 THEN
      RAISE EXCEPTION 'custom filter requires application ids';
    END IF;

    RETURN QUERY
    SELECT
      a.id,
      btrim(a.contact_email),
      COALESCE(NULLIF(btrim(a.team_name), ''), 'Mannschaft'),
      NULLIF(btrim(a.club_name), '')
    FROM public.applications a
    WHERE a.tournament_id = p_tournament_id
      AND a.id = ANY (p_application_ids)
      AND a.status NOT IN ('cancelled'::public.application_status, 'rejected'::public.application_status)
      AND a.contact_email IS NOT NULL
      AND length(btrim(a.contact_email)) > 0
      AND (
        p_communication_type <> 'payment-reminder'
        OR (
          a.status = 'accepted'::public.application_status
          AND a.payment_status = 'pending'::public.payment_status
          AND a.participation_fee IS NOT NULL
        )
      )
      AND (
        p_communication_type = 'payment-reminder'
        OR a.status IN (
          'accepted'::public.application_status,
          'waiting-list'::public.application_status
        )
      );
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    btrim(a.contact_email),
    COALESCE(NULLIF(btrim(a.team_name), ''), 'Mannschaft'),
    NULLIF(btrim(a.club_name), '')
  FROM public.applications a
  WHERE a.tournament_id = p_tournament_id
    AND a.contact_email IS NOT NULL
    AND length(btrim(a.contact_email)) > 0
    AND a.status NOT IN ('cancelled'::public.application_status, 'rejected'::public.application_status)
    AND (
      (p_recipient_filter = 'accepted' AND a.status = 'accepted'::public.application_status)
      OR (
        p_recipient_filter = 'payment-paid'
        AND a.status = 'accepted'::public.application_status
        AND a.payment_status = 'paid'::public.payment_status
      )
      OR (
        p_recipient_filter = 'payment-pending'
        AND a.status = 'accepted'::public.application_status
        AND a.payment_status = 'pending'::public.payment_status
        AND (
          p_communication_type <> 'payment-reminder'
          OR a.participation_fee IS NOT NULL
        )
      )
      OR (
        p_recipient_filter = 'waitlist'
        AND a.status = 'waiting-list'::public.application_status
      )
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Preview recipients (admin)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.preview_communication_recipients(
  p_tournament_id uuid,
  p_communication_type text,
  p_recipient_filter text,
  p_application_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  application_id uuid,
  recipient_email text,
  recipient_team_name text,
  recipient_club_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.resolve_communication_recipients(
    p_tournament_id,
    p_communication_type,
    p_recipient_filter,
    p_application_ids
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Initiate communication send (create + freeze recipients)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.initiate_communication_send(
  p_tournament_id uuid,
  p_type text,
  p_subject text,
  p_body text,
  p_important boolean,
  p_recipient_filter text,
  p_application_ids uuid[] DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
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
-- Per-recipient send reservation
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_communication_email_send(
  p_communication_recipient_id uuid
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.communication_recipients cr
    INNER JOIN public.tournament_communications tc ON tc.id = cr.communication_id
    WHERE cr.id = p_communication_recipient_id
      AND tc.status = 'sending'
      AND cr.send_status = 'pending'
  ) THEN
    RETURN 'skip';
  END IF;

  INSERT INTO public.communication_email_send_keys (communication_recipient_id)
  VALUES (p_communication_recipient_id)
  ON CONFLICT (communication_recipient_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN 'skip';
  END IF;

  UPDATE public.communication_recipients
  SET send_status = 'sending'
  WHERE id = p_communication_recipient_id
    AND send_status = 'pending';

  IF NOT FOUND THEN
    RETURN 'skip';
  END IF;

  RETURN 'send';
END;
$$;

-- -----------------------------------------------------------------------------
-- Complete recipient send
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_communication_recipient(
  p_recipient_id uuid,
  p_send_status text,
  p_email_log_id uuid DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  IF p_send_status NOT IN ('sent', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'invalid send status';
  END IF;

  UPDATE public.communication_recipients
  SET
    send_status = p_send_status,
    sent_at = CASE WHEN p_send_status = 'sent' THEN now() ELSE sent_at END,
    email_log_id = p_email_log_id,
    error_message = NULLIF(btrim(p_error_message), '')
  WHERE id = p_recipient_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Finalize communication aggregate status
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalize_communication(
  p_communication_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sent integer;
  v_failed integer;
  v_pending integer;
  v_sending integer;
  v_total integer;
  v_status text;
  v_complete boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE send_status = 'sent'),
    COUNT(*) FILTER (WHERE send_status = 'failed'),
    COUNT(*) FILTER (WHERE send_status = 'pending'),
    COUNT(*) FILTER (WHERE send_status = 'sending'),
    COUNT(*)
  INTO v_sent, v_failed, v_pending, v_sending, v_total
  FROM public.communication_recipients
  WHERE communication_id = p_communication_id;

  v_complete := (v_pending = 0 AND v_sending = 0);

  IF v_total = 0 THEN
    v_status := 'failed';
  ELSIF NOT v_complete THEN
    v_status := 'sending';
  ELSIF v_sent = v_total THEN
    v_status := 'sent';
  ELSIF v_failed = v_total THEN
    v_status := 'failed';
  ELSIF v_sent > 0 AND v_failed > 0 THEN
    v_status := 'partially_sent';
  ELSIF v_sent > 0 THEN
    v_status := 'sent';
  ELSE
    v_status := 'failed';
  END IF;

  UPDATE public.tournament_communications
  SET
    sent_count = v_sent,
    failed_count = v_failed,
    status = v_status,
    sent_at = CASE WHEN v_complete THEN now() ELSE sent_at END,
    updated_at = now()
  WHERE id = p_communication_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.resolve_communication_recipients(
  uuid, text, text, uuid[]
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.preview_communication_recipients(
  uuid, text, text, uuid[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_communication_recipients(
  uuid, text, text, uuid[]
) TO authenticated;

REVOKE ALL ON FUNCTION public.initiate_communication_send(
  uuid, text, text, text, boolean, text, uuid[], text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.initiate_communication_send(
  uuid, text, text, text, boolean, text, uuid[], text
) TO authenticated;

REVOKE ALL ON FUNCTION public.reserve_communication_email_send(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_communication_email_send(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.complete_communication_recipient(
  uuid, text, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_communication_recipient(
  uuid, text, uuid, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.finalize_communication(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_communication(uuid) TO authenticated;
