-- =============================================================================
-- Phase 4b: Bind staged outbound attachments into claim_inbox_reply_send + retention
-- Production: NOT auto-applied. Apply only after approval.
-- Does NOT enable composer UI. Does NOT change IMAP / Resend / sandbox.
-- =============================================================================

BEGIN;

-- Ordinal for MIME order after bind (1-based).
ALTER TABLE public.inbox_reply_uploads
  ADD COLUMN IF NOT EXISTS bind_ordinal integer NULL;

ALTER TABLE public.inbox_reply_uploads
  DROP CONSTRAINT IF EXISTS inbox_reply_uploads_bind_ordinal_range;

ALTER TABLE public.inbox_reply_uploads
  ADD CONSTRAINT inbox_reply_uploads_bind_ordinal_range
  CHECK (bind_ordinal IS NULL OR (bind_ordinal >= 1 AND bind_ordinal <= 5));

COMMENT ON COLUMN public.inbox_reply_uploads.bind_ordinal IS
  '1-based MIME order once bound to a reply; NULL while staging.';

-- Column-level SELECT must explicitly include new columns (H3 path still excluded).
GRANT SELECT (bind_ordinal) ON TABLE public.inbox_reply_uploads TO authenticated;

-- Replace claim signature: drop 5-arg overload, add upload_ids array.
DROP FUNCTION IF EXISTS public.claim_inbox_reply_send(uuid, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.claim_inbox_reply_send(
  p_parent_message_id uuid,
  p_idempotency_key uuid,
  p_to_address text,
  p_subject text,
  p_body_text text,
  p_upload_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  reply_id uuid,
  reply_status text,
  send_allowed boolean,
  already_existed boolean,
  error_code text,
  message_id_header text,
  in_reply_to_header text,
  references_header text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_parent public.inbox_messages%ROWTYPE;
  v_domain text;
  v_to text;
  v_subject text;
  v_body text;
  v_existing public.inbox_replies%ROWTYPE;
  v_inserted public.inbox_replies%ROWTYPE;
  v_recent integer := 0;
  v_unresolved integer := 0;
  v_mid text;
  v_in_reply text;
  v_references text;
  v_ref_parts text[] := ARRAY[]::text[];
  v_part text;
  v_norm text;
  v_upload_ids uuid[] := COALESCE(p_upload_ids, ARRAY[]::uuid[]);
  v_attach_count integer := 0;
  v_total_bytes bigint := 0;
  v_bound integer := 0;
  v_existing_ids uuid[];
  v_i integer;
  v_upload_id uuid;
  v_dup_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, false, false, 'not_authenticated'::text,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF NOT public.has_rbac_permission('inbox.view') THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, false, false, 'not_authorized_view'::text,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF NOT public.has_rbac_permission('inbox.reply') THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, false, false, 'not_authorized'::text,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF p_idempotency_key IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, false, false, 'invalid_idempotency_key'::text,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Normalize upload id list (preserve request order; reject nulls/dupes).
  v_attach_count := COALESCE(array_length(v_upload_ids, 1), 0);
  IF v_attach_count > 0 THEN
    IF array_position(v_upload_ids, NULL) IS NOT NULL THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, false, false, 'attachment_invalid'::text,
        NULL::text, NULL::text, NULL::text;
      RETURN;
    END IF;
    SELECT count(*)::integer
    INTO v_dup_count
    FROM (
      SELECT u FROM unnest(v_upload_ids) AS u GROUP BY u HAVING count(*) > 1
    ) AS dups;
    IF v_dup_count > 0 THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, false, false, 'attachment_duplicate'::text,
        NULL::text, NULL::text, NULL::text;
      RETURN;
    END IF;
  END IF;
  IF v_attach_count > 5 THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, false, false, 'attachment_quota_count'::text,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(87235101, hashtext(v_uid::text));

  UPDATE public.inbox_replies
  SET
    status = 'uncertain',
    error = left(COALESCE(NULLIF(trim(error), ''), 'send_abandoned_timeout'), 500),
    updated_at = now()
  WHERE created_by = v_uid
    AND status = 'sending'
    AND created_at < now() - interval '15 minutes';

  v_to := lower(trim(COALESCE(p_to_address, '')));
  v_subject := trim(COALESCE(p_subject, ''));
  v_body := COALESCE(p_body_text, '');

  IF length(v_to) = 0 OR length(v_to) > 320
     OR length(v_subject) = 0 OR length(v_subject) > 200
     OR length(v_body) = 0 OR length(v_body) > 20000
  THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, false, false, 'invalid_input'::text,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_to ~ '[[:cntrl:]]' OR v_subject ~ '[[:cntrl:]]' OR v_body ~ E'\\x00' THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, false, false, 'header_injection'::text,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Idempotent replay (actor-scoped). Never re-authorize SMTP.
  SELECT *
  INTO v_existing
  FROM public.inbox_replies AS reply
  WHERE reply.created_by = v_uid
    AND reply.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    SELECT COALESCE(array_agg(upload.id ORDER BY upload.bind_ordinal NULLS LAST, upload.created_at), ARRAY[]::uuid[])
    INTO v_existing_ids
    FROM public.inbox_reply_uploads AS upload
    WHERE upload.reply_id = v_existing.id
      AND upload.status IN ('bound', 'purged');

    IF v_attach_count <> COALESCE(array_length(v_existing_ids, 1), 0)
       OR v_upload_ids IS DISTINCT FROM v_existing_ids
    THEN
      -- Conflicting attachment set for the same idempotency key.
      RETURN QUERY SELECT
        v_existing.id,
        v_existing.status::text,
        false,
        true,
        'idempotency_attachment_conflict'::text,
        v_existing.message_id_header,
        v_existing.in_reply_to_header,
        v_existing.references_header;
      RETURN;
    END IF;

    RETURN QUERY SELECT
      v_existing.id,
      v_existing.status::text,
      false,
      true,
      NULL::text,
      v_existing.message_id_header,
      v_existing.in_reply_to_header,
      v_existing.references_header;
    RETURN;
  END IF;

  SELECT *
  INTO v_parent
  FROM public.inbox_messages AS message
  WHERE message.id = p_parent_message_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, false, false, 'parent_not_found'::text,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF lower(trim(v_parent.from_address)) <> v_to THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, false, false, 'recipient_locked'::text,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT nullif(lower(trim(mailbox.reply_message_id_domain)), '')
  INTO v_domain
  FROM public.inbox_mailboxes AS mailbox
  WHERE mailbox.id = v_parent.mailbox_id;

  IF v_domain IS NULL
     OR v_domain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
     OR v_domain = 'inbox.local'
     OR v_domain LIKE '%.local'
  THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, false, false, 'domain_not_configured'::text,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_unresolved
  FROM public.inbox_replies AS reply
  WHERE reply.created_by = v_uid
    AND reply.parent_message_id = v_parent.id
    AND reply.status IN ('sending', 'uncertain');

  IF v_unresolved > 0 THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, false, false, 'unresolved_reply_exists'::text,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_recent
  FROM public.inbox_replies AS reply
  WHERE reply.created_by = v_uid
    AND reply.created_at >= now() - interval '10 minutes';

  IF v_recent >= 20 THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, false, false, 'rate_limited'::text,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Validate and lock staging uploads for atomic bind.
  -- M2: lock ONLY actor-owned rows for this parent/mailbox — never foreign UUIDs.
  IF v_attach_count > 0 THEN
    PERFORM 1
    FROM public.inbox_reply_uploads AS upload
    WHERE upload.id = ANY (v_upload_ids)
      AND upload.created_by = v_uid
      AND upload.parent_message_id = v_parent.id
      AND upload.mailbox_id = v_parent.mailbox_id
    FOR UPDATE;

    SELECT COALESCE(sum(upload.size_bytes), 0), count(*)::integer
    INTO v_total_bytes, v_bound
    FROM public.inbox_reply_uploads AS upload
    WHERE upload.id = ANY (v_upload_ids)
      AND upload.created_by = v_uid
      AND upload.parent_message_id = v_parent.id
      AND upload.mailbox_id = v_parent.mailbox_id
      AND upload.status = 'staging'
      AND upload.expires_at > now()
      AND upload.storage_path IS NOT NULL
      AND upload.checksum_sha256 IS NOT NULL
      AND upload.size_bytes > 0
      AND upload.size_bytes <= 5242880;

    IF v_bound <> v_attach_count THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, false, false, 'attachment_invalid'::text,
        NULL::text, NULL::text, NULL::text;
      RETURN;
    END IF;

    IF v_total_bytes > 12582912 THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, false, false, 'attachment_quota_bytes'::text,
        NULL::text, NULL::text, NULL::text;
      RETURN;
    END IF;
  END IF;

  v_mid := gen_random_uuid()::text || '@' || v_domain;

  IF v_parent.message_id_header IS NOT NULL AND length(trim(v_parent.message_id_header)) > 0 THEN
    v_norm := lower(trim(both '<>' from trim(v_parent.message_id_header)));
    IF v_norm !~ '[[:cntrl:]]' AND length(v_norm) > 0 THEN
      v_in_reply := '<' || v_norm || '>';

      IF v_parent.references_header IS NOT NULL THEN
        FOREACH v_part IN ARRAY regexp_split_to_array(v_parent.references_header, '\s+')
        LOOP
          v_norm := lower(trim(both '<>' from trim(v_part)));
          IF length(v_norm) > 0 AND v_norm !~ '[[:cntrl:]]' AND NOT (v_norm = ANY (v_ref_parts)) THEN
            v_ref_parts := array_append(v_ref_parts, v_norm);
          END IF;
        END LOOP;
      END IF;

      IF v_parent.in_reply_to IS NOT NULL THEN
        v_norm := lower(trim(both '<>' from trim(v_parent.in_reply_to)));
        IF length(v_norm) > 0 AND v_norm !~ '[[:cntrl:]]' AND NOT (v_norm = ANY (v_ref_parts)) THEN
          v_ref_parts := array_append(v_ref_parts, v_norm);
        END IF;
      END IF;

      v_norm := lower(trim(both '<>' from trim(v_parent.message_id_header)));
      IF length(v_norm) > 0 AND NOT (v_norm = ANY (v_ref_parts)) THEN
        v_ref_parts := array_append(v_ref_parts, v_norm);
      END IF;

      SELECT string_agg('<' || part || '>', ' ')
      INTO v_references
      FROM unnest(v_ref_parts) AS part;
    END IF;
  END IF;

  INSERT INTO public.inbox_replies (
    mailbox_id,
    parent_message_id,
    idempotency_key,
    to_address,
    subject,
    body_text,
    message_id_header,
    in_reply_to_header,
    references_header,
    status,
    attachment_count,
    created_by
  )
  VALUES (
    v_parent.mailbox_id,
    v_parent.id,
    p_idempotency_key,
    v_to,
    v_subject,
    v_body,
    v_mid,
    v_in_reply,
    v_references,
    'sending',
    v_attach_count,
    v_uid
  )
  ON CONFLICT (created_by, idempotency_key) DO NOTHING
  RETURNING * INTO v_inserted;

  IF NOT FOUND THEN
    SELECT *
    INTO v_existing
    FROM public.inbox_replies AS reply
    WHERE reply.created_by = v_uid
      AND reply.idempotency_key = p_idempotency_key;

    IF NOT FOUND THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, false, false, 'claim_race'::text,
        NULL::text, NULL::text, NULL::text;
      RETURN;
    END IF;

    SELECT COALESCE(array_agg(upload.id ORDER BY upload.bind_ordinal NULLS LAST, upload.created_at), ARRAY[]::uuid[])
    INTO v_existing_ids
    FROM public.inbox_reply_uploads AS upload
    WHERE upload.reply_id = v_existing.id
      AND upload.status IN ('bound', 'purged');

    IF v_attach_count <> COALESCE(array_length(v_existing_ids, 1), 0)
       OR v_upload_ids IS DISTINCT FROM v_existing_ids
    THEN
      RETURN QUERY SELECT
        v_existing.id,
        v_existing.status::text,
        false,
        true,
        'idempotency_attachment_conflict'::text,
        v_existing.message_id_header,
        v_existing.in_reply_to_header,
        v_existing.references_header;
      RETURN;
    END IF;

    RETURN QUERY SELECT
      v_existing.id,
      v_existing.status::text,
      false,
      true,
      NULL::text,
      v_existing.message_id_header,
      v_existing.in_reply_to_header,
      v_existing.references_header;
    RETURN;
  END IF;

  -- Atomic bind in claim order.
  IF v_attach_count > 0 THEN
    v_i := 0;
    FOREACH v_upload_id IN ARRAY v_upload_ids
    LOOP
      v_i := v_i + 1;
      UPDATE public.inbox_reply_uploads AS upload
      SET
        status = 'bound',
        reply_id = v_inserted.id,
        bind_ordinal = v_i,
        bound_at = now(),
        retain_until = NULL,
        updated_at = now(),
        error_code = NULL
      WHERE upload.id = v_upload_id
        AND upload.created_by = v_uid
        AND upload.parent_message_id = v_parent.id
        AND upload.mailbox_id = v_parent.mailbox_id
        AND upload.status = 'staging'
        AND upload.expires_at > now()
        AND upload.storage_path IS NOT NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'attachment_bind_race';
      END IF;
    END LOOP;
  END IF;

  RETURN QUERY SELECT
    v_inserted.id,
    v_inserted.status::text,
    true,
    false,
    NULL::text,
    v_inserted.message_id_header,
    v_inserted.in_reply_to_header,
    v_inserted.references_header;
END;
$$;

-- Activate 30-day retention when a reply leaves sending as sent/failed.
-- Uncertain keeps retain_until NULL so purge eligibility stays blocked.
CREATE OR REPLACE FUNCTION public.finalize_inbox_reply_send(
  p_reply_id uuid,
  p_status text,
  p_error text DEFAULT NULL,
  p_smtp_response text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
  v_error text;
  v_smtp text;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('sent', 'failed', 'uncertain') THEN
    RAISE EXCEPTION 'Invalid finalize status';
  END IF;

  v_error := left(trim(COALESCE(p_error, '')), 500);
  IF length(v_error) = 0 THEN
    v_error := NULL;
  END IF;

  IF v_error IS NOT NULL THEN
    v_error := regexp_replace(v_error, 'pass(word)?[=:]\s*\S+', 'password=[redacted]', 'gi');
    v_error := regexp_replace(v_error, 'AUTH\s+[A-Z0-9_-]+\s+\S+', 'AUTH [redacted]', 'gi');
    v_error := regexp_replace(v_error, '(user(name)?|login)[=:]\s*\S+', '\1=[redacted]', 'gi');
  END IF;

  v_smtp := left(trim(COALESCE(p_smtp_response, '')), 500);
  IF length(v_smtp) = 0 THEN
    v_smtp := NULL;
  ELSE
    v_smtp := regexp_replace(v_smtp, 'pass(word)?[=:]\s*\S+', 'password=[redacted]', 'gi');
    v_smtp := regexp_replace(v_smtp, 'AUTH\s+[A-Z0-9_-]+\s+\S+', 'AUTH [redacted]', 'gi');
    v_smtp := regexp_replace(v_smtp, '(user(name)?|login)[=:]\s*\S+', '\1=[redacted]', 'gi');
  END IF;

  UPDATE public.inbox_replies
  SET
    status = p_status,
    error = v_error,
    smtp_response = v_smtp,
    sent_at = CASE WHEN p_status = 'sent' THEN COALESCE(sent_at, now()) ELSE sent_at END,
    updated_at = now()
  WHERE id = p_reply_id
    AND status = 'sending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 AND p_status IN ('sent', 'failed') THEN
    UPDATE public.inbox_reply_uploads
    SET
      retain_until = now() + interval '30 days',
      updated_at = now()
    WHERE reply_id = p_reply_id
      AND status = 'bound'
      AND storage_path IS NOT NULL
      AND retain_until IS NULL;
  END IF;

  RETURN v_updated > 0;
END;
$$;

-- service_role: list bound attachment metadata for SMTP load (no bytes).
CREATE OR REPLACE FUNCTION public.list_inbox_reply_bound_uploads(
  p_reply_id uuid
)
RETURNS TABLE (
  upload_id uuid,
  filename text,
  content_type text,
  size_bytes integer,
  checksum_sha256 text,
  storage_path text,
  bind_ordinal integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    upload.id,
    upload.filename,
    upload.content_type,
    upload.size_bytes,
    upload.checksum_sha256,
    upload.storage_path,
    upload.bind_ordinal
  FROM public.inbox_reply_uploads AS upload
  WHERE upload.reply_id = p_reply_id
    AND upload.status = 'bound'
    AND upload.storage_path IS NOT NULL
  ORDER BY upload.bind_ordinal ASC NULLS LAST, upload.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_inbox_reply_send(uuid, uuid, text, text, text, uuid[])
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_inbox_reply_bound_uploads(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_inbox_reply_send(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_inbox_reply_send(uuid, uuid, text, text, text, uuid[])
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_inbox_reply_bound_uploads(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_inbox_reply_send(uuid, text, text, text)
  TO service_role;

COMMIT;
