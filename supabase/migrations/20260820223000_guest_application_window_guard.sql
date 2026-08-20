-- =============================================================================
-- VfL Kirchheim Tournament Hub — Gastbewerbung: Status- und Zeitfenster
-- =============================================================================
--
-- AUSFÜHREN:
--   1. Supabase Dashboard öffnen
--   2. SQL Editor
--   3. Diese Datei vollständig einfügen und einmal ausführen
--
-- Bestehende Migrationen NICHT erneut ausführen und NICHT verändern.
-- Diese Datei NICHT selbst gegen Produktion aus dem Agenten ausführen.
--
-- application_start und application_deadline sind timestamptz.
-- Vergleich mit now() (ebenfalls timestamptz), nicht mit einem timezone-losen timestamp.
--
-- Club-INSERT-Policy, bestehende Bewerbungszeilen und SELECT auf applications
-- bleiben unverändert. Anon erhält kein SELECT/UPDATE/DELETE.
-- =============================================================================

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
  v_accepted integer;
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

  SELECT COUNT(*)::integer
  INTO v_accepted
  FROM public.applications
  WHERE tournament_id = p_tournament_id
    AND status = 'accepted'::public.application_status;

  IF v_max IS NULL OR v_max < 0 THEN
    RETURN true;
  END IF;

  IF v_accepted < v_max THEN
    RETURN true;
  END IF;

  RETURN v_waitlist IS TRUE AND public.app_setting_flag('waitlist_enabled', true);
END;
$$;

REVOKE ALL ON FUNCTION public.guest_application_allowed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_application_allowed(uuid) TO anon, authenticated;
