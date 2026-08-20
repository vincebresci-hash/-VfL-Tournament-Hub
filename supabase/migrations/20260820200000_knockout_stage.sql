-- =============================================================================
-- VfL Kirchheim Tournament Hub — KO-Runde
-- =============================================================================
--
-- AUSFÜHREN:
--   1. Supabase Dashboard öffnen
--   2. SQL Editor
--   3. Diese Datei vollständig einfügen und einmal ausführen
--
-- Bestehende Migrationen NICHT erneut ausführen.
-- Kein neues ENUM. Runden, Slots und decided_by über CHECK Constraints.
-- Diese Datei NICHT selbst gegen Produktion aus dem Agenten ausführen.
-- =============================================================================

ALTER TABLE public.tournament_matches
  ALTER COLUMN home_application_id DROP NOT NULL,
  ALTER COLUMN away_application_id DROP NOT NULL;

ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS round text,
  ADD COLUMN IF NOT EXISTS next_match_id uuid,
  ADD COLUMN IF NOT EXISTS next_match_slot text,
  ADD COLUMN IF NOT EXISTS loser_next_match_id uuid,
  ADD COLUMN IF NOT EXISTS loser_next_match_slot text,
  ADD COLUMN IF NOT EXISTS decided_by text NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS home_penalties integer,
  ADD COLUMN IF NOT EXISTS away_penalties integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_matches_group_teams_required'
  ) THEN
    ALTER TABLE public.tournament_matches
      ADD CONSTRAINT tournament_matches_group_teams_required
      CHECK (
        phase <> 'group'
        OR (
          home_application_id IS NOT NULL
          AND away_application_id IS NOT NULL
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_matches_round_check'
  ) THEN
    ALTER TABLE public.tournament_matches
      ADD CONSTRAINT tournament_matches_round_check
      CHECK (
        round IS NULL
        OR round IN (
          'quarterfinal',
          'semifinal',
          'third-place',
          'final',
          'placement-5',
          'placement-7'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_matches_next_slot_check'
  ) THEN
    ALTER TABLE public.tournament_matches
      ADD CONSTRAINT tournament_matches_next_slot_check
      CHECK (next_match_slot IS NULL OR next_match_slot IN ('home', 'away'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_matches_loser_slot_check'
  ) THEN
    ALTER TABLE public.tournament_matches
      ADD CONSTRAINT tournament_matches_loser_slot_check
      CHECK (
        loser_next_match_slot IS NULL
        OR loser_next_match_slot IN ('home', 'away')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_matches_decided_by_check'
  ) THEN
    ALTER TABLE public.tournament_matches
      ADD CONSTRAINT tournament_matches_decided_by_check
      CHECK (decided_by IN ('regular', 'penalties'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_matches_home_penalties_check'
  ) THEN
    ALTER TABLE public.tournament_matches
      ADD CONSTRAINT tournament_matches_home_penalties_check
      CHECK (home_penalties IS NULL OR home_penalties >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_matches_away_penalties_check'
  ) THEN
    ALTER TABLE public.tournament_matches
      ADD CONSTRAINT tournament_matches_away_penalties_check
      CHECK (away_penalties IS NULL OR away_penalties >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_matches_knockout_round_required'
  ) THEN
    ALTER TABLE public.tournament_matches
      ADD CONSTRAINT tournament_matches_knockout_round_required
      CHECK (phase <> 'knockout' OR round IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_matches_next_pair_check'
  ) THEN
    ALTER TABLE public.tournament_matches
      ADD CONSTRAINT tournament_matches_next_pair_check
      CHECK ((next_match_id IS NULL) = (next_match_slot IS NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_matches_loser_pair_check'
  ) THEN
    ALTER TABLE public.tournament_matches
      ADD CONSTRAINT tournament_matches_loser_pair_check
      CHECK ((loser_next_match_id IS NULL) = (loser_next_match_slot IS NULL));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_matches_next_match_id_fkey'
  ) THEN
    ALTER TABLE public.tournament_matches
      ADD CONSTRAINT tournament_matches_next_match_id_fkey
      FOREIGN KEY (next_match_id)
      REFERENCES public.tournament_matches(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_matches_loser_next_match_id_fkey'
  ) THEN
    ALTER TABLE public.tournament_matches
      ADD CONSTRAINT tournament_matches_loser_next_match_id_fkey
      FOREIGN KEY (loser_next_match_id)
      REFERENCES public.tournament_matches(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS tournament_matches_round_idx
  ON public.tournament_matches (tournament_id, phase, round);

COMMENT ON COLUMN public.tournament_matches.round IS
  'KO-Runde. Gruppenphase bleibt NULL.';
COMMENT ON COLUMN public.tournament_matches.next_match_id IS
  'Gewinner rückt in dieses Folge-Spiel vor.';
COMMENT ON COLUMN public.tournament_matches.loser_next_match_id IS
  'Verlierer rückt in dieses Platzierungsspiel vor.';
COMMENT ON COLUMN public.tournament_matches.decided_by IS
  'regular = Tore entscheiden, penalties = Elfmeterschießen bei Gleichstand.';

CREATE OR REPLACE FUNCTION public.enforce_knockout_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_tournament uuid;
  loser_tournament uuid;
BEGIN
  IF NEW.next_match_id IS NOT NULL THEN
    IF NEW.next_match_id = NEW.id THEN
      RAISE EXCEPTION 'Ein Spiel kann nicht auf sich selbst verweisen.';
    END IF;

    SELECT tournament_id INTO next_tournament
    FROM public.tournament_matches
    WHERE id = NEW.next_match_id;

    IF next_tournament IS NULL OR next_tournament <> NEW.tournament_id THEN
      RAISE EXCEPTION 'Das Folge-Spiel muss zum selben Turnier gehören.';
    END IF;

    IF NEW.next_match_slot IS NULL THEN
      RAISE EXCEPTION 'Für das Folge-Spiel muss ein Slot (Heim/Auswärts) gesetzt sein.';
    END IF;
  END IF;

  IF NEW.loser_next_match_id IS NOT NULL THEN
    IF NEW.loser_next_match_id = NEW.id THEN
      RAISE EXCEPTION 'Ein Spiel kann nicht auf sich selbst verweisen.';
    END IF;

    SELECT tournament_id INTO loser_tournament
    FROM public.tournament_matches
    WHERE id = NEW.loser_next_match_id;

    IF loser_tournament IS NULL OR loser_tournament <> NEW.tournament_id THEN
      RAISE EXCEPTION 'Das Platzierungsspiel muss zum selben Turnier gehören.';
    END IF;

    IF NEW.loser_next_match_slot IS NULL THEN
      RAISE EXCEPTION 'Für das Platzierungsspiel muss ein Slot (Heim/Auswärts) gesetzt sein.';
    END IF;
  END IF;

  IF NEW.next_match_id IS NOT NULL
     AND NEW.loser_next_match_id = NEW.next_match_id
     AND NEW.next_match_slot IS NOT NULL
     AND NEW.next_match_slot = NEW.loser_next_match_slot THEN
    RAISE EXCEPTION 'Gewinner und Verlierer können nicht in denselben Folge-Slot.';
  END IF;

  IF NEW.next_match_id IS NOT NULL AND NEW.next_match_slot IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.tournament_matches
      WHERE id IS DISTINCT FROM NEW.id
        AND (
          (next_match_id = NEW.next_match_id AND next_match_slot = NEW.next_match_slot)
          OR (
            loser_next_match_id = NEW.next_match_id
            AND loser_next_match_slot = NEW.next_match_slot
          )
        )
    ) THEN
      RAISE EXCEPTION 'Dieser Gewinner-Slot im Folge-Spiel ist bereits belegt.';
    END IF;
  END IF;

  IF NEW.loser_next_match_id IS NOT NULL AND NEW.loser_next_match_slot IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.tournament_matches
      WHERE id IS DISTINCT FROM NEW.id
        AND (
          (
            next_match_id = NEW.loser_next_match_id
            AND next_match_slot = NEW.loser_next_match_slot
          )
          OR (
            loser_next_match_id = NEW.loser_next_match_id
            AND loser_next_match_slot = NEW.loser_next_match_slot
          )
        )
    ) THEN
      RAISE EXCEPTION 'Dieser Verlierer-Slot im Folge-Spiel ist bereits belegt.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_knockout_links ON public.tournament_matches;
CREATE TRIGGER enforce_knockout_links
  BEFORE INSERT OR UPDATE OF
    next_match_id,
    next_match_slot,
    loser_next_match_id,
    loser_next_match_slot,
    tournament_id
  ON public.tournament_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_knockout_links();

CREATE OR REPLACE FUNCTION public.enforce_knockout_round_unique_team()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.phase = 'knockout' AND NEW.round IS NOT NULL THEN
    IF NEW.home_application_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.tournament_matches
      WHERE tournament_id = NEW.tournament_id
        AND phase = 'knockout'
        AND round = NEW.round
        AND id IS DISTINCT FROM NEW.id
        AND (
          home_application_id = NEW.home_application_id
          OR away_application_id = NEW.home_application_id
        )
    ) THEN
      RAISE EXCEPTION 'Ein Team darf in derselben KO-Runde nur einmal spielen.';
    END IF;

    IF NEW.away_application_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.tournament_matches
      WHERE tournament_id = NEW.tournament_id
        AND phase = 'knockout'
        AND round = NEW.round
        AND id IS DISTINCT FROM NEW.id
        AND (
          home_application_id = NEW.away_application_id
          OR away_application_id = NEW.away_application_id
        )
    ) THEN
      RAISE EXCEPTION 'Ein Team darf in derselben KO-Runde nur einmal spielen.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_knockout_round_unique_team ON public.tournament_matches;
CREATE TRIGGER enforce_knockout_round_unique_team
  BEFORE INSERT OR UPDATE OF
    home_application_id,
    away_application_id,
    phase,
    round,
    tournament_id
  ON public.tournament_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_knockout_round_unique_team();

CREATE OR REPLACE FUNCTION public.enforce_match_tournament()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  home_tournament uuid;
  away_tournament uuid;
  group_tournament uuid;
BEGIN
  IF NEW.home_application_id IS NOT NULL THEN
    SELECT tournament_id INTO home_tournament
    FROM public.applications
    WHERE id = NEW.home_application_id;

    IF home_tournament IS NULL THEN
      RAISE EXCEPTION 'Heimteam wurde nicht gefunden.';
    END IF;

    IF home_tournament <> NEW.tournament_id THEN
      RAISE EXCEPTION 'Beide Teams müssen zu diesem Turnier gehören.';
    END IF;
  ELSIF NEW.phase = 'group' THEN
    RAISE EXCEPTION 'Gruppenspiele brauchen ein Heimteam.';
  END IF;

  IF NEW.away_application_id IS NOT NULL THEN
    SELECT tournament_id INTO away_tournament
    FROM public.applications
    WHERE id = NEW.away_application_id;

    IF away_tournament IS NULL THEN
      RAISE EXCEPTION 'Auswärtsteam wurde nicht gefunden.';
    END IF;

    IF away_tournament <> NEW.tournament_id THEN
      RAISE EXCEPTION 'Beide Teams müssen zu diesem Turnier gehören.';
    END IF;
  ELSIF NEW.phase = 'group' THEN
    RAISE EXCEPTION 'Gruppenspiele brauchen ein Auswärtsteam.';
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
