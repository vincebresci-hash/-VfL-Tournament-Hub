-- C6-H D2: Persisted matchday lifecycle (separate from marketing tournaments.status).
-- Additive / backward-compatible. Do not overload tournament_status ENUM.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'setup';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tournaments_lifecycle_state_check'
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_lifecycle_state_check
      CHECK (
        lifecycle_state IN (
          'setup',
          'group_stage',
          'knockout_stage',
          'completed'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.tournaments.lifecycle_state IS
  'Matchday lifecycle (setup/group_stage/knockout_stage/completed). Separate from marketing tournaments.status.';

-- Existing rows receive DEFAULT 'setup' on ADD COLUMN; apply precedence-safe backfill.
-- 1) marketing completed wins
UPDATE public.tournaments
SET lifecycle_state = 'completed'
WHERE status = 'completed';

-- 2) else ANY knockout row (status ignored) → knockout_stage
UPDATE public.tournaments AS t
SET lifecycle_state = 'knockout_stage'
WHERE t.status IS DISTINCT FROM 'completed'
  AND EXISTS (
    SELECT 1
    FROM public.tournament_matches AS m
    WHERE m.tournament_id = t.id
      AND m.phase = 'knockout'
  );

-- 3) else ANY group → group_stage (leave completed/knockout untouched)
UPDATE public.tournaments AS t
SET lifecycle_state = 'group_stage'
WHERE t.lifecycle_state = 'setup'
  AND EXISTS (
    SELECT 1
    FROM public.tournament_groups AS g
    WHERE g.tournament_id = t.id
  );

-- 4) else remains setup
