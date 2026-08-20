-- =============================================================================
-- VfL Kirchheim Tournament Hub — E-Mail-Versandprotokoll (email_logs)
-- =============================================================================
--
-- AUSFÜHREN:
--   1. Supabase Dashboard öffnen
--   2. SQL Editor
--   3. Diese Datei vollständig einfügen und einmal ausführen
--
-- Die bestehenden Migrationen NICHT verändern und NICHT erneut ausführen.
-- Diese Datei ist idempotent und enthält ausschließlich:
--   - Tabelle public.email_logs
--   - Indexes
--   - Row Level Security + Policies
--   - Eine eng begrenzte SECURITY DEFINER Funktion public.log_email(...)
--   - Grants
--
-- SICHERHEIT / ZUGRIFFSMODELL:
--   - anon:               kein SELECT/INSERT/UPDATE/DELETE, kein EXECUTE.
--   - club (Verein):      KEIN direktes SELECT/INSERT/UPDATE/DELETE.
--   - admin/super-admin:  ausschließlich SELECT (Lesen des Protokolls).
--   - Geschrieben wird das Protokoll AUSSCHLIESSLICH über die kontrollierte
--     Funktion public.log_email(...) (SECURITY DEFINER). Es gibt bewusst
--     keine INSERT-/UPDATE-/DELETE-Policy – so kann niemand über die API
--     Log-Zeilen einfügen, verändern oder löschen.
--   - Die Funktion validiert alle Eingaben, nutzt einen festen search_path,
--     ändert keine Rollen und keine anderen Tabellen. Vereinsnutzer können
--     darüber höchstens einen Log-Eintrag für eine EIGENE Bewerbung erzeugen;
--     freie/fremde Einträge werden abgelehnt.
--   - Es werden ausschließlich Metadaten gespeichert, niemals Provider-Keys.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabelle
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES public.applications (id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.email_templates (id) ON DELETE SET NULL,
  recipient text NOT NULL,
  subject text,
  provider text,
  provider_message_id text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_logs_recipient_not_empty CHECK (length(trim(recipient)) > 0),
  CONSTRAINT email_logs_status_valid
    CHECK (status IN ('pending', 'sent', 'failed'))
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS email_logs_application_id_idx
  ON public.email_logs (application_id);

CREATE INDEX IF NOT EXISTS email_logs_template_id_idx
  ON public.email_logs (template_id);

CREATE INDEX IF NOT EXISTS email_logs_status_idx
  ON public.email_logs (status);

CREATE INDEX IF NOT EXISTS email_logs_created_at_idx
  ON public.email_logs (created_at DESC);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Frühere, zu weit gefasste Policies entfernen (idempotent / Re-Run-sicher).
DROP POLICY IF EXISTS email_logs_admin_all ON public.email_logs;
DROP POLICY IF EXISTS email_logs_insert_authenticated ON public.email_logs;

-- Nur admin / super-admin dürfen das Protokoll LESEN.
DROP POLICY IF EXISTS email_logs_select_admin ON public.email_logs;
CREATE POLICY email_logs_select_admin
  ON public.email_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Bewusst KEINE INSERT/UPDATE/DELETE Policy:
-- Schreibzugriff erfolgt ausschließlich über public.log_email(...).

-- -----------------------------------------------------------------------------
-- Kontrollierte Schreibfunktion (SECURITY DEFINER)
--
-- Schreibt ausschließlich die zulässigen Log-Felder in public.email_logs.
-- Läuft mit den Rechten des Eigentümers (bypass RLS), validiert aber jede
-- Eingabe und autorisiert den Aufrufer:
--   - admin/super-admin dürfen für jede Bewerbung protokollieren,
--   - Vereinsnutzer nur für eine Bewerbung des EIGENEN Vereins.
-- Es werden keine Rollen geändert und keine anderen Tabellen verändert.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_email(
  p_recipient text,
  p_status text,
  p_application_id uuid DEFAULT NULL,
  p_template_id uuid DEFAULT NULL,
  p_subject text DEFAULT NULL,
  p_provider text DEFAULT NULL,
  p_provider_message_id text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_sent_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient text := NULLIF(TRIM(COALESCE(p_recipient, '')), '');
  v_status text := lower(NULLIF(TRIM(COALESCE(p_status, '')), ''));
  v_app_club uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Eingaben validieren.
  IF v_recipient IS NULL THEN
    RAISE EXCEPTION 'recipient is required';
  END IF;

  IF v_status IS NULL OR v_status NOT IN ('pending', 'sent', 'failed') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  -- Autorisierung: Nicht-Admins dürfen nur für eine EIGENE Bewerbung loggen.
  IF NOT public.is_admin() THEN
    IF p_application_id IS NULL THEN
      RAISE EXCEPTION 'not allowed';
    END IF;

    SELECT club_id
    INTO v_app_club
    FROM public.applications
    WHERE id = p_application_id;

    IF v_app_club IS NULL
       OR v_app_club IS DISTINCT FROM public.current_club_id() THEN
      RAISE EXCEPTION 'not allowed';
    END IF;
  END IF;

  INSERT INTO public.email_logs (
    application_id,
    template_id,
    recipient,
    subject,
    provider,
    provider_message_id,
    status,
    error_message,
    sent_at
  )
  VALUES (
    p_application_id,
    p_template_id,
    v_recipient,
    NULLIF(TRIM(COALESCE(p_subject, '')), ''),
    NULLIF(TRIM(COALESCE(p_provider, '')), ''),
    NULLIF(TRIM(COALESCE(p_provider_message_id, '')), ''),
    v_status,
    NULLIF(TRIM(COALESCE(p_error_message, '')), ''),
    COALESCE(p_sent_at, CASE WHEN v_status = 'sent' THEN now() ELSE NULL END)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Grants (RLS bleibt maßgeblich; anon erhält keinerlei Zugriff)
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.email_logs FROM PUBLIC, anon;
-- Nur SELECT für authenticated (per Policy weiter auf admins eingeschränkt).
-- KEIN INSERT/UPDATE/DELETE für Vereins- oder anonyme Nutzer.
GRANT SELECT ON TABLE public.email_logs TO authenticated;

REVOKE ALL ON FUNCTION public.log_email(
  text, text, uuid, uuid, text, text, text, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_email(
  text, text, uuid, uuid, text, text, text, text, timestamptz
) TO authenticated;
