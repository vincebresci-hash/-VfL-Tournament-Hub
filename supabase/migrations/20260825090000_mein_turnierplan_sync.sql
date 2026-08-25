-- MeinTurnierplan sync metadata + external teams (no fake applications).
-- Existing migrations are left untouched.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS mein_turnierplan_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS mein_turnierplan_sync_meta jsonb;

COMMENT ON COLUMN public.tournaments.mein_turnierplan_last_synced_at IS
  'Zeitpunkt der letzten bestätigten MeinTurnierplan-Synchronisation.';
COMMENT ON COLUMN public.tournaments.mein_turnierplan_sync_meta IS
  'Zusammenfassung der letzten Synchronisation (Teilnehmer, Gruppen, Spiele, Ergebnisse).';

CREATE TABLE IF NOT EXISTS public.tournament_external_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  external_source text NOT NULL DEFAULT 'mein-turnierplan',
  external_id text NOT NULL,
  name text NOT NULL,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  manual_override boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_external_teams_source_check
    CHECK (external_source = 'mein-turnierplan'),
  CONSTRAINT tournament_external_teams_external_id_unique
    UNIQUE (tournament_id, external_source, external_id)
);

CREATE INDEX IF NOT EXISTS tournament_external_teams_tournament_idx
  ON public.tournament_external_teams (tournament_id);

CREATE INDEX IF NOT EXISTS tournament_external_teams_application_idx
  ON public.tournament_external_teams (application_id)
  WHERE application_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_tournament_external_teams_updated_at ON public.tournament_external_teams;
CREATE TRIGGER set_tournament_external_teams_updated_at
  BEFORE UPDATE ON public.tournament_external_teams
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tournament_groups
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS tournament_groups_external_id_unique
  ON public.tournament_groups (tournament_id, external_source, external_id)
  WHERE external_id IS NOT NULL AND external_source IS NOT NULL;

ALTER TABLE public.tournament_fields
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS tournament_fields_external_id_unique
  ON public.tournament_fields (tournament_id, external_source, external_id)
  WHERE external_id IS NOT NULL AND external_source IS NOT NULL;

ALTER TABLE public.tournament_group_members
  ADD COLUMN IF NOT EXISTS external_team_id uuid REFERENCES public.tournament_external_teams(id) ON DELETE CASCADE;

ALTER TABLE public.tournament_group_members
  ALTER COLUMN application_id DROP NOT NULL;

ALTER TABLE public.tournament_group_members
  DROP CONSTRAINT IF EXISTS tournament_group_members_participant_check;

ALTER TABLE public.tournament_group_members
  ADD CONSTRAINT tournament_group_members_participant_check
  CHECK (
    (application_id IS NOT NULL AND external_team_id IS NULL)
    OR (application_id IS NULL AND external_team_id IS NOT NULL)
  );

DROP INDEX IF EXISTS tournament_group_members_application_idx;
CREATE UNIQUE INDEX IF NOT EXISTS tournament_group_members_application_unique
  ON public.tournament_group_members (application_id)
  WHERE application_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tournament_group_members_external_team_unique
  ON public.tournament_group_members (external_team_id)
  WHERE external_team_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_group_member_tournament()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.application_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.applications
      JOIN public.tournament_groups
        ON tournament_groups.id = NEW.group_id
      WHERE applications.id = NEW.application_id
        AND applications.tournament_id = tournament_groups.tournament_id
        AND applications.status = 'accepted'::public.application_status
    ) THEN
      RAISE EXCEPTION 'Group members must be accepted applications of the same tournament';
    END IF;
  END IF;

  IF NEW.external_team_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.tournament_external_teams
      JOIN public.tournament_groups
        ON tournament_groups.id = NEW.group_id
      WHERE tournament_external_teams.id = NEW.external_team_id
        AND tournament_external_teams.tournament_id = tournament_groups.tournament_id
    ) THEN
      RAISE EXCEPTION 'External group members must belong to the same tournament';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS home_external_team_id uuid REFERENCES public.tournament_external_teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS away_external_team_id uuid REFERENCES public.tournament_external_teams(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tournament_matches_external_id_unique
  ON public.tournament_matches (tournament_id, external_source, external_id)
  WHERE external_id IS NOT NULL AND external_source IS NOT NULL;

ALTER TABLE public.tournament_matches
  DROP CONSTRAINT IF EXISTS tournament_matches_group_teams_required;

ALTER TABLE public.tournament_matches
  ADD CONSTRAINT tournament_matches_group_teams_required
  CHECK (
    phase <> 'group'
    OR (
      (
        (home_application_id IS NOT NULL AND home_external_team_id IS NULL)
        OR (home_application_id IS NULL AND home_external_team_id IS NOT NULL)
      )
      AND (
        (away_application_id IS NOT NULL AND away_external_team_id IS NULL)
        OR (away_application_id IS NULL AND away_external_team_id IS NOT NULL)
      )
    )
  );

ALTER TABLE public.tournament_external_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tournament_external_teams_select_public ON public.tournament_external_teams;
CREATE POLICY tournament_external_teams_select_public
  ON public.tournament_external_teams
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tournaments
      WHERE tournaments.id = tournament_external_teams.tournament_id
        AND (tournaments.archived_at IS NULL OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS tournament_external_teams_write_admin ON public.tournament_external_teams;
CREATE POLICY tournament_external_teams_write_admin
  ON public.tournament_external_teams
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON TABLE public.tournament_external_teams TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_external_teams TO authenticated;
