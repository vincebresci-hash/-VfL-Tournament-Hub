-- =============================================================================
-- PR C1: Read-only pre-migration verification (DO NOT auto-run as migration)
-- =============================================================================

SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'tournament_communications'
) AS tournament_communications_exists;

SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'communication_recipients'
) AS communication_recipients_exists;

SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'communication_email_send_keys'
) AS communication_email_send_keys_exists;

SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'email_logs'
    AND column_name = 'communication_recipient_id'
) AS email_logs_communication_recipient_column_exists;

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'preview_communication_recipients'
) AS preview_communication_recipients_rpc_exists;

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'initiate_communication_send'
) AS initiate_communication_send_rpc_exists;

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'reserve_communication_email_send'
) AS reserve_communication_email_send_rpc_exists;

SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'communication_confirmation_tokens'
) AS communication_confirmation_tokens_table_exists;

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
    ) s(v)
    WHERE v
  ) AS pr_c1_objects_present_count;
