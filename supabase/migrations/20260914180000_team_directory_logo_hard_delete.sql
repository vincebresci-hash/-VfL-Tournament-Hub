-- =============================================================================
-- Team-Datenbank: optional logo_url + hard DELETE for platform teams.manage
-- Additive only. Does not change archive, FKs, triggers, or other domains.
-- =============================================================================

ALTER TABLE public.team_directory_entries
  ADD COLUMN IF NOT EXISTS logo_url text NULL;

COMMENT ON COLUMN public.team_directory_entries.logo_url IS
  'Optional logo for this Team-Datenbank CRM entry only. Independent of club, application, and tournament logos.';

-- Hard delete: same gates as UPDATE (platform + teams.manage). No anon/PUBLIC.
DROP POLICY IF EXISTS team_directory_entries_delete ON public.team_directory_entries;
CREATE POLICY team_directory_entries_delete
  ON public.team_directory_entries
  FOR DELETE
  TO authenticated
  USING (
    public.has_platform_rbac_access()
    AND public.has_rbac_permission('teams.manage')
  );

GRANT DELETE ON TABLE public.team_directory_entries TO authenticated;
