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

-- 5) initiate_communication_send signature / overload safety
SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'initiate_communication_send'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_tournament_id uuid, p_type text, p_subject text, p_body text, p_important boolean, p_recipient_filter text, p_application_ids uuid[], p_idempotency_key text, p_require_confirmation boolean'
) AS initiate_communication_send_c2_signature_exists;

SELECT NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'initiate_communication_send'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_tournament_id uuid, p_type text, p_subject text, p_body text, p_important boolean, p_recipient_filter text, p_application_ids uuid[], p_idempotency_key text'
) AS initiate_communication_send_c1_overload_absent;

SELECT
  COUNT(*)::integer AS initiate_communication_send_overload_count
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'initiate_communication_send';

-- 6) RPC argument signatures (spot-check)
SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'issue_communication_confirmation_token'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_communication_recipient_id uuid, p_token_hash text, p_expires_at timestamp with time zone'
) AS issue_communication_confirmation_token_signature_exists;

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_communication_receipt_context'
    AND pg_get_function_identity_arguments(p.oid) = 'p_token_hash text'
) AS get_communication_receipt_context_signature_exists;

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'confirm_communication_receipt'
    AND pg_get_function_identity_arguments(p.oid) = 'p_token_hash text'
) AS confirm_communication_receipt_signature_exists;

-- 7) Indexes
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

-- 8) RLS on confirmation tokens
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'communication_confirmation_tokens';

-- 9) Grants on C2 initiate RPC
SELECT EXISTS (
  SELECT 1
  FROM information_schema.routine_privileges rp
  WHERE rp.routine_schema = 'public'
    AND rp.routine_name = 'initiate_communication_send'
    AND rp.grantee = 'authenticated'
    AND rp.privilege_type = 'EXECUTE'
) AS initiate_communication_send_authenticated_grant_exists;

-- 10) validate_secure_access_token must remain unchanged (signature spot-check)
SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'validate_secure_access_token'
) AS validate_secure_access_token_still_exists;

-- 11) Aggregate C2 object count
-- Expected value after successful migration: 11
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
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'initiate_communication_send'
          AND pg_get_function_identity_arguments(p.oid) =
            'p_tournament_id uuid, p_type text, p_subject text, p_body text, p_important boolean, p_recipient_filter text, p_application_ids uuid[], p_idempotency_key text, p_require_confirmation boolean'
      )
      UNION ALL
      SELECT NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'initiate_communication_send'
          AND pg_get_function_identity_arguments(p.oid) =
            'p_tournament_id uuid, p_type text, p_subject text, p_body text, p_important boolean, p_recipient_filter text, p_application_ids uuid[], p_idempotency_key text'
      )
      UNION ALL
      SELECT (
        SELECT COUNT(*) = 1
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'initiate_communication_send'
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
