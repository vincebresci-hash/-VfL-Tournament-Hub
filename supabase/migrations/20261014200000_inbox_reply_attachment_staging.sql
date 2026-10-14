-- =============================================================================
-- Phase 4a: Outbound IONOS reply attachment staging (secure foundation)
-- Production: NOT auto-applied. Apply in Supabase SQL Editor only after approval.
-- Isolated from IMAP sync tables, Resend, and inbound inbox_attachments leases.
-- Does NOT enable SMTP attachment send (Phase 4b).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Relax reply attachment_count for future bind (still claimed as 0 in v1 claim)
-- ---------------------------------------------------------------------------

ALTER TABLE public.inbox_replies
  DROP CONSTRAINT IF EXISTS inbox_replies_attachment_count_zero_v1;

ALTER TABLE public.inbox_replies
  DROP CONSTRAINT IF EXISTS inbox_replies_attachment_count_range;

ALTER TABLE public.inbox_replies
  ADD CONSTRAINT inbox_replies_attachment_count_range
  CHECK (attachment_count >= 0 AND attachment_count <= 5);

COMMENT ON COLUMN public.inbox_replies.attachment_count IS
  'Number of bound outbound attachments (0–5). Phase 4a stages uploads; claim still inserts 0 until Phase 4b.';

-- ---------------------------------------------------------------------------
-- Private outbound attachment bucket (no anon/authenticated storage policies)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inbox-reply-attachments',
  'inbox-reply-attachments',
  false,
  5242880, -- 5 MiB
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS inbox_reply_attachments_storage_select ON storage.objects;
DROP POLICY IF EXISTS inbox_reply_attachments_storage_insert ON storage.objects;
DROP POLICY IF EXISTS inbox_reply_attachments_storage_update ON storage.objects;
DROP POLICY IF EXISTS inbox_reply_attachments_storage_delete ON storage.objects;
-- Intentionally no storage.objects policies for anon/authenticated.
-- Access only via service_role after RBAC in server actions.

-- ---------------------------------------------------------------------------
-- Staging + audit metadata
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inbox_reply_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES public.inbox_mailboxes (id) ON DELETE CASCADE,
  parent_message_id uuid NOT NULL REFERENCES public.inbox_messages (id) ON DELETE CASCADE,
  -- Set in Phase 4b when claim binds uploads to a reply.
  reply_id uuid NULL REFERENCES public.inbox_replies (id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL,
  checksum_sha256 text NULL,
  storage_path text NULL,
  status text NOT NULL DEFAULT 'uploading',
  error_code text NULL,
  -- Staging TTL (unused uploads expire).
  expires_at timestamptz NOT NULL,
  -- After bind/send: retain bytes until this instant, then purge objects (metadata kept).
  retain_until timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  bound_at timestamptz NULL,
  purged_at timestamptz NULL,
  CONSTRAINT inbox_reply_uploads_status_check
    CHECK (status IN ('uploading', 'staging', 'bound', 'purged', 'rejected')),
  CONSTRAINT inbox_reply_uploads_size_range
    CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  CONSTRAINT inbox_reply_uploads_filename_length
    CHECK (length(trim(filename)) > 0 AND length(filename) <= 180),
  CONSTRAINT inbox_reply_uploads_content_type_length
    CHECK (length(trim(content_type)) > 0 AND length(content_type) <= 200),
  CONSTRAINT inbox_reply_uploads_extension_allowlist
    CHECK (
      lower(substring(filename from '\.([A-Za-z0-9]+)$'))
      IN ('pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx')
    ),
  CONSTRAINT inbox_reply_uploads_storage_path_when_active
    CHECK (
      status IN ('purged', 'rejected')
      OR (storage_path IS NOT NULL AND length(trim(storage_path)) > 0)
    ),
  CONSTRAINT inbox_reply_uploads_error_code_length
    CHECK (error_code IS NULL OR length(error_code) <= 80),
  CONSTRAINT inbox_reply_uploads_checksum_hex
    CHECK (
      checksum_sha256 IS NULL
      OR checksum_sha256 ~ '^[0-9a-f]{64}$'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS inbox_reply_uploads_storage_path_uidx
  ON public.inbox_reply_uploads (storage_path)
  WHERE storage_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS inbox_reply_uploads_actor_parent_status_idx
  ON public.inbox_reply_uploads (created_by, parent_message_id, status);

CREATE INDEX IF NOT EXISTS inbox_reply_uploads_expires_idx
  ON public.inbox_reply_uploads (expires_at)
  WHERE status IN ('uploading', 'staging');

CREATE INDEX IF NOT EXISTS inbox_reply_uploads_retain_idx
  ON public.inbox_reply_uploads (retain_until)
  WHERE status = 'bound' AND storage_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS inbox_reply_uploads_reply_id_idx
  ON public.inbox_reply_uploads (reply_id)
  WHERE reply_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.inbox_reply_upload_leases (
  storage_path text PRIMARY KEY,
  upload_id uuid NOT NULL REFERENCES public.inbox_reply_uploads (id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  committed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbox_reply_upload_leases_cleanup_idx
  ON public.inbox_reply_upload_leases (committed, created_at)
  WHERE committed = false;

-- ---------------------------------------------------------------------------
-- RLS: SELECT own staging / view-bound; mutations via SECURITY DEFINER only
-- storage_path is NOT granted to authenticated (H3).
-- ---------------------------------------------------------------------------

ALTER TABLE public.inbox_reply_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_reply_upload_leases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.inbox_reply_uploads FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.inbox_reply_upload_leases FROM PUBLIC, anon, authenticated;

-- Column-level SELECT: everything except storage_path.
GRANT SELECT (
  id,
  mailbox_id,
  parent_message_id,
  reply_id,
  created_by,
  filename,
  content_type,
  size_bytes,
  checksum_sha256,
  status,
  error_code,
  expires_at,
  retain_until,
  created_at,
  updated_at,
  bound_at,
  purged_at
) ON TABLE public.inbox_reply_uploads TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.inbox_reply_uploads FROM authenticated;
GRANT ALL ON TABLE public.inbox_reply_uploads TO service_role;
GRANT ALL ON TABLE public.inbox_reply_upload_leases TO service_role;

DROP POLICY IF EXISTS inbox_reply_uploads_select ON public.inbox_reply_uploads;
CREATE POLICY inbox_reply_uploads_select
  ON public.inbox_reply_uploads
  FOR SELECT
  TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR (
      reply_id IS NOT NULL
      AND status IN ('bound', 'purged')
      AND public.has_rbac_permission('inbox.view')
    )
  );

-- ---------------------------------------------------------------------------
-- Helpers (no PUBLIC execute)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.inbox_reply_upload_extension(p_filename text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(substring(trim(p_filename) from '\.([A-Za-z0-9]+)$'));
$$;

CREATE OR REPLACE FUNCTION public.is_inbox_reply_upload_extension_allowed(p_filename text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.inbox_reply_upload_extension(p_filename)
    IN ('pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx');
$$;

CREATE OR REPLACE FUNCTION public.is_inbox_reply_upload_mime_allowed(
  p_filename text,
  p_content_type text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE public.inbox_reply_upload_extension(p_filename)
    WHEN 'pdf' THEN lower(trim(split_part(p_content_type, ';', 1))) = 'application/pdf'
    WHEN 'jpg' THEN lower(trim(split_part(p_content_type, ';', 1))) = 'image/jpeg'
    WHEN 'jpeg' THEN lower(trim(split_part(p_content_type, ';', 1))) = 'image/jpeg'
    WHEN 'png' THEN lower(trim(split_part(p_content_type, ';', 1))) = 'image/png'
    WHEN 'docx' THEN lower(trim(split_part(p_content_type, ';', 1)))
      = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    WHEN 'xlsx' THEN lower(trim(split_part(p_content_type, ';', 1)))
      = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ELSE false
  END;
$$;

-- Shared purge eligibility (list + mark). Bound never before retain_until;
-- never while linked reply is sending/uncertain.
CREATE OR REPLACE FUNCTION public.inbox_reply_upload_is_purge_eligible(
  p_upload public.inbox_reply_uploads
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    p_upload.storage_path IS NOT NULL
    AND (
      (
        p_upload.status IN ('uploading', 'staging')
        AND p_upload.expires_at < now()
      )
      OR (
        p_upload.status = 'uploading'
        AND EXISTS (
          SELECT 1
          FROM public.inbox_reply_upload_leases AS lease
          WHERE lease.upload_id = p_upload.id
            AND lease.committed = false
            AND lease.created_at < now() - interval '15 minutes'
        )
      )
      OR (
        p_upload.status = 'bound'
        AND p_upload.retain_until IS NOT NULL
        AND p_upload.retain_until < now()
        AND (
          p_upload.reply_id IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM public.inbox_replies AS reply
            WHERE reply.id = p_upload.reply_id
              AND reply.status IN ('sending', 'uncertain')
          )
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.inbox_reply_upload_extension(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_inbox_reply_upload_extension_allowed(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_inbox_reply_upload_mime_allowed(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inbox_reply_upload_is_purge_eligible(public.inbox_reply_uploads)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated: create staging stub (ownership + atomic quotas). No path return.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_inbox_reply_upload(
  p_parent_message_id uuid,
  p_upload_id uuid,
  p_filename text,
  p_content_type text,
  p_size_bytes integer
)
RETURNS TABLE (
  upload_id uuid,
  error_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_parent public.inbox_messages%ROWTYPE;
  v_safe_name text;
  v_path text;
  v_mime text;
  v_count integer := 0;
  v_bytes bigint := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'not_authenticated'::text;
    RETURN;
  END IF;

  IF NOT public.has_rbac_permission('inbox.view') THEN
    RETURN QUERY SELECT NULL::uuid, 'not_authorized_view'::text;
    RETURN;
  END IF;

  IF NOT public.has_rbac_permission('inbox.reply') THEN
    RETURN QUERY SELECT NULL::uuid, 'not_authorized_reply'::text;
    RETURN;
  END IF;

  IF p_parent_message_id IS NULL OR p_upload_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'invalid_input'::text;
    RETURN;
  END IF;

  IF p_size_bytes IS NULL OR p_size_bytes <= 0 OR p_size_bytes > 5242880 THEN
    RETURN QUERY SELECT NULL::uuid, 'size_rejected'::text;
    RETURN;
  END IF;

  v_safe_name := trim(both FROM p_filename);
  v_safe_name := regexp_replace(v_safe_name, '[\\/]+', '', 'g');
  v_safe_name := regexp_replace(v_safe_name, '[^\w.\- ()\[\]]+', '_', 'g');
  v_safe_name := regexp_replace(v_safe_name, '^\.+', '');
  v_safe_name := left(v_safe_name, 180);
  IF length(v_safe_name) = 0 THEN
    v_safe_name := 'anhang';
  END IF;

  IF NOT public.is_inbox_reply_upload_extension_allowed(v_safe_name) THEN
    RETURN QUERY SELECT NULL::uuid, 'extension_blocked'::text;
    RETURN;
  END IF;

  IF p_content_type IS NULL
     OR length(trim(p_content_type)) = 0
     OR length(p_content_type) > 200
     OR position(E'\n' IN p_content_type) > 0
     OR position(E'\r' IN p_content_type) > 0 THEN
    RETURN QUERY SELECT NULL::uuid, 'mime_blocked'::text;
    RETURN;
  END IF;

  v_mime := lower(trim(split_part(p_content_type, ';', 1)));
  IF NOT public.is_inbox_reply_upload_mime_allowed(v_safe_name, v_mime) THEN
    RETURN QUERY SELECT NULL::uuid, 'mime_blocked'::text;
    RETURN;
  END IF;

  SELECT *
  INTO v_parent
  FROM public.inbox_messages AS message
  WHERE message.id = p_parent_message_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, 'parent_not_found'::text;
    RETURN;
  END IF;

  -- Atomic quotas: actor-global then actor+parent (transaction-scoped).
  PERFORM pg_advisory_xact_lock(87235201, hashtext(v_uid::text));
  PERFORM pg_advisory_xact_lock(
    87235202,
    hashtext(v_uid::text || ':' || p_parent_message_id::text)
  );

  SELECT count(*)
  INTO v_count
  FROM public.inbox_reply_uploads AS upload
  WHERE upload.created_by = v_uid
    AND upload.status IN ('uploading', 'staging');

  IF v_count >= 10 THEN
    RETURN QUERY SELECT NULL::uuid, 'quota_actor_count'::text;
    RETURN;
  END IF;

  SELECT count(*), COALESCE(sum(upload.size_bytes), 0)
  INTO v_count, v_bytes
  FROM public.inbox_reply_uploads AS upload
  WHERE upload.created_by = v_uid
    AND upload.parent_message_id = p_parent_message_id
    AND upload.status IN ('uploading', 'staging');

  IF v_count >= 5 THEN
    RETURN QUERY SELECT NULL::uuid, 'quota_count'::text;
    RETURN;
  END IF;

  IF v_bytes + p_size_bytes > 12582912 THEN -- 12 MiB
    RETURN QUERY SELECT NULL::uuid, 'quota_bytes'::text;
    RETURN;
  END IF;

  v_path :=
    v_parent.mailbox_id::text
    || '/'
    || v_parent.id::text
    || '/'
    || v_uid::text
    || '/'
    || p_upload_id::text
    || '/'
    || v_safe_name;

  BEGIN
    INSERT INTO public.inbox_reply_uploads (
      id,
      mailbox_id,
      parent_message_id,
      created_by,
      filename,
      content_type,
      size_bytes,
      storage_path,
      status,
      expires_at
    )
    VALUES (
      p_upload_id,
      v_parent.mailbox_id,
      v_parent.id,
      v_uid,
      v_safe_name,
      v_mime,
      p_size_bytes,
      v_path,
      'uploading',
      now() + interval '60 minutes'
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN QUERY SELECT NULL::uuid, 'duplicate_upload'::text;
      RETURN;
  END;

  -- Do not return storage_path to authenticated callers (H3).
  RETURN QUERY SELECT p_upload_id, NULL::text;
END;
$$;

-- ---------------------------------------------------------------------------
-- Authenticated: remove own unused staging (no path in result)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remove_inbox_reply_upload(
  p_upload_id uuid
)
RETURNS TABLE (
  ok boolean,
  error_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.inbox_reply_uploads%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 'not_authenticated'::text;
    RETURN;
  END IF;

  IF NOT public.has_rbac_permission('inbox.reply') THEN
    RETURN QUERY SELECT false, 'not_authorized_reply'::text;
    RETURN;
  END IF;

  SELECT *
  INTO v_row
  FROM public.inbox_reply_uploads AS upload
  WHERE upload.id = p_upload_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found'::text;
    RETURN;
  END IF;

  IF v_row.created_by IS DISTINCT FROM v_uid THEN
    RETURN QUERY SELECT false, 'forbidden'::text;
    RETURN;
  END IF;

  IF v_row.status NOT IN ('uploading', 'staging') THEN
    RETURN QUERY SELECT false, 'not_removable'::text;
    RETURN;
  END IF;

  UPDATE public.inbox_reply_uploads
  SET
    status = 'purged',
    purged_at = now(),
    updated_at = now(),
    storage_path = NULL,
    error_code = 'removed_by_actor'
  WHERE id = v_row.id;

  DELETE FROM public.inbox_reply_upload_leases
  WHERE upload_id = v_row.id;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

-- ---------------------------------------------------------------------------
-- service_role: read storage path for orchestration (never granted to authenticated)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_inbox_reply_upload_storage_path(
  p_upload_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path text;
BEGIN
  SELECT upload.storage_path
  INTO v_path
  FROM public.inbox_reply_uploads AS upload
  WHERE upload.id = p_upload_id
    AND upload.storage_path IS NOT NULL
    AND upload.status IN ('uploading', 'staging', 'bound');

  RETURN v_path;
END;
$$;

-- ---------------------------------------------------------------------------
-- service_role: lease / commit / reject (storage orchestration)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_inbox_reply_upload_lease(
  p_upload_id uuid,
  p_storage_path text,
  p_created_by uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.inbox_reply_uploads%ROWTYPE;
BEGIN
  IF p_upload_id IS NULL
     OR p_created_by IS NULL
     OR p_storage_path IS NULL
     OR length(trim(p_storage_path)) = 0 THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_row
  FROM public.inbox_reply_uploads AS upload
  WHERE upload.id = p_upload_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_row.created_by IS DISTINCT FROM p_created_by THEN
    RETURN false;
  END IF;

  IF v_row.status IS DISTINCT FROM 'uploading' THEN
    RETURN false;
  END IF;

  IF v_row.storage_path IS DISTINCT FROM p_storage_path THEN
    RETURN false;
  END IF;

  INSERT INTO public.inbox_reply_upload_leases (
    storage_path, upload_id, created_by, committed
  )
  VALUES (p_storage_path, p_upload_id, p_created_by, false)
  ON CONFLICT (storage_path) DO UPDATE
  SET
    upload_id = EXCLUDED.upload_id,
    created_by = EXCLUDED.created_by,
    committed = false,
    created_at = now();

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_inbox_reply_upload(
  p_upload_id uuid,
  p_checksum_sha256 text,
  p_size_bytes integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.inbox_reply_uploads%ROWTYPE;
  v_lease_updated integer := 0;
  v_updated integer := 0;
  v_checksum text;
BEGIN
  IF p_upload_id IS NULL
     OR p_checksum_sha256 IS NULL
     OR p_checksum_sha256 !~ '^[0-9a-fA-F]{64}$'
     OR p_size_bytes IS NULL
     OR p_size_bytes <= 0 THEN
    RETURN false;
  END IF;

  v_checksum := lower(p_checksum_sha256);

  SELECT *
  INTO v_row
  FROM public.inbox_reply_uploads AS upload
  WHERE upload.id = p_upload_id
  FOR UPDATE;

  IF NOT FOUND OR v_row.status IS DISTINCT FROM 'uploading' THEN
    RETURN false;
  END IF;

  IF v_row.size_bytes IS DISTINCT FROM p_size_bytes THEN
    RETURN false;
  END IF;

  -- M4: require an uncommitted matching lease before promotion to staging.
  UPDATE public.inbox_reply_upload_leases
  SET committed = true
  WHERE storage_path = v_row.storage_path
    AND upload_id = p_upload_id
    AND committed = false;

  GET DIAGNOSTICS v_lease_updated = ROW_COUNT;
  IF v_lease_updated = 0 THEN
    RETURN false;
  END IF;

  UPDATE public.inbox_reply_uploads
  SET
    status = 'staging',
    checksum_sha256 = v_checksum,
    updated_at = now(),
    error_code = NULL
  WHERE id = p_upload_id
    AND status = 'uploading';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

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
  v_row public.inbox_reply_uploads%ROWTYPE;
BEGIN
  SELECT *
  INTO v_row
  FROM public.inbox_reply_uploads AS upload
  WHERE upload.id = p_upload_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_row.status NOT IN ('uploading', 'staging') THEN
    RETURN false;
  END IF;

  UPDATE public.inbox_reply_uploads
  SET
    status = 'rejected',
    error_code = left(COALESCE(p_error_code, 'upload_failed'), 80),
    storage_path = NULL,
    purged_at = now(),
    updated_at = now()
  WHERE id = p_upload_id;

  DELETE FROM public.inbox_reply_upload_leases
  WHERE upload_id = p_upload_id;

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- service_role: purge listing + mark purged (eligibility revalidated at mark)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_purgeable_inbox_reply_uploads(
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  upload_id uuid,
  storage_path text,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    upload.id,
    upload.storage_path,
    CASE
      WHEN upload.status IN ('uploading', 'staging')
        AND upload.expires_at < now() THEN 'staging_expired'
      WHEN upload.status = 'bound'
        AND upload.retain_until IS NOT NULL
        AND upload.retain_until < now() THEN 'retention_elapsed'
      WHEN upload.status = 'uploading'
        AND EXISTS (
          SELECT 1
          FROM public.inbox_reply_upload_leases AS lease
          WHERE lease.upload_id = upload.id
            AND lease.committed = false
            AND lease.created_at < now() - interval '15 minutes'
        ) THEN 'lease_abandoned'
      ELSE 'other'
    END AS reason
  FROM public.inbox_reply_uploads AS upload
  WHERE public.inbox_reply_upload_is_purge_eligible(upload)
  ORDER BY upload.created_at ASC
  LIMIT GREATEST(COALESCE(p_limit, 20), 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_inbox_reply_upload_purged(
  p_upload_id uuid,
  p_reason text DEFAULT 'purged'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.inbox_reply_uploads%ROWTYPE;
  v_updated integer := 0;
BEGIN
  SELECT *
  INTO v_row
  FROM public.inbox_reply_uploads AS upload
  WHERE upload.id = p_upload_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- H1: revalidate eligibility atomically at mutation time.
  IF NOT public.inbox_reply_upload_is_purge_eligible(v_row) THEN
    RETURN false;
  END IF;

  UPDATE public.inbox_reply_uploads
  SET
    status = 'purged',
    storage_path = NULL,
    purged_at = now(),
    updated_at = now(),
    error_code = left(COALESCE(p_reason, 'purged'), 80)
  WHERE id = p_upload_id
    AND storage_path IS NOT NULL
    AND status IN ('uploading', 'staging', 'bound');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  DELETE FROM public.inbox_reply_upload_leases
  WHERE upload_id = p_upload_id;

  RETURN v_updated > 0;
END;
$$;

-- Phase 4b helper: retain bytes at least 30 days after bind/send (service_role).
CREATE OR REPLACE FUNCTION public.set_inbox_reply_upload_retention(
  p_upload_id uuid,
  p_retain_days integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := GREATEST(COALESCE(p_retain_days, 30), 30);
  v_updated integer := 0;
BEGIN
  UPDATE public.inbox_reply_uploads
  SET
    retain_until = now() + make_interval(days => v_days),
    updated_at = now()
  WHERE id = p_upload_id
    AND status = 'bound'
    AND storage_path IS NOT NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.create_inbox_reply_upload(uuid, uuid, text, text, integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_inbox_reply_upload(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_inbox_reply_upload_storage_path(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_inbox_reply_upload_lease(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_inbox_reply_upload(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_inbox_reply_upload(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_purgeable_inbox_reply_uploads(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_inbox_reply_upload_purged(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_inbox_reply_upload_retention(uuid, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_inbox_reply_upload(uuid, uuid, text, text, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_inbox_reply_upload(uuid)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_inbox_reply_upload_storage_path(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.register_inbox_reply_upload_lease(uuid, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_inbox_reply_upload(uuid, text, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_inbox_reply_upload(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.list_purgeable_inbox_reply_uploads(integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_inbox_reply_upload_purged(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.set_inbox_reply_upload_retention(uuid, integer)
  TO service_role;

COMMIT;
