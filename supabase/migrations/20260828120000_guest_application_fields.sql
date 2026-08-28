-- Persist optional guest application fields on public.applications.

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS club_type text,
  ADD COLUMN IF NOT EXISTS alternative_phone text;

DO $$
BEGIN
  ALTER TABLE public.applications
    ADD CONSTRAINT applications_club_type_check
    CHECK (
      club_type IS NULL
      OR club_type IN ('amateur', 'performance', 'youth-academy', 'other')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.create_guest_application(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
  v_id uuid;
  v_club_type text;
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

  v_club_type := NULLIF(btrim(p_payload ->> 'club_type'), '');
  IF v_club_type IS NOT NULL
     AND v_club_type NOT IN ('amateur', 'performance', 'youth-academy', 'other') THEN
    v_club_type := NULL;
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
    v_tournament_id,
    NULL,
    NULL,
    NULL,
    'new'::public.application_status,
    NULLIF(btrim(p_payload ->> 'club_name'), ''),
    NULLIF(btrim(p_payload ->> 'club_city'), ''),
    NULLIF(btrim(p_payload ->> 'website'), ''),
    v_club_type,
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
    NULLIF(btrim(p_payload ->> 'alternative_phone'), ''),
    NULLIF(btrim(p_payload ->> 'staff_count'), '')::integer,
    NULLIF(btrim(p_payload ->> 'notes'), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_guest_application(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_application(jsonb) TO anon;
