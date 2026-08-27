-- =============================================================================
-- Status-E-Mail Idempotenz: keine doppelten Status-Mails pro Bewerbung + Typ
-- =============================================================================
--
-- Strategie:
--   1. status_email_send_keys — atomische Reservation vor dem Versand (Race-Schutz)
--   2. email_logs partial unique index — sekundärer Schutz für erfolgreiche sends
--   3. RPC reserve / release — nur Admins, SECURITY DEFINER
--
-- Nur status = 'sent' blockiert erneuten Versand. failed/skipped erlauben Retry
-- (release entfernt die Reservation).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.status_email_send_keys (
  application_id uuid NOT NULL REFERENCES public.applications (id) ON DELETE CASCADE,
  template_type public.email_template_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (application_id, template_type)
);

COMMENT ON TABLE public.status_email_send_keys IS
  'Idempotenz-Schlüssel für Status-E-Mails (Reservation vor Versand + Backfill aus sent-Logs).';

-- Bestehende erfolgreiche Status-Mails übernehmen (Historie bleibt erhalten).
INSERT INTO public.status_email_send_keys (application_id, template_type)
SELECT DISTINCT application_id, template_type
FROM public.email_logs
WHERE application_id IS NOT NULL
  AND template_type IS NOT NULL
  AND status = 'sent'
  AND template_type IN (
    'application-accepted',
    'waiting-list',
    'application-rejected',
    'application-under-review'
  )
ON CONFLICT (application_id, template_type) DO NOTHING;

-- Sekundärer Schutz: kein zweiter sent-Log für dieselbe Kombination.
CREATE UNIQUE INDEX IF NOT EXISTS email_logs_sent_status_idempotency_idx
  ON public.email_logs (application_id, template_type)
  WHERE status = 'sent'
    AND application_id IS NOT NULL
    AND template_type IS NOT NULL
    AND template_type IN (
      'application-accepted',
      'waiting-list',
      'application-rejected',
      'application-under-review'
    );

ALTER TABLE public.status_email_send_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.status_email_send_keys FROM PUBLIC, anon, authenticated;

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
BEGIN
  IF NOT public.is_admin() THEN
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

  IF v_reserved IS NULL THEN
    RETURN 'skip';
  END IF;

  RETURN 'send';
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
  IF NOT public.is_admin() THEN
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
    AND template_type = p_template_type;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_application_status_email_send(
  uuid, public.email_template_type
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_application_status_email_send(
  uuid, public.email_template_type
) TO authenticated;

REVOKE ALL ON FUNCTION public.release_application_status_email_send(
  uuid, public.email_template_type
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_application_status_email_send(
  uuid, public.email_template_type
) TO authenticated;
