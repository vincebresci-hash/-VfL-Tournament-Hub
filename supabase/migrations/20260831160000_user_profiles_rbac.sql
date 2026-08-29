-- =============================================================================
-- User profiles + RBAC (roles & permissions)
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.is_active IS
  'Inactive users cannot retain privileged access.';

-- -----------------------------------------------------------------------------
-- RBAC catalog tables
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rbac_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_platform_role boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rbac_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rbac_role_permissions (
  role_id uuid NOT NULL REFERENCES public.rbac_roles (id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.rbac_permissions (id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.rbac_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.rbac_roles (id) ON DELETE CASCADE,
  club_id uuid REFERENCES public.clubs (id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (user_id, role_id, club_id)
);

CREATE TABLE IF NOT EXISTS public.rbac_user_team_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, team_id)
);

CREATE TABLE IF NOT EXISTS public.rbac_user_permission_overrides (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.rbac_permissions (id) ON DELETE CASCADE,
  granted boolean NOT NULL,
  assigned_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_id)
);

ALTER TABLE public.rbac_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rbac_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rbac_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rbac_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rbac_user_team_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rbac_user_permission_overrides ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Seed permissions
-- -----------------------------------------------------------------------------

INSERT INTO public.rbac_permissions (key, name, category) VALUES
  ('users.view', 'Benutzer ansehen', 'users'),
  ('users.manage', 'Benutzer verwalten', 'users'),
  ('roles.manage', 'Rollen verwalten', 'users'),
  ('tournaments.view', 'Turniere ansehen', 'tournaments'),
  ('tournaments.manage', 'Turniere verwalten', 'tournaments'),
  ('applications.view', 'Bewerbungen ansehen', 'applications'),
  ('applications.manage', 'Bewerbungen verwalten', 'applications'),
  ('applications.decide', 'Bewerbungen entscheiden', 'applications'),
  ('payments.view', 'Zahlungen ansehen', 'payments'),
  ('payments.manage', 'Zahlungen verwalten', 'payments'),
  ('communications.view', 'Kommunikation ansehen', 'communications'),
  ('communications.send', 'Kommunikation senden', 'communications'),
  ('schedule.view', 'Spielplan ansehen', 'schedule'),
  ('schedule.manage', 'Spielplan verwalten', 'schedule'),
  ('results.view', 'Ergebnisse ansehen', 'results'),
  ('results.manage', 'Ergebnisse verwalten', 'results'),
  ('news.view', 'News ansehen', 'news'),
  ('news.manage', 'News verwalten', 'news'),
  ('clubs.view', 'Vereine ansehen', 'clubs'),
  ('clubs.manage', 'Vereine verwalten', 'clubs'),
  ('teams.view', 'Teams ansehen', 'teams'),
  ('teams.manage', 'Teams verwalten', 'teams'),
  ('cancellations.view', 'Absagen ansehen', 'cancellations'),
  ('cancellations.decide', 'Absagen entscheiden', 'cancellations')
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Seed roles
-- -----------------------------------------------------------------------------

INSERT INTO public.rbac_roles (key, name, description, is_platform_role) VALUES
  ('SUPER_ADMIN', 'Super Admin', 'Voller Plattformzugriff inkl. Rollenverwaltung.', true),
  ('ADMIN', 'Admin', 'Plattform-Admin mit zugewiesenen Berechtigungen.', true),
  ('TOURNAMENT_MANAGER', 'Turnierleitung', 'Turniere, Spielplan und Ergebnisse.', true),
  ('APPLICATION_MANAGER', 'Bewerbungsmanagement', 'Bewerbungen und Absagen.', true),
  ('FINANCE_MANAGER', 'Finanzen', 'Zahlungsstatus und interne Zahlungsnotizen.', true),
  ('COMMUNICATION_MANAGER', 'Kommunikation', 'E-Mails und Vereinskommunikation.', true),
  ('CLUB_ADMIN', 'Vereinsadmin', 'Eigener Verein.', false),
  ('TEAM_MANAGER', 'Team-Manager', 'Zugewiesene Teams im eigenen Verein.', false)
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Role -> permission mappings
-- -----------------------------------------------------------------------------

INSERT INTO public.rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.rbac_roles r
CROSS JOIN public.rbac_permissions p
WHERE r.key = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO public.rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.rbac_roles r
JOIN public.rbac_permissions p ON p.key <> 'roles.manage'
WHERE r.key = 'ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO public.rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.rbac_roles r
JOIN public.rbac_permissions p ON p.key IN (
  'tournaments.view', 'tournaments.manage',
  'schedule.view', 'schedule.manage',
  'results.view', 'results.manage'
)
WHERE r.key = 'TOURNAMENT_MANAGER'
ON CONFLICT DO NOTHING;

INSERT INTO public.rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.rbac_roles r
JOIN public.rbac_permissions p ON p.key IN (
  'applications.view', 'applications.manage', 'applications.decide',
  'cancellations.view', 'cancellations.decide'
)
WHERE r.key = 'APPLICATION_MANAGER'
ON CONFLICT DO NOTHING;

INSERT INTO public.rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.rbac_roles r
JOIN public.rbac_permissions p ON p.key IN ('payments.view', 'payments.manage')
WHERE r.key = 'FINANCE_MANAGER'
ON CONFLICT DO NOTHING;

INSERT INTO public.rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.rbac_roles r
JOIN public.rbac_permissions p ON p.key IN (
  'communications.view', 'communications.send',
  'news.view', 'news.manage'
)
WHERE r.key = 'COMMUNICATION_MANAGER'
ON CONFLICT DO NOTHING;

INSERT INTO public.rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.rbac_roles r
JOIN public.rbac_permissions p ON p.key IN (
  'clubs.view', 'teams.view', 'teams.manage',
  'applications.view', 'schedule.view', 'results.view'
)
WHERE r.key = 'CLUB_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO public.rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.rbac_roles r
JOIN public.rbac_permissions p ON p.key IN (
  'teams.view', 'schedule.view', 'results.view', 'communications.view'
)
WHERE r.key = 'TEAM_MANAGER'
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migrate existing users from profiles.role (reliable source of truth today)
-- -----------------------------------------------------------------------------

INSERT INTO public.rbac_user_roles (user_id, role_id, club_id)
SELECT p.id, r.id, NULL
FROM public.profiles p
JOIN public.rbac_roles r ON r.key = 'SUPER_ADMIN'
WHERE p.role = 'super-admin'::public.user_role
ON CONFLICT DO NOTHING;

INSERT INTO public.rbac_user_roles (user_id, role_id, club_id)
SELECT p.id, r.id, NULL
FROM public.profiles p
JOIN public.rbac_roles r ON r.key = 'ADMIN'
WHERE p.role = 'admin'::public.user_role
ON CONFLICT DO NOTHING;

INSERT INTO public.rbac_user_roles (user_id, role_id, club_id)
SELECT p.id, r.id, p.club_id
FROM public.profiles p
JOIN public.rbac_roles r ON r.key = 'CLUB_ADMIN'
WHERE p.role = 'club'::public.user_role
  AND p.club_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Auth helper functions
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_profile_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT is_active
      FROM public.profiles
      WHERE id = auth.uid()
    ),
    false
  );
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
      AND is_active = true
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
      AND is_active = true
      AND role = 'super-admin'::public.user_role
  );
$$;

CREATE OR REPLACE FUNCTION public.has_rbac_permission(
  p_permission text,
  p_club_id uuid DEFAULT NULL,
  p_team_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_permission_id uuid;
  v_override boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.is_profile_active() THEN
    RETURN false;
  END IF;

  IF public.is_super_admin() THEN
    RETURN true;
  END IF;

  SELECT id INTO v_permission_id
  FROM public.rbac_permissions
  WHERE key = p_permission;

  IF v_permission_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT granted INTO v_override
  FROM public.rbac_user_permission_overrides
  WHERE user_id = v_user_id
    AND permission_id = v_permission_id;

  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  IF p_team_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.rbac_user_team_assignments uta
      JOIN public.teams t ON t.id = uta.team_id
      WHERE uta.user_id = v_user_id
        AND uta.team_id = p_team_id
        AND (
          public.is_admin()
          OR t.club_id = public.current_club_id()
        )
    ) THEN
      RETURN false;
    END IF;
  END IF;

  IF p_club_id IS NOT NULL AND NOT public.is_admin() THEN
    IF public.current_club_id() IS DISTINCT FROM p_club_id THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.rbac_user_roles ur
    JOIN public.rbac_role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = v_user_id
      AND rp.permission_id = v_permission_id
      AND (
        ur.club_id IS NULL
        OR p_club_id IS NULL
        OR ur.club_id = p_club_id
        OR ur.club_id = public.current_club_id()
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.count_active_super_admins(
  p_exclude_user_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.profiles
  WHERE role = 'super-admin'::public.user_role
    AND is_active = true
    AND (p_exclude_user_id IS NULL OR id <> p_exclude_user_id);
$$;

-- -----------------------------------------------------------------------------
-- Privileged management RPCs (super-admin only, escalation-safe)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rbac_set_user_active(
  p_user_id uuid,
  p_is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'roles.manage required';
  END IF;

  IF p_user_id = auth.uid() AND p_is_active = false THEN
    RAISE EXCEPTION 'cannot deactivate own account';
  END IF;

  IF p_is_active = false THEN
    IF (
      SELECT role
      FROM public.profiles
      WHERE id = p_user_id
    ) = 'super-admin'::public.user_role
    AND public.count_active_super_admins(p_user_id) < 1 THEN
      RAISE EXCEPTION 'cannot deactivate last super admin';
    END IF;
  END IF;

  UPDATE public.profiles
  SET
    is_active = p_is_active,
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_assign_user_role(
  p_user_id uuid,
  p_role_key text,
  p_club_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_is_platform boolean;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'roles.manage required';
  END IF;

  IF p_user_id = auth.uid() AND p_role_key = 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'cannot self-assign super admin';
  END IF;

  SELECT id, is_platform_role
  INTO v_role_id, v_is_platform
  FROM public.rbac_roles
  WHERE key = p_role_key;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'unknown role';
  END IF;

  IF p_role_key = 'SUPER_ADMIN' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'super admin required';
  END IF;

  IF NOT v_is_platform AND p_club_id IS NULL THEN
    RAISE EXCEPTION 'club_id required for club role';
  END IF;

  IF v_is_platform AND p_club_id IS NOT NULL THEN
    RAISE EXCEPTION 'club_id not allowed for platform role';
  END IF;

  INSERT INTO public.rbac_user_roles (user_id, role_id, club_id, assigned_by)
  VALUES (p_user_id, v_role_id, p_club_id, auth.uid())
  ON CONFLICT DO NOTHING;

  IF v_is_platform THEN
    UPDATE public.profiles
    SET
      role = CASE
        WHEN p_role_key = 'SUPER_ADMIN' THEN 'super-admin'::public.user_role
        ELSE 'admin'::public.user_role
      END,
      updated_at = now()
    WHERE id = p_user_id;
  ELSE
    UPDATE public.profiles
    SET
      role = 'club'::public.user_role,
      club_id = COALESCE(p_club_id, club_id),
      updated_at = now()
    WHERE id = p_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_revoke_user_role(
  p_user_id uuid,
  p_role_key text,
  p_club_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'roles.manage required';
  END IF;

  IF p_role_key = 'SUPER_ADMIN' THEN
    IF (
      SELECT role
      FROM public.profiles
      WHERE id = p_user_id
    ) = 'super-admin'::public.user_role
    AND public.count_active_super_admins(p_user_id) < 1 THEN
      RAISE EXCEPTION 'cannot remove last super admin';
    END IF;
  END IF;

  SELECT id INTO v_role_id
  FROM public.rbac_roles
  WHERE key = p_role_key;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'unknown role';
  END IF;

  DELETE FROM public.rbac_user_roles
  WHERE user_id = p_user_id
    AND role_id = v_role_id
    AND (
      (p_club_id IS NULL AND club_id IS NULL)
      OR club_id = p_club_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_assign_team(
  p_user_id uuid,
  p_team_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_club_id uuid;
  v_user_club_id uuid;
BEGIN
  IF NOT public.is_super_admin() AND NOT public.has_rbac_permission('teams.manage', NULL, NULL) THEN
    RAISE EXCEPTION 'teams.manage required';
  END IF;

  SELECT club_id INTO v_team_club_id
  FROM public.teams
  WHERE id = p_team_id;

  IF v_team_club_id IS NULL THEN
    RAISE EXCEPTION 'unknown team';
  END IF;

  SELECT club_id INTO v_user_club_id
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT public.is_super_admin() THEN
    IF public.current_club_id() IS DISTINCT FROM v_team_club_id THEN
      RAISE EXCEPTION 'team outside authorized club';
    END IF;
    IF v_user_club_id IS DISTINCT FROM v_team_club_id THEN
      RAISE EXCEPTION 'user outside authorized club';
    END IF;
  END IF;

  INSERT INTO public.rbac_user_team_assignments (user_id, team_id, assigned_by)
  VALUES (p_user_id, p_team_id, auth.uid())
  ON CONFLICT (user_id, team_id) DO NOTHING;

  INSERT INTO public.rbac_user_roles (user_id, role_id, club_id, assigned_by)
  SELECT p_user_id, r.id, v_team_club_id, auth.uid()
  FROM public.rbac_roles r
  WHERE r.key = 'TEAM_MANAGER'
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_revoke_team(
  p_user_id uuid,
  p_team_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() AND NOT public.has_rbac_permission('teams.manage', NULL, NULL) THEN
    RAISE EXCEPTION 'teams.manage required';
  END IF;

  DELETE FROM public.rbac_user_team_assignments
  WHERE user_id = p_user_id
    AND team_id = p_team_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Profile protection updates
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profile id cannot be changed';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'role cannot be changed';
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'active status cannot be changed';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'email cannot be changed';
  END IF;

  IF NEW.club_id IS DISTINCT FROM OLD.club_id AND NOT public.is_admin() THEN
    IF OLD.club_id IS NOT NULL THEN
      RAISE EXCEPTION 'club_id cannot be changed';
    END IF;

    IF NEW.club_id IS NULL THEN
      RAISE EXCEPTION 'club_id cannot be cleared';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.clubs
      WHERE id = NEW.club_id
        AND created_by = auth.uid()
    ) THEN
      RAISE EXCEPTION 'club_id can only be set to own created club';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- RLS policies
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS rbac_roles_read ON public.rbac_roles;
CREATE POLICY rbac_roles_read
  ON public.rbac_roles
  FOR SELECT
  TO authenticated
  USING (public.is_admin() OR public.is_profile_active());

DROP POLICY IF EXISTS rbac_permissions_read ON public.rbac_permissions;
CREATE POLICY rbac_permissions_read
  ON public.rbac_permissions
  FOR SELECT
  TO authenticated
  USING (public.is_admin() OR public.is_profile_active());

DROP POLICY IF EXISTS rbac_role_permissions_read ON public.rbac_role_permissions;
CREATE POLICY rbac_role_permissions_read
  ON public.rbac_role_permissions
  FOR SELECT
  TO authenticated
  USING (public.is_admin() OR public.is_profile_active());

DROP POLICY IF EXISTS rbac_user_roles_read ON public.rbac_user_roles;
CREATE POLICY rbac_user_roles_read
  ON public.rbac_user_roles
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR public.has_rbac_permission('users.view')
  );

DROP POLICY IF EXISTS rbac_user_roles_manage ON public.rbac_user_roles;
CREATE POLICY rbac_user_roles_manage
  ON public.rbac_user_roles
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS rbac_user_team_assignments_read ON public.rbac_user_team_assignments;
CREATE POLICY rbac_user_team_assignments_read
  ON public.rbac_user_team_assignments
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR public.has_rbac_permission('teams.manage')
  );

DROP POLICY IF EXISTS rbac_user_team_assignments_manage ON public.rbac_user_team_assignments;
CREATE POLICY rbac_user_team_assignments_manage
  ON public.rbac_user_team_assignments
  FOR ALL
  TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('teams.manage'))
  WITH CHECK (public.is_super_admin() OR public.has_rbac_permission('teams.manage'));

DROP POLICY IF EXISTS rbac_user_permission_overrides_read ON public.rbac_user_permission_overrides;
CREATE POLICY rbac_user_permission_overrides_read
  ON public.rbac_user_permission_overrides
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS rbac_user_permission_overrides_manage ON public.rbac_user_permission_overrides;
CREATE POLICY rbac_user_permission_overrides_manage
  ON public.rbac_user_permission_overrides
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

REVOKE ALL ON TABLE public.rbac_roles FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.rbac_permissions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.rbac_role_permissions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.rbac_user_roles FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.rbac_user_team_assignments FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.rbac_user_permission_overrides FROM PUBLIC, anon;

GRANT SELECT ON TABLE public.rbac_roles TO authenticated;
GRANT SELECT ON TABLE public.rbac_permissions TO authenticated;
GRANT SELECT ON TABLE public.rbac_role_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rbac_user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rbac_user_team_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rbac_user_permission_overrides TO authenticated;

REVOKE ALL ON FUNCTION public.is_profile_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_rbac_permission(text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_active_super_admins(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbac_set_user_active(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbac_assign_user_role(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbac_revoke_user_role(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbac_assign_team(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbac_revoke_team(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_profile_active() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_rbac_permission(text, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_active_super_admins(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_set_user_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_assign_user_role(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_revoke_user_role(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_assign_team(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_revoke_team(uuid, uuid) TO authenticated;
