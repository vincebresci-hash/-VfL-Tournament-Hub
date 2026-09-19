-- =============================================================================
-- VfL Kirchheim Tournament Hub — Partner Management Phase 2A
-- Tournament ↔ Partner assignment foundation
-- =============================================================================
--
-- AUSFÜHREN:
--   1. Supabase Dashboard öffnen
--   2. SQL Editor
--   3. Diese Datei vollständig einfügen und einmal ausführen
--
-- Additive only. Idempotent where practical.
-- DO NOT apply automatically — manual SQL review required before production.
--
-- Phase 2A: tournament_partners junction + RLS + narrow partner SELECT for
--           tournaments.manage (inactive assignment visibility).
-- Phase 2B (NOT in this migration): admin assignment UI/action.
-- Phase 2C (NOT in this migration): public tournament Partner section.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. tournament_partners junction
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tournament_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL
    REFERENCES public.tournaments (id) ON DELETE CASCADE,
  partner_id uuid NOT NULL
    REFERENCES public.partners (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_partners_tournament_partner_unique
    UNIQUE (tournament_id, partner_id)
);

CREATE INDEX IF NOT EXISTS tournament_partners_tournament_id_idx
  ON public.tournament_partners (tournament_id);

CREATE INDEX IF NOT EXISTS tournament_partners_partner_id_idx
  ON public.tournament_partners (partner_id);

COMMENT ON TABLE public.tournament_partners IS
  'PR-Partner-Phase-2A: many-to-many tournament ↔ partner assignments. Display order inherits partners global order (no assignment-local order column).';

ALTER TABLE public.tournament_partners ENABLE ROW LEVEL SECURITY;

-- Public may read assignments only when the parent tournament is publicly viewable
-- (same can_view_archived_tournament pattern as schedule child tables).
DROP POLICY IF EXISTS tournament_partners_select_public ON public.tournament_partners;
CREATE POLICY tournament_partners_select_public
  ON public.tournament_partners
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tournaments
      WHERE tournaments.id = tournament_partners.tournament_id
        AND public.can_view_archived_tournament(tournaments.archived_at)
    )
  );

-- Admin with tournaments.manage may read all assignments (incl. archived tournaments).
DROP POLICY IF EXISTS tournament_partners_select_manage ON public.tournament_partners;
CREATE POLICY tournament_partners_select_manage
  ON public.tournament_partners
  FOR SELECT
  TO authenticated
  USING (public.has_rbac_permission('tournaments.manage'));

DROP POLICY IF EXISTS tournament_partners_insert_manage ON public.tournament_partners;
CREATE POLICY tournament_partners_insert_manage
  ON public.tournament_partners
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_rbac_permission('tournaments.manage'));

DROP POLICY IF EXISTS tournament_partners_update_manage ON public.tournament_partners;
CREATE POLICY tournament_partners_update_manage
  ON public.tournament_partners
  FOR UPDATE
  TO authenticated
  USING (public.has_rbac_permission('tournaments.manage'))
  WITH CHECK (public.has_rbac_permission('tournaments.manage'));

DROP POLICY IF EXISTS tournament_partners_delete_manage ON public.tournament_partners;
CREATE POLICY tournament_partners_delete_manage
  ON public.tournament_partners
  FOR DELETE
  TO authenticated
  USING (public.has_rbac_permission('tournaments.manage'));

REVOKE ALL ON TABLE public.tournament_partners FROM PUBLIC;
GRANT SELECT ON TABLE public.tournament_partners TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.tournament_partners TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Narrow partners SELECT for tournament managers (inactive assignment UX)
-- ---------------------------------------------------------------------------
-- SELECT only. Does NOT grant partners.manage / write access.
-- Required so tournaments.manage can see assigned Partners that later become inactive.

DROP POLICY IF EXISTS partners_select_tournament_manage ON public.partners;
CREATE POLICY partners_select_tournament_manage
  ON public.partners
  FOR SELECT
  TO authenticated
  USING (public.has_rbac_permission('tournaments.manage'));
