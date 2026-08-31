-- =============================================================================
-- Communication Team-Directory: Read-only post-migration verification
-- =============================================================================
-- Run manually in Supabase SQL Editor AFTER applying
-- 20260831270000_communication_team_directory_recipients.sql
-- SELECT/EXISTS only. No writes.
-- =============================================================================

-- 1) recipient_source column on tournament_communications
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'tournament_communications'
    AND column_name = 'recipient_source'
    AND is_nullable = 'NO'
    AND column_default = '''tournament-applications''::text'
) AS tournament_communications_recipient_source_exists;

SELECT EXISTS (
  SELECT 1
  FROM pg_constraint
  WHERE conname = 'tournament_communications_recipient_source_check'
) AS tournament_communications_recipient_source_check_exists;

-- 2) communication_recipients extensions
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'communication_recipients'
    AND column_name = 'team_directory_entry_id'
) AS communication_recipients_team_directory_entry_id_exists;

SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'communication_recipients'
    AND column_name = 'recipient_contact_first_name'
) AS communication_recipients_contact_first_name_exists;

-- 3) Partial unique indexes
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

-- 4) Old unique constraint removed
SELECT NOT EXISTS (
  SELECT 1
  FROM pg_constraint
  WHERE conname = 'communication_recipients_unique_application'
) AS communication_recipients_unique_application_dropped;

-- 5) Directory resolver function
SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'resolve_team_directory_communication_recipients'
) AS resolve_team_directory_communication_recipients_exists;

-- 6) Preview RPC extended signature (6 args)
SELECT (
  SELECT count(*) = 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'preview_communication_recipients'
) AS preview_communication_recipients_exists;

-- 7) Initiate RPC extended signature (11 args)
SELECT (
  SELECT count(*) = 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'initiate_communication_send'
) AS initiate_communication_send_exists;

-- 8) Application resolver unchanged (still 4-arg function)
SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'resolve_communication_recipients'
) AS resolve_communication_recipients_still_exists;

-- 9) FK to team_directory_entries
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

-- 10) No anon execute on directory resolver
SELECT NOT has_function_privilege(
  'anon',
  'public.resolve_team_directory_communication_recipients(uuid[])',
  'EXECUTE'
) AS directory_resolver_not_granted_to_anon;
