-- =============================================================================
-- PR C1: Read-only pre-migration verification (DO NOT auto-run as migration)
-- =============================================================================
-- Run manually in Supabase SQL Editor BEFORE applying PR C1 migration.
-- SELECT/EXISTS only. No INSERT, UPDATE, DELETE, ALTER, CREATE, or DROP.
-- =============================================================================

-- 1) Core tables
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'tournament_communications'
) AS tournament_communications_exists;

SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'communication_recipients'
) AS communication_recipients_exists;

SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'communication_email_send_keys'
) AS communication_email_send_keys_exists;

-- 2) email_logs extension
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'email_logs'
    AND column_name = 'communication_recipient_id'
) AS email_logs_communication_recipient_column_exists;

SELECT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conname = 'email_logs_communication_recipient_id_fkey'
) AS email_logs_communication_recipient_fkey_exists;

-- 3) PR-C1 RPCs (all 6)
SELECT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'resolve_communication_recipients'
) AS resolve_communication_recipients_rpc_exists;

SELECT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'preview_communication_recipients'
) AS preview_communication_recipients_rpc_exists;

SELECT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'initiate_communication_send'
) AS initiate_communication_send_rpc_exists;

SELECT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'reserve_communication_email_send'
) AS reserve_communication_email_send_rpc_exists;

SELECT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'complete_communication_recipient'
) AS complete_communication_recipient_rpc_exists;

SELECT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'finalize_communication'
) AS finalize_communication_rpc_exists;

-- 4) PR-C1 indexes
SELECT EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'tournament_communications_idempotency_key_uidx'
) AS tournament_communications_idempotency_key_idx_exists;

SELECT EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'communication_recipients_communication_idx'
) AS communication_recipients_communication_idx_exists;

SELECT EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'email_logs_communication_recipient_id_idx'
) AS email_logs_communication_recipient_id_idx_exists;

-- 5) RLS enabled on all PR-C1 tables
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'tournament_communications',
    'communication_recipients',
    'communication_email_send_keys'
  )
ORDER BY c.relname;

-- 6) Expected admin policies
SELECT
  pol.polname AS policy_name,
  c.relname AS table_name
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('tournament_communications', 'communication_recipients')
ORDER BY c.relname, pol.polname;

-- 7) Expected updated_at trigger
SELECT EXISTS (
  SELECT 1
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'tournament_communications'
    AND t.tgname = 'set_tournament_communications_updated_at'
    AND NOT t.tgisinternal
) AS tournament_communications_updated_at_trigger_exists;

-- 8) PR-C2 objects should NOT exist before C1 migration
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'communication_confirmation_tokens'
) AS pr_c2_confirmation_tokens_table_exists;

SELECT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_communication_confirmation_context'
) AS pr_c2_confirmation_context_rpc_exists;

SELECT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'confirm_communication_receipt'
) AS pr_c2_confirm_receipt_rpc_exists;

-- 9) Partial migration indicator
SELECT
  (
    SELECT COUNT(*)::integer
    FROM (
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tournament_communications'
      )
      UNION ALL
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'communication_recipients'
      )
      UNION ALL
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'communication_email_send_keys'
      )
      UNION ALL
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'email_logs'
          AND column_name = 'communication_recipient_id'
      )
      UNION ALL
      SELECT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'finalize_communication'
      )
    ) s(v)
    WHERE v
  ) AS pr_c1_objects_present_count;
