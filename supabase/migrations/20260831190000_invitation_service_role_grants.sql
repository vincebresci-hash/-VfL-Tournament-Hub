-- =============================================================================
-- PR28 follow-up: service_role grants for server-side invite orchestration
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
--
-- Root cause: PR28 invitation tables revoked PUBLIC defaults and granted only
-- authenticated. Server invite orchestration uses service-role PostgREST after
-- requireSuperAdminSession(), which needs explicit table privileges (42501).
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_invitations TO service_role;
GRANT SELECT, INSERT ON TABLE public.admin_audit_log TO service_role;
GRANT SELECT, UPDATE ON TABLE public.profiles TO service_role;
GRANT SELECT ON TABLE public.clubs TO service_role;
GRANT SELECT ON TABLE public.teams TO service_role;

-- Trusted server-side profile updates (service role / SQL editor: auth.uid() IS NULL).
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
