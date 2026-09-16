-- =============================================================================
-- PR-F3B: Permanent delete of archived tournament communications
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
--
-- Why SECURITY DEFINER RPC (not a table-level DELETE privilege):
-- RLS tournament_communications_admin_all only checks communications.manage and
-- does NOT require archived_at. A table DELETE privilege would let manage users
-- remove ACTIVE rows via PostgREST and bypass app eligibility. This RPC encodes:
--   manage + archived_at IS NOT NULL + status != sending
-- atomically in the DELETE. No table DELETE privilege is granted.
-- Cascades (existing FKs): recipients CASCADE → tokens/send_keys CASCADE;
-- email_logs.communication_recipient_id ON DELETE SET NULL (logs preserved).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.hard_delete_archived_communication(
  p_communication_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_id uuid;
BEGIN
  IF p_communication_id IS NULL THEN
    RETURN 'not_found';
  END IF;

  IF NOT public.has_rbac_permission('communications.manage') THEN
    RAISE EXCEPTION 'Nicht autorisiert.';
  END IF;

  DELETE FROM public.tournament_communications
  WHERE id = p_communication_id
    AND archived_at IS NOT NULL
    AND status IS DISTINCT FROM 'sending'
  RETURNING id INTO v_deleted_id;

  IF v_deleted_id IS NOT NULL THEN
    RETURN 'deleted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tournament_communications
    WHERE id = p_communication_id
  ) THEN
    RETURN 'not_found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tournament_communications
    WHERE id = p_communication_id
      AND status = 'sending'
  ) THEN
    RETURN 'sending';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tournament_communications
    WHERE id = p_communication_id
      AND archived_at IS NULL
  ) THEN
    RETURN 'not_archived';
  END IF;

  RETURN 'failed';
END;
$$;

COMMENT ON FUNCTION public.hard_delete_archived_communication(uuid) IS
  'Permanently delete an archived tournament communication; requires communications.manage; blocks active and sending rows.';

REVOKE ALL ON FUNCTION public.hard_delete_archived_communication(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hard_delete_archived_communication(uuid)
  TO authenticated;
