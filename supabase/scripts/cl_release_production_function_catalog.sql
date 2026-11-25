-- Read-only capture of public function definitions for CL baseline reconciliation.
-- Function bodies are application schema, not table data. The result is intended
-- for local comparison and must be reviewed before any definition is versioned.

SELECT
  p.oid::regprocedure::text AS function_signature,
  md5(regexp_replace(p.prosrc, '\s+', '', 'g')) AS body_hash,
  pg_get_function_result(p.oid) AS result_type,
  l.lanname AS language,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility,
  p.proisstrict AS is_strict,
  p.proleakproof AS leakproof,
  p.proconfig AS config,
  COALESCE(p.proacl::text, '') AS acl,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND NOT EXISTS (
    SELECT 1
    FROM pg_depend d
    WHERE d.classid = 'pg_proc'::regclass
      AND d.objid = p.oid
      AND d.deptype = 'e'
  )
ORDER BY function_signature;
