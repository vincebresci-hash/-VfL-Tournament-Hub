-- =============================================================================
-- Communication send hotfix: load pending recipients via SECURITY DEFINER RPC
-- Send path needs recipient rows after initiate_communication_send. Direct table
-- SELECT is blocked by communications.manage RLS for communications.send users.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_pending_communication_recipients(
  p_communication_id uuid
)
RETURNS TABLE (
  id uuid,
  application_id uuid,
  team_directory_entry_id uuid,
  recipient_email text,
  recipient_team_name text,
  recipient_club_name text,
  recipient_contact_first_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_rbac_permission('communications.send') THEN
    RAISE EXCEPTION 'communications.send required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tournament_communications tc
    WHERE tc.id = p_communication_id
      AND tc.status = 'sending'
  ) THEN
    RAISE EXCEPTION 'communication not sending';
  END IF;

  RETURN QUERY
  SELECT
    cr.id,
    cr.application_id,
    cr.team_directory_entry_id,
    cr.recipient_email,
    cr.recipient_team_name,
    cr.recipient_club_name,
    cr.recipient_contact_first_name
  FROM public.communication_recipients cr
  WHERE cr.communication_id = p_communication_id
    AND cr.send_status = 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public.list_pending_communication_recipients(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_pending_communication_recipients(uuid) TO authenticated;
