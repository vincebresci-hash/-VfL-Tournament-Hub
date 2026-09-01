-- =============================================================================
-- PR42: Communication send incident fix
-- - RLS: platform staff with communications.view may SELECT communications (read-only)
-- Receipt token expiry is enforced in app code; RPC keeps rejecting invalid expiry.
-- =============================================================================

DROP POLICY IF EXISTS tournament_communications_view_select ON public.tournament_communications;
CREATE POLICY tournament_communications_view_select
  ON public.tournament_communications
  FOR SELECT
  TO authenticated
  USING (
    public.has_platform_rbac_access()
    AND public.has_rbac_permission('communications.view')
  );

DROP POLICY IF EXISTS communication_recipients_view_select ON public.communication_recipients;
CREATE POLICY communication_recipients_view_select
  ON public.communication_recipients
  FOR SELECT
  TO authenticated
  USING (
    public.has_platform_rbac_access()
    AND public.has_rbac_permission('communications.view')
  );
