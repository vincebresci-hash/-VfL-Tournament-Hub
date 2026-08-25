-- External MeinTurnierplan team participation status (no fake applications).
-- Additive only; existing migrations are left untouched.

ALTER TABLE public.tournament_external_teams
  ADD COLUMN IF NOT EXISTS participation_status text NOT NULL DEFAULT 'detected';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tournament_external_teams_participation_status_check'
  ) THEN
    ALTER TABLE public.tournament_external_teams
      ADD CONSTRAINT tournament_external_teams_participation_status_check
      CHECK (participation_status IN ('detected', 'confirmed', 'rejected'));
  END IF;
END
$$;

COMMENT ON COLUMN public.tournament_external_teams.participation_status IS
  'Admin confirmation for external MeinTurnierplan teams: detected (default from sync), confirmed, or rejected. Sync must not overwrite this.';

CREATE INDEX IF NOT EXISTS tournament_external_teams_participation_idx
  ON public.tournament_external_teams (tournament_id, participation_status)
  WHERE external_active = true;

-- Occupancy includes confirmed active external teams without double-counting
-- mapped accepted applications.
CREATE OR REPLACE FUNCTION public.tournament_occupancy()
RETURNS TABLE (
  slug text,
  max_teams integer,
  confirmed_teams integer,
  waiting_list_count integer,
  under_review_count integer,
  new_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tournaments.slug,
    tournaments.max_teams,
    (
      (
        SELECT COUNT(*)::integer
        FROM public.applications
        WHERE applications.tournament_id = tournaments.id
          AND applications.status = 'accepted'::public.application_status
      )
      +
      (
        SELECT COUNT(*)::integer
        FROM public.tournament_external_teams et
        WHERE et.tournament_id = tournaments.id
          AND et.participation_status = 'confirmed'
          AND et.external_active = true
          AND (
            et.application_id IS NULL
            OR NOT EXISTS (
              SELECT 1
              FROM public.applications mapped
              WHERE mapped.id = et.application_id
                AND mapped.status = 'accepted'::public.application_status
            )
          )
      )
    ) AS confirmed_teams,
    (
      SELECT COUNT(*)::integer
      FROM public.applications
      WHERE applications.tournament_id = tournaments.id
        AND applications.status = 'waiting-list'::public.application_status
    ) AS waiting_list_count,
    (
      SELECT COUNT(*)::integer
      FROM public.applications
      WHERE applications.tournament_id = tournaments.id
        AND applications.status = 'under-review'::public.application_status
    ) AS under_review_count,
    (
      SELECT COUNT(*)::integer
      FROM public.applications
      WHERE applications.tournament_id = tournaments.id
        AND applications.status = 'new'::public.application_status
    ) AS new_count
  FROM public.tournaments;
$$;

REVOKE ALL ON FUNCTION public.tournament_occupancy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tournament_occupancy() TO anon, authenticated;
