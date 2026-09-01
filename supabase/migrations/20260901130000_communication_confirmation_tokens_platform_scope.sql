-- =============================================================================
-- PR42 follow-up: platform-scope confirmation token admin SELECT
-- TEAM_MANAGER has communications.view but must not read global token rows.
-- Public receipt flow uses token-scoped SECURITY DEFINER RPCs (unchanged).
-- =============================================================================

DROP POLICY IF EXISTS communication_confirmation_tokens_admin_select
  ON public.communication_confirmation_tokens;

CREATE POLICY communication_confirmation_tokens_admin_select
  ON public.communication_confirmation_tokens
  FOR SELECT
  TO authenticated
  USING (
    public.has_platform_rbac_access()
    AND public.has_rbac_permission('communications.view')
  );
