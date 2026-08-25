-- Align guest_application_allowed capacity with tournament_occupancy /
-- countConfirmedParticipants semantics.
-- Additive only; does not modify earlier migrations.
--
-- Confirmed participants =
--   accepted applications
--   + confirmed & active external/manual teams
--   - externals whose application_id already maps to an accepted application

CREATE OR REPLACE FUNCTION public.guest_application_allowed(p_tournament_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_archived timestamptz;
  v_open boolean;
  v_max integer;
  v_waitlist boolean;
  v_status public.tournament_status;
  v_start timestamptz;
  v_deadline timestamptz;
  v_confirmed integer;
BEGIN
  IF p_tournament_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.app_setting_flag('applications_enabled', true) THEN
    RETURN false;
  END IF;

  SELECT
    archived_at,
    applications_open,
    max_teams,
    waitlist_enabled,
    status,
    application_start,
    application_deadline
  INTO
    v_archived,
    v_open,
    v_max,
    v_waitlist,
    v_status,
    v_start,
    v_deadline
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_archived IS NOT NULL THEN
    RETURN false;
  END IF;

  IF v_status = 'completed'::public.tournament_status THEN
    RETURN false;
  END IF;

  IF v_open IS NOT TRUE THEN
    RETURN false;
  END IF;

  -- timestamptz vs timestamptz; now() ist timestamptz.
  IF v_start IS NOT NULL AND now() < v_start THEN
    RETURN false;
  END IF;

  IF v_deadline IS NOT NULL AND now() > v_deadline THEN
    RETURN false;
  END IF;

  -- Same confirmed-participant definition as tournament_occupancy().
  SELECT
    (
      (
        SELECT COUNT(*)::integer
        FROM public.applications
        WHERE applications.tournament_id = p_tournament_id
          AND applications.status = 'accepted'::public.application_status
      )
      +
      (
        SELECT COUNT(*)::integer
        FROM public.tournament_external_teams et
        WHERE et.tournament_id = p_tournament_id
          AND et.participation_status = 'confirmed'
          AND et.external_active = true
          AND (
            et.application_id IS NULL
            OR NOT EXISTS (
              SELECT 1
              FROM public.applications mapped
              WHERE mapped.id = et.application_id
                AND mapped.status = 'accepted'::public.application_status
            )
          )
      )
    )
  INTO v_confirmed;

  IF v_max IS NULL OR v_max < 0 THEN
    RETURN true;
  END IF;

  IF v_confirmed < v_max THEN
    RETURN true;
  END IF;

  -- Full: waitlist only when tournament + global waitlist settings allow it.
  RETURN v_waitlist IS TRUE AND public.app_setting_flag('waitlist_enabled', true);
END;
$$;

REVOKE ALL ON FUNCTION public.guest_application_allowed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_application_allowed(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.guest_application_allowed(uuid) IS
  'Guest apply gate. Capacity uses accepted applications + confirmed active external/manual teams without double-counting mapped application_id rows — same semantics as tournament_occupancy().';
