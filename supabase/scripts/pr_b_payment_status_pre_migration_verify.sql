-- =============================================================================
-- PR B: Read-only pre-migration verification (DO NOT auto-run as migration)
-- =============================================================================
-- Run manually in Supabase SQL Editor BEFORE re-attempting PR B migration.
-- Read-only checks only. Does not modify data.
-- =============================================================================

-- 1) payment_status enum
SELECT EXISTS (
  SELECT 1
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typname = 'payment_status'
) AS payment_status_type_exists;

-- 2) applications payment columns
SELECT
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'applications'
      AND column_name = 'payment_status'
  ) AS applications_payment_status_column_exists,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'applications'
      AND column_name = 'participation_fee'
  ) AS applications_participation_fee_column_exists,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'applications'
      AND column_name = 'paid_at'
  ) AS applications_paid_at_column_exists,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'applications'
      AND column_name = 'payment_note'
  ) AS applications_payment_note_column_exists;

-- 3) participation fee constraint
SELECT EXISTS (
  SELECT 1
  FROM pg_constraint
  WHERE conname = 'applications_participation_fee_non_negative'
) AS participation_fee_constraint_exists;

-- 4) payment guard trigger
SELECT EXISTS (
  SELECT 1
  FROM pg_trigger
  WHERE tgname = 'applications_payment_fields_guard'
) AS payment_guard_trigger_exists;

-- 5) validate_secure_access_token signature (PR A expected: 5 return columns)
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'validate_secure_access_token';

-- 6) validate_secure_access_token return columns (expect exactly 5)
SELECT
  a.attname AS return_column,
  format_type(a.atttypid, a.atttypmod) AS column_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_type t ON t.oid = p.prorettype
JOIN pg_class c ON c.reltype = t.oid
JOIN pg_attribute a ON a.attrelid = c.oid
WHERE n.nspname = 'public'
  AND p.proname = 'validate_secure_access_token'
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY a.attnum;

-- 7) external payment RPC (should not exist before successful PR B migration)
SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_external_participation_payment_by_token'
) AS external_payment_rpc_exists;

-- 8) partial migration indicator summary
SELECT
  (
    SELECT COUNT(*)::integer
    FROM (
      SELECT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'payment_status'
      ) AS v
      UNION ALL
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'applications' AND column_name = 'payment_status'
      )
      UNION ALL
      SELECT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'applications_payment_fields_guard'
      )
      UNION ALL
      SELECT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'get_external_participation_payment_by_token'
      )
    ) s(v)
    WHERE v
  ) AS pr_b_objects_present_count;
