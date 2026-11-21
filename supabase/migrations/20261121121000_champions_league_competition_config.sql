-- =============================================================================
-- Champions League Stage 3B.1 — additive tournament configuration columns.
-- =============================================================================
--
-- FILE ONLY. Do not execute this migration from the agent, locally, or against
-- production as part of Stage 3B.1.
--
-- Nullable columns. No non-null default, no backfill, and no update of existing
-- rows. The public display-text column is unchanged and is not a scheduler mode.
-- No new enum. Groups and matches are not modified.
-- =============================================================================

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS competition_format text,
  ADD COLUMN IF NOT EXISTS league_matches_per_team integer,
  ADD COLUMN IF NOT EXISTS knockout_cutoff integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tournaments_competition_format_check'
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_competition_format_check
      CHECK (
        competition_format IS NULL
        OR competition_format IN ('round-robin', 'groups-knockout', 'champions-league')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tournaments_league_matches_per_team_check'
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_league_matches_per_team_check
      CHECK (
        league_matches_per_team IS NULL
        OR (league_matches_per_team >= 1 AND league_matches_per_team <= 64)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tournaments_knockout_cutoff_check'
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_knockout_cutoff_check
      CHECK (knockout_cutoff IS NULL OR knockout_cutoff IN (4, 8));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tournaments_competition_format_params_check'
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_competition_format_params_check
      CHECK (
        (
          competition_format IS DISTINCT FROM 'champions-league'
          AND league_matches_per_team IS NULL
          AND knockout_cutoff IS NULL
        )
        OR (
          competition_format = 'champions-league'
          AND league_matches_per_team IS NOT NULL
          AND knockout_cutoff IS NOT NULL
        )
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.tournaments.competition_format IS
  'Spielplanmodus. NULL behält die bisherige Ableitung aus der vorhandenen Gruppenzahl. Wird nicht aus dem öffentlichen Spielmodus-Text gelesen.';

COMMENT ON COLUMN public.tournaments.league_matches_per_team IS
  'Nur Champions League: Spiele pro Team. Die Zulässigkeit gegen die bestätigten Teilnehmer prüft die Serveraktion.';

COMMENT ON COLUMN public.tournaments.knockout_cutoff IS
  'Nur Champions League: 4 oder 8. Das spätere K.-o.-Gerüst zählt das Spiel um Platz 3 mit und nicht die optionalen Spiele um Platz 5 und 7.';
