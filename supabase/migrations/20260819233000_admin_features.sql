-- =============================================================================
-- VfL Kirchheim Tournament Hub — Admin-Funktionen
-- =============================================================================
--
-- AUSFÜHREN:
--   1. Supabase Dashboard öffnen
--   2. SQL Editor
--   3. Diese Datei vollständig einfügen und einmal ausführen
--
-- Die initiale Migration NICHT erneut ausführen und NICHT verändern.
-- Diese Datei ist weitgehend idempotent.
--
-- Enthält:
--   - clubs.status (Aktiv / Inaktiv)
--   - email_templates (nur admin / super-admin)
--   - app_settings (nur admin / super-admin)
--
-- Club-Nutzer erhalten keinen Zugriff auf E-Mail-Vorlagen oder Einstellungen.
-- Rollenprüfung ausschließlich über public.is_admin() / profiles.role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  CREATE TYPE public.club_status AS ENUM ('active', 'inactive');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.email_template_type AS ENUM (
    'application-received',
    'application-accepted',
    'waiting-list',
    'application-rejected',
    'follow-up',
    'general'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- -----------------------------------------------------------------------------
-- Existing tables: missing fields
-- -----------------------------------------------------------------------------

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS status public.club_status NOT NULL DEFAULT 'active';

-- -----------------------------------------------------------------------------
-- email_templates
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  type public.email_template_type NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_templates_name_not_empty CHECK (length(trim(name)) > 0),
  CONSTRAINT email_templates_subject_not_empty CHECK (length(trim(subject)) > 0),
  CONSTRAINT email_templates_body_not_empty CHECK (length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS email_templates_type_idx
  ON public.email_templates (type);

CREATE INDEX IF NOT EXISTS email_templates_active_idx
  ON public.email_templates (active);

DROP TRIGGER IF EXISTS set_email_templates_updated_at ON public.email_templates;
CREATE TRIGGER set_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- app_settings
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT 'null'::jsonb,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT app_settings_key_not_empty CHECK (length(trim(key)) > 0)
);

DROP TRIGGER IF EXISTS set_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER set_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security — admin / super-admin only
-- -----------------------------------------------------------------------------

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_templates_admin_all ON public.email_templates;
CREATE POLICY email_templates_admin_all
  ON public.email_templates
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS app_settings_admin_all ON public.app_settings;
CREATE POLICY app_settings_admin_all
  ON public.app_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.email_templates FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.app_settings FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_settings TO authenticated;

-- -----------------------------------------------------------------------------
-- Seed settings (do not overwrite values an admin already changed)
-- -----------------------------------------------------------------------------

INSERT INTO public.app_settings (key, value, description)
VALUES
  (
    'platform_name',
    to_jsonb('VfL Kirchheim Tournament Hub'::text),
    'Öffentlicher Name der Plattform'
  ),
  (
    'organizer_name',
    to_jsonb('VfL Kirchheim'::text),
    'Name des veranstaltenden Vereins'
  ),
  (
    'contact_email',
    to_jsonb(''::text),
    'Zentrale Kontakt-E-Mail'
  ),
  (
    'contact_phone',
    to_jsonb(''::text),
    'Zentrale Telefonnummer'
  ),
  (
    'applications_enabled',
    to_jsonb(true),
    'Bewerbungen global aktivieren oder deaktivieren'
  ),
  (
    'waitlist_enabled',
    to_jsonb(true),
    'Warteliste für Bewerbungen aktivieren oder deaktivieren'
  ),
  (
    'application_confirmation_enabled',
    to_jsonb(true),
    'Bewerbungsbestätigung (später per E-Mail) aktivieren oder deaktivieren'
  ),
  (
    'dashboard_show_new_applications',
    to_jsonb(true),
    'Neue Bewerbungen im Admin-Dashboard anzeigen'
  ),
  (
    'default_application_status',
    to_jsonb('new'::text),
    'Standardstatus neu eingehender Bewerbungen'
  )
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Seed email templates (only if this name does not exist yet)
-- Placeholders: {{club_name}}, {{team_name}}, {{tournament_name}}
-- -----------------------------------------------------------------------------

INSERT INTO public.email_templates (name, subject, body, type, active)
SELECT
  seed.name,
  seed.subject,
  seed.body,
  seed.type,
  true
FROM (
  VALUES
    (
      'Bewerbung eingegangen',
      'Eure Bewerbung ist eingegangen',
      E'Hallo {{club_name}},\n\nvielen Dank für die Bewerbung von {{team_name}} für {{tournament_name}}.\n\nWir haben eure Unterlagen erhalten und prüfen sie intern. Eine Bewerbung ist keine automatische Teilnahme. Ihr erhaltet eine Rückmeldung, sobald eine Entscheidung vorliegt.\n\nSportliche Grüße\nVfL Kirchheim Tournament Hub',
      'application-received'::public.email_template_type
    ),
    (
      'Bewerbung angenommen',
      'Bewerbung angenommen',
      E'Hallo {{club_name}},\n\nwir freuen uns, {{team_name}} für {{tournament_name}} im Teilnehmerfeld begrüßen zu dürfen.\n\nWeitere organisatorische Hinweise folgen rechtzeitig vor dem Turniertag.\n\nSportliche Grüße\nVfL Kirchheim Tournament Hub',
      'application-accepted'::public.email_template_type
    ),
    (
      'Warteliste',
      'Ihr steht auf der Warteliste',
      E'Hallo {{club_name}},\n\n{{team_name}} steht für {{tournament_name}} aktuell auf der Warteliste.\n\nSobald ein Platz frei wird, melden wir uns. Bitte betrachtet das noch nicht als Zusage.\n\nSportliche Grüße\nVfL Kirchheim Tournament Hub',
      'waiting-list'::public.email_template_type
    ),
    (
      'Bewerbung abgelehnt',
      'Rückmeldung zu eurer Bewerbung',
      E'Hallo {{club_name}},\n\nvielen Dank für das Interesse an {{tournament_name}}. Leider können wir {{team_name}} in diesem Teilnehmerfeld nicht berücksichtigen.\n\nWir würden uns über eine Bewerbung bei einem der nächsten Turniere freuen.\n\nSportliche Grüße\nVfL Kirchheim Tournament Hub',
      'application-rejected'::public.email_template_type
    ),
    (
      'Rückfrage',
      'Rückfrage zu eurer Bewerbung',
      E'Hallo {{club_name}},\n\nzu der Bewerbung von {{team_name}} für {{tournament_name}} haben wir noch eine kurze Rückfrage.\n\nBitte antwortet uns auf diese Nachricht.\n\nSportliche Grüße\nVfL Kirchheim Tournament Hub',
      'follow-up'::public.email_template_type
    ),
    (
      'Allgemeine Nachricht',
      'Nachricht vom VfL Kirchheim Tournament Hub',
      E'Hallo {{club_name}},\n\n[Hier Nachricht einfügen]\n\nSportliche Grüße\nVfL Kirchheim Tournament Hub',
      'general'::public.email_template_type
    )
) AS seed(name, subject, body, type)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.email_templates existing
  WHERE existing.name = seed.name
);
