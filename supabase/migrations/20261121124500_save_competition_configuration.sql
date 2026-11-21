-- =============================================================================
-- Champions League Stage 3B.3C.2 — inactive atomic configuration save.
-- =============================================================================
--
-- FILE ONLY. Do not execute this migration from the agent, locally, or against
-- production as part of Stage 3B.3C.2.
--
-- Application order:
--   1. supabase/migrations/20261121121000_champions_league_competition_config.sql
--   2. this file
-- This file checks that the three competition columns already exist and stops
-- with an explicit error when they do not. It does not add those columns and
-- does not assume they are present in production.
--
-- Locking:
--   PostgreSQL runs a BEFORE ROW trigger before table_tuple_update / heap_delete
--   locks the target tuple. These triggers lock the parent tournament row first,
--   in uuid order when a row can move between tournaments. The save function
--   locks that same row and then only reads children. It never locks a child
--   row. sync_mein_turnierplan_tournament updates children before it updates
--   tournaments; the first child BEFORE trigger acquires the tournament lock
--   before the child tuple lock, so the rest of that function already holds
--   the parent lock. Save, sync, schedule replacement, and manual child writes
--   therefore all take the parent lock before a child row lock.
--   SELECT FOR UPDATE does not fire UPDATE triggers, so the lock cannot recurse.
--
-- The function rejects champions-league. It updates only the three competition
-- columns and does not delete or insert matches or groups.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tournaments'
      AND column_name = 'competition_format'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tournaments'
      AND column_name = 'league_matches_per_team'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tournaments'
      AND column_name = 'knockout_cutoff'
  ) THEN
    RAISE EXCEPTION
      'Apply 20261121121000_champions_league_competition_config.sql before 20261121124500_save_competition_configuration.sql. The competition columns are not present.';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.competition_config_result(
  p_status text,
  p_code text,
  p_error text,
  p_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'status', p_status,
    'code', p_code,
    'error', p_error,
    'updatedAt', p_updated_at
  );
$$;

CREATE OR REPLACE FUNCTION public.competition_config_lock_tournaments(
  p_first uuid,
  p_second uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_low uuid;
  v_high uuid;
BEGIN
  IF p_first IS NULL AND p_second IS NULL THEN
    RETURN;
  END IF;

  IF p_second IS NULL OR p_first IS NULL OR p_first = p_second THEN
    PERFORM 1
    FROM public.tournaments
    WHERE id = COALESCE(p_first, p_second)
    FOR UPDATE;
    RETURN;
  END IF;

  IF p_first < p_second THEN
    v_low := p_first;
    v_high := p_second;
  ELSE
    v_low := p_second;
    v_high := p_first;
  END IF;

  PERFORM 1 FROM public.tournaments WHERE id = v_low FOR UPDATE;
  PERFORM 1 FROM public.tournaments WHERE id = v_high FOR UPDATE;
END;
$$;

CREATE OR REPLACE FUNCTION public.competition_config_lock_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'accepted'::public.application_status THEN
      PERFORM public.competition_config_lock_tournaments(NEW.tournament_id, NULL);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'accepted'::public.application_status THEN
      PERFORM public.competition_config_lock_tournaments(OLD.tournament_id, NULL);
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'accepted'::public.application_status
    OR NEW.status = 'accepted'::public.application_status
    OR OLD.tournament_id IS DISTINCT FROM NEW.tournament_id
  THEN
    PERFORM public.competition_config_lock_tournaments(OLD.tournament_id, NEW.tournament_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.competition_config_lock_external_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_relevant boolean;
  v_new_relevant boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.participation_status = 'confirmed' AND NEW.external_active THEN
      PERFORM public.competition_config_lock_tournaments(NEW.tournament_id, NULL);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.participation_status = 'confirmed' AND OLD.external_active THEN
      PERFORM public.competition_config_lock_tournaments(OLD.tournament_id, NULL);
    END IF;
    RETURN OLD;
  END IF;

  v_old_relevant := OLD.participation_status = 'confirmed' AND OLD.external_active;
  v_new_relevant := NEW.participation_status = 'confirmed' AND NEW.external_active;
  IF v_old_relevant
    OR v_new_relevant
    OR OLD.tournament_id IS DISTINCT FROM NEW.tournament_id
    OR OLD.application_id IS DISTINCT FROM NEW.application_id
  THEN
    PERFORM public.competition_config_lock_tournaments(OLD.tournament_id, NEW.tournament_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.competition_config_lock_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.competition_config_lock_tournaments(NEW.tournament_id, NULL);
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM public.competition_config_lock_tournaments(OLD.tournament_id, NULL);
    RETURN OLD;
  END IF;
  PERFORM public.competition_config_lock_tournaments(OLD.tournament_id, NEW.tournament_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.competition_config_lock_group_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_tournament uuid;
  v_new_tournament uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT tournament_id
    INTO v_old_tournament
    FROM public.tournament_groups
    WHERE id = OLD.group_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT tournament_id
    INTO v_new_tournament
    FROM public.tournament_groups
    WHERE id = NEW.group_id;
  END IF;

  -- A group delete cascades to members after the group trigger has already
  -- locked the tournament. The group row may no longer be visible here.
  IF v_old_tournament IS NULL AND v_new_tournament IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  PERFORM public.competition_config_lock_tournaments(v_old_tournament, v_new_tournament);
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.competition_config_lock_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.competition_config_lock_tournaments(NEW.tournament_id, NULL);
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM public.competition_config_lock_tournaments(OLD.tournament_id, NULL);
    RETURN OLD;
  END IF;
  PERFORM public.competition_config_lock_tournaments(OLD.tournament_id, NEW.tournament_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS competition_config_lock_application ON public.applications;
CREATE TRIGGER competition_config_lock_application
  BEFORE INSERT OR DELETE OR UPDATE OF status, tournament_id
  ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.competition_config_lock_application();

DROP TRIGGER IF EXISTS competition_config_lock_external_team ON public.tournament_external_teams;
CREATE TRIGGER competition_config_lock_external_team
  BEFORE INSERT OR DELETE OR UPDATE OF participation_status, external_active, application_id, tournament_id
  ON public.tournament_external_teams
  FOR EACH ROW
  EXECUTE FUNCTION public.competition_config_lock_external_team();

DROP TRIGGER IF EXISTS competition_config_lock_group ON public.tournament_groups;
CREATE TRIGGER competition_config_lock_group
  BEFORE INSERT OR DELETE OR UPDATE OF tournament_id
  ON public.tournament_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.competition_config_lock_group();

DROP TRIGGER IF EXISTS competition_config_lock_group_member ON public.tournament_group_members;
CREATE TRIGGER competition_config_lock_group_member
  BEFORE INSERT OR DELETE OR UPDATE OF group_id, application_id, external_team_id
  ON public.tournament_group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.competition_config_lock_group_member();

DROP TRIGGER IF EXISTS competition_config_lock_match ON public.tournament_matches;
CREATE TRIGGER competition_config_lock_match
  BEFORE INSERT OR DELETE OR UPDATE
  ON public.tournament_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.competition_config_lock_match();

CREATE OR REPLACE FUNCTION public.save_competition_configuration(
  p_tournament_id uuid,
  p_expected_updated_at timestamptz,
  p_competition_format text,
  p_league_matches_per_team integer,
  p_knockout_cutoff integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_at timestamptz;
  v_archived_at timestamptz;
  v_status public.tournament_status;
  v_lifecycle text;
  v_stored_format text;
  v_stored_matches integer;
  v_stored_cutoff integer;
  v_requested_format text;
  v_group_count integer;
  v_match_count integer;
  v_knockout boolean;
  v_live boolean;
  v_results boolean;
  v_effective text;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_app uuid;
  v_ext record;
  v_team_count integer;
  v_new_updated_at timestamptz;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.has_rbac_permission('tournaments.manage')
    OR NOT public.has_rbac_permission('schedule.manage')
  THEN
    RETURN public.competition_config_result(
      'forbidden',
      'FORBIDDEN',
      'Keine Berechtigung für diese Aktion.',
      NULL
    );
  END IF;

  SELECT
    updated_at,
    archived_at,
    status,
    lifecycle_state,
    competition_format,
    league_matches_per_team,
    knockout_cutoff
  INTO
    v_updated_at,
    v_archived_at,
    v_status,
    v_lifecycle,
    v_stored_format,
    v_stored_matches,
    v_stored_cutoff
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN public.competition_config_result(
      'not_found',
      'NOT_FOUND',
      'Das Turnier wurde nicht gefunden.',
      NULL
    );
  END IF;

  IF v_archived_at IS NOT NULL THEN
    RETURN public.competition_config_result(
      'validation_error',
      'ARCHIVED',
      'Ein archiviertes Turnier kann nicht konfiguriert werden.',
      v_updated_at
    );
  END IF;

  IF p_competition_format IS NULL THEN
    v_requested_format := NULL;
  ELSE
    v_requested_format := btrim(p_competition_format);
    IF v_requested_format NOT IN ('round-robin', 'groups-knockout', 'champions-league') THEN
      RETURN public.competition_config_result(
        'validation_error',
        'INVALID_COMPETITION_FORMAT',
        'Der gespeicherte Spielplanmodus ist ungültig.',
        v_updated_at
      );
    END IF;
  END IF;

  IF v_stored_format IS NOT NULL
    AND v_stored_format NOT IN ('round-robin', 'groups-knockout', 'champions-league')
  THEN
    RETURN public.competition_config_result(
      'validation_error',
      'INVALID_COMPETITION_FORMAT',
      'Der gespeicherte Spielplanmodus ist ungültig.',
      v_updated_at
    );
  END IF;

  IF p_league_matches_per_team IS NOT NULL
    AND (p_league_matches_per_team < 1 OR p_league_matches_per_team > 64)
  THEN
    RETURN public.competition_config_result(
      'validation_error',
      'INVALID_LEAGUE_MATCHES_PER_TEAM',
      'Die Spiele pro Team müssen eine ganze Zahl von 1 bis 64 sein.',
      v_updated_at
    );
  END IF;

  IF p_knockout_cutoff IS NOT NULL AND p_knockout_cutoff NOT IN (4, 8) THEN
    RETURN public.competition_config_result(
      'validation_error',
      'INVALID_KNOCKOUT_CUTOFF',
      'Die K.-o.-Qualifikation unterstützt nur die ersten 4 oder die ersten 8 Teams.',
      v_updated_at
    );
  END IF;

  IF v_stored_matches IS NOT NULL
    AND (v_stored_matches < 1 OR v_stored_matches > 64)
  THEN
    RETURN public.competition_config_result(
      'validation_error',
      'INVALID_LEAGUE_MATCHES_PER_TEAM',
      'Die Spiele pro Team müssen eine ganze Zahl von 1 bis 64 sein.',
      v_updated_at
    );
  END IF;

  IF v_stored_cutoff IS NOT NULL AND v_stored_cutoff NOT IN (4, 8) THEN
    RETURN public.competition_config_result(
      'validation_error',
      'INVALID_KNOCKOUT_CUTOFF',
      'Die K.-o.-Qualifikation unterstützt nur die ersten 4 oder die ersten 8 Teams.',
      v_updated_at
    );
  END IF;

  IF (v_requested_format = 'champions-league')
    <> (p_league_matches_per_team IS NOT NULL AND p_knockout_cutoff IS NOT NULL)
    OR (
      v_requested_format IS DISTINCT FROM 'champions-league'
      AND (p_league_matches_per_team IS NOT NULL OR p_knockout_cutoff IS NOT NULL)
    )
  THEN
    RETURN public.competition_config_result(
      'validation_error',
      'FORMAT_PARAMS_MISMATCH',
      CASE
        WHEN v_requested_format = 'champions-league' THEN
          'Champions League braucht Spiele pro Team und eine K.-o.-Qualifikation.'
        ELSE
          'Spiele pro Team und K.-o.-Qualifikation gehören nur zur Champions League.'
      END,
      v_updated_at
    );
  END IF;

  FOR v_app IN
    SELECT id
    FROM public.applications
    WHERE tournament_id = p_tournament_id
      AND status = 'accepted'::public.application_status
    ORDER BY id
  LOOP
    IF v_app = ANY (v_ids) THEN
      RETURN public.competition_config_result(
        'validation_error',
        'DUPLICATE_PARTICIPANT',
        'Ein Team darf nur einmal gesetzt sein.',
        v_updated_at
      );
    END IF;
    v_ids := array_append(v_ids, v_app);
  END LOOP;

  FOR v_ext IN
    SELECT id, application_id
    FROM public.tournament_external_teams
    WHERE tournament_id = p_tournament_id
      AND participation_status = 'confirmed'
      AND external_active IS TRUE
    ORDER BY id
  LOOP
    IF v_ext.id IS NULL THEN
      RETURN public.competition_config_result(
        'validation_error',
        'INVALID_PARTICIPANT_IDENTITY',
        'Jeder Teilnehmer braucht genau eine Bewerbung oder genau ein externes Team.',
        v_updated_at
      );
    END IF;

    IF v_ext.application_id IS NOT NULL AND v_ext.application_id = ANY (v_ids) THEN
      CONTINUE;
    END IF;

    IF v_ext.id = ANY (v_ids) THEN
      RETURN public.competition_config_result(
        'validation_error',
        'DUPLICATE_PARTICIPANT',
        'Ein Team darf nur einmal gesetzt sein.',
        v_updated_at
      );
    END IF;
    v_ids := array_append(v_ids, v_ext.id);
  END LOOP;

  SELECT count(*)::integer
  INTO v_group_count
  FROM public.tournament_groups
  WHERE tournament_id = p_tournament_id;

  SELECT
    count(*)::integer,
    COALESCE(bool_or(phase = 'knockout'), false),
    COALESCE(bool_or(status = 'live'), false),
    COALESCE(bool_or(status = 'completed' OR home_score IS NOT NULL OR away_score IS NOT NULL), false)
  INTO v_match_count, v_knockout, v_live, v_results
  FROM public.tournament_matches
  WHERE tournament_id = p_tournament_id;

  IF v_status = 'completed'::public.tournament_status OR v_lifecycle = 'completed' THEN
    v_effective := 'completed';
  ELSIF v_knockout THEN
    v_effective := 'knockout_stage';
  ELSIF v_lifecycle = 'knockout_stage' THEN
    v_effective := CASE WHEN v_group_count > 0 THEN 'group_stage' ELSE 'setup' END;
  ELSIF v_group_count > 0 THEN
    v_effective := 'group_stage';
  ELSE
    v_effective := 'setup';
  END IF;

  IF v_requested_format = 'champions-league' THEN
    v_team_count := COALESCE(cardinality(v_ids), 0);
    IF v_team_count < 2 THEN
      RETURN public.competition_config_result(
        'validation_error',
        'TOO_FEW_TEAMS',
        'Für eine Liga werden mindestens zwei Teams benötigt.',
        v_updated_at
      );
    END IF;
    IF p_league_matches_per_team < 1 OR p_league_matches_per_team > v_team_count - 1 THEN
      RETURN public.competition_config_result(
        'validation_error',
        'MATCHES_OUT_OF_RANGE',
        format('Jedes Team spielt zwischen 1 und %s verschiedene Gegner.', v_team_count - 1),
        v_updated_at
      );
    END IF;
    IF (v_team_count * p_league_matches_per_team) % 2 <> 0 THEN
      RETURN public.competition_config_result(
        'validation_error',
        'UNEVEN_MATCH_TOTAL',
        'Die Gesamtzahl der Ligabegegnungen muss ganzzahlig sein. Bei ungerader Teamzahl muss die Spielezahl pro Team gerade sein.',
        v_updated_at
      );
    END IF;
    IF v_team_count < p_knockout_cutoff THEN
      RETURN public.competition_config_result(
        'validation_error',
        'CUTOFF_EXCEEDS_TEAMS',
        'Es gibt weniger Teams als Qualifikationsplätze.',
        v_updated_at
      );
    END IF;
  END IF;

  IF v_stored_format IS NOT DISTINCT FROM v_requested_format
    AND v_stored_matches IS NOT DISTINCT FROM p_league_matches_per_team
    AND v_stored_cutoff IS NOT DISTINCT FROM p_knockout_cutoff
  THEN
    IF p_expected_updated_at IS NULL THEN
      RETURN public.competition_config_result(
        'validation_error',
        'MISSING_VERSION',
        'Die gespeicherte Version fehlt.',
        v_updated_at
      );
    END IF;
    IF v_updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RETURN public.competition_config_result(
        'stale_configuration',
        'STALE_CONFIGURATION',
        'Die Turnierkonfiguration wurde zwischenzeitlich geändert.',
        v_updated_at
      );
    END IF;
    RETURN public.competition_config_result('unchanged', NULL, NULL, v_updated_at);
  END IF;

  IF v_stored_format IS NULL
    AND v_group_count > 0
    AND v_requested_format IN ('round-robin', 'champions-league')
  THEN
    RETURN public.competition_config_result(
      'validation_error',
      'UNSAFE_LEGACY_CONVERSION',
      'Ein vorhandenes Gruppenturnier kann nicht in einen anderen Modus umgestellt werden.',
      v_updated_at
    );
  END IF;

  IF v_requested_format = 'round-robin' AND v_group_count > 0 THEN
    RETURN public.competition_config_result(
      'validation_error',
      'FORMAT_GROUP_DISAGREEMENT',
      'Jeder gegen jeden passt nicht zu vorhandenen Gruppen.',
      v_updated_at
    );
  END IF;

  IF v_requested_format = 'champions-league' AND v_group_count > 1 THEN
    RETURN public.competition_config_result(
      'validation_error',
      'CHAMPIONS_LEAGUE_MULTIPLE_GROUPS',
      'Champions League passt nicht zu mehreren Gruppen.',
      v_updated_at
    );
  END IF;

  IF v_requested_format = 'champions-league' AND v_group_count = 1 THEN
    RETURN public.competition_config_result(
      'validation_error',
      'UNVERIFIED_LEAGUE_GROUP',
      'Eine vorhandene Gruppe ist noch kein bestätigter Liga-Wettbewerb.',
      v_updated_at
    );
  END IF;

  IF v_requested_format = 'groups-knockout' AND v_group_count = 0 THEN
    RETURN public.competition_config_result(
      'validation_error',
      'GROUPS_NOT_READY',
      'Gruppenphase kann ohne vorhandene Gruppen nicht gespeichert werden.',
      v_updated_at
    );
  END IF;

  IF v_effective = 'completed' THEN
    RETURN public.competition_config_result(
      'config_locked',
      'LIFECYCLE_COMPLETED',
      'Ein abgeschlossenes Turnier kann nicht umkonfiguriert werden.',
      v_updated_at
    );
  END IF;
  IF v_effective = 'knockout_stage' OR v_knockout THEN
    RETURN public.competition_config_result(
      'config_locked',
      CASE WHEN v_knockout THEN 'KNOCKOUT_MATCHES' ELSE 'LIFECYCLE_KNOCKOUT' END,
      CASE
        WHEN v_knockout THEN 'Vorhandene K.-o.-Spiele sperren eine Konfigurationsänderung.'
        ELSE 'Ein Turnier in der K.-o.-Phase kann nicht umkonfiguriert werden.'
      END,
      v_updated_at
    );
  END IF;
  IF v_live THEN
    RETURN public.competition_config_result(
      'config_locked',
      'LIVE_MATCH',
      'Ein laufendes Spiel sperrt eine Konfigurationsänderung.',
      v_updated_at
    );
  END IF;
  IF v_results OR v_match_count > 0 THEN
    RETURN public.competition_config_result(
      'config_locked',
      CASE WHEN v_results THEN 'RESULTS_EXIST' ELSE 'MATCHES_EXIST' END,
      CASE
        WHEN v_results THEN 'Vorhandene Ergebnisse sperren eine Konfigurationsänderung.'
        ELSE 'Vorhandene Spiele sperren eine Konfigurationsänderung. Der Spielplan muss zuerst gelöscht werden.'
      END,
      v_updated_at
    );
  END IF;

  IF p_expected_updated_at IS NULL THEN
    RETURN public.competition_config_result(
      'validation_error',
      'MISSING_VERSION',
      'Die gespeicherte Version fehlt.',
      v_updated_at
    );
  END IF;
  IF v_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN public.competition_config_result(
      'stale_configuration',
      'STALE_CONFIGURATION',
      'Die Turnierkonfiguration wurde zwischenzeitlich geändert.',
      v_updated_at
    );
  END IF;

  IF v_requested_format = 'champions-league' THEN
    RETURN public.competition_config_result(
      'not_activated',
      'CHAMPIONS_LEAGUE_SAVE_NOT_ACTIVATED',
      'Champions League kann noch nicht gespeichert werden, weil die Spielplanerzeugung den Modus noch nicht kennt.',
      v_updated_at
    );
  END IF;

  UPDATE public.tournaments
  SET
    competition_format = v_requested_format,
    league_matches_per_team = p_league_matches_per_team,
    knockout_cutoff = p_knockout_cutoff
  WHERE id = p_tournament_id
    AND updated_at = p_expected_updated_at
  RETURNING updated_at INTO v_new_updated_at;

  IF v_new_updated_at IS NULL OR v_new_updated_at = p_expected_updated_at THEN
    RETURN public.competition_config_result(
      'persistence_error',
      'UPDATE_NOT_PROVED',
      'Die Konfiguration konnte nicht als gespeichert nachgewiesen werden.',
      v_updated_at
    );
  END IF;

  RETURN public.competition_config_result('success', NULL, NULL, v_new_updated_at);
END;
$$;

REVOKE ALL ON FUNCTION public.competition_config_result(text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.competition_config_lock_tournaments(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.competition_config_lock_application() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.competition_config_lock_external_team() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.competition_config_lock_group() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.competition_config_lock_group_member() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.competition_config_lock_match() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_competition_configuration(uuid, timestamptz, text, integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.competition_config_lock_application() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.competition_config_lock_external_team() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.competition_config_lock_group() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.competition_config_lock_group_member() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.competition_config_lock_match() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_competition_configuration(uuid, timestamptz, text, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.save_competition_configuration(uuid, timestamptz, text, integer, integer) IS
  'Atomic competition-configuration save. Rejects champions-league. Locks one tournament, reads authoritative children, and updates only the three competition columns.';
