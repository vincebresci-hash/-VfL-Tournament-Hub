-- PR-C2B-HOTFIX: recovery tournament metadata for /kontakt/absage
-- DO NOT apply automatically — manual SQL review required before production.
--
-- Root cause: service_role has no table SELECT on public.tournaments (42501),
-- while C2A already uses SECURITY DEFINER + EXECUTE-only for recovery.
-- This RPC returns only id/name/date inside the C2A recovery window.
-- No applications join. No identity parameters. No RLS/grant changes on tournaments.

CREATE OR REPLACE FUNCTION public.list_guest_cancellation_recovery_tournaments()
RETURNS TABLE (
  id uuid,
  name text,
  date date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.name,
    t.date
  FROM public.tournaments t
  WHERE t.date IS NOT NULL
    AND ((t.date::timestamp AT TIME ZONE 'UTC') + interval '30 days') > now()
  ORDER BY t.date ASC, t.name ASC;
$$;

COMMENT ON FUNCTION public.list_guest_cancellation_recovery_tournaments() IS
  'PR-C2B: recovery-window tournament metadata (id, name, date only) for guest cancellation recovery UI. Includes archived rows still inside C2A date+30d window. service_role EXECUTE only. Does not read applications or tokens.';

REVOKE ALL ON FUNCTION public.list_guest_cancellation_recovery_tournaments() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_guest_cancellation_recovery_tournaments() FROM anon;
REVOKE ALL ON FUNCTION public.list_guest_cancellation_recovery_tournaments() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.list_guest_cancellation_recovery_tournaments() TO service_role;
