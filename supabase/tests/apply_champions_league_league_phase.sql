-- Disposable checks for the Champions League league-phase apply.
-- The column-only save function must still reject champions-league.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_setting('app.disposable_competition_test', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Refusing league apply tests without the disposable marker.';
  END IF;
  IF inet_server_addr() <> '127.0.0.1'::inet THEN
    RAISE EXCEPTION 'Refusing non-localhost server %', inet_server_addr();
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.test_pass_league(p_name text, p_detail text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.test_results (suite, name, ok, detail)
  VALUES ('league-apply', p_name, true, p_detail);
END;
$$;

CREATE OR REPLACE FUNCTION public.test_apply_league(
  p_user uuid,
  p_tournament uuid,
  p_expected timestamptz,
  p_matches integer,
  p_cutoff integer,
  p_confirm boolean,
  p_rows jsonb,
  p_restrict boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_user::text, ''), true);
  v_result := public.apply_champions_league_league_phase(
    p_tournament, p_expected, p_matches, p_cutoff, p_restrict, p_confirm, p_rows
  );
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN v_result;
END;
$$;

DO $$
DECLARE
  v_fn text := 'public.apply_champions_league_league_phase(uuid,timestamptz,integer,integer,boolean,boolean,jsonb)';
  v_core text := 'public.apply_champions_league_league_phase_validated_core_v1(uuid,timestamptz,integer,integer,boolean,boolean,jsonb)';
  v_save text := 'public.save_competition_configuration(uuid,timestamptz,text,integer,integer)';
  v_def text;
  v_core_def text;
BEGIN
  IF to_regprocedure(v_fn) IS NULL OR to_regprocedure(v_core) IS NULL THEN
    RAISE EXCEPTION 'FAIL league apply RPC or private core missing';
  END IF;
  v_def := pg_get_functiondef(v_fn::regprocedure);
  v_core_def := pg_get_functiondef(v_core::regprocedure);
  IF position('IN (4, 8, 16)' IN v_core_def) = 0 THEN
    RAISE EXCEPTION 'FAIL league apply does not accept the top 16 cutoff';
  END IF;
  IF position('MISSING_CLUB_IDENTITY' IN v_def) = 0
    OR position('SAME_CLUB_VIOLATION' IN v_def) = 0
  THEN
    RAISE EXCEPTION 'FAIL league apply does not enforce the same-club exclusion';
  END IF;
  IF position('restrict_same_club' IN v_core_def) = 0 THEN
    RAISE EXCEPTION 'FAIL league apply does not persist restrict_same_club';
  END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE')
    OR has_function_privilege('anon', v_fn, 'EXECUTE')
    OR has_function_privilege('service_role', v_fn, 'EXECUTE')
    OR has_function_privilege('public', v_fn, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'FAIL league apply grants';
  END IF;
  IF has_function_privilege('authenticated', v_core, 'EXECUTE')
    OR has_function_privilege('anon', v_core, 'EXECUTE')
    OR has_function_privilege('service_role', v_core, 'EXECUTE')
    OR has_function_privilege('public', v_core, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'FAIL private league core grants';
  END IF;
  IF position('CHAMPIONS_LEAGUE_SAVE_NOT_ACTIVATED' IN pg_get_functiondef(v_save::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'FAIL column-only champions league save gate was removed';
  END IF;
  PERFORM public.test_pass_league('RPC grants and save gate', 'apply is authenticated-only and the column save still rejects champions league');
END
$$;

-- Same-club mode must fail before the private core can create or replace any
-- schedule object. Each canonical participant source is covered explicitly.
DO $$
DECLARE
  v_manager uuid := '11111111-1111-4111-8111-111111111111';
  v_id uuid;
  v_linked_application uuid;
  v_ts timestamptz;
  v_result jsonb;
BEGIN
  v_id := public.test_new_tournament('contract-club-missing-guest-application');
  INSERT INTO public.applications (tournament_id, status, club_id, contact_email)
  VALUES (v_id, 'accepted', NULL, 'missing-club@example.invalid');
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_apply_league(v_manager, v_id, v_ts, 1, 4, false, '[]'::jsonb, true);
  IF v_result->>'code' IS DISTINCT FROM 'MISSING_CLUB_IDENTITY'
    OR EXISTS (SELECT 1 FROM public.tournament_groups WHERE tournament_id = v_id)
    OR EXISTS (SELECT 1 FROM public.tournament_matches WHERE tournament_id = v_id)
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS NOT NULL
  THEN
    RAISE EXCEPTION 'FAIL missing guest-application club identity: %', v_result;
  END IF;
  PERFORM public.test_pass_league(
    'Missing guest-application club identity',
    'MISSING_CLUB_IDENTITY and no partial group, match or configuration write'
  );

  v_id := public.test_new_tournament('contract-club-missing-manual');
  INSERT INTO public.tournament_external_teams (
    tournament_id, external_source, external_id, name,
    participation_status, external_active, club_id
  ) VALUES (
    v_id, 'manual', 'manual-missing-club', 'Manual without club',
    'confirmed', true, NULL
  );
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_apply_league(v_manager, v_id, v_ts, 1, 4, false, '[]'::jsonb, true);
  IF v_result->>'code' IS DISTINCT FROM 'MISSING_CLUB_IDENTITY'
    OR EXISTS (SELECT 1 FROM public.tournament_groups WHERE tournament_id = v_id)
    OR EXISTS (SELECT 1 FROM public.tournament_matches WHERE tournament_id = v_id)
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS NOT NULL
  THEN
    RAISE EXCEPTION 'FAIL missing manual club identity: %', v_result;
  END IF;
  PERFORM public.test_pass_league(
    'Missing manual-team club identity',
    'MISSING_CLUB_IDENTITY and no partial write'
  );

  v_id := public.test_new_tournament('contract-club-missing-mtp');
  INSERT INTO public.tournament_external_teams (
    tournament_id, external_source, external_id, name,
    participation_status, external_active, club_id
  ) VALUES (
    v_id, 'mein-turnierplan', 'mtp-missing-club', 'MTP without club',
    'confirmed', true, NULL
  );
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_apply_league(v_manager, v_id, v_ts, 1, 4, false, '[]'::jsonb, true);
  IF v_result->>'code' IS DISTINCT FROM 'MISSING_CLUB_IDENTITY'
    OR EXISTS (SELECT 1 FROM public.tournament_groups WHERE tournament_id = v_id)
    OR EXISTS (SELECT 1 FROM public.tournament_matches WHERE tournament_id = v_id)
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS NOT NULL
  THEN
    RAISE EXCEPTION 'FAIL missing MTP club identity: %', v_result;
  END IF;
  PERFORM public.test_pass_league(
    'Missing MeinTurnierplan club identity',
    'MISSING_CLUB_IDENTITY and no partial write'
  );

  v_id := public.test_new_tournament('contract-club-missing-linked-pending');
  INSERT INTO public.applications (tournament_id, status, club_id, contact_email)
  VALUES (v_id, 'new', NULL, 'linked-pending@example.invalid')
  RETURNING id INTO v_linked_application;
  INSERT INTO public.tournament_external_teams (
    tournament_id, external_source, external_id, name, application_id,
    participation_status, external_active, club_id
  ) VALUES (
    v_id, 'mein-turnierplan', 'linked-pending-missing-club', 'Linked pending without club',
    v_linked_application, 'confirmed', true, NULL
  );
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_apply_league(v_manager, v_id, v_ts, 1, 4, false, '[]'::jsonb, true);
  IF v_result->>'code' IS DISTINCT FROM 'MISSING_CLUB_IDENTITY'
    OR EXISTS (SELECT 1 FROM public.tournament_groups WHERE tournament_id = v_id)
    OR EXISTS (SELECT 1 FROM public.tournament_matches WHERE tournament_id = v_id)
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS NOT NULL
  THEN
    RAISE EXCEPTION 'FAIL linked non-accepted application club identity: %', v_result;
  END IF;
  PERFORM public.test_pass_league(
    'Linked non-accepted application club identity',
    'external participant remains canonical, fails closed and writes nothing'
  );
END
$$;

DO $$
DECLARE
  v_manager uuid := '11111111-1111-4111-8111-111111111111';
  v_id uuid := public.test_new_tournament('contract-club-registered-violation');
  v_club_same uuid;
  v_club_three uuid;
  v_club_four uuid;
  v_apps uuid[] := ARRAY[]::uuid[];
  v_app uuid;
  v_field uuid;
  v_ts timestamptz;
  v_rows jsonb;
  v_result jsonb;
BEGIN
  INSERT INTO public.clubs (name) VALUES ('Contract same club') RETURNING id INTO v_club_same;
  INSERT INTO public.clubs (name) VALUES ('Contract club three') RETURNING id INTO v_club_three;
  INSERT INTO public.clubs (name) VALUES ('Contract club four') RETURNING id INTO v_club_four;

  INSERT INTO public.applications (tournament_id, status, club_id)
  VALUES (v_id, 'accepted', v_club_same) RETURNING id INTO v_app;
  v_apps := array_append(v_apps, v_app);
  INSERT INTO public.applications (tournament_id, status, club_id)
  VALUES (v_id, 'accepted', v_club_same) RETURNING id INTO v_app;
  v_apps := array_append(v_apps, v_app);
  INSERT INTO public.applications (tournament_id, status, club_id)
  VALUES (v_id, 'accepted', v_club_three) RETURNING id INTO v_app;
  v_apps := array_append(v_apps, v_app);
  INSERT INTO public.applications (tournament_id, status, club_id)
  VALUES (v_id, 'accepted', v_club_four) RETURNING id INTO v_app;
  v_apps := array_append(v_apps, v_app);
  INSERT INTO public.tournament_fields (tournament_id, name)
  VALUES (v_id, 'Platz 1') RETURNING id INTO v_field;

  v_rows := jsonb_build_array(
    jsonb_build_object(
      'homeApplicationId', v_apps[1], 'homeExternalTeamId', NULL,
      'awayApplicationId', v_apps[2], 'awayExternalTeamId', NULL,
      'fieldId', v_field, 'scheduledAt', '2026-11-25T09:00:00+01',
      'durationMinutes', 12, 'sortOrder', 0
    ),
    jsonb_build_object(
      'homeApplicationId', v_apps[3], 'homeExternalTeamId', NULL,
      'awayApplicationId', v_apps[4], 'awayExternalTeamId', NULL,
      'fieldId', v_field, 'scheduledAt', '2026-11-25T09:20:00+01',
      'durationMinutes', 12, 'sortOrder', 1
    )
  );
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_apply_league(v_manager, v_id, v_ts, 1, 4, false, v_rows, true);
  IF v_result->>'code' IS DISTINCT FROM 'SAME_CLUB_VIOLATION'
    OR EXISTS (SELECT 1 FROM public.tournament_groups WHERE tournament_id = v_id)
    OR EXISTS (SELECT 1 FROM public.tournament_matches WHERE tournament_id = v_id)
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS NOT NULL
  THEN
    RAISE EXCEPTION 'FAIL registered same-club violation: %', v_result;
  END IF;
  PERFORM public.test_pass_league(
    'Registered-club same-club violation',
    'SAME_CLUB_VIOLATION is authoritative and leaves no partial schedule'
  );
END
$$;

SELECT set_config('app.test_id', public.test_new_tournament('contract-league-save-gate')::text, false);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_ts timestamptz;
  v_result jsonb;
  v_i integer;
BEGIN
  FOR v_i IN 1..4 LOOP
    INSERT INTO public.applications (tournament_id, status, contact_email) VALUES (v_id, 'accepted', 'league-test@example.invalid');
  END LOOP;
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_save(
    '11111111-1111-4111-8111-111111111111', v_id, v_ts, 'champions-league', 1, 4
  );
  IF v_result->>'code' IS DISTINCT FROM 'CHAMPIONS_LEAGUE_SAVE_NOT_ACTIVATED'
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS NOT NULL
  THEN
    RAISE EXCEPTION 'FAIL column-only save still rejected: %', v_result;
  END IF;
  PERFORM public.test_pass_league('Column-only save stays closed', v_result->>'code');
END
$$;

SELECT set_config('app.test_id', public.test_new_tournament('contract-league-apply')::text, false);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_apps uuid[] := ARRAY[]::uuid[];
  v_app uuid;
  v_field uuid;
  v_ts timestamptz;
  v_result jsonb;
  v_rows jsonb;
  v_group uuid;
  v_manager uuid := '11111111-1111-4111-8111-111111111111';
  v_i integer;
BEGIN
  FOR v_i IN 1..4 LOOP
    INSERT INTO public.applications (tournament_id, status, contact_email)
    VALUES (v_id, 'accepted', 'league-test@example.invalid')
    RETURNING id INTO v_app;
    v_apps := array_append(v_apps, v_app);
  END LOOP;
  INSERT INTO public.tournament_fields (tournament_id, name)
  VALUES (v_id, 'Platz 1')
  RETURNING id INTO v_field;
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'homeApplicationId', v_apps[1], 'homeExternalTeamId', NULL,
      'awayApplicationId', v_apps[2], 'awayExternalTeamId', NULL,
      'fieldId', v_field, 'scheduledAt', '2026-11-22T09:00:00+01',
      'durationMinutes', 12, 'sortOrder', 0
    ),
    jsonb_build_object(
      'homeApplicationId', v_apps[3], 'homeExternalTeamId', NULL,
      'awayApplicationId', v_apps[4], 'awayExternalTeamId', NULL,
      'fieldId', v_field, 'scheduledAt', '2026-11-22T09:20:00+01',
      'durationMinutes', 12, 'sortOrder', 1
    )
  );
  v_result := public.test_apply_league(
    '33333333-3333-4333-8333-333333333333', v_id, v_ts, 1, 4, false, v_rows
  );
  IF v_result->>'code' IS DISTINCT FROM 'FORBIDDEN'
    OR (SELECT count(*) FROM public.tournament_groups WHERE tournament_id = v_id) <> 0
  THEN
    RAISE EXCEPTION 'FAIL schedule-only permission: %', v_result;
  END IF;

  v_result := public.test_apply_league(v_manager, v_id, TIMESTAMPTZ '2000-01-01', 1, 4, false, v_rows);
  IF v_result->>'code' IS DISTINCT FROM 'STALE_CONFIGURATION' THEN
    RAISE EXCEPTION 'FAIL stale league apply: %', v_result;
  END IF;

  v_result := public.test_apply_league(v_manager, v_id, v_ts, 1, 4, false, v_rows);
  IF v_result->>'status' IS DISTINCT FROM 'success' THEN
    RAISE EXCEPTION 'FAIL league apply: %', v_result;
  END IF;
  v_group := (v_result->>'groupId')::uuid;
  IF v_group IS NULL
    OR (SELECT count(*) FROM public.tournament_groups WHERE tournament_id = v_id) <> 1
    OR (SELECT count(*) FROM public.tournament_group_members WHERE group_id = v_group) <> 4
    OR (SELECT count(*) FROM public.tournament_matches WHERE tournament_id = v_id AND group_id = v_group) <> 2
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS DISTINCT FROM 'champions-league'
    OR (SELECT league_matches_per_team FROM public.tournaments WHERE id = v_id) IS DISTINCT FROM 1
    OR (SELECT knockout_cutoff FROM public.tournaments WHERE id = v_id) IS DISTINCT FROM 4
  THEN
    RAISE EXCEPTION 'FAIL persisted league shape: %', v_result;
  END IF;
  IF (
    SELECT count(DISTINCT side)
    FROM (
      SELECT home_application_id AS side FROM public.tournament_matches WHERE tournament_id = v_id
      UNION ALL
      SELECT away_application_id FROM public.tournament_matches WHERE tournament_id = v_id
    ) sides
  ) <> 4 THEN
    RAISE EXCEPTION 'FAIL not every team received one opponent';
  END IF;

  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_apply_league(v_manager, v_id, v_ts, 1, 4, false, v_rows);
  IF v_result->>'status' IS DISTINCT FROM 'confirmation_required'
    OR (SELECT count(*) FROM public.tournament_matches WHERE tournament_id = v_id) <> 2
  THEN
    RAISE EXCEPTION 'FAIL replace confirmation: %', v_result;
  END IF;

  v_result := public.test_save(v_manager, v_id, v_ts, 'champions-league', 3, 4);
  IF v_result->>'code' IS DISTINCT FROM 'UNVERIFIED_LEAGUE_GROUP'
    OR (SELECT league_matches_per_team FROM public.tournaments WHERE id = v_id) IS DISTINCT FROM 1
    OR (SELECT count(*) FROM public.tournament_matches WHERE tournament_id = v_id) <> 2
  THEN
    RAISE EXCEPTION 'FAIL column save did not stay closed after the league group existed: %', v_result;
  END IF;
  PERFORM public.test_pass_league('Persistent league phase', 'one group, four members, two real-id matches, column save still closed');
END
$$;

SELECT set_config('app.test_id', public.test_new_tournament('contract-league-results')::text, false);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_home uuid;
  v_away uuid;
  v_match uuid;
  v_field uuid;
  v_ts timestamptz;
  v_result jsonb;
  v_rows jsonb;
BEGIN
  INSERT INTO public.applications (tournament_id, status, contact_email) VALUES (v_id, 'accepted', 'league-test@example.invalid') RETURNING id INTO v_home;
  INSERT INTO public.applications (tournament_id, status, contact_email) VALUES (v_id, 'accepted', 'league-test@example.invalid') RETURNING id INTO v_away;
  INSERT INTO public.applications (tournament_id, status, contact_email) VALUES (v_id, 'accepted', 'league-test@example.invalid');
  INSERT INTO public.applications (tournament_id, status, contact_email) VALUES (v_id, 'accepted', 'league-test@example.invalid');
  INSERT INTO public.tournament_fields (tournament_id, name) VALUES (v_id, 'Platz 1') RETURNING id INTO v_field;
  INSERT INTO public.tournament_matches (
    tournament_id, phase, status, home_application_id, away_application_id, home_score, away_score, field_id
  ) VALUES (
    v_id, 'group', 'completed', v_home, v_away, 1, 0, v_field
  ) RETURNING id INTO v_match;
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'homeApplicationId', v_home, 'awayApplicationId', v_away,
      'fieldId', v_field, 'scheduledAt', '2026-11-22T09:00:00+01',
      'durationMinutes', 12, 'sortOrder', 0
    )
  );
  v_result := public.test_apply_league(
    '11111111-1111-4111-8111-111111111111', v_id, v_ts, 1, 4, true, v_rows
  );
  IF v_result->>'code' IS DISTINCT FROM 'RESULTS_EXIST'
    OR (SELECT home_score FROM public.tournament_matches WHERE id = v_match) IS DISTINCT FROM 1
    OR (SELECT away_score FROM public.tournament_matches WHERE id = v_match) IS DISTINCT FROM 0
    OR (SELECT count(*) FROM public.tournament_matches WHERE tournament_id = v_id) <> 1
    OR (SELECT count(*) FROM public.tournament_groups WHERE tournament_id = v_id) <> 0
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS NOT NULL
  THEN
    RAISE EXCEPTION 'FAIL played match protection: %', v_result;
  END IF;
  PERFORM public.test_pass_league('Played matches are not overwritten', 'RESULTS_EXIST');
END
$$;

SELECT set_config('app.test_id', public.test_new_tournament('contract-league-legacy')::text, false);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_ts timestamptz;
  v_result jsonb;
  v_manager uuid := '11111111-1111-4111-8111-111111111111';
BEGIN
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_save(v_manager, v_id, v_ts, 'round-robin', NULL, NULL);
  IF v_result->>'status' IS DISTINCT FROM 'success' THEN
    RAISE EXCEPTION 'FAIL legacy setup: %', v_result;
  END IF;
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_apply_league(v_manager, v_id, v_ts, 1, 4, false, '[]'::jsonb);
  IF v_result->>'code' IS DISTINCT FROM 'LEGACY_FORMAT'
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS DISTINCT FROM 'round-robin'
    OR (SELECT count(*) FROM public.tournament_groups WHERE tournament_id = v_id) <> 0
  THEN
    RAISE EXCEPTION 'FAIL legacy format protection: %', v_result;
  END IF;
  PERFORM public.test_pass_league('Legacy format is unchanged', 'LEGACY_FORMAT');
END
$$;

SELECT set_config('app.test_id', public.test_new_tournament('contract-league-uneven')::text, false);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_ts timestamptz;
  v_result jsonb;
  v_i integer;
BEGIN
  FOR v_i IN 1..3 LOOP
    INSERT INTO public.applications (tournament_id, status, contact_email) VALUES (v_id, 'accepted', 'league-test@example.invalid');
  END LOOP;
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_apply_league(
    '11111111-1111-4111-8111-111111111111', v_id, v_ts, 1, 4, false, '[]'::jsonb
  );
  IF v_result->>'code' IS DISTINCT FROM 'UNEVEN_MATCH_TOTAL'
    OR (SELECT count(*) FROM public.tournament_groups WHERE tournament_id = v_id) <> 0
  THEN
    RAISE EXCEPTION 'FAIL uneven league rejected: %', v_result;
  END IF;
  PERFORM public.test_pass_league('Uneven league rejected', 'UNEVEN_MATCH_TOTAL');
END
$$;

SELECT set_config('app.test_id', public.test_new_tournament('contract-league-external')::text, false);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_ext uuid[] := ARRAY[]::uuid[];
  v_team uuid;
  v_field uuid;
  v_ts timestamptz;
  v_result jsonb;
  v_rows jsonb;
  v_group uuid;
  v_manager uuid := '11111111-1111-4111-8111-111111111111';
  v_i integer;
BEGIN
  FOR v_i IN 1..4 LOOP
    INSERT INTO public.tournament_external_teams (
      tournament_id, external_id, name, participation_status, external_active
    ) VALUES (
      v_id, 'solo-' || v_i, 'Solo ' || v_i, 'confirmed', true
    ) RETURNING id INTO v_team;
    v_ext := array_append(v_ext, v_team);
  END LOOP;
  INSERT INTO public.tournament_fields (tournament_id, name)
  VALUES (v_id, 'Platz 1')
  RETURNING id INTO v_field;
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'homeApplicationId', NULL, 'homeExternalTeamId', v_ext[1],
      'awayApplicationId', NULL, 'awayExternalTeamId', v_ext[2],
      'fieldId', v_field, 'scheduledAt', '2026-11-22T09:00:00+01',
      'durationMinutes', 12, 'sortOrder', 0
    ),
    jsonb_build_object(
      'homeApplicationId', NULL, 'homeExternalTeamId', v_ext[3],
      'awayApplicationId', NULL, 'awayExternalTeamId', v_ext[4],
      'fieldId', v_field, 'scheduledAt', '2026-11-22T09:20:00+01',
      'durationMinutes', 12, 'sortOrder', 1
    )
  );
  v_result := public.test_apply_league(v_manager, v_id, v_ts, 1, 4, false, v_rows);
  v_group := NULLIF(v_result->>'groupId', '')::uuid;
  IF v_result->>'status' IS DISTINCT FROM 'success'
    OR v_group IS NULL
    OR (SELECT count(*) FROM public.tournament_group_members WHERE group_id = v_group) <> 4
    OR (SELECT count(*) FROM public.tournament_group_members WHERE group_id = v_group AND application_id IS NULL AND external_team_id IS NOT NULL) <> 4
    OR (SELECT count(*) FROM public.tournament_matches WHERE tournament_id = v_id AND home_external_team_id IS NOT NULL AND home_application_id IS NULL) <> 2
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS DISTINCT FROM 'champions-league'
  THEN
    RAISE EXCEPTION 'FAIL confirmed external team without application: %', v_result;
  END IF;
  PERFORM public.test_pass_league('Confirmed external team without application', 'external id only, four members, two matches');
END
$$;

SELECT set_config('app.test_id', public.test_new_tournament('contract-league-linked-accepted')::text, false);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_apps uuid[] := ARRAY[]::uuid[];
  v_app uuid;
  v_ext uuid;
  v_field uuid;
  v_ts timestamptz;
  v_result jsonb;
  v_rows jsonb;
  v_group uuid;
  v_manager uuid := '11111111-1111-4111-8111-111111111111';
  v_i integer;
BEGIN
  FOR v_i IN 1..4 LOOP
    INSERT INTO public.applications (tournament_id, status, contact_email)
    VALUES (v_id, 'accepted', 'league-test@example.invalid')
    RETURNING id INTO v_app;
    v_apps := array_append(v_apps, v_app);
  END LOOP;
  INSERT INTO public.tournament_external_teams (
    tournament_id, external_id, name, participation_status, external_active, application_id
  ) VALUES (
    v_id, 'linked-accepted', 'Linked accepted', 'confirmed', true, v_apps[1]
  ) RETURNING id INTO v_ext;
  INSERT INTO public.tournament_fields (tournament_id, name)
  VALUES (v_id, 'Platz 1')
  RETURNING id INTO v_field;
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'homeApplicationId', v_apps[1], 'homeExternalTeamId', NULL,
      'awayApplicationId', v_apps[2], 'awayExternalTeamId', NULL,
      'fieldId', v_field, 'scheduledAt', '2026-11-22T09:00:00+01',
      'durationMinutes', 12, 'sortOrder', 0
    ),
    jsonb_build_object(
      'homeApplicationId', v_apps[3], 'homeExternalTeamId', NULL,
      'awayApplicationId', v_apps[4], 'awayExternalTeamId', NULL,
      'fieldId', v_field, 'scheduledAt', '2026-11-22T09:20:00+01',
      'durationMinutes', 12, 'sortOrder', 1
    )
  );
  v_result := public.test_apply_league(v_manager, v_id, v_ts, 1, 4, false, v_rows);
  v_group := NULLIF(v_result->>'groupId', '')::uuid;
  IF v_result->>'status' IS DISTINCT FROM 'success'
    OR (SELECT count(*) FROM public.tournament_group_members WHERE group_id = v_group) <> 4
    OR EXISTS (
      SELECT 1 FROM public.tournament_group_members
      WHERE group_id = v_group AND external_team_id = v_ext
    )
    OR (SELECT count(*) FROM public.tournament_matches WHERE tournament_id = v_id) <> 2
  THEN
    RAISE EXCEPTION 'FAIL external team linked to an accepted application: %', v_result;
  END IF;
  PERFORM public.test_pass_league('External team linked to an accepted application', 'application id is the only member');
END
$$;

SELECT set_config('app.test_id', public.test_new_tournament('contract-league-linked-pending')::text, false);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_apps uuid[] := ARRAY[]::uuid[];
  v_app uuid;
  v_pending uuid;
  v_ext uuid;
  v_field uuid;
  v_ts timestamptz;
  v_result jsonb;
  v_rows jsonb;
  v_group uuid;
  v_manager uuid := '11111111-1111-4111-8111-111111111111';
  v_i integer;
BEGIN
  FOR v_i IN 1..3 LOOP
    INSERT INTO public.applications (tournament_id, status, contact_email)
    VALUES (v_id, 'accepted', 'league-test@example.invalid')
    RETURNING id INTO v_app;
    v_apps := array_append(v_apps, v_app);
  END LOOP;
  INSERT INTO public.applications (tournament_id, status, contact_email) VALUES (v_id, 'new', 'league-pending@example.invalid') RETURNING id INTO v_pending;
  INSERT INTO public.tournament_external_teams (
    tournament_id, external_id, name, participation_status, external_active, application_id
  ) VALUES (
    v_id, 'linked-pending', 'Linked pending', 'confirmed', true, v_pending
  ) RETURNING id INTO v_ext;
  INSERT INTO public.tournament_fields (tournament_id, name)
  VALUES (v_id, 'Platz 1')
  RETURNING id INTO v_field;
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'homeApplicationId', v_apps[1], 'homeExternalTeamId', NULL,
      'awayApplicationId', v_apps[2], 'awayExternalTeamId', NULL,
      'fieldId', v_field, 'scheduledAt', '2026-11-22T09:00:00+01',
      'durationMinutes', 12, 'sortOrder', 0
    ),
    jsonb_build_object(
      'homeApplicationId', v_pending, 'homeExternalTeamId', v_ext,
      'awayApplicationId', v_apps[3], 'awayExternalTeamId', NULL,
      'fieldId', v_field, 'scheduledAt', '2026-11-22T09:20:00+01',
      'durationMinutes', 12, 'sortOrder', 1
    )
  );
  v_result := public.test_apply_league(v_manager, v_id, v_ts, 1, 4, false, v_rows);
  IF v_result->>'code' IS DISTINCT FROM 'INVALID_PARTICIPANT_IDENTITY'
    OR (SELECT count(*) FROM public.tournament_groups WHERE tournament_id = v_id) <> 0
    OR (SELECT count(*) FROM public.tournament_matches WHERE tournament_id = v_id) <> 0
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS NOT NULL
  THEN
    RAISE EXCEPTION 'FAIL both identities wrote nothing: %', v_result;
  END IF;

  v_rows := jsonb_build_array(
    jsonb_build_object(
      'homeApplicationId', v_apps[1], 'homeExternalTeamId', NULL,
      'awayApplicationId', v_apps[2], 'awayExternalTeamId', NULL,
      'fieldId', v_field, 'scheduledAt', '2026-11-22T09:00:00+01',
      'durationMinutes', 12, 'sortOrder', 0
    ),
    jsonb_build_object(
      'homeApplicationId', NULL, 'homeExternalTeamId', v_ext,
      'awayApplicationId', v_apps[3], 'awayExternalTeamId', NULL,
      'fieldId', v_field, 'scheduledAt', '2026-11-22T09:20:00+01',
      'durationMinutes', 12, 'sortOrder', 1
    )
  );
  v_result := public.test_apply_league(v_manager, v_id, v_ts, 1, 4, false, v_rows);
  v_group := NULLIF(v_result->>'groupId', '')::uuid;
  IF v_result->>'status' IS DISTINCT FROM 'success'
    OR (SELECT count(*) FROM public.tournament_group_members WHERE group_id = v_group AND application_id IS NOT NULL) <> 3
    OR (SELECT count(*) FROM public.tournament_group_members WHERE group_id = v_group AND external_team_id = v_ext AND application_id IS NULL) <> 1
    OR EXISTS (
      SELECT 1 FROM public.tournament_group_members
      WHERE group_id = v_group AND application_id = v_pending
    )
    OR EXISTS (
      SELECT 1 FROM public.tournament_matches
      WHERE tournament_id = v_id
        AND (home_application_id = v_pending OR away_application_id = v_pending)
    )
    OR (SELECT count(*) FROM public.tournament_matches WHERE tournament_id = v_id AND home_external_team_id = v_ext) <> 1
  THEN
    RAISE EXCEPTION 'FAIL external team linked to a non-accepted application: %', v_result;
  END IF;
  PERFORM public.test_pass_league('External team linked to a non-accepted application', 'external id persisted, pending application omitted, both-id payload wrote nothing');
END
$$;

SELECT set_config('app.test_id', public.test_new_tournament('contract-league-inactive-external')::text, false);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_apps uuid[] := ARRAY[]::uuid[];
  v_app uuid;
  v_null_ext uuid;
  v_false_ext uuid;
  v_field uuid;
  v_ts timestamptz;
  v_result jsonb;
  v_rows jsonb;
  v_group uuid;
  v_manager uuid := '11111111-1111-4111-8111-111111111111';
  v_i integer;
BEGIN
  ALTER TABLE public.tournament_external_teams ALTER COLUMN external_active DROP NOT NULL;
  FOR v_i IN 1..4 LOOP
    INSERT INTO public.applications (tournament_id, status, contact_email)
    VALUES (v_id, 'accepted', 'league-test@example.invalid')
    RETURNING id INTO v_app;
    v_apps := array_append(v_apps, v_app);
  END LOOP;
  INSERT INTO public.tournament_external_teams (
    tournament_id, external_id, name, participation_status, external_active
  ) VALUES (
    v_id, 'null-active', 'Null active', 'confirmed', NULL
  ) RETURNING id INTO v_null_ext;
  INSERT INTO public.tournament_external_teams (
    tournament_id, external_id, name, participation_status, external_active
  ) VALUES (
    v_id, 'false-active', 'False active', 'confirmed', false
  ) RETURNING id INTO v_false_ext;
  INSERT INTO public.tournament_fields (tournament_id, name)
  VALUES (v_id, 'Platz 1')
  RETURNING id INTO v_field;
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'homeApplicationId', v_apps[1], 'homeExternalTeamId', NULL,
      'awayApplicationId', v_apps[2], 'awayExternalTeamId', NULL,
      'fieldId', v_field, 'scheduledAt', '2026-11-22T09:00:00+01',
      'durationMinutes', 12, 'sortOrder', 0
    ),
    jsonb_build_object(
      'homeApplicationId', v_apps[3], 'homeExternalTeamId', NULL,
      'awayApplicationId', v_apps[4], 'awayExternalTeamId', NULL,
      'fieldId', v_field, 'scheduledAt', '2026-11-22T09:20:00+01',
      'durationMinutes', 12, 'sortOrder', 1
    )
  );
  v_result := public.test_apply_league(v_manager, v_id, v_ts, 1, 4, false, v_rows);
  v_group := NULLIF(v_result->>'groupId', '')::uuid;
  IF v_result->>'status' IS DISTINCT FROM 'success'
    OR (SELECT count(*) FROM public.tournament_group_members WHERE group_id = v_group) <> 4
    OR EXISTS (
      SELECT 1 FROM public.tournament_group_members
      WHERE group_id = v_group AND external_team_id IN (v_null_ext, v_false_ext)
    )
    OR (SELECT count(*) FROM public.tournament_matches WHERE tournament_id = v_id) <> 2
  THEN
    RAISE EXCEPTION 'FAIL null or false external_active was counted: %', v_result;
  END IF;
  DELETE FROM public.tournament_external_teams WHERE id = v_null_ext;
  ALTER TABLE public.tournament_external_teams ALTER COLUMN external_active SET NOT NULL;
  PERFORM public.test_pass_league('Null and false external activity', 'neither inactive external team became a member');
END
$$;

SELECT set_config('app.test_id', public.test_new_tournament('contract-league-duplicate-identity')::text, false);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_app uuid;
  v_ts timestamptz;
  v_result jsonb;
BEGIN
  INSERT INTO public.applications (tournament_id, status, contact_email)
  VALUES (v_id, 'accepted', 'league-test@example.invalid')
  RETURNING id INTO v_app;
  INSERT INTO public.tournament_external_teams (
    id, tournament_id, external_id, name, participation_status, external_active
  ) VALUES (
    v_app, v_id, 'duplicate-canonical', 'Duplicate', 'confirmed', true
  );
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_apply_league(
    '11111111-1111-4111-8111-111111111111', v_id, v_ts, 1, 4, false, '[]'::jsonb
  );
  IF v_result->>'code' IS DISTINCT FROM 'DUPLICATE_PARTICIPANT'
    OR (SELECT count(*) FROM public.tournament_groups WHERE tournament_id = v_id) <> 0
    OR (SELECT count(*) FROM public.tournament_matches WHERE tournament_id = v_id) <> 0
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS NOT NULL
  THEN
    RAISE EXCEPTION 'FAIL duplicate canonical identity: %', v_result;
  END IF;
  PERFORM public.test_pass_league('Duplicate canonical identities', 'DUPLICATE_PARTICIPANT and no rows');
END
$$;

SELECT set_config('app.test_id', public.test_new_tournament('contract-league-replace')::text, false);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_apps uuid[] := ARRAY[]::uuid[];
  v_app uuid;
  v_field uuid;
  v_ts timestamptz;
  v_result jsonb;
  v_rows jsonb;
  v_old uuid[];
  v_manager uuid := '11111111-1111-4111-8111-111111111111';
  v_i integer;
BEGIN
  FOR v_i IN 1..4 LOOP
    INSERT INTO public.applications (tournament_id, status, contact_email)
    VALUES (v_id, 'accepted', 'league-test@example.invalid')
    RETURNING id INTO v_app;
    v_apps := array_append(v_apps, v_app);
  END LOOP;
  INSERT INTO public.tournament_fields (tournament_id, name)
  VALUES (v_id, 'Platz 1')
  RETURNING id INTO v_field;
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'homeApplicationId', v_apps[1], 'homeExternalTeamId', NULL,
      'awayApplicationId', v_apps[2], 'awayExternalTeamId', NULL,
      'fieldId', v_field, 'scheduledAt', '2026-11-22T09:00:00+01',
      'durationMinutes', 12, 'sortOrder', 0
    ),
    jsonb_build_object(
      'homeApplicationId', v_apps[3], 'homeExternalTeamId', NULL,
      'awayApplicationId', v_apps[4], 'awayExternalTeamId', NULL,
      'fieldId', v_field, 'scheduledAt', '2026-11-22T09:20:00+01',
      'durationMinutes', 12, 'sortOrder', 1
    )
  );
  v_result := public.test_apply_league(v_manager, v_id, v_ts, 1, 4, false, v_rows);
  IF v_result->>'status' IS DISTINCT FROM 'success' THEN
    RAISE EXCEPTION 'FAIL replace setup: %', v_result;
  END IF;
  SELECT array_agg(id), max(updated_at) INTO v_old, v_ts
  FROM (
    SELECT m.id, t.updated_at
    FROM public.tournament_matches m
    JOIN public.tournaments t ON t.id = m.tournament_id
    WHERE m.tournament_id = v_id
  ) current_rows;
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'homeApplicationId', v_apps[1], 'homeExternalTeamId', NULL,
      'awayApplicationId', v_apps[3], 'awayExternalTeamId', NULL,
      'fieldId', v_field, 'scheduledAt', '2026-11-22T10:00:00+01',
      'durationMinutes', 12, 'sortOrder', 0
    ),
    jsonb_build_object(
      'homeApplicationId', v_apps[2], 'homeExternalTeamId', NULL,
      'awayApplicationId', v_apps[4], 'awayExternalTeamId', NULL,
      'fieldId', v_field, 'scheduledAt', '2026-11-22T10:20:00+01',
      'durationMinutes', 12, 'sortOrder', 1
    )
  );
  v_result := public.test_apply_league(v_manager, v_id, v_ts, 1, 4, true, v_rows);
  IF v_result->>'status' IS DISTINCT FROM 'success'
    OR (SELECT count(*) FROM public.tournament_matches WHERE id = ANY (v_old)) <> 0
    OR (SELECT count(*) FROM public.tournament_matches WHERE tournament_id = v_id) <> 2
    OR (SELECT count(*) FROM public.tournament_groups WHERE tournament_id = v_id) <> 1
    OR (SELECT count(*) FROM public.tournament_matches WHERE tournament_id = v_id AND home_score IS NULL AND away_score IS NULL AND status = 'scheduled') <> 2
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS DISTINCT FROM 'champions-league'
    OR EXISTS (
      SELECT 1 FROM public.tournament_matches
      WHERE tournament_id = v_id
        AND home_application_id = v_apps[1]
        AND away_application_id = v_apps[2]
    )
  THEN
    RAISE EXCEPTION 'FAIL confirmed replacement: % old %', v_result, v_old;
  END IF;
  PERFORM public.test_pass_league('Confirmed replacement of unplayed fixtures', 'old match ids removed, two new scheduled matches kept');
END
$$;

SELECT set_config('app.test_id', public.test_new_tournament('contract-league-sixteen')::text, false);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_apps uuid[] := ARRAY[]::uuid[];
  v_circle uuid[];
  v_app uuid;
  v_field uuid;
  v_left uuid;
  v_right uuid;
  v_home uuid;
  v_away uuid;
  v_ts timestamptz;
  v_result jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_group uuid;
  v_match uuid;
  v_manager uuid := '11111111-1111-4111-8111-111111111111';
  v_round integer;
  v_index integer;
  v_sort integer := 0;
BEGIN
  FOR v_index IN 1..16 LOOP
    INSERT INTO public.applications (tournament_id, status, contact_email)
    VALUES (v_id, 'accepted', 'league-test@example.invalid')
    RETURNING id INTO v_app;
    v_apps := array_append(v_apps, v_app);
  END LOOP;
  INSERT INTO public.tournament_fields (tournament_id, name)
  VALUES (v_id, 'Platz 1')
  RETURNING id INTO v_field;

  v_circle := v_apps;
  FOR v_round IN 0..3 LOOP
    FOR v_index IN 0..7 LOOP
      v_left := v_circle[v_index + 1];
      v_right := v_circle[16 - v_index];
      IF v_round % 2 = 0 THEN
        v_home := v_left;
        v_away := v_right;
      ELSE
        v_home := v_right;
        v_away := v_left;
      END IF;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'homeApplicationId', v_home,
        'homeExternalTeamId', NULL,
        'awayApplicationId', v_away,
        'awayExternalTeamId', NULL,
        'fieldId', v_field,
        'scheduledAt', to_char(
          TIMESTAMPTZ '2026-11-22 09:00:00+01' + (v_sort * INTERVAL '15 minutes'),
          'YYYY-MM-DD"T"HH24:MI:SSOF'
        ),
        'durationMinutes', 12,
        'sortOrder', v_sort
      ));
      v_sort := v_sort + 1;
    END LOOP;
    IF v_round < 3 THEN
      v_circle := ARRAY[v_circle[1], v_circle[16]] || v_circle[2:15];
    END IF;
  END LOOP;

  IF jsonb_array_length(v_rows) <> 32 THEN
    RAISE EXCEPTION 'FAIL sixteen-team circle schedule length %', jsonb_array_length(v_rows);
  END IF;

  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_apply_league(v_manager, v_id, v_ts, 4, 8, false, v_rows);
  v_group := NULLIF(v_result->>'groupId', '')::uuid;
  IF v_result->>'status' IS DISTINCT FROM 'success'
    OR v_group IS NULL
    OR (SELECT name FROM public.tournament_groups WHERE id = v_group) IS DISTINCT FROM 'Liga'
    OR (SELECT count(*) FROM public.tournament_groups WHERE tournament_id = v_id) <> 1
    OR (SELECT count(*) FROM public.tournament_group_members WHERE group_id = v_group AND application_id = ANY (v_apps) AND external_team_id IS NULL) <> 16
    OR (SELECT count(*) FROM public.tournament_matches WHERE tournament_id = v_id AND group_id = v_group AND phase = 'group') <> 32
    OR (SELECT league_matches_per_team FROM public.tournaments WHERE id = v_id) IS DISTINCT FROM 4
    OR (SELECT knockout_cutoff FROM public.tournaments WHERE id = v_id) IS DISTINCT FROM 8
    OR EXISTS (
      SELECT 1
      FROM (
        SELECT side, count(*) AS games
        FROM (
          SELECT home_application_id AS side FROM public.tournament_matches WHERE tournament_id = v_id
          UNION ALL
          SELECT away_application_id FROM public.tournament_matches WHERE tournament_id = v_id
        ) sides
        GROUP BY side
      ) degrees
      WHERE games IS DISTINCT FROM 4
    )
    OR (
      SELECT count(*)
      FROM (
        SELECT DISTINCT LEAST(home_application_id, away_application_id), GREATEST(home_application_id, away_application_id)
        FROM public.tournament_matches
        WHERE tournament_id = v_id
      ) pairs
    ) IS DISTINCT FROM 32
  THEN
    RAISE EXCEPTION 'FAIL sixteen-team league shape: %', v_result;
  END IF;

  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_apply_league(v_manager, v_id, v_ts, 4, 8, false, v_rows);
  IF v_result->>'status' IS DISTINCT FROM 'confirmation_required'
    OR (SELECT count(*) FROM public.tournament_matches WHERE tournament_id = v_id) <> 32
  THEN
    RAISE EXCEPTION 'FAIL sixteen-team replacement guard: %', v_result;
  END IF;

  SELECT id INTO v_match
  FROM public.tournament_matches
  WHERE tournament_id = v_id
  ORDER BY sort_order, id
  LIMIT 1;
  UPDATE public.tournament_matches
  SET status = 'completed', home_score = 3, away_score = 1
  WHERE id = v_match;
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_apply_league(v_manager, v_id, v_ts, 4, 8, true, v_rows);
  IF v_result->>'code' IS DISTINCT FROM 'RESULTS_EXIST'
    OR (SELECT home_score FROM public.tournament_matches WHERE id = v_match) IS DISTINCT FROM 3
    OR (SELECT away_score FROM public.tournament_matches WHERE id = v_match) IS DISTINCT FROM 1
    OR (SELECT count(*) FROM public.tournament_matches WHERE tournament_id = v_id) <> 32
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS DISTINCT FROM 'champions-league'
  THEN
    RAISE EXCEPTION 'FAIL sixteen-team result preservation: %', v_result;
  END IF;

  PERFORM public.test_pass_league(
    'Sixteen teams, four opponents',
    'one Liga group, 16 members, 32 distinct matches, unplayed replace blocked, played 3:1 preserved'
  );
END
$$;
