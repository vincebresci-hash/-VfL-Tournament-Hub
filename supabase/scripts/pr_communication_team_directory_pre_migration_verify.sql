-- =============================================================================
-- PR40 Communication Team-Directory: Read-only PRE-migration verification
-- =============================================================================
-- Run manually in Supabase SQL Editor BEFORE applying
-- 20260831270000_communication_team_directory_recipients.sql
-- SELECT/EXISTS only. No INSERT, UPDATE, DELETE, ALTER, CREATE, or DROP.
-- =============================================================================

-- 1) PR36 prerequisite: team_directory_entries
SELECT EXISTS (
  SELECT 1
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'team_directory_entries'
    AND c.relkind = 'r'
) AS team_directory_entries_exists;

SELECT COALESCE((
  SELECT c.relrowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'team_directory_entries'
), false) AS team_directory_entries_rls_enabled;

-- 2) Communication tables present
SELECT EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'tournament_communications' AND c.relkind = 'r'
) AS tournament_communications_exists;

SELECT EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'communication_recipients' AND c.relkind = 'r'
) AS communication_recipients_exists;

-- 3) PR40 not yet applied: recipient_source must not exist
SELECT NOT EXISTS (
  SELECT 1
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'tournament_communications'
    AND a.attname = 'recipient_source'
    AND NOT a.attisdropped
) AS recipient_source_not_yet_present;

SELECT NOT EXISTS (
  SELECT 1
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'communication_recipients'
    AND a.attname = 'team_directory_entry_id'
    AND NOT a.attisdropped
) AS team_directory_entry_id_not_yet_present;

-- 4) RPC inventory (exactly one overload per name expected pre-PR40)
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  p.pronargs AS pronargs,
  p.prosecdef
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'preview_communication_recipients',
    'initiate_communication_send',
    'resolve_communication_recipients'
  )
ORDER BY p.proname, identity_args;

SELECT (
  SELECT count(*) = 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'preview_communication_recipients'
) AS preview_communication_recipients_count_is_1;

SELECT (
  SELECT count(*) = 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'initiate_communication_send'
) AS initiate_communication_send_count_is_1;

SELECT (
  SELECT count(*) = 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'resolve_communication_recipients'
) AS resolve_communication_recipients_count_is_1;

-- 5) Expected pre-PR40 signatures (4-arg preview, 9-arg initiate, 4-arg resolver)
SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'preview_communication_recipients'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_tournament_id uuid, p_communication_type text, p_recipient_filter text, p_application_ids uuid[]'
) AS preview_is_4_arg_signature;

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'initiate_communication_send'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_tournament_id uuid, p_type text, p_subject text, p_body text, p_important boolean, p_recipient_filter text, p_application_ids uuid[], p_idempotency_key text, p_require_confirmation boolean'
) AS initiate_is_9_arg_signature;

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'resolve_communication_recipients'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_tournament_id uuid, p_communication_type text, p_recipient_filter text, p_application_ids uuid[]'
) AS resolve_communication_recipients_is_4_arg_signature;

-- 6) Legacy 8-arg initiate overload must not exist
SELECT NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'initiate_communication_send'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_tournament_id uuid, p_type text, p_subject text, p_body text, p_important boolean, p_recipient_filter text, p_application_ids uuid[], p_idempotency_key text'
) AS legacy_8_arg_initiate_absent;

-- 7) Directory resolver must not exist yet
SELECT NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'resolve_team_directory_communication_recipients'
) AS directory_resolver_not_yet_present;

-- 8) Duplicate check on communication_recipients (application rows)
SELECT (
  SELECT count(*) = 0
  FROM (
    SELECT communication_id, application_id
    FROM public.communication_recipients
    WHERE application_id IS NOT NULL
    GROUP BY communication_id, application_id
    HAVING count(*) > 1
  ) d
) AS no_duplicate_communication_application_pairs;

-- 9) Legacy unique constraint still present pre-migration
SELECT EXISTS (
  SELECT 1
  FROM pg_constraint
  WHERE conname = 'communication_recipients_unique_application'
) AS communication_recipients_unique_application_still_present;
