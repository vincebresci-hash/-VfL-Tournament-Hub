-- =============================================================================
-- Turnierverwaltung: zusätzliche Felder, Archivierung
-- Keine neuen ENUM-Werte. tournament_status bleibt:
--   coming-soon | active | full | completed
-- =============================================================================

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time time,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS birth_year integer,
  ADD COLUMN IF NOT EXISTS waitlist_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS applications_open boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.tournaments.start_time IS 'Geplante Startzeit am Turniertag';
COMMENT ON COLUMN public.tournaments.end_time IS 'Geplantes Ende am Turniertag';
COMMENT ON COLUMN public.tournaments.address IS 'Adresszusatz zum Veranstaltungsort';
COMMENT ON COLUMN public.tournaments.short_description IS 'Kurztext für Karten und Übersichten';
COMMENT ON COLUMN public.tournaments.birth_year IS 'Jahrgang zur Altersklasse';
COMMENT ON COLUMN public.tournaments.waitlist_enabled IS 'Warteliste für dieses Turnier erlaubt';
COMMENT ON COLUMN public.tournaments.applications_open IS 'Bewerbungen für dieses Turnier geöffnet';
COMMENT ON COLUMN public.tournaments.archived_at IS 'Archivierte Turniere bleiben erhalten, sind öffentlich nicht sichtbar';

DROP POLICY IF EXISTS tournaments_select_public ON public.tournaments;
CREATE POLICY tournaments_select_public
  ON public.tournaments
  FOR SELECT
  TO anon, authenticated
  USING (archived_at IS NULL OR public.is_admin());
