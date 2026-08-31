-- =============================================================================
-- P1 hotfix: restore anonymous public tournament visibility
-- =============================================================================
-- Root cause: tournaments_select_public (RBAC migration 20260831210000) applies
-- to anon but can_view_archived_tournament() was only granted to authenticated.
-- Anon could not evaluate the RLS USING expression and saw zero tournaments.
--
-- Security: anon may EXECUTE the helper only. The function returns true when
-- archived_at IS NULL; archived rows require tournaments.view (false for anon).
-- No write grants. Policy and function body unchanged.
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.can_view_archived_tournament(timestamptz) TO anon;
