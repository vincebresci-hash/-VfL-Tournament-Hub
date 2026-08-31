-- =============================================================================
-- Team directory (CRM archive for future tournament invitations)
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
-- Depends on: 20260831210000_rbac_domain_rls_enforcement.sql
-- =============================================================================
-- Separate from public.teams (Hub club teams). Stores external and Hub-linked
-- archive records without creating Hub accounts or permissions.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'team_directory_source'
  ) THEN
    CREATE TYPE public.team_directory_source AS ENUM ('application', 'manual');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.team_directory_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_name text NOT NULL,
  team_name text NOT NULL,
  age_group text NULL,
  contact_first_name text NULL,
  contact_last_name text NULL,
  contact_role text NULL,
  contact_email text NULL,
  contact_phone text NULL,
  website text NULL,
  league text NULL,
  birth_year integer NULL,
  division text NULL,
  self_rated_strength integer NULL,
  internal_category text NULL,
  internal_strength integer NULL,
  internal_notes text NULL,
  source public.team_directory_source NOT NULL DEFAULT 'manual',
  source_application_id uuid NULL REFERENCES public.applications (id) ON DELETE SET NULL,
  club_id uuid NULL REFERENCES public.clubs (id) ON DELETE SET NULL,
  team_id uuid NULL REFERENCES public.teams (id) ON DELETE SET NULL,
  norm_club_name text NOT NULL,
  norm_team_name text NOT NULL,
  norm_age_group text NOT NULL DEFAULT '',
  norm_contact_email text NULL,
  archived_at timestamptz NULL,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_directory_entries_club_name_not_empty CHECK (length(btrim(club_name)) > 0),
  CONSTRAINT team_directory_entries_team_name_not_empty CHECK (length(btrim(team_name)) > 0),
  CONSTRAINT team_directory_entries_self_rated_strength_range CHECK (
    self_rated_strength IS NULL
    OR (self_rated_strength >= 1 AND self_rated_strength <= 5)
  ),
  CONSTRAINT team_directory_entries_internal_strength_range CHECK (
    internal_strength IS NULL
    OR (internal_strength >= 1 AND internal_strength <= 5)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS team_directory_entries_active_team_id_uidx
  ON public.team_directory_entries (team_id)
  WHERE team_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS team_directory_entries_norm_lookup_idx
  ON public.team_directory_entries (norm_club_name, norm_team_name, norm_age_group)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS team_directory_entries_club_norm_idx
  ON public.team_directory_entries (club_id, norm_team_name, norm_age_group)
  WHERE archived_at IS NULL AND club_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS team_directory_entries_archived_idx
  ON public.team_directory_entries (archived_at);

CREATE UNIQUE INDEX IF NOT EXISTS team_directory_entries_active_source_application_uidx
  ON public.team_directory_entries (source_application_id)
  WHERE source_application_id IS NOT NULL AND archived_at IS NULL;

DROP TRIGGER IF EXISTS set_team_directory_entries_updated_at ON public.team_directory_entries;
CREATE TRIGGER set_team_directory_entries_updated_at
  BEFORE UPDATE ON public.team_directory_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.team_directory_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_directory_entries_select ON public.team_directory_entries;
CREATE POLICY team_directory_entries_select
  ON public.team_directory_entries
  FOR SELECT
  TO authenticated
  USING (
    public.has_platform_rbac_access()
    AND public.has_rbac_permission('teams.view')
  );

DROP POLICY IF EXISTS team_directory_entries_insert ON public.team_directory_entries;
CREATE POLICY team_directory_entries_insert
  ON public.team_directory_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_platform_rbac_access()
    AND public.has_rbac_permission('teams.manage')
  );

DROP POLICY IF EXISTS team_directory_entries_update ON public.team_directory_entries;
CREATE POLICY team_directory_entries_update
  ON public.team_directory_entries
  FOR UPDATE
  TO authenticated
  USING (
    public.has_platform_rbac_access()
    AND public.has_rbac_permission('teams.manage')
  )
  WITH CHECK (
    public.has_platform_rbac_access()
    AND public.has_rbac_permission('teams.manage')
  );

REVOKE ALL ON TABLE public.team_directory_entries FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.team_directory_entries TO authenticated;
