-- =============================================================================
-- PR-A: Optional multi-team tournament setting (Admin flag only)
-- Additive column. Does not change application, capacity, RLS, grants, or RPCs.
-- =============================================================================

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS allow_multiple_teams boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tournaments.allow_multiple_teams IS
  'Admin-Flag: Mehrfachmeldungen (mehrere Teams pro Verein) für dieses Turnier zulassen. Bewerber-UI folgt in PR-B.';
