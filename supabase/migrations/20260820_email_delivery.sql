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
--   - Grants
--
-- SICHERHEIT:
--   - Nur admin / super-admin dürfen email_logs lesen (public.is_admin()).
--   - Normale Vereinsnutzer erhalten KEINEN Lesezugriff.
--   - Authentifizierte Nutzer dürfen ausschließlich Log-Zeilen einfügen
--     (nötig, damit die serverseitige Eingangsbestätigung protokolliert wird),
--     können aber niemals bestehende Zeilen lesen, ändern oder löschen.
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

-- Admins / Super-Admins: voller Zugriff (lesen, schreiben, ändern, löschen).
DROP POLICY IF EXISTS email_logs_admin_all ON public.email_logs;
CREATE POLICY email_logs_admin_all
  ON public.email_logs
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Authentifizierte Nutzer dürfen NUR einfügen (Eingangsbestätigung).
-- Es gibt bewusst KEINE SELECT-Policy für Vereinsnutzer:
-- ohne passende SELECT-Policy liefert ein SELECT für sie keine Zeilen.
DROP POLICY IF EXISTS email_logs_insert_authenticated ON public.email_logs;
CREATE POLICY email_logs_insert_authenticated
  ON public.email_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- Grants (RLS bleibt maßgeblich; anon erhält keinerlei Zugriff)
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.email_logs FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.email_logs TO authenticated;
