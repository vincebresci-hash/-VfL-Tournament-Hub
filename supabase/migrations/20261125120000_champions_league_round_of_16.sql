-- =============================================================================
-- Champions League Top 16 — allow the "round-of-16" knockout round.
-- =============================================================================
--
-- FILE ONLY. Do not execute this migration from the agent, locally, or against
-- production as part of this stage.
--
-- The base knockout migration (20260820200000_knockout_stage.sql) is already
-- applied in production and constrains tournament_matches.round to the rounds
-- known at that time. Top 16 adds an Achtelfinale, so this migration widens the
-- existing CHECK to include 'round-of-16'. It only replaces that one CHECK and
-- does not touch any rows, trigger, or other constraint. Existing matches keep
-- their round values, which remain inside the new set.
-- =============================================================================

ALTER TABLE public.tournament_matches
  DROP CONSTRAINT IF EXISTS tournament_matches_round_check;

ALTER TABLE public.tournament_matches
  ADD CONSTRAINT tournament_matches_round_check
  CHECK (
    round IS NULL
    OR round IN (
      'round-of-16',
      'quarterfinal',
      'semifinal',
      'third-place',
      'final',
      'placement-5',
      'placement-7'
    )
  );
