-- =============================================================================
-- PR-B: Atomic multi-team application submission RPCs
-- Repository only. Do NOT apply automatically.
-- Creates ordinary applications rows only. No parent/child model.
-- No table INSERT grants to anon. No RLS/RBAC changes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Guest batch: anon-only, reuses guest_application_allowed + tournament flag
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_guest_applications(
  p_payload jsonb,
  p_team_names text[]
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
  v_club_type text;
  v_allow_multiple boolean;
  v_count integer;
  v_name text;
  v_names text[] := ARRAY[]::text[];
  v_seen text[] := ARRAY[]::text[];
  v_ids uuid[] := ARRAY[]::uuid[];
  v_id uuid;
  v_normalized text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Gastbewerbungen sind nur ohne Anmeldung möglich.';
  END IF;

  BEGIN
    v_tournament_id := NULLIF(btrim(p_payload ->> 'tournament_id'), '')::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Bewerbungen für dieses Turnier sind derzeit nicht möglich.';
  END;

  IF v_tournament_id IS NULL OR NOT public.guest_application_allowed(v_tournament_id) THEN
    RAISE EXCEPTION 'Bewerbungen für dieses Turnier sind derzeit nicht möglich.';
  END IF;

  SELECT allow_multiple_teams
  INTO v_allow_multiple
  FROM public.tournaments
  WHERE id = v_tournament_id;

  IF v_allow_multiple IS NOT TRUE THEN
    RAISE EXCEPTION 'Mehrfachmeldungen sind für dieses Turnier nicht freigeschaltet.';
  END IF;

  IF p_team_names IS NULL THEN
    RAISE EXCEPTION 'Ungültige Mannschaftsanzahl.';
  END IF;

  v_count := cardinality(p_team_names);
  IF v_count IS NULL OR v_count < 2 OR v_count > 3 THEN
    RAISE EXCEPTION 'Ungültige Mannschaftsanzahl.';
  END IF;

  IF NULLIF(btrim(p_payload ->> 'club_name'), '') IS NULL
     OR NULLIF(btrim(p_payload ->> 'contact_email'), '') IS NULL THEN
    RAISE EXCEPTION 'Bewerbungen für dieses Turnier sind derzeit nicht möglich.';
  END IF;

  FOREACH v_name IN ARRAY p_team_names
  LOOP
    v_normalized := NULLIF(btrim(v_name), '');
    IF v_normalized IS NULL THEN
      RAISE EXCEPTION 'Bewerbungen für dieses Turnier sind derzeit nicht möglich.';
    END IF;
    IF lower(v_normalized) = ANY (v_seen) THEN
      RAISE EXCEPTION 'Mannschaftsnamen müssen eindeutig sein.';
    END IF;
    v_seen := array_append(v_seen, lower(v_normalized));
    v_names := array_append(v_names, v_normalized);
  END LOOP;

  v_club_type := NULLIF(btrim(p_payload ->> 'club_type'), '');
  IF v_club_type IS NOT NULL
     AND v_club_type NOT IN ('amateur', 'performance', 'youth-academy', 'other') THEN
    v_club_type := NULL;
  END IF;

  FOREACH v_name IN ARRAY v_names
  LOOP
    INSERT INTO public.applications (
      tournament_id,
      club_id,
      team_id,
      submitted_by,
      status,
      club_name,
      club_city,
      website,
      club_type,
      team_name,
      age_group,
      birth_year,
      league,
      division,
      self_rated_strength,
      team_description,
      contact_first_name,
      contact_last_name,
      contact_role,
      contact_email,
      contact_phone,
      alternative_phone,
      staff_count,
      notes
    )
    VALUES (
      v_tournament_id,
      NULL,
      NULL,
      NULL,
      'new'::public.application_status,
      NULLIF(btrim(p_payload ->> 'club_name'), ''),
      NULLIF(btrim(p_payload ->> 'club_city'), ''),
      NULLIF(btrim(p_payload ->> 'website'), ''),
      v_club_type,
      v_name,
      NULLIF(btrim(p_payload ->> 'age_group'), ''),
      NULLIF(btrim(p_payload ->> 'birth_year'), '')::integer,
      NULLIF(btrim(p_payload ->> 'league'), ''),
      NULLIF(btrim(p_payload ->> 'division'), ''),
      NULLIF(btrim(p_payload ->> 'self_rated_strength'), '')::integer,
      NULLIF(btrim(p_payload ->> 'team_description'), ''),
      NULLIF(btrim(p_payload ->> 'contact_first_name'), ''),
      NULLIF(btrim(p_payload ->> 'contact_last_name'), ''),
      NULLIF(btrim(p_payload ->> 'contact_role'), ''),
      NULLIF(btrim(p_payload ->> 'contact_email'), ''),
      NULLIF(btrim(p_payload ->> 'contact_phone'), ''),
      NULLIF(btrim(p_payload ->> 'alternative_phone'), ''),
      NULLIF(btrim(p_payload ->> 'staff_count'), '')::integer,
      NULLIF(btrim(p_payload ->> 'notes'), '')
    )
    RETURNING id INTO v_id;

    v_ids := array_append(v_ids, v_id);
  END LOOP;

  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.create_guest_applications(jsonb, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_applications(jsonb, text[]) TO anon;

COMMENT ON FUNCTION public.create_guest_applications(jsonb, text[]) IS
  'PR-B: Atomic guest multi-team application insert (2–3 ordinary rows). Requires tournaments.allow_multiple_teams.';

-- -----------------------------------------------------------------------------
-- Club batch: authenticated, verifies club ownership of distinct team IDs
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_club_applications(
  p_tournament_id uuid,
  p_team_ids uuid[],
  p_payload jsonb
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_club_id uuid;
  v_allow_multiple boolean;
  v_count integer;
  v_team_id uuid;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_ids uuid[] := ARRAY[]::uuid[];
  v_id uuid;
  v_team record;
  v_existing uuid;
  v_club_type text;
  v_age_group text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Anmeldung erforderlich.';
  END IF;

  v_club_id := public.current_club_id();
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Dein Verein konnte nicht zugeordnet werden.';
  END IF;

  IF p_tournament_id IS NULL THEN
    RAISE EXCEPTION 'Bewerbungen für dieses Turnier sind derzeit nicht möglich.';
  END IF;

  -- Same availability gate as guest path (applications open / capacity / waitlist).
  IF NOT public.guest_application_allowed(p_tournament_id) THEN
    RAISE EXCEPTION 'Bewerbungen für dieses Turnier sind derzeit nicht möglich.';
  END IF;

  SELECT allow_multiple_teams
  INTO v_allow_multiple
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF v_allow_multiple IS NOT TRUE THEN
    RAISE EXCEPTION 'Mehrfachmeldungen sind für dieses Turnier nicht freigeschaltet.';
  END IF;

  IF p_team_ids IS NULL THEN
    RAISE EXCEPTION 'Ungültige Mannschaftsauswahl.';
  END IF;

  v_count := cardinality(p_team_ids);
  IF v_count IS NULL OR v_count < 2 OR v_count > 3 THEN
    RAISE EXCEPTION 'Ungültige Mannschaftsauswahl.';
  END IF;

  IF NULLIF(btrim(p_payload ->> 'club_name'), '') IS NULL
     OR NULLIF(btrim(p_payload ->> 'contact_email'), '') IS NULL THEN
    RAISE EXCEPTION 'Bewerbungen für dieses Turnier sind derzeit nicht möglich.';
  END IF;

  v_club_type := NULLIF(btrim(p_payload ->> 'club_type'), '');
  IF v_club_type IS NOT NULL
     AND v_club_type NOT IN ('amateur', 'performance', 'youth-academy', 'other') THEN
    v_club_type := NULL;
  END IF;

  v_age_group := NULLIF(btrim(p_payload ->> 'age_group'), '');

  FOREACH v_team_id IN ARRAY p_team_ids
  LOOP
    IF v_team_id IS NULL THEN
      RAISE EXCEPTION 'Ungültige Mannschaftsauswahl.';
    END IF;
    IF v_team_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'Jede Mannschaft darf nur einmal ausgewählt werden.';
    END IF;
    v_seen := array_append(v_seen, v_team_id);

    SELECT t.id, t.club_id, t.name, t.age_group, t.birth_year, t.league, t.division, t.self_rated_strength
    INTO v_team
    FROM public.teams t
    WHERE t.id = v_team_id;

    IF NOT FOUND OR v_team.club_id IS DISTINCT FROM v_club_id THEN
      RAISE EXCEPTION 'Die ausgewählte Mannschaft gehört nicht zu deinem Verein.';
    END IF;

    SELECT a.id
    INTO v_existing
    FROM public.applications a
    WHERE a.tournament_id = p_tournament_id
      AND a.team_id = v_team_id
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      RAISE EXCEPTION 'Diese Mannschaft wurde bereits für dieses Turnier angemeldet.';
    END IF;

    INSERT INTO public.applications (
      tournament_id,
      club_id,
      team_id,
      submitted_by,
      status,
      club_name,
      club_city,
      website,
      club_type,
      team_name,
      age_group,
      birth_year,
      league,
      division,
      self_rated_strength,
      team_description,
      contact_first_name,
      contact_last_name,
      contact_role,
      contact_email,
      contact_phone,
      alternative_phone,
      staff_count,
      notes
    )
    VALUES (
      p_tournament_id,
      v_club_id,
      v_team.id,
      v_user_id,
      'new'::public.application_status,
      NULLIF(btrim(p_payload ->> 'club_name'), ''),
      NULLIF(btrim(p_payload ->> 'club_city'), ''),
      NULLIF(btrim(p_payload ->> 'website'), ''),
      v_club_type,
      NULLIF(btrim(v_team.name), ''),
      COALESCE(v_age_group, NULLIF(btrim(v_team.age_group), '')),
      COALESCE(
        NULLIF(btrim(p_payload ->> 'birth_year'), '')::integer,
        v_team.birth_year
      ),
      COALESCE(NULLIF(btrim(p_payload ->> 'league'), ''), NULLIF(btrim(v_team.league), '')),
      COALESCE(NULLIF(btrim(p_payload ->> 'division'), ''), NULLIF(btrim(v_team.division), '')),
      COALESCE(
        NULLIF(btrim(p_payload ->> 'self_rated_strength'), '')::integer,
        v_team.self_rated_strength
      ),
      NULLIF(btrim(p_payload ->> 'team_description'), ''),
      NULLIF(btrim(p_payload ->> 'contact_first_name'), ''),
      NULLIF(btrim(p_payload ->> 'contact_last_name'), ''),
      NULLIF(btrim(p_payload ->> 'contact_role'), ''),
      NULLIF(btrim(p_payload ->> 'contact_email'), ''),
      NULLIF(btrim(p_payload ->> 'contact_phone'), ''),
      NULLIF(btrim(p_payload ->> 'alternative_phone'), ''),
      NULLIF(btrim(p_payload ->> 'staff_count'), '')::integer,
      NULLIF(btrim(p_payload ->> 'notes'), '')
    )
    RETURNING id INTO v_id;

    v_ids := array_append(v_ids, v_id);
  END LOOP;

  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.create_club_applications(uuid, uuid[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_club_applications(uuid, uuid[], jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_club_applications(uuid, uuid[], jsonb) IS
  'PR-B: Atomic club multi-team application insert (2–3 ordinary rows for distinct owned team_ids). Requires tournaments.allow_multiple_teams.';
