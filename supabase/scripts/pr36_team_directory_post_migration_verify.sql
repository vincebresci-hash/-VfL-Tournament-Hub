-- =============================================================================
-- PR36: Read-only post-migration verification (DO NOT auto-run as migration)
-- =============================================================================
-- Run manually in Supabase SQL Editor AFTER applying PR36 migration
-- 20260831240000_team_directory.sql.
-- SELECT/EXISTS only. No INSERT, UPDATE, DELETE, ALTER, CREATE, or DROP.
-- =============================================================================

-- 1) Enum
SELECT EXISTS (
  SELECT 1
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typname = 'team_directory_source'
) AS team_directory_source_enum_exists;

-- 2) Table + RLS
SELECT EXISTS (
  SELECT 1
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'team_directory_entries'
    AND c.relkind = 'r'
) AS team_directory_entries_table_exists;

SELECT COALESCE((
  SELECT c.relrowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'team_directory_entries'
), false) AS team_directory_entries_rls_enabled;

-- 3) Expected columns (29)
WITH expected_columns AS (
  SELECT unnest(ARRAY[
    'id', 'club_name', 'team_name', 'age_group',
    'contact_first_name', 'contact_last_name', 'contact_role',
    'contact_email', 'contact_phone', 'website', 'league',
    'birth_year', 'division', 'self_rated_strength',
    'internal_category', 'internal_strength', 'internal_notes',
    'source', 'source_application_id', 'club_id', 'team_id',
    'norm_club_name', 'norm_team_name', 'norm_age_group', 'norm_contact_email',
    'archived_at', 'created_by', 'updated_by', 'created_at', 'updated_at'
  ]) AS column_name
),
actual_columns AS (
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'team_directory_entries'
)
SELECT NOT EXISTS (
  SELECT 1
  FROM expected_columns e
  LEFT JOIN actual_columns a USING (column_name)
  WHERE a.column_name IS NULL
) AS team_directory_expected_columns_present;

-- 4) Foreign keys (5 constraints via pg_constraint)
SELECT (
  SELECT count(*) = 5
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'team_directory_entries'
    AND con.contype = 'f'
) AS team_directory_foreign_key_count_is_5;

SELECT
  con.conname AS constraint_name,
  att.attname AS column_name,
  fnsp.nspname AS foreign_table_schema,
  frel.relname AS foreign_table_name,
  fatt.attname AS foreign_column_name
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
JOIN pg_class frel ON frel.oid = con.confrelid
JOIN pg_namespace fnsp ON fnsp.oid = frel.relnamespace
JOIN pg_attribute fatt ON fatt.attrelid = con.confrelid AND fatt.attnum = ANY (con.confkey)
WHERE nsp.nspname = 'public'
  AND rel.relname = 'team_directory_entries'
  AND con.contype = 'f'
ORDER BY con.conname;

-- 5) Indexes (5 total, 2 partial UNIQUE)
SELECT (
  SELECT count(*) = 5
  FROM pg_class ic
  JOIN pg_namespace n ON n.oid = ic.relnamespace
  WHERE n.nspname = 'public'
    AND ic.relkind = 'i'
    AND ic.relname IN (
      'team_directory_entries_active_team_id_uidx',
      'team_directory_entries_norm_lookup_idx',
      'team_directory_entries_club_norm_idx',
      'team_directory_entries_archived_idx',
      'team_directory_entries_active_source_application_uidx'
    )
) AS team_directory_indexes_present;

SELECT EXISTS (
  SELECT 1
  FROM pg_index i
  JOIN pg_class ic ON ic.oid = i.indexrelid
  JOIN pg_class tc ON tc.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = tc.relnamespace
  WHERE n.nspname = 'public'
    AND tc.relname = 'team_directory_entries'
    AND ic.relname = 'team_directory_entries_active_team_id_uidx'
    AND i.indisunique
) AS team_directory_active_team_id_unique_index_exists;

SELECT EXISTS (
  SELECT 1
  FROM pg_index i
  JOIN pg_class ic ON ic.oid = i.indexrelid
  JOIN pg_class tc ON tc.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = tc.relnamespace
  WHERE n.nspname = 'public'
    AND tc.relname = 'team_directory_entries'
    AND ic.relname = 'team_directory_entries_active_source_application_uidx'
    AND i.indisunique
) AS team_directory_active_source_application_unique_index_exists;

-- 6) Trigger
SELECT EXISTS (
  SELECT 1
  FROM pg_trigger tg
  JOIN pg_class c ON c.oid = tg.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'team_directory_entries'
    AND tg.tgname = 'set_team_directory_entries_updated_at'
    AND NOT tg.tgisinternal
) AS team_directory_updated_at_trigger_exists;

-- 7) Policies on team_directory_entries
SELECT (
  SELECT count(*) = 3
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'team_directory_entries'
    AND p.policyname IN (
      'team_directory_entries_select',
      'team_directory_entries_insert',
      'team_directory_entries_update'
    )
) AS team_directory_policies_present;

SELECT
  policyname,
  cmd,
  roles,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'team_directory_entries'
ORDER BY policyname;

-- 8) Grants for authenticated
SELECT (
  SELECT count(*) = 3
  FROM information_schema.role_table_grants g
  WHERE g.table_schema = 'public'
    AND g.table_name = 'team_directory_entries'
    AND g.grantee = 'authenticated'
    AND g.privilege_type IN ('SELECT', 'INSERT', 'UPDATE')
) AS team_directory_authenticated_grants_present;

-- 9) anon must have no direct table privileges (use has_table_privilege, not information_schema alone)
SELECT
  has_table_privilege('anon', 'public.team_directory_entries', 'SELECT') AS anon_select,
  has_table_privilege('anon', 'public.team_directory_entries', 'INSERT') AS anon_insert,
  has_table_privilege('anon', 'public.team_directory_entries', 'UPDATE') AS anon_update,
  has_table_privilege('anon', 'public.team_directory_entries', 'DELETE') AS anon_delete;

SELECT NOT (
  has_table_privilege('anon', 'public.team_directory_entries', 'SELECT')
  OR has_table_privilege('anon', 'public.team_directory_entries', 'INSERT')
  OR has_table_privilege('anon', 'public.team_directory_entries', 'UPDATE')
  OR has_table_privilege('anon', 'public.team_directory_entries', 'DELETE')
) AS team_directory_anon_has_no_table_privileges;

-- 10) Existing tournaments/applications policies and PR39 anon visibility grant unchanged
SELECT EXISTS (
  SELECT 1
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'tournaments'
    AND p.policyname = 'tournaments_select_public'
) AS tournaments_select_public_policy_exists;

SELECT EXISTS (
  SELECT 1
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'applications'
) AS applications_policies_exist;

SELECT has_function_privilege(
  'anon',
  'public.can_view_archived_tournament(timestamptz)',
  'EXECUTE'
) AS anon_can_execute_can_view_archived_tournament;
