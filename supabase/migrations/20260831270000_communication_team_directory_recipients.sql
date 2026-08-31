-- =============================================================================
-- Communication Center: Team-Datenbank recipient source
-- =============================================================================
-- Production: NOT auto-applied. Run manually in Supabase SQL Editor when ready.
-- Depends on:
--   20260830120000_communication_center.sql
--   20260831120000_communication_receipts.sql
--   20260831230000_communication_recipient_email_dedup.sql
--   20260831210000_rbac_domain_rls_enforcement.sql
--   20260831220000_rbac_security_definer_hardening.sql
--   20260831240000_team_directory.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- tournament_communications: recipient_source
-- -----------------------------------------------------------------------------

ALTER TABLE public.tournament_communications
  ADD COLUMN IF NOT EXISTS recipient_source text;

UPDATE public.tournament_communications
SET recipient_source = 'tournament-applications'
WHERE recipient_source IS NULL;

ALTER TABLE public.tournament_communications
  ALTER COLUMN recipient_source SET DEFAULT 'tournament-applications';

ALTER TABLE public.tournament_communications
  ALTER COLUMN recipient_source SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tournament_communications_recipient_source_check'
  ) THEN
    ALTER TABLE public.tournament_communications
      ADD CONSTRAINT tournament_communications_recipient_source_check
      CHECK (recipient_source IN ('tournament-applications', 'team-directory'));
  END IF;
END
$$;

COMMENT ON COLUMN public.tournament_communications.recipient_source IS
  'Recipient resolution source: tournament applications or team directory (CRM).';

-- -----------------------------------------------------------------------------
-- communication_recipients: team directory linkage + contact snapshot
-- -----------------------------------------------------------------------------

ALTER TABLE public.communication_recipients
  ADD COLUMN IF NOT EXISTS team_directory_entry_id uuid
    REFERENCES public.team_directory_entries (id) ON DELETE SET NULL;

ALTER TABLE public.communication_recipients
  ADD COLUMN IF NOT EXISTS recipient_contact_first_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'communication_recipients_single_source_check'
  ) THEN
    ALTER TABLE public.communication_recipients
      ADD CONSTRAINT communication_recipients_single_source_check
      CHECK (
        NOT (
          application_id IS NOT NULL
          AND team_directory_entry_id IS NOT NULL
        )
      );
  END IF;
END
$$;

-- Verify existing rows before replacing the unique constraint.
DO $$
DECLARE
  v_duplicate_application_pairs integer;
  v_rows_with_both_sources integer;
BEGIN
  SELECT count(*) INTO v_duplicate_application_pairs
  FROM (
    SELECT communication_id, application_id
    FROM public.communication_recipients
    WHERE application_id IS NOT NULL
    GROUP BY communication_id, application_id
    HAVING count(*) > 1
  ) d;

  IF v_duplicate_application_pairs > 0 THEN
    RAISE EXCEPTION
      'communication_recipients has duplicate (communication_id, application_id) rows';
  END IF;

  SELECT count(*) INTO v_rows_with_both_sources
  FROM public.communication_recipients
  WHERE application_id IS NOT NULL
    AND team_directory_entry_id IS NOT NULL;

  IF v_rows_with_both_sources > 0 THEN
    RAISE EXCEPTION
      'communication_recipients has rows with both application_id and team_directory_entry_id';
  END IF;
END
$$;

ALTER TABLE public.communication_recipients
  DROP CONSTRAINT IF EXISTS communication_recipients_unique_application;

CREATE UNIQUE INDEX IF NOT EXISTS communication_recipients_communication_application_uidx
  ON public.communication_recipients (communication_id, application_id)
  WHERE application_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS communication_recipients_communication_directory_uidx
  ON public.communication_recipients (communication_id, team_directory_entry_id)
  WHERE team_directory_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS communication_recipients_team_directory_entry_idx
  ON public.communication_recipients (team_directory_entry_id)
  WHERE team_directory_entry_id IS NOT NULL;

COMMENT ON COLUMN public.communication_recipients.team_directory_entry_id IS
  'Team directory CRM entry for directory-sourced communications.';
COMMENT ON COLUMN public.communication_recipients.recipient_contact_first_name IS
  'Snapshot of contact first name at send time (directory or application).';

-- -----------------------------------------------------------------------------
-- Team directory recipient resolver (parallel to application resolver)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_team_directory_communication_recipients(
  p_entry_ids uuid[]
)
RETURNS TABLE (
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
  IF NOT public.has_rbac_permission('teams.view') THEN
    RAISE EXCEPTION 'teams.view required';
  END IF;

  IF NOT public.has_platform_rbac_access() THEN
    RAISE EXCEPTION 'platform access required';
  END IF;

  IF p_entry_ids IS NULL OR cardinality(p_entry_ids) = 0 THEN
    RAISE EXCEPTION 'team directory entry ids required';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (lower(btrim(tde.contact_email)))
    tde.id,
    lower(btrim(tde.contact_email)),
    COALESCE(NULLIF(btrim(tde.team_name), ''), 'Mannschaft'),
    NULLIF(btrim(tde.club_name), ''),
    NULLIF(btrim(tde.contact_first_name), '')
  FROM public.team_directory_entries tde
  WHERE tde.id = ANY (p_entry_ids)
    AND tde.archived_at IS NULL
    AND tde.contact_email IS NOT NULL
    AND length(btrim(tde.contact_email)) > 0
  ORDER BY
    lower(btrim(tde.contact_email)),
    array_position(p_entry_ids, tde.id),
    tde.id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_team_directory_communication_recipients(uuid[])
  FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- Preview recipients (extended return + source branching)
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.preview_communication_recipients(
  uuid, text, text, uuid[]
);

CREATE OR REPLACE FUNCTION public.preview_communication_recipients(
  p_tournament_id uuid,
  p_communication_type text,
  p_recipient_filter text,
  p_application_ids uuid[] DEFAULT NULL,
  p_recipient_source text DEFAULT 'tournament-applications',
  p_team_directory_entry_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
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
  IF NOT public.has_rbac_permission('communications.view') THEN
    RAISE EXCEPTION 'communications.view required';
  END IF;

  IF COALESCE(p_recipient_source, 'tournament-applications') = 'team-directory' THEN
    IF p_communication_type = 'payment-reminder' THEN
      RAISE EXCEPTION 'payment reminder not allowed for team-directory source';
    END IF;

    RETURN QUERY
    SELECT
      NULL::uuid,
      r.team_directory_entry_id,
      r.recipient_email,
      r.recipient_team_name,
      r.recipient_club_name,
      r.recipient_contact_first_name
    FROM public.resolve_team_directory_communication_recipients(
      p_team_directory_entry_ids
    ) r;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    r.application_id,
    NULL::uuid,
    r.recipient_email,
    r.recipient_team_name,
    r.recipient_club_name,
    NULL::text
  FROM public.resolve_communication_recipients(
    p_tournament_id,
    p_communication_type,
    p_recipient_filter,
    p_application_ids
  ) r;
END;
$$;

-- -----------------------------------------------------------------------------
-- Initiate communication send (extended source branching)
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.initiate_communication_send(
  uuid, text, text, text, boolean, text, uuid[], text, boolean
);

CREATE OR REPLACE FUNCTION public.initiate_communication_send(
  p_tournament_id uuid,
  p_type text,
  p_subject text,
  p_body text,
  p_important boolean,
  p_recipient_filter text,
  p_application_ids uuid[] DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_require_confirmation boolean DEFAULT false,
  p_recipient_source text DEFAULT 'tournament-applications',
  p_team_directory_entry_ids uuid[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_communication_id uuid;
  v_recipient_count integer;
  v_recipient_source text;
BEGIN
  IF NOT public.has_rbac_permission('communications.send') THEN
    RAISE EXCEPTION 'communications.send required';
  END IF;

  v_recipient_source := COALESCE(p_recipient_source, 'tournament-applications');

  IF v_recipient_source NOT IN ('tournament-applications', 'team-directory') THEN
    RAISE EXCEPTION 'invalid recipient source';
  END IF;

  IF p_idempotency_key IS NOT NULL AND length(btrim(p_idempotency_key)) > 0 THEN
    SELECT id INTO v_existing_id
    FROM public.tournament_communications
    WHERE idempotency_key = btrim(p_idempotency_key)
    LIMIT 1;

    IF FOUND THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournaments WHERE id = p_tournament_id
  ) THEN
    RAISE EXCEPTION 'tournament not found';
  END IF;

  IF v_recipient_source = 'team-directory' THEN
    IF p_type = 'payment-reminder' THEN
      RAISE EXCEPTION 'payment reminder not allowed for team-directory source';
    END IF;

    IF p_team_directory_entry_ids IS NULL OR cardinality(p_team_directory_entry_ids) = 0 THEN
      RAISE EXCEPTION 'team directory source requires entry ids';
    END IF;
  ELSE
    IF p_type = 'payment-reminder'
       AND p_recipient_filter NOT IN ('payment-pending', 'custom') THEN
      RAISE EXCEPTION 'payment reminder only allows payment-pending or custom filter';
    END IF;
  END IF;

  INSERT INTO public.tournament_communications (
    tournament_id,
    type,
    subject,
    body,
    important,
    recipient_filter,
    recipient_source,
    status,
    idempotency_key,
    require_confirmation,
    created_by
  )
  VALUES (
    p_tournament_id,
    p_type,
    btrim(p_subject),
    btrim(p_body),
    COALESCE(p_important, false),
    CASE
      WHEN v_recipient_source = 'team-directory' THEN 'custom'
      ELSE p_recipient_filter
    END,
    v_recipient_source,
    'sending',
    NULLIF(btrim(p_idempotency_key), ''),
    COALESCE(p_require_confirmation, false),
    auth.uid()
  )
  RETURNING id INTO v_communication_id;

  IF v_recipient_source = 'team-directory' THEN
    INSERT INTO public.communication_recipients (
      communication_id,
      application_id,
      team_directory_entry_id,
      recipient_email,
      recipient_team_name,
      recipient_club_name,
      recipient_contact_first_name,
      send_status
    )
    SELECT
      v_communication_id,
      NULL,
      r.team_directory_entry_id,
      r.recipient_email,
      r.recipient_team_name,
      r.recipient_club_name,
      r.recipient_contact_first_name,
      'pending'
    FROM public.resolve_team_directory_communication_recipients(
      p_team_directory_entry_ids
    ) r;
  ELSE
    INSERT INTO public.communication_recipients (
      communication_id,
      application_id,
      team_directory_entry_id,
      recipient_email,
      recipient_team_name,
      recipient_club_name,
      recipient_contact_first_name,
      send_status
    )
    SELECT
      v_communication_id,
      r.application_id,
      NULL,
      r.recipient_email,
      r.recipient_team_name,
      r.recipient_club_name,
      NULL,
      'pending'
    FROM public.resolve_communication_recipients(
      p_tournament_id,
      p_type,
      p_recipient_filter,
      p_application_ids
    ) r;
  END IF;

  GET DIAGNOSTICS v_recipient_count = ROW_COUNT;

  IF v_recipient_count = 0 THEN
    UPDATE public.tournament_communications
    SET status = 'failed', updated_at = now()
    WHERE id = v_communication_id;

    RAISE EXCEPTION 'no eligible recipients';
  END IF;

  UPDATE public.tournament_communications
  SET recipient_count = v_recipient_count, updated_at = now()
  WHERE id = v_communication_id;

  RETURN v_communication_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.preview_communication_recipients(
  uuid, text, text, uuid[], text, uuid[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_communication_recipients(
  uuid, text, text, uuid[], text, uuid[]
) TO authenticated;

REVOKE ALL ON FUNCTION public.initiate_communication_send(
  uuid, text, text, text, boolean, text, uuid[], text, boolean, text, uuid[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.initiate_communication_send(
  uuid, text, text, text, boolean, text, uuid[], text, boolean, text, uuid[]
) TO authenticated;
