-- =============================================================================
-- RBAC SECURITY DEFINER RPC hardening (P1)
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
-- Depends on: 20260831210000_rbac_domain_rls_enforcement.sql
-- =============================================================================

-- MeinTurnierplan sync
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
  IF auth.uid() IS NULL
    OR NOT public.has_rbac_permission('tournaments.manage')
    OR NOT public.has_rbac_permission('schedule.manage')
    OR NOT public.has_rbac_permission('results.manage')
  THEN
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

  -- Upsert groups (reconcile by external_id, then by exact name)
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
      SELECT *
      INTO v_existing_group
      FROM public.tournament_groups
      WHERE tournament_id = p_tournament_id
        AND lower(btrim(name)) = lower(btrim(COALESCE(v_group.item->>'name', '')))
        AND (
          external_id IS NULL
          OR external_source IS NULL
          OR external_source IS DISTINCT FROM v_source
        )
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;

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
        -- Keep manual fields, but always attach MTP identity for future syncs.
        UPDATE public.tournament_groups
        SET
          external_source = v_source,
          external_id = v_group.item->>'externalId',
          external_active = true,
          last_synced_at = v_now,
          updated_at = v_now
        WHERE id = v_existing_group.id;
        v_protected_overrides := v_protected_overrides + 1;
      ELSE
        UPDATE public.tournament_groups
        SET
          name = v_group.item->>'name',
          sort_order = COALESCE((v_group.item->>'sortOrder')::integer, 0),
          external_source = v_source,
          external_id = v_group.item->>'externalId',
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

  -- Upsert fields (reconcile by external_id, then by exact name)
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
      SELECT *
      INTO v_existing_field
      FROM public.tournament_fields
      WHERE tournament_id = p_tournament_id
        AND lower(btrim(name)) = lower(btrim(COALESCE(v_field.item->>'name', '')))
        AND (
          external_id IS NULL
          OR external_source IS NULL
          OR external_source IS DISTINCT FROM v_source
        )
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;

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
      UPDATE public.tournament_fields
      SET
        external_source = v_source,
        external_id = v_field.item->>'externalId',
        external_active = true,
        last_synced_at = v_now
      WHERE id = v_existing_field.id;
      v_protected_overrides := v_protected_overrides + 1;
    ELSE
      UPDATE public.tournament_fields
      SET
        name = v_field.item->>'name',
        sort_order = COALESCE((v_field.item->>'sortOrder')::integer, 0),
        external_source = v_source,
        external_id = v_field.item->>'externalId',
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

-- -----------------------------------------------------------------------------
-- Status email idempotency RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_application_status_email_send(
  p_application_id uuid,
  p_template_type public.email_template_type
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reserved uuid;
BEGIN
  IF NOT (
    public.has_rbac_permission('applications.decide')
    OR public.has_rbac_permission('applications.manage')
  ) THEN
    RAISE EXCEPTION 'Nicht autorisiert.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.email_logs
    WHERE application_id = p_application_id
      AND template_type = p_template_type
      AND status = 'sent'
  ) THEN
    RETURN 'skip';
  END IF;

  INSERT INTO public.status_email_send_keys (application_id, template_type)
  VALUES (p_application_id, p_template_type)
  ON CONFLICT (application_id, template_type) DO NOTHING
  RETURNING application_id INTO v_reserved;

  IF v_reserved IS NULL THEN
    RETURN 'skip';
  END IF;

  RETURN 'send';
END;
$$;

CREATE OR REPLACE FUNCTION public.release_application_status_email_send(
  p_application_id uuid,
  p_template_type public.email_template_type
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_rbac_permission('applications.decide')
    OR public.has_rbac_permission('applications.manage')
  ) THEN
    RAISE EXCEPTION 'Nicht autorisiert.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.email_logs
    WHERE application_id = p_application_id
      AND template_type = p_template_type
      AND status = 'sent'
  ) THEN
    RETURN;
  END IF;

  DELETE FROM public.status_email_send_keys
  WHERE application_id = p_application_id
    AND template_type = p_template_type;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_application_status_email_send(
  uuid, public.email_template_type
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_application_status_email_send(
  uuid, public.email_template_type
) TO authenticated;

REVOKE ALL ON FUNCTION public.release_application_status_email_send(
  uuid, public.email_template_type
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_application_status_email_send(
  uuid, public.email_template_type
) TO authenticated;

-- -----------------------------------------------------------------------------
-- Cancellation token + decision RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.store_secure_access_token(
  p_application_id uuid,
  p_purpose public.secure_access_token_purpose,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'admin required';
  END IF;

  IF NOT (
    public.has_rbac_permission('cancellations.manage')
    OR public.has_rbac_permission('applications.decide')
  ) THEN
    RAISE EXCEPTION 'admin required';
  END IF;

  IF char_length(p_token_hash) <> 64 THEN
    RAISE EXCEPTION 'invalid token hash';
  END IF;

  SELECT id INTO v_existing
  FROM public.secure_access_tokens
  WHERE application_id = p_application_id
    AND purpose = p_purpose
    AND revoked_at IS NULL
    AND expires_at > now()
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.secure_access_tokens (
    application_id,
    purpose,
    token_hash,
    expires_at
  )
  VALUES (
    p_application_id,
    p_purpose,
    p_token_hash,
    p_expires_at
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_cancellation_request(
  p_request_id uuid,
  p_decision text,
  p_admin_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.cancellation_requests%ROWTYPE;
BEGIN
  IF NOT (
    public.has_rbac_permission('cancellations.decide')
    OR public.has_rbac_permission('cancellations.manage')
  ) THEN
    RAISE EXCEPTION 'admin required';
  END IF;

  IF p_decision NOT IN ('confirmed', 'rejected') THEN
    RAISE EXCEPTION 'invalid decision';
  END IF;

  SELECT * INTO v_request
  FROM public.cancellation_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request not found';
  END IF;

  IF v_request.status IS DISTINCT FROM 'pending'::public.cancellation_request_status THEN
    RAISE EXCEPTION 'request not pending';
  END IF;

  IF p_decision = 'confirmed' THEN
    UPDATE public.cancellation_requests
    SET
      status = 'confirmed',
      decided_at = now(),
      decided_by = auth.uid(),
      admin_note = NULLIF(btrim(p_admin_note), '')
    WHERE id = p_request_id;

    UPDATE public.applications
    SET status = 'cancelled'::public.application_status
    WHERE id = v_request.application_id
      AND status = 'accepted'::public.application_status;
  ELSE
    UPDATE public.cancellation_requests
    SET
      status = 'rejected',
      decided_at = now(),
      decided_by = auth.uid(),
      admin_note = NULLIF(btrim(p_admin_note), '')
    WHERE id = p_request_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.store_secure_access_token(
  uuid, public.secure_access_token_purpose, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_secure_access_token(
  uuid, public.secure_access_token_purpose, text, timestamptz
) TO authenticated;

REVOKE ALL ON FUNCTION public.decide_cancellation_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_cancellation_request(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reserve_cancellation_email_send(
  p_cancellation_request_id uuid,
  p_template_type public.email_template_type
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_cancellation_workflow_template(p_template_type) THEN
    RAISE EXCEPTION 'invalid template type';
  END IF;

  IF public.has_rbac_permission('cancellations.manage')
    OR public.has_rbac_permission('cancellations.decide')
  THEN
    NULL;
  ELSIF auth.uid() IS NOT NULL
    AND public.current_club_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.cancellation_requests cr
      JOIN public.applications a ON a.id = cr.application_id
      WHERE cr.id = p_cancellation_request_id
        AND a.club_id = public.current_club_id()
    ) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'unauthorized';
  END IF;

  INSERT INTO public.cancellation_email_send_keys (
    cancellation_request_id,
    template_type
  )
  VALUES (p_cancellation_request_id, p_template_type)
  ON CONFLICT (cancellation_request_id, template_type) DO NOTHING;

  IF FOUND THEN
    RETURN 'send';
  END IF;

  RETURN 'skip';
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_cancellation_email_send(
  uuid, public.email_template_type
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_cancellation_email_send(
  uuid, public.email_template_type
) TO authenticated;

-- -----------------------------------------------------------------------------
-- Communication receipt RPCs (C2 overload) + admin token read policy
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS communication_confirmation_tokens_admin_select
  ON public.communication_confirmation_tokens;
CREATE POLICY communication_confirmation_tokens_admin_select
  ON public.communication_confirmation_tokens
  FOR SELECT
  TO authenticated
  USING (public.has_rbac_permission('communications.view'));

DROP FUNCTION IF EXISTS public.initiate_communication_send(
  uuid, text, text, text, boolean, text, uuid[], text
);

CREATE OR REPLACE FUNCTION public.initiate_communication_send(
  p_tournament_id uuid,
  p_type text,
  p_subject text,
  p_body text,
  p_important boolean,
  p_recipient_filter text,
  p_application_ids uuid[] DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_require_confirmation boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_communication_id uuid;
  v_recipient_count integer;
BEGIN
  IF NOT public.has_rbac_permission('communications.send') THEN
    RAISE EXCEPTION 'communications.send required';
  END IF;

  IF p_idempotency_key IS NOT NULL AND length(btrim(p_idempotency_key)) > 0 THEN
    SELECT id INTO v_existing_id
    FROM public.tournament_communications
    WHERE idempotency_key = btrim(p_idempotency_key)
    LIMIT 1;

    IF FOUND THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournaments WHERE id = p_tournament_id
  ) THEN
    RAISE EXCEPTION 'tournament not found';
  END IF;

  IF p_type = 'payment-reminder'
     AND p_recipient_filter NOT IN ('payment-pending', 'custom') THEN
    RAISE EXCEPTION 'payment reminder only allows payment-pending or custom filter';
  END IF;

  INSERT INTO public.tournament_communications (
    tournament_id,
    type,
    subject,
    body,
    important,
    recipient_filter,
    status,
    idempotency_key,
    require_confirmation,
    created_by
  )
  VALUES (
    p_tournament_id,
    p_type,
    btrim(p_subject),
    btrim(p_body),
    COALESCE(p_important, false),
    p_recipient_filter,
    'sending',
    NULLIF(btrim(p_idempotency_key), ''),
    COALESCE(p_require_confirmation, false),
    auth.uid()
  )
  RETURNING id INTO v_communication_id;

  INSERT INTO public.communication_recipients (
    communication_id,
    application_id,
    recipient_email,
    recipient_team_name,
    recipient_club_name,
    send_status
  )
  SELECT
    v_communication_id,
    r.application_id,
    r.recipient_email,
    r.recipient_team_name,
    r.recipient_club_name,
    'pending'
  FROM public.resolve_communication_recipients(
    p_tournament_id,
    p_type,
    p_recipient_filter,
    p_application_ids
  ) r;

  GET DIAGNOSTICS v_recipient_count = ROW_COUNT;

  IF v_recipient_count = 0 THEN
    UPDATE public.tournament_communications
    SET status = 'failed', updated_at = now()
    WHERE id = v_communication_id;

    RAISE EXCEPTION 'no eligible recipients';
  END IF;

  UPDATE public.tournament_communications
  SET recipient_count = v_recipient_count, updated_at = now()
  WHERE id = v_communication_id;

  RETURN v_communication_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Issue confirmation token (admin-only, idempotent per recipient)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.issue_communication_confirmation_token(
  p_communication_recipient_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
BEGIN
  IF NOT public.has_rbac_permission('communications.send') THEN
    RAISE EXCEPTION 'communications.send required';
  END IF;

  IF p_token_hash IS NULL OR length(p_token_hash) <> 64 THEN
    RAISE EXCEPTION 'invalid token hash';
  END IF;

  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'invalid expiry';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.communication_confirmation_tokens
  WHERE communication_recipient_id = p_communication_recipient_id
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.communication_confirmation_tokens
    SET
      token_hash = p_token_hash,
      expires_at = p_expires_at,
      revoked_at = NULL
    WHERE communication_recipient_id = p_communication_recipient_id;

    RETURN 'replaced';
  END IF;

  INSERT INTO public.communication_confirmation_tokens (
    communication_recipient_id,
    token_hash,
    expires_at
  )
  VALUES (
    p_communication_recipient_id,
    p_token_hash,
    p_expires_at
  );

  RETURN 'created';
EXCEPTION
  WHEN unique_violation THEN
    UPDATE public.communication_confirmation_tokens
    SET
      token_hash = p_token_hash,
      expires_at = p_expires_at,
      revoked_at = NULL
    WHERE communication_recipient_id = p_communication_recipient_id;

    RETURN 'replaced';
END;
$$;

REVOKE ALL ON FUNCTION public.initiate_communication_send(
  uuid, text, text, text, boolean, text, uuid[], text, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.initiate_communication_send(
  uuid, text, text, text, boolean, text, uuid[], text, boolean
) TO authenticated;

REVOKE ALL ON FUNCTION public.issue_communication_confirmation_token(
  uuid, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_communication_confirmation_token(
  uuid, text, timestamptz
) TO authenticated;

-- -----------------------------------------------------------------------------
-- Club enforcement triggers (remove legacy is_admin bypass)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_team_club()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_rbac_permission('teams.manage') OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.current_club_id() IS NULL THEN
    RAISE EXCEPTION 'club membership is required';
  END IF;

  NEW.club_id := public.current_club_id();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_application_club_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_club uuid;
BEGIN
  IF public.has_rbac_permission('applications.manage') OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.current_club_id() IS NULL THEN
    RAISE EXCEPTION 'club membership is required';
  END IF;

  NEW.club_id := public.current_club_id();
  NEW.submitted_by := auth.uid();

  SELECT club_id INTO v_team_club
  FROM public.teams
  WHERE id = NEW.team_id;

  IF v_team_club IS NULL OR v_team_club IS DISTINCT FROM NEW.club_id THEN
    RAISE EXCEPTION 'team does not belong to the current club';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'new';
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.status := OLD.status;
    NEW.tournament_id := OLD.tournament_id;
    NEW.club_id := OLD.club_id;
    NEW.submitted_by := OLD.submitted_by;
  END IF;

  RETURN NEW;
END;
$$;
