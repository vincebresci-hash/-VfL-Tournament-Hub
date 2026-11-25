-- =============================================================================
-- CL Release 1.1 - release-blocker remediation.
-- =============================================================================
--
-- This migration is deliberately additive. The production application state of
-- the four preceding Champions League migrations is not yet known, so none of
-- those historical files is edited. Migration order guarantees that their
-- objects exist before this hardening migration runs.
--
-- The migration fails closed when a pre-existing column has an unexpected
-- shape. DDL lock waits are bounded so this file can be scheduled in a reviewed
-- maintenance window instead of waiting indefinitely.
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '60s';

DO $column_contract$
DECLARE
  v_type oid;
  v_not_null boolean;
  v_default text;
BEGIN
  SELECT a.atttypid, a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
  INTO v_type, v_not_null, v_default
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d
    ON d.adrelid = a.attrelid
   AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.tournaments'::regclass
    AND a.attname = 'competition_format'
    AND NOT a.attisdropped;
  IF NOT FOUND OR v_type <> 'text'::regtype OR v_not_null OR v_default IS NOT NULL THEN
    RAISE EXCEPTION 'CL remediation prerequisite failed: tournaments.competition_format must be nullable text without a default';
  END IF;

  SELECT a.atttypid, a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
  INTO v_type, v_not_null, v_default
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d
    ON d.adrelid = a.attrelid
   AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.tournaments'::regclass
    AND a.attname = 'league_matches_per_team'
    AND NOT a.attisdropped;
  IF NOT FOUND OR v_type <> 'integer'::regtype OR v_not_null OR v_default IS NOT NULL THEN
    RAISE EXCEPTION 'CL remediation prerequisite failed: tournaments.league_matches_per_team must be nullable integer without a default';
  END IF;

  SELECT a.atttypid, a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
  INTO v_type, v_not_null, v_default
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d
    ON d.adrelid = a.attrelid
   AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.tournaments'::regclass
    AND a.attname = 'knockout_cutoff'
    AND NOT a.attisdropped;
  IF NOT FOUND OR v_type <> 'integer'::regtype OR v_not_null OR v_default IS NOT NULL THEN
    RAISE EXCEPTION 'CL remediation prerequisite failed: tournaments.knockout_cutoff must be nullable integer without a default';
  END IF;

  SELECT a.atttypid, a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
  INTO v_type, v_not_null, v_default
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d
    ON d.adrelid = a.attrelid
   AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.tournaments'::regclass
    AND a.attname = 'restrict_same_club'
    AND NOT a.attisdropped;
  IF NOT FOUND OR v_type <> 'boolean'::regtype OR v_not_null OR v_default IS NOT NULL THEN
    RAISE EXCEPTION 'CL remediation prerequisite failed: tournaments.restrict_same_club must be nullable boolean without a default';
  END IF;
END
$column_contract$;

DO $constraint_contract$
DECLARE
  v_kind "char";
BEGIN
  SELECT contype INTO v_kind
  FROM pg_constraint
  WHERE conrelid = 'public.tournaments'::regclass
    AND conname = 'tournaments_competition_format_check';
  IF NOT FOUND THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_competition_format_check
      CHECK (
        competition_format IS NULL
        OR competition_format IN ('round-robin', 'groups-knockout', 'champions-league')
      ) NOT VALID;
  ELSIF v_kind <> 'c' THEN
    RAISE EXCEPTION 'CL remediation prerequisite failed: tournaments_competition_format_check is not a CHECK constraint on public.tournaments';
  END IF;

  SELECT contype INTO v_kind
  FROM pg_constraint
  WHERE conrelid = 'public.tournaments'::regclass
    AND conname = 'tournaments_league_matches_per_team_check';
  IF NOT FOUND THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_league_matches_per_team_check
      CHECK (
        league_matches_per_team IS NULL
        OR league_matches_per_team BETWEEN 1 AND 64
      ) NOT VALID;
  ELSIF v_kind <> 'c' THEN
    RAISE EXCEPTION 'CL remediation prerequisite failed: tournaments_league_matches_per_team_check is not a CHECK constraint on public.tournaments';
  END IF;

  SELECT contype INTO v_kind
  FROM pg_constraint
  WHERE conrelid = 'public.tournaments'::regclass
    AND conname = 'tournaments_knockout_cutoff_check';
  IF NOT FOUND THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_knockout_cutoff_check
      CHECK (knockout_cutoff IS NULL OR knockout_cutoff IN (4, 8, 16)) NOT VALID;
  ELSIF v_kind <> 'c' THEN
    RAISE EXCEPTION 'CL remediation prerequisite failed: tournaments_knockout_cutoff_check is not a CHECK constraint on public.tournaments';
  END IF;

  SELECT contype INTO v_kind
  FROM pg_constraint
  WHERE conrelid = 'public.tournaments'::regclass
    AND conname = 'tournaments_competition_format_params_check';
  IF NOT FOUND THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_competition_format_params_check
      CHECK (
        (
          competition_format IS DISTINCT FROM 'champions-league'
          AND league_matches_per_team IS NULL
          AND knockout_cutoff IS NULL
        )
        OR (
          competition_format = 'champions-league'
          AND league_matches_per_team IS NOT NULL
          AND knockout_cutoff IS NOT NULL
        )
      ) NOT VALID;
  ELSIF v_kind <> 'c' THEN
    RAISE EXCEPTION 'CL remediation prerequisite failed: tournaments_competition_format_params_check is not a CHECK constraint on public.tournaments';
  END IF;
END
$constraint_contract$;

ALTER TABLE public.tournaments
  VALIDATE CONSTRAINT tournaments_competition_format_check;
ALTER TABLE public.tournaments
  VALIDATE CONSTRAINT tournaments_league_matches_per_team_check;
ALTER TABLE public.tournaments
  VALIDATE CONSTRAINT tournaments_knockout_cutoff_check;
ALTER TABLE public.tournaments
  VALIDATE CONSTRAINT tournaments_competition_format_params_check;

-- Club-identity edits affect the authoritative same-club draw just like an
-- acceptance or participation-status change. Include them in the existing
-- parent-row serialization contract.
DROP TRIGGER IF EXISTS competition_config_lock_application ON public.applications;
CREATE TRIGGER competition_config_lock_application
  BEFORE INSERT OR DELETE OR UPDATE OF status, tournament_id, club_id
  ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.competition_config_lock_application();

DROP TRIGGER IF EXISTS competition_config_lock_external_team ON public.tournament_external_teams;
CREATE TRIGGER competition_config_lock_external_team
  BEFORE INSERT OR DELETE OR UPDATE OF participation_status, external_active, application_id, tournament_id, club_id
  ON public.tournament_external_teams
  FOR EACH ROW
  EXECUTE FUNCTION public.competition_config_lock_external_team();

-- Preserve the already-tested implementation as a private core. The public
-- RPC below owns the new fail-safe validation and is the only callable entry
-- point. Renaming avoids changing the historical migration file.
DO $rename_core$
BEGIN
  IF to_regprocedure(
    'public.apply_champions_league_league_phase(uuid,timestamptz,integer,integer,boolean,boolean,jsonb)'
  ) IS NULL THEN
    RAISE EXCEPTION 'CL remediation prerequisite failed: apply_champions_league_league_phase is missing';
  END IF;
  IF to_regprocedure(
    'public.apply_champions_league_league_phase_validated_core_v1(uuid,timestamptz,integer,integer,boolean,boolean,jsonb)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'CL remediation prerequisite failed: validated core name is already in use';
  END IF;

  ALTER FUNCTION public.apply_champions_league_league_phase(
    uuid, timestamptz, integer, integer, boolean, boolean, jsonb
  ) RENAME TO apply_champions_league_league_phase_validated_core_v1;
END
$rename_core$;

CREATE FUNCTION public.apply_champions_league_league_phase(
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
SET lock_timeout = '5s'
AS $function$
DECLARE
  v_missing_club_count integer := 0;
  v_same_club_pair boolean := false;
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

  -- Locks before reading identities. The existing five child-table triggers
  -- take the same parent lock, so applications, external participants, groups,
  -- memberships and matches cannot change between validation and persistence.
  PERFORM 1
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF p_restrict_same_club IS TRUE THEN
    WITH accepted_applications AS (
      SELECT a.id, a.club_id
      FROM public.applications a
      WHERE a.tournament_id = p_tournament_id
        AND a.status = 'accepted'::public.application_status
    ), canonical_clubs AS (
      SELECT a.id::text AS participant_id, a.club_id
      FROM accepted_applications a
      UNION ALL
      SELECT e.id::text AS participant_id, e.club_id
      FROM public.tournament_external_teams e
      WHERE e.tournament_id = p_tournament_id
        AND e.participation_status = 'confirmed'
        AND e.external_active IS TRUE
        AND NOT EXISTS (
          SELECT 1
          FROM accepted_applications a
          WHERE a.id = e.application_id
        )
    )
    SELECT count(*)::integer
    INTO v_missing_club_count
    FROM canonical_clubs
    WHERE club_id IS NULL;

    IF v_missing_club_count > 0 THEN
      RETURN jsonb_build_object(
        'status', 'validation_error',
        'code', 'MISSING_CLUB_IDENTITY',
        'error', format(
          '%s bestätigte Mannschaft%s keine eindeutige Vereinszuordnung. Bitte zuerst in der Teilnehmerverwaltung zuordnen.',
          v_missing_club_count,
          CASE WHEN v_missing_club_count = 1 THEN ' hat' ELSE 'en haben' END
        ),
        'updatedAt', p_expected_updated_at,
        'groupId', NULL,
        'matchCount', 0
      );
    END IF;

    IF p_matches IS NOT NULL AND jsonb_typeof(p_matches) = 'array' THEN
      WITH accepted_applications AS (
        SELECT a.id, a.club_id
        FROM public.applications a
        WHERE a.tournament_id = p_tournament_id
          AND a.status = 'accepted'::public.application_status
      ), canonical_clubs AS (
        SELECT a.id::text AS participant_id, a.club_id
        FROM accepted_applications a
        UNION ALL
        SELECT e.id::text AS participant_id, e.club_id
        FROM public.tournament_external_teams e
        WHERE e.tournament_id = p_tournament_id
          AND e.participation_status = 'confirmed'
          AND e.external_active IS TRUE
          AND NOT EXISTS (
            SELECT 1
            FROM accepted_applications a
            WHERE a.id = e.application_id
          )
      ), submitted_matches AS (
        SELECT
          COALESCE(
            NULLIF(btrim(item->>'homeApplicationId'), ''),
            NULLIF(btrim(item->>'homeExternalTeamId'), '')
          ) AS home_id,
          COALESCE(
            NULLIF(btrim(item->>'awayApplicationId'), ''),
            NULLIF(btrim(item->>'awayExternalTeamId'), '')
          ) AS away_id
        FROM jsonb_array_elements(p_matches) AS item
      )
      SELECT EXISTS (
        SELECT 1
        FROM submitted_matches submitted
        JOIN canonical_clubs home_club
          ON home_club.participant_id = submitted.home_id
        JOIN canonical_clubs away_club
          ON away_club.participant_id = submitted.away_id
        WHERE home_club.club_id = away_club.club_id
      )
      INTO v_same_club_pair;

      IF v_same_club_pair THEN
        RETURN jsonb_build_object(
          'status', 'validation_error',
          'code', 'SAME_CLUB_VIOLATION',
          'error', 'Zwei Mannschaften desselben Vereins dürfen in der Ligaphase nicht gegeneinander spielen.',
          'updatedAt', p_expected_updated_at,
          'groupId', NULL,
          'matchCount', 0
        );
      END IF;
    END IF;
  END IF;

  RETURN public.apply_champions_league_league_phase_validated_core_v1(
    p_tournament_id,
    p_expected_updated_at,
    p_league_matches_per_team,
    p_knockout_cutoff,
    p_restrict_same_club,
    p_confirm_replace,
    p_matches
  );
END;
$function$;

COMMENT ON FUNCTION public.apply_champions_league_league_phase(
  uuid, timestamptz, integer, integer, boolean, boolean, jsonb
) IS
  'Transactional CL league-phase apply. Same-club mode fails closed with MISSING_CLUB_IDENTITY before any schedule mutation and validates linked external participants authoritatively.';

COMMENT ON FUNCTION public.apply_champions_league_league_phase_validated_core_v1(
  uuid, timestamptz, integer, integer, boolean, boolean, jsonb
) IS
  'Private implementation core retained by CL Release 1.1. Call only through apply_champions_league_league_phase.';

-- CREATE OR REPLACE preserves old ACLs. Remove every non-owner grant on all CL
-- RPC/helper functions first, including grants to roles not known when the
-- original files were written, then grant only the two intended public APIs.
DO $acl_hardening$
DECLARE
  v_function record;
  v_role record;
BEGIN
  FOR v_function IN
    SELECT p.oid, p.proowner, p.proacl
    FROM pg_proc p
    WHERE p.oid = ANY (ARRAY[
      'public.competition_config_result(text,text,text,timestamptz)'::regprocedure::oid,
      'public.competition_config_lock_tournaments(uuid,uuid)'::regprocedure::oid,
      'public.competition_config_lock_application()'::regprocedure::oid,
      'public.competition_config_lock_external_team()'::regprocedure::oid,
      'public.competition_config_lock_group()'::regprocedure::oid,
      'public.competition_config_lock_group_member()'::regprocedure::oid,
      'public.competition_config_lock_match()'::regprocedure::oid,
      'public.save_competition_configuration(uuid,timestamptz,text,integer,integer)'::regprocedure::oid,
      'public.apply_champions_league_league_phase_validated_core_v1(uuid,timestamptz,integer,integer,boolean,boolean,jsonb)'::regprocedure::oid,
      'public.apply_champions_league_league_phase(uuid,timestamptz,integer,integer,boolean,boolean,jsonb)'::regprocedure::oid
    ])
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC',
      v_function.oid::regprocedure
    );
    FOR v_role IN
      SELECT DISTINCT roles.rolname
      FROM aclexplode(COALESCE(v_function.proacl, acldefault('f', v_function.proowner))) acl
      JOIN pg_roles roles ON roles.oid = acl.grantee
      WHERE acl.grantee <> v_function.proowner
    LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %I',
        v_function.oid::regprocedure,
        v_role.rolname
      );
    END LOOP;
  END LOOP;
END
$acl_hardening$;

GRANT EXECUTE ON FUNCTION public.save_competition_configuration(
  uuid, timestamptz, text, integer, integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_champions_league_league_phase(
  uuid, timestamptz, integer, integer, boolean, boolean, jsonb
) TO authenticated;

RESET statement_timeout;
RESET lock_timeout;
