-- =============================================================================
-- VfL Kirchheim Tournament Hub — Partner Management Phase 2B-A
-- Atomic tournament ↔ partner assignment RPC
-- =============================================================================
--
-- AUSFÜHREN:
--   1. Supabase Dashboard öffnen
--   2. SQL Editor
--   3. Diese Datei vollständig einfügen und einmal ausführen
--
-- Additive only. DO NOT apply automatically — manual SQL review required.
--
-- Phase 2B-A: SECURITY DEFINER RPC for atomic replace-set of
--             public.tournament_partners for one tournament.
-- Phase 2B (NOT in this migration): admin assignment UI / server action.
-- Phase 2C (NOT in this migration): public tournament Partner section.
--
-- Concurrency: SELECT ... FROM public.tournaments WHERE id = ... FOR UPDATE
-- serializes concurrent assignment saves for the same tournament.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_tournament_partner_assignments(
  p_tournament_id uuid,
  p_partner_ids uuid[]
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
  v_normalized uuid[];
  v_existing uuid[];
BEGIN
  IF NOT public.has_rbac_permission('tournaments.manage') THEN
    RAISE EXCEPTION 'Nicht autorisiert.';
  END IF;

  IF p_tournament_id IS NULL THEN
    RAISE EXCEPTION 'Turnier fehlt.';
  END IF;

  -- Validate tournament exists and serialize same-tournament assignment updates.
  SELECT t.id
  INTO v_tournament_id
  FROM public.tournaments AS t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'Turnier nicht gefunden.';
  END IF;

  -- NULL / empty → empty assignment set; deduplicate Partner IDs.
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), ARRAY[]::uuid[])
  INTO v_normalized
  FROM unnest(coalesce(p_partner_ids, ARRAY[]::uuid[])) AS x;

  SELECT coalesce(array_agg(tp.partner_id), ARRAY[]::uuid[])
  INTO v_existing
  FROM public.tournament_partners AS tp
  WHERE tp.tournament_id = p_tournament_id;

  -- Every submitted Partner ID must exist.
  IF EXISTS (
    SELECT 1
    FROM unnest(v_normalized) AS sid(id)
    LEFT JOIN public.partners AS p ON p.id = sid.id
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Ungültiger Partner.';
  END IF;

  -- Inactive Partners may remain only if already assigned; new inactive assignments are rejected.
  IF EXISTS (
    SELECT 1
    FROM unnest(v_normalized) AS sid(id)
    JOIN public.partners AS p ON p.id = sid.id
    WHERE p.is_active = false
      AND NOT (sid.id = ANY (v_existing))
  ) THEN
    RAISE EXCEPTION 'Inaktive Partner können nicht neu zugeordnet werden.';
  END IF;

  -- Replace-set: remove omitted assignments, insert missing ones.
  DELETE FROM public.tournament_partners AS tp
  WHERE tp.tournament_id = p_tournament_id
    AND NOT (tp.partner_id = ANY (v_normalized));

  INSERT INTO public.tournament_partners (tournament_id, partner_id)
  SELECT p_tournament_id, sid.id
  FROM unnest(v_normalized) AS sid(id)
  WHERE NOT (sid.id = ANY (v_existing))
  ON CONFLICT (tournament_id, partner_id) DO NOTHING;

  -- Deterministic final Partner IDs (partners global order).
  RETURN ARRAY(
    SELECT tp.partner_id
    FROM public.tournament_partners AS tp
    JOIN public.partners AS p ON p.id = tp.partner_id
    WHERE tp.tournament_id = p_tournament_id
    ORDER BY p.sort_order ASC, p.name ASC, p.id ASC
  );
END;
$$;

COMMENT ON FUNCTION public.set_tournament_partner_assignments(uuid, uuid[]) IS
  'PR-Partner-Phase-2B-A: atomically replace tournament_partners for one tournament. Requires tournaments.manage. Serializes via tournaments FOR UPDATE. Inactive partners may remain if already assigned; new inactive assignments are rejected.';

REVOKE ALL ON FUNCTION public.set_tournament_partner_assignments(uuid, uuid[])
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_tournament_partner_assignments(uuid, uuid[])
  FROM anon;
GRANT EXECUTE ON FUNCTION public.set_tournament_partner_assignments(uuid, uuid[])
  TO authenticated;
