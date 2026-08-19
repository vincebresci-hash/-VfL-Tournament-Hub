-- =============================================================================
-- VfL Kirchheim Tournament Hub — initiale Datenbank
-- =============================================================================
--
-- AUSFÜHREN:
--   1. Supabase Dashboard öffnen
--   2. SQL Editor
--   3. Diese Datei vollständig einfügen und einmal ausführen
--
-- NICHT mehrfach ausführen, falls Fehler zu bereits existierenden Typen
-- erscheinen. Tabellen, Policies und Trigger sind weitgehend idempotent.
--
-- ERSTER SUPER-ADMIN (nachdem du dich einmal als Vereinsnutzer registriert hast):
--
--   UPDATE public.profiles
--   SET role = 'super-admin',
--       updated_at = now()
--   WHERE email = 'DEINE-EMAIL@domain.de';
--
-- Keine öffentliche Admin-Registrierung. Rolle niemals über user_metadata setzen.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  CREATE TYPE public.user_role AS ENUM ('club', 'admin', 'super-admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.application_status AS ENUM (
    'new',
    'under-review',
    'accepted',
    'waiting-list',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.tournament_status AS ENUM (
    'coming-soon',
    'active',
    'full',
    'completed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.internal_category AS ENUM ('S', 'A', 'B', 'C');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- -----------------------------------------------------------------------------
-- Updated-at helper
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text,
  website text,
  logo_url text,
  contact_phone text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS clubs_created_by_unique
  ON public.clubs (created_by)
  WHERE created_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  email text,
  role public.user_role NOT NULL DEFAULT 'club',
  club_id uuid REFERENCES public.clubs (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_club_id_idx ON public.profiles (club_id);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);

CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  name text NOT NULL,
  age_group text,
  birth_year integer,
  league text,
  division text,
  self_rated_strength integer,
  trainer_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teams_self_rated_strength_range
    CHECK (
      self_rated_strength IS NULL
      OR (self_rated_strength >= 1 AND self_rated_strength <= 5)
    )
);

CREATE INDEX IF NOT EXISTS teams_club_id_idx ON public.teams (club_id);

CREATE TABLE IF NOT EXISTS public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  age_group text NOT NULL,
  date date NOT NULL,
  location text,
  image_url text,
  max_teams integer,
  status public.tournament_status NOT NULL DEFAULT 'coming-soon',
  application_start timestamptz,
  application_deadline timestamptz,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments (id) ON DELETE RESTRICT,
  club_id uuid NOT NULL REFERENCES public.clubs (id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams (id) ON DELETE RESTRICT,
  submitted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  self_rated_strength integer,
  team_description text,
  contact_first_name text,
  contact_last_name text,
  contact_role text,
  contact_email text,
  contact_phone text,
  staff_count integer,
  notes text,
  status public.application_status NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT applications_self_rated_strength_range
    CHECK (
      self_rated_strength IS NULL
      OR (self_rated_strength >= 1 AND self_rated_strength <= 5)
    ),
  CONSTRAINT applications_staff_count_range
    CHECK (staff_count IS NULL OR staff_count >= 0)
);

CREATE INDEX IF NOT EXISTS applications_club_id_idx ON public.applications (club_id);
CREATE INDEX IF NOT EXISTS applications_tournament_id_idx ON public.applications (tournament_id);
CREATE INDEX IF NOT EXISTS applications_status_idx ON public.applications (status);
CREATE INDEX IF NOT EXISTS applications_team_id_idx ON public.applications (team_id);

CREATE TABLE IF NOT EXISTS public.application_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES public.applications (id) ON DELETE CASCADE,
  internal_category public.internal_category,
  internal_strength integer,
  internal_note text,
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_reviews_internal_strength_range
    CHECK (
      internal_strength IS NULL
      OR (internal_strength >= 1 AND internal_strength <= 5)
    )
);

-- -----------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER, fixed search_path, no RLS recursion)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin'::public.user_role, 'super-admin'::public.user_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'super-admin'::public.user_role
  );
$$;

CREATE OR REPLACE FUNCTION public.current_club_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT club_id
  FROM public.profiles
  WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_profile_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_club_id() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_profile_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_club_id() TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- Auth → profile trigger (always club, never trust metadata.role)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data ->> 'first_name'), ''), ''),
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data ->> 'last_name'), ''), ''),
    NEW.email,
    'club'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing auth users
INSERT INTO public.profiles (id, first_name, last_name, email, role)
SELECT
  users.id,
  COALESCE(NULLIF(TRIM(users.raw_user_meta_data ->> 'first_name'), ''), ''),
  COALESCE(NULLIF(TRIM(users.raw_user_meta_data ->> 'last_name'), ''), ''),
  users.email,
  'club'
FROM auth.users AS users
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Protect profile role / identity columns
-- SQL Editor (auth.uid() IS NULL) may still set the first super-admin.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profile id cannot be changed';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'role cannot be changed';
  END IF;

  IF NOT public.is_admin() THEN
    NEW.email := OLD.email;

    IF OLD.club_id IS NOT NULL THEN
      NEW.club_id := OLD.club_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_columns ON public.profiles;

CREATE TRIGGER protect_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_columns();

-- -----------------------------------------------------------------------------
-- Club / team / application integrity for club users
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_own_club(
  p_name text,
  p_city text DEFAULT NULL,
  p_website text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role public.user_role;
  v_club_id uuid;
  v_name text := NULLIF(TRIM(COALESCE(p_name, '')), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT role, club_id
  INTO v_role, v_club_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_role IS NULL THEN
    INSERT INTO public.profiles (id, email, role)
    VALUES (v_user_id, NULL, 'club')
    ON CONFLICT (id) DO NOTHING;

    SELECT role, club_id
    INTO v_role, v_club_id
    FROM public.profiles
    WHERE id = v_user_id;
  END IF;

  IF v_role IS DISTINCT FROM 'club'::public.user_role THEN
    RAISE EXCEPTION 'only club users can create a club';
  END IF;

  IF v_club_id IS NOT NULL THEN
    RETURN v_club_id;
  END IF;

  SELECT id
  INTO v_club_id
  FROM public.clubs
  WHERE created_by = v_user_id
  LIMIT 1;

  IF v_club_id IS NULL THEN
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'club name is required';
    END IF;

    INSERT INTO public.clubs (name, city, website, created_by)
    VALUES (
      v_name,
      NULLIF(TRIM(COALESCE(p_city, '')), ''),
      NULLIF(TRIM(COALESCE(p_website, '')), ''),
      v_user_id
    )
    RETURNING id INTO v_club_id;
  END IF;

  UPDATE public.profiles
  SET club_id = v_club_id
  WHERE id = v_user_id
    AND club_id IS NULL;

  RETURN v_club_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_own_club(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_own_club(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_team_club()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.current_club_id() IS NULL THEN
    RAISE EXCEPTION 'club membership is required';
  END IF;

  NEW.club_id := public.current_club_id();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_team_club ON public.teams;

CREATE TRIGGER enforce_team_club
  BEFORE INSERT OR UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_team_club();

CREATE OR REPLACE FUNCTION public.enforce_application_club_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_club uuid;
BEGIN
  IF public.is_admin() OR auth.uid() IS NULL THEN
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

DROP TRIGGER IF EXISTS enforce_application_club_rules ON public.applications;

CREATE TRIGGER enforce_application_club_rules
  BEFORE INSERT OR UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_application_club_rules();

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS set_clubs_updated_at ON public.clubs;
CREATE TRIGGER set_clubs_updated_at
  BEFORE UPDATE ON public.clubs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_teams_updated_at ON public.teams;
CREATE TRIGGER set_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_tournaments_updated_at ON public.tournaments;
CREATE TRIGGER set_tournaments_updated_at
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_applications_updated_at ON public.applications;
CREATE TRIGGER set_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_application_reviews_updated_at ON public.application_reviews;
CREATE TRIGGER set_application_reviews_updated_at
  BEFORE UPDATE ON public.application_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
CREATE POLICY profiles_select_own_or_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS profiles_update_own_or_admin ON public.profiles;
CREATE POLICY profiles_update_own_or_admin
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS clubs_select_own_or_admin ON public.clubs;
CREATE POLICY clubs_select_own_or_admin
  ON public.clubs
  FOR SELECT
  TO authenticated
  USING (
    id = public.current_club_id()
    OR created_by = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS clubs_insert_own ON public.clubs;
CREATE POLICY clubs_insert_own
  ON public.clubs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.current_profile_role() = 'club'::public.user_role
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS clubs_update_own_or_admin ON public.clubs;
CREATE POLICY clubs_update_own_or_admin
  ON public.clubs
  FOR UPDATE
  TO authenticated
  USING (id = public.current_club_id() OR public.is_admin())
  WITH CHECK (id = public.current_club_id() OR public.is_admin());

DROP POLICY IF EXISTS teams_select_own_or_admin ON public.teams;
CREATE POLICY teams_select_own_or_admin
  ON public.teams
  FOR SELECT
  TO authenticated
  USING (club_id = public.current_club_id() OR public.is_admin());

DROP POLICY IF EXISTS teams_insert_own ON public.teams;
CREATE POLICY teams_insert_own
  ON public.teams
  FOR INSERT
  TO authenticated
  WITH CHECK (club_id = public.current_club_id() OR public.is_admin());

DROP POLICY IF EXISTS teams_update_own_or_admin ON public.teams;
CREATE POLICY teams_update_own_or_admin
  ON public.teams
  FOR UPDATE
  TO authenticated
  USING (club_id = public.current_club_id() OR public.is_admin())
  WITH CHECK (club_id = public.current_club_id() OR public.is_admin());

DROP POLICY IF EXISTS teams_delete_own_or_admin ON public.teams;
CREATE POLICY teams_delete_own_or_admin
  ON public.teams
  FOR DELETE
  TO authenticated
  USING (club_id = public.current_club_id() OR public.is_admin());

DROP POLICY IF EXISTS tournaments_select_public ON public.tournaments;
CREATE POLICY tournaments_select_public
  ON public.tournaments
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS tournaments_write_admin ON public.tournaments;
CREATE POLICY tournaments_write_admin
  ON public.tournaments
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS applications_select_own_or_admin ON public.applications;
CREATE POLICY applications_select_own_or_admin
  ON public.applications
  FOR SELECT
  TO authenticated
  USING (club_id = public.current_club_id() OR public.is_admin());

DROP POLICY IF EXISTS applications_insert_own ON public.applications;
CREATE POLICY applications_insert_own
  ON public.applications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      club_id = public.current_club_id()
      AND submitted_by = auth.uid()
      AND status = 'new'::public.application_status
    )
  );

DROP POLICY IF EXISTS applications_update_own_or_admin ON public.applications;
CREATE POLICY applications_update_own_or_admin
  ON public.applications
  FOR UPDATE
  TO authenticated
  USING (club_id = public.current_club_id() OR public.is_admin())
  WITH CHECK (club_id = public.current_club_id() OR public.is_admin());

DROP POLICY IF EXISTS application_reviews_admin_all ON public.application_reviews;
CREATE POLICY application_reviews_admin_all
  ON public.application_reviews
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON TABLE public.tournaments TO anon, authenticated;

GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.clubs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournaments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.applications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.application_reviews TO authenticated;

-- -----------------------------------------------------------------------------
-- Seed public tournaments (same slugs as the existing website)
-- Counters are not stored; admins calculate them from applications.
-- -----------------------------------------------------------------------------

INSERT INTO public.tournaments (
  slug,
  name,
  age_group,
  date,
  location,
  image_url,
  max_teams,
  status,
  application_start,
  application_deadline,
  description
)
VALUES
  (
    'u8-mini-cup',
    'U8 Mini Cup',
    'U8',
    '2026-09-13',
    'Sportpark Kirchheim',
    '/u8.png',
    12,
    'coming-soon',
    '2026-08-25T00:00:00+02:00',
    '2026-09-06T23:59:59+02:00',
    'Ein erster Turniertag für die jüngsten Jahrgänge im Sportpark Kirchheim. Die Bewerbungsphase öffnet in Kürze.'
  ),
  (
    'u9-sommer-cup',
    'U9 Sommer Cup',
    'U9',
    '2026-09-20',
    'Sportpark Kirchheim',
    '/u9.png',
    16,
    'active',
    '2026-08-01T00:00:00+02:00',
    '2026-09-10T23:59:59+02:00',
    'Unser Sommerturnier für die U9. Vereine können sich jetzt bewerben. Die endgültige Teilnehmerliste stellt der VfL zusammen.'
  ),
  (
    'u10-herbst-cup',
    'U10 Herbst Cup',
    'U10',
    '2026-10-04',
    'Sportpark Kirchheim',
    '/u10.png',
    20,
    'active',
    '2026-08-10T00:00:00+02:00',
    '2026-09-25T23:59:59+02:00',
    'Bewerbungsphase geöffnet. Nach dem Bewerbungsschluss entscheidet der VfL über die Zusammensetzung des Teilnehmerfelds.'
  ),
  (
    'u11-kirchheim-cup',
    'U11 Kirchheim Cup',
    'U11',
    '2026-10-18',
    'Sportpark Kirchheim',
    '/u11.png',
    20,
    'coming-soon',
    '2026-09-01T00:00:00+02:00',
    '2026-10-05T23:59:59+02:00',
    'Der Kirchheim Cup für die U11. Die Bewerbung startet zu gegebener Zeit. Eine Teilnahme ist erst nach Bestätigung durch den VfL möglich.'
  ),
  (
    'u12-master-cup',
    'U12 Master Cup',
    'U12',
    '2026-10-25',
    'Sportpark Kirchheim',
    '/u12.png',
    16,
    'full',
    '2026-07-15T00:00:00+02:00',
    '2026-08-10T23:59:59+02:00',
    'Das Teilnehmerfeld für den Master Cup ist vollständig. Eine Warteliste kann später über den Adminbereich geführt werden.'
  ),
  (
    'u13-challenge-cup',
    'U13 Challenge Cup',
    'U13',
    '2026-11-08',
    'Sportpark Kirchheim',
    '/u13.png',
    16,
    'coming-soon',
    '2026-09-15T00:00:00+02:00',
    '2026-10-20T23:59:59+02:00',
    'Anspruchsvolles Turnier für die U13. Die Bewerbungsphase wird rechtzeitig geöffnet.'
  ),
  (
    'u14-elite-cup',
    'U14 Elite Cup',
    'U14',
    '2026-05-17',
    'Sportpark Kirchheim',
    '/u14.png',
    16,
    'completed',
    '2026-03-01T00:00:00+01:00',
    '2026-04-20T23:59:59+02:00',
    'Der Elite Cup 2026 ist abgeschlossen. Ergebnisse, Platzierungen und Bilder folgen in einem späteren Schritt.'
  )
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  age_group = EXCLUDED.age_group,
  date = EXCLUDED.date,
  location = EXCLUDED.location,
  image_url = EXCLUDED.image_url,
  max_teams = EXCLUDED.max_teams,
  status = EXCLUDED.status,
  application_start = EXCLUDED.application_start,
  application_deadline = EXCLUDED.application_deadline,
  description = EXCLUDED.description;
