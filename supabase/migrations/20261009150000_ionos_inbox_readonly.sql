-- =============================================================================
-- IONOS Inbox (read-only sync) — isolated from outbound email system
-- Production: NOT auto-applied. Apply in Supabase SQL Editor when ready.
-- Does NOT modify email_logs, email_templates, or outbound mail objects.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Permissions (SUPER_ADMIN + ADMIN only; NOT COMMUNICATION_MANAGER)
-- ---------------------------------------------------------------------------

INSERT INTO public.rbac_permissions (key, name, category) VALUES
  ('inbox.view', 'Posteingang ansehen', 'inbox'),
  ('inbox.manage', 'Posteingang bearbeiten', 'inbox')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.rbac_roles AS r
JOIN public.rbac_permissions AS p ON p.key IN ('inbox.view', 'inbox.manage')
WHERE r.key IN ('SUPER_ADMIN', 'ADMIN')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inbox_mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT 'Tournament Hub',
  folder text NOT NULL DEFAULT 'INBOX',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbox_mailboxes_folder_not_empty CHECK (length(trim(folder)) > 0)
);

CREATE TABLE IF NOT EXISTS public.inbox_sync_state (
  mailbox_id uuid PRIMARY KEY REFERENCES public.inbox_mailboxes (id) ON DELETE CASCADE,
  folder text NOT NULL DEFAULT 'INBOX',
  uidvalidity bigint NULL,
  cursor_uid bigint NOT NULL DEFAULT 0,
  backfill_cutoff_at timestamptz NULL,
  backfill_complete boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz NULL,
  last_success_at timestamptz NULL,
  last_error text NULL,
  lock_token uuid NULL,
  lock_acquired_at timestamptz NULL,
  lock_expires_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbox_sync_state_cursor_nonnegative CHECK (cursor_uid >= 0)
);

CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES public.inbox_mailboxes (id) ON DELETE CASCADE,
  folder text NOT NULL,
  uidvalidity bigint NOT NULL,
  imap_uid bigint NOT NULL,
  message_id_header text NULL,
  in_reply_to text NULL,
  references_header text NULL,
  thread_key text NOT NULL,
  from_address text NOT NULL DEFAULT '',
  from_name text NOT NULL DEFAULT '',
  to_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text NOT NULL DEFAULT '',
  sent_at timestamptz NULL,
  received_at timestamptz NOT NULL,
  snippet text NOT NULL DEFAULT '',
  body_text text NULL,
  body_html_sanitized text NULL,
  has_attachments boolean NOT NULL DEFAULT false,
  size_bytes integer NULL,
  imap_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_unread_local boolean NOT NULL DEFAULT true,
  processing_status text NOT NULL DEFAULT 'open',
  processed_at timestamptz NULL,
  processed_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbox_messages_processing_status_check
    CHECK (processing_status IN ('open', 'in_progress', 'done')),
  CONSTRAINT inbox_messages_imap_identity_unique
    UNIQUE (mailbox_id, folder, uidvalidity, imap_uid)
);

CREATE TABLE IF NOT EXISTS public.inbox_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.inbox_messages (id) ON DELETE CASCADE,
  part_index integer NOT NULL DEFAULT 0,
  filename text NOT NULL,
  content_type text NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  content_id text NULL,
  storage_path text NULL,
  checksum_sha256 text NULL,
  stored boolean NOT NULL DEFAULT false,
  skip_reason text NULL,
  retry_count integer NOT NULL DEFAULT 0,
  last_repair_at timestamptz NULL,
  last_repair_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbox_attachments_size_nonnegative CHECK (size_bytes >= 0),
  CONSTRAINT inbox_attachments_part_index_nonnegative CHECK (part_index >= 0),
  CONSTRAINT inbox_attachments_retry_nonnegative CHECK (retry_count >= 0),
  CONSTRAINT inbox_attachments_message_part_unique UNIQUE (message_id, part_index)
);

-- Pending storage uploads for orphan GC (service_role only).
CREATE TABLE IF NOT EXISTS public.inbox_storage_leases (
  storage_path text PRIMARY KEY,
  mailbox_id uuid NOT NULL REFERENCES public.inbox_mailboxes (id) ON DELETE CASCADE,
  message_id uuid NULL REFERENCES public.inbox_messages (id) ON DELETE SET NULL,
  attachment_id uuid NULL,
  lock_token uuid NULL,
  committed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbox_storage_leases_cleanup_idx
  ON public.inbox_storage_leases (committed, created_at)
  WHERE committed = false;

CREATE INDEX IF NOT EXISTS inbox_messages_mailbox_received_idx
  ON public.inbox_messages (mailbox_id, received_at DESC);

CREATE INDEX IF NOT EXISTS inbox_messages_mailbox_status_received_idx
  ON public.inbox_messages (mailbox_id, processing_status, received_at DESC);

CREATE INDEX IF NOT EXISTS inbox_messages_mailbox_unread_idx
  ON public.inbox_messages (mailbox_id, received_at DESC)
  WHERE is_unread_local = true;

CREATE INDEX IF NOT EXISTS inbox_messages_thread_key_idx
  ON public.inbox_messages (thread_key);

CREATE INDEX IF NOT EXISTS inbox_attachments_message_id_idx
  ON public.inbox_attachments (message_id);

CREATE INDEX IF NOT EXISTS inbox_attachments_needs_repair_idx
  ON public.inbox_attachments (message_id)
  WHERE stored = false
    AND skip_reason IN ('storage_upload_failed', 'missing_content');

-- ---------------------------------------------------------------------------
-- Private storage bucket (no public/anon read)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inbox-attachments',
  'inbox-attachments',
  false,
  10485760,
  NULL
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS inbox_attachments_storage_select ON storage.objects;
DROP POLICY IF EXISTS inbox_attachments_storage_insert ON storage.objects;
DROP POLICY IF EXISTS inbox_attachments_storage_update ON storage.objects;
DROP POLICY IF EXISTS inbox_attachments_storage_delete ON storage.objects;
-- No policies for anon/authenticated: access only via service role signed URLs after RBAC.

-- ---------------------------------------------------------------------------
-- RLS + table grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.inbox_mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_storage_leases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.inbox_mailboxes FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.inbox_sync_state FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.inbox_messages FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.inbox_attachments FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.inbox_storage_leases FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.inbox_mailboxes TO authenticated;
-- inbox_sync_state: no SELECT for authenticated (lock_token privacy). Use get_inbox_sync_status().
GRANT SELECT ON TABLE public.inbox_messages TO authenticated;
GRANT SELECT ON TABLE public.inbox_attachments TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.inbox_mailboxes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.inbox_sync_state FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.inbox_messages FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.inbox_attachments FROM authenticated;

DROP POLICY IF EXISTS inbox_mailboxes_select ON public.inbox_mailboxes;
CREATE POLICY inbox_mailboxes_select
  ON public.inbox_mailboxes
  FOR SELECT
  TO authenticated
  USING (public.has_rbac_permission('inbox.view'));

DROP POLICY IF EXISTS inbox_sync_state_select ON public.inbox_sync_state;
-- No authenticated SELECT policy on inbox_sync_state (lock secrets).

DROP POLICY IF EXISTS inbox_messages_select ON public.inbox_messages;
CREATE POLICY inbox_messages_select
  ON public.inbox_messages
  FOR SELECT
  TO authenticated
  USING (public.has_rbac_permission('inbox.view'));

DROP POLICY IF EXISTS inbox_attachments_select ON public.inbox_attachments;
CREATE POLICY inbox_attachments_select
  ON public.inbox_attachments
  FOR SELECT
  TO authenticated
  USING (public.has_rbac_permission('inbox.view'));

-- ---------------------------------------------------------------------------
-- Sync lock + cursor fencing (SECURITY DEFINER)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.acquire_inbox_sync_lock(
  p_mailbox_id uuid,
  p_lock_token uuid,
  p_ttl_seconds integer DEFAULT 180
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF p_mailbox_id IS NULL OR p_lock_token IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.inbox_sync_state
  SET
    lock_token = p_lock_token,
    lock_acquired_at = now(),
    lock_expires_at = now() + make_interval(secs => GREATEST(p_ttl_seconds, 30)),
    updated_at = now()
  WHERE mailbox_id = p_mailbox_id
    AND (
      lock_token IS NULL
      OR lock_expires_at IS NULL
      OR lock_expires_at < now()
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_inbox_sync_lock(
  p_mailbox_id uuid,
  p_lock_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  UPDATE public.inbox_sync_state
  SET
    lock_token = NULL,
    lock_acquired_at = NULL,
    lock_expires_at = NULL,
    updated_at = now()
  WHERE mailbox_id = p_mailbox_id
    AND lock_token = p_lock_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_inbox_sync_lock(
  p_mailbox_id uuid,
  p_lock_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.inbox_sync_state
    WHERE mailbox_id = p_mailbox_id
      AND lock_token = p_lock_token
      AND lock_expires_at IS NOT NULL
      AND lock_expires_at >= now()
  );
END;
$$;

-- Atomic lock claim used inside mutating RPCs (FOR UPDATE + ownership check).
CREATE OR REPLACE FUNCTION public.claim_inbox_sync_lock_for_mutation(
  p_mailbox_id uuid,
  p_lock_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token uuid;
  v_expires timestamptz;
BEGIN
  SELECT lock_token, lock_expires_at
  INTO v_token, v_expires
  FROM public.inbox_sync_state
  WHERE mailbox_id = p_mailbox_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN v_token = p_lock_token
    AND v_expires IS NOT NULL
    AND v_expires >= now();
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_inbox_sync_cursor(
  p_mailbox_id uuid,
  p_lock_token uuid,
  p_uidvalidity bigint,
  p_cursor_uid bigint,
  p_backfill_complete boolean DEFAULT NULL,
  p_last_error text DEFAULT NULL,
  p_success boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF p_cursor_uid IS NULL OR p_cursor_uid < 0 THEN
    RAISE EXCEPTION 'Invalid cursor';
  END IF;

  IF NOT public.claim_inbox_sync_lock_for_mutation(p_mailbox_id, p_lock_token) THEN
    RETURN false;
  END IF;

  UPDATE public.inbox_sync_state
  SET
    -- UIDVALIDITY change: reset cursor (do not GREATEST with the prior generation).
    cursor_uid = CASE
      WHEN uidvalidity IS DISTINCT FROM p_uidvalidity THEN p_cursor_uid
      ELSE GREATEST(cursor_uid, p_cursor_uid)
    END,
    backfill_complete = CASE
      WHEN uidvalidity IS DISTINCT FROM p_uidvalidity THEN COALESCE(p_backfill_complete, false)
      ELSE COALESCE(p_backfill_complete, backfill_complete)
    END,
    uidvalidity = p_uidvalidity,
    last_synced_at = now(),
    last_success_at = CASE WHEN p_success THEN now() ELSE last_success_at END,
    last_error = CASE WHEN p_success THEN NULL ELSE COALESCE(p_last_error, last_error) END,
    updated_at = now()
  WHERE mailbox_id = p_mailbox_id
    AND lock_token = p_lock_token
    AND lock_expires_at >= now();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- Upsert sync content without overwriting local workflow fields.
-- Lock ownership is claimed with FOR UPDATE before any write.
CREATE OR REPLACE FUNCTION public.upsert_inbox_message_from_sync(
  p_mailbox_id uuid,
  p_lock_token uuid,
  p_folder text,
  p_uidvalidity bigint,
  p_imap_uid bigint,
  p_message_id_header text,
  p_in_reply_to text,
  p_references_header text,
  p_thread_key text,
  p_from_address text,
  p_from_name text,
  p_to_addresses jsonb,
  p_cc_addresses jsonb,
  p_subject text,
  p_sent_at timestamptz,
  p_received_at timestamptz,
  p_snippet text,
  p_body_text text,
  p_body_html_sanitized text,
  p_has_attachments boolean,
  p_size_bytes integer,
  p_imap_flags jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.claim_inbox_sync_lock_for_mutation(p_mailbox_id, p_lock_token) THEN
    RAISE EXCEPTION 'Sync lock lost';
  END IF;

  INSERT INTO public.inbox_messages (
    mailbox_id,
    folder,
    uidvalidity,
    imap_uid,
    message_id_header,
    in_reply_to,
    references_header,
    thread_key,
    from_address,
    from_name,
    to_addresses,
    cc_addresses,
    subject,
    sent_at,
    received_at,
    snippet,
    body_text,
    body_html_sanitized,
    has_attachments,
    size_bytes,
    imap_flags
  )
  VALUES (
    p_mailbox_id,
    p_folder,
    p_uidvalidity,
    p_imap_uid,
    p_message_id_header,
    p_in_reply_to,
    p_references_header,
    p_thread_key,
    COALESCE(p_from_address, ''),
    COALESCE(p_from_name, ''),
    COALESCE(p_to_addresses, '[]'::jsonb),
    COALESCE(p_cc_addresses, '[]'::jsonb),
    COALESCE(p_subject, ''),
    p_sent_at,
    p_received_at,
    COALESCE(p_snippet, ''),
    p_body_text,
    p_body_html_sanitized,
    COALESCE(p_has_attachments, false),
    p_size_bytes,
    COALESCE(p_imap_flags, '[]'::jsonb)
  )
  ON CONFLICT (mailbox_id, folder, uidvalidity, imap_uid) DO UPDATE
  SET
    message_id_header = EXCLUDED.message_id_header,
    in_reply_to = EXCLUDED.in_reply_to,
    references_header = EXCLUDED.references_header,
    thread_key = EXCLUDED.thread_key,
    from_address = EXCLUDED.from_address,
    from_name = EXCLUDED.from_name,
    to_addresses = EXCLUDED.to_addresses,
    cc_addresses = EXCLUDED.cc_addresses,
    subject = EXCLUDED.subject,
    sent_at = EXCLUDED.sent_at,
    received_at = EXCLUDED.received_at,
    snippet = EXCLUDED.snippet,
    body_text = EXCLUDED.body_text,
    body_html_sanitized = EXCLUDED.body_html_sanitized,
    has_attachments = EXCLUDED.has_attachments,
    size_bytes = EXCLUDED.size_bytes,
    imap_flags = EXCLUDED.imap_flags,
    synced_at = now(),
    updated_at = now()
    -- intentionally does NOT update is_unread_local / processing_status /
    -- processed_at / processed_by
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Upsert one attachment part under lock. Never downgrades a stored working attachment.
-- Returns previous storage_path when a stored object is replaced (caller may delete blob).
CREATE OR REPLACE FUNCTION public.upsert_inbox_attachment_from_sync(
  p_mailbox_id uuid,
  p_lock_token uuid,
  p_message_id uuid,
  p_part_index integer,
  p_filename text,
  p_content_type text,
  p_size_bytes integer,
  p_content_id text,
  p_storage_path text,
  p_checksum_sha256 text,
  p_stored boolean,
  p_skip_reason text
)
RETURNS TABLE (
  attachment_id uuid,
  previous_storage_path text,
  kept_existing boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_mailbox uuid;
  v_existing_id uuid;
  v_existing_path text;
  v_existing_stored boolean;
  v_id uuid;
  v_prev text;
  v_kept boolean := false;
BEGIN
  IF NOT public.claim_inbox_sync_lock_for_mutation(p_mailbox_id, p_lock_token) THEN
    RAISE EXCEPTION 'Sync lock lost';
  END IF;

  SELECT message.mailbox_id
  INTO v_message_mailbox
  FROM public.inbox_messages AS message
  WHERE message.id = p_message_id
  FOR UPDATE;

  IF v_message_mailbox IS NULL OR v_message_mailbox <> p_mailbox_id THEN
    RAISE EXCEPTION 'Message mailbox mismatch';
  END IF;

  SELECT attachment.id, attachment.storage_path, attachment.stored
  INTO v_existing_id, v_existing_path, v_existing_stored
  FROM public.inbox_attachments AS attachment
  WHERE attachment.message_id = p_message_id
    AND attachment.part_index = p_part_index
  FOR UPDATE;

  IF v_existing_stored IS TRUE
    AND COALESCE(p_stored, false) IS NOT TRUE
  THEN
    -- Keep working attachment; do not replace with a failed/empty retry.
    v_id := v_existing_id;
    v_prev := NULL;
    v_kept := true;
  ELSE
    INSERT INTO public.inbox_attachments (
      message_id,
      part_index,
      filename,
      content_type,
      size_bytes,
      content_id,
      storage_path,
      checksum_sha256,
      stored,
      skip_reason
    )
    VALUES (
      p_message_id,
      p_part_index,
      COALESCE(p_filename, 'anhang'),
      p_content_type,
      COALESCE(p_size_bytes, 0),
      p_content_id,
      p_storage_path,
      p_checksum_sha256,
      COALESCE(p_stored, false),
      p_skip_reason
    )
    ON CONFLICT (message_id, part_index) DO UPDATE
    SET
      filename = EXCLUDED.filename,
      content_type = EXCLUDED.content_type,
      size_bytes = EXCLUDED.size_bytes,
      content_id = EXCLUDED.content_id,
      storage_path = CASE
        WHEN EXCLUDED.stored THEN EXCLUDED.storage_path
        WHEN public.inbox_attachments.stored THEN public.inbox_attachments.storage_path
        ELSE EXCLUDED.storage_path
      END,
      checksum_sha256 = CASE
        WHEN EXCLUDED.stored THEN EXCLUDED.checksum_sha256
        WHEN public.inbox_attachments.stored THEN public.inbox_attachments.checksum_sha256
        ELSE EXCLUDED.checksum_sha256
      END,
      stored = CASE
        WHEN EXCLUDED.stored THEN true
        WHEN public.inbox_attachments.stored THEN true
        ELSE false
      END,
      skip_reason = CASE
        WHEN EXCLUDED.stored THEN NULL
        WHEN public.inbox_attachments.stored THEN NULL
        ELSE EXCLUDED.skip_reason
      END,
      retry_count = CASE
        WHEN EXCLUDED.stored THEN 0
        ELSE public.inbox_attachments.retry_count
      END,
      last_repair_error = CASE
        WHEN EXCLUDED.stored THEN NULL
        ELSE public.inbox_attachments.last_repair_error
      END,
      updated_at = now()
    RETURNING id INTO v_id;

    IF v_existing_stored IS TRUE
      AND COALESCE(p_stored, false) IS TRUE
      AND v_existing_path IS NOT NULL
      AND v_existing_path IS DISTINCT FROM p_storage_path
    THEN
      v_prev := v_existing_path;
    ELSE
      v_prev := NULL;
    END IF;
  END IF;

  attachment_id := v_id;
  previous_storage_path := v_prev;
  kept_existing := v_kept;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_inbox_message_local_state(
  p_message_id uuid,
  p_is_unread_local boolean DEFAULT NULL,
  p_processing_status text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_rbac_permission('inbox.manage') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_processing_status IS NOT NULL
    AND p_processing_status NOT IN ('open', 'in_progress', 'done')
  THEN
    RAISE EXCEPTION 'Invalid processing status';
  END IF;

  UPDATE public.inbox_messages
  SET
    is_unread_local = COALESCE(p_is_unread_local, is_unread_local),
    processing_status = COALESCE(p_processing_status, processing_status),
    processed_at = CASE
      WHEN p_processing_status IS NULL THEN processed_at
      WHEN p_processing_status = 'done' THEN COALESCE(processed_at, now())
      ELSE NULL
    END,
    processed_by = CASE
      WHEN p_processing_status IS NULL THEN processed_by
      WHEN p_processing_status = 'done' THEN auth.uid()
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = p_message_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_inbox_unread_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_rbac_permission('inbox.view') THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM public.inbox_messages AS message
  INNER JOIN public.inbox_sync_state AS state
    ON state.mailbox_id = message.mailbox_id
  WHERE message.is_unread_local = true
    AND state.uidvalidity IS NOT NULL
    AND message.uidvalidity = state.uidvalidity;

  RETURN COALESCE(v_count, 0);
END;
$$;

-- Sanitized sync status for admins (no lock_token / ownership fields).
CREATE OR REPLACE FUNCTION public.get_inbox_sync_status()
RETURNS TABLE (
  mailbox_id uuid,
  folder text,
  uidvalidity bigint,
  cursor_uid bigint,
  backfill_complete boolean,
  backfill_cutoff_at timestamptz,
  last_synced_at timestamptz,
  last_success_at timestamptz,
  last_error text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_rbac_permission('inbox.view') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    state.mailbox_id,
    state.folder,
    state.uidvalidity,
    state.cursor_uid,
    state.backfill_complete,
    state.backfill_cutoff_at,
    state.last_synced_at,
    state.last_success_at,
    state.last_error
  FROM public.inbox_sync_state AS state
  ORDER BY state.updated_at DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_inbox_sync_lock(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_inbox_sync_lock(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_inbox_sync_lock(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_inbox_sync_lock_for_mutation(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_inbox_sync_cursor(uuid, uuid, bigint, bigint, boolean, text, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_inbox_message_from_sync(
  uuid, uuid, text, bigint, bigint, text, text, text, text, text, text, jsonb, jsonb, text,
  timestamptz, timestamptz, text, text, text, boolean, integer, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_inbox_attachment_from_sync(
  uuid, uuid, uuid, integer, text, text, integer, text, text, text, boolean, text
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_inbox_message_local_state(uuid, boolean, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_inbox_unread_count() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_inbox_sync_status() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_inbox_message_local_state(uuid, boolean, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inbox_unread_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inbox_sync_status() TO authenticated;

-- Sync path: service_role only (never authenticated/anon).
GRANT ALL ON TABLE public.inbox_mailboxes TO service_role;
GRANT ALL ON TABLE public.inbox_sync_state TO service_role;
GRANT ALL ON TABLE public.inbox_messages TO service_role;
GRANT ALL ON TABLE public.inbox_attachments TO service_role;

GRANT EXECUTE ON FUNCTION public.acquire_inbox_sync_lock(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_inbox_sync_lock(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_inbox_sync_lock(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_inbox_sync_lock_for_mutation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_inbox_sync_cursor(
  uuid, uuid, bigint, bigint, boolean, text, boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_inbox_message_from_sync(
  uuid, uuid, text, bigint, bigint, text, text, text, text, text, text, jsonb, jsonb, text,
  timestamptz, timestamptz, text, text, text, boolean, integer, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_inbox_attachment_from_sync(
  uuid, uuid, uuid, integer, text, text, integer, text, text, text, boolean, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- Storage lease + orphan cleanup + repair bookkeeping (service_role)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_inbox_storage_lease(
  p_mailbox_id uuid,
  p_lock_token uuid,
  p_storage_path text,
  p_message_id uuid DEFAULT NULL,
  p_attachment_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_storage_path IS NULL OR length(trim(p_storage_path)) = 0 THEN
    RETURN false;
  END IF;
  IF NOT public.claim_inbox_sync_lock_for_mutation(p_mailbox_id, p_lock_token) THEN
    RAISE EXCEPTION 'Sync lock lost';
  END IF;

  INSERT INTO public.inbox_storage_leases (
    storage_path, mailbox_id, message_id, attachment_id, lock_token, committed
  )
  VALUES (
    p_storage_path, p_mailbox_id, p_message_id, p_attachment_id, p_lock_token, false
  )
  ON CONFLICT (storage_path) DO UPDATE
  SET
    mailbox_id = EXCLUDED.mailbox_id,
    message_id = EXCLUDED.message_id,
    attachment_id = EXCLUDED.attachment_id,
    lock_token = EXCLUDED.lock_token,
    committed = false,
    created_at = now();

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_inbox_storage_lease(
  p_mailbox_id uuid,
  p_lock_token uuid,
  p_storage_path text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF NOT public.claim_inbox_sync_lock_for_mutation(p_mailbox_id, p_lock_token) THEN
    RAISE EXCEPTION 'Sync lock lost';
  END IF;

  UPDATE public.inbox_storage_leases
  SET committed = true
  WHERE storage_path = p_storage_path
    AND mailbox_id = p_mailbox_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- Returns abandoned lease paths safe to delete (not referenced by a stored attachment).
CREATE OR REPLACE FUNCTION public.list_expired_inbox_storage_leases(
  p_max_age_seconds integer DEFAULT 900,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (storage_path text, mailbox_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT lease.storage_path, lease.mailbox_id
  FROM public.inbox_storage_leases AS lease
  LEFT JOIN public.inbox_attachments AS attachment
    ON attachment.storage_path = lease.storage_path
   AND attachment.stored = true
  LEFT JOIN public.inbox_sync_state AS state
    ON state.mailbox_id = lease.mailbox_id
  WHERE lease.committed = false
    AND lease.created_at < now() - make_interval(secs => GREATEST(p_max_age_seconds, 60))
    AND attachment.id IS NULL
    AND (
      state.lock_token IS NULL
      OR state.lock_expires_at IS NULL
      OR state.lock_expires_at < now()
      OR state.lock_token IS DISTINCT FROM lease.lock_token
    )
  ORDER BY lease.created_at ASC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_inbox_storage_lease(
  p_storage_path text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  -- Refuse if a stored attachment still references the path.
  IF EXISTS (
    SELECT 1
    FROM public.inbox_attachments AS attachment
    WHERE attachment.storage_path = p_storage_path
      AND attachment.stored = true
  ) THEN
    RETURN false;
  END IF;

  DELETE FROM public.inbox_storage_leases
  WHERE storage_path = p_storage_path
    AND committed = false;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_inbox_attachment_repair_attempt(
  p_mailbox_id uuid,
  p_lock_token uuid,
  p_attachment_id uuid,
  p_error_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF NOT public.claim_inbox_sync_lock_for_mutation(p_mailbox_id, p_lock_token) THEN
    RAISE EXCEPTION 'Sync lock lost';
  END IF;

  UPDATE public.inbox_attachments AS attachment
  SET
    retry_count = attachment.retry_count + 1,
    last_repair_at = now(),
    last_repair_error = left(COALESCE(p_error_code, 'repair_attempt'), 80),
    updated_at = now()
  FROM public.inbox_messages AS message
  WHERE attachment.id = p_attachment_id
    AND message.id = attachment.message_id
    AND message.mailbox_id = p_mailbox_id
    AND attachment.stored = false;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.register_inbox_storage_lease(uuid, uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_inbox_storage_lease(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_expired_inbox_storage_leases(integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_inbox_storage_lease(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_inbox_attachment_repair_attempt(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.inbox_storage_leases TO service_role;
GRANT EXECUTE ON FUNCTION public.register_inbox_storage_lease(uuid, uuid, text, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_inbox_storage_lease(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.list_expired_inbox_storage_leases(integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_inbox_storage_lease(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_inbox_attachment_repair_attempt(uuid, uuid, uuid, text)
  TO service_role;
