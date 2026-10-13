-- =============================================================================
-- IONOS Inbox replies (SMTP outbound) — additive, isolated from Resend
-- Production: NOT auto-applied. Apply in Supabase SQL Editor only after approval.
-- Entire script is transactional — apply as one unit; re-runnable where noted.
-- Does NOT modify application outbound mail tables, IMAP sync objects, or Resend.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Permission: inbox.reply (SUPER_ADMIN + ADMIN only; NOT COMMUNICATION_MANAGER)
-- ---------------------------------------------------------------------------

INSERT INTO public.rbac_permissions (key, name, category) VALUES
  ('inbox.reply', 'Posteingang beantworten', 'inbox')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.rbac_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.rbac_roles AS r
JOIN public.rbac_permissions AS p ON p.key = 'inbox.reply'
WHERE r.key IN ('SUPER_ADMIN', 'ADMIN')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Mailbox: verified Message-ID domain (no inbox.local fallback)
-- Must be set (service_role / approved ops) before claims succeed.
-- ---------------------------------------------------------------------------

ALTER TABLE public.inbox_mailboxes
  ADD COLUMN IF NOT EXISTS reply_message_id_domain text NULL;

ALTER TABLE public.inbox_mailboxes
  DROP CONSTRAINT IF EXISTS inbox_mailboxes_reply_message_id_domain_format;

ALTER TABLE public.inbox_mailboxes
  ADD CONSTRAINT inbox_mailboxes_reply_message_id_domain_format
  CHECK (
    reply_message_id_domain IS NULL
    OR reply_message_id_domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  );

COMMENT ON COLUMN public.inbox_mailboxes.reply_message_id_domain IS
  'DNS domain used in outbound reply Message-IDs (must match configured IONOS From domain).';

-- ---------------------------------------------------------------------------
-- inbox_replies — local outbound audit + send-state machine
-- Status lifecycle (uncertain / abandoned sending must not auto-resend):
--   pending   → reserved (unused by claim; future drafts)
--   sending   → exclusive claim; SMTP in flight
--   sent      → terminal success
--   failed    → terminal clear rejection (retry = NEW operation after reconcile)
--   uncertain → unknown SMTP outcome / abandoned send; NEVER auto-resend
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inbox_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES public.inbox_mailboxes (id) ON DELETE CASCADE,
  parent_message_id uuid NOT NULL REFERENCES public.inbox_messages (id) ON DELETE CASCADE,
  -- Actor-scoped idempotency (no cross-user key collisions / disclosure).
  idempotency_key uuid NOT NULL,
  to_address text NOT NULL,
  subject text NOT NULL,
  body_text text NOT NULL,
  body_html text NULL,
  message_id_header text NOT NULL,
  in_reply_to_header text NULL,
  references_header text NULL,
  status text NOT NULL DEFAULT 'sending',
  error text NULL,
  smtp_response text NULL,
  provider text NOT NULL DEFAULT 'ionos-smtp',
  -- v1: attachments not implemented — must stay zero.
  attachment_count integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz NULL,
  CONSTRAINT inbox_replies_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'uncertain')),
  CONSTRAINT inbox_replies_actor_idempotency_unique
    UNIQUE (created_by, idempotency_key),
  CONSTRAINT inbox_replies_to_address_not_empty
    CHECK (length(trim(to_address)) > 0 AND length(trim(to_address)) <= 320),
  CONSTRAINT inbox_replies_subject_length
    CHECK (length(trim(subject)) > 0 AND length(subject) <= 200),
  CONSTRAINT inbox_replies_body_length
    CHECK (length(body_text) > 0 AND length(body_text) <= 20000),
  CONSTRAINT inbox_replies_message_id_not_empty
    CHECK (length(trim(message_id_header)) > 0 AND length(message_id_header) <= 300),
  CONSTRAINT inbox_replies_attachment_count_zero_v1
    CHECK (attachment_count = 0),
  CONSTRAINT inbox_replies_provider_check
    CHECK (provider = 'ionos-smtp'),
  CONSTRAINT inbox_replies_no_body_html_v1
    CHECK (body_html IS NULL)
);

CREATE INDEX IF NOT EXISTS inbox_replies_parent_created_idx
  ON public.inbox_replies (parent_message_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inbox_replies_created_by_created_idx
  ON public.inbox_replies (created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS inbox_replies_status_created_idx
  ON public.inbox_replies (status, created_at DESC);

CREATE INDEX IF NOT EXISTS inbox_replies_actor_parent_unresolved_idx
  ON public.inbox_replies (created_by, parent_message_id)
  WHERE status IN ('sending', 'uncertain');

-- ---------------------------------------------------------------------------
-- RLS: SELECT for inbox.view; mutations only via SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------

ALTER TABLE public.inbox_replies ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.inbox_replies FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.inbox_replies TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.inbox_replies FROM authenticated;
GRANT ALL ON TABLE public.inbox_replies TO service_role;

DROP POLICY IF EXISTS inbox_replies_select ON public.inbox_replies;
CREATE POLICY inbox_replies_select
  ON public.inbox_replies
  FOR SELECT
  TO authenticated
  USING (public.has_rbac_permission('inbox.view'));

-- ---------------------------------------------------------------------------
-- Constants / helpers
-- ---------------------------------------------------------------------------

-- Rate limit: 20 claims per actor per 10 minutes (enforced inside claim under lock).
-- Stale sending → uncertain after 15 minutes (abandoned worker / crash).

CREATE OR REPLACE FUNCTION public.expire_stale_inbox_reply_sends(
  p_actor_user_id uuid DEFAULT NULL,
  p_stale_after_seconds integer DEFAULT 900
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
  v_seconds integer := GREATEST(COALESCE(p_stale_after_seconds, 900), 60);
BEGIN
  -- Callable by service_role (ops / server). Authenticated users may only expire own rows
  -- via claim path; this function is granted to service_role only.
  UPDATE public.inbox_replies
  SET
    status = 'uncertain',
    error = left(COALESCE(error, 'send_abandoned_timeout'), 500),
    updated_at = now()
  WHERE status = 'sending'
    AND created_at < now() - make_interval(secs => v_seconds)
    AND (p_actor_user_id IS NULL OR created_by = p_actor_user_id);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.expire_stale_inbox_reply_sends(uuid, integer) IS
  'Marks abandoned sending rows as uncertain. Never retries SMTP. service_role only.';

-- Manual reconciliation: mark uncertain/stale sending as sent|failed WITHOUT SMTP.
-- Used only after human/ops verification of the mailbox. service_role only.
CREATE OR REPLACE FUNCTION public.reconcile_inbox_reply_status(
  p_reply_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
  v_note text;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('sent', 'failed') THEN
    RAISE EXCEPTION 'Invalid reconcile status';
  END IF;

  v_note := left(trim(COALESCE(p_note, '')), 500);
  IF length(v_note) = 0 THEN
    v_note := NULL;
  END IF;

  UPDATE public.inbox_replies
  SET
    status = p_status,
    error = CASE
      WHEN p_status = 'failed' THEN COALESCE(v_note, error, 'reconciled_failed')
      ELSE v_note
    END,
    sent_at = CASE
      WHEN p_status = 'sent' THEN COALESCE(sent_at, now())
      ELSE sent_at
    END,
    smtp_response = left(
      trim(COALESCE(smtp_response, '') || ' | reconciled_manual'),
      500
    ),
    updated_at = now()
  WHERE id = p_reply_id
    AND status IN ('uncertain', 'sending');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

COMMENT ON FUNCTION public.reconcile_inbox_reply_status(uuid, text, text) IS
  'Manual ops reconciliation for uncertain/abandoned sends. No SMTP. service_role only.';

CREATE OR REPLACE FUNCTION public.count_inbox_replies_since(p_since timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_rbac_permission('inbox.reply') THEN
    RETURN 0;
  END IF;

  IF p_since IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM public.inbox_replies AS reply
  WHERE reply.created_by = auth.uid()
    AND reply.created_at >= p_since;

  RETURN COALESCE(v_count, 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- Claim send (authenticated): rate-limited under per-actor xact advisory lock.
-- Message-ID + threading headers generated server-side from parent + mailbox domain.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_inbox_reply_send(
  p_parent_message_id uuid,
  p_idempotency_key uuid,
  p_to_address text,
  p_subject text,
  p_body_text text
)
RETURNS TABLE (
  reply_id uuid,
  -- Named reply_status to avoid PL/pgSQL ambiguity with inbox_replies.status.
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

  -- Per-actor transaction lock: serializes claims for rate-limit + unresolved checks.
  PERFORM pg_advisory_xact_lock(87235101, hashtext(v_uid::text));

  -- Abandoned sending → uncertain (never auto-resend).
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

  -- Idempotent replay (actor-scoped only — never reveal other users' rows).
  SELECT *
  INTO v_existing
  FROM public.inbox_replies AS reply
  WHERE reply.created_by = v_uid
    AND reply.idempotency_key = p_idempotency_key;

  IF FOUND THEN
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

  -- Block new keys while an unresolved send exists for this parent (anti-duplicate).
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

  -- Atomic rate limit under the same advisory lock.
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

  -- Server-side Message-ID + threading (never from browser).
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
    0,
    v_uid
  )
  ON CONFLICT (created_by, idempotency_key) DO NOTHING
  RETURNING * INTO v_inserted;

  IF FOUND THEN
    RETURN QUERY SELECT
      v_inserted.id,
      v_inserted.status::text,
      true,
      false,
      NULL::text,
      v_inserted.message_id_header,
      v_inserted.in_reply_to_header,
      v_inserted.references_header;
    RETURN;
  END IF;

  -- Race under lock should be rare; re-select own row only.
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

  RETURN QUERY SELECT
    v_existing.id,
    v_existing.status::text,
    false,
    true,
    NULL::text,
    v_existing.message_id_header,
    v_existing.in_reply_to_header,
    v_existing.references_header;
END;
$$;

-- ---------------------------------------------------------------------------
-- Finalize: service_role ONLY (server after SMTP). Never grant to authenticated.
-- ---------------------------------------------------------------------------

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
  -- Intentionally no auth.uid() gate: only service_role may EXECUTE this function.
  IF p_status IS NULL OR p_status NOT IN ('sent', 'failed', 'uncertain') THEN
    RAISE EXCEPTION 'Invalid finalize status';
  END IF;

  v_error := left(trim(COALESCE(p_error, '')), 500);
  IF length(v_error) = 0 THEN
    v_error := NULL;
  END IF;

  -- Never persist credential-like substrings (error + smtp_response).
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
  RETURN v_updated > 0;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.expire_stale_inbox_reply_sends(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_inbox_reply_status(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.count_inbox_replies_since(timestamptz)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_inbox_reply_send(uuid, uuid, text, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_inbox_reply_send(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.count_inbox_replies_since(timestamptz)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_inbox_reply_send(uuid, uuid, text, text, text)
  TO authenticated;

-- Least privilege: finalize / expire / reconcile are server (service_role) only.
GRANT EXECUTE ON FUNCTION public.count_inbox_replies_since(timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_inbox_reply_send(uuid, uuid, text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_inbox_reply_send(uuid, text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_inbox_reply_sends(uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_inbox_reply_status(uuid, text, text)
  TO service_role;

COMMIT;
