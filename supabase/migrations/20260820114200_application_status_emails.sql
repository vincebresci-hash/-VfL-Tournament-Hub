-- =============================================================================
-- VfL Kirchheim Tournament Hub — Status-E-Mails für Bewerbungen
-- =============================================================================
--
-- AUSFÜHREN:
--   1. Supabase Dashboard öffnen
--   2. SQL Editor
--   3. Diese Datei vollständig einfügen und einmal ausführen
--
-- Die vorherigen Migrationen NICHT erneut ausführen und NICHT verändern.
-- Diese Datei ist weitgehend idempotent.
--
-- Mapping (bestehende Enum-Werte, Bindestrich):
--   accepted      → application-accepted
--   waiting-list  → waiting-list
--   rejected      → application-rejected
--   under-review  → application-under-review
-- =============================================================================

ALTER TYPE public.email_template_type
  ADD VALUE IF NOT EXISTS 'application-under-review';

-- -----------------------------------------------------------------------------
-- email_logs
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES public.applications (id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.email_templates (id) ON DELETE SET NULL,
  template_type public.email_template_type,
  to_email text NOT NULL,
  subject text,
  body text,
  status text NOT NULL,
  error text,
  provider text,
  provider_message_id text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_logs_status_check
    CHECK (status IN ('sent', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS email_logs_application_id_idx
  ON public.email_logs (application_id);

CREATE INDEX IF NOT EXISTS email_logs_created_at_idx
  ON public.email_logs (created_at DESC);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_logs_admin_select ON public.email_logs;
CREATE POLICY email_logs_admin_select
  ON public.email_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS email_logs_admin_insert ON public.email_logs;
CREATE POLICY email_logs_admin_insert
  ON public.email_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.email_logs FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.email_logs TO authenticated;

-- -----------------------------------------------------------------------------
-- Standardvorlagen (per Typ upserten, Admin-Edits gleicher Namen überschreiben)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_status_email_template(
  p_name text,
  p_subject text,
  p_body text,
  p_type public.email_template_type
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.email_templates
  SET
    subject = p_subject,
    body = p_body,
    name = p_name
  WHERE type = p_type
    AND name = p_name;

  SELECT id INTO v_id
  FROM public.email_templates
  WHERE type = p_type
  ORDER BY created_at
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.email_templates (name, subject, body, type, active)
    VALUES (p_name, p_subject, p_body, p_type, true);
  END IF;
END;
$$;

SELECT public.upsert_status_email_template(
  'Bewerbung angenommen',
  'Teilnahme bestätigt – {{tournament_name}}',
  $tpl$Hallo {{contact_first_name}},

wir freuen uns, euch mitteilen zu können, dass eure Mannschaft {{team_name}} für den {{tournament_name}} angenommen wurde.

Damit ist eure Teilnahme an unserem Turnier bestätigt.

Turnier:
{{tournament_name}}
Altersklasse: {{age_group}}
Datum: {{tournament_date}}
Ort: {{location}}

Weitere organisatorische Informationen, den Ablauf sowie gegebenenfalls den Spielplan erhaltet ihr rechtzeitig vor dem Turnier.

Wir freuen uns, euch bei uns in Kirchheim begrüßen zu dürfen und wünschen euch schon jetzt eine gute Anreise und ein tolles Turnier.

Sportliche Grüße

VfL Kirchheim
Tournament Hub$tpl$,
  'application-accepted'
);

SELECT public.upsert_status_email_template(
  'Warteliste',
  'Warteliste – {{tournament_name}}',
  $tpl$Hallo {{contact_first_name}},

vielen Dank für eure Bewerbung mit {{team_name}} für den {{tournament_name}}.

Aktuell können wir euch noch keine feste Teilnahme zusagen. Wir haben eure Mannschaft deshalb auf unsere Warteliste aufgenommen.

Sollte ein Platz frei werden oder sich das Teilnehmerfeld verändern, melden wir uns bei euch.

Turnier:
{{tournament_name}}
Altersklasse: {{age_group}}
Datum: {{tournament_date}}
Ort: {{location}}

Vielen Dank für euer Interesse an unserem Turnier.

Sportliche Grüße

VfL Kirchheim
Tournament Hub$tpl$,
  'waiting-list'
);

SELECT public.upsert_status_email_template(
  'Bewerbung abgelehnt',
  'Rückmeldung zu eurer Bewerbung – {{tournament_name}}',
  $tpl$Hallo {{contact_first_name}},

vielen Dank für eure Bewerbung mit {{team_name}} für den {{tournament_name}}.

Leider können wir eure Mannschaft für dieses Turnier nicht in das Teilnehmerfeld aufnehmen.

Da wir nur eine begrenzte Anzahl an Startplätzen vergeben können und das Teilnehmerfeld möglichst passend zusammenstellen möchten, können wir leider nicht jede Bewerbung berücksichtigen.

Wir würden uns freuen, euch bei einem unserer zukünftigen Turniere wieder begrüßen zu dürfen.

Vielen Dank für euer Verständnis und euer Interesse.

Sportliche Grüße

VfL Kirchheim
Tournament Hub$tpl$,
  'application-rejected'
);

SELECT public.upsert_status_email_template(
  'Bewerbung in Prüfung',
  'Eure Bewerbung wird geprüft – {{tournament_name}}',
  $tpl$Hallo {{contact_first_name}},

vielen Dank für eure Bewerbung mit {{team_name}} für den {{tournament_name}}.

Eure Bewerbung befindet sich aktuell in Prüfung.

Wir stellen das Teilnehmerfeld sorgfältig zusammen und melden uns bei euch, sobald eine Entscheidung getroffen wurde.

Turnier:
{{tournament_name}}
Altersklasse: {{age_group}}
Datum: {{tournament_date}}
Ort: {{location}}

Bis dahin bitten wir noch um etwas Geduld.

Sportliche Grüße

VfL Kirchheim
Tournament Hub$tpl$,
  'application-under-review'
);

DROP FUNCTION public.upsert_status_email_template(text, text, text, public.email_template_type);
