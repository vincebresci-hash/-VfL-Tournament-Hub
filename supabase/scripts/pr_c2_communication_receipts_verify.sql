-- =============================================================================
-- PR C2: Read-only post-migration verification (DO NOT auto-run as migration)
-- =============================================================================
-- Run manually in Supabase SQL Editor AFTER applying PR C2 migration.
-- SELECT/EXISTS only. No INSERT, UPDATE, DELETE, ALTER, CREATE, or DROP.
-- =============================================================================

-- 1) Core C2 table
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'communication_confirmation_tokens'
) AS communication_confirmation_tokens_exists;

-- 2) Column extensions
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'tournament_communications'
    AND column_name = 'require_confirmation'
) AS tournament_communications_require_confirmation_exists;

SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'communication_recipients'
    AND column_name = 'confirmed_at'
) AS communication_recipients_confirmed_at_exists;

-- 3) Token security constraints
SELECT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conname = 'communication_confirmation_tokens_hash_len'
) AS confirmation_tokens_hash_len_check_exists;

SELECT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conname = 'communication_confirmation_tokens_recipient_unique'
) AS confirmation_tokens_recipient_unique_exists;

SELECT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conname = 'communication_confirmation_tokens_hash_unique'
) AS confirmation_tokens_hash_unique_exists;

-- 4) PR-C2 RPCs
SELECT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'issue_communication_confirmation_token'
) AS issue_communication_confirmation_token_rpc_exists;

SELECT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_communication_receipt_context'
) AS get_communication_receipt_context_rpc_exists;

SELECT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'confirm_communication_receipt'
) AS confirm_communication_receipt_rpc_exists;

-- 5) Indexes
SELECT EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'communication_confirmation_tokens_hash_idx'
) AS confirmation_tokens_hash_idx_exists;

SELECT EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'communication_confirmation_tokens_recipient_idx'
) AS confirmation_tokens_recipient_idx_exists;

-- 6) RLS on confirmation tokens
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'communication_confirmation_tokens';

-- 7) validate_secure_access_token must remain unchanged (signature spot-check)
SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'validate_secure_access_token'
) AS validate_secure_access_token_still_exists;

-- 8) Aggregate C2 object count
-- Expected value after successful migration: 8
SELECT
  (
    SELECT COUNT(*)::integer
    FROM (
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'communication_confirmation_tokens'
      )
      UNION ALL
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tournament_communications'
          AND column_name = 'require_confirmation'
      )
      UNION ALL
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'communication_recipients'
          AND column_name = 'confirmed_at'
      )
      UNION ALL
      SELECT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'issue_communication_confirmation_token'
      )
      UNION ALL
      SELECT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'get_communication_receipt_context'
      )
      UNION ALL
      SELECT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'confirm_communication_receipt'
      )
      UNION ALL
      SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'communication_confirmation_tokens_hash_unique'
      )
      UNION ALL
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'communication_confirmation_tokens_hash_idx'
      )
    ) s(v)
    WHERE v
  ) AS pr_c2_objects_present_count;
