-- Manual tournament teams via tournament_external_teams (no fake applications).
-- Additive only.

ALTER TABLE public.tournament_external_teams
  ADD COLUMN IF NOT EXISTS club_name text,
  ADD COLUMN IF NOT EXISTS team_name text,
  ADD COLUMN IF NOT EXISTS age_group text,
  ADD COLUMN IF NOT EXISTS birth_year integer;

ALTER TABLE public.tournament_external_teams
  DROP CONSTRAINT IF EXISTS tournament_external_teams_source_check;

ALTER TABLE public.tournament_external_teams
  ADD CONSTRAINT tournament_external_teams_source_check
  CHECK (external_source IN ('mein-turnierplan', 'manual'));

COMMENT ON COLUMN public.tournament_external_teams.club_name IS
  'Vereinsname für manuelle Teams; bei MeinTurnierplan optional.';
COMMENT ON COLUMN public.tournament_external_teams.team_name IS
  'Teamname für manuelle Teams; bei MeinTurnierplan entspricht name oft dem Teamnamen.';
