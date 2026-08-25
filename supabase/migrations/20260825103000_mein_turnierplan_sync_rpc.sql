-- Atomic MeinTurnierplan sync via transactional RPC.
-- Existing migrations are left untouched.

-- -----------------------------------------------------------------------------
-- Soft-disable columns for removed external records
-- -----------------------------------------------------------------------------

ALTER TABLE public.tournament_external_teams
  ADD COLUMN IF NOT EXISTS external_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS external_updated_at timestamptz;

ALTER TABLE public.tournament_groups
  ADD COLUMN IF NOT EXISTS external_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.tournament_fields
  ADD COLUMN IF NOT EXISTS external_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS external_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tournament_external_teams.external_active IS
  'False when the record disappeared from the latest MeinTurnierplan payload.';
COMMENT ON COLUMN public.tournament_groups.external_active IS
  'False when the record disappeared from the latest MeinTurnierplan payload.';
COMMENT ON COLUMN public.tournament_fields.external_active IS
  'False when the record disappeared from the latest MeinTurnierplan payload.';
COMMENT ON COLUMN public.tournament_matches.external_active IS
  'False when the record disappeared from the latest MeinTurnierplan payload.';

-- External teams in group-phase matches must belong to the same tournament.
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
  ELSIF NEW.home_external_team_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.tournament_external_teams
      WHERE id = NEW.home_external_team_id
        AND tournament_id = NEW.tournament_id
    ) THEN
      RAISE EXCEPTION 'Heimteam (extern) wurde nicht gefunden.';
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
  ELSIF NEW.away_external_team_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.tournament_external_teams
      WHERE id = NEW.away_external_team_id
        AND tournament_id = NEW.tournament_id
    ) THEN
      RAISE EXCEPTION 'Auswärtsteam (extern) wurde nicht gefunden.';
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

ALTER TABLE public.tournament_matches
  DROP CONSTRAINT IF EXISTS tournament_matches_external_teams_distinct;

ALTER TABLE public.tournament_matches
  ADD CONSTRAINT tournament_matches_external_teams_distinct
  CHECK (
    home_external_team_id IS NULL
    OR away_external_team_id IS NULL
    OR home_external_team_id <> away_external_team_id
  );

-- -----------------------------------------------------------------------------
-- Transactional MeinTurnierplan sync RPC
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_mein_turnierplan_tournament(
  p_tournament_id uuid,
  p_payload jsonb,
  p_overwrite_manual boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source constant text := 'mein-turnierplan';
  v_now timestamptz := now();
  v_match_duration integer := 12;
  v_teams_inserted integer := 0;
  v_teams_updated integer := 0;
  v_groups_inserted integer := 0;
  v_groups_updated integer := 0;
  v_fields_inserted integer := 0;
  v_fields_updated integer := 0;
  v_matches_inserted integer := 0;
  v_matches_updated integer := 0;
  v_protected_overrides integer := 0;
  v_deactivated_teams integer := 0;
  v_deactivated_groups integer := 0;
  v_deactivated_fields integer := 0;
  v_deactivated_matches integer := 0;
  v_team record;
  v_group record;
  v_field record;
  v_match record;
  v_existing_team record;
  v_existing_group record;
  v_existing_field record;
  v_existing_match record;
  v_team_uuid uuid;
  v_group_uuid uuid;
  v_field_uuid uuid;
  v_home_application_id uuid;
  v_away_application_id uuid;
  v_home_external_team_id uuid;
  v_away_external_team_id uuid;
  v_payload_team_ids text[] := ARRAY[]::text[];
  v_payload_group_ids text[] := ARRAY[]::text[];
  v_payload_field_ids text[] := ARRAY[]::text[];
  v_payload_match_ids text[] := ARRAY[]::text[];
  v_sync_meta jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tournaments
    WHERE id = p_tournament_id
  ) THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF COALESCE(p_payload->>'source', '') <> v_source THEN
    RAISE EXCEPTION 'Invalid payload source';
  END IF;

  IF jsonb_typeof(p_payload->'teams') <> 'array'
    OR jsonb_typeof(p_payload->'groups') <> 'array'
    OR jsonb_typeof(p_payload->'fields') <> 'array'
    OR jsonb_typeof(p_payload->'matches') <> 'array'
  THEN
    RAISE EXCEPTION 'Payload sections must be arrays';
  END IF;

  SELECT match_duration_minutes
  INTO v_match_duration
  FROM public.tournaments
  WHERE id = p_tournament_id;

  -- Validate teams
  FOR v_team IN
    SELECT value AS item
    FROM jsonb_array_elements(p_payload->'teams')
  LOOP
    IF COALESCE(btrim(v_team.item->>'externalId'), '') = '' THEN
      RAISE EXCEPTION 'Team external ID must not be empty';
    END IF;

    IF v_team.item->>'applicationId' IS NOT NULL
      AND btrim(v_team.item->>'applicationId') <> ''
    THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.applications
        WHERE id = (v_team.item->>'applicationId')::uuid
          AND tournament_id = p_tournament_id
          AND status = 'accepted'::public.application_status
      ) THEN
        RAISE EXCEPTION 'Mapped application is not accepted for this tournament';
      END IF;
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT item->>'externalId'), ARRAY[]::text[])
  INTO v_payload_team_ids
  FROM jsonb_array_elements(p_payload->'teams') AS item;

  IF (
    SELECT COUNT(*)
    FROM jsonb_array_elements(p_payload->'teams') AS item
  ) <> COALESCE(array_length(v_payload_team_ids, 1), 0) THEN
    RAISE EXCEPTION 'Duplicate team external IDs in payload';
  END IF;

  -- Validate groups
  FOR v_group IN
    SELECT value AS item
    FROM jsonb_array_elements(p_payload->'groups')
  LOOP
    IF COALESCE(btrim(v_group.item->>'externalId'), '') = '' THEN
      RAISE EXCEPTION 'Group external ID must not be empty';
    END IF;

    IF jsonb_typeof(v_group.item->'teamExternalIds') <> 'array' THEN
      RAISE EXCEPTION 'Group teamExternalIds must be an array';
    END IF;

    FOR v_team IN
      SELECT value AS member_id
      FROM jsonb_array_elements(v_group.item->'teamExternalIds')
    LOOP
      IF COALESCE(btrim(v_team.member_id #>> '{}'), '') = '' THEN
        RAISE EXCEPTION 'Group member external ID must not be empty';
      END IF;

      IF NOT (
        (v_team.member_id #>> '{}') = ANY (v_payload_team_ids)
        OR EXISTS (
          SELECT 1
          FROM public.tournament_external_teams
          WHERE tournament_id = p_tournament_id
            AND external_source = v_source
            AND external_id = v_team.member_id #>> '{}'
        )
      ) THEN
        RAISE EXCEPTION 'Group references unknown team external ID';
      END IF;
    END LOOP;
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT item->>'externalId'), ARRAY[]::text[])
  INTO v_payload_group_ids
  FROM jsonb_array_elements(p_payload->'groups') AS item;

  IF (
    SELECT COUNT(*)
    FROM jsonb_array_elements(p_payload->'groups') AS item
  ) <> COALESCE(array_length(v_payload_group_ids, 1), 0) THEN
    RAISE EXCEPTION 'Duplicate group external IDs in payload';
  END IF;

  -- Validate fields
  FOR v_field IN
    SELECT value AS item
    FROM jsonb_array_elements(p_payload->'fields')
  LOOP
    IF COALESCE(btrim(v_field.item->>'externalId'), '') = '' THEN
      RAISE EXCEPTION 'Field external ID must not be empty';
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT item->>'externalId'), ARRAY[]::text[])
  INTO v_payload_field_ids
  FROM jsonb_array_elements(p_payload->'fields') AS item;

  IF (
    SELECT COUNT(*)
    FROM jsonb_array_elements(p_payload->'fields') AS item
  ) <> COALESCE(array_length(v_payload_field_ids, 1), 0) THEN
    RAISE EXCEPTION 'Duplicate field external IDs in payload';
  END IF;

  -- Validate matches
  FOR v_match IN
    SELECT value AS item
    FROM jsonb_array_elements(p_payload->'matches')
  LOOP
    IF COALESCE(btrim(v_match.item->>'externalId'), '') = '' THEN
      RAISE EXCEPTION 'Match external ID must not be empty';
    END IF;

    IF COALESCE(btrim(v_match.item->>'homeTeamExternalId'), '') = ''
      OR COALESCE(btrim(v_match.item->>'awayTeamExternalId'), '') = ''
    THEN
      RAISE EXCEPTION 'Match teams must not be empty';
    END IF;

    IF v_match.item->>'homeTeamExternalId' = v_match.item->>'awayTeamExternalId' THEN
      RAISE EXCEPTION 'Match teams must be different';
    END IF;

    IF NOT (
      v_match.item->>'homeTeamExternalId' = ANY (v_payload_team_ids)
      OR EXISTS (
        SELECT 1
        FROM public.tournament_external_teams
        WHERE tournament_id = p_tournament_id
          AND external_source = v_source
          AND external_id = v_match.item->>'homeTeamExternalId'
      )
    ) THEN
      RAISE EXCEPTION 'Match references unknown home team';
    END IF;

    IF NOT (
      v_match.item->>'awayTeamExternalId' = ANY (v_payload_team_ids)
      OR EXISTS (
        SELECT 1
        FROM public.tournament_external_teams
        WHERE tournament_id = p_tournament_id
          AND external_source = v_source
          AND external_id = v_match.item->>'awayTeamExternalId'
      )
    ) THEN
      RAISE EXCEPTION 'Match references unknown away team';
    END IF;

    IF v_match.item->>'groupExternalId' IS NOT NULL
      AND btrim(v_match.item->>'groupExternalId') <> ''
      AND NOT (
        v_match.item->>'groupExternalId' = ANY (v_payload_group_ids)
        OR EXISTS (
          SELECT 1
          FROM public.tournament_groups
          WHERE tournament_id = p_tournament_id
            AND external_source = v_source
            AND external_id = v_match.item->>'groupExternalId'
        )
      )
    THEN
      RAISE EXCEPTION 'Match references unknown group';
    END IF;

    IF v_match.item->>'fieldExternalId' IS NOT NULL
      AND btrim(v_match.item->>'fieldExternalId') <> ''
      AND NOT (
        v_match.item->>'fieldExternalId' = ANY (v_payload_field_ids)
        OR EXISTS (
          SELECT 1
          FROM public.tournament_fields
          WHERE tournament_id = p_tournament_id
            AND external_source = v_source
            AND external_id = v_match.item->>'fieldExternalId'
        )
      )
    THEN
      RAISE EXCEPTION 'Match references unknown field';
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT item->>'externalId'), ARRAY[]::text[])
  INTO v_payload_match_ids
  FROM jsonb_array_elements(p_payload->'matches') AS item;

  IF (
    SELECT COUNT(*)
    FROM jsonb_array_elements(p_payload->'matches') AS item
  ) <> COALESCE(array_length(v_payload_match_ids, 1), 0) THEN
    RAISE EXCEPTION 'Duplicate match external IDs in payload';
  END IF;

  -- Upsert external teams
  FOR v_team IN
    SELECT value AS item
    FROM jsonb_array_elements(p_payload->'teams')
  LOOP
    SELECT *
    INTO v_existing_team
    FROM public.tournament_external_teams
    WHERE tournament_id = p_tournament_id
      AND external_source = v_source
      AND external_id = v_team.item->>'externalId';

    v_home_application_id := NULL;
    IF v_team.item->>'applicationId' IS NOT NULL
      AND btrim(v_team.item->>'applicationId') <> ''
    THEN
      v_home_application_id := (v_team.item->>'applicationId')::uuid;
    END IF;

    IF v_existing_team.id IS NULL THEN
      INSERT INTO public.tournament_external_teams (
        tournament_id,
        external_source,
        external_id,
        name,
        application_id,
        external_active,
        external_updated_at,
        last_synced_at
      ) VALUES (
        p_tournament_id,
        v_source,
        v_team.item->>'externalId',
        v_team.item->>'name',
        v_home_application_id,
        true,
        v_now,
        v_now
      );
      v_teams_inserted := v_teams_inserted + 1;
    ELSE
      UPDATE public.tournament_external_teams
      SET
        name = v_team.item->>'name',
        application_id = CASE
          WHEN v_home_application_id IS NOT NULL THEN v_home_application_id
          ELSE application_id
        END,
        external_active = true,
        external_updated_at = v_now,
        last_synced_at = v_now,
        updated_at = v_now
      WHERE id = v_existing_team.id;
      v_teams_updated := v_teams_updated + 1;
    END IF;
  END LOOP;

  UPDATE public.tournament_external_teams
  SET
    external_active = false,
    updated_at = v_now
  WHERE tournament_id = p_tournament_id
    AND external_source = v_source
    AND external_id IS NOT NULL
    AND NOT (external_id = ANY (v_payload_team_ids))
    AND external_active = true;

  GET DIAGNOSTICS v_deactivated_teams = ROW_COUNT;

  -- Upsert groups
  FOR v_group IN
    SELECT value AS item
    FROM jsonb_array_elements(p_payload->'groups')
  LOOP
    SELECT *
    INTO v_existing_group
    FROM public.tournament_groups
    WHERE tournament_id = p_tournament_id
      AND external_source = v_source
      AND external_id = v_group.item->>'externalId';

    IF v_existing_group.id IS NULL THEN
      INSERT INTO public.tournament_groups (
        tournament_id,
        name,
        sort_order,
        external_source,
        external_id,
        external_active,
        last_synced_at,
        manual_override
      ) VALUES (
        p_tournament_id,
        v_group.item->>'name',
        COALESCE((v_group.item->>'sortOrder')::integer, 0),
        v_source,
        v_group.item->>'externalId',
        true,
        v_now,
        false
      )
      RETURNING id INTO v_group_uuid;
      v_groups_inserted := v_groups_inserted + 1;
    ELSE
      v_group_uuid := v_existing_group.id;

      IF v_existing_group.manual_override = true AND NOT p_overwrite_manual THEN
        v_protected_overrides := v_protected_overrides + 1;
      ELSE
        UPDATE public.tournament_groups
        SET
          name = v_group.item->>'name',
          sort_order = COALESCE((v_group.item->>'sortOrder')::integer, 0),
          external_active = true,
          last_synced_at = v_now,
          manual_override = false,
          updated_at = v_now
        WHERE id = v_existing_group.id;
        v_groups_updated := v_groups_updated + 1;
      END IF;
    END IF;

    DELETE FROM public.tournament_group_members
    WHERE group_id = v_group_uuid
      AND (
        external_team_id IN (
          SELECT id
          FROM public.tournament_external_teams
          WHERE tournament_id = p_tournament_id
            AND external_source = v_source
        )
        OR application_id IN (
          SELECT application_id
          FROM public.tournament_external_teams
          WHERE tournament_id = p_tournament_id
            AND external_source = v_source
            AND application_id IS NOT NULL
        )
      );

    FOR v_team IN
      SELECT value AS member_id
      FROM jsonb_array_elements(v_group.item->'teamExternalIds')
    LOOP
      SELECT id, application_id
      INTO v_existing_team
      FROM public.tournament_external_teams
      WHERE tournament_id = p_tournament_id
        AND external_source = v_source
        AND external_id = v_team.member_id #>> '{}';

      IF v_existing_team.application_id IS NOT NULL THEN
        INSERT INTO public.tournament_group_members (
          group_id,
          application_id,
          external_team_id
        ) VALUES (
          v_group_uuid,
          v_existing_team.application_id,
          NULL
        );
      ELSIF v_existing_team.id IS NOT NULL THEN
        INSERT INTO public.tournament_group_members (
          group_id,
          application_id,
          external_team_id
        ) VALUES (
          v_group_uuid,
          NULL,
          v_existing_team.id
        );
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.tournament_groups
  SET
    external_active = false,
    updated_at = v_now
  WHERE tournament_id = p_tournament_id
    AND external_source = v_source
    AND external_id IS NOT NULL
    AND NOT (external_id = ANY (v_payload_group_ids))
    AND external_active = true;

  GET DIAGNOSTICS v_deactivated_groups = ROW_COUNT;

  -- Upsert fields
  FOR v_field IN
    SELECT value AS item
    FROM jsonb_array_elements(p_payload->'fields')
  LOOP
    SELECT *
    INTO v_existing_field
    FROM public.tournament_fields
    WHERE tournament_id = p_tournament_id
      AND external_source = v_source
      AND external_id = v_field.item->>'externalId';

    IF v_existing_field.id IS NULL THEN
      INSERT INTO public.tournament_fields (
        tournament_id,
        name,
        sort_order,
        external_source,
        external_id,
        external_active,
        last_synced_at,
        manual_override
      ) VALUES (
        p_tournament_id,
        v_field.item->>'name',
        COALESCE((v_field.item->>'sortOrder')::integer, 0),
        v_source,
        v_field.item->>'externalId',
        true,
        v_now,
        false
      );
      v_fields_inserted := v_fields_inserted + 1;
    ELSIF v_existing_field.manual_override = true AND NOT p_overwrite_manual THEN
      v_protected_overrides := v_protected_overrides + 1;
    ELSE
      UPDATE public.tournament_fields
      SET
        name = v_field.item->>'name',
        sort_order = COALESCE((v_field.item->>'sortOrder')::integer, 0),
        external_active = true,
        last_synced_at = v_now,
        manual_override = false
      WHERE id = v_existing_field.id;
      v_fields_updated := v_fields_updated + 1;
    END IF;
  END LOOP;

  UPDATE public.tournament_fields
  SET external_active = false
  WHERE tournament_id = p_tournament_id
    AND external_source = v_source
    AND external_id IS NOT NULL
    AND NOT (external_id = ANY (v_payload_field_ids))
    AND external_active = true;

  GET DIAGNOSTICS v_deactivated_fields = ROW_COUNT;

  -- Upsert matches
  FOR v_match IN
    SELECT value AS item
    FROM jsonb_array_elements(p_payload->'matches')
  LOOP
    SELECT *
    INTO v_existing_match
    FROM public.tournament_matches
    WHERE tournament_id = p_tournament_id
      AND external_source = v_source
      AND external_id = v_match.item->>'externalId';

    IF v_existing_match.id IS NOT NULL
      AND v_existing_match.manual_override = true
      AND NOT p_overwrite_manual
    THEN
      v_protected_overrides := v_protected_overrides + 1;
      CONTINUE;
    END IF;

    SELECT id, application_id
    INTO v_existing_team
    FROM public.tournament_external_teams
    WHERE tournament_id = p_tournament_id
      AND external_source = v_source
      AND external_id = v_match.item->>'homeTeamExternalId';

    v_home_application_id := v_existing_team.application_id;
    v_home_external_team_id := CASE
      WHEN v_home_application_id IS NOT NULL THEN NULL
      ELSE v_existing_team.id
    END;

    SELECT id, application_id
    INTO v_existing_team
    FROM public.tournament_external_teams
    WHERE tournament_id = p_tournament_id
      AND external_source = v_source
      AND external_id = v_match.item->>'awayTeamExternalId';

    v_away_application_id := v_existing_team.application_id;
    v_away_external_team_id := CASE
      WHEN v_away_application_id IS NOT NULL THEN NULL
      ELSE v_existing_team.id
    END;

    IF v_home_application_id IS NULL AND v_home_external_team_id IS NULL THEN
      RAISE EXCEPTION 'Match home team could not be resolved';
    END IF;

    IF v_away_application_id IS NULL AND v_away_external_team_id IS NULL THEN
      RAISE EXCEPTION 'Match away team could not be resolved';
    END IF;

    v_group_uuid := NULL;
    IF v_match.item->>'groupExternalId' IS NOT NULL
      AND btrim(v_match.item->>'groupExternalId') <> ''
    THEN
      SELECT id
      INTO v_group_uuid
      FROM public.tournament_groups
      WHERE tournament_id = p_tournament_id
        AND external_source = v_source
        AND external_id = v_match.item->>'groupExternalId';
    END IF;

    v_field_uuid := NULL;
    IF v_match.item->>'fieldExternalId' IS NOT NULL
      AND btrim(v_match.item->>'fieldExternalId') <> ''
    THEN
      SELECT id
      INTO v_field_uuid
      FROM public.tournament_fields
      WHERE tournament_id = p_tournament_id
        AND external_source = v_source
        AND external_id = v_match.item->>'fieldExternalId';
    END IF;

    IF v_existing_match.id IS NULL THEN
      INSERT INTO public.tournament_matches (
        tournament_id,
        group_id,
        field_id,
        home_application_id,
        away_application_id,
        home_external_team_id,
        away_external_team_id,
        scheduled_at,
        duration_minutes,
        home_score,
        away_score,
        status,
        phase,
        round,
        sort_order,
        decided_by,
        external_source,
        external_id,
        external_active,
        last_synced_at,
        manual_override
      ) VALUES (
        p_tournament_id,
        v_group_uuid,
        v_field_uuid,
        v_home_application_id,
        v_away_application_id,
        v_home_external_team_id,
        v_away_external_team_id,
        NULLIF(v_match.item->>'scheduledAt', '')::timestamptz,
        v_match_duration,
        NULLIF(v_match.item->>'homeScore', '')::integer,
        NULLIF(v_match.item->>'awayScore', '')::integer,
        COALESCE(v_match.item->>'status', 'scheduled'),
        COALESCE(v_match.item->>'phase', 'group'),
        NULLIF(v_match.item->>'round', ''),
        COALESCE((v_match.item->>'sortOrder')::integer, 0),
        COALESCE(v_match.item->>'decidedBy', 'regular'),
        v_source,
        v_match.item->>'externalId',
        true,
        v_now,
        false
      );
      v_matches_inserted := v_matches_inserted + 1;
    ELSE
      UPDATE public.tournament_matches
      SET
        group_id = v_group_uuid,
        field_id = v_field_uuid,
        home_application_id = v_home_application_id,
        away_application_id = v_away_application_id,
        home_external_team_id = v_home_external_team_id,
        away_external_team_id = v_away_external_team_id,
        scheduled_at = NULLIF(v_match.item->>'scheduledAt', '')::timestamptz,
        duration_minutes = v_match_duration,
        home_score = NULLIF(v_match.item->>'homeScore', '')::integer,
        away_score = NULLIF(v_match.item->>'awayScore', '')::integer,
        status = COALESCE(v_match.item->>'status', 'scheduled'),
        phase = COALESCE(v_match.item->>'phase', 'group'),
        round = NULLIF(v_match.item->>'round', ''),
        sort_order = COALESCE((v_match.item->>'sortOrder')::integer, 0),
        decided_by = COALESCE(v_match.item->>'decidedBy', 'regular'),
        external_active = true,
        last_synced_at = v_now,
        manual_override = false,
        updated_at = v_now
      WHERE id = v_existing_match.id;
      v_matches_updated := v_matches_updated + 1;
    END IF;
  END LOOP;

  UPDATE public.tournament_matches
  SET
    external_active = false,
    updated_at = v_now
  WHERE tournament_id = p_tournament_id
    AND external_source = v_source
    AND external_id IS NOT NULL
    AND NOT (external_id = ANY (v_payload_match_ids))
    AND external_active = true;

  GET DIAGNOSTICS v_deactivated_matches = ROW_COUNT;

  v_sync_meta := jsonb_build_object(
    'source', v_source,
    'externalTournamentId', p_payload->>'externalTournamentId',
    'teams', jsonb_array_length(p_payload->'teams'),
    'groups', jsonb_array_length(p_payload->'groups'),
    'fields', jsonb_array_length(p_payload->'fields'),
    'matches', jsonb_array_length(p_payload->'matches')
  );

  UPDATE public.tournaments
  SET
    mein_turnierplan_last_synced_at = v_now,
    mein_turnierplan_sync_meta = v_sync_meta
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'teamsInserted', v_teams_inserted,
    'teamsUpdated', v_teams_updated,
    'groupsInserted', v_groups_inserted,
    'groupsUpdated', v_groups_updated,
    'fieldsInserted', v_fields_inserted,
    'fieldsUpdated', v_fields_updated,
    'matchesInserted', v_matches_inserted,
    'matchesUpdated', v_matches_updated,
    'protectedOverrides', v_protected_overrides,
    'deactivatedTeams', v_deactivated_teams,
    'deactivatedGroups', v_deactivated_groups,
    'deactivatedFields', v_deactivated_fields,
    'deactivatedMatches', v_deactivated_matches
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_mein_turnierplan_tournament(uuid, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_mein_turnierplan_tournament(uuid, jsonb, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.sync_mein_turnierplan_tournament(uuid, jsonb, boolean) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.sync_mein_turnierplan_tournament(uuid, jsonb, boolean) TO authenticated;
