-- =============================================================================
-- Audit remediation (H1 reject race, M2 claim lock scope)
-- Production: NOT auto-applied. Apply only after approval.
-- Does NOT enable composer UI or attachment SMTP.
-- =============================================================================

BEGIN;

-- H1: reject/delete may only touch rows still in 'uploading'.
-- Concurrent finalize that lost the commit race must NOT reject staging/bound
-- or clear storage_path / delete Storage objects belonging to a winner.
CREATE OR REPLACE FUNCTION public.reject_inbox_reply_upload(
  p_upload_id uuid,
  p_error_code text DEFAULT 'upload_failed'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF p_upload_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.inbox_reply_uploads
  SET
    status = 'rejected',
    error_code = left(COALESCE(p_error_code, 'upload_failed'), 80),
    storage_path = NULL,
    purged_at = now(),
    updated_at = now()
  WHERE id = p_upload_id
    AND status = 'uploading';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN false;
  END IF;

  DELETE FROM public.inbox_reply_upload_leases
  WHERE upload_id = p_upload_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_inbox_reply_upload(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_inbox_reply_upload(uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.reject_inbox_reply_upload(uuid, text) IS
  'Reject only while status=uploading (atomic). Never mutates staging/bound; callers must delete Storage only when this returns true.';

COMMIT;
