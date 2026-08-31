-- =============================================================================
-- PR40 Communication Team-Directory: Read-only POST-migration verification
-- =============================================================================
-- Run manually in Supabase SQL Editor AFTER applying
-- 20260831270000_communication_team_directory_recipients.sql
-- SELECT/EXISTS only. No writes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Schema: tournament_communications.recipient_source
-- -----------------------------------------------------------------------------

SELECT EXISTS (
  SELECT 1
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'tournament_communications'
    AND a.attname = 'recipient_source'
    AND NOT a.attisdropped
    AND a.attnotnull
) AS tournament_communications_recipient_source_not_null;

SELECT EXISTS (
  SELECT 1
  FROM pg_attrdef d
  JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'tournament_communications'
    AND a.attname = 'recipient_source'
    AND pg_get_expr(d.adbin, d.adrelid) LIKE '%tournament-applications%'
) AS tournament_communications_recipient_source_default_ok;

SELECT EXISTS (
  SELECT 1
  FROM pg_constraint
  WHERE conname = 'tournament_communications_recipient_source_check'
) AS tournament_communications_recipient_source_check_exists;

SELECT (
  SELECT count(*) = 0
  FROM public.tournament_communications
  WHERE recipient_source IS NULL
) AS tournament_communications_recipient_source_no_nulls;

SELECT (
  SELECT count(*) = 0
  FROM public.tournament_communications
  WHERE recipient_source NOT IN ('tournament-applications', 'team-directory')
) AS tournament_communications_recipient_source_values_valid;

-- -----------------------------------------------------------------------------
-- 2) Schema: communication_recipients extensions
-- -----------------------------------------------------------------------------

SELECT EXISTS (
  SELECT 1
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'communication_recipients'
    AND a.attname = 'team_directory_entry_id'
    AND NOT a.attisdropped
) AS communication_recipients_team_directory_entry_id_exists;

SELECT EXISTS (
  SELECT 1
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'communication_recipients'
    AND a.attname = 'recipient_contact_first_name'
    AND NOT a.attisdropped
) AS communication_recipients_contact_first_name_exists;

SELECT EXISTS (
  SELECT 1
  FROM pg_constraint
  WHERE conname = 'communication_recipients_single_source_check'
) AS communication_recipients_single_source_check_exists;

-- -----------------------------------------------------------------------------
-- 3) Indexes / constraints
-- -----------------------------------------------------------------------------

SELECT EXISTS (
  SELECT 1
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'communication_recipients'
    AND indexname = 'communication_recipients_communication_application_uidx'
) AS communication_recipients_application_partial_uidx_exists;

SELECT EXISTS (
  SELECT 1
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'communication_recipients'
    AND indexname = 'communication_recipients_communication_directory_uidx'
) AS communication_recipients_directory_partial_uidx_exists;

SELECT NOT EXISTS (
  SELECT 1
  FROM pg_constraint
  WHERE conname = 'communication_recipients_unique_application'
) AS communication_recipients_unique_application_dropped;

SELECT EXISTS (
  SELECT 1
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  JOIN pg_class frel ON frel.oid = con.confrelid
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'communication_recipients'
    AND frel.relname = 'team_directory_entries'
    AND con.contype = 'f'
) AS communication_recipients_team_directory_fk_exists;

-- -----------------------------------------------------------------------------
-- 4) RPC inventory (exactly one overload per name)
-- -----------------------------------------------------------------------------

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
    'resolve_communication_recipients',
    'resolve_team_directory_communication_recipients'
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

SELECT (
  SELECT count(*) = 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'resolve_team_directory_communication_recipients'
) AS resolve_team_directory_communication_recipients_count_is_1;

-- -----------------------------------------------------------------------------
-- 5) Expected post-PR40 signatures
-- -----------------------------------------------------------------------------

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'preview_communication_recipients'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_tournament_id uuid, p_communication_type text, p_recipient_filter text, p_application_ids uuid[], p_recipient_source text, p_team_directory_entry_ids uuid[]'
) AS preview_is_6_arg_signature;

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'initiate_communication_send'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_tournament_id uuid, p_type text, p_subject text, p_body text, p_important boolean, p_recipient_filter text, p_application_ids uuid[], p_idempotency_key text, p_require_confirmation boolean, p_recipient_source text, p_team_directory_entry_ids uuid[]'
) AS initiate_is_11_arg_signature;

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'resolve_communication_recipients'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_tournament_id uuid, p_communication_type text, p_recipient_filter text, p_application_ids uuid[]'
) AS resolve_communication_recipients_is_4_arg_signature;

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'resolve_team_directory_communication_recipients'
    AND pg_get_function_identity_arguments(p.oid) = 'p_entry_ids uuid[]'
) AS resolve_team_directory_communication_recipients_is_1_arg_signature;

-- -----------------------------------------------------------------------------
-- 6) Legacy overloads must be absent
-- -----------------------------------------------------------------------------

SELECT NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'preview_communication_recipients'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_tournament_id uuid, p_communication_type text, p_recipient_filter text, p_application_ids uuid[]'
) AS old_preview_4_arg_absent;

SELECT NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'initiate_communication_send'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_tournament_id uuid, p_type text, p_subject text, p_body text, p_important boolean, p_recipient_filter text, p_application_ids uuid[], p_idempotency_key text, p_require_confirmation boolean'
) AS old_initiate_9_arg_absent;

SELECT NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'initiate_communication_send'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_tournament_id uuid, p_type text, p_subject text, p_body text, p_important boolean, p_recipient_filter text, p_application_ids uuid[], p_idempotency_key text'
) AS legacy_initiate_8_arg_absent;

-- -----------------------------------------------------------------------------
-- 7) SECURITY DEFINER on relevant RPCs
-- -----------------------------------------------------------------------------

SELECT (
  SELECT count(*) = 0
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'preview_communication_recipients',
      'initiate_communication_send',
      'resolve_communication_recipients',
      'resolve_team_directory_communication_recipients'
    )
    AND NOT p.prosecdef
) AS communication_rpcs_are_security_definer;

-- -----------------------------------------------------------------------------
-- 8) EXECUTE grants
-- -----------------------------------------------------------------------------

SELECT has_function_privilege(
  'authenticated',
  'public.preview_communication_recipients(uuid, text, text, uuid[], text, uuid[])',
  'EXECUTE'
) AS authenticated_can_execute_preview;

SELECT has_function_privilege(
  'authenticated',
  'public.initiate_communication_send(uuid, text, text, text, boolean, text, uuid[], text, boolean, text, uuid[])',
  'EXECUTE'
) AS authenticated_can_execute_initiate;

SELECT NOT has_function_privilege(
  'anon',
  'public.preview_communication_recipients(uuid, text, text, uuid[], text, uuid[])',
  'EXECUTE'
) AS anon_cannot_execute_preview;

SELECT NOT has_function_privilege(
  'anon',
  'public.initiate_communication_send(uuid, text, text, text, boolean, text, uuid[], text, boolean, text, uuid[])',
  'EXECUTE'
) AS anon_cannot_execute_initiate;

SELECT NOT has_function_privilege(
  'anon',
  'public.resolve_team_directory_communication_recipients(uuid[])',
  'EXECUTE'
) AS anon_cannot_execute_directory_resolver;

SELECT NOT has_function_privilege(
  'authenticated',
  'public.resolve_team_directory_communication_recipients(uuid[])',
  'EXECUTE'
) AS authenticated_cannot_execute_directory_resolver_directly;

-- -----------------------------------------------------------------------------
-- 9) RLS regression spot checks
-- -----------------------------------------------------------------------------

SELECT COALESCE((
  SELECT c.relrowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'tournament_communications'
), false) AS tournament_communications_rls_enabled;

SELECT COALESCE((
  SELECT c.relrowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'communication_recipients'
), false) AS communication_recipients_rls_enabled;

SELECT COALESCE((
  SELECT c.relrowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'team_directory_entries'
), false) AS team_directory_entries_rls_enabled;

SELECT EXISTS (
  SELECT 1
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'tournaments'
    AND p.policyname = 'tournaments_select_public'
) AS tournaments_select_public_policy_exists;

SELECT has_function_privilege(
  'anon',
  'public.can_view_archived_tournament(timestamptz)',
  'EXECUTE'
) AS anon_can_execute_can_view_archived_tournament;

SELECT EXISTS (
  SELECT 1
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'applications'
) AS applications_policies_exist;
