-- =============================================================================
-- VfL Kirchheim Tournament Hub — Gruppenphase, Spielplan, Ergebnisse
-- =============================================================================
--
-- AUSFÜHREN:
--   1. Supabase Dashboard öffnen
--   2. SQL Editor
--   3. Diese Datei vollständig einfügen und einmal ausführen
--
-- Bestehende Migrationen NICHT erneut ausführen.
-- Kein neues ENUM — Match-Status und Phase über CHECK Constraints.
-- Diese Datei NICHT selbst gegen Produktion aus dem Agenten ausführen.
--
-- KO-Runde: tournament_matches.phase ist vorbereitet ('group' | 'knockout').
-- Realtime: Tabellen sind RLS-fähig; später kann REPLICA IDENTITY / Publication
-- ergänzt werden, ohne das öffentliche Lesemodell zu ändern.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Spielplan-Einstellungen am Turnier
-- -----------------------------------------------------------------------------

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS match_duration_minutes integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS break_minutes integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS minimum_rest_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS lunch_break_start time,
  ADD COLUMN IF NOT EXISTS lunch_break_end time;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tournaments_match_duration_minutes_check'
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_match_duration_minutes_check
      CHECK (match_duration_minutes BETWEEN 5 AND 90);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tournaments_break_minutes_check'
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_break_minutes_check
      CHECK (break_minutes BETWEEN 0 AND 60);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tournaments_minimum_rest_minutes_check'
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_minimum_rest_minutes_check
      CHECK (minimum_rest_minutes BETWEEN 0 AND 180);
  END IF;
END
$$;

COMMENT ON COLUMN public.tournaments.match_duration_minutes IS 'Netto-Spielzeit in Minuten';
COMMENT ON COLUMN public.tournaments.break_minutes IS 'Pause zwischen zwei Spielen auf demselben Feld';
COMMENT ON COLUMN public.tournaments.minimum_rest_minutes IS 'Angestrebte Mindestruhezeit eines Teams zwischen zwei Spielen';
COMMENT ON COLUMN public.tournaments.lunch_break_start IS 'Optionale Mittagspause (Beginn)';
COMMENT ON COLUMN public.tournaments.lunch_break_end IS 'Optionale Mittagspause (Ende)';

-- -----------------------------------------------------------------------------
-- Tabellen
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tournament_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_groups_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS tournament_groups_tournament_name_idx
  ON public.tournament_groups (tournament_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS tournament_groups_tournament_sort_idx
  ON public.tournament_groups (tournament_id, sort_order);

CREATE TABLE IF NOT EXISTS public.tournament_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.tournament_groups(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Eine Bewerbung gehört in genau einer Gruppe; Bewerbungen sind turniergebunden.
CREATE UNIQUE INDEX IF NOT EXISTS tournament_group_members_application_idx
  ON public.tournament_group_members (application_id);

CREATE INDEX IF NOT EXISTS tournament_group_members_group_idx
  ON public.tournament_group_members (group_id);

CREATE TABLE IF NOT EXISTS public.tournament_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_fields_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 80)
);

CREATE INDEX IF NOT EXISTS tournament_fields_tournament_sort_idx
  ON public.tournament_fields (tournament_id, sort_order);

CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.tournament_groups(id) ON DELETE RESTRICT,
  field_id uuid REFERENCES public.tournament_fields(id) ON DELETE SET NULL,
  home_application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE RESTRICT,
  away_application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE RESTRICT,
  scheduled_at timestamptz,
  duration_minutes integer NOT NULL DEFAULT 12,
  home_score integer,
  away_score integer,
  status text NOT NULL DEFAULT 'scheduled',
  phase text NOT NULL DEFAULT 'group',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_matches_teams_distinct CHECK (home_application_id <> away_application_id),
  CONSTRAINT tournament_matches_status_check CHECK (
    status IN ('scheduled', 'live', 'completed', 'cancelled')
  ),
  CONSTRAINT tournament_matches_phase_check CHECK (phase IN ('group', 'knockout')),
  CONSTRAINT tournament_matches_duration_check CHECK (duration_minutes BETWEEN 5 AND 90),
  CONSTRAINT tournament_matches_home_score_check CHECK (home_score IS NULL OR home_score >= 0),
  CONSTRAINT tournament_matches_away_score_check CHECK (away_score IS NULL OR away_score >= 0)
);

CREATE INDEX IF NOT EXISTS tournament_matches_tournament_sort_idx
  ON public.tournament_matches (tournament_id, sort_order, scheduled_at);

CREATE INDEX IF NOT EXISTS tournament_matches_group_idx
  ON public.tournament_matches (group_id);

CREATE INDEX IF NOT EXISTS tournament_matches_phase_idx
  ON public.tournament_matches (tournament_id, phase);

COMMENT ON COLUMN public.tournament_matches.phase IS
  'Gruppenphase oder spätere KO-Runde. KO-Spiele werden in diesem Schritt nicht erzeugt.';

-- -----------------------------------------------------------------------------
-- Konsistenz
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_group_member_tournament()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  group_tournament uuid;
  application_tournament uuid;
  application_status public.application_status;
BEGIN
  SELECT tournament_id INTO group_tournament
  FROM public.tournament_groups
  WHERE id = NEW.group_id;

  SELECT tournament_id, status
  INTO application_tournament, application_status
  FROM public.applications
  WHERE id = NEW.application_id;

  IF group_tournament IS NULL OR application_tournament IS NULL THEN
    RAISE EXCEPTION 'Gruppe oder Bewerbung wurde nicht gefunden.';
  END IF;

  IF group_tournament <> application_tournament THEN
    RAISE EXCEPTION 'Das Team gehört nicht zu diesem Turnier.';
  END IF;

  IF application_status <> 'accepted'::public.application_status THEN
    RAISE EXCEPTION 'Nur angenommene Teams können einer Gruppe zugeordnet werden.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_group_member_tournament ON public.tournament_group_members;
CREATE TRIGGER enforce_group_member_tournament
  BEFORE INSERT OR UPDATE OF group_id, application_id
  ON public.tournament_group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_group_member_tournament();

CREATE OR REPLACE FUNCTION public.enforce_match_tournament()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  home_tournament uuid;
  away_tournament uuid;
  group_tournament uuid;
BEGIN
  SELECT tournament_id INTO home_tournament
  FROM public.applications
  WHERE id = NEW.home_application_id;

  SELECT tournament_id INTO away_tournament
  FROM public.applications
  WHERE id = NEW.away_application_id;

  IF home_tournament IS NULL OR away_tournament IS NULL THEN
    RAISE EXCEPTION 'Heim- oder Auswärtsteam wurde nicht gefunden.';
  END IF;

  IF home_tournament <> NEW.tournament_id OR away_tournament <> NEW.tournament_id THEN
    RAISE EXCEPTION 'Beide Teams müssen zu diesem Turnier gehören.';
  END IF;

  IF NEW.group_id IS NOT NULL THEN
    SELECT tournament_id INTO group_tournament
    FROM public.tournament_groups
    WHERE id = NEW.group_id;

    IF group_tournament IS NULL OR group_tournament <> NEW.tournament_id THEN
      RAISE EXCEPTION 'Die Gruppe gehört nicht zu diesem Turnier.';
    END IF;
  END IF;

  IF NEW.field_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.tournament_fields
      WHERE id = NEW.field_id
        AND tournament_id = NEW.tournament_id
    ) THEN
      RAISE EXCEPTION 'Das Spielfeld gehört nicht zu diesem Turnier.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_match_tournament ON public.tournament_matches;
CREATE TRIGGER enforce_match_tournament
  BEFORE INSERT OR UPDATE OF
    tournament_id,
    group_id,
    field_id,
    home_application_id,
    away_application_id
  ON public.tournament_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_match_tournament();

CREATE OR REPLACE FUNCTION public.cleanup_group_member_on_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'accepted'::public.application_status THEN
    DELETE FROM public.tournament_group_members
    WHERE application_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_group_member_on_status ON public.applications;
CREATE TRIGGER cleanup_group_member_on_status
  AFTER UPDATE OF status
  ON public.applications
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.cleanup_group_member_on_status();

DROP TRIGGER IF EXISTS set_tournament_groups_updated_at ON public.tournament_groups;
CREATE TRIGGER set_tournament_groups_updated_at
  BEFORE UPDATE ON public.tournament_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_tournament_matches_updated_at ON public.tournament_matches;
CREATE TRIGGER set_tournament_matches_updated_at
  BEFORE UPDATE ON public.tournament_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Öffentliche Teilnehmer ohne personenbezogene Bewerbungsfelder
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tournament_public_roster(p_slug text)
RETURNS TABLE (
  application_id uuid,
  club_name text,
  team_name text,
  age_group text,
  birth_year integer,
  group_id uuid,
  group_name text,
  group_sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    applications.id,
    applications.club_name,
    applications.team_name,
    applications.age_group,
    applications.birth_year,
    tournament_groups.id,
    tournament_groups.name,
    tournament_groups.sort_order
  FROM public.tournaments
  JOIN public.applications
    ON applications.tournament_id = tournaments.id
  LEFT JOIN public.tournament_group_members
    ON tournament_group_members.application_id = applications.id
  LEFT JOIN public.tournament_groups
    ON tournament_groups.id = tournament_group_members.group_id
    AND tournament_groups.tournament_id = tournaments.id
  WHERE tournaments.slug = p_slug
    AND tournaments.archived_at IS NULL
    AND applications.status = 'accepted'::public.application_status;
$$;

REVOKE ALL ON FUNCTION public.tournament_public_roster(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tournament_public_roster(text) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

ALTER TABLE public.tournament_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tournament_groups_select_public ON public.tournament_groups;
CREATE POLICY tournament_groups_select_public
  ON public.tournament_groups
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tournaments
      WHERE tournaments.id = tournament_groups.tournament_id
        AND (tournaments.archived_at IS NULL OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS tournament_groups_write_admin ON public.tournament_groups;
CREATE POLICY tournament_groups_write_admin
  ON public.tournament_groups
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS tournament_group_members_select_public ON public.tournament_group_members;
CREATE POLICY tournament_group_members_select_public
  ON public.tournament_group_members
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tournament_groups
      JOIN public.tournaments
        ON tournaments.id = tournament_groups.tournament_id
      WHERE tournament_groups.id = tournament_group_members.group_id
        AND (tournaments.archived_at IS NULL OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS tournament_group_members_write_admin ON public.tournament_group_members;
CREATE POLICY tournament_group_members_write_admin
  ON public.tournament_group_members
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS tournament_fields_select_public ON public.tournament_fields;
CREATE POLICY tournament_fields_select_public
  ON public.tournament_fields
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tournaments
      WHERE tournaments.id = tournament_fields.tournament_id
        AND (tournaments.archived_at IS NULL OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS tournament_fields_write_admin ON public.tournament_fields;
CREATE POLICY tournament_fields_write_admin
  ON public.tournament_fields
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS tournament_matches_select_public ON public.tournament_matches;
CREATE POLICY tournament_matches_select_public
  ON public.tournament_matches
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tournaments
      WHERE tournaments.id = tournament_matches.tournament_id
        AND (tournaments.archived_at IS NULL OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS tournament_matches_write_admin ON public.tournament_matches;
CREATE POLICY tournament_matches_write_admin
  ON public.tournament_matches
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON TABLE public.tournament_groups TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_groups TO authenticated;

GRANT SELECT ON TABLE public.tournament_group_members TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_group_members TO authenticated;

GRANT SELECT ON TABLE public.tournament_fields TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_fields TO authenticated;

GRANT SELECT ON TABLE public.tournament_matches TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_matches TO authenticated;
