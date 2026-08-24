ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS live_data_source text NOT NULL DEFAULT 'hub',
  ADD COLUMN IF NOT EXISTS mein_turnierplan_tournament_id text,
  ADD COLUMN IF NOT EXISTS mein_turnierplan_matches_widget_url text,
  ADD COLUMN IF NOT EXISTS mein_turnierplan_table_widget_url text,
  ADD COLUMN IF NOT EXISTS public_schedule_note text,
  ADD COLUMN IF NOT EXISTS public_live_note text;

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_live_data_source_check;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_live_data_source_check
  CHECK (live_data_source IN ('hub', 'mein-turnierplan', 'hybrid'));

COMMENT ON COLUMN public.tournaments.live_data_source IS
  'Datenquelle für öffentliche Live-Darstellung: hub, mein-turnierplan oder hybrid.';
COMMENT ON COLUMN public.tournaments.mein_turnierplan_tournament_id IS
  'Externe MeinTurnierplan-Turnier-ID für JSON-Abfrage und Widgets.';
COMMENT ON COLUMN public.tournaments.mein_turnierplan_matches_widget_url IS
  'Validierte offizielle MeinTurnierplan-Widget-URL für Begegnungen (displayMatches.php).';
COMMENT ON COLUMN public.tournaments.mein_turnierplan_table_widget_url IS
  'Validierte offizielle MeinTurnierplan-Widget-URL für Tabellen (displayTable.php).';
COMMENT ON COLUMN public.tournaments.public_schedule_note IS
  'Optionaler manueller Hinweistext für den öffentlichen Spielplan.';
COMMENT ON COLUMN public.tournaments.public_live_note IS
  'Optionaler manueller Hinweistext für den Live-Bereich.';
