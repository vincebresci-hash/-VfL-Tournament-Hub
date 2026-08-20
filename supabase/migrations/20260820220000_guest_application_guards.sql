-- =============================================================================
-- VfL Kirchheim Tournament Hub — Gastbewerbung absichern
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
-- Club-INSERT-Policy bleibt unverändert.
-- Anon erhält kein SELECT/UPDATE/DELETE auf applications.
-- =============================================================================

-- Öffentliche Settings nur für unkritische Schlüssel.
-- dashboard_show_new_applications und default_application_status bleiben Admin-only.
GRANT SELECT ON TABLE public.app_settings TO anon, authenticated;

DROP POLICY IF EXISTS app_settings_select_public ON public.app_settings;
CREATE POLICY app_settings_select_public
  ON public.app_settings
  FOR SELECT
  TO anon, authenticated
  USING (
    key IN (
      'applications_enabled',
      'waitlist_enabled',
      'application_confirmation_enabled',
      'platform_name',
      'organizer_name',
      'contact_email',
      'contact_phone'
    )
  );

CREATE OR REPLACE FUNCTION public.app_setting_flag(p_key text, p_default boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  SELECT value INTO v
  FROM public.app_settings
  WHERE key = p_key;

  IF NOT FOUND OR v IS NULL THEN
    RETURN p_default;
  END IF;

  IF jsonb_typeof(v) = 'boolean' THEN
    RETURN (v = 'true'::jsonb);
  END IF;

  IF jsonb_typeof(v) = 'string' THEN
    RETURN lower(trim(both '"' from v::text)) IN ('true', '1', 'yes');
  END IF;

  RETURN p_default;
END;
$$;

REVOKE ALL ON FUNCTION public.app_setting_flag(text, boolean) FROM PUBLIC;

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
  v_accepted integer;
BEGIN
  IF p_tournament_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.app_setting_flag('applications_enabled', true) THEN
    RETURN false;
  END IF;

  SELECT archived_at, applications_open, max_teams, waitlist_enabled
  INTO v_archived, v_open, v_max, v_waitlist
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_archived IS NOT NULL OR v_open IS NOT TRUE THEN
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

DROP POLICY IF EXISTS applications_insert_guest ON public.applications;
CREATE POLICY applications_insert_guest
  ON public.applications
  FOR INSERT
  TO anon
  WITH CHECK (
    submitted_by IS NULL
    AND club_id IS NULL
    AND team_id IS NULL
    AND status = 'new'::public.application_status
    AND contact_email IS NOT NULL
    AND length(trim(contact_email)) > 0
    AND club_name IS NOT NULL
    AND length(trim(club_name)) > 0
    AND team_name IS NOT NULL
    AND length(trim(team_name)) > 0
    AND public.guest_application_allowed(tournament_id)
  );

CREATE OR REPLACE FUNCTION public.create_guest_application(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
  v_id uuid;
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

  IF NULLIF(btrim(p_payload ->> 'club_name'), '') IS NULL
     OR NULLIF(btrim(p_payload ->> 'team_name'), '') IS NULL
     OR NULLIF(btrim(p_payload ->> 'contact_email'), '') IS NULL THEN
    RAISE EXCEPTION 'Bewerbungen für dieses Turnier sind derzeit nicht möglich.';
  END IF;

  INSERT INTO public.applications (
    tournament_id,
    club_id,
    team_id,
    submitted_by,
    status,
    club_name,
    club_city,
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
    NULLIF(btrim(p_payload ->> 'team_name'), ''),
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
    NULLIF(btrim(p_payload ->> 'staff_count'), '')::integer,
    NULLIF(btrim(p_payload ->> 'notes'), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_guest_application(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_application(jsonb) TO anon;

CREATE OR REPLACE FUNCTION public.active_email_template(p_type public.email_template_type)
RETURNS TABLE (id uuid, subject text, body text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email_templates.id, email_templates.subject, email_templates.body
  FROM public.email_templates
  WHERE p_type = 'application-received'::public.email_template_type
    AND email_templates.type = p_type
    AND email_templates.active = true
  ORDER BY email_templates.updated_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.active_email_template(public.email_template_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.active_email_template(public.email_template_type) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_application_received_email(
  p_application_id uuid,
  p_to_email text,
  p_template_id uuid,
  p_subject text,
  p_body text,
  p_status text,
  p_error text,
  p_provider text,
  p_provider_message_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_created timestamptz;
  v_app_status public.application_status;
BEGIN
  IF p_status NOT IN ('sent', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'Ungültiger E-Mail-Status.';
  END IF;

  SELECT contact_email, created_at, status
  INTO v_email, v_created, v_app_status
  FROM public.applications
  WHERE id = p_application_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Die Bewerbung wurde nicht gefunden.';
  END IF;

  IF lower(btrim(v_email)) IS DISTINCT FROM lower(btrim(p_to_email)) THEN
    RAISE EXCEPTION 'Die E-Mail-Adresse stimmt nicht überein.';
  END IF;

  IF v_app_status IS DISTINCT FROM 'new'::public.application_status THEN
    RAISE EXCEPTION 'Die Bewerbung kann nicht bestätigt werden.';
  END IF;

  IF v_created < timezone('utc', now()) - interval '15 minutes' THEN
    RAISE EXCEPTION 'Die Bewerbung ist zu alt für das Versandprotokoll.';
  END IF;

  INSERT INTO public.email_logs (
    application_id,
    template_id,
    template_type,
    to_email,
    subject,
    body,
    status,
    error,
    provider,
    provider_message_id,
    created_by
  )
  VALUES (
    p_application_id,
    p_template_id,
    'application-received'::public.email_template_type,
    btrim(p_to_email),
    p_subject,
    p_body,
    p_status,
    p_error,
    p_provider,
    p_provider_message_id,
    auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_application_received_email(
  uuid, text, uuid, text, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_application_received_email(
  uuid, text, uuid, text, text, text, text, text, text
) TO anon, authenticated;
