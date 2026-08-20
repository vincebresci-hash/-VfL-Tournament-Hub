-- =============================================================================
-- VfL Kirchheim Tournament Hub — Gastbewerbungen
-- =============================================================================
--
-- AUSFÜHREN:
--   1. Supabase Dashboard öffnen
--   2. SQL Editor
--   3. Diese Datei vollständig einfügen und einmal ausführen
--
-- Bestehende Migrationen NICHT verändern und NICHT erneut ausführen.
-- Diese Datei ist weitgehend idempotent.
--
-- Ziel:
--   Vereine können sich OHNE Login (als Gast) für ein Turnier bewerben.
--   Ein Vereinskonto bleibt optional und dient nur als Komfortfunktion.
--
-- Enthält:
--   - applications.club_id / team_id / submitted_by werden NULLABLE
--   - zusätzliche Snapshot-Felder in applications (vollständige Gastbewerbung)
--   - RLS Policy: anonyme Nutzer dürfen ausschließlich INSERT (kein SELECT/UPDATE)
--   - Constraint: Gastbewerbung muss eine Kontakt-E-Mail enthalten
--
-- Gastnutzer dürfen NICHT:
--   - alle / fremde Bewerbungen lesen
--   - Bewerbungsstatus ändern
--   - interne Bewertungen (application_reviews) sehen
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fremdschlüssel für Gastbewerbungen NULLABLE machen
-- -----------------------------------------------------------------------------

ALTER TABLE public.applications
  ALTER COLUMN club_id DROP NOT NULL;

ALTER TABLE public.applications
  ALTER COLUMN team_id DROP NOT NULL;

-- submitted_by ist bereits NULLABLE, zur Sicherheit trotzdem idempotent:
ALTER TABLE public.applications
  ALTER COLUMN submitted_by DROP NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Snapshot-Felder ergänzen, damit eine Gastbewerbung vollständig
--    erhalten bleibt (auch ohne Club-/Team-Datensatz).
-- -----------------------------------------------------------------------------

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS club_name text,
  ADD COLUMN IF NOT EXISTS club_city text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS team_name text,
  ADD COLUMN IF NOT EXISTS age_group text,
  ADD COLUMN IF NOT EXISTS birth_year integer,
  ADD COLUMN IF NOT EXISTS league text,
  ADD COLUMN IF NOT EXISTS division text,
  ADD COLUMN IF NOT EXISTS alternative_phone text,
  ADD COLUMN IF NOT EXISTS club_type text;

-- -----------------------------------------------------------------------------
-- 3. Constraints
--    Eine Gastbewerbung (ohne club_id) muss eine Kontakt-E-Mail enthalten,
--    damit Bestätigungs- und Statusmails zugestellt werden können.
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  ALTER TABLE public.applications
    ADD CONSTRAINT applications_guest_requires_contact_email
    CHECK (
      club_id IS NOT NULL
      OR (contact_email IS NOT NULL AND length(trim(contact_email)) > 0)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.applications
    ADD CONSTRAINT applications_birth_year_range
    CHECK (birth_year IS NULL OR (birth_year >= 1990 AND birth_year <= 2100));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE INDEX IF NOT EXISTS applications_contact_email_idx
  ON public.applications (lower(contact_email));

-- -----------------------------------------------------------------------------
-- 4. Row Level Security — anonyme Gastbewerbung
--
--    WICHTIG:
--      - anon darf AUSSCHLIESSLICH INSERT durchführen
--      - anon bekommt KEINE SELECT / UPDATE / DELETE Policy
--      - eine Gastbewerbung darf keine fremde Identität vortäuschen:
--        club_id / team_id / submitted_by müssen NULL sein, status = 'new'
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS applications_insert_guest ON public.applications;
CREATE POLICY applications_insert_guest
  ON public.applications
  FOR INSERT
  TO anon
  WITH CHECK (
    club_id IS NULL
    AND team_id IS NULL
    AND submitted_by IS NULL
    AND status = 'new'::public.application_status
  );

-- Ausschließlich INSERT für anon. Keine weiteren Rechte.
GRANT INSERT ON TABLE public.applications TO anon;

-- Sicherstellen, dass anon keine anderen Rechte auf applications behält.
REVOKE SELECT, UPDATE, DELETE ON TABLE public.applications FROM anon;

-- application_reviews bleibt ausschließlich admin / super-admin (kein anon-Recht).
REVOKE ALL ON TABLE public.application_reviews FROM anon;
