-- Executable disposable-database contract tests.
-- Refuses to run unless this database opted into the isolated marker.
-- Concurrency cases are executed by scripts/competition-postgres/concurrency.mjs.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_setting('app.disposable_competition_test', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION
      'Refusing to run save_competition_configuration tests without app.disposable_competition_test=on on a disposable database.';
  END IF;
  IF inet_server_addr() <> '127.0.0.1'::inet THEN
    RAISE EXCEPTION 'Refusing non-localhost server %', inet_server_addr();
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.test_results (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  suite text NOT NULL,
  name text NOT NULL,
  ok boolean NOT NULL,
  detail text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION public.test_pass(p_name text, p_detail text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.test_results (suite, name, ok, detail)
  VALUES ('contract', p_name, true, p_detail);
END;
$$;

CREATE OR REPLACE FUNCTION public.test_save(
  p_user uuid,
  p_tournament uuid,
  p_expected timestamptz,
  p_format text,
  p_matches integer,
  p_cutoff integer
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_user::text, ''), true);
  v_result := public.save_competition_configuration(
    p_tournament, p_expected, p_format, p_matches, p_cutoff
  );
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.test_new_tournament(p_slug text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.tournaments (slug, name, age_group, date)
  VALUES (p_slug, p_slug, 'U13', DATE '2026-11-21')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

INSERT INTO auth.users (id, email)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'manager@disposable.test'),
  ('22222222-2222-4222-8222-222222222222', 'tournaments-only@disposable.test'),
  ('33333333-3333-4333-8333-333333333333', 'schedule-only@disposable.test'),
  ('44444444-4444-4444-8444-444444444444', 'neither@disposable.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.rbac_roles (key, name, description, is_platform_role)
VALUES
  ('TEST_TOURNAMENTS_ONLY', 'Disposable tournaments only', 'Disposable test role', true),
  ('TEST_SCHEDULE_ONLY', 'Disposable schedule only', 'Disposable test role', true),
  ('TEST_NEITHER', 'Disposable neither permission', 'Disposable test role', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.rbac_roles r
JOIN public.rbac_permissions p ON p.key = 'tournaments.manage'
WHERE r.key = 'TEST_TOURNAMENTS_ONLY'
ON CONFLICT DO NOTHING;

INSERT INTO public.rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.rbac_roles r
JOIN public.rbac_permissions p ON p.key = 'schedule.manage'
WHERE r.key = 'TEST_SCHEDULE_ONLY'
ON CONFLICT DO NOTHING;

INSERT INTO public.rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.rbac_roles r
JOIN public.rbac_permissions p ON p.key = 'tournaments.view'
WHERE r.key = 'TEST_NEITHER'
ON CONFLICT DO NOTHING;

INSERT INTO public.rbac_user_roles (user_id, role_id)
SELECT '11111111-1111-4111-8111-111111111111', id FROM public.rbac_roles WHERE key = 'TOURNAMENT_MANAGER'
ON CONFLICT DO NOTHING;
INSERT INTO public.rbac_user_roles (user_id, role_id)
SELECT '22222222-2222-4222-8222-222222222222', id FROM public.rbac_roles WHERE key = 'TEST_TOURNAMENTS_ONLY'
ON CONFLICT DO NOTHING;
INSERT INTO public.rbac_user_roles (user_id, role_id)
SELECT '33333333-3333-4333-8333-333333333333', id FROM public.rbac_roles WHERE key = 'TEST_SCHEDULE_ONLY'
ON CONFLICT DO NOTHING;
INSERT INTO public.rbac_user_roles (user_id, role_id)
SELECT '44444444-4444-4444-8444-444444444444', id FROM public.rbac_roles WHERE key = 'TEST_NEITHER'
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_save text := 'public.save_competition_configuration(uuid,timestamptz,text,integer,integer)';
  v_lock text := 'public.competition_config_lock_tournaments(uuid,uuid)';
BEGIN
  IF to_regprocedure(v_save) IS NULL
    OR to_regprocedure(v_lock) IS NULL
    OR to_regprocedure('public.competition_config_lock_match()') IS NULL
  THEN
    RAISE EXCEPTION 'FAIL RPC installation: function missing';
  END IF;
  IF NOT has_function_privilege('authenticated', v_save, 'EXECUTE')
    OR has_function_privilege('anon', v_save, 'EXECUTE')
    OR has_function_privilege('service_role', v_save, 'EXECUTE')
    OR has_function_privilege('public', v_save, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'FAIL RPC installation: save EXECUTE grants are wrong';
  END IF;
  IF has_function_privilege('public', v_lock, 'EXECUTE')
    OR has_function_privilege('anon', v_lock, 'EXECUTE')
    OR has_function_privilege('authenticated', v_lock, 'EXECUTE')
    OR has_function_privilege('service_role', v_lock, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'FAIL RPC installation: lock helper is executable';
  END IF;
  IF NOT has_function_privilege('anon', 'public.competition_config_lock_match()', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.competition_config_lock_application()', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.competition_config_lock_group()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'FAIL RPC installation: trigger EXECUTE grant missing';
  END IF;
  PERFORM public.test_pass('RPC installation and grants', 'authenticated only; lock helper revoked');
END
$$;

DO $$
BEGIN
  BEGIN
    EXECUTE 'SET ROLE anon';
    PERFORM public.save_competition_configuration(
      '00000000-0000-0000-0000-000000000099', now(), 'round-robin', NULL, NULL
    );
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'FAIL Authorization: anon executed the RPC';
  EXCEPTION
    WHEN insufficient_privilege THEN
      EXECUTE 'RESET ROLE';
  END;
  BEGIN
    EXECUTE 'SET ROLE service_role';
    PERFORM public.save_competition_configuration(
      '00000000-0000-0000-0000-000000000099', now(), 'round-robin', NULL, NULL
    );
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'FAIL Authorization: service_role executed the RPC';
  EXCEPTION
    WHEN insufficient_privilege THEN
      EXECUTE 'RESET ROLE';
  END;
  PERFORM public.test_pass('Authorization', 'anon and service_role rejected');
END
$$;

SELECT set_config('app.test_id', public.test_new_tournament('contract-auth')::text, false);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_ts timestamptz;
  v_result jsonb;
BEGIN
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_save(NULL, v_id, v_ts, 'round-robin', NULL, NULL);
  IF v_result->>'status' IS DISTINCT FROM 'forbidden' OR v_result->>'code' IS DISTINCT FROM 'FORBIDDEN' THEN
    RAISE EXCEPTION 'FAIL Missing permissions: anonymous caller %', v_result;
  END IF;
  v_result := public.test_save('22222222-2222-4222-8222-222222222222', v_id, v_ts, 'round-robin', NULL, NULL);
  IF v_result->>'code' IS DISTINCT FROM 'FORBIDDEN' THEN
    RAISE EXCEPTION 'FAIL Missing permissions: missing schedule.manage %', v_result;
  END IF;
  v_result := public.test_save('33333333-3333-4333-8333-333333333333', v_id, v_ts, 'round-robin', NULL, NULL);
  IF v_result->>'code' IS DISTINCT FROM 'FORBIDDEN' THEN
    RAISE EXCEPTION 'FAIL Missing permissions: missing tournaments.manage %', v_result;
  END IF;
  v_result := public.test_save('44444444-4444-4444-8444-444444444444', v_id, v_ts, 'round-robin', NULL, NULL);
  IF v_result->>'code' IS DISTINCT FROM 'FORBIDDEN' THEN
    RAISE EXCEPTION 'FAIL Missing permissions: missing both %', v_result;
  END IF;
  IF (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL Missing permissions: format was written';
  END IF;
  PERFORM public.test_pass('Missing permissions', 'each missing permission returns FORBIDDEN and writes nothing');
END
$$;

SELECT set_config('app.test_id', public.test_new_tournament('contract-invalid')::text, false);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_ts timestamptz;
  v_result jsonb;
  v_manager uuid := '11111111-1111-4111-8111-111111111111';
BEGIN
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_save(v_manager, v_id, v_ts, 'round-robin', NULL, 6);
  IF v_result->>'code' IS DISTINCT FROM 'INVALID_KNOCKOUT_CUTOFF' THEN
    RAISE EXCEPTION 'FAIL Invalid configuration: cutoff %', v_result;
  END IF;
  v_result := public.test_save(v_manager, v_id, v_ts, 'round-robin', 2, NULL);
  IF v_result->>'code' IS DISTINCT FROM 'FORMAT_PARAMS_MISMATCH' THEN
    RAISE EXCEPTION 'FAIL Invalid configuration: params %', v_result;
  END IF;
  IF (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL Invalid configuration wrote a format';
  END IF;
  PERFORM public.test_pass('Invalid configuration', 'cutoff and format params rejected');
END
$$;

SELECT set_config('app.test_id', public.test_new_tournament('contract-archived')::text, false);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_ts timestamptz;
  v_result jsonb;
BEGIN
  UPDATE public.tournaments SET archived_at = clock_timestamp() WHERE id = v_id;
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_save('11111111-1111-4111-8111-111111111111', v_id, v_ts, 'round-robin', NULL, NULL);
  IF v_result->>'code' IS DISTINCT FROM 'ARCHIVED' OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL Archived tournaments: %', v_result;
  END IF;
  PERFORM public.test_pass('Archived tournaments', 'ARCHIVED and no format write');
END
$$;

SELECT pg_sleep(0.02);
SELECT set_config('app.test_id', public.test_new_tournament('contract-legacy')::text, false);
SELECT pg_sleep(0.02);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_ts timestamptz;
  v_result jsonb;
  v_groups integer;
  v_matches integer;
BEGIN
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_save('11111111-1111-4111-8111-111111111111', v_id, v_ts, 'round-robin', NULL, NULL);
  IF v_result->>'status' IS DISTINCT FROM 'success'
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS DISTINCT FROM 'round-robin'
    OR (SELECT league_matches_per_team FROM public.tournaments WHERE id = v_id) IS NOT NULL
    OR (SELECT knockout_cutoff FROM public.tournaments WHERE id = v_id) IS NOT NULL
  THEN
    RAISE EXCEPTION 'FAIL Legacy compatibility: %', v_result;
  END IF;
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_save('11111111-1111-4111-8111-111111111111', v_id, v_ts, 'round-robin', NULL, NULL);
  IF v_result->>'status' IS DISTINCT FROM 'unchanged'
    OR (SELECT updated_at FROM public.tournaments WHERE id = v_id) IS DISTINCT FROM v_ts
  THEN
    RAISE EXCEPTION 'FAIL No-op and stale versions: identical %', v_result;
  END IF;
  v_result := public.test_save('11111111-1111-4111-8111-111111111111', v_id, TIMESTAMPTZ '2000-01-01', 'round-robin', NULL, NULL);
  IF v_result->>'code' IS DISTINCT FROM 'STALE_CONFIGURATION'
    OR (SELECT updated_at FROM public.tournaments WHERE id = v_id) IS DISTINCT FROM v_ts
  THEN
    RAISE EXCEPTION 'FAIL No-op and stale versions: stale %', v_result;
  END IF;
  SELECT count(*) INTO v_groups FROM public.tournament_groups WHERE tournament_id = v_id;
  SELECT count(*) INTO v_matches FROM public.tournament_matches WHERE tournament_id = v_id;
  IF v_groups <> 0 OR v_matches <> 0 THEN
    RAISE EXCEPTION 'FAIL No unintended group or match mutation: groups % matches %', v_groups, v_matches;
  END IF;
  PERFORM public.test_pass('Both required permissions', 'the manager holding both permissions saved round-robin');
  PERFORM public.test_pass('Legacy compatibility', 'round-robin stored');
  PERFORM public.test_pass('No-op and stale versions', 'unchanged then STALE_CONFIGURATION');
  PERFORM public.test_pass('No unintended group or match mutation', 'legacy save left groups and matches empty');
END
$$;

SELECT set_config('app.test_id', public.test_new_tournament('contract-identities')::text, false);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_apps uuid[] := ARRAY[]::uuid[];
  v_app uuid;
  v_pending uuid;
  v_ts timestamptz;
  v_result jsonb;
  v_i integer;
  v_manager uuid := '11111111-1111-4111-8111-111111111111';
BEGIN
  FOR v_i IN 1..4 LOOP
    INSERT INTO public.applications (tournament_id, status)
    VALUES (v_id, 'accepted')
    RETURNING id INTO v_app;
    v_apps := array_append(v_apps, v_app);
  END LOOP;
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_save(v_manager, v_id, v_ts, 'champions-league', 1, 4);
  IF v_result->>'status' IS DISTINCT FROM 'not_activated'
    OR v_result->>'code' IS DISTINCT FROM 'CHAMPIONS_LEAGUE_SAVE_NOT_ACTIVATED'
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS NOT NULL
  THEN
    RAISE EXCEPTION 'FAIL Champions League database kill switch: %', v_result;
  END IF;
  PERFORM public.test_pass('Accepted applications', 'four accepted applications reached the kill switch');
  PERFORM public.test_pass('Champions League database kill switch', v_result::text);

  UPDATE public.applications SET status = 'new' WHERE id = v_apps[4];
  INSERT INTO public.applications (tournament_id, status) VALUES (v_id, 'new') RETURNING id INTO v_pending;
  INSERT INTO public.tournament_external_teams (
    tournament_id, external_id, name, participation_status, external_active, application_id
  ) VALUES (
    v_id, 'linked-pending', 'Linked pending', 'confirmed', true, v_pending
  );
  v_result := public.test_save(v_manager, v_id, v_ts, 'champions-league', 1, 4);
  IF v_result->>'status' IS DISTINCT FROM 'not_activated'
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS NOT NULL
    OR (SELECT count(*) FROM public.tournament_groups WHERE tournament_id = v_id) <> 0
    OR (SELECT count(*) FROM public.tournament_matches WHERE tournament_id = v_id) <> 0
  THEN
    RAISE EXCEPTION 'FAIL Linked non-accepted applications: %', v_result;
  END IF;
  PERFORM public.test_pass('Linked non-accepted applications', 'external id counted, pending application not counted, no write');
END
$$;

SELECT set_config('app.test_id', public.test_new_tournament('contract-externals')::text, false);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_ts timestamptz;
  v_result jsonb;
  v_i integer;
BEGIN
  FOR v_i IN 1..4 LOOP
    INSERT INTO public.tournament_external_teams (
      tournament_id, external_id, name, participation_status, external_active
    ) VALUES (
      v_id, 'ext-' || v_i, 'External ' || v_i, 'confirmed', true
    );
  END LOOP;
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_save('11111111-1111-4111-8111-111111111111', v_id, v_ts, 'champions-league', 1, 4);
  IF v_result->>'code' IS DISTINCT FROM 'CHAMPIONS_LEAGUE_SAVE_NOT_ACTIVATED'
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS NOT NULL
  THEN
    RAISE EXCEPTION 'FAIL Confirmed external teams: %', v_result;
  END IF;
  PERFORM public.test_pass('Confirmed external teams', 'four confirmed teams reached the kill switch');
END
$$;

SELECT set_config('app.test_id', public.test_new_tournament('contract-duplicate')::text, false);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_app uuid;
  v_ts timestamptz;
  v_result jsonb;
BEGIN
  INSERT INTO public.applications (tournament_id, status)
  VALUES (v_id, 'accepted')
  RETURNING id INTO v_app;
  INSERT INTO public.tournament_external_teams (
    id, tournament_id, external_id, name, participation_status, external_active
  ) VALUES (
    v_app, v_id, 'duplicate-id', 'Duplicate', 'confirmed', true
  );
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_save('11111111-1111-4111-8111-111111111111', v_id, v_ts, 'round-robin', NULL, NULL);
  IF v_result->>'code' IS DISTINCT FROM 'DUPLICATE_PARTICIPANT'
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS NOT NULL
  THEN
    RAISE EXCEPTION 'FAIL Duplicate identities: %', v_result;
  END IF;
  PERFORM public.test_pass('Duplicate identities', 'DUPLICATE_PARTICIPANT');
END
$$;

SELECT set_config('app.test_id', public.test_new_tournament('contract-matches')::text, false);

DO $$
DECLARE
  v_id uuid := current_setting('app.test_id')::uuid;
  v_home uuid;
  v_away uuid;
  v_match uuid;
  v_ts timestamptz;
  v_result jsonb;
  v_manager uuid := '11111111-1111-4111-8111-111111111111';
BEGIN
  INSERT INTO public.applications (tournament_id, status) VALUES (v_id, 'accepted') RETURNING id INTO v_home;
  INSERT INTO public.applications (tournament_id, status) VALUES (v_id, 'accepted') RETURNING id INTO v_away;
  INSERT INTO public.tournament_matches (tournament_id, phase, home_application_id, away_application_id)
  VALUES (v_id, 'group', v_home, v_away)
  RETURNING id INTO v_match;
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_save(v_manager, v_id, v_ts, 'round-robin', NULL, NULL);
  IF v_result->>'code' IS DISTINCT FROM 'MATCHES_EXIST' THEN
    RAISE EXCEPTION 'FAIL Existing matches and results: match %', v_result;
  END IF;
  UPDATE public.tournament_matches
  SET home_score = 0, away_score = 0, status = 'completed'
  WHERE id = v_match;
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_save(v_manager, v_id, v_ts, 'round-robin', NULL, NULL);
  IF v_result->>'code' IS DISTINCT FROM 'RESULTS_EXIST' THEN
    RAISE EXCEPTION 'FAIL Existing matches and results: 0:0 %', v_result;
  END IF;
  UPDATE public.tournament_matches
  SET home_score = NULL, away_score = NULL, status = 'live', phase = 'group'
  WHERE id = v_match;
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_save(v_manager, v_id, v_ts, 'round-robin', NULL, NULL);
  IF v_result->>'code' IS DISTINCT FROM 'LIVE_MATCH' THEN
    RAISE EXCEPTION 'FAIL Existing matches and results: live %', v_result;
  END IF;
  UPDATE public.tournament_matches
  SET status = 'scheduled', phase = 'knockout', round = 'final'
  WHERE id = v_match;
  SELECT updated_at INTO v_ts FROM public.tournaments WHERE id = v_id;
  v_result := public.test_save(v_manager, v_id, v_ts, 'round-robin', NULL, NULL);
  IF v_result->>'code' IS DISTINCT FROM 'KNOCKOUT_MATCHES' THEN
    RAISE EXCEPTION 'FAIL Existing matches and results: knockout %', v_result;
  END IF;
  IF (SELECT count(*) FROM public.tournament_matches WHERE tournament_id = v_id) <> 1
    OR (SELECT count(*) FROM public.tournament_groups WHERE tournament_id = v_id) <> 0
    OR (SELECT competition_format FROM public.tournaments WHERE id = v_id) IS NOT NULL
    OR (SELECT home_score FROM public.tournament_matches WHERE id = v_match) IS NOT NULL
    OR (SELECT phase FROM public.tournament_matches WHERE id = v_match) IS DISTINCT FROM 'knockout'
  THEN
    RAISE EXCEPTION 'FAIL No unintended group or match mutation after match locks';
  END IF;
  PERFORM public.test_pass('Existing matches and results', 'MATCHES_EXIST, 0:0 RESULTS_EXIST, LIVE_MATCH, KNOCKOUT_MATCHES');
END
$$;
