-- B-Jugend is a maintained age group. The B-Jugend Hallenturnier was stored
-- as Firmenturnier before that class existed.
-- Production: NOT auto-applied. Run manually in the Supabase SQL editor.
-- The app also treats this slug's legacy Firmenturnier value as B-Jugend
-- until this update is applied. Image URLs are left unchanged.

UPDATE public.tournaments
SET age_group = 'B-Jugend'
WHERE slug = 'b-jugend-hallenturnier'
  AND age_group = 'Firmenturnier';

UPDATE public.applications AS a
SET age_group = 'B-Jugend'
FROM public.tournaments AS t
WHERE a.tournament_id = t.id
  AND t.slug = 'b-jugend-hallenturnier'
  AND a.age_group = 'Firmenturnier';

UPDATE public.tournament_external_teams AS tet
SET age_group = 'B-Jugend'
FROM public.tournaments AS t
WHERE tet.tournament_id = t.id
  AND t.slug = 'b-jugend-hallenturnier'
  AND tet.age_group = 'Firmenturnier';

-- Club teams used only for this tournament.
UPDATE public.teams AS tm
SET age_group = 'B-Jugend'
WHERE tm.age_group = 'Firmenturnier'
  AND EXISTS (
    SELECT 1
    FROM public.applications AS a
    JOIN public.tournaments AS t ON t.id = a.tournament_id
    WHERE a.team_id = tm.id
      AND t.slug = 'b-jugend-hallenturnier'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.applications AS a
    JOIN public.tournaments AS t ON t.id = a.tournament_id
    WHERE a.team_id = tm.id
      AND t.slug IS DISTINCT FROM 'b-jugend-hallenturnier'
  );

DO $$
BEGIN
  IF to_regclass('public.team_directory_entries') IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.team_directory_entries AS e
  SET
    age_group = 'B-Jugend',
    norm_age_group = 'b-jugend'
  WHERE e.age_group = 'Firmenturnier'
    AND EXISTS (
      SELECT 1
      FROM public.applications AS a
      JOIN public.tournaments AS t ON t.id = a.tournament_id
      WHERE t.slug = 'b-jugend-hallenturnier'
        AND e.source_application_id = a.id
    );
END $$;
