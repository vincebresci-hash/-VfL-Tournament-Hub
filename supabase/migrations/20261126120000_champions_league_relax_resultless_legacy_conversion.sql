-- =============================================================================
-- CL Release 5 -- Champions League apply: allow resultless legacy mode switch.
-- =============================================================================
--
-- FILE ONLY until a reviewed migration run. Do NOT execute against production
-- from the agent. No production database change without separate approval.
--
-- CREATE OR REPLACE of apply_champions_league_league_phase (identical 7-arg
-- signature). The ONLY behavioural changes versus 20261122180000 are:
--   1. The UNSAFE_LEGACY_CONVERSION guard is relaxed: a competition_format NULL
--      tournament with <= 1 group and NO results/live/knockout/completed state
--      may be converted to Champions League (still requires p_confirm_replace).
--   2. The pre-insert cleanup also clears resultless scheduled matches whose
--      phase is NULL (legacy rows), not only phase = 'group'.
-- All other validation (RBAC, optimistic concurrency, same-club, fixture
-- invariants, multi-group block, explicit legacy-format block) is byte-identical.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.apply_champions_league_league_phase(
  p_tournament_id uuid,
  p_expected_updated_at timestamptz,
  p_league_matches_per_team integer,
  p_knockout_cutoff integer,
  p_restrict_same_club boolean,
  p_confirm_replace boolean,
  p_matches jsonb
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
  v_group_count integer;
  v_match_count integer;
  v_knockout boolean;
  v_live boolean;
  v_results boolean;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_app uuid;
  v_ext record;
  v_team_count integer;
  v_expected integer;
  v_item jsonb;
  v_home uuid;
  v_away uuid;
  v_field uuid;
  v_scheduled timestamptz;
  v_duration integer;
  v_sort integer;
  v_home_application uuid;
  v_home_external uuid;
  v_away_application uuid;
  v_away_external uuid;
  v_pair text;
  v_pairs text[] := ARRAY[]::text[];
  v_degree jsonb := '{}'::jsonb;
  v_group_id uuid;
  v_new_updated_at timestamptz;
  v_written_format text;
  v_written_matches integer;
  v_written_cutoff integer;
  v_written_restrict boolean;
  v_club_by_id jsonb := '{}'::jsonb;
  v_home_club text;
  v_away_club text;
  v_inserted integer := 0;
  v_text text;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.has_rbac_permission('tournaments.manage')
    OR NOT public.has_rbac_permission('schedule.manage')
  THEN
    RETURN jsonb_build_object(
      'status', 'forbidden',
      'code', 'FORBIDDEN',
      'error', 'Keine Berechtigung für diese Aktion.',
      'updatedAt', NULL,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

  SELECT
    updated_at,
    archived_at,
    status,
    lifecycle_state,
    competition_format
  INTO
    v_updated_at,
    v_archived_at,
    v_status,
    v_lifecycle,
    v_stored_format
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'code', 'NOT_FOUND',
      'error', 'Das Turnier wurde nicht gefunden.',
      'updatedAt', NULL,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

  IF v_archived_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'code', 'ARCHIVED',
      'error', 'Ein archiviertes Turnier kann nicht konfiguriert werden.',
      'updatedAt', v_updated_at,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

  IF p_expected_updated_at IS NULL OR v_updated_at IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'code', 'MISSING_VERSION',
      'error', 'Die gespeicherte Version fehlt.',
      'updatedAt', v_updated_at,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

  IF v_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object(
      'status', 'stale_configuration',
      'code', 'STALE_CONFIGURATION',
      'error', 'Die Turnierkonfiguration wurde zwischenzeitlich geändert.',
      'updatedAt', v_updated_at,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

  IF p_knockout_cutoff IS NULL OR p_knockout_cutoff NOT IN (4, 8, 16) THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'code', 'INVALID_KNOCKOUT_CUTOFF',
      'error', 'Die K.-o.-Qualifikation unterstützt nur die ersten 4, 8 oder 16 Teams.',
      'updatedAt', v_updated_at,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

  IF p_league_matches_per_team IS NULL
    OR p_league_matches_per_team < 1
    OR p_league_matches_per_team > 64
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'code', 'INVALID_LEAGUE_MATCHES_PER_TEAM',
      'error', 'Die Spiele pro Team müssen eine ganze Zahl von 1 bis 64 sein.',
      'updatedAt', v_updated_at,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

  IF v_stored_format IS NOT NULL
    AND v_stored_format NOT IN ('round-robin', 'groups-knockout', 'champions-league')
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'code', 'INVALID_COMPETITION_FORMAT',
      'error', 'Der gespeicherte Spielplanmodus ist ungültig.',
      'updatedAt', v_updated_at,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

  IF v_stored_format IN ('round-robin', 'groups-knockout') THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'code', 'LEGACY_FORMAT',
      'error', 'Ein gespeichertes Bestandsformat kann nicht als Champions League überschrieben werden.',
      'updatedAt', v_updated_at,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

  IF v_status = 'completed'::public.tournament_status OR v_lifecycle = 'completed' THEN
    RETURN jsonb_build_object(
      'status', 'config_locked',
      'code', 'LIFECYCLE_COMPLETED',
      'error', 'Ein abgeschlossenes Turnier kann nicht umkonfiguriert werden.',
      'updatedAt', v_updated_at,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

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

  IF v_knockout OR v_lifecycle = 'knockout_stage' THEN
    RETURN jsonb_build_object(
      'status', 'config_locked',
      'code', CASE WHEN v_knockout THEN 'KNOCKOUT_MATCHES' ELSE 'LIFECYCLE_KNOCKOUT' END,
      'error', CASE
        WHEN v_knockout THEN 'Vorhandene K.-o.-Spiele sperren eine Konfigurationsänderung.'
        ELSE 'Ein Turnier in der K.-o.-Phase kann nicht umkonfiguriert werden.'
      END,
      'updatedAt', v_updated_at,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

  IF v_live THEN
    RETURN jsonb_build_object(
      'status', 'config_locked',
      'code', 'LIVE_MATCH',
      'error', 'Ein laufendes Spiel sperrt eine Konfigurationsänderung.',
      'updatedAt', v_updated_at,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

  IF v_results THEN
    RETURN jsonb_build_object(
      'status', 'config_locked',
      'code', 'RESULTS_EXIST',
      'error', 'Vorhandene Ergebnisse sperren eine Konfigurationsänderung.',
      'updatedAt', v_updated_at,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

  IF v_group_count > 1 THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'code', 'CHAMPIONS_LEAGUE_MULTIPLE_GROUPS',
      'error', 'Champions League passt nicht zu mehreren Gruppen.',
      'updatedAt', v_updated_at,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

  -- CL Release 5 (2026-11-26): a resultless legacy tournament (competition_format
  -- NULL) with at most one group is convertible to Champions League. Every unsafe
  -- state -- results (incl. 0:0), live, knockout, completed, more than one group --
  -- is already rejected above, and the replace stays gated by p_confirm_replace.
  -- The single existing group is reused as the league group and its resultless
  -- scheduled matches are cleared below. This restores the mode switch required by
  -- CL Release 5 while keeping the started/result protection intact.

  FOR v_app IN
    SELECT id
    FROM public.applications
    WHERE tournament_id = p_tournament_id
      AND status = 'accepted'::public.application_status
    ORDER BY id
  LOOP
    IF v_app = ANY (v_ids) THEN
      RETURN jsonb_build_object(
        'status', 'validation_error',
        'code', 'DUPLICATE_PARTICIPANT',
        'error', 'Ein Team darf nur einmal gesetzt sein.',
        'updatedAt', v_updated_at,
        'groupId', NULL,
        'matchCount', 0
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
    IF v_ext.application_id IS NOT NULL AND v_ext.application_id = ANY (v_ids) THEN
      CONTINUE;
    END IF;
    IF v_ext.id = ANY (v_ids) THEN
      RETURN jsonb_build_object(
        'status', 'validation_error',
        'code', 'DUPLICATE_PARTICIPANT',
        'error', 'Ein Team darf nur einmal gesetzt sein.',
        'updatedAt', v_updated_at,
        'groupId', NULL,
        'matchCount', 0
      );
    END IF;
    v_ids := array_append(v_ids, v_ext.id);
  END LOOP;

  -- Authoritative club identity per participant id (null club = no restriction).
  -- Keyed the same way as v_ids: accepted application ids and confirmed external
  -- team ids. Only built when the same-club restriction is active.
  IF p_restrict_same_club THEN
    SELECT COALESCE(jsonb_object_agg(club_key, club_value), '{}'::jsonb)
    INTO v_club_by_id
    FROM (
      SELECT a.id::text AS club_key, a.club_id::text AS club_value
      FROM public.applications a
      WHERE a.tournament_id = p_tournament_id
        AND a.status = 'accepted'::public.application_status
        AND a.club_id IS NOT NULL
      UNION ALL
      SELECT e.id::text AS club_key, e.club_id::text AS club_value
      FROM public.tournament_external_teams e
      WHERE e.tournament_id = p_tournament_id
        AND e.participation_status = 'confirmed'
        AND e.external_active IS TRUE
        AND e.application_id IS NULL
        AND e.club_id IS NOT NULL
    ) AS clubs;
  END IF;

  v_team_count := COALESCE(cardinality(v_ids), 0);
  IF v_team_count < 2 THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'code', 'TOO_FEW_TEAMS',
      'error', 'Für eine Liga werden mindestens zwei Teams benötigt.',
      'updatedAt', v_updated_at,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

  IF p_league_matches_per_team > v_team_count - 1 THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'code', 'MATCHES_OUT_OF_RANGE',
      'error', format('Jedes Team spielt zwischen 1 und %s verschiedene Gegner.', v_team_count - 1),
      'updatedAt', v_updated_at,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

  IF (v_team_count * p_league_matches_per_team) % 2 <> 0 THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'code', 'UNEVEN_MATCH_TOTAL',
      'error', 'Die Gesamtzahl der Ligabegegnungen muss ganzzahlig sein. Bei ungerader Teamzahl muss die Spielezahl pro Team gerade sein.',
      'updatedAt', v_updated_at,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

  IF v_team_count < p_knockout_cutoff THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'code', 'CUTOFF_EXCEEDS_TEAMS',
      'error', 'Es gibt weniger Teams als Qualifikationsplätze.',
      'updatedAt', v_updated_at,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

  v_expected := (v_team_count * p_league_matches_per_team) / 2;
  IF p_matches IS NULL OR jsonb_typeof(p_matches) <> 'array' OR jsonb_array_length(p_matches) <> v_expected THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'code', 'FIXTURE_INVARIANT',
      'error', 'Die Ligabegegnungen passen nicht zur Teilnehmerzahl.',
      'updatedAt', v_updated_at,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_matches)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RETURN jsonb_build_object(
        'status', 'validation_error',
        'code', 'FIXTURE_INVARIANT',
        'error', 'Eine Ligabegegnung ist unvollständig.',
        'updatedAt', v_updated_at,
        'groupId', NULL,
        'matchCount', 0
      );
    END IF;

    v_home_application := NULL;
    v_home_external := NULL;
    v_away_application := NULL;
    v_away_external := NULL;

    v_text := NULLIF(btrim(v_item->>'homeApplicationId'), '');
    IF v_text IS NOT NULL THEN
      IF v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN jsonb_build_object(
          'status', 'validation_error',
          'code', 'INVALID_PARTICIPANT_IDENTITY',
          'error', 'Jeder Teilnehmer braucht genau eine Bewerbung oder genau ein externes Team.',
          'updatedAt', v_updated_at,
          'groupId', NULL,
          'matchCount', 0
        );
      END IF;
      v_home_application := v_text::uuid;
    END IF;
    v_text := NULLIF(btrim(v_item->>'homeExternalTeamId'), '');
    IF v_text IS NOT NULL THEN
      IF v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN jsonb_build_object(
          'status', 'validation_error',
          'code', 'INVALID_PARTICIPANT_IDENTITY',
          'error', 'Jeder Teilnehmer braucht genau eine Bewerbung oder genau ein externes Team.',
          'updatedAt', v_updated_at,
          'groupId', NULL,
          'matchCount', 0
        );
      END IF;
      v_home_external := v_text::uuid;
    END IF;
    IF (v_home_application IS NULL) = (v_home_external IS NULL) THEN
      RETURN jsonb_build_object(
        'status', 'validation_error',
        'code', 'INVALID_PARTICIPANT_IDENTITY',
        'error', 'Jeder Teilnehmer braucht genau eine Bewerbung oder genau ein externes Team.',
        'updatedAt', v_updated_at,
        'groupId', NULL,
        'matchCount', 0
      );
    END IF;

    v_text := NULLIF(btrim(v_item->>'awayApplicationId'), '');
    IF v_text IS NOT NULL THEN
      IF v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN jsonb_build_object(
          'status', 'validation_error',
          'code', 'INVALID_PARTICIPANT_IDENTITY',
          'error', 'Jeder Teilnehmer braucht genau eine Bewerbung oder genau ein externes Team.',
          'updatedAt', v_updated_at,
          'groupId', NULL,
          'matchCount', 0
        );
      END IF;
      v_away_application := v_text::uuid;
    END IF;
    v_text := NULLIF(btrim(v_item->>'awayExternalTeamId'), '');
    IF v_text IS NOT NULL THEN
      IF v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN jsonb_build_object(
          'status', 'validation_error',
          'code', 'INVALID_PARTICIPANT_IDENTITY',
          'error', 'Jeder Teilnehmer braucht genau eine Bewerbung oder genau ein externes Team.',
          'updatedAt', v_updated_at,
          'groupId', NULL,
          'matchCount', 0
        );
      END IF;
      v_away_external := v_text::uuid;
    END IF;
    IF (v_away_application IS NULL) = (v_away_external IS NULL) THEN
      RETURN jsonb_build_object(
        'status', 'validation_error',
        'code', 'INVALID_PARTICIPANT_IDENTITY',
        'error', 'Jeder Teilnehmer braucht genau eine Bewerbung oder genau ein externes Team.',
        'updatedAt', v_updated_at,
        'groupId', NULL,
        'matchCount', 0
      );
    END IF;

    v_home := COALESCE(v_home_application, v_home_external);
    v_away := COALESCE(v_away_application, v_away_external);
    IF v_home = v_away OR NOT (v_home = ANY (v_ids)) OR NOT (v_away = ANY (v_ids)) THEN
      RETURN jsonb_build_object(
        'status', 'validation_error',
        'code', 'INVALID_PARTICIPANT_IDENTITY',
        'error', 'Eine Ligabegegnung verwendet ein Team, das nicht bestätigt ist.',
        'updatedAt', v_updated_at,
        'groupId', NULL,
        'matchCount', 0
      );
    END IF;

    -- Authoritative same-club enforcement. Never silently relaxed: a submitted
    -- draw that pairs two teams of the same club is rejected outright.
    IF p_restrict_same_club THEN
      v_home_club := v_club_by_id->>v_home::text;
      v_away_club := v_club_by_id->>v_away::text;
      IF v_home_club IS NOT NULL AND v_away_club IS NOT NULL AND v_home_club = v_away_club THEN
        RETURN jsonb_build_object(
          'status', 'validation_error',
          'code', 'SAME_CLUB_VIOLATION',
          'error', 'Zwei Mannschaften desselben Vereins dürfen in der Ligaphase nicht gegeneinander spielen.',
          'updatedAt', v_updated_at,
          'groupId', NULL,
          'matchCount', 0
        );
      END IF;
    END IF;

    v_text := NULLIF(btrim(v_item->>'fieldId'), '');
    IF v_text IS NULL
      OR v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN
      RETURN jsonb_build_object(
        'status', 'validation_error',
        'code', 'NO_FIELDS',
        'error', 'Bitte zuerst mindestens ein Spielfeld anlegen und speichern.',
        'updatedAt', v_updated_at,
        'groupId', NULL,
        'matchCount', 0
      );
    END IF;
    v_field := v_text::uuid;
    IF NOT EXISTS (
      SELECT 1
      FROM public.tournament_fields
      WHERE id = v_field
        AND tournament_id = p_tournament_id
    ) THEN
      RETURN jsonb_build_object(
        'status', 'validation_error',
        'code', 'NO_FIELDS',
        'error', 'Ein Spiel verweist auf ein Spielfeld, das nicht zu diesem Turnier gehört.',
        'updatedAt', v_updated_at,
        'groupId', NULL,
        'matchCount', 0
      );
    END IF;

    BEGIN
      v_scheduled := (v_item->>'scheduledAt')::timestamptz;
      v_duration := (v_item->>'durationMinutes')::integer;
      v_sort := (v_item->>'sortOrder')::integer;
    EXCEPTION
      WHEN others THEN
        RETURN jsonb_build_object(
          'status', 'validation_error',
          'code', 'FIXTURE_INVARIANT',
          'error', 'Eine Ligabegegnung hat keine gültige Anstoßzeit.',
          'updatedAt', v_updated_at,
          'groupId', NULL,
          'matchCount', 0
        );
    END;

    IF v_scheduled IS NULL OR v_duration IS NULL OR v_duration < 5 OR v_duration > 90 OR v_sort IS NULL THEN
      RETURN jsonb_build_object(
        'status', 'validation_error',
        'code', 'FIXTURE_INVARIANT',
        'error', 'Eine Ligabegegnung ist unvollständig.',
        'updatedAt', v_updated_at,
        'groupId', NULL,
        'matchCount', 0
      );
    END IF;

    v_pair := LEAST(v_home, v_away)::text || ':' || GREATEST(v_home, v_away)::text;
    IF v_pair = ANY (v_pairs) THEN
      RETURN jsonb_build_object(
        'status', 'validation_error',
        'code', 'FIXTURE_INVARIANT',
        'error', 'Zwei Teams dürfen in der Ligaphase nur einmal aufeinandertreffen.',
        'updatedAt', v_updated_at,
        'groupId', NULL,
        'matchCount', 0
      );
    END IF;
    v_pairs := array_append(v_pairs, v_pair);
    v_degree := jsonb_set(
      v_degree,
      ARRAY[v_home::text],
      to_jsonb(COALESCE((v_degree->>v_home::text)::integer, 0) + 1),
      true
    );
    v_degree := jsonb_set(
      v_degree,
      ARRAY[v_away::text],
      to_jsonb(COALESCE((v_degree->>v_away::text)::integer, 0) + 1),
      true
    );
  END LOOP;

  FOREACH v_app IN ARRAY v_ids LOOP
    IF COALESCE((v_degree->>v_app::text)::integer, 0) IS DISTINCT FROM p_league_matches_per_team THEN
      RETURN jsonb_build_object(
        'status', 'validation_error',
        'code', 'FIXTURE_INVARIANT',
        'error', 'Nicht jedes Team hat die konfigurierte Zahl verschiedener Gegner.',
        'updatedAt', v_updated_at,
        'groupId', NULL,
        'matchCount', 0
      );
    END IF;
  END LOOP;

  IF v_match_count > 0 AND p_confirm_replace IS DISTINCT FROM true THEN
    RETURN jsonb_build_object(
      'status', 'confirmation_required',
      'code', 'CONFIRM_REPLACE',
      'error', 'Es besteht bereits ein Spielplan ohne Ergebnisse. Bitte bestätige ausdrücklich, dass er ersetzt werden soll.',
      'updatedAt', v_updated_at,
      'groupId', NULL,
      'matchCount', 0
    );
  END IF;

  IF v_group_count = 0 THEN
    INSERT INTO public.tournament_groups (tournament_id, name, sort_order)
    VALUES (p_tournament_id, 'Liga', 0)
    RETURNING id INTO v_group_id;
  ELSE
    SELECT id
    INTO v_group_id
    FROM public.tournament_groups
    WHERE tournament_id = p_tournament_id
    ORDER BY sort_order, id
    LIMIT 1;
  END IF;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'league group missing after validation';
  END IF;

  IF v_match_count > 0 THEN
    DELETE FROM public.tournament_matches
    WHERE tournament_id = p_tournament_id
      AND (phase = 'group' OR phase IS NULL)
      AND status = 'scheduled'
      AND home_score IS NULL
      AND away_score IS NULL;
  END IF;

  DELETE FROM public.tournament_group_members
  WHERE group_id = v_group_id;

  INSERT INTO public.tournament_group_members (group_id, application_id, external_team_id)
  SELECT
    v_group_id,
    CASE WHEN a.id IS NOT NULL THEN participant_id ELSE NULL END,
    CASE WHEN a.id IS NULL THEN participant_id ELSE NULL END
  FROM unnest(v_ids) AS participant_id
  LEFT JOIN public.applications a
    ON a.id = participant_id
   AND a.tournament_id = p_tournament_id;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_matches)
  LOOP
    v_home_application := NULLIF(btrim(v_item->>'homeApplicationId'), '')::uuid;
    v_home_external := NULLIF(btrim(v_item->>'homeExternalTeamId'), '')::uuid;
    v_away_application := NULLIF(btrim(v_item->>'awayApplicationId'), '')::uuid;
    v_away_external := NULLIF(btrim(v_item->>'awayExternalTeamId'), '')::uuid;
    INSERT INTO public.tournament_matches (
      tournament_id,
      group_id,
      field_id,
      home_application_id,
      home_external_team_id,
      away_application_id,
      away_external_team_id,
      scheduled_at,
      duration_minutes,
      status,
      phase,
      sort_order
    ) VALUES (
      p_tournament_id,
      v_group_id,
      NULLIF(btrim(v_item->>'fieldId'), '')::uuid,
      v_home_application,
      v_home_external,
      v_away_application,
      v_away_external,
      (v_item->>'scheduledAt')::timestamptz,
      (v_item->>'durationMinutes')::integer,
      'scheduled',
      'group',
      (v_item->>'sortOrder')::integer
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  IF v_inserted <> v_expected THEN
    RAISE EXCEPTION 'league match insert count mismatch';
  END IF;

  UPDATE public.tournaments
  SET
    competition_format = 'champions-league',
    league_matches_per_team = p_league_matches_per_team,
    knockout_cutoff = p_knockout_cutoff,
    restrict_same_club = COALESCE(p_restrict_same_club, false)
  WHERE id = p_tournament_id
  RETURNING updated_at, competition_format, league_matches_per_team, knockout_cutoff, restrict_same_club
  INTO v_new_updated_at, v_written_format, v_written_matches, v_written_cutoff, v_written_restrict;

  IF v_new_updated_at IS NULL
    OR v_written_format IS DISTINCT FROM 'champions-league'
    OR v_written_matches IS DISTINCT FROM p_league_matches_per_team
    OR v_written_cutoff IS DISTINCT FROM p_knockout_cutoff
    OR v_written_restrict IS DISTINCT FROM COALESCE(p_restrict_same_club, false)
  THEN
    RAISE EXCEPTION 'league configuration update was not proved';
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'code', NULL,
    'error', NULL,
    'updatedAt', v_new_updated_at,
    'groupId', v_group_id,
    'matchCount', v_inserted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_champions_league_league_phase(uuid, timestamptz, integer, integer, boolean, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_champions_league_league_phase(uuid, timestamptz, integer, integer, boolean, boolean, jsonb) TO authenticated;

COMMENT ON FUNCTION public.apply_champions_league_league_phase(uuid, timestamptz, integer, integer, boolean, boolean, jsonb) IS
  'Transactional Champions League league phase. One group, confirmed participants, validated fixtures. Supports top 4/8/16 and an optional same-club exclusion enforced from authoritative club ids. Does not lift the champions-league rejection inside save_competition_configuration.';

