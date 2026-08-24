-- =============================================================================
-- Öffentliche Turnierinformationen (optional)
-- Nur anzeigen, wenn der Veranstalter Werte hinterlegt.
-- Bestehende Migrationen nicht ändern. Diese Datei NICHT selbst gegen
-- Produktion aus dem Agenten ausführen.
-- =============================================================================

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS play_format text,
  ADD COLUMN IF NOT EXISTS playing_time text,
  ADD COLUMN IF NOT EXISTS pitch_format text,
  ADD COLUMN IF NOT EXISTS entry_fee text,
  ADD COLUMN IF NOT EXISTS travel_info text,
  ADD COLUMN IF NOT EXISTS changing_rooms text,
  ADD COLUMN IF NOT EXISTS catering text,
  ADD COLUMN IF NOT EXISTS team_info text;

COMMENT ON COLUMN public.tournaments.play_format IS 'Öffentlicher Spielmodus, z. B. Gruppenphase und KO';
COMMENT ON COLUMN public.tournaments.playing_time IS 'Öffentliche Spielzeit, z. B. 2 x 12 Minuten';
COMMENT ON COLUMN public.tournaments.pitch_format IS 'Feld- oder Spielform';
COMMENT ON COLUMN public.tournaments.entry_fee IS 'Startgebühr als Freitext, nur wenn bekannt';
COMMENT ON COLUMN public.tournaments.travel_info IS 'Anreise und Parken';
COMMENT ON COLUMN public.tournaments.changing_rooms IS 'Hinweise zu Umkleiden';
COMMENT ON COLUMN public.tournaments.catering IS 'Hinweise zur Verpflegung';
COMMENT ON COLUMN public.tournaments.team_info IS 'Organisatorische Hinweise für Mannschaften';
