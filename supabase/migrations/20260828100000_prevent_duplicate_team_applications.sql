-- Prevent duplicate club-team applications for the same tournament.
-- Guest applications keep team_id NULL and remain unaffected.

CREATE UNIQUE INDEX IF NOT EXISTS applications_tournament_team_unique_idx
  ON public.applications (tournament_id, team_id)
  WHERE team_id IS NOT NULL;
