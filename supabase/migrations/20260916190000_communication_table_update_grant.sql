-- =============================================================================
-- PR-F3A hotfix: authenticated UPDATE privilege on tournament_communications
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
--
-- Root cause: archive/restore use a direct user-scoped UPDATE, but authenticated
-- only had SELECT. Writes remain gated by RLS policy
-- tournament_communications_admin_all → has_rbac_permission('communications.manage').
-- =============================================================================

GRANT UPDATE ON TABLE public.tournament_communications TO authenticated;
