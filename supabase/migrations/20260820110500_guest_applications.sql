-- =============================================================================
-- VfL Kirchheim Tournament Hub — Gastbewerbungen ohne Login
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
-- Gäste dürfen Bewerbungen anlegen, aber keine Bewerbungen lesen,
-- Status ändern oder interne Daten sehen.
-- =============================================================================

ALTER TABLE public.applications
  ALTER COLUMN club_id DROP NOT NULL;

ALTER TABLE public.applications
  ALTER COLUMN team_id DROP NOT NULL;

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS club_name text,
  ADD COLUMN IF NOT EXISTS club_city text,
  ADD COLUMN IF NOT EXISTS team_name text,
  ADD COLUMN IF NOT EXISTS age_group text,
  ADD COLUMN IF NOT EXISTS birth_year integer,
  ADD COLUMN IF NOT EXISTS league text,
  ADD COLUMN IF NOT EXISTS division text;

DROP POLICY IF EXISTS applications_insert_guest ON public.applications;
CREATE POLICY applications_insert_guest
  ON public.applications
  FOR INSERT
  TO anon
  WITH CHECK (
    submitted_by IS NULL
    AND club_id IS NULL
    AND team_id IS NULL
    AND status = 'new'::public.application_status
    AND contact_email IS NOT NULL
    AND length(trim(contact_email)) > 0
    AND club_name IS NOT NULL
    AND length(trim(club_name)) > 0
    AND team_name IS NOT NULL
    AND length(trim(team_name)) > 0
  );

GRANT INSERT ON TABLE public.applications TO anon;
